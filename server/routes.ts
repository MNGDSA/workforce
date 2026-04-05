import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { storage } from "./storage";
import { getAuthenticatedUser, listUserRepos, getRepo, listRepoIssues, listRepoPullRequests } from "./github";
import {
  insertCandidateSchema,
  insertEventSchema,
  insertJobPostingSchema,
  insertApplicationSchema,
  insertInterviewSchema,
  insertOnboardingSchema,
  insertWorkforceSchema,
  insertAutomationRuleSchema,
  insertNotificationSchema,
  insertUserSchema,
  insertBusinessUnitSchema,
  insertSMPContractSchema,
  insertQuestionSetSchema,
  insertContractTemplateSchema,
  candidateQuerySchema,
  insertIdCardTemplateSchema,
  insertPrinterPluginSchema,
  insertIdCardPrintLogSchema,
  insertShiftSchema,
  insertScheduleTemplateSchema,
  insertScheduleAssignmentSchema,
  insertAttendanceRecordSchema,
  type InsertOnboarding,
  insertAssetSchema,
  insertEmployeeAssetSchema,
} from "@shared/schema";
import { validatePluginConfig, sendSmsViaPlugin } from "./sms-sender";

function validateProfileCompleteness(candidate: Record<string, any>): string[] {
  const missing: string[] = [];
  if (!candidate.fullNameEn) missing.push("Full Name");
  if (!candidate.dateOfBirth) missing.push("Date of Birth");
  if (!candidate.gender) missing.push("Gender");
  if (!candidate.nationality) missing.push("Nationality");
  if (!candidate.city) missing.push("City");
  if (!candidate.maritalStatus) missing.push("Marital Status");
  if (!candidate.educationLevel) missing.push("Education Level");
  if (candidate.educationLevel === "University and higher" && !candidate.major) missing.push("Major / Field of Study");
  if (!candidate.emergencyContactName) missing.push("Emergency Contact Name");
  if (!candidate.emergencyContactPhone) missing.push("Emergency Contact Phone");
  if (!(candidate.languages && candidate.languages.length > 0)) missing.push("Languages");
  if (candidate.source !== "smp") {
    if (!candidate.ibanNumber) missing.push("IBAN Number");
  }
  return missing;
}
import { z } from "zod";
import bcrypt from "bcryptjs";

const UPLOADS_DIR = path.resolve("uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [".pdf", ".jpg", ".jpeg", ".png", ".doc", ".docx"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error(`File type ${ext} not allowed`));
  },
});

function handleError(res: Response, err: unknown) {
  console.error(err);
  if (err instanceof z.ZodError) {
    return res.status(400).json({ message: "Validation error", errors: err.errors });
  }
  const message = err instanceof Error ? err.message : "Internal server error";
  return res.status(500).json({ message });
}

function buildVariableSnapshot(candidate: any, template: any, ob: any): Record<string, string> {
  return {
    fullName: candidate.fullNameEn || candidate.fullNameAr || "",
    nationalId: candidate.nationalId || "",
    phone: candidate.phone || "",
    iban: candidate.ibanNumber || "",
    startDate: ob.startDate || "",
    eventName: "",
    contractDate: new Date().toISOString().split("T")[0],
    companyName: template.companyName || "",
  };
}

function computeOnboardingStatus(rec: { hasPhoto: boolean; hasIban: boolean; hasNationalId: boolean; hasSignedContract?: boolean }, isSmp: boolean): "pending" | "in_progress" | "ready" {
  if (isSmp) {
    const allDone = rec.hasPhoto && rec.hasNationalId;
    const anyDone = rec.hasPhoto || rec.hasNationalId;
    return allDone ? "ready" : anyDone ? "in_progress" : "pending";
  }
  const allDone = rec.hasPhoto && rec.hasIban && rec.hasNationalId;
  const anyDone = rec.hasPhoto || rec.hasIban || rec.hasNationalId;
  return allDone ? "ready" : anyDone ? "in_progress" : "pending";
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.use("/uploads", express.static(UPLOADS_DIR, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".pdf")) {
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", "inline");
      }
      res.setHeader("X-Content-Type-Options", "nosniff");
    }
  }));

  // ─── Document Upload ───────────────────────────────────────────────────────
  app.post("/api/candidates/:id/documents", upload.single("file"), async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const docType = req.body.docType as string;
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      if (!["photo", "nationalId", "iban", "resume"].includes(docType)) {
        return res.status(400).json({ message: "Invalid docType. Must be photo, nationalId, iban, or resume" });
      }
      const fileUrl = `/uploads/${req.file.filename}`;
      const updatePayload: Record<string, any> = {};
      if (docType === "photo") { updatePayload.photoUrl = fileUrl; updatePayload.hasPhoto = true; }
      if (docType === "nationalId") { updatePayload.hasNationalId = true; updatePayload.nationalIdFileUrl = fileUrl; }
      if (docType === "iban") { updatePayload.hasIban = true; updatePayload.ibanFileUrl = fileUrl; }
      if (docType === "resume") { updatePayload.resumeUrl = fileUrl; updatePayload.hasResume = true; }
      const updated = await storage.updateCandidate(id, updatePayload);
      if (!updated) return res.status(404).json({ message: "Candidate not found" });
      const onboardingRecords = await storage.getOnboardingRecords({ candidateId: id });
      for (const rec of onboardingRecords) {
        if (rec.status === "converted" || rec.status === "rejected") continue;
        // Derive SMP status from onboarding linkage (applicationId === null = SMP pipeline)
        const isSmpRec = !rec.applicationId;
        const syncPayload: Record<string, any> = {};
        if (docType === "photo") syncPayload.hasPhoto = true;
        if (docType === "nationalId") syncPayload.hasNationalId = true;
        if (docType === "iban") syncPayload.hasIban = true;
        if (Object.keys(syncPayload).length > 0) {
          const merged = { ...rec, ...syncPayload };
          syncPayload.status = computeOnboardingStatus(merged, isSmpRec);
          await storage.updateOnboardingRecord(rec.id, syncPayload);
        }
      }
      return res.json({ url: fileUrl, docType, candidate: updated });
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ─── Document Deletion ───────────────────────────────────────────────────
  app.delete("/api/candidates/:id/documents/:docType", async (req: Request, res: Response) => {
    try {
      const { id, docType } = req.params;
      if (!["photo", "nationalId", "iban"].includes(docType)) {
        return res.status(400).json({ message: "Invalid docType. Must be photo, nationalId, or iban" });
      }
      const candidate = await storage.getCandidate(id);
      if (!candidate) return res.status(404).json({ message: "Candidate not found" });
      const fileUrlMap: Record<string, string | null | undefined> = {
        photo: candidate.photoUrl,
        nationalId: candidate.nationalIdFileUrl,
        iban: candidate.ibanFileUrl,
      };
      const oldFileUrl = fileUrlMap[docType];
      if (oldFileUrl && oldFileUrl.startsWith("/uploads/")) {
        const filePath = path.join(UPLOADS_DIR, path.basename(oldFileUrl));
        fs.promises.unlink(filePath).catch(() => {});
      }
      const updatePayload: Record<string, any> = {};
      if (docType === "photo") { updatePayload.photoUrl = null; updatePayload.hasPhoto = false; }
      if (docType === "nationalId") { updatePayload.nationalIdFileUrl = null; updatePayload.hasNationalId = false; }
      if (docType === "iban") { updatePayload.ibanFileUrl = null; updatePayload.hasIban = false; }
      const updated = await storage.updateCandidate(id, updatePayload);
      if (!updated) return res.status(404).json({ message: "Candidate not found" });
      const onboardingRecordsDel = await storage.getOnboardingRecords({ candidateId: id });
      for (const rec of onboardingRecordsDel) {
        if (rec.status === "converted" || rec.status === "rejected") continue;
        // Derive SMP status from onboarding linkage (applicationId === null = SMP pipeline)
        const isSmpRec = !rec.applicationId;
        const syncPayload: Record<string, any> = {};
        if (docType === "photo") syncPayload.hasPhoto = false;
        if (docType === "nationalId") syncPayload.hasNationalId = false;
        if (docType === "iban") syncPayload.hasIban = false;
        if (Object.keys(syncPayload).length > 0) {
          const merged = { ...rec, ...syncPayload };
          syncPayload.status = computeOnboardingStatus(merged, isSmpRec);
          await storage.updateOnboardingRecord(rec.id, syncPayload);
        }
      }
      const docLabelMap: Record<string, string> = { photo: "Personal Photo", nationalId: "National ID / Iqama", iban: "IBAN Certificate" };
      const docLabel = docLabelMap[docType] ?? "document";
      if (updated.phone) {
        const smsPlugin = await storage.getActiveSmsPlugin();
        if (smsPlugin) {
          const smsMsg = `Your ${docLabel} has been rejected by HR Team, please reupload the correct one as soon as possible.`;
          sendSmsViaPlugin(smsPlugin, updated.phone, smsMsg)
            .then(r => {
              if (r.success) console.log(`[SMS] Doc rejection notification sent to ${updated.phone}`);
              else console.error(`[SMS] Doc rejection notification failed: ${r.error}`);
            })
            .catch(e => console.error("[SMS] Doc rejection notification error:", e));
        } else {
          console.warn("[SMS] No active SMS plugin — skipping doc rejection notification");
        }
      }
      return res.json({ docType, candidate: updated });
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ─── Current User (dev bypass) ────────────────────────────────────────────
  app.get("/api/me", async (_req: Request, res: Response) => {
    try {
      const user = await storage.getUserByUsername("admin");
      if (!user) return res.status(404).json({ message: "No user found" });
      const { passwordHash: _, ...safe } = user;
      return res.json(safe);
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ─── Auth ─────────────────────────────────────────────────────────────────
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { identifier, password } = req.body;
      if (!identifier || !password) {
        return res.status(400).json({ message: "ID Number / Phone and password are required" });
      }

      const clean = String(identifier).trim();

      // Lookup priority: phone → national ID → email → username (fallback)
      let user =
        await storage.getUserByPhone(clean) ??
        await storage.getUserByNationalId(clean) ??
        await storage.getUserByEmail(clean) ??
        await storage.getUserByUsername(clean);

      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      if (!user.isActive) {
        return res.status(403).json({ message: "Account is disabled. Contact support." });
      }

      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      await storage.updateUser(user.id, { lastLogin: new Date() } as any);

      const { password: _, ...safeUser } = user;

      let candidate = null;
      if (user.role === "candidate") {
        candidate = await storage.getCandidateByUserId(user.id) ?? null;
        if (!candidate && user.nationalId) {
          candidate = await storage.getCandidateByNationalId(user.nationalId) ?? null;
        }
        if (candidate) {
          if (!candidate.userId) {
            await storage.updateCandidate(candidate.id, { userId: user.id });
          }
          await storage.updateCandidate(candidate.id, { lastLoginAt: new Date() });
          candidate.lastLoginAt = new Date();
        }
      }

      return res.json({ user: safeUser, candidate });
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ─── OTP: Request code ─────────────────────────────────────────────────────
  app.post("/api/auth/otp/request", async (req: Request, res: Response) => {
    try {
      const { phone } = z.object({ phone: z.string().min(9) }).parse(req.body);
      const normalizedPhone = phone.trim().replace(/\s+/g, "");

      // Rate limit: max 3 OTP requests per phone per 10 minutes
      const recentCount = await storage.countRecentOtpRequests(normalizedPhone, 10 * 60 * 1000);
      if (recentCount >= 3) {
        return res.status(429).json({ message: "Too many OTP requests. Please wait 10 minutes before trying again." });
      }

      // Check if active SMS plugin exists
      const smsPlugin = await storage.getActiveSmsPlugin();
      if (!smsPlugin) {
        return res.status(503).json({ message: "SMS service is not configured. Contact support." });
      }

      // Generate 6-digit code
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

      await storage.createOtpVerification(normalizedPhone, code, expiresAt);

      const message = `Workforce SA: Your verification code is ${code}. Valid for 5 minutes. Do not share this code.`;
      const result = await sendSmsViaPlugin(smsPlugin, normalizedPhone, message);

      if (!result.success) {
        console.error("[OTP] SMS delivery failed:", result.error);
        return res.status(502).json({ message: "Failed to send OTP. Please try again." });
      }

      console.log(`[OTP] Sent to ${normalizedPhone}, expires ${expiresAt.toISOString()}`);
      return res.json({ success: true, expiresAt });
    } catch (err) { return handleError(res, err); }
  });

  // ─── OTP: Verify code ──────────────────────────────────────────────────────
  app.post("/api/auth/otp/verify", async (req: Request, res: Response) => {
    try {
      const { phone, code } = z.object({
        phone: z.string().min(9),
        code: z.string().length(6),
      }).parse(req.body);
      const normalizedPhone = phone.trim().replace(/\s+/g, "");

      const otp = await storage.getLatestOtpVerification(normalizedPhone);
      if (!otp) {
        return res.status(404).json({ message: "No OTP found for this phone number. Request a new code." });
      }
      if (otp.verifiedAt) {
        return res.status(400).json({ message: "This OTP has already been verified." });
      }
      if (new Date() > otp.expiresAt) {
        return res.status(400).json({ message: "OTP has expired. Please request a new code." });
      }
      if (otp.attempts >= 5) {
        return res.status(400).json({ message: "Too many incorrect attempts. Please request a new OTP." });
      }
      if (otp.code !== code.trim()) {
        await storage.incrementOtpAttempts(otp.id);
        const remaining = 4 - otp.attempts;
        return res.status(400).json({ message: `Incorrect code. ${remaining} attempt${remaining !== 1 ? "s" : ""} remaining.` });
      }

      await storage.markOtpVerified(otp.id);
      return res.json({ success: true, otpId: otp.id });
    } catch (err) { return handleError(res, err); }
  });

  // ─── Registration (requires verified OTP) ──────────────────────────────────
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const { fullName, phone, nationalId, password, otpId } = req.body as {
        fullName?: string;
        phone?: string;
        nationalId?: string;
        password?: string;
        otpId?: string;
      };

      if (!fullName || !phone || !nationalId || !password || !otpId) {
        return res.status(400).json({ message: "All fields including OTP verification are required" });
      }
      if (password.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters" });
      }

      // Validate OTP
      const normalizedPhone = phone.trim().replace(/\s+/g, "");
      const otp = await storage.getLatestOtpVerification(normalizedPhone);
      if (!otp || otp.id !== otpId) {
        return res.status(400).json({ message: "Invalid OTP session. Please verify your phone again." });
      }
      if (!otp.verifiedAt) {
        return res.status(400).json({ message: "Phone number has not been verified. Please complete OTP verification." });
      }
      if (otp.usedForRegistration) {
        return res.status(400).json({ message: "This OTP has already been used. Please request a new code." });
      }
      if (new Date() > new Date(otp.expiresAt.getTime() + 30 * 60 * 1000)) {
        return res.status(400).json({ message: "OTP session expired. Please verify your phone again." });
      }

      // Duplicate checks
      const existingByNationalId = await storage.getUserByNationalId(nationalId.trim());
      if (existingByNationalId) {
        return res.status(409).json({ message: "An account with this National ID already exists" });
      }

      // Phone transfer check: if phone was previously assigned, flag old record
      const existingByPhone = await storage.getCandidateByPhone(normalizedPhone);
      if (existingByPhone) {
        console.log(`[Register] Phone ${normalizedPhone} previously belonged to candidate ${existingByPhone.id}. Flagging as transferred.`);
        await storage.flagPhoneTransferred(existingByPhone.id);
      }

      const syntheticEmail = `${nationalId.trim()}@candidate.workforce.sa`;
      const hashed = await bcrypt.hash(password, 12);

      const user = await storage.createUser({
        username: nationalId.trim(),
        email: syntheticEmail,
        password: hashed,
        fullName: fullName.trim(),
        phone: normalizedPhone,
        nationalId: nationalId.trim(),
        role: "candidate",
        isActive: true,
      });

      let candidate = await storage.getCandidateByNationalId(nationalId.trim());
      if (candidate) {
        await storage.updateCandidate(candidate.id, {
          userId: user.id,
          phone: normalizedPhone,
          fullNameEn: fullName.trim(),
          email: syntheticEmail,
        });
        candidate = (await storage.getCandidate(candidate.id))!;
      } else {
        candidate = await storage.createCandidate({
          fullNameEn: fullName.trim(),
          phone: normalizedPhone,
          nationalId: nationalId.trim(),
          email: syntheticEmail,
          status: "active",
          experienceYears: 0,
          country: "SA",
          userId: user.id,
        });
      }

      await storage.markOtpUsedForRegistration(otpId);

      const { password: _, ...safeUser } = user;
      return res.status(201).json({ user: safeUser, candidate });
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ─── Change password (candidate self-service) ───────────────────────────
  app.post("/api/auth/change-password", async (req: Request, res: Response) => {
    try {
      const { candidateId, currentPassword, newPassword } = req.body as {
        candidateId?: string; currentPassword?: string; newPassword?: string;
      };
      if (!candidateId || !currentPassword || !newPassword) {
        return res.status(400).json({ message: "All fields are required" });
      }
      const pwRules = [
        { ok: newPassword.length >= 8,              msg: "at least 8 characters" },
        { ok: /[A-Z]/.test(newPassword),            msg: "one uppercase letter" },
        { ok: /[a-z]/.test(newPassword),            msg: "one lowercase letter" },
        { ok: /[0-9]/.test(newPassword),            msg: "one number" },
        { ok: /[^A-Za-z0-9]/.test(newPassword),    msg: "one special character" },
      ];
      const failed = pwRules.filter((r) => !r.ok).map((r) => r.msg);
      if (failed.length) {
        return res.status(400).json({ message: `Password must contain: ${failed.join(", ")}` });
      }
      const candidate = await storage.getCandidate(candidateId);
      if (!candidate) return res.status(404).json({ message: "Candidate not found" });
      let user = candidate.userId
        ? await storage.getUser(candidate.userId)
        : undefined;
      if (!user && candidate.nationalId) {
        user = await storage.getUserByNationalId(candidate.nationalId);
      }
      if (!user) return res.status(404).json({ message: "User account not found" });
      const valid = await bcrypt.compare(currentPassword, user.password ?? "");
      if (!valid) return res.status(401).json({ message: "Current password is incorrect" });
      const hashed = await bcrypt.hash(newPassword, 12);
      await storage.updateUser(user.id, { password: hashed });
      return res.json({ message: "Password updated successfully" });
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ─── Reset password: initiate (lookup by National ID, send OTP) ──────────
  app.post("/api/auth/reset-password/request", async (req: Request, res: Response) => {
    try {
      const { nationalId } = req.body as { nationalId?: string };
      if (!nationalId) {
        return res.status(400).json({ message: "National ID is required" });
      }
      const clean = nationalId.trim();
      const user = await storage.getUserByNationalId(clean);
      if (!user) {
        return res.status(404).json({ message: "No account found with this ID number." });
      }
      if (!user.phone) {
        return res.status(400).json({ message: "No phone number on file. Contact an administrator." });
      }
      if (!user.isActive) {
        return res.status(403).json({ message: "Account is disabled. Contact support." });
      }

      const phone = user.phone;
      const recentCount = await storage.countRecentOtpRequests(phone, 10 * 60 * 1000);
      if (recentCount >= 3) {
        return res.status(429).json({ message: "Too many OTP requests. Please wait 10 minutes before trying again." });
      }

      const code = String(Math.floor(100000 + Math.random() * 900000));
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
      await storage.createOtpVerification(phone, code, expiresAt);

      const activePlugin = await storage.getActiveSmsPlugin();
      if (activePlugin) {
        const result = await sendSmsViaPlugin(activePlugin, phone, `Your password reset code is: ${code}`);
        if (!result.success) {
          console.error("[Reset] SMS delivery failed:", result.error);
          return res.status(502).json({ message: "Failed to send OTP. Please try again." });
        }
      }

      const masked = phone.replace(/.(?=.{2})/g, "x");
      console.log(`[Reset] OTP sent to ${phone} for national ID ${clean}, expires ${expiresAt.toISOString()}`);
      return res.json({ maskedPhone: masked, phone, expiresAt: expiresAt.toISOString() });
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ─── Reset password: finalize (OTP verified, set new password) ──────────
  app.post("/api/auth/reset-password", async (req: Request, res: Response) => {
    try {
      const { nationalId, otpId, newPassword } = req.body as {
        nationalId?: string; otpId?: string; newPassword?: string;
      };
      if (!nationalId || !otpId || !newPassword) {
        return res.status(400).json({ message: "National ID, OTP verification, and new password are required" });
      }
      if (newPassword.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }

      const user = await storage.getUserByNationalId(nationalId.trim());
      if (!user || !user.phone) {
        return res.status(404).json({ message: "No account found." });
      }

      const otp = await storage.getLatestOtpVerification(user.phone);
      if (!otp || otp.id !== otpId) {
        return res.status(400).json({ message: "Invalid OTP session. Please verify again." });
      }
      if (!otp.verifiedAt) {
        return res.status(400).json({ message: "Phone number has not been verified." });
      }
      if (new Date() > new Date(otp.expiresAt.getTime() + 30 * 60 * 1000)) {
        return res.status(400).json({ message: "OTP session expired. Please verify again." });
      }

      const hashed = await bcrypt.hash(newPassword, 12);
      await storage.updateUser(user.id, { password: hashed });
      await storage.markOtpUsedForRegistration(otpId);

      return res.json({ message: "Password has been reset successfully. You can now log in." });
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ─── System Settings (public — no auth) ──────────────────────────────────
  app.get("/api/settings/public", async (_req: Request, res: Response) => {
    try {
      const [supportEmail, privacyPolicy, termsConditions] = await Promise.all([
        storage.getSystemSetting("support_email"),
        storage.getSystemSetting("privacy_policy"),
        storage.getSystemSetting("terms_conditions"),
      ]);
      return res.json({
        supportEmail: supportEmail ?? null,
        privacyPolicy: privacyPolicy ?? null,
        termsConditions: termsConditions ?? null,
      });
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.get("/api/settings/system", async (_req: Request, res: Response) => {
    try {
      const [supportEmail, privacyPolicy, termsConditions] = await Promise.all([
        storage.getSystemSetting("support_email"),
        storage.getSystemSetting("privacy_policy"),
        storage.getSystemSetting("terms_conditions"),
      ]);
      return res.json({
        support_email: supportEmail ?? "",
        privacy_policy: privacyPolicy ?? "",
        terms_conditions: termsConditions ?? "",
      });
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.patch("/api/settings/system", async (req: Request, res: Response) => {
    try {
      const { support_email, privacy_policy, terms_conditions } = req.body;
      if (typeof support_email === "string") {
        const trimmed = support_email.trim();
        if (trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
          return res.status(400).json({ message: "Invalid email format" });
        }
        await storage.setSystemSetting("support_email", trimmed);
      }
      if (typeof privacy_policy === "string") {
        await storage.setSystemSetting("privacy_policy", privacy_policy);
      }
      if (typeof terms_conditions === "string") {
        await storage.setSystemSetting("terms_conditions", terms_conditions);
      }
      return res.json({ success: true });
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ─── Dashboard ───────────────────────────────────────────────────────────
  app.get("/api/dashboard/stats", async (_req: Request, res: Response) => {
    try {
      const stats = await storage.getDashboardStats();
      return res.json(stats);
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ─── Candidates ──────────────────────────────────────────────────────────
  app.get("/api/candidates", async (req: Request, res: Response) => {
    try {
      const query = candidateQuerySchema.parse(req.query);
      const result = await storage.getCandidates(query);
      return res.json(result);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.get("/api/candidates/by-ids", async (req: Request, res: Response) => {
    try {
      const ids = Array.isArray(req.query.ids) ? req.query.ids as string[] : req.query.ids ? [req.query.ids as string] : [];
      if (ids.length === 0) return res.json([]);
      const result = await storage.getCandidatesByIds(ids);
      return res.json(result);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.get("/api/candidates/export", async (req: Request, res: Response) => {
    try {
      const result = await storage.exportCandidates();
      return res.json(result);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.get("/api/candidates/stats", async (_req: Request, res: Response) => {
    try {
      const stats = await storage.getCandidateStats();
      return res.json(stats);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.get("/api/candidates/:id", async (req: Request, res: Response) => {
    try {
      const candidate = await storage.getCandidate(req.params.id);
      if (!candidate) return res.status(404).json({ message: "Candidate not found" });
      return res.json(candidate);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.post("/api/candidates", async (req: Request, res: Response) => {
    try {
      const data = insertCandidateSchema.parse(req.body);
      if (data.nationalId) {
        const existing = await storage.getCandidateByNationalId(data.nationalId);
        if (existing) {
          return res.status(409).json({ message: `A candidate with National ID ${data.nationalId} already exists` });
        }
      }
      if (data.phone) {
        const existing = await storage.getCandidateByPhone(data.phone);
        if (existing) {
          return res.status(409).json({ message: `A candidate with phone ${data.phone} already exists` });
        }
      }
      const candidate = await storage.createCandidate(data);
      return res.status(201).json(candidate);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.patch("/api/candidates/:id", async (req: Request, res: Response) => {
    try {
      const data = insertCandidateSchema.partial().parse(req.body);

      if (data.profileCompleted === true) {
        const existing = await storage.getCandidate(req.params.id);
        if (!existing) return res.status(404).json({ message: "Candidate not found" });
        const merged = { ...existing, ...data };
        const missing = validateProfileCompleteness(merged);
        if (missing.length > 0) {
          return res.status(400).json({
            message: `Cannot mark profile as complete. Missing required fields: ${missing.join(", ")}`,
            missingFields: missing,
          });
        }
      }

      const candidate = await storage.updateCandidate(req.params.id, data);
      if (!candidate) return res.status(404).json({ message: "Candidate not found" });
      return res.json(candidate);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.post("/api/candidates/:id/archive", async (req: Request, res: Response) => {
    try {
      const archived = await storage.archiveCandidate(req.params.id);
      if (!archived) return res.status(404).json({ message: "Candidate not found or already archived" });
      return res.json({ message: "Candidate archived" });
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.post("/api/candidates/:id/unarchive", async (req: Request, res: Response) => {
    try {
      const restored = await storage.unarchiveCandidate(req.params.id);
      if (!restored) return res.status(404).json({ message: "Candidate not found or not archived" });
      return res.json({ message: "Candidate restored" });
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.post("/api/candidates/bulk-action", async (req: Request, res: Response) => {
    try {
      const { ids, action } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "ids array is required" });
      }
      if (ids.length > 500) {
        return res.status(400).json({ message: "Maximum 500 candidates per bulk action" });
      }
      if (action === "block") {
        const affected = await storage.bulkUpdateCandidateStatus(ids, "blocked");
        return res.json({ affected, action });
      } else if (action === "unblock") {
        const affected = await storage.bulkUpdateCandidateStatus(ids, "active");
        return res.json({ affected, action });
      } else if (action === "archive") {
        const affected = await storage.bulkArchiveCandidates(ids);
        return res.json({ affected, action });
      } else {
        return res.status(400).json({ message: "Invalid action. Must be: block, unblock, or archive" });
      }
    } catch (err) {
      return handleError(res, err);
    }
  });

  // Bulk upload endpoint – designed for 70k candidates
  app.post("/api/candidates/bulk", async (req: Request, res: Response) => {
    try {
      const { candidates: rawCandidates } = req.body;
      if (!Array.isArray(rawCandidates) || rawCandidates.length === 0) {
        return res.status(400).json({ message: "candidates array is required" });
      }
      if (rawCandidates.length > 1000) {
        return res.status(400).json({ message: "Maximum 1,000 candidates per bulk upload" });
      }
      // SMP workers must use /api/candidates/smp-validate + /api/candidates/smp-commit
      const smpRows = rawCandidates.filter((c: Record<string, unknown>) => c.source === "smp");
      if (smpRows.length > 0) {
        return res.status(400).json({ message: "SMP workers cannot be added via the bulk endpoint. Use the SMP validation and commit flow instead." });
      }
      const errors: { row: number; message: string }[] = [];
      const validated: any[] = [];
      for (let i = 0; i < rawCandidates.length; i++) {
        try {
          const parsed = insertCandidateSchema.parse(rawCandidates[i]);
          if (parsed.profileCompleted) {
            const missing = validateProfileCompleteness(parsed);
            if (missing.length > 0) {
              errors.push({ row: i + 1, message: `Profile marked complete but missing: ${missing.join(", ")}` });
              continue;
            }
          }
          validated.push(parsed);
        } catch (e) {
          errors.push({ row: i + 1, message: e instanceof z.ZodError ? e.errors.map(er => `${er.path.join(".")}: ${er.message}`).join("; ") : "invalid" });
        }
      }
      if (errors.length > 0) {
        return res.status(400).json({ message: `Validation failed on ${errors.length} rows`, errors: errors.slice(0, 20) });
      }
      const result = await storage.bulkInsertCandidates(validated);
      const statusCode = result.skipped > 0 ? 207 : 201;
      return res.status(statusCode).json({
        inserted: result.inserted,
        skipped: result.skipped,
        total: rawCandidates.length,
        ...(result.duplicates.length > 0 ? { duplicates: result.duplicates.slice(0, 50) } : {}),
      });
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ─── SMP Upload Validation ────────────────────────────────────────────────
  // Validates SMP batch rows before committing: returns NEW, CLEAN, BLOCKED buckets
  app.post("/api/candidates/smp-validate", async (req: Request, res: Response) => {
    try {
      const { candidates: rows } = req.body;
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ message: "candidates array is required" });
      }

      const results: {
        status: "new" | "clean" | "blocked";
        row: Record<string, string>;
        candidate?: { id: string; fullNameEn: string; nationalId: string | null };
        blockedReason?: string;
      }[] = [];

      for (const row of rows) {
        const nationalId = row.nationalId?.trim();
        if (!nationalId) {
          results.push({ status: "new", row });
          continue;
        }

        const existing = await storage.getCandidateByNationalId(nationalId);
        if (!existing) {
          results.push({ status: "new", row });
          continue;
        }

        const candidateMeta = { id: existing.id, fullNameEn: existing.fullNameEn, nationalId: existing.nationalId ?? null };

        // Check for active workforce record
        const activeWf = await storage.getWorkforceByCandidateId(existing.id);
        if (activeWf && activeWf.isActive) {
          let reason: string;
          if (activeWf.employmentType === "smp") {
            reason = "Active SMP contract — terminate the existing SMP contract before adding to a new batch";
          } else if (activeWf.endDate) {
            // Individual employee with an end date set — in offboarding process
            reason = "Employee is currently in offboarding — cannot add to SMP batch until offboarding is complete";
          } else {
            reason = "Active individual employee — terminate employment before adding to SMP batch";
          }
          results.push({ status: "blocked", row, candidate: candidateMeta, blockedReason: reason });
          continue;
        }

        // Check for pending onboarding
        const onboardingRecords = await storage.getOnboardingRecords({ candidateId: existing.id });
        const activeOnboarding = onboardingRecords.find(ob => ob.status !== "converted" && ob.status !== "rejected");
        if (activeOnboarding) {
          results.push({ status: "blocked", row, candidate: candidateMeta, blockedReason: "In onboarding — remove from onboarding first" });
          continue;
        }

        // Check for active interview group
        const interviews = await storage.getInterviews({ candidateId: existing.id });
        const scheduledInterview = interviews.find(iv => iv.status === "scheduled" || iv.status === "in_progress");
        if (scheduledInterview) {
          results.push({ status: "blocked", row, candidate: candidateMeta, blockedReason: "In active interview group — remove from interview group first" });
          continue;
        }

        // Check for application under review
        const apps = await storage.getApplications({ candidateId: existing.id });
        const activeApp = apps.find(a => a.status === "new" || a.status === "reviewing" || a.status === "shortlisted" || a.status === "interviewed" || a.status === "offered");
        if (activeApp) {
          results.push({ status: "blocked", row, candidate: candidateMeta, blockedReason: "Application under review — close or reject the application first" });
          continue;
        }

        // Clean: exists in talent DB but no active duties
        results.push({ status: "clean", row, candidate: candidateMeta });
      }

      return res.json({ results });
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ─── SMP Commit ───────────────────────────────────────────────────────────
  // Commits validated SMP batch: creates new candidates, creates onboarding records
  // for CLEAN (existing) candidates, and skips BLOCKED rows.
  // CLEAN rows MUST carry confirmed=true from the caller; any CLEAN row without
  // explicit user confirmation is treated as skipped (server enforces this gate).
  app.post("/api/candidates/smp-commit", async (req: Request, res: Response) => {
    try {
      const { results: validationResults, eventId, jobId } = req.body as {
        results: {
          status: "new" | "clean" | "blocked";
          confirmed?: boolean;
          row: Record<string, string>;
          candidate?: { id: string; fullNameEn: string; nationalId: string | null };
        }[];
        eventId?: string;
        jobId?: string;
      };

      if (!Array.isArray(validationResults) || validationResults.length === 0) {
        return res.status(400).json({ message: "results array is required" });
      }

      // Strict CLEAN confirmation gate: any CLEAN row without confirmed=true is rejected
      const unconfirmedClean = validationResults.filter(r => r.status === "clean" && r.confirmed !== true);
      if (unconfirmedClean.length > 0) {
        return res.status(400).json({
          message: `${unconfirmedClean.length} CLEAN row(s) were not confirmed by the user. Confirm all CLEAN rows before committing.`,
        });
      }

      const created: string[] = [];  // new candidate IDs
      const attached: string[] = []; // existing candidate IDs added to onboarding
      const skipped: string[] = [];  // blocked or invalid rows skipped

      // Helper: build a typed SMP onboarding payload (no `as any` required)
      const buildSmpOnboardingPayload = (candidateId: string, hasPhoto: boolean, hasNationalId: boolean, notes: string): InsertOnboarding => ({
        candidateId,
        eventId: eventId ?? null,
        jobId: jobId ?? null,
        applicationId: null,
        hasPhoto,
        hasIban: false,
        hasNationalId,
        hasMedicalFitness: false,
        hasSignedContract: false,
        hasEmergencyContact: false,
        status: "pending",
        notes,
      });

      // Helper: re-check BLOCKED conditions server-side (never trust client-side status)
      const isBlockedServerSide = async (candidateId: string): Promise<string | null> => {
        const activeWf = await storage.getWorkforceByCandidateId(candidateId);
        if (activeWf && activeWf.isActive) {
          return activeWf.employmentType === "smp"
            ? "Currently under an active SMP contract"
            : "Active individual employment — cannot add to SMP batch";
        }
        const onboardingRecords = await storage.getOnboardingRecords({ candidateId });
        const activeOnboarding = onboardingRecords.find(ob => ob.status !== "converted" && ob.status !== "rejected");
        if (activeOnboarding) {
          return "In active onboarding — remove from onboarding first";
        }
        const interviews = await storage.getInterviews({ candidateId });
        const scheduledInterview = interviews.find(iv => iv.status === "scheduled" || iv.status === "in_progress");
        if (scheduledInterview) {
          return "In active interview group";
        }
        const apps = await storage.getApplications({ candidateId });
        const activeApp = apps.find(a => ["new", "reviewing", "shortlisted", "interviewed", "offered"].includes(a.status));
        if (activeApp) {
          return "Application under review";
        }
        return null;
      }

      for (const result of validationResults) {
        if (result.status === "blocked") {
          skipped.push(result.candidate?.id ?? result.row.nationalId ?? "?");
          continue;
        }

        if (result.status === "clean" && result.candidate) {
          // CLEAN (confirmed=true already verified above): re-validate server-side before attaching
          const candidateId = result.candidate.id;
          const blockReason = await isBlockedServerSide(candidateId);
          if (blockReason) {
            skipped.push(candidateId);
            continue; // reject: conditions changed between validate and commit
          }
          // Attach to SMP batch via onboarding record
          const existingObs = await storage.getOnboardingRecords({ candidateId });
          const alreadyActive = existingObs.find(r => r.status !== "converted" && r.status !== "rejected");
          if (!alreadyActive) {
            const candidateData = await storage.getCandidate(candidateId);
            await storage.createOnboardingRecord(buildSmpOnboardingPayload(
              candidateId,
              candidateData?.hasPhoto ?? false,
              candidateData?.hasNationalId ?? false,
              "Added via SMP batch upload (CLEAN match — existing talent DB member)",
            ));
          }
          attached.push(candidateId);
          continue;
        }

        if (result.status === "new") {
          // NEW: check nationalId doesn't now exist (race condition guard)
          const row = result.row;
          if (row.nationalId) {
            const maybeExisting = await storage.getCandidateByNationalId(row.nationalId.trim());
            if (maybeExisting) {
              // Became a CLEAN candidate between validate and commit — treat as CLEAN
              // Race-condition CLEAN rows do not require client confirmation; re-validate server-side instead
              const blockReason = await isBlockedServerSide(maybeExisting.id);
              if (blockReason) {
                skipped.push(row.nationalId);
                continue;
              }
              const existingObs = await storage.getOnboardingRecords({ candidateId: maybeExisting.id });
              const alreadyActive = existingObs.find(r => r.status !== "converted" && r.status !== "rejected");
              if (!alreadyActive) {
                await storage.createOnboardingRecord(buildSmpOnboardingPayload(
                  maybeExisting.id,
                  maybeExisting.hasPhoto ?? false,
                  maybeExisting.hasNationalId ?? false,
                  "Added via SMP batch upload (race-condition CLEAN match)",
                ));
              }
              attached.push(maybeExisting.id);
              continue;
            }
          }
          try {
            const parsed = insertCandidateSchema.parse({
              fullNameEn: row.fullNameEn || row.name || "",
              nationalId:  row.nationalId || null,
              phone:        row.phone || null,
              source:       "smp",
              profileCompleted: false,
            });
            const newCandidate = await storage.createCandidate(parsed);
            await storage.createOnboardingRecord(buildSmpOnboardingPayload(
              newCandidate.id,
              false,
              false,
              "Added via SMP batch upload (NEW — created fresh)",
            ));
            created.push(newCandidate.id);
          } catch (parseErr) {
            skipped.push(row.nationalId ?? row.fullNameEn ?? "?");
          }
        }
      }

      return res.json({
        created: created.length,
        attached: attached.length,
        skipped: skipped.length,
        message: `SMP batch committed: ${created.length} new, ${attached.length} existing attached, ${skipped.length} blocked/skipped.`,
      });
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ─── Events ──────────────────────────────────────────────────────────────
  app.get("/api/events", async (req: Request, res: Response) => {
    try {
      const includeArchived = req.query.archived === "true";
      const data = await storage.getEvents({ includeArchived });
      return res.json(data);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.get("/api/events/:id", async (req: Request, res: Response) => {
    try {
      const evt = await storage.getEvent(req.params.id);
      if (!evt) return res.status(404).json({ message: "Event not found" });
      return res.json(evt);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.post("/api/events", async (req: Request, res: Response) => {
    try {
      const data = insertEventSchema.parse(req.body);
      const evt = await storage.createEvent(data);
      return res.status(201).json(evt);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.patch("/api/events/:id", async (req: Request, res: Response) => {
    try {
      const data = insertEventSchema.partial().parse(req.body);
      const evt = await storage.updateEvent(req.params.id, data);
      if (!evt) return res.status(404).json({ message: "Event not found" });
      return res.json(evt);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.post("/api/events/:id/archive", async (req: Request, res: Response) => {
    try {
      const evt = await storage.archiveEvent(req.params.id);
      if (!evt) return res.status(404).json({ message: "Event not found" });
      return res.json(evt);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.post("/api/events/:id/unarchive", async (req: Request, res: Response) => {
    try {
      const evt = await storage.unarchiveEvent(req.params.id);
      if (!evt) return res.status(404).json({ message: "Event not found" });
      return res.json(evt);
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ─── Job Postings ─────────────────────────────────────────────────────────
  app.get("/api/jobs", async (req: Request, res: Response) => {
    try {
      const { status, eventId } = req.query as Record<string, string>;
      const data = await storage.getJobPostings({ status, eventId });
      return res.json(data);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.get("/api/jobs/stats", async (_req: Request, res: Response) => {
    try {
      const stats = await storage.getJobStats();
      return res.json(stats);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.get("/api/jobs/:id", async (req: Request, res: Response) => {
    try {
      const job = await storage.getJobPosting(req.params.id);
      if (!job) return res.status(404).json({ message: "Job not found" });
      return res.json(job);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.post("/api/jobs", async (req: Request, res: Response) => {
    try {
      const body = { ...req.body };
      if (typeof body.salaryMin === "number") body.salaryMin = String(body.salaryMin);
      if (typeof body.salaryMax === "number") body.salaryMax = String(body.salaryMax);
      const data = insertJobPostingSchema.parse(body);
      const job = await storage.createJobPosting(data);
      return res.status(201).json(job);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.patch("/api/jobs/:id", async (req: Request, res: Response) => {
    try {
      const body = { ...req.body };
      if (typeof body.salaryMin === "number") body.salaryMin = String(body.salaryMin);
      if (typeof body.salaryMax === "number") body.salaryMax = String(body.salaryMax);
      const data = insertJobPostingSchema.partial().parse(body);
      const job = await storage.updateJobPosting(req.params.id, data);
      if (!job) return res.status(404).json({ message: "Job not found" });
      return res.json(job);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.post("/api/jobs/:id/archive", async (req: Request, res: Response) => {
    try {
      const archived = await storage.archiveJobPosting(req.params.id);
      if (!archived) return res.status(404).json({ message: "Job not found or already archived" });
      return res.json({ success: true });
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.post("/api/jobs/:id/unarchive", async (req: Request, res: Response) => {
    try {
      const restored = await storage.unarchiveJobPosting(req.params.id);
      if (!restored) return res.status(404).json({ message: "Job not found" });
      return res.json({ success: true });
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ─── Applications ─────────────────────────────────────────────────────────
  app.get("/api/applications", async (req: Request, res: Response) => {
    try {
      const { jobId, candidateId, status } = req.query as Record<string, string>;
      const data = await storage.getApplications({ jobId, candidateId, status });
      return res.json(data);
    } catch (err) {
      return handleError(res, err);
    }
  });

  // Paginated applicant list (applications joined with candidate names) for interview scheduling
  app.get("/api/applications/applicants", async (req: Request, res: Response) => {
    try {
      const { jobId, page = "1", limit = "20", search } = req.query as Record<string, string>;
      if (!jobId) return res.status(400).json({ error: "jobId is required" });
      const result = await storage.getApplicantsForJob({
        jobId,
        page: Math.max(1, parseInt(page, 10) || 1),
        limit: Math.min(100, Math.max(1, parseInt(limit, 10) || 20)),
        search,
      });
      return res.json(result);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.get("/api/applications/stats", async (_req: Request, res: Response) => {
    try {
      const stats = await storage.getApplicationStats();
      return res.json(stats);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.post("/api/applications", async (req: Request, res: Response) => {
    try {
      const data = insertApplicationSchema.parse(req.body);

      // ── SMP reverse gate (source-agnostic, workforce-record-authoritative) ────
      // Block individual job applications for candidates who are:
      //   1. Currently active SMP workers, or
      //   2. In a pending onboarding and their workforce linkage (any record) is SMP.
      // Classification is determined from workforce records, NOT candidate.source.
      if (data.candidateId) {
        // 1. Active SMP workforce record
        const activeWf = await storage.getWorkforceByCandidateId(data.candidateId);
        if (activeWf && activeWf.isActive && activeWf.employmentType === "smp") {
          return res.status(409).json({
            message: "Cannot submit individual job application: this candidate is currently registered as an active SMP worker. Remove them from the SMP contract first.",
          });
        }

        // 2. Pending onboarding + SMP pipeline linkage (workforce-record-authoritative)
        //    Check all workforce records for SMP linkage. For brand-new SMP candidates
        //    who have no workforce record yet (pre-conversion stage), also check if any
        //    prior SMP record exists — if a candidate entered via SMP batch and has a
        //    pending onboarding, they are in the SMP pipeline.
        const allWfRecords = await storage.getAllWorkforceByCandidateId(data.candidateId);
        // hasSmpLinkage: true if this candidate has any SMP employment history
        const hasSmpLinkage = allWfRecords.some(r => r.employmentType === "smp");
        if (hasSmpLinkage) {
          const onboardingRecords = await storage.getOnboardingRecords({ candidateId: data.candidateId });
          const pendingOnboarding = onboardingRecords.find(
            ob => ob.status !== "converted" && ob.status !== "rejected"
          );
          if (pendingOnboarding) {
            return res.status(409).json({
              message: "Cannot submit individual job application: this candidate is in an active SMP onboarding pipeline. Complete or reject the SMP onboarding first.",
            });
          }
        }
        // Edge case: brand-new SMP entrant with no prior workforce record yet.
        // For these candidates, we check for a pending onboarding with no applicationId
        // (SMP onboardings are always created without a job application linkage).
        if (!hasSmpLinkage && allWfRecords.length === 0) {
          const onboardingRecords = await storage.getOnboardingRecords({ candidateId: data.candidateId });
          const pendingSmpOnboarding = onboardingRecords.find(
            ob =>
              ob.status !== "converted" &&
              ob.status !== "rejected" &&
              !ob.applicationId // SMP onboardings have no job application linkage
          );
          if (pendingSmpOnboarding) {
            return res.status(409).json({
              message: "Cannot submit individual job application: this candidate is in an active SMP onboarding pipeline. Complete or reject the SMP onboarding first.",
            });
          }
        }
      }

      const app_ = await storage.createApplication(data);
      return res.status(201).json(app_);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.patch("/api/applications/:id", async (req: Request, res: Response) => {
    try {
      const data = insertApplicationSchema.partial().parse(req.body);
      const app_ = await storage.updateApplication(req.params.id, data);
      if (!app_) return res.status(404).json({ message: "Application not found" });
      return res.json(app_);
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ─── Interviews ───────────────────────────────────────────────────────────
  app.get("/api/interviews", async (req: Request, res: Response) => {
    try {
      const { status, candidateId, eventId } = req.query as Record<string, string>;
      const data = await storage.getInterviews({ status, candidateId, eventId });
      return res.json(data);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.get("/api/interviews/stats", async (_req: Request, res: Response) => {
    try {
      const stats = await storage.getInterviewStats();
      return res.json(stats);
    } catch (err) {
      return handleError(res, err);
    }
  });

  // Must be before /:id to avoid "stats" being treated as an id
  app.get("/api/interviews/:id", async (req: Request, res: Response) => {
    try {
      const detail = await storage.getInterviewDetail(req.params.id);
      if (!detail) return res.status(404).json({ message: "Interview not found" });
      return res.json(detail);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.post("/api/interviews", async (req: Request, res: Response) => {
    try {
      const data = insertInterviewSchema.parse(req.body);
      const interview = await storage.createInterview(data);

      // ── Fire SMS to invited candidates ────────────────────────────────────
      if (interview.notes && interview.invitedCandidateIds?.length) {
        setImmediate(async () => {
          try {
            const smsPlugin = await storage.getActiveSmsPlugin();
            if (!smsPlugin) { console.warn("[SMS] No active plugin — skipping interview SMS"); return; }

            // Resolve template variables from interview record
            const at   = new Date(interview.scheduledAt);
            const date = at.toLocaleDateString("en-SA", { day: "2-digit", month: "long", year: "numeric", timeZone: "Asia/Riyadh" });
            const time = at.toLocaleTimeString("en-SA", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Riyadh" });

            const resolved = interview.notes
              .replace(/\{\{batch\}\}/g,    interview.groupName   ?? "")
              .replace(/\{\{date\}\}/g,     date)
              .replace(/\{\{time\}\}/g,     time)
              .replace(/\{\{venue\}\}/g,    interview.type        ?? "")
              .replace(/\{\{location\}\}/g, interview.meetingUrl  ?? "");

            for (const candidateId of interview.invitedCandidateIds) {
              const candidate = await storage.getCandidate(candidateId);
              if (!candidate?.phone) { console.warn(`[SMS] Candidate ${candidateId} has no phone — skipped`); continue; }
              const result = await sendSmsViaPlugin(smsPlugin, candidate.phone, resolved);
              if (result.success) {
                console.log(`[SMS] Interview notification sent to ${candidateId} (${candidate.phone})`);
              } else {
                console.error(`[SMS] Failed to send to ${candidateId}: ${result.error}`);
              }
            }
          } catch (e) {
            console.error("[SMS] Interview notification error:", e);
          }
        });
      }

      return res.status(201).json(interview);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.patch("/api/interviews/:id", async (req: Request, res: Response) => {
    try {
      const data = insertInterviewSchema.partial().parse(req.body);
      const interview = await storage.updateInterview(req.params.id, data);
      if (!interview) return res.status(404).json({ message: "Interview not found" });

      // Auto-cascade: completed interview → advance application to "interviewed"
      if (data.status === "completed" && interview.applicationId) {
        const app_ = await storage.getApplications({ });
        const linked = app_.find((a) => a.id === interview.applicationId);
        if (linked && !["hired", "rejected"].includes(linked.status)) {
          await storage.updateApplication(interview.applicationId, { status: "interviewed" });
          console.log(`[cascade] Interview ${interview.id} completed → application ${interview.applicationId} → interviewed`);
        }
      }

      return res.json(interview);
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ─── Bulk application status update ────────────────────────────────────────
  app.post("/api/applications/bulk-status", async (req: Request, res: Response) => {
    try {
      const { updates } = z.object({
        updates: z.array(z.object({
          id: z.string(),
          status: z.enum(["new", "shortlisted", "interviewed", "hired", "rejected"]),
        })).min(1),
      }).parse(req.body);

      const results: { id: string; success: boolean; error?: string }[] = [];
      for (const u of updates) {
        try {
          const updated = await storage.updateApplication(u.id, { status: u.status });
          results.push({ id: u.id, success: !!updated });
        } catch {
          results.push({ id: u.id, success: false, error: "Update failed" });
        }
      }

      const succeeded = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;
      return res.json({ succeeded, failed, results });
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ─── Onboarding ───────────────────────────────────────────────────────────
  app.get("/api/onboarding", async (req: Request, res: Response) => {
    try {
      const { status, eventId } = req.query as Record<string, string>;
      const records = await storage.getOnboardingRecords({ status, eventId });
      return res.json(records);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.post("/api/onboarding/bulk-convert", async (req: Request, res: Response) => {
    try {
      // employmentType can be explicitly provided for the whole batch, or derived
      // per-record from the onboarding record's applicationId:
      //   applicationId === null → SMP onboarding → employmentType = "smp"
      //   applicationId !== null → individual job application → employmentType = "individual"
      const { ids, startDate, eventId, salary, employmentType: batchEmploymentType } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: "ids array is required" });
      if (!startDate) return res.status(400).json({ message: "startDate is required" });
      const uniqueIds = [...new Set(ids as string[])];
      const results: any[] = [];
      const errors: { id: string; message: string }[] = [];
      for (const id of uniqueIds) {
        try {
          // Determine employmentType per-record if not provided at batch level
          let resolvedEmploymentType: "individual" | "smp" | undefined = undefined;
          if (batchEmploymentType === "smp" || batchEmploymentType === "individual") {
            resolvedEmploymentType = batchEmploymentType;
          } else {
            // Derive from onboarding record: no applicationId = SMP pipeline
            const ob = await storage.getOnboardingRecord(id);
            if (ob) {
              resolvedEmploymentType = ob.applicationId ? "individual" : "smp";
            }
          }
          const wf = await storage.convertOnboardingToEmployee(
            id,
            { startDate, eventId, salary, employmentType: resolvedEmploymentType },
            (req as any).userId,
          );
          results.push(wf);
        } catch (e: any) {
          errors.push({ id, message: e?.message || "conversion failed" });
        }
      }
      const status = results.length === 0 && errors.length > 0 ? 422 : results.length > 0 ? 201 : 200;
      return res.status(status).json({ converted: results.length, errors, total: uniqueIds.length });
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.get("/api/onboarding/:id", async (req: Request, res: Response) => {
    try {
      const record = await storage.getOnboardingRecord(req.params.id);
      if (!record) return res.status(404).json({ message: "Onboarding record not found" });
      return res.json(record);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.post("/api/onboarding", async (req: Request, res: Response) => {
    try {
      const data = insertOnboardingSchema.parse(req.body);
      // Prevent duplicate onboarding for same candidate
      const existing = await storage.getOnboardingRecords({});
      const dup = existing.find(r => r.candidateId === data.candidateId && r.status !== "converted" && r.status !== "rejected");
      if (dup) return res.status(409).json({ message: "Candidate is already in onboarding" });
      // Server-side: always read the candidate's actual upload status from DB
      // so stale client caches don't create onboarding records with false flags
      if (data.candidateId) {
        const candidate = await storage.getCandidate(data.candidateId);
        if (candidate) {
          data.hasPhoto = candidate.hasPhoto ?? false;
          data.hasIban = candidate.hasIban ?? false;
          data.hasNationalId = candidate.hasNationalId ?? false;
          // Derive SMP from onboarding linkage context: applicationId === null = SMP pipeline.
          // This is authoritative and source-agnostic.
          const isSmp = !data.applicationId;
          data.status = computeOnboardingStatus(data as any, isSmp);
        }
      }
      const record = await storage.createOnboardingRecord(data);
      return res.status(201).json(record);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.patch("/api/onboarding/:id", async (req: Request, res: Response) => {
    try {
      const data = insertOnboardingSchema.partial().parse(req.body);
      delete data.hasPhoto;
      delete data.hasIban;
      delete data.hasNationalId;
      const isRejection = data.status === "rejected";
      if (!isRejection) delete data.status;
      if (data.hasSignedContract !== undefined || isRejection) {
        const current = await storage.getOnboardingRecord(req.params.id);
        if (current && current.status !== "converted" && current.status !== "rejected") {
          const merged = { ...current, ...data };
          if (!isRejection) {
            // Derive SMP from onboarding record's applicationId (authoritative, source-agnostic)
            const isSmp = !current.applicationId;
            data.status = computeOnboardingStatus(merged, isSmp);
          }
        }
      }
      if (isRejection) {
        data.rejectedAt = new Date();
      }
      const record = await storage.updateOnboardingRecord(req.params.id, data);
      if (!record) return res.status(404).json({ message: "Onboarding record not found" });
      if (data.status === "rejected" && record.applicationId) {
        await storage.updateApplication(record.applicationId, { status: "interviewed" });
      }
      return res.json(record);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.delete("/api/onboarding/:id", async (req: Request, res: Response) => {
    try {
      const ok = await storage.deleteOnboardingRecord(req.params.id);
      if (!ok) return res.status(404).json({ message: "Onboarding record not found" });
      return res.status(204).end();
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.post("/api/onboarding/:id/convert", async (req: Request, res: Response) => {
    try {
      const { startDate, eventId, salary, employmentType: clientEmploymentType } = req.body as Record<string, string>;
      if (!startDate) return res.status(400).json({ message: "startDate is required" });

      // Derive employmentType from onboarding context when not explicitly provided.
      // This matches bulk-convert behavior: applicationId === null → SMP pipeline.
      let resolvedEmploymentType: "individual" | "smp" | undefined =
        clientEmploymentType === "smp" ? "smp" :
        clientEmploymentType === "individual" ? "individual" :
        undefined;

      if (!resolvedEmploymentType) {
        const ob = await storage.getOnboardingRecord(req.params.id);
        if (ob) {
          resolvedEmploymentType = ob.applicationId ? "individual" : "smp";
        }
      }

      const workforce = await storage.convertOnboardingToEmployee(
        req.params.id,
        {
          startDate,
          eventId: eventId || undefined,
          salary: salary && salary.trim() !== "" ? salary : undefined,
          employmentType: resolvedEmploymentType,
        },
        (req as any).userId,
      );
      return res.status(201).json(workforce);
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ─── Workforce (Employees) ────────────────────────────────────────────────
  app.get("/api/workforce", async (req: Request, res: Response) => {
    try {
      const { eventId, isActive, search } = req.query as Record<string, string>;
      const data = await storage.getWorkforce({
        eventId,
        isActive: isActive !== undefined ? isActive === "true" : undefined,
        search,
      });
      return res.json(data);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.get("/api/workforce/stats", async (_req: Request, res: Response) => {
    try {
      const stats = await storage.getWorkforceStats();
      return res.json(stats);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.get("/api/workforce/history/:nationalId", async (req: Request, res: Response) => {
    try {
      const history = await storage.getWorkHistory(req.params.nationalId);
      return res.json(history);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.get("/api/workforce/by-candidate/:candidateId", async (req: Request, res: Response) => {
    try {
      const record = await storage.getWorkforceByCandidateId(req.params.candidateId);
      return res.json(record ?? null);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.get("/api/workforce/all-by-candidate/:candidateId", async (req: Request, res: Response) => {
    try {
      const records = await storage.getAllWorkforceByCandidateId(req.params.candidateId);
      return res.json(records);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.get("/api/workforce/:id", async (req: Request, res: Response) => {
    try {
      const employee = await storage.getWorkforceEmployee(req.params.id);
      if (!employee) return res.status(404).json({ message: "Employee not found" });
      return res.json(employee);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.post("/api/workforce", async (req: Request, res: Response) => {
    try {
      const data = insertWorkforceSchema.parse(req.body);
      const record = await storage.createWorkforceRecord(data);
      if (data.candidateId && data.isActive !== false) {
        await storage.updateCandidate(data.candidateId, { status: "hired" });
      }
      return res.status(201).json(record);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.patch("/api/workforce/:id", async (req: Request, res: Response) => {
    try {
      const allowed = ["salary", "notes", "endDate", "supervisorId", "performanceScore", "isActive", "eventId"];
      const data: Record<string, any> = {};
      for (const key of allowed) {
        if (key in req.body) data[key] = req.body[key];
      }
      const record = await storage.updateWorkforceRecord(req.params.id, data);
      if (!record) return res.status(404).json({ message: "Employee not found" });
      return res.json(record);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.post("/api/workforce/:id/terminate", async (req: Request, res: Response) => {
    try {
      const { endDate, terminationReason } = req.body as { endDate: string; terminationReason?: string };
      if (!endDate) return res.status(400).json({ message: "endDate is required" });
      const record = await storage.terminateEmployee(req.params.id, { endDate, terminationReason });
      if (!record) return res.status(404).json({ message: "Employee not found" });
      return res.json(record);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.post("/api/workforce/reinstate", async (req: Request, res: Response) => {
    try {
      const { nationalId, startDate, eventId, salary, jobId, employmentType } = req.body as Record<string, string>;
      if (!nationalId || !startDate) return res.status(400).json({ message: "nationalId and startDate are required" });
      const resolvedEmploymentType: "individual" | "smp" | undefined =
        employmentType === "smp" ? "smp" : employmentType === "individual" ? "individual" : undefined;
      const record = await storage.reinstateEmployee(nationalId, { startDate, eventId, salary, jobId, employmentType: resolvedEmploymentType });
      return res.status(201).json(record);
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ─── Automation Rules ─────────────────────────────────────────────────────
  app.get("/api/automation", async (_req: Request, res: Response) => {
    try {
      const rules = await storage.getAutomationRules();
      return res.json(rules);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.post("/api/automation", async (req: Request, res: Response) => {
    try {
      const data = insertAutomationRuleSchema.parse(req.body);
      const rule = await storage.createAutomationRule(data);
      return res.status(201).json(rule);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.patch("/api/automation/:id", async (req: Request, res: Response) => {
    try {
      const data = insertAutomationRuleSchema.partial().parse(req.body);
      const rule = await storage.updateAutomationRule(req.params.id, data);
      if (!rule) return res.status(404).json({ message: "Rule not found" });
      return res.json(rule);
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ─── Notifications ────────────────────────────────────────────────────────
  app.get("/api/notifications", async (req: Request, res: Response) => {
    try {
      const { recipientId, status, limit } = req.query as Record<string, string>;
      const data = await storage.getNotifications({
        recipientId,
        status,
        limit: limit ? parseInt(limit) : undefined,
      });
      return res.json(data);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.post("/api/notifications", async (req: Request, res: Response) => {
    try {
      const data = insertNotificationSchema.parse(req.body);
      const notification = await storage.createNotification(data);
      return res.status(201).json(notification);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.patch("/api/notifications/:id/read", async (req: Request, res: Response) => {
    try {
      const marked = await storage.markNotificationRead(req.params.id);
      if (!marked) return res.status(404).json({ message: "Notification not found" });
      return res.json({ success: true });
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.get("/api/notifications/unread-count/:recipientId", async (req: Request, res: Response) => {
    try {
      const count = await storage.getUnreadCount(req.params.recipientId);
      return res.json({ count });
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ─── GitHub Integration ──────────────────────────────────────────────────
  app.get("/api/github/user", async (_req: Request, res: Response) => {
    try {
      const user = await getAuthenticatedUser();
      return res.json(user);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.get("/api/github/repos", async (_req: Request, res: Response) => {
    try {
      const repos = await listUserRepos();
      return res.json(repos);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.get("/api/github/repos/:owner/:repo", async (req: Request, res: Response) => {
    try {
      const repo = await getRepo(req.params.owner, req.params.repo);
      return res.json(repo);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.get("/api/github/repos/:owner/:repo/issues", async (req: Request, res: Response) => {
    try {
      const issues = await listRepoIssues(req.params.owner, req.params.repo);
      return res.json(issues);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.get("/api/github/repos/:owner/:repo/pulls", async (req: Request, res: Response) => {
    try {
      const pulls = await listRepoPullRequests(req.params.owner, req.params.repo);
      return res.json(pulls);
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ─── Business Units ────────────────────────────────────────────────────────
  app.get("/api/business-units", async (_req: Request, res: Response) => {
    try {
      return res.json(await storage.getBusinessUnits());
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.post("/api/business-units", async (req: Request, res: Response) => {
    try {
      const data = insertBusinessUnitSchema.parse(req.body);
      const bu = await storage.createBusinessUnit(data);
      return res.status(201).json(bu);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.patch("/api/business-units/:id", async (req: Request, res: Response) => {
    try {
      const data = insertBusinessUnitSchema.partial().parse(req.body);
      const bu = await storage.updateBusinessUnit(req.params.id, data);
      if (!bu) return res.status(404).json({ message: "Business unit not found" });
      return res.json(bu);
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ─── Users management (admin) ──────────────────────────────────────────────
  app.get("/api/users", async (_req: Request, res: Response) => {
    try {
      const userList = await storage.listUsers();
      return res.json(userList.map((u) => ({ ...u, password: undefined })));
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.post("/api/users", async (req: Request, res: Response) => {
    try {
      const data = insertUserSchema.parse(req.body);
      const hashed = await bcrypt.hash(data.password, 10);
      const user = await storage.createUser({ ...data, password: hashed });
      return res.status(201).json({ ...user, password: undefined });
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.patch("/api/users/:id", async (req: Request, res: Response) => {
    try {
      const data = insertUserSchema.partial().omit({ password: true }).parse(req.body);
      const user = await storage.updateUser(req.params.id, data);
      if (!user) return res.status(404).json({ message: "User not found" });
      return res.json({ ...user, password: undefined });
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ─── SMP Contracts ──────────────────────────────────────────────────────────
  app.get("/api/smp-contracts", async (_req: Request, res: Response) => {
    try {
      const contracts = await storage.getSMPContracts();
      return res.json(contracts);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.get("/api/smp-contracts/:id", async (req: Request, res: Response) => {
    try {
      const contract = await storage.getSMPContract(req.params.id);
      if (!contract) return res.status(404).json({ message: "Contract not found" });
      return res.json(contract);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.post("/api/smp-contracts", async (req: Request, res: Response) => {
    try {
      const data = insertSMPContractSchema.parse(req.body);
      const contract = await storage.createSMPContract(data);
      return res.status(201).json(contract);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.patch("/api/smp-contracts/:id", async (req: Request, res: Response) => {
    try {
      const data = insertSMPContractSchema.partial().parse(req.body);
      const contract = await storage.updateSMPContract(req.params.id, data);
      if (!contract) return res.status(404).json({ message: "Contract not found" });
      return res.json(contract);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.delete("/api/smp-contracts/:id", async (req: Request, res: Response) => {
    try {
      const ok = await storage.deleteSMPContract(req.params.id);
      if (!ok) return res.status(404).json({ message: "Contract not found" });
      return res.status(204).send();
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ─── Contract Templates (Contract Engine) ─────────────────────────────────
  app.get("/api/contract-templates", async (req: Request, res: Response) => {
    try {
      const { eventId, status } = req.query;
      const data = await storage.getContractTemplates({
        eventId: eventId as string | undefined,
        status: status as string | undefined,
      });
      return res.json(data);
    } catch (err) { return handleError(res, err); }
  });

  app.get("/api/contract-templates/:id", async (req: Request, res: Response) => {
    try {
      const t = await storage.getContractTemplate(req.params.id);
      if (!t) return res.status(404).json({ message: "Template not found" });
      return res.json(t);
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/contract-templates", async (req: Request, res: Response) => {
    try {
      const parsed = insertContractTemplateSchema.parse(req.body);
      const created = await storage.createContractTemplate(parsed);
      return res.status(201).json(created);
    } catch (err) { return handleError(res, err); }
  });

  app.patch("/api/contract-templates/:id", async (req: Request, res: Response) => {
    try {
      const existing = await storage.getContractTemplate(req.params.id);
      if (!existing) return res.status(404).json({ message: "Template not found" });
      const updated = await storage.updateContractTemplate(req.params.id, req.body);
      return res.json(updated);
    } catch (err) { return handleError(res, err); }
  });

  app.delete("/api/contract-templates/:id", async (req: Request, res: Response) => {
    try {
      const contracts = await storage.getCandidateContracts({ templateId: req.params.id });
      if (contracts.length > 0) {
        return res.status(409).json({ message: "Cannot delete template that has generated contracts. Archive it instead." });
      }
      const ok = await storage.deleteContractTemplate(req.params.id);
      if (!ok) return res.status(404).json({ message: "Template not found" });
      return res.json({ message: "Template deleted" });
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/contract-templates/:id/new-version", async (req: Request, res: Response) => {
    try {
      const parent = await storage.getContractTemplate(req.params.id);
      if (!parent) return res.status(404).json({ message: "Template not found" });
      const newVersion = await storage.createContractTemplate({
        name: parent.name,
        eventId: parent.eventId,
        version: parent.version + 1,
        parentTemplateId: parent.id,
        status: "draft",
        logoUrl: parent.logoUrl,
        companyName: parent.companyName,
        headerText: parent.headerText,
        footerText: parent.footerText,
        articles: req.body.articles ?? parent.articles,
        createdBy: req.body.createdBy ?? parent.createdBy,
      });
      await storage.updateContractTemplate(parent.id, { status: "archived" });
      return res.status(201).json(newVersion);
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/contract-templates/:id/logo", upload.single("file"), async (req: Request, res: Response) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      const logoUrl = `/uploads/${req.file.filename}`;
      const updated = await storage.updateContractTemplate(req.params.id, { logoUrl });
      if (!updated) return res.status(404).json({ message: "Template not found" });
      return res.json(updated);
    } catch (err) { return handleError(res, err); }
  });

  // ─── Candidate Contracts (generate / sign) ──────────────────────────────
  app.get("/api/candidate-contracts", async (req: Request, res: Response) => {
    try {
      const { candidateId, onboardingId, templateId, status } = req.query;
      const data = await storage.getCandidateContracts({
        candidateId: candidateId as string | undefined,
        onboardingId: onboardingId as string | undefined,
        templateId: templateId as string | undefined,
        status: status as string | undefined,
      });
      return res.json(data);
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/onboarding/:id/generate-contract", async (req: Request, res: Response) => {
    try {
      const ob = await storage.getOnboardingRecord(req.params.id);
      if (!ob) return res.status(404).json({ message: "Onboarding record not found" });

      const candidate = await storage.getCandidate(ob.candidateId);
      if (!candidate) return res.status(404).json({ message: "Candidate not found" });

      const { templateId } = req.body;
      if (!templateId) return res.status(400).json({ message: "templateId is required" });

      const template = await storage.getContractTemplate(templateId);
      if (!template) return res.status(404).json({ message: "Template not found" });

      const existing = await storage.getCandidateContracts({ onboardingId: ob.id });
      const pending = existing.find(c => c.status !== "signed");
      if (pending) {
        const updated = await storage.updateCandidateContract(pending.id, {
          templateId: template.id,
          snapshotArticles: template.articles,
          snapshotVariables: buildVariableSnapshot(candidate, template, ob),
          status: "awaiting_signing",
        });

        if (candidate.phone) {
          const smsPlugin = await storage.getActiveSmsPlugin();
          if (smsPlugin) {
            sendSmsViaPlugin(smsPlugin, candidate.phone, "Your employment contract has been generated and is ready for your review and signature. Please log in to the candidate portal to view and sign it.")
              .then(r => { if (r.success) console.log(`[SMS] Contract notification sent to ${candidate.phone}`); else console.error(`[SMS] Contract notification failed: ${r.error}`); })
              .catch(e => console.error("[SMS] Contract notification error:", e));
          }
        }

        return res.json(updated);
      }

      const contract = await storage.createCandidateContract({
        candidateId: candidate.id,
        onboardingId: ob.id,
        templateId: template.id,
        status: "awaiting_signing",
        snapshotArticles: template.articles,
        snapshotVariables: buildVariableSnapshot(candidate, template, ob),
      });

      await storage.updateOnboardingRecord(ob.id, { hasSignedContract: false });

      if (candidate.phone) {
        const smsPlugin = await storage.getActiveSmsPlugin();
        if (smsPlugin) {
          sendSmsViaPlugin(smsPlugin, candidate.phone, "Your employment contract has been generated and is ready for your review and signature. Please log in to the candidate portal to view and sign it.")
            .then(r => { if (r.success) console.log(`[SMS] Contract notification sent to ${candidate.phone}`); else console.error(`[SMS] Contract notification failed: ${r.error}`); })
            .catch(e => console.error("[SMS] Contract notification error:", e));
        }
      }

      return res.status(201).json(contract);
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/onboarding/bulk-generate-contracts", async (req: Request, res: Response) => {
    try {
      const { onboardingIds, templateId } = req.body;
      if (!templateId || !Array.isArray(onboardingIds) || onboardingIds.length === 0) {
        return res.status(400).json({ message: "templateId and onboardingIds[] are required" });
      }
      const template = await storage.getContractTemplate(templateId);
      if (!template) return res.status(404).json({ message: "Template not found" });

      const results: { onboardingId: string; success: boolean; error?: string }[] = [];
      const smsPlugin = await storage.getActiveSmsPlugin();

      for (const obId of onboardingIds) {
        try {
          const ob = await storage.getOnboardingRecord(obId);
          if (!ob) { results.push({ onboardingId: obId, success: false, error: "Record not found" }); continue; }
          if (ob.status === "converted" || ob.status === "rejected") { results.push({ onboardingId: obId, success: false, error: "Already converted or rejected" }); continue; }
          const candidate = await storage.getCandidate(ob.candidateId);
          if (!candidate) { results.push({ onboardingId: obId, success: false, error: "Candidate not found" }); continue; }
          // SMP onboardings have no applicationId — they do not get individual contracts
          if (!ob.applicationId) { results.push({ onboardingId: obId, success: false, error: "SMP workers do not get contracts" }); continue; }

          const existing = await storage.getCandidateContracts({ onboardingId: ob.id });
          const pending = existing.find(c => c.status !== "signed");
          if (pending) {
            await storage.updateCandidateContract(pending.id, {
              templateId: template.id,
              snapshotArticles: template.articles,
              snapshotVariables: buildVariableSnapshot(candidate, template, ob),
              status: "awaiting_signing",
            });
          } else {
            await storage.createCandidateContract({
              candidateId: candidate.id,
              onboardingId: ob.id,
              templateId: template.id,
              status: "awaiting_signing",
              snapshotArticles: template.articles,
              snapshotVariables: buildVariableSnapshot(candidate, template, ob),
            });
            await storage.updateOnboardingRecord(ob.id, { hasSignedContract: false });
          }

          if (candidate.phone && smsPlugin) {
            sendSmsViaPlugin(smsPlugin, candidate.phone, "Your employment contract has been generated and is ready for your review and signature. Please log in to the candidate portal to view and sign it.")
              .catch(e => console.error("[SMS] Bulk contract notification error:", e));
          }

          results.push({ onboardingId: obId, success: true });
        } catch (e: any) {
          results.push({ onboardingId: obId, success: false, error: e?.message ?? "Unknown error" });
        }
      }

      return res.json({ generated: results.filter(r => r.success).length, failed: results.filter(r => !r.success).length, results });
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/candidate-contracts/:id/sign", async (req: Request, res: Response) => {
    try {
      const contract = await storage.getCandidateContract(req.params.id);
      if (!contract) return res.status(404).json({ message: "Contract not found" });
      if (contract.status === "signed") return res.status(409).json({ message: "Contract already signed" });

      const ip = req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";

      const updated = await storage.updateCandidateContract(contract.id, {
        status: "signed",
        signedAt: new Date(),
        signedIp: ip,
      });

      if (contract.onboardingId) {
        const ob = await storage.getOnboardingRecord(contract.onboardingId);
        if (ob) {
          // Derive SMP from onboarding linkage (applicationId === null = SMP pipeline)
          const isSmp = !ob.applicationId;
          const rec = { ...ob, hasSignedContract: true };
          const newStatus = computeOnboardingStatus(rec, isSmp);
          await storage.updateOnboardingRecord(contract.onboardingId, {
            hasSignedContract: true,
            contractSignedAt: new Date(),
            status: newStatus,
          });
        }
      }

      return res.json(updated);
    } catch (err) { return handleError(res, err); }
  });

  app.get("/api/candidate-contracts/:id/preview", async (req: Request, res: Response) => {
    try {
      const contract = await storage.getCandidateContract(req.params.id);
      if (!contract) return res.status(404).json({ message: "Contract not found" });
      const template = await storage.getContractTemplate(contract.templateId);
      return res.json({
        contract,
        template: template ? { name: template.name, companyName: template.companyName, logoUrl: template.logoUrl, logoAlignment: template.logoAlignment, headerText: template.headerText, preamble: template.preamble, footerText: template.footerText, documentFooter: template.documentFooter } : null,
        articles: contract.snapshotArticles,
        variables: contract.snapshotVariables,
      });
    } catch (err) { return handleError(res, err); }
  });

  // ─── Question Sets ────────────────────────────────────────────────────────
  app.get("/api/question-sets", async (_req: Request, res: Response) => {
    try {
      const data = await storage.getQuestionSets();
      return res.json(data);
    } catch (err) { return handleError(res, err); }
  });

  app.get("/api/question-sets/:id", async (req: Request, res: Response) => {
    try {
      const qs = await storage.getQuestionSet(req.params.id);
      if (!qs) return res.status(404).json({ message: "Question set not found" });
      return res.json(qs);
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/question-sets", async (req: Request, res: Response) => {
    try {
      const data = insertQuestionSetSchema.parse(req.body);
      const qs = await storage.createQuestionSet(data);
      return res.status(201).json(qs);
    } catch (err) { return handleError(res, err); }
  });

  app.patch("/api/question-sets/:id", async (req: Request, res: Response) => {
    try {
      const data = insertQuestionSetSchema.partial().parse(req.body);
      const qs = await storage.updateQuestionSet(req.params.id, data);
      if (!qs) return res.status(404).json({ message: "Question set not found" });
      return res.json(qs);
    } catch (err) { return handleError(res, err); }
  });

  app.delete("/api/question-sets/:id", async (req: Request, res: Response) => {
    try {
      const ok = await storage.deleteQuestionSet(req.params.id);
      if (!ok) return res.status(404).json({ message: "Question set not found" });
      return res.status(204).send();
    } catch (err) { return handleError(res, err); }
  });

  // ─── SMS Plugins ──────────────────────────────────────────────────────────
  app.get("/api/sms-plugins", async (_req: Request, res: Response) => {
    try {
      const plugins = await storage.getSmsPlugins();
      return res.json(plugins);
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/sms-plugins", async (req: Request, res: Response) => {
    try {
      const { pluginConfig, credentials } = req.body as { pluginConfig: unknown; credentials?: Record<string, string> };
      if (!pluginConfig) return res.status(400).json({ message: "pluginConfig is required" });

      const validation = validatePluginConfig(pluginConfig);
      if (!validation.valid) return res.status(400).json({ message: validation.error });

      const config = validation.config;
      const plugin = await storage.createSmsPlugin({
        name: config.name,
        version: config.version,
        description: config.description ?? null,
        pluginConfig: config as Record<string, unknown>,
        credentials: (credentials ?? {}) as Record<string, unknown>,
        isActive: false,
      });
      return res.status(201).json(plugin);
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/sms-plugins/validate", async (req: Request, res: Response) => {
    try {
      const validation = validatePluginConfig(req.body);
      if (!validation.valid) return res.status(400).json({ valid: false, error: validation.error });
      return res.json({ valid: true, config: validation.config });
    } catch (err) { return handleError(res, err); }
  });

  app.patch("/api/sms-plugins/:id/credentials", async (req: Request, res: Response) => {
    try {
      const credentials = z.record(z.string()).parse(req.body);
      const plugin = await storage.updateSmsPluginCredentials(req.params.id, credentials);
      if (!plugin) return res.status(404).json({ message: "Plugin not found" });
      return res.json(plugin);
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/sms-plugins/:id/activate", async (req: Request, res: Response) => {
    try {
      const ok = await storage.activateSmsPlugin(req.params.id);
      if (!ok) return res.status(404).json({ message: "Plugin not found" });
      return res.json({ success: true });
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/sms-plugins/:id/test", async (req: Request, res: Response) => {
    try {
      const { to, message } = z.object({
        to: z.string().min(7),
        message: z.string().min(1),
      }).parse(req.body);

      const plugin = await storage.getSmsPlugin(req.params.id);
      if (!plugin) return res.status(404).json({ message: "Plugin not found" });

      console.log(`[SMS Test] Sending to="${to}" message="${message}" via plugin="${plugin.name}"`);
      const result = await sendSmsViaPlugin(plugin, to, message);
      console.log(`[SMS Test] Result:`, JSON.stringify(result));
      return res.json(result);
    } catch (err) { return handleError(res, err); }
  });

  app.delete("/api/sms-plugins/:id", async (req: Request, res: Response) => {
    try {
      const ok = await storage.deleteSmsPlugin(req.params.id);
      if (!ok) return res.status(404).json({ message: "Plugin not found" });
      return res.status(204).send();
    } catch (err) { return handleError(res, err); }
  });

  // ─── ID Card Templates ──────────────────────────────────────────────────────
  app.get("/api/id-card-templates", async (req: Request, res: Response) => {
    try {
      const eventId = req.query.eventId as string | undefined;
      const templates = await storage.getIdCardTemplates(eventId ? { eventId } : undefined);
      return res.json(templates);
    } catch (err) { return handleError(res, err); }
  });

  app.get("/api/id-card-templates/active", async (req: Request, res: Response) => {
    try {
      const eventId = req.query.eventId as string | undefined;
      const template = await storage.getActiveIdCardTemplate(eventId);
      if (!template) return res.status(404).json({ message: "No active template found" });
      return res.json(template);
    } catch (err) { return handleError(res, err); }
  });

  app.get("/api/id-card-templates/:id", async (req: Request, res: Response) => {
    try {
      const template = await storage.getIdCardTemplate(req.params.id);
      if (!template) return res.status(404).json({ message: "Template not found" });
      return res.json(template);
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/id-card-templates", async (req: Request, res: Response) => {
    try {
      const data = insertIdCardTemplateSchema.parse(req.body);
      const template = await storage.createIdCardTemplate(data);
      return res.status(201).json(template);
    } catch (err) { return handleError(res, err); }
  });

  app.patch("/api/id-card-templates/:id", async (req: Request, res: Response) => {
    try {
      const data = insertIdCardTemplateSchema.partial().parse(req.body);
      const template = await storage.updateIdCardTemplate(req.params.id, data);
      if (!template) return res.status(404).json({ message: "Template not found" });
      return res.json(template);
    } catch (err) { return handleError(res, err); }
  });

  app.delete("/api/id-card-templates/:id", async (req: Request, res: Response) => {
    try {
      const ok = await storage.deleteIdCardTemplate(req.params.id);
      if (!ok) return res.status(404).json({ message: "Template not found" });
      return res.status(204).send();
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/id-card-templates/:id/activate", async (req: Request, res: Response) => {
    try {
      const ok = await storage.activateIdCardTemplate(req.params.id);
      if (!ok) return res.status(404).json({ message: "Template not found" });
      return res.json({ success: true });
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/id-card-templates/:id/background", upload.single("file"), async (req: Request, res: Response) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      const imageUrl = `/uploads/${req.file.filename}`;
      const updateData = { backgroundImageUrl: imageUrl };
      const template = await storage.updateIdCardTemplate(req.params.id, updateData);
      if (!template) return res.status(404).json({ message: "Template not found" });
      return res.json(template);
    } catch (err) { return handleError(res, err); }
  });

  // ─── Printer Plugins ────────────────────────────────────────────────────────
  app.get("/api/printer-plugins", async (_req: Request, res: Response) => {
    try {
      const plugins = await storage.getPrinterPlugins();
      return res.json(plugins);
    } catch (err) { return handleError(res, err); }
  });

  app.get("/api/printer-plugins/active", async (_req: Request, res: Response) => {
    try {
      const plugin = await storage.getActivePrinterPlugin();
      if (!plugin) return res.status(404).json({ message: "No active printer plugin" });
      return res.json(plugin);
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/printer-plugins", async (req: Request, res: Response) => {
    try {
      const data = insertPrinterPluginSchema.parse(req.body);
      const plugin = await storage.createPrinterPlugin(data);
      return res.status(201).json(plugin);
    } catch (err) { return handleError(res, err); }
  });

  app.patch("/api/printer-plugins/:id", async (req: Request, res: Response) => {
    try {
      const data = insertPrinterPluginSchema.partial().parse(req.body);
      const plugin = await storage.updatePrinterPlugin(req.params.id, data);
      if (!plugin) return res.status(404).json({ message: "Plugin not found" });
      return res.json(plugin);
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/printer-plugins/:id/activate", async (req: Request, res: Response) => {
    try {
      const ok = await storage.activatePrinterPlugin(req.params.id);
      if (!ok) return res.status(404).json({ message: "Plugin not found" });
      return res.json({ success: true });
    } catch (err) { return handleError(res, err); }
  });

  app.delete("/api/printer-plugins/:id", async (req: Request, res: Response) => {
    try {
      const ok = await storage.deletePrinterPlugin(req.params.id);
      if (!ok) return res.status(404).json({ message: "Plugin not found" });
      return res.status(204).send();
    } catch (err) { return handleError(res, err); }
  });

  // ─── ID Card Print Logs ─────────────────────────────────────────────────────
  app.get("/api/id-card-print-logs", async (req: Request, res: Response) => {
    try {
      const { employeeId, templateId, printedBy, limit } = req.query as Record<string, string>;
      const logs = await storage.getIdCardPrintLogs({
        employeeId,
        templateId,
        printedBy,
        limit: limit ? parseInt(limit, 10) : undefined,
      });
      return res.json(logs);
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/id-card-print-logs", async (req: Request, res: Response) => {
    try {
      const data = insertIdCardPrintLogSchema.parse(req.body);
      const log = await storage.createIdCardPrintLog(data);
      return res.status(201).json(log);
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/id-card-print-logs/bulk", async (req: Request, res: Response) => {
    try {
      const body = req.body as { logs?: unknown[] };
      if (!Array.isArray(body.logs) || body.logs.length === 0) {
        return res.status(400).json({ message: "logs array is required" });
      }
      const validated = body.logs.map((l) => insertIdCardPrintLogSchema.parse(l));
      const created = await storage.bulkCreateIdCardPrintLogs(validated);
      return res.status(201).json(created);
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/id-card-print-jobs", async (req: Request, res: Response) => {
    try {
      const { employeeIds, templateId, printerPluginId, statuses } = req.body as {
        employeeIds: string[];
        templateId?: string | null;
        printerPluginId?: string | null;
        statuses: { employeeId: string; status: string; error?: string }[];
      };
      if (!Array.isArray(employeeIds) || employeeIds.length === 0) {
        return res.status(400).json({ message: "employeeIds array is required" });
      }
      if (!Array.isArray(statuses)) {
        return res.status(400).json({ message: "statuses array is required" });
      }
      const logEntries = statuses.map((s) =>
        insertIdCardPrintLogSchema.parse({
          employeeId: s.employeeId,
          templateId: templateId ?? null,
          printedBy: null,
          printerPluginId: printerPluginId ?? null,
          status: s.status === "success" ? "success" : s.status === "pending" ? "pending" : "failed",
          printedAt: new Date(),
        })
      );
      const created = await storage.bulkCreateIdCardPrintLogs(logEntries);
      return res.status(201).json({ logged: created.length, logs: created });
    } catch (err) { return handleError(res, err); }
  });

  app.get("/api/workforce/:id/last-printed", async (req: Request, res: Response) => {
    try {
      const date = await storage.getLastPrintDate(req.params.id);
      return res.json({ lastPrintedAt: date?.toISOString() ?? null });
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/workforce/last-printed-bulk", async (req: Request, res: Response) => {
    try {
      const { employeeIds } = req.body as { employeeIds?: string[] };
      if (!Array.isArray(employeeIds)) {
        return res.status(400).json({ message: "employeeIds array required" });
      }
      const results: Record<string, string | null> = {};
      for (const id of employeeIds) {
        const date = await storage.getLastPrintDate(id);
        results[id] = date?.toISOString() ?? null;
      }
      return res.json(results);
    } catch (err) { return handleError(res, err); }
  });

  // ─── Shifts ─────────────────────────────────────────────────────────────────
  app.get("/api/shifts", async (_req: Request, res: Response) => {
    try { return res.json(await storage.getShifts()); }
    catch (err) { return handleError(res, err); }
  });

  app.get("/api/shifts/:id", async (req: Request, res: Response) => {
    try {
      const row = await storage.getShift(req.params.id);
      if (!row) return res.status(404).json({ message: "Shift not found" });
      return res.json(row);
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/shifts", async (req: Request, res: Response) => {
    try {
      const data = insertShiftSchema.parse(req.body);
      const row = await storage.createShift(data);
      return res.status(201).json(row);
    } catch (err) { return handleError(res, err); }
  });

  app.patch("/api/shifts/:id", async (req: Request, res: Response) => {
    try {
      const data = insertShiftSchema.partial().parse(req.body);
      const row = await storage.updateShift(req.params.id, data);
      if (!row) return res.status(404).json({ message: "Shift not found" });
      return res.json(row);
    } catch (err) { return handleError(res, err); }
  });

  app.delete("/api/shifts/:id", async (req: Request, res: Response) => {
    try {
      const ok = await storage.deleteShift(req.params.id);
      if (!ok) return res.status(404).json({ message: "Shift not found" });
      return res.status(204).end();
    } catch (err) { return handleError(res, err); }
  });

  // ─── Schedule Templates ──────────────────────────────────────────────────────
  app.get("/api/schedule-templates", async (req: Request, res: Response) => {
    try {
      const { eventId } = req.query as { eventId?: string };
      return res.json(await storage.getScheduleTemplates(eventId ? { eventId } : undefined));
    } catch (err) { return handleError(res, err); }
  });

  app.get("/api/schedule-templates/:id", async (req: Request, res: Response) => {
    try {
      const row = await storage.getScheduleTemplate(req.params.id);
      if (!row) return res.status(404).json({ message: "Schedule template not found" });
      return res.json(row);
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/schedule-templates", async (req: Request, res: Response) => {
    try {
      const data = insertScheduleTemplateSchema.parse(req.body);
      const row = await storage.createScheduleTemplate(data);
      return res.status(201).json(row);
    } catch (err) { return handleError(res, err); }
  });

  app.patch("/api/schedule-templates/:id", async (req: Request, res: Response) => {
    try {
      const data = insertScheduleTemplateSchema.partial().parse(req.body);
      const row = await storage.updateScheduleTemplate(req.params.id, data);
      if (!row) return res.status(404).json({ message: "Schedule template not found" });
      return res.json(row);
    } catch (err) { return handleError(res, err); }
  });

  app.delete("/api/schedule-templates/:id", async (req: Request, res: Response) => {
    try {
      const ok = await storage.deleteScheduleTemplate(req.params.id);
      if (!ok) return res.status(404).json({ message: "Schedule template not found" });
      return res.status(204).end();
    } catch (err) { return handleError(res, err); }
  });

  // ─── Schedule Assignments ────────────────────────────────────────────────────
  app.get("/api/schedule-assignments", async (req: Request, res: Response) => {
    try {
      const { workforceId, templateId, activeOnly } = req.query as { workforceId?: string; templateId?: string; activeOnly?: string };
      return res.json(await storage.getScheduleAssignments({
        workforceId,
        templateId,
        activeOnly: activeOnly === "true",
      }));
    } catch (err) { return handleError(res, err); }
  });

  app.get("/api/schedule-assignments/employee/:workforceId/active", async (req: Request, res: Response) => {
    try {
      const row = await storage.getActiveAssignmentForEmployee(req.params.workforceId);
      return res.json(row ?? null);
    } catch (err) { return handleError(res, err); }
  });

  app.get("/api/schedule-assignments/employee/:workforceId", async (req: Request, res: Response) => {
    try {
      const rows = await storage.getScheduleAssignments({ workforceId: req.params.workforceId });
      return res.json(rows);
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/schedule-assignments", async (req: Request, res: Response) => {
    try {
      const data = insertScheduleAssignmentSchema.parse(req.body);
      const endDate = data.endDate ?? null;
      const allExisting = await storage.getScheduleAssignments({ workforceId: data.workforceId });
      for (const existing of allExisting) {
        const existsEnd = existing.endDate ?? "9999-12-31";
        const newEnd = endDate ?? "9999-12-31";
        const overlaps = existing.startDate < newEnd && existsEnd > data.startDate;
        if (overlaps) {
          if (existing.startDate < data.startDate) {
            await storage.endScheduleAssignment(existing.id, data.startDate);
          } else {
            await storage.deleteScheduleAssignment(existing.id);
          }
        }
      }
      const row = await storage.createScheduleAssignment(data);
      return res.status(201).json(row);
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/schedule-assignments/bulk", async (req: Request, res: Response) => {
    try {
      const { workforceIds, templateId, startDate, assignedBy, endDate } = req.body as {
        workforceIds: string[];
        templateId: string;
        startDate: string;
        assignedBy?: string;
        endDate?: string | null;
      };
      if (!Array.isArray(workforceIds) || !templateId || !startDate) {
        return res.status(400).json({ message: "workforceIds, templateId, startDate are required" });
      }
      const result = await storage.bulkAssignSchedule(workforceIds, templateId, startDate, assignedBy, endDate);
      return res.status(201).json(result);
    } catch (err) { return handleError(res, err); }
  });

  app.patch("/api/schedule-assignments/:id", async (req: Request, res: Response) => {
    try {
      const data = insertScheduleAssignmentSchema.partial().parse(req.body);
      const existing = await storage.getScheduleAssignment(req.params.id);
      if (!existing) return res.status(404).json({ message: "Schedule assignment not found" });
      const startDate = data.startDate ?? existing.startDate;
      const endDate = data.endDate !== undefined ? data.endDate : existing.endDate;
      const hasOverlap = await storage.checkScheduleOverlap(existing.workforceId, startDate, endDate, req.params.id);
      if (hasOverlap) return res.status(409).json({ message: "Assignment date range overlaps with an existing assignment for this employee" });
      const row = await storage.updateScheduleAssignment(req.params.id, data);
      if (!row) return res.status(404).json({ message: "Schedule assignment not found" });
      return res.json(row);
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/schedule-assignments/:id/end", async (req: Request, res: Response) => {
    try {
      const { endDate } = req.body as { endDate: string };
      if (!endDate) return res.status(400).json({ message: "endDate is required" });
      const row = await storage.endScheduleAssignment(req.params.id, endDate);
      if (!row) return res.status(404).json({ message: "Assignment not found" });
      return res.json(row);
    } catch (err) { return handleError(res, err); }
  });

  app.delete("/api/schedule-assignments/:id", async (req: Request, res: Response) => {
    try {
      const ok = await storage.deleteScheduleAssignment(req.params.id);
      if (!ok) return res.status(404).json({ message: "Assignment not found" });
      return res.status(204).end();
    } catch (err) { return handleError(res, err); }
  });

  // ─── Attendance Records ──────────────────────────────────────────────────────
  app.get("/api/attendance", async (req: Request, res: Response) => {
    try {
      const { workforceId, dateFrom, dateTo, date } = req.query as { workforceId?: string; dateFrom?: string; dateTo?: string; date?: string };
      return res.json(await storage.getAttendanceRecords({ workforceId, dateFrom, dateTo, date }));
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/attendance", async (req: Request, res: Response) => {
    try {
      const data = insertAttendanceRecordSchema.parse(req.body);
      const row = await storage.upsertAttendanceRecord(data);
      return res.status(201).json(row);
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/attendance/bulk", async (req: Request, res: Response) => {
    try {
      const { records } = req.body as { records: unknown[] };
      if (!Array.isArray(records)) return res.status(400).json({ message: "records array required" });
      const parsed = records.map(r => insertAttendanceRecordSchema.parse(r));
      const results = await Promise.all(parsed.map(r => storage.upsertAttendanceRecord(r)));
      return res.status(201).json(results);
    } catch (err) { return handleError(res, err); }
  });

  app.patch("/api/attendance/:id", async (req: Request, res: Response) => {
    try {
      const existing = await storage.getAttendanceRecord(req.params.id);
      if (!existing) return res.status(404).json({ message: "Attendance record not found" });
      const data = insertAttendanceRecordSchema.partial().parse(req.body);
      const row = await storage.upsertAttendanceRecord({ ...existing, ...data });
      return res.json(row);
    } catch (err) { return handleError(res, err); }
  });

  app.delete("/api/attendance/:id", async (req: Request, res: Response) => {
    try {
      const ok = await storage.deleteAttendanceRecord(req.params.id);
      if (!ok) return res.status(404).json({ message: "Attendance record not found" });
      return res.status(204).end();
    } catch (err) { return handleError(res, err); }
  });

  app.get("/api/attendance/summary", async (req: Request, res: Response) => {
    try {
      const { dateFrom, dateTo } = req.query as { dateFrom?: string; dateTo?: string };
      if (!dateFrom || !dateTo) return res.status(400).json({ message: "dateFrom and dateTo are required" });
      const allEmployees = await storage.getWorkforce({ isActive: true });
      const workforceIds = allEmployees.map((e: { id: string }) => e.id);
      const summary = await storage.getWorkedDaySummary(workforceIds, dateFrom, dateTo);
      const summaryWithName = summary.map(s => {
        const emp = allEmployees.find((e: { id: string; fullNameEn?: string | null; employeeNumber?: string }) => e.id === s.workforceId);
        return { ...s, fullNameEn: emp?.fullNameEn ?? null, employeeNumber: emp?.employeeNumber ?? null };
      });
      return res.json(summaryWithName);
    } catch (err) { return handleError(res, err); }
  });

  // Employee portal read-only endpoint: current schedule assignment for candidate portal
  app.get("/api/portal/schedule/:workforceId", async (req: Request, res: Response) => {
    try {
      const assignment = await storage.getActiveAssignmentForEmployee(req.params.workforceId);
      if (!assignment) return res.json(null);
      const template = await storage.getScheduleTemplate(assignment.templateId);
      return res.json({ assignment, template: template ?? null });
    } catch (err) { return handleError(res, err); }
  });

  // ─── Assets ──────────────────────────────────────────────────────────────────
  app.get("/api/assets", async (req: Request, res: Response) => {
    try {
      const includeInactive = req.query.includeInactive === "true";
      const rows = await storage.getAssets(includeInactive);
      return res.json(rows);
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/assets", async (req: Request, res: Response) => {
    try {
      const data = insertAssetSchema.parse(req.body);
      const row = await storage.createAsset(data);
      return res.status(201).json(row);
    } catch (err) { return handleError(res, err); }
  });

  app.get("/api/assets/:id", async (req: Request, res: Response) => {
    try {
      const row = await storage.getAsset(req.params.id);
      if (!row) return res.status(404).json({ message: "Asset not found" });
      return res.json(row);
    } catch (err) { return handleError(res, err); }
  });

  app.patch("/api/assets/:id", async (req: Request, res: Response) => {
    try {
      const data = insertAssetSchema.partial().parse(req.body);
      const row = await storage.updateAsset(req.params.id, data);
      if (!row) return res.status(404).json({ message: "Asset not found" });
      return res.json(row);
    } catch (err) { return handleError(res, err); }
  });

  app.delete("/api/assets/:id", async (req: Request, res: Response) => {
    try {
      const ok = await storage.deleteAsset(req.params.id);
      if (!ok) return res.status(404).json({ message: "Asset not found" });
      return res.status(204).end();
    } catch (err) { return handleError(res, err); }
  });

  // ─── Employee Assets ─────────────────────────────────────────────────────────
  app.get("/api/employee-assets", async (req: Request, res: Response) => {
    try {
      const { workforceId, status, assetId } = req.query as { workforceId?: string; status?: string; assetId?: string };
      const rows = await storage.getEmployeeAssets({ workforceId, status, assetId });
      return res.json(rows);
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/employee-assets", async (req: Request, res: Response) => {
    try {
      const data = insertEmployeeAssetSchema.parse(req.body);
      const row = await storage.assignAsset(data);
      return res.status(201).json(row);
    } catch (err) { return handleError(res, err); }
  });

  app.get("/api/employee-assets/:id", async (req: Request, res: Response) => {
    try {
      const row = await storage.getEmployeeAsset(req.params.id);
      if (!row) return res.status(404).json({ message: "Assignment not found" });
      return res.json(row);
    } catch (err) { return handleError(res, err); }
  });

  app.patch("/api/employee-assets/:id", async (req: Request, res: Response) => {
    try {
      const existing = await storage.getEmployeeAsset(req.params.id);
      if (!existing) return res.status(404).json({ message: "Assignment not found" });
      const data = insertEmployeeAssetSchema.partial().parse(req.body);
      const row = await storage.updateEmployeeAsset(req.params.id, data);
      return res.json(row);
    } catch (err) { return handleError(res, err); }
  });

  app.delete("/api/employee-assets/:id", async (req: Request, res: Response) => {
    try {
      const ok = await storage.deleteEmployeeAsset(req.params.id);
      if (!ok) return res.status(404).json({ message: "Assignment not found" });
      return res.status(204).end();
    } catch (err) { return handleError(res, err); }
  });

  app.get("/api/employee-assets/worker/:workforceId/unreturned", async (req: Request, res: Response) => {
    try {
      const rows = await storage.getUnreturnedAssetsForWorker(req.params.workforceId);
      return res.json(rows);
    } catch (err) { return handleError(res, err); }
  });

  return httpServer;
}
