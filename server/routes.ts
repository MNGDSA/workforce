import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { getAuthenticatedUser, listUserRepos, getRepo, listRepoIssues, listRepoPullRequests } from "./github";
import {
  insertCandidateSchema,
  insertSeasonSchema,
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
  candidateQuerySchema,
} from "@shared/schema";
import { validatePluginConfig, sendSmsViaPlugin } from "./sms-sender";
import { z } from "zod";
import bcrypt from "bcryptjs";

function handleError(res: Response, err: unknown) {
  console.error(err);
  if (err instanceof z.ZodError) {
    return res.status(400).json({ message: "Validation error", errors: err.errors });
  }
  const message = err instanceof Error ? err.message : "Internal server error";
  return res.status(500).json({ message });
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

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

      // For candidate users, also return their candidate record
      let candidate = null;
      if (user.role === "candidate" && user.nationalId) {
        const found = await storage.getCandidates({ page: 1, limit: 1, search: user.nationalId, sortBy: "createdAt", sortOrder: "desc" });
        candidate = found.data?.[0] ?? null;
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

      // Create user account
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

      // Generate a unique candidate code: CND-<last6ofNationalId>-<timestamp>
      const ts = Date.now().toString(36).toUpperCase().slice(-4);
      const candidateCode = `CND-${nationalId.trim().slice(-6)}-${ts}`;

      // Create corresponding candidate record in the talent pool
      const candidate = await storage.createCandidate({
        candidateCode,
        fullNameEn: fullName.trim(),
        phone: normalizedPhone,
        nationalId: nationalId.trim(),
        email: syntheticEmail,
        status: "active",
        experienceYears: 0,
        country: "SA",
      });

      // Consume the OTP so it cannot be reused
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
      const user = candidate.nationalId
        ? await storage.getUserByNationalId(candidate.nationalId)
        : undefined;
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

  app.get("/api/candidates/export", async (req: Request, res: Response) => {
    try {
      const allRows: any[] = [];
      let page = 1;
      const batchSize = 1000;
      while (true) {
        const query = candidateQuerySchema.parse({ ...req.query, page, limit: batchSize });
        const result = await storage.getCandidates(query);
        allRows.push(...result.data);
        if (allRows.length >= result.total || result.data.length < batchSize) break;
        page++;
      }
      const headers = ["ID", "Candidate Code", "Full Name (EN)", "Full Name (AR)", "Classification", "Status", "Phone", "Email", "City", "Nationality", "National ID", "IBAN", "Gender", "Date of Birth", "Created At"];
      const rows = allRows.map((r: any) => [
        r.id, r.candidateCode, r.fullNameEn || "", r.fullNameAr || "",
        r.source || "individual", r.status, r.phone || "", r.email || "",
        r.city || "", r.nationality || "", r.nationalId || "",
        r.ibanNumber || "", r.gender || "", r.dateOfBirth || "", r.createdAt ? new Date(r.createdAt).toISOString().slice(0, 10) : ""
      ]);
      return res.json({ headers, rows, total: allRows.length });
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
      const candidate = await storage.createCandidate(data);
      return res.status(201).json(candidate);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.patch("/api/candidates/:id", async (req: Request, res: Response) => {
    try {
      const data = insertCandidateSchema.partial().parse(req.body);
      const candidate = await storage.updateCandidate(req.params.id, data);
      if (!candidate) return res.status(404).json({ message: "Candidate not found" });
      return res.json(candidate);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.delete("/api/candidates/:id", async (req: Request, res: Response) => {
    try {
      const deleted = await storage.deleteCandidate(req.params.id);
      if (!deleted) return res.status(404).json({ message: "Candidate not found" });
      return res.status(204).send();
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
      if (rawCandidates.length > 70000) {
        return res.status(400).json({ message: "Maximum 70,000 candidates per bulk upload" });
      }
      const errors: { row: number; message: string }[] = [];
      const validated: any[] = [];
      for (let i = 0; i < rawCandidates.length; i++) {
        try {
          validated.push(insertCandidateSchema.parse(rawCandidates[i]));
        } catch (e) {
          errors.push({ row: i + 1, message: e instanceof z.ZodError ? e.errors.map(er => `${er.path.join(".")}: ${er.message}`).join("; ") : "invalid" });
        }
      }
      if (errors.length > 0) {
        return res.status(400).json({ message: `Validation failed on ${errors.length} rows`, errors: errors.slice(0, 20) });
      }
      const inserted = await storage.bulkInsertCandidates(validated);
      return res.status(201).json({ inserted, total: rawCandidates.length });
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ─── Seasons ─────────────────────────────────────────────────────────────
  app.get("/api/seasons", async (_req: Request, res: Response) => {
    try {
      const data = await storage.getSeasons();
      return res.json(data);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.get("/api/seasons/:id", async (req: Request, res: Response) => {
    try {
      const season = await storage.getSeason(req.params.id);
      if (!season) return res.status(404).json({ message: "Season not found" });
      return res.json(season);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.post("/api/seasons", async (req: Request, res: Response) => {
    try {
      const data = insertSeasonSchema.parse(req.body);
      const season = await storage.createSeason(data);
      return res.status(201).json(season);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.patch("/api/seasons/:id", async (req: Request, res: Response) => {
    try {
      const data = insertSeasonSchema.partial().parse(req.body);
      const season = await storage.updateSeason(req.params.id, data);
      if (!season) return res.status(404).json({ message: "Season not found" });
      return res.json(season);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.delete("/api/seasons/:id", async (req: Request, res: Response) => {
    try {
      const jobCount = await storage.countJobPostingsBySeason(req.params.id);
      if (jobCount > 0) {
        return res.status(409).json({
          message: `Cannot delete this season — it has ${jobCount} job posting${jobCount === 1 ? "" : "s"} linked to it. Remove or re-assign those job postings first, or archive the season instead.`,
        });
      }
      const deleted = await storage.deleteSeason(req.params.id);
      if (!deleted) return res.status(404).json({ message: "Season not found" });
      return res.status(204).send();
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ─── Job Postings ─────────────────────────────────────────────────────────
  app.get("/api/jobs", async (req: Request, res: Response) => {
    try {
      const { status, seasonId } = req.query as Record<string, string>;
      const data = await storage.getJobPostings({ status, seasonId });
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

  app.delete("/api/jobs/:id", async (req: Request, res: Response) => {
    try {
      const deleted = await storage.deleteJobPosting(req.params.id);
      if (!deleted) return res.status(404).json({ message: "Job not found" });
      return res.status(204).send();
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
      const { status, candidateId } = req.query as Record<string, string>;
      const data = await storage.getInterviews({ status, candidateId });
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
      const { status, seasonId } = req.query as Record<string, string>;
      const records = await storage.getOnboardingRecords({ status, seasonId });
      return res.json(records);
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
      const record = await storage.createOnboardingRecord(data);
      return res.status(201).json(record);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.patch("/api/onboarding/:id", async (req: Request, res: Response) => {
    try {
      const data = insertOnboardingSchema.partial().parse(req.body);
      // Auto-compute status
      if (data.hasPhoto !== undefined || data.hasIban !== undefined || data.hasNationalId !== undefined ||
          data.hasMedicalFitness !== undefined || data.hasSignedContract !== undefined || data.hasEmergencyContact !== undefined) {
        const current = await storage.getOnboardingRecord(req.params.id);
        if (current && current.status !== "converted" && current.status !== "rejected") {
          const merged = { ...current, ...data };
          const allDone = merged.hasPhoto && merged.hasIban && merged.hasNationalId &&
                          merged.hasMedicalFitness && merged.hasSignedContract && merged.hasEmergencyContact;
          const anyDone = merged.hasPhoto || merged.hasIban || merged.hasNationalId ||
                          merged.hasMedicalFitness || merged.hasSignedContract || merged.hasEmergencyContact;
          data.status = allDone ? "ready" : anyDone ? "in_progress" : "pending";
        }
      }
      const record = await storage.updateOnboardingRecord(req.params.id, data);
      if (!record) return res.status(404).json({ message: "Onboarding record not found" });
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
      const { position, department, startDate, salary, seasonId } = req.body as Record<string, string>;
      if (!position || !startDate) return res.status(400).json({ message: "position and startDate are required" });
      const workforce = await storage.convertOnboardingToEmployee(
        req.params.id,
        { position, department, startDate, salary, seasonId },
        (req as any).userId,
      );
      return res.status(201).json(workforce);
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ─── Workforce ────────────────────────────────────────────────────────────
  app.get("/api/workforce", async (req: Request, res: Response) => {
    try {
      const { seasonId, isActive } = req.query as Record<string, string>;
      const data = await storage.getWorkforce({
        seasonId,
        isActive: isActive !== undefined ? isActive === "true" : undefined,
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

  app.post("/api/workforce", async (req: Request, res: Response) => {
    try {
      const data = insertWorkforceSchema.parse(req.body);
      const record = await storage.createWorkforceRecord(data);
      return res.status(201).json(record);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.patch("/api/workforce/:id", async (req: Request, res: Response) => {
    try {
      const data = insertWorkforceSchema.partial().parse(req.body);
      const record = await storage.updateWorkforceRecord(req.params.id, data);
      if (!record) return res.status(404).json({ message: "Record not found" });
      return res.json(record);
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

  return httpServer;
}
