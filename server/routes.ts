import type { Express, Request as ExpressRequest, Response } from "express";

// Narrow Request typing for this module: routes.ts defines all our REST
// handlers and never relies on `:foo*` style array params or repeated
// query keys. Casting `req.params` and `req.query` away from
// Express's permissive `string | string[]` defaults keeps each handler
// free of `String(req.params.id)` boilerplate while remaining a faithful
// reflection of how the API is actually exercised in production.
type Request = ExpressRequest<
  Record<string, string>,
  any,
  any,
  Record<string, string | undefined>
>;
import { createServer, type Server } from "http";
import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { storage, createInboxItem } from "./storage";
import { db } from "./db";
import { tr } from "./i18n";
import { saPhoneSchema, patchSaPhoneSchema, normalizeSaPhone } from "@shared/phone";
// Task #133 — IBAN write-time helpers consolidated. The pure auto-fill
// wrapper `applyIbanBankResolution` (formerly in
// `./lib/candidate-iban-resolution`, now deleted) was replaced by the
// canonical `applyServerIbanFields` from `./lib/iban`, imported below.
// One source of truth handles format/checksum validation,
// canonicalisation, SARIE bank auto-fill, and `hasIban` mirroring at
// every IBAN write endpoint. Wiring pinned by
// `server/__tests__/candidate-iban-resolution.test.ts`; unit-level
// behaviour by `server/__tests__/iban.test.ts`.
import { uploadFile, deleteFile, getMimeType, getFileBuffer, overwriteFile } from "./file-storage";
import { persistRotationRescue } from "./lib/photo-rotation";
import { createUploadDocumentsHandler } from "./lib/photo-upload-handler";
import { getClientIp } from "./client-ip";
import { getAuthenticatedUser, listUserRepos, getRepo, listRepoIssues, listRepoPullRequests } from "./github";
import {
  inboxItems,
  insertCandidateSchema,
  candidateBaseSchema,
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
  insertSMPCompanySchema,
  insertSMPDocumentSchema,
  insertQuestionSetSchema,
  insertContractTemplateSchema,
  candidateQuerySchema,
  type CandidateQuery,
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
  insertGeofenceZoneSchema,
  insertDepartmentSchema,
  insertPositionSchema,
  photoChangeRequests,
  departments,
  positions,
  workforce,
  candidates,
  payRunLines,
  payrollTransactions,
  attendanceRecords,
  attendanceSubmissions,
  otpVerifications,
  users,
  auditLogs,
  type InsertPayrollAdjustment,
} from "@shared/schema";
import { eq, and, sql, desc, inArray, count, isNull } from "drizzle-orm";
import { validatePluginConfig, sendSmsViaPlugin } from "./sms-sender";
import { logOtpForDev, peekLatestDevOtp, isDevOtpGateOpen } from "./dev-otp-log";
import { trL, type ServerLocale } from "./i18n";
import { validateFaceQuality } from "./rekognition";
import {
  recordRekognitionFallback,
  getRekognitionFallbackSummary,
  decideRekognitionFallbackAction,
} from "./rekognition-telemetry";
// Task #166 — sibling counter to the rekognition-fallback ring buffer:
// rolls up rotation-rescue persist outcomes (persisted_90 /
// persisted_-90 / persist_failed) so admins can verify the auto-
// rotation is firing and that S3 writes are succeeding.
import {
  recordRotationRescueOutcome,
  getRotationRescueSummary,
} from "./rotation-rescue-telemetry";
// Task #216 — rolling counter for the silent rollback path inside the
// onboarding-reminder engine's `claimAndEnqueueReminder`. A non-zero
// `lastHour` count is the early signal that the sweep is firing twice
// or that crash-recovery is replaying the same dedupeKey.
import { getReminderRollbackSummary } from "./reminder-rollback-telemetry";
import XLSX from "xlsx";

// Auth token signing/verification is centralized in `./auth-token` so this
// module and `auth-middleware.ts` cannot drift on the secret.
import { signAuthToken, verifyAuthToken } from "./auth-token";
// Task #85 — canonical mobile error codes + HMAC submission tokens.
import { MobileErrorCodes, mobileError } from "./lib/mobile-error-codes";
import { IbanValidationError, IbanHolderNameValidationError, applyServerIbanFields } from "./lib/iban";
import {
  issueSubmissionToken,
  verifySubmissionToken,
  signServerTime,
} from "./lib/submission-token";
import {
  verifyAttendanceIntegrityToken,
  computeAttendanceNonceHex,
} from "./play-integrity";

function getAuthUserId(req: Request): string | null {
  const cookie = req.headers.cookie;
  const cookieMatch = cookie ? cookie.match(/wf_auth=([^;]+)/) : null;
  if (cookieMatch) return verifyAuthToken(cookieMatch[1])?.uid ?? null;
  const authHeader = req.headers.authorization;
  const bearerMatch = authHeader ? authHeader.match(/^Bearer\s+(.+)$/i) : null;
  if (bearerMatch) return verifyAuthToken(bearerMatch[1].trim())?.uid ?? null;
  return null;
}

const userActiveCache = new Map<string, { isActive: boolean; ts: number }>();
const USER_ACTIVE_CACHE_TTL = 60_000;

type UserActiveResult = "active" | "disabled" | "missing";

async function isUserActive(userId: string): Promise<UserActiveResult> {
  const cached = userActiveCache.get(userId);
  if (cached && Date.now() - cached.ts < USER_ACTIVE_CACHE_TTL) {
    return cached.isActive ? "active" : "disabled";
  }
  const user = await storage.getUser(userId);
  if (!user) {
    userActiveCache.delete(userId);
    return "missing";
  }
  const active = user.isActive ?? false;
  userActiveCache.set(userId, { isActive: active, ts: Date.now() });
  return active ? "active" : "disabled";
}

function invalidateUserActiveCache(userId: string) {
  userActiveCache.delete(userId);
}

async function logAudit(req: Request, params: {
  action: string;
  entityType?: string;
  entityId?: string;
  employeeNumber?: string;
  subjectName?: string;
  description: string;
  metadata?: Record<string, any>;
}) {
  try {
    const actorId = (req as any).userId ?? null;
    let actorName = "System";
    if (actorId) {
      const user = await storage.getUser(actorId);
      if (user) actorName = (user as any).fullName ?? (user as any).username ?? "Unknown";
    }
    await storage.createAuditLog({ actorId, actorName, ...params });
  } catch (e) {
    console.error("[audit] Failed to log:", e);
  }
}

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
  if (candidate.classification !== "smp") {
    if (!candidate.ibanNumber) missing.push("IBAN Number");
  }
  return missing;
}
import { z } from "zod";
import bcrypt from "bcrypt";
import { requireAuth, requirePermission, requireOwnership, markPublic, invalidateRoleCache, getAuthKind } from "./auth-middleware";
import { checkLoginRateLimit, recordLoginFailure, recordLoginSuccess } from "./login-rate-limit";
import { checkOtpVerifyIp, recordOtpVerifyFailure, tryReserveOtpRequest, checkActivateIp, recordActivateFailure } from "./otp-throttle";
import "./otp-maintenance";
import { verifyOtpHash } from "./otp-hash";

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

const uploadXlsx = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if ([".xlsx", ".xls"].includes(ext)) cb(null, true);
    else cb(new Error(`Only .xlsx or .xls files are accepted here`));
  },
});

// Task #182 / #183 — normalize blank/whitespace-only string entries to
// null at the write boundary so every downstream consumer can rely on
// optional text columns being either a non-empty value or null. The
// helper and the per-model `*_BLANK_FIELDS` constants live in
// `./lib/normalize-blank-fields` so that
// `server/__tests__/normalize-blank-fields*.test.ts` (task #184) can
// import them without dragging in this file's full dependency graph
// (db, storage, auth, file storage, etc).
import {
  normalizeBlankFields,
  EVENT_BLANK_FIELDS,
  JOB_BLANK_FIELDS,
  SMP_COMPANY_BLANK_FIELDS,
  WORKFORCE_BLANK_FIELDS,
  APPLICATION_BLANK_FIELDS,
  CANDIDATE_BLANK_FIELDS,
  // Task #185 — the remaining inline blank-field lists were promoted
  // to named constants in `./lib/normalize-blank-fields` so the entire
  // per-model surface lives in one module and the wiring test can
  // assert on names instead of multi-line array literals.
  WORKFORCE_PROFILE_BLANK_FIELDS,
  PAYROLL_SETTLEMENT_BLANK_FIELDS,
  WORKFORCE_PAYMENT_METHOD_BLANK_FIELDS,
} from "./lib/normalize-blank-fields";

function handleError(res: Response, err: unknown, req?: Request) {
  console.error(err);
  // Task #120 — IBAN format failures bubble out of the storage layer
  // (last-line-of-defence canonicalisation). Surface them as 400 with
  // the same shape as our other validation responses so the Android
  // client and bulk importers behave consistently.
  if (err instanceof IbanValidationError) {
    return res.status(400).json({
      code: MobileErrorCodes.VALIDATION_FAILED,
      message: req ? tr(req, `iban.${err.reason}`) : err.message,
      errors: [{ path: ["ibanNumber"], message: err.message, reason: err.reason }],
    });
  }
  // Task #137 — server-side IBAN holder name (English-only) validation.
  if (err instanceof IbanHolderNameValidationError) {
    return res.status(400).json({
      code: MobileErrorCodes.VALIDATION_FAILED,
      message: req ? tr(req, `iban_holder_name.${err.reason}`) : err.message,
      errors: [{ path: [err.field], message: err.message, reason: err.reason, field: err.field }],
    });
  }
  if (err instanceof z.ZodError) {
    // Task #85: every error response on a mobile-consumed route must
    // include a stable `code` field so the Android client can route
    // on it. Validation errors are no exception — they map to the
    // canonical VALIDATION_FAILED code (see docs/api-error-codes.md).
    const message = req
      ? tr(req, "common.validation")
      : "Validation failed";
    return res.status(400).json({
      code: MobileErrorCodes.VALIDATION_FAILED,
      message,
      errors: err.errors,
    });
  }
  const message = err instanceof Error ? err.message : "Internal server error";
  return res.status(500).json({
    code: MobileErrorCodes.INTERNAL_ERROR,
    message,
  });
}

/**
 * PII-safe phone redactor for server logs. Keeps the country/operator prefix
 * and the last four digits — enough to triage support reports without writing
 * a full Saudi mobile number into rotated app logs (PDPL).
 *   05XXXXXXXX     -> 05••••6789
 *   +9665XXXXXXXXX -> +9665•••••6789
 */
function redactPhone(phone: string | null | undefined): string {
  if (!phone) return "<none>";
  const s = String(phone);
  if (s.length <= 6) return "•".repeat(s.length);
  return s.slice(0, 2) + "•".repeat(Math.max(0, s.length - 6)) + s.slice(-4);
}

/** PII-safe national-ID redactor — keeps last four digits only. */
function redactNationalId(nid: string | null | undefined): string {
  if (!nid) return "<none>";
  const s = String(nid);
  if (s.length <= 4) return "•".repeat(s.length);
  return "•".repeat(s.length - 4) + s.slice(-4);
}

// Task #209 — recruiters need to filter candidates by who has uploaded
// a driver's licence (catering vans / shuttles) or vaccination report
// (food handling / healthcare-adjacent roles). The corresponding
// boolean flags live on the candidate row but are NOT part of the
// shared `candidateQuerySchema` (the `shared/` folder is immutable per
// project policy), so we model them with a local type extension and
// merge them onto the parsed query object. Storage's
// `buildCandidateOtherConditions` reads them through the same type
// extension. Only accepts the literal string "true" so a stray
// `?hasDriversLicense=` (empty) URL param is a no-op.
type DocumentAvailabilityFlags = {
  hasDriversLicense?: "true";
  hasVaccinationReport?: "true";
};

function attachDocumentAvailabilityFlags<T extends Partial<CandidateQuery>>(
  parsed: T,
  raw: Request["query"],
): T & DocumentAvailabilityFlags {
  const enriched = parsed as T & DocumentAvailabilityFlags;
  if (raw.hasDriversLicense === "true") {
    enriched.hasDriversLicense = "true";
  }
  if (raw.hasVaccinationReport === "true") {
    enriched.hasVaccinationReport = "true";
  }
  return enriched;
}

/**
 * Authorization gate for candidate self-service endpoints (document upload,
 * document delete, etc.). Passes if (a) caller is admin/super_admin with
 * `candidates:update`, OR (b) caller is the candidate identified by
 * `candidateId`. Sends a 403 and returns false otherwise.
 */
async function assertCandidateOwnerOrAdmin(
  req: Request,
  res: Response,
  candidateId: string,
): Promise<boolean> {
  const isAdmin =
    req.authIsSuperAdmin === true ||
    req.authPermissions?.has("candidates:update") === true;
  if (isAdmin) return true;
  if (!req.authUserId) {
    res.status(401).json({ message: tr(req, "auth.required") });
    return false;
  }
  const myCand = await storage.getCandidateByUserId(req.authUserId);
  if (myCand && myCand.id === candidateId) return true;
  res.status(403).json({ message: tr(req, "common.accessDenied") });
  return false;
}

/**
 * Resolve the preferred locale for a candidate's outbound notifications.
 * Reads the linked user's `locale` column; falls back to project default.
 */
async function getCandidateLocale(
  candidateOrUserId: { userId?: string | null } | string | null | undefined,
  fallback: ServerLocale = "ar",
): Promise<ServerLocale> {
  try {
    const userId = typeof candidateOrUserId === "string"
      ? candidateOrUserId
      : candidateOrUserId?.userId ?? null;
    if (!userId) return fallback;
    const u = await storage.getUser(userId);
    const loc = (u as any)?.locale;
    return loc === "en" ? "en" : loc === "ar" ? "ar" : fallback;
  } catch {
    return fallback;
  }
}

function buildVariableSnapshot(candidate: any, template: any, ob: any): Record<string, string> {
  return {
    fullName: candidate.fullNameEn || "",
    nationalId: candidate.nationalId || "",
    phone: candidate.phone || "",
    iban: candidate.ibanNumber || "",
    startDate: ob.startDate || "",
    eventName: "",
    contractDate: new Date().toISOString().split("T")[0],
    companyName: template.companyName || "",
  };
}

// Single source of truth for the onboarding readiness state.
//
// When the candidate's actual file URLs are passed in via `candFiles`,
// document presence is derived from them — NOT from the boolean shadow
// flags on the onboarding record. The flags can drift, most notably
// because `applyServerIbanFields` flips `hasIban=true` when the candidate
// types in their IBAN *number*, even when no IBAN certificate file has
// been uploaded. That drift caused records like national-ID 1075054286
// (عبدالله العيسي) to be marked "ready to convert" while the checklist
// body correctly reported "Not yet submitted by candidate".
//
// When `candFiles` is omitted (back-compat for the legacy photo-upload
// handler call site and existing unit tests) the function falls back
// to the historical record-flag-only behaviour.
function computeOnboardingStatus(
  rec: { hasPhoto: boolean; hasIban: boolean; hasNationalId: boolean; hasVaccinationReport?: boolean; hasSignedContract?: boolean },
  isSmp: boolean,
  candFiles?: { photoUrl?: string | null; ibanFileUrl?: string | null; ibanNumber?: string | null; nationalIdFileUrl?: string | null; vaccinationReportFileUrl?: string | null } | null,
): "pending" | "in_progress" | "ready" {
  const hasPhotoFile = candFiles
    ? !!candFiles.photoUrl
    : rec.hasPhoto;
  const hasIbanFile = candFiles
    ? (!!candFiles.ibanFileUrl || (typeof candFiles.ibanNumber === "string" && candFiles.ibanNumber.startsWith("/uploads/")))
    : rec.hasIban;
  const hasNationalIdFile = candFiles
    ? !!candFiles.nationalIdFileUrl
    : rec.hasNationalId;
  // Vaccination report — fourth mandatory onboarding document. Applies
  // to BOTH individual and SMP candidates (workplace health requirement,
  // not a financial one like IBAN). Source of truth is the candidate's
  // file URL when provided, falling back to the record's shadow flag.
  const hasVaccinationReportFile = candFiles
    ? !!candFiles.vaccinationReportFileUrl
    : !!rec.hasVaccinationReport;
  if (isSmp) {
    const allDone = hasPhotoFile && hasNationalIdFile && hasVaccinationReportFile;
    const anyDone = hasPhotoFile || hasNationalIdFile || hasVaccinationReportFile;
    return allDone ? "ready" : anyDone ? "in_progress" : "pending";
  }
  const allDone = hasPhotoFile && hasIbanFile && hasNationalIdFile && hasVaccinationReportFile;
  const anyDone = hasPhotoFile || hasIbanFile || hasNationalIdFile || hasVaccinationReportFile;
  return allDone ? "ready" : anyDone ? "in_progress" : "pending";
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  const BOOT_TIME = Date.now();
  app.get("/api/health", async (_req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    const started = Date.now();
    let dbStatus: "ok" | "error" = "ok";
    let dbError: string | undefined;
    let dbLatencyMs = 0;
    try {
      await Promise.race([
        db.execute(sql`SELECT 1`),
        new Promise((_, reject) => setTimeout(() => reject(new Error("db ping timeout")), 2000)),
      ]);
      dbLatencyMs = Date.now() - started;
    } catch (err: any) {
      dbStatus = "error";
      dbError = err?.message || String(err);
    }
    const body = {
      status: dbStatus === "ok" ? "ok" : "degraded",
      db: dbStatus,
      ...(dbError ? { dbError } : {}),
      dbLatencyMs,
      uptimeSec: Math.round((Date.now() - BOOT_TIME) / 1000),
      env: process.env.NODE_ENV || "development",
      timestamp: new Date().toISOString(),
    };
    res.status(dbStatus === "ok" ? 200 : 503).json(body);
  });

  if (process.env.NODE_ENV !== "production") {
    app.use("/uploads", express.static(UPLOADS_DIR, {
      etag: true,
      lastModified: true,
      setHeaders: (res, filePath) => {
        const lower = filePath.toLowerCase();
        if (lower.endsWith(".pdf")) {
          res.setHeader("Content-Type", "application/pdf");
          res.setHeader("Content-Disposition", "inline");
        }
        const isImage = lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".png");
        if (isImage) {
          // Allow OkHttp / Coil disk cache to serve revalidated copies for ~24h.
          res.setHeader("Cache-Control", "private, max-age=86400, must-revalidate");
        }
        res.setHeader("X-Content-Type-Options", "nosniff");
      }
    }));
  } else {
    app.get("/uploads/:filename", (req: Request, res: Response) => {
      const spacesEndpoint = process.env.SPACES_ENDPOINT || "";
      const spacesBucket = process.env.SPACES_BUCKET || "";
      if (spacesEndpoint && spacesBucket) {
        return res.redirect(301, `https://${spacesBucket}.${spacesEndpoint}/uploads/${req.params.filename}`);
      }
      return res.status(404).json({ message: tr(req, "file.notFound") });
    });
  }

  app.use("/api", async (req: Request, res: Response, next) => {
    const url = req.originalUrl || req.path;
    const openPaths = ["/api/auth/"];
    const publicGetPaths = ["/api/settings/system"];
    const publicGetPatterns = [/^\/api\/jobs\/[0-9a-f-]{36}$/];
    const selfEnforcedPaths = ["/api/attendance-mobile/submit"];
    if (openPaths.some(p => url.startsWith(p)) || (req.method === "GET" && (publicGetPaths.some(p => url.startsWith(p)) || publicGetPatterns.some(re => re.test(url.split("?")[0])))) || selfEnforcedPaths.some(p => url.startsWith(p))) {
      return next();
    }
    const userId = getAuthUserId(req);
    if (!userId) return next();
    const status = await isUserActive(userId);
    if (status === "missing") {
      // Session points to a user that no longer exists (e.g. deleted/re-registered).
      // Force the client to clear the bad session and log in again.
      try { ((req as any).session)?.destroy?.(() => undefined); } catch {}
      const isProd = process.env.NODE_ENV === "production";
      res.clearCookie("wf_auth",     { path: "/", httpOnly: true, sameSite: "lax", secure: isProd });
      res.clearCookie("connect.sid", { path: "/", httpOnly: true, sameSite: "lax", secure: isProd });
      // Task #85: structured `code` for the Android client. Legacy
      // `sessionInvalid: true` retained for one release cycle.
      return res.status(401).json({
        code: MobileErrorCodes.SESSION_EXPIRED,
        message: tr(req, "auth.sessionExpired"),
        sessionInvalid: true,
      });
    }
    if (status === "disabled") {
      return mobileError(
        res,
        403,
        MobileErrorCodes.ACCOUNT_DISABLED,
        tr(req, "auth.accountDisabled"),
        {},
        true, // legacy `terminated: true` for old Android builds
      );
    }
    next();
  });

  // Task #85 step 6 — signed authoritative server time. Lets the
  // Android client periodically reconcile its NTP offset against an
  // authenticated reference, sidestepping the unauthenticated UDP NTP
  // attack surface (F-02). Authenticated so it cannot be used as an
  // anonymous oracle / time-pin probe.
  app.get("/api/time", requireAuth, async (_req: Request, res: Response) => {
    try {
      return res.json(signServerTime());
    } catch (err) {
      return handleError(res, err);
    }
  });

  // Task #108 (Workstream 1) — admin telemetry: how often the
  // photo-upload Rekognition fail-closed path has fired in the
  // trailing 24 hours. A non-zero `firstUploadBlocked` count is the
  // early signal that Rekognition is degraded and SMP activations
  // are bouncing — see docs/rd/01-rekognition-resilience.md.
  app.get("/api/admin/telemetry/rekognition-fallbacks", requirePermission("settings:read"), async (_req: Request, res: Response) => {
    res.json(getRekognitionFallbackSummary());
  });

  // Task #166 — admin telemetry: rotation-rescue persist outcomes
  // over the trailing 24 hours. Lets SRE answer:
  //   - "Is the auto-rotation actually firing?" (attempts > 0)
  //   - "Did a recent deploy regress it?" (rate suddenly drops to 0)
  //   - "Did an iOS update 10x our Rekognition spend?" (rate spikes)
  //   - "Are S3 writes failing silently?" (persistFailed > 0 with
  //     successful persists declining at the same time)
  // Returned shape: { windowHours, total, persisted90, persistedNeg90,
  // persistFailed, attempts, successRate, oldestAt, mostRecentAt }.
  app.get("/api/admin/telemetry/rotation-rescue", requirePermission("settings:read"), async (_req: Request, res: Response) => {
    res.json(getRotationRescueSummary());
  });

  // Task #216 — admin telemetry: how often the onboarding-reminder
  // engine's sentinel rollback path has fired. The sentinel branch
  // catches duplicate-send dedupeKey conflicts inside
  // `claimAndEnqueueReminder` and rolls the count-bump back atomically.
  // Under normal operation it is unreachable; a non-zero `lastHour`
  // value is the early signal that the hourly sweep is being triggered
  // twice in the same minute, that scheduler clock drift is replaying
  // a window, or that crash-recovery is re-attempting an already-sent
  // SMS slot. The companion alert (auto-fired when `lastHour` crosses
  // `alertThresholdPerHour`) appears in the admin bell inbox.
  // Returned shape: { windowHours, total, lastHour, alertThresholdPerHour,
  // lastAlertedAt, oldestAt, mostRecentAt }.
  app.get("/api/admin/telemetry/reminder-rollbacks", requirePermission("settings:read"), async (_req: Request, res: Response) => {
    res.json(getReminderRollbackSummary());
  });

  app.get("/api/ntp-health", requirePermission("system:ntp_check"), async (req: Request, res: Response) => {
    try {
      const server = (req.query.server as string) || "time.google.com";
      const hostnameRegex = /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$/;
      if (!hostnameRegex.test(server) || server.length > 253) {
        return res.status(400).json({ reachable: false, server, detail: tr(req, "ntp.invalidHostname") });
      }
      const blockedPatterns = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|0\.|169\.254\.|::1|fc00|fd00|fe80)/i;
      if (blockedPatterns.test(server)) {
        return res.status(400).json({ reachable: false, server, detail: tr(req, "ntp.internalAddressBlocked") });
      }

      const dgram = await import("dgram");
      const dns = await import("dns");
      const { promisify } = await import("util");
      const resolve = promisify(dns.resolve);

      let resolvedAddresses: string[];
      try {
        resolvedAddresses = await resolve(server);
      } catch {
        return res.json({ reachable: false, server, detail: tr(req, "ntp.dnsResolutionFailed") });
      }
      const privateIpRegex = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|0\.|169\.254\.)/;
      if (resolvedAddresses.some((addr: string) => privateIpRegex.test(addr))) {
        return res.status(400).json({ reachable: false, server, detail: tr(req, "ntp.resolvesToInternal") });
      }

      const ntpProbe = (): Promise<boolean> => new Promise((ok) => {
        const socket = dgram.createSocket("udp4");
        const timeout = setTimeout(() => { socket.close(); ok(false); }, 4000);
        const buf = Buffer.alloc(48);
        buf[0] = 0x1B;
        socket.send(buf, 0, 48, 123, server, (err) => {
          if (err) { clearTimeout(timeout); socket.close(); ok(false); }
        });
        socket.on("message", () => { clearTimeout(timeout); socket.close(); ok(true); });
        socket.on("error", () => { clearTimeout(timeout); socket.close(); ok(false); });
      });

      const reachable = await ntpProbe();
      return res.json({ reachable, server });
    } catch (err) {
      return res.json({ reachable: false });
    }
  });

  app.get("/api/config/mobile", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = getAuthUserId(req);
      if (!userId) {
        return res.status(401).json({ message: tr(req, "auth.required") });
      }
      const [ntpUrl, orgTz, configVer] = await Promise.all([
        storage.getSystemSetting("ntp_server_url"),
        storage.getSystemSetting("organization_timezone"),
        storage.getSystemSetting("config_version"),
      ]);
      return res.json({
        ntp_server_url: ntpUrl ?? "time.google.com",
        organization_timezone: orgTz ?? "Asia/Riyadh",
        config_version: parseInt(configVer ?? "1", 10),
      });
    } catch (err) {
      return res.status(500).json({ message: tr(req, "auth.configFetchFailed") });
    }
  });

  // ─── Authenticated File Proxy ──────────────────────────────────────────────
  // Serves private candidate documents (national_id, iban, resume) from DO Spaces
  // through an authenticated, authorization-checked proxy. Photos remain
  // public-read on Spaces and use direct URLs.
  app.get(/^\/api\/files\/(uploads\/.+)$/, requireAuth, async (req: Request, res: Response) => {
    try {
      const key = (req.params as any)[0] as string;
      if (!key || key.includes("..")) return res.status(400).json({ message: tr(req, "file.invalidPath") });

      const spacesBucket = process.env.SPACES_BUCKET || "";
      const spacesEndpoint = process.env.SPACES_ENDPOINT || "";
      const candidateUrls = [
        `https://${spacesBucket}.${spacesEndpoint}/${key}`,
        `/${key}`, // dev fallback path stored as `/uploads/xxx`
      ];

      let owner;
      for (const u of candidateUrls) {
        owner = await storage.getCandidateByFileUrl(u);
        if (owner) break;
      }
      if (!owner) return res.status(404).json({ message: tr(req, "file.notFound") });

      const isAdmin =
        req.authIsSuperAdmin ||
        req.authPermissions?.has("candidates:read");
      const isOwner = owner.userId === req.authUserId;
      if (!isAdmin && !isOwner) {
        return res.status(403).json({ message: tr(req, "file.noPermission") });
      }

      const buffer = await getFileBuffer(candidateUrls[0]);
      res.setHeader("Content-Type", getMimeType(key));
      res.setHeader("Cache-Control", "private, max-age=300");
      return res.send(buffer);
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ─── Document Upload ───────────────────────────────────────────────────────
  // Task #161 — handler body lives in `./lib/photo-upload-handler` so it can
  // be exercised by a route-level test harness with stub deps (no AWS,
  // no DB, no auth gateway). Keep the route definition itself here so
  // the URL → middleware chain stays grep-able.
  //
  // Task #155 / #161 — when the rotation rescue's rotated bytes were
  // successfully persisted to S3, the response carries a top-level
  // `rotationApplied: 90 | -90` field so the candidate portal can show
  // a confirmation toast and re-open the cropper with the saved
  // upright copy. We surface it as a top-level field rather than
  // letting the client read it off `qualityResult.rotationApplied`
  // because the qualityResult buffer is stripped before send — the
  // buffer would balloon the JSON response by ~100KB for no
  // client-side benefit.
  const uploadDocumentsHandler = createUploadDocumentsHandler({
    storage,
    uploadFile,
    deleteFile,
    overwriteFile,
    getMimeType,
    validateFaceQuality,
    decideRekognitionFallbackAction,
    recordRekognitionFallback,
    persistRotationRescue,
    recordRotationRescueOutcome,
    tr,
    assertCandidateOwnerOrAdmin,
    handleError,
    computeOnboardingStatus,
    supersedePendingPhotoChanges: async (candidateId: string) => {
      const olderPending = await db.select({ id: photoChangeRequests.id })
        .from(photoChangeRequests)
        .where(and(
          eq(photoChangeRequests.candidateId, candidateId),
          eq(photoChangeRequests.status, "pending"),
        ));
      for (const old of olderPending) {
        await storage.updatePhotoChangeRequest(old.id, {
          status: "rejected",
          reviewedAt: new Date(),
          reviewNotes: "Superseded by a newer photo submission",
        });
        await db.update(inboxItems)
          .set({ status: "resolved", resolvedAt: new Date(), resolutionNotes: "Superseded by a newer photo submission" })
          .where(and(eq(inboxItems.entityType, "photo_change_request"), eq(inboxItems.entityId, old.id), eq(inboxItems.status, "pending")));
      }
    },
    createPhotoChangeInboxItem: async ({ candidate, activeRecord, changeRequest, fileUrl, candidateId }) => {
      await createInboxItem(
        "photo_change_request",
        `Photo change request — ${candidate.fullNameEn ?? "Unknown"}`,
        `Employee has submitted a new profile photo for review. The previous photo remains active until this request is approved.`,
        {
          candidateId,
          changeRequestId: changeRequest.id,
          candidateName: candidate.fullNameEn,
          employeeNumber: activeRecord!.employeeNumber ?? null,
          newPhotoUrl: fileUrl,
          previousPhotoUrl: candidate.photoUrl,
        },
        "high",
        { entityType: "photo_change_request", entityId: changeRequest.id }
      );
    },
  });
  app.post("/api/candidates/:id/documents", requireAuth, upload.single("file"), uploadDocumentsHandler);

  // ─── Document Deletion ───────────────────────────────────────────────────
  app.delete("/api/candidates/:id/documents/:docType", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id, docType } = req.params;
      // Same IDOR fix as the upload endpoint above — admin OR self only.
      if (!(await assertCandidateOwnerOrAdmin(req, res, id))) return;
      if (!["photo", "nationalId", "iban", "driversLicense", "vaccinationReport"].includes(docType)) {
        return res.status(400).json({ message: tr(req, "file.invalidDocTypeShort") });
      }
      const candidate = await storage.getCandidate(id);
      if (!candidate) return res.status(404).json({ message: tr(req, "candidate.notFound") });
      const fileUrlMap: Record<string, string | null | undefined> = {
        photo: candidate.photoUrl,
        nationalId: candidate.nationalIdFileUrl,
        iban: candidate.ibanFileUrl,
        driversLicense: candidate.driversLicenseFileUrl,
        vaccinationReport: candidate.vaccinationReportFileUrl,
      };
      const oldFileUrl = fileUrlMap[docType];
      if (oldFileUrl) {
        deleteFile(oldFileUrl).catch(() => {});
      }
      const updatePayload: Record<string, any> = {};
      if (docType === "photo") { updatePayload.photoUrl = null; updatePayload.hasPhoto = false; }
      if (docType === "nationalId") { updatePayload.nationalIdFileUrl = null; updatePayload.hasNationalId = false; }
      if (docType === "iban") { updatePayload.ibanFileUrl = null; updatePayload.hasIban = false; }
      if (docType === "driversLicense") { updatePayload.driversLicenseFileUrl = null; updatePayload.hasDriversLicense = false; }
      if (docType === "vaccinationReport") { updatePayload.vaccinationReportFileUrl = null; updatePayload.hasVaccinationReport = false; }
      const updated = await storage.updateCandidate(id, updatePayload);
      if (!updated) return res.status(404).json({ message: tr(req, "candidate.notFound") });
      const onboardingRecordsDel = await storage.getOnboardingRecords({ candidateId: id });
      for (const rec of onboardingRecordsDel) {
        if (rec.status === "converted" || rec.status === "rejected" || rec.status === "terminated") continue;
        // Derive SMP status from onboarding linkage (applicationId === null = SMP pipeline)
        const isSmpRec = !rec.applicationId;
        const syncPayload: Record<string, any> = {};
        if (docType === "photo") syncPayload.hasPhoto = false;
        if (docType === "nationalId") syncPayload.hasNationalId = false;
        if (docType === "iban") syncPayload.hasIban = false;
        if (docType === "vaccinationReport") syncPayload.hasVaccinationReport = false;
        if (Object.keys(syncPayload).length > 0) {
          const merged = { ...rec, ...syncPayload };
          syncPayload.status = computeOnboardingStatus(merged, isSmpRec);
          await storage.updateOnboardingRecord(rec.id, syncPayload);
        }
      }
      if (updated.phone) {
        const smsPlugin = await storage.getActiveSmsPlugin();
        if (smsPlugin) {
          const recipientLocale = await getCandidateLocale(updated);
          const docLabelKey = docType === "photo" ? "doc.label.photo"
            : docType === "nationalId" ? "doc.label.nationalId"
            : docType === "iban" ? "doc.label.iban"
            : docType === "driversLicense" ? "doc.label.driversLicense"
            : docType === "vaccinationReport" ? "doc.label.vaccinationReport"
            : "doc.label.document";
          const docLabel = trL(recipientLocale, docLabelKey);
          const smsMsg = trL(recipientLocale, "sms.docRejected", { docLabel });
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
  app.get("/api/me", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = getAuthUserId(req);
      // Dev fallback: if no cookie, return admin so legacy local dev still works.
      const user = userId
        ? await storage.getUser(userId)
        : await storage.getUserByUsername("admin");
      if (!user) return res.status(404).json({ message: tr(req, "candidate.profile.userNotFound") });

      // Resolve effective role + permissions from the RBAC tables.
      let roleSlug: string | null = null;
      let permissions: string[] = [];
      let isSuperAdmin = false;
      const roleId = (user as any).roleId as string | null | undefined;
      if (roleId) {
        const role = await storage.getRole(roleId);
        if (role) {
          roleSlug = role.slug;
          isSuperAdmin = role.slug === "super_admin";
          const eff = await storage.getEffectivePermissionsForRole(roleId);
          permissions = eff.keys;
        }
      }
      const { password: _pw, ...safe } = user as any;
      return res.json({
        ...safe,
        role: roleSlug,
        roleId: roleId ?? null,
        isSuperAdmin,
        permissions,
      });
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ─── Dev-only OTP peek ────────────────────────────────────────────────────
  // Returns the latest plaintext OTP for a phone, used by e2e tests and the
  // load-test script. Gated by the SAME allow-list as logOtpForDev — fails
  // closed in any environment that isn't NODE_ENV=development|test (or has the
  // explicit ENABLE_DEV_OTP_LOG=true override). Production returns 404 so the
  // route's existence is not even discoverable.
  app.get("/api/_dev/last-otp/:phone", markPublic, (req: Request, res: Response) => {
    if (!isDevOtpGateOpen()) {
      return res.status(404).json({ message: "Not found" });
    }
    const phone = String(req.params.phone || "").trim();
    if (!phone) return res.status(400).json({ message: "phone required" });
    const entry = peekLatestDevOtp(phone);
    if (!entry) return res.status(404).json({ message: "No OTP on record" });
    return res.json({ phone, ...entry });
  });

  // ─── Auth ─────────────────────────────────────────────────────────────────
  // Persist the active UI locale on the authenticated user. Public-safe:
  // unauthenticated callers receive 204 (the client persists locally too).
  app.post("/api/auth/locale", markPublic, async (req: Request, res: Response) => {
    try {
      const locale = String(req.body?.locale || "").toLowerCase();
      if (locale !== "ar" && locale !== "en") {
        return res.status(400).json({ message: tr(req, "candidate.profile.invalidLocale") });
      }
      const userId = (req as any).session?.userId as string | undefined;
      if (!userId) return res.status(204).end();
      await db.update(users).set({ locale, updatedAt: new Date() }).where(eq(users.id, userId));
      res.json({ ok: true, locale });
    } catch (err) {
      console.error("[locale] update failed", err);
      res.status(500).json({ message: tr(req, "candidate.profile.localeFailed") });
    }
  });

  // Destroy server session + clear BOTH auth cookies. Public so logged-out
  // clients can call it idempotently. The active auth cookie is `wf_auth`
  // (HMAC token, see /api/auth/login below); `connect.sid` is the legacy
  // express-session cookie kept around for one release cycle. Attributes
  // here MUST mirror the ones used at set-time, otherwise the browser
  // ignores the clear directive and the user stays logged in for up to
  // 7 days.
  app.post("/api/auth/logout", markPublic, async (req: Request, res: Response) => {
    // 1. Server-side revocation, scoped to the TRANSPORT that called us.
    //    Web logout (cookie) bumps web_tokens_invalidated_at only.
    //    Mobile logout (Bearer) bumps mobile_tokens_invalidated_at only.
    //    This is critical: the 7-day wf_auth TTL was deliberately chosen
    //    so Android attendance devices don't have to re-auth daily during
    //    Hajj/Ramadan field deployments. A web sign-out must not kick a
    //    field worker's phone offline mid-shift.
    const userId = getAuthUserId(req);
    const kind = getAuthKind(req); // "web" | "mobile" | null
    if (userId && kind) {
      try {
        const now = new Date();
        const patch =
          kind === "web"
            ? { webTokensInvalidatedAt: now, updatedAt: now }
            : { mobileTokensInvalidatedAt: now, updatedAt: now };
        await db.update(users).set(patch).where(eq(users.id, userId));
      } catch (e) {
        console.error("[logout] failed to bump revocation column", e);
      }
    }
    // 2. Destroy the legacy express-session if present.
    try { ((req as any).session)?.destroy?.(() => undefined); } catch {}
    // 3. Tell the browser to drop both cookies (web logouts only need
    //    this — mobile clients don't store cookies — but it's harmless
    //    on a Bearer-only request and keeps the response idempotent).
    const isProd = process.env.NODE_ENV === "production";
    res.clearCookie("wf_auth",     { path: "/", httpOnly: true, sameSite: "lax", secure: isProd });
    res.clearCookie("connect.sid", { path: "/", httpOnly: true, sameSite: "lax", secure: isProd });
    return res.json({ ok: true, kind });
  });

  app.post("/api/auth/login", markPublic, async (req: Request, res: Response) => {
    try {
      const { identifier, password } = req.body;
      if (!identifier || !password) {
        return mobileError(res, 400, MobileErrorCodes.REQUIRED_FIELDS, tr(req, "auth.loginCreds"));
      }

      const rl = await checkLoginRateLimit(req, identifier);
      if (!rl.allowed) {
        res.setHeader("Retry-After", String(rl.retryAfterSec));
        const minutes = Math.ceil(rl.retryAfterSec / 60);
        return mobileError(
          res, 429, MobileErrorCodes.RATE_LIMITED,
          tr(req, "auth.loginRateLimit", { minutes }),
          { retryAfterSec: rl.retryAfterSec },
        );
      }

      const clean = String(identifier).trim();

      // Single-query identifier resolution (was 4 sequential roundtrips).
      const user = await storage.getUserByAnyIdentifier(clean);

      if (!user) {
        recordLoginFailure(req, identifier);
        return mobileError(res, 401, MobileErrorCodes.AUTH_INVALID, tr(req, "auth.invalidCreds"));
      }

      if (!user.isActive) {
        return mobileError(res, 403, MobileErrorCodes.ACCOUNT_DISABLED, tr(req, "auth.accountDisabled"));
      }

      // Native bcrypt — releases the event loop to libuv thread pool.
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        recordLoginFailure(req, identifier);
        return mobileError(res, 401, MobileErrorCodes.AUTH_INVALID, tr(req, "auth.invalidCreds"));
      }

      recordLoginSuccess(req, identifier);

      const { password: _, ...safeUser } = user;

      // Critical-path lookup: only fetch role + candidate once for the response shape.
      let candidate = null;
      const loginRole = user.roleId ? await storage.getRole(user.roleId) : null;
      const isCandidate = loginRole?.slug === "candidate";
      if (isCandidate) {
        candidate = await storage.getCandidateByUserId(user.id) ?? null;
        if (!candidate && user.nationalId) {
          candidate = await storage.getCandidateByNationalId(user.nationalId) ?? null;
        }
      }

      const token = signAuthToken(user.id);
      const securFlag = process.env.NODE_ENV === "production" ? "; Secure" : "";
      res.setHeader("Set-Cookie", `wf_auth=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}${securFlag}`);

      // Reflect optimistic candidate updates into the response body so the UI
      // sees the new lastLoginAt / status immediately, while the actual DB
      // writes happen after the response is sent (deferred — see setImmediate
      // below). This trims ~3 DB round-trips off the login critical path.
      if (candidate) {
        const newStatus = candidate.status !== "blocked" && candidate.status !== "hired"
          ? "available"
          : candidate.status;
        candidate.lastLoginAt = new Date();
        if (newStatus !== candidate.status) candidate.status = newStatus as any;
      }

      const response = res.json({ user: { ...safeUser, role: loginRole?.slug ?? null }, candidate });

      // Fire-and-forget post-login bookkeeping. Failures do not affect login.
      const userId = user.id;
      const candForDefer = candidate;
      setImmediate(async () => {
        try {
          await storage.updateUser(userId, { lastLogin: new Date() } as any);
          if (candForDefer) {
            const updateFields: Record<string, any> = { lastLoginAt: new Date() };
            if (!candForDefer.userId) updateFields.userId = userId;
            if (candForDefer.status !== "blocked" && candForDefer.status !== "hired") {
              updateFields.status = "available";
            }
            await storage.updateCandidate(candForDefer.id, updateFields);
          }
        } catch (e) {
          console.error("[login] deferred post-login update failed:", e);
        }
      });

      return response;
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ─── OTP: Request code ─────────────────────────────────────────────────────
  app.post("/api/auth/otp/request", markPublic, async (req: Request, res: Response) => {
    try {
      const { phone } = z.object({ phone: saPhoneSchema }).parse(req.body);
      const normalizedPhone = phone;

      // Per-IP burst limiter — atomic reserve-then-decide. Closes the
      // same-burst race where N concurrent requests could all pass a separate
      // check-then-record pattern before any of them incremented the counter.
      const ipDecision = await tryReserveOtpRequest(req);
      if (!ipDecision.allowed) {
        res.setHeader("Retry-After", String(ipDecision.retryAfterSec));
        return res.status(429).json({ message: tr(req, "otp.tooMany") });
      }

      // Check if active SMS plugin exists
      const smsPlugin = await storage.getActiveSmsPlugin();
      if (!smsPlugin) {
        return res.status(503).json({ message: tr(req, "otp.smsNotConfigured") });
      }

      // Generate 6-digit code
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

      // Per-phone limit: max 3 OTP requests per phone per 10 minutes — reserved
      // and inserted atomically under a per-phone advisory lock so concurrent
      // requests for the same number cannot both pass the cap.
      const reserved = await storage.tryReserveAndCreateOtpVerification(
        normalizedPhone,
        code,
        expiresAt,
        "registration",
        3,
        10 * 60 * 1000,
      );
      if (!reserved.ok) {
        return res.status(429).json({ message: tr(req, "otp.tooMany") });
      }

      // Phone-only flow (no user record yet) — honour request locale.
      const message = tr(req, "sms.otpVerification", { code });
      logOtpForDev(normalizedPhone, code, "registration");
      const result = await sendSmsViaPlugin(smsPlugin, normalizedPhone, message);

      if (!result.success) {
        console.error("[OTP] SMS delivery failed:", result.error);
        return res.status(502).json({ message: tr(req, "otp.sendFailed") });
      }

      console.log(`[OTP] Sent to ${redactPhone(normalizedPhone)}, expires ${expiresAt.toISOString()}`);
      return res.json({ success: true, expiresAt });
    } catch (err) { return handleError(res, err); }
  });

  // ─── OTP: Verify code ──────────────────────────────────────────────────────
  app.post("/api/auth/otp/verify", markPublic, async (req: Request, res: Response) => {
    try {
      const { phone, code } = z.object({
        phone: saPhoneSchema,
        code: z.string().regex(/^\d{6}$/, "invalid_otp_format"),
      }).parse(req.body);
      const normalizedPhone = phone;

      // Per-IP throttle (in addition to per-phone attempt counter on the OTP row)
      const ipDecision = await checkOtpVerifyIp(req);
      if (!ipDecision.allowed) {
        res.setHeader("Retry-After", String(ipDecision.retryAfterSec));
        return res.status(429).json({ message: tr(req, "otp.tooManyAttempts") });
      }

      // Single generic "invalid" response shape used for EVERY failure path —
      // no OTP, wrong code, expired, already verified, attempts exhausted.
      // Returning differentiated messages here would let an attacker probe a
      // phone number's OTP state (does it exist? was it already used? is it
      // throttled?) and enumerate Saudi mobile numbers that have ever
      // registered with the system. The legitimate user always gets here from
      // a flow where they just requested a fresh OTP, so the loss of detail
      // is acceptable.
      const genericInvalid = () => res.status(400).json({ message: tr(req, "otp.invalid") });

      const otp = await storage.getLatestOtpVerification(normalizedPhone);
      if (!otp) {
        await recordOtpVerifyFailure(req);
        return genericInvalid();
      }
      if (otp.verifiedAt || new Date() > otp.expiresAt || otp.attempts >= 5) {
        await recordOtpVerifyFailure(req);
        return genericInvalid();
      }
      if (!verifyOtpHash(code, otp.code)) {
        await storage.incrementOtpAttempts(otp.id);
        await recordOtpVerifyFailure(req);
        return genericInvalid();
      }

      await storage.markOtpVerified(otp.id);
      return res.json({ success: true, otpId: otp.id });
    } catch (err) { return handleError(res, err); }
  });

  // ─── Registration (requires verified OTP) ──────────────────────────────────
  app.post("/api/auth/register", markPublic, async (req: Request, res: Response) => {
    try {
      const { fullName, phone, nationalId, password, otpId } = req.body as {
        fullName?: string;
        phone?: string;
        nationalId?: string;
        password?: string;
        otpId?: string;
      };

      if (!fullName || !phone || !nationalId || !password || !otpId) {
        return res.status(400).json({ message: tr(req, "register.allFieldsOtp") });
      }
      const pwRules = [
        { ok: password.length >= 8,              msg: "at least 8 characters" },
        { ok: /[A-Z]/.test(password),            msg: "one uppercase letter" },
        { ok: /[a-z]/.test(password),            msg: "one lowercase letter" },
        { ok: /[0-9]/.test(password),            msg: "one number" },
        { ok: /[^A-Za-z0-9]/.test(password),    msg: "one special character" },
      ];
      const pwFails = pwRules.filter(r => !r.ok);
      if (pwFails.length > 0) {
        return res.status(400).json({
          message: tr(req, "password.rules", { rules: pwFails.map(f => f.msg).join(", ") }),
        });
      }

      // Validate OTP — look up by ID directly to avoid stale-phone-lookup bug.
      // Phone is canonicalized via the shared helper so any input shape
      // (+966, 00966, spaces, Arabic-Indic digits) matches the canonical
      // 05XXXXXXXX value the OTP route persisted.
      const normalizedPhone = normalizeSaPhone(phone);
      if (!normalizedPhone) {
        return res.status(400).json({ message: tr(req, "common.errors.invalidPhone") });
      }
      const otp = await storage.getOtpVerificationById(otpId);
      if (!otp || otp.phone !== normalizedPhone) {
        return res.status(400).json({ message: tr(req, "otp.invalidSession") });
      }
      if (!otp.verifiedAt) {
        return res.status(400).json({ message: tr(req, "otp.phoneNotVerified") });
      }
      if (otp.usedForRegistration) {
        return res.status(400).json({ message: tr(req, "otp.alreadyUsed") });
      }
      if (new Date() > new Date(otp.expiresAt.getTime() + 30 * 60 * 1000)) {
        return res.status(400).json({ message: tr(req, "otp.sessionExpired") });
      }

      // Duplicate checks
      const existingByNationalId = await storage.getUserByNationalId(nationalId.trim());
      if (existingByNationalId) {
        return res.status(409).json({ message: tr(req, "register.nationalIdExists") });
      }

      // Task #107: SMP-classified candidates cannot self-register. Their account
      // must be created via the activation link sent by their SMP company.
      // (The check covers the pre-activation state where userId is still NULL,
      // which would otherwise slip past the getUserByNationalId() guard above.)
      const existingCandByNid = await storage.getCandidateByNationalId(nationalId.trim());
      if (existingCandByNid && (existingCandByNid as any).classification === "smp") {
        return res.status(409).json({ message: tr(req, "smp.cannotSelfRegister") });
      }

      // Hash before the transaction (bcrypt is the slow part — keep the
      // transaction's lock window minimal). Email is intentionally NOT
      // synthesized — the candidate provides a real one later in the
      // profile-completion step (or leaves it empty).
      const hashed = await bcrypt.hash(password, 12);

      // Resolve the candidate role id — users.role_id is NOT NULL post-T10
      // (see server/auth-middleware.ts:213). Without this, every Individual
      // signup would 500 with a not-null violation.
      const candidateRole = await storage.getRoleBySlug("candidate");
      if (!candidateRole) {
        console.error("[Register] Candidate role missing from RBAC seed");
        return res.status(500).json({ message: tr(req, "common.errors.internal") });
      }
      const candidateRoleId = candidateRole.id;

      // Wrap OTP consume + user create + candidate create in a single
      // transaction. Any failure rolls back BOTH the OTP-consumed flag and the
      // partial user/candidate writes — no orphan-user-with-burned-OTP states.
      let user, candidate;
      try {
        ({ user, candidate } = await db.transaction(async (tx) => {
          // Atomic OTP consume — rejects double-use, cross-purpose replay, and
          // any race where two parallel registers share one OTP.
          const consumed = await tx
            .update(otpVerifications)
            .set({ usedForRegistration: true })
            .where(and(
              eq(otpVerifications.id, otpId),
              eq(otpVerifications.usedForRegistration, false),
              eq(otpVerifications.purpose, "registration"),
            ))
            .returning({ id: otpVerifications.id });
          if (consumed.length === 0) {
            throw new Error("OTP_ALREADY_USED");
          }

          // Phone-transfer flag (best-effort within the same tx)
          const existingByPhoneRows = await tx
            .select()
            .from(candidates)
            .where(eq(candidates.phone, normalizedPhone))
            .limit(1);
          const existingByPhone = existingByPhoneRows[0];
          if (existingByPhone) {
            console.log(`[Register] Phone ${normalizedPhone} previously belonged to candidate ${existingByPhone.id}. Flagging as transferred and releasing phone.`);
            // Release the phone from the prior owner (set to null) so the new
            // candidate can claim it without breaking getCandidateByPhone()
            // resolution. Mirrors the legacy storage.flagPhoneTransferred()
            // semantics that this transactional path replaced.
            await tx
              .update(candidates)
              .set({ phone: null, phoneTransferredAt: new Date(), updatedAt: new Date() } as any)
              .where(eq(candidates.id, existingByPhone.id));
          }

          const [createdUser] = await tx
            .insert(users)
            .values({
              username: nationalId.trim(),
              email: null,
              password: hashed,
              fullName: fullName.trim(),
              phone: normalizedPhone,
              nationalId: nationalId.trim(),
              isActive: true,
              roleId: candidateRoleId,
            } as any)
            .returning();

          // Reuse pre-existing candidate row by national ID, else create.
          const existingByNidRows = await tx
            .select()
            .from(candidates)
            .where(eq(candidates.nationalId, nationalId.trim()))
            .limit(1);
          const nowTs = new Date();
          let createdCandidate;
          if (existingByNidRows[0]) {
            // The NID matches a candidate row that an admin (or earlier
            // bulk upload) pre-loaded. The registrant is "claiming" their
            // own record — link the new login to it and refresh the phone,
            // but DO NOT overwrite the on-file fullNameEn. Letting any
            // anonymous registrant rewrite the admin-recorded name is a
            // data-integrity hole (and a soft impersonation vector). We
            // only fall back to the registrant-supplied name when the
            // existing row truly has no name on file.
            const existing = existingByNidRows[0];
            const preservedName =
              existing.fullNameEn && existing.fullNameEn.trim().length > 0
                ? existing.fullNameEn
                : fullName.trim();
            const [updated] = await tx
              .update(candidates)
              .set({
                userId: createdUser.id,
                phone: normalizedPhone,
                fullNameEn: preservedName,
                email: null,
                lastLoginAt: nowTs,
                updatedAt: nowTs,
              } as any)
              .where(eq(candidates.id, existing.id))
              .returning();
            createdCandidate = updated;
          } else {
            const [inserted] = await tx
              .insert(candidates)
              .values({
                fullNameEn: fullName.trim(),
                phone: normalizedPhone,
                nationalId: nationalId.trim(),
                email: null,
                // New self-signups have not yet completed the post-registration
                // profile-setup wizard (city, IBAN, emergency contact, etc.).
                // Mark them pending_profile so they are clearly distinguished
                // from fully active candidates in the Talent list and so any
                // status-based filters/exports do not pick them up by mistake.
                // The PATCH /api/candidates/:id handler flips this back to
                // 'available' once profileCompleted=true is recorded.
                status: "pending_profile",
                country: "SA",
                userId: createdUser.id,
                lastLoginAt: nowTs,
              } as any)
              .returning();
            createdCandidate = inserted;
          }

          return { user: createdUser, candidate: createdCandidate };
        }));
      } catch (e: any) {
        if (e?.message === "OTP_ALREADY_USED") {
          return res.status(400).json({ message: tr(req, "otp.alreadyUsed") });
        }
        // Map PG unique-violation races (code 23505) to deterministic 409s
        // instead of leaking a generic 500 + raw error message. Constraint
        // name disambiguates which uniqueness lost the race.
        if (e?.code === "23505") {
          const constraint = String(e?.constraint ?? "");
          if (constraint.includes("phone")) {
            return res.status(409).json({ message: tr(req, "register.phoneExists") });
          }
          if (constraint.includes("national")) {
            return res.status(409).json({ message: tr(req, "register.nationalIdExists") });
          }
          if (constraint.includes("email") || constraint.includes("username")) {
            return res.status(409).json({ message: tr(req, "register.duplicate") });
          }
          return res.status(409).json({ message: tr(req, "register.duplicate") });
        }
        throw e;
      }

      const { password: _, ...safeUser } = user;

      // Auto-login the freshly registered user — mirror the cookie issued by /api/auth/login
      const token = signAuthToken(user.id);
      const securFlag = process.env.NODE_ENV === "production" ? "; Secure" : "";
      res.setHeader(
        "Set-Cookie",
        `wf_auth=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}${securFlag}`,
      );

      return res.status(201).json({ user: { ...safeUser, role: "candidate" }, candidate });
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ─── Change password (candidate self-service) ───────────────────────────
  app.post("/api/auth/change-password", requireAuth, async (req: Request, res: Response) => {
    try {
      const { candidateId, currentPassword, newPassword } = req.body as {
        candidateId?: string; currentPassword?: string; newPassword?: string;
      };
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: tr(req, "common.allFieldsRequired") });
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
        return res.status(400).json({ message: tr(req, "password.rules", { rules: failed.join(", ") }) });
      }

      // Resolve target user. Candidate portal sends candidateId; staff/admin
      // pages omit it and we use the authenticated user directly.
      let user;
      if (candidateId) {
        const candidate = await storage.getCandidate(candidateId);
        if (!candidate) return res.status(404).json({ message: tr(req, "candidate.notFound") });
        user = candidate.userId ? await storage.getUser(candidate.userId) : undefined;
        if (!user && candidate.nationalId) {
          user = await storage.getUserByNationalId(candidate.nationalId);
        }
        // Only allow the candidate themselves (or a super-admin) to change this password.
        const ownsCandidate = user && req.authUserId === user.id;
        if (!ownsCandidate && !req.authIsSuperAdmin) {
          return res.status(403).json({ message: tr(req, "auth.forbidden") });
        }
      } else {
        user = req.authUser ?? (req.authUserId ? await storage.getUser(req.authUserId) : undefined);
      }
      if (!user) return res.status(404).json({ message: tr(req, "user.notFound") });

      const valid = await bcrypt.compare(currentPassword, user.password ?? "");
      if (!valid) return res.status(401).json({ message: tr(req, "password.currentIncorrect") });
      const hashed = await bcrypt.hash(newPassword, 12);
      await storage.updateUser(user.id, { password: hashed });
      return res.json({ message: tr(req, "password.updated") });
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ─── Reset password: initiate (lookup by National ID, send OTP) ──────────
  app.post("/api/auth/reset-password/request", markPublic, async (req: Request, res: Response) => {
    // Always returns the same generic 200 response shape regardless of whether the
    // national ID matches an account, prevents enumeration of accounts/phones.
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    const generic = { ok: true, expiresAt: expiresAt.toISOString() };

    try {
      const { nationalId } = req.body as { nationalId?: string };
      if (!nationalId || typeof nationalId !== "string" || !nationalId.trim()) {
        return res.status(400).json({ message: tr(req, "common.nationalIdRequired") });
      }
      const clean = nationalId.trim();

      const user = await storage.getUserByNationalId(clean);
      // Silent no-ops for: missing user, missing phone, disabled account.
      if (!user || !user.phone || !user.isActive) {
        // Task #107 step 8 — SMP self-heal: un-activated SMP candidate uses
        // forgot-password because they never received (or lost) their
        // activation SMS. Three throttle layers MUST all pass before we side-
        // channel an activation SMS:
        //
        //   L1 (per-NID cooldown, 1/hour) — guessable national IDs cannot be
        //       used to spam a victim's inbox. Implemented via outbox dedupe
        //       (1-hour bucket).
        //   L2 (per-IP throttle, 10/hour) — a single attacker IP cannot fan
        //       out across many guessed NIDs.
        //   L3 (daily aggregate counter) — surfaces in admin telemetry above
        //       a threshold; signals systemic abuse even when L1+L2 pass.
        //
        // The public response stays the same generic 200 regardless of which
        // throttle blocked, so the caller cannot infer state.
        try {
          const cand = await storage.getCandidateByNationalId(clean);
          if (cand && (cand as any).classification === "smp" && !cand.userId && cand.phone) {
            const { tryReserveSelfHealQuota, getSelfHealDailyCount } = await import("./self-heal-throttle");
            const ip = getClientIp(req);
            const reservation = tryReserveSelfHealQuota(ip, clean);
            const daily = getSelfHealDailyCount();
            if (!reservation.ok) {
              console.warn(
                `[Reset/SelfHeal] throttled (${reservation.reason}) NID=${redactNationalId(clean)} ip=${ip} dailyCount=${daily}`,
              );
            } else {
              const { mintActivationToken } = await import("./activation-tokens");
              const { enqueueActivationSms } = await import("./sms-outbox");
              const hourBucket = Math.floor(Date.now() / (60 * 60 * 1000));
              const dedupeKey = `selfheal:${cand.id}:${hourBucket}`;
              const { plainToken, tokenRow } = await mintActivationToken(cand.id, null);
              await enqueueActivationSms({
                candidateId: cand.id,
                recipientPhone: cand.phone,
                plainToken,
                tokenRowId: tokenRow.id,
                candidateLocale: ((cand as any).locale === "en" ? "en" : "ar"),
                kind: "smp_activation_self_heal",
                dedupeKey,
              });
              console.log(
                `[Reset/SelfHeal] Activation SMS enqueued for candidate ${cand.id} (NID ${redactNationalId(clean)} ip=${ip} dailyCount=${daily + 1}).`,
              );
              // Telemetry: warn loudly when the daily aggregate looks abusive
              // so admins notice in production logs even before a dashboard.
              if (daily + 1 >= 50 && (daily + 1) % 10 === 0) {
                console.warn(
                  `[Reset/SelfHeal] DAILY ABUSE THRESHOLD: ${daily + 1} self-heal SMS issued today.`,
                );
              }
            }
          }
        } catch (selfHealErr) {
          console.error("[Reset/SelfHeal] error (silent):", selfHealErr);
        }
        console.log(`[Reset] Generic OK returned for national ID ${redactNationalId(clean)} (no eligible account).`);
        return res.json(generic);
      }

      const phone = user.phone;

      // Per-phone rate limit + insert applied atomically and silently
      // (still generic 200 to caller). See storage.tryReserveAndCreateOtpVerification.
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const reserved = await storage.tryReserveAndCreateOtpVerification(
        phone,
        code,
        expiresAt,
        "password_reset",
        3,
        10 * 60 * 1000,
      );
      if (!reserved.ok) {
        console.log(`[Reset] Rate-limited national ID ${redactNationalId(clean)} (silent).`);
        return res.json(generic);
      }

      logOtpForDev(phone, code, "password_reset");
      const activePlugin = await storage.getActiveSmsPlugin();
      if (activePlugin) {
        const recipientLocale = (user as any)?.locale === "en" ? "en" : "ar";
        const resetMsg = trL(recipientLocale, "sms.passwordResetCode", { code });
        const result = await sendSmsViaPlugin(activePlugin, phone, resetMsg);
        if (!result.success) {
          console.error("[Reset] SMS delivery failed:", result.error);
        }
      }

      console.log(`[Reset] OTP sent to ${redactPhone(phone)} for national ID ${redactNationalId(clean)}, expires ${expiresAt.toISOString()}`);
      return res.json(generic);
    } catch (err) {
      console.error("[Reset] request handler error (returning generic):", err);
      return res.json(generic);
    }
  });

  // ─── Reset password: finalize (OTP verified, set new password) ──────────
  app.post("/api/auth/reset-password", markPublic, async (req: Request, res: Response) => {
    try {
      const { nationalId, otpId, newPassword } = req.body as {
        nationalId?: string; otpId?: string; newPassword?: string;
      };
      if (!nationalId || !otpId || !newPassword) {
        return res.status(400).json({ message: tr(req, "passwordReset.allFieldsRequired") });
      }
      const pwRules = [
        { ok: newPassword.length >= 8,              msg: "at least 8 characters" },
        { ok: /[A-Z]/.test(newPassword),            msg: "one uppercase letter" },
        { ok: /[a-z]/.test(newPassword),            msg: "one lowercase letter" },
        { ok: /[0-9]/.test(newPassword),            msg: "one number" },
        { ok: /[^A-Za-z0-9]/.test(newPassword),    msg: "one special character" },
      ];
      const pwFails = pwRules.filter(r => !r.ok);
      if (pwFails.length > 0) {
        return res.status(400).json({
          message: tr(req, "password.rules", { rules: pwFails.map(f => f.msg).join(", ") }),
        });
      }

      const user = await storage.getUserByNationalId(nationalId.trim());
      if (!user || !user.phone) {
        return res.status(404).json({ message: tr(req, "auth.noAccount") });
      }

      const otp = await storage.getOtpVerificationById(otpId);
      if (!otp || otp.phone !== user.phone || otp.purpose !== "password_reset") {
        return res.status(400).json({ message: tr(req, "otp.invalidSessionShort") });
      }
      if (!otp.verifiedAt) {
        return res.status(400).json({ message: tr(req, "otp.phoneNotVerifiedShort") });
      }
      if (new Date() > new Date(otp.expiresAt.getTime() + 30 * 60 * 1000)) {
        return res.status(400).json({ message: tr(req, "otp.sessionExpiredShort") });
      }

      // Atomically consume the OTP BEFORE writing the new password. Closes the
      // replay race where the same verified reset-OTP could overwrite the
      // password multiple times until the 30-min window expired.
      const consumed = await db
        .update(otpVerifications)
        .set({ usedForRegistration: true })
        .where(and(
          eq(otpVerifications.id, otpId),
          eq(otpVerifications.usedForRegistration, false),
          eq(otpVerifications.purpose, "password_reset"),
        ))
        .returning({ id: otpVerifications.id });
      if (consumed.length === 0) {
        return res.status(400).json({ message: tr(req, "otp.alreadyUsed") });
      }

      const hashed = await bcrypt.hash(newPassword, 12);
      await storage.updateUser(user.id, { password: hashed });

      return res.json({ message: tr(req, "passwordReset.success") });
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ─── SMP worker activation: consume token + create user (Task #107) ───────
  app.post("/api/auth/activate", markPublic, async (req: Request, res: Response) => {
    try {
      // Per-IP throttle BEFORE any work — anti-DoS for the public endpoint.
      // bcrypt is also deferred until after token validation inside
      // consumeActivationToken (see activation-tokens.ts) so an invalid-token
      // flood can't burn CPU.
      const ipDecision = await checkActivateIp(req);
      if (!ipDecision.allowed) {
        res.setHeader("Retry-After", String(ipDecision.retryAfterSec));
        return res.status(429).json({ message: tr(req, "activation.tooMany") });
      }

      const { token, password } = req.body as { token?: string; password?: string };
      if (!token) {
        await recordActivateFailure(req);
        return res.status(400).json({ message: tr(req, "activation.invalid") });
      }
      if (!password || password.length < 8) {
        return res.status(400).json({ message: tr(req, "activation.passwordTooShort") });
      }
      const { consumeActivationToken, ActivationError } = await import("./activation-tokens");
      try {
        const result = await consumeActivationToken(token, password);
        return res.json({
          ok: true,
          candidateId: result.candidateId,
          message: tr(req, "activation.success"),
        });
      } catch (e) {
        if (e instanceof ActivationError) {
          await recordActivateFailure(req);
          const i18n = e.code === "EXPIRED"
            ? "activation.expired"
            : e.code === "CONSUMED"
            ? "activation.consumed"
            : "activation.invalid";
          return res.status(400).json({ code: e.code, message: tr(req, i18n) });
        }
        throw e;
      }
    } catch (err) {
      return handleError(res, err);
    }
  });

  // GET variant lets the client pre-validate the token (show "expired" page
  // before asking for a password). Returns 200 with `{ valid: true }` or 400.
  app.get("/api/auth/activate", markPublic, async (req: Request, res: Response) => {
    const token = (req.query.token as string) ?? "";
    if (!token) return res.status(400).json({ valid: false, code: "INVALID" });
    const { hashToken } = await import("./activation-tokens");
    const { candidateActivationTokens, candidates } = await import("@shared/schema");
    const [row] = await db
      .select({
        id: candidateActivationTokens.id,
        candidateId: candidateActivationTokens.candidateId,
        consumedAt: candidateActivationTokens.consumedAt,
        invalidatedAt: candidateActivationTokens.invalidatedAt,
        expiresAt: candidateActivationTokens.expiresAt,
      })
      .from(candidateActivationTokens)
      .where(eq(candidateActivationTokens.tokenHash, hashToken(token)));
    if (!row) return res.status(400).json({ valid: false, code: "INVALID" });
    if (row.consumedAt) return res.status(400).json({ valid: false, code: "CONSUMED" });
    if (row.invalidatedAt) return res.status(400).json({ valid: false, code: "CONSUMED" });
    if (row.expiresAt < new Date()) return res.status(400).json({ valid: false, code: "EXPIRED" });
    const [cand] = await db
      .select({ fullNameEn: candidates.fullNameEn, phone: candidates.phone })
      .from(candidates)
      .where(eq(candidates.id, row.candidateId));
    return res.json({
      valid: true,
      candidateName: cand?.fullNameEn ?? null,
      // Last 3 digits only — confirms identity without leaking the full number.
      phoneSuffix: cand?.phone ? cand.phone.slice(-3) : null,
    });
  });

  // ─── System Settings (public — no auth) ──────────────────────────────────
  app.get("/api/settings/public", markPublic, async (_req: Request, res: Response) => {
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

  app.get("/api/settings/system", requirePermission("settings:read"), async (_req: Request, res: Response) => {
    try {
      const [supportEmail, privacyPolicy, termsConditions, ntpServerUrl, orgTimezone, configVersion,
        attEarlyBuf, attLateBuf, attMinDur, attMaxSubs] = await Promise.all([
        storage.getSystemSetting("support_email"),
        storage.getSystemSetting("privacy_policy"),
        storage.getSystemSetting("terms_conditions"),
        storage.getSystemSetting("ntp_server_url"),
        storage.getSystemSetting("organization_timezone"),
        storage.getSystemSetting("config_version"),
        storage.getSystemSetting("attendance_early_buffer_minutes"),
        storage.getSystemSetting("attendance_late_buffer_minutes"),
        storage.getSystemSetting("attendance_min_shift_duration_minutes"),
        storage.getSystemSetting("attendance_max_daily_submissions"),
      ]);
      return res.json({
        support_email: supportEmail ?? "",
        privacy_policy: privacyPolicy ?? "",
        terms_conditions: termsConditions ?? "",
        ntp_server_url: ntpServerUrl ?? "time.google.com",
        organization_timezone: orgTimezone ?? "Asia/Riyadh",
        config_version: parseInt(configVersion ?? "1", 10),
        attendance_early_buffer_minutes: parseInt(attEarlyBuf ?? "30", 10),
        attendance_late_buffer_minutes: parseInt(attLateBuf ?? "60", 10),
        attendance_min_shift_duration_minutes: parseInt(attMinDur ?? "30", 10),
        attendance_max_daily_submissions: parseInt(attMaxSubs ?? "2", 10),
      });
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.patch("/api/settings/system", requirePermission("settings:write"), async (req: Request, res: Response) => {
    try {
      const { support_email, privacy_policy, terms_conditions, ntp_server_url, organization_timezone } = req.body;
      let anyChanged = false;
      if (typeof support_email === "string") {
        const trimmed = support_email.trim();
        if (trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
          return res.status(400).json({ message: tr(req, "common.invalidEmail") });
        }
        await storage.setSystemSetting("support_email", trimmed);
        anyChanged = true;
      }
      if (typeof privacy_policy === "string") {
        await storage.setSystemSetting("privacy_policy", privacy_policy);
        anyChanged = true;
      }
      if (typeof terms_conditions === "string") {
        await storage.setSystemSetting("terms_conditions", terms_conditions);
        anyChanged = true;
      }
      if (typeof ntp_server_url === "string" && ntp_server_url.trim()) {
        await storage.setSystemSetting("ntp_server_url", ntp_server_url.trim());
        anyChanged = true;
      }
      if (typeof organization_timezone === "string" && organization_timezone.trim()) {
        await storage.setSystemSetting("organization_timezone", organization_timezone.trim());
        anyChanged = true;
      }
      const attKeys = [
        { field: "attendance_early_buffer_minutes", min: 0, max: 120 },
        { field: "attendance_late_buffer_minutes", min: 0, max: 240 },
        { field: "attendance_min_shift_duration_minutes", min: 0, max: 480 },
        { field: "attendance_max_daily_submissions", min: 1, max: 10 },
      ] as const;
      for (const { field, min, max } of attKeys) {
        const val = req.body[field];
        if (val !== undefined && val !== null) {
          const num = parseInt(String(val), 10);
          if (!isNaN(num) && num >= min && num <= max) {
            await storage.setSystemSetting(field, String(num));
            anyChanged = true;
          }
        }
      }
      if (anyChanged) {
        const currentVersion = await storage.getSystemSetting("config_version");
        const newVersion = (parseInt(currentVersion ?? "1", 10) + 1).toString();
        await storage.setSystemSetting("config_version", newVersion);
      }
      return res.json({ success: true });
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ─── ID Card Pickup SMS (Task #207) ──────────────────────────────────────
  // Per-tenant editable SMS template that admins trigger from the workforce
  // print flow. Templates support {{employeeName}}, {{employeeNumber}},
  // {{venue}}, {{location}}, {{date}}, {{time}} placeholders. Defaults are
  // baked in here so a fresh tenant works without touching settings.
  const ID_CARD_PICKUP_DEFAULT_AR =
    "تمت طباعة بطاقة الهوية الخاصة بك بتاريخ {{date}} الساعة {{time}}. يرجى التوجه إلى {{venue}} لاستلامها. الموقع: {{location}}";
  const ID_CARD_PICKUP_DEFAULT_EN =
    "Your ID card was printed on {{date}} at {{time}}. Please come to {{venue}} to pick it up. Location: {{location}}";
  const ID_CARD_PICKUP_DEFAULT_VENUE =
    "شركة مشارق، الطابق السادس / Mashareq Company, 6th Floor";

  app.get("/api/settings/id-card-pickup-sms", requirePermission("settings:read"), async (_req: Request, res: Response) => {
    try {
      // Read-only: missing rows are surfaced as the baked-in defaults below
      // without mutating system_settings. Tenant writes happen via PUT.
      const [ar, en, venue, locationUrl] = await Promise.all([
        storage.getSystemSetting("id_card_pickup_sms_template_ar"),
        storage.getSystemSetting("id_card_pickup_sms_template_en"),
        storage.getSystemSetting("id_card_pickup_venue"),
        storage.getSystemSetting("id_card_pickup_location_url"),
      ]);
      return res.json({
        template_ar: ar ?? ID_CARD_PICKUP_DEFAULT_AR,
        template_en: en ?? ID_CARD_PICKUP_DEFAULT_EN,
        venue: venue ?? ID_CARD_PICKUP_DEFAULT_VENUE,
        location_url: locationUrl ?? "",
      });
    } catch (err) { return handleError(res, err); }
  });

  app.put("/api/settings/id-card-pickup-sms", requirePermission("settings:write"), async (req: Request, res: Response) => {
    try {
      const { template_ar, template_en, venue, location_url } = req.body as Record<string, unknown>;
      if (typeof template_ar !== "string" || !template_ar.trim()) {
        return res.status(400).json({ message: tr(req, "common.invalidPayload") });
      }
      if (typeof template_en !== "string" || !template_en.trim()) {
        return res.status(400).json({ message: tr(req, "common.invalidPayload") });
      }
      if (typeof venue !== "string" || !venue.trim()) {
        return res.status(400).json({ message: tr(req, "common.invalidPayload") });
      }
      if (typeof location_url !== "string") {
        return res.status(400).json({ message: tr(req, "common.invalidPayload") });
      }
      const trimmedUrl = location_url.trim();
      if (trimmedUrl && !/^https?:\/\//i.test(trimmedUrl)) {
        return res.status(400).json({ message: tr(req, "common.invalidPayload") });
      }
      await storage.setSystemSetting("id_card_pickup_sms_template_ar", template_ar);
      await storage.setSystemSetting("id_card_pickup_sms_template_en", template_en);
      await storage.setSystemSetting("id_card_pickup_venue", venue);
      await storage.setSystemSetting("id_card_pickup_location_url", trimmedUrl);
      return res.json({ success: true });
    } catch (err) { return handleError(res, err); }
  });

  // Lightweight check used by the workforce print dialog to disable the Send
  // button (and show an inline configure-gateway hint) when no SMS plugin is active.
  // Uses workforce:update so the same admin who can print can also see the status.
  app.get("/api/id-card-pickup-sms/status", requirePermission("workforce:update"), async (_req: Request, res: Response) => {
    try {
      const plugin = await storage.getActiveSmsPlugin();
      return res.json({ active: !!plugin });
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/id-card-pickup-sms/send", requirePermission("workforce:update"), async (req: Request, res: Response) => {
    try {
      const { employeeIds } = req.body as { employeeIds?: unknown };
      if (!Array.isArray(employeeIds) || employeeIds.length === 0
          || !employeeIds.every(id => typeof id === "string")) {
        return res.status(400).json({ message: tr(req, "common.employeeIdsRequired") });
      }
      const ids = Array.from(new Set(employeeIds as string[]));
      const smsPlugin = await storage.getActiveSmsPlugin();
      if (!smsPlugin) {
        return res.status(400).json({
          message: tr(req, "sms.notConfigured"),
          sent: 0, skipped: 0, failed: ids.length, total: ids.length,
        });
      }
      const [tplAr, tplEn, venueRaw, locationRawUrl, orgTzRaw] = await Promise.all([
        storage.getSystemSetting("id_card_pickup_sms_template_ar"),
        storage.getSystemSetting("id_card_pickup_sms_template_en"),
        storage.getSystemSetting("id_card_pickup_venue"),
        storage.getSystemSetting("id_card_pickup_location_url"),
        storage.getSystemSetting("organization_timezone"),
      ]);
      const templates = {
        ar: tplAr ?? ID_CARD_PICKUP_DEFAULT_AR,
        en: tplEn ?? ID_CARD_PICKUP_DEFAULT_EN,
      };
      const venue = venueRaw ?? ID_CARD_PICKUP_DEFAULT_VENUE;
      const locationUrl = locationRawUrl ?? "";
      // Guard: invalid tz strings throw RangeError from Intl.DateTimeFormat — fall back to Asia/Riyadh.
      let orgTz = orgTzRaw ?? "Asia/Riyadh";
      const now = new Date();
      let dateStr: string;
      let timeStr: string;
      const buildDateTime = (tz: string) => {
        dateStr = new Intl.DateTimeFormat("en-CA", {
          timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
        }).format(now);
        timeStr = new Intl.DateTimeFormat("en-GB", {
          timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
        }).format(now);
      };
      try {
        buildDateTime(orgTz);
      } catch {
        orgTz = "Asia/Riyadh";
        buildDateTime(orgTz);
      }

      let sent = 0, skipped = 0, failed = 0;
      const errors: { employeeId: string; reason: string }[] = [];

      const sendOne = async (empId: string) => {
        try {
          const employee = await storage.getWorkforceEmployee(empId);
          if (!employee || !employee.phone) {
            skipped++;
            return;
          }
          const candidate = employee.candidateId
            ? await storage.getCandidate(employee.candidateId)
            : null;
          const locale = await getCandidateLocale(candidate, "ar");
          const template = templates[locale] ?? templates.ar;
          let message = template
            .replace(/\{\{employeeName\}\}/g, employee.fullNameEn ?? "")
            .replace(/\{\{employeeNumber\}\}/g, employee.employeeNumber ?? "")
            .replace(/\{\{venue\}\}/g, venue)
            .replace(/\{\{location\}\}/g, locationUrl)
            .replace(/\{\{date\}\}/g, dateStr!)
            .replace(/\{\{time\}\}/g, timeStr!);
          // When the tenant left location URL blank, strip any dangling
          // "Location:" / "الموقع:" label (with optional trailing punctuation)
          // so the recipient never sees an empty label.
          if (!locationUrl) {
            message = message
              .replace(/[\s]*(?:Location|الموقع)\s*[:：][\s.,]*$/i, "")
              .replace(/[\s]*(?:Location|الموقع)\s*[:：]\s*([.,!؟?])/gi, "$1")
              .trim();
          }
          const result = await sendSmsViaPlugin(smsPlugin, employee.phone, message);
          if (result.success) {
            sent++;
          } else {
            failed++;
            errors.push({ employeeId: empId, reason: result.error ?? "send_failed" });
          }
        } catch (e) {
          failed++;
          errors.push({
            employeeId: empId,
            reason: (e instanceof Error ? e.message : String(e)).slice(0, 200),
          });
        }
      };

      // Bounded parallel batches: 10 concurrent per batch keeps DB + plugin gateway happy.
      const BATCH_SIZE = 10;
      for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const batch = ids.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(sendOne));
      }
      return res.json({ sent, skipped, failed, total: ids.length, errors });
    } catch (err) { return handleError(res, err); }
  });

  // ─── Dashboard ───────────────────────────────────────────────────────────
  app.get("/api/dashboard/stats", requireAuth, async (_req: Request, res: Response) => {
    try {
      const stats = await storage.getDashboardStats();
      return res.json(stats);
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ─── Candidates ──────────────────────────────────────────────────────────
  app.get("/api/candidates", requirePermission("candidates:read"), async (req: Request, res: Response) => {
    try {
      const parsed = candidateQuerySchema.parse(req.query);
      // Task #209 — pass-through document-availability toggles. These
      // are not part of `candidateQuerySchema` (which lives under the
      // immutable `shared/` folder), so we forward them on the parsed
      // object via a typed extension and let
      // `buildCandidateOtherConditions` apply them.
      const query = attachDocumentAvailabilityFlags(parsed, req.query);
      const result = await storage.getCandidates(query);
      return res.json(result);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.get("/api/candidates/export", requirePermission("candidates:export"), async (req: Request, res: Response) => {
    try {
      // Task #195 — accept the same filter shape as /api/candidates so
      // the CSV mirrors what's on screen (including a multi-ID paste
      // in the search box). Falls back to "everything not archived"
      // when no filters are supplied.
      const parsed = candidateQuerySchema.partial().parse(req.query);
      // Task #209 — keep export in lock-step with the on-screen
      // filters by mirroring the document-availability toggles.
      const query = attachDocumentAvailabilityFlags(parsed, req.query);
      const result = await storage.exportCandidates(query);
      return res.json(result);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.get("/api/candidates/stats", requirePermission("candidates:read"), async (_req: Request, res: Response) => {
    try {
      const stats = await storage.getCandidateStats();
      return res.json(stats);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.get("/api/candidates/:id/contract-history", requireAuth, async (req: Request, res: Response) => {
    try {
      const isAdmin = req.authIsSuperAdmin || req.authPermissions?.has("candidates:read");
      if (!isAdmin) {
        const myCand = await storage.getCandidateByUserId(req.authUserId!);
        if (!myCand || myCand.id !== req.params.id) {
          return res.status(403).json({ message: tr(req, "common.accessDenied") });
        }
      }
      const contracts = await storage.getContractHistory(req.params.id);
      return res.json(contracts);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.get("/api/candidates/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const isAdmin = req.authIsSuperAdmin || req.authPermissions?.has("candidates:read");
      if (!isAdmin) {
        const myCand = await storage.getCandidateByUserId(req.authUserId!);
        if (!myCand || myCand.id !== req.params.id) {
          return res.status(403).json({ message: tr(req, "common.accessDenied") });
        }
      }
      const candidate = await storage.getCandidate(req.params.id);
      if (!candidate) return res.status(404).json({ message: tr(req, "candidate.notFound") });
      return res.json(candidate);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.post("/api/candidates", requirePermission("candidates:create"), async (req: Request, res: Response) => {
    try {
      const data = insertCandidateSchema.parse(normalizeBlankFields({ ...req.body }, CANDIDATE_BLANK_FIELDS));
      // Task #133 — canonical write-time IBAN gate. Validates checksum
      // (throws IbanValidationError → 400 via handleError),
      // canonicalises the IBAN, fills bank name/code from the SARIE
      // registry, and mirrors `hasIban`. Single source of truth shared
      // with storage.ts so direct API callers, the staff create flow,
      // and bulk paths all behave identically. Originally task #121's
      // auto-fill helper; consolidated with the validating helper in
      // task #133. Behaviour pinned by candidate-iban-resolution.test.ts.
      applyServerIbanFields(data);
      if (data.nationalId) {
        const existing = await storage.getCandidateByNationalId(data.nationalId);
        if (existing) {
          return res.status(409).json({ message: tr(req, "candidate.nationalIdExists", { id: data.nationalId }) });
        }
      }
      if (data.phone) {
        const existing = await storage.getCandidateByPhone(data.phone);
        if (existing) {
          return res.status(409).json({ message: tr(req, "candidate.phoneExists", { phone: data.phone }) });
        }
      }
      const candidate = await storage.createCandidate(data);
      return res.status(201).json(candidate);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.patch("/api/candidates/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      // Authorization: admin with candidates:update OR candidate updating own row.
      const isAdmin = req.authIsSuperAdmin || req.authPermissions?.has("candidates:update");
      if (!isAdmin) {
        const existing = await storage.getCandidate(req.params.id);
        if (!existing) return res.status(404).json({ message: tr(req, "candidate.notFound") });
        // Ownership check — accept any of:
        //  (a) candidate.userId already matches the auth user
        //  (b) candidate.userId is null AND nationalId matches the auth user (claim it)
        //  (c) candidate.nationalId matches the auth user's nationalId (heal stale link)
        let isOwner = existing.userId === req.authUserId;
        if (!isOwner) {
          const me = await storage.getUser(req.authUserId!);
          const sameNid = !!me?.nationalId && !!existing.nationalId && me.nationalId === existing.nationalId;
          if (sameNid && (!existing.userId || existing.userId !== req.authUserId)) {
            await storage.updateCandidate(existing.id, { userId: req.authUserId! });
            isOwner = true;
            console.log(`[candidates:patch] Healed userId on candidate ${existing.id} → ${req.authUserId}`);
          }
        }
        if (!isOwner) {
          return res.status(403).json({ message: tr(req, "profile.ownOnly") });
        }
      }

      const data = candidateBaseSchema.partial().parse(normalizeBlankFields({ ...req.body }, CANDIDATE_BLANK_FIELDS));

      // Task #133 — canonical write-time IBAN gate (see POST handler
      // above). When ibanNumber is part of the patch the helper
      // validates + canonicalises it, re-derives bank name/code from
      // the SARIE registry (or clears them when the IBAN is cleared),
      // and mirrors `hasIban`. No-op when ibanNumber is not present
      // on the partial payload.
      applyServerIbanFields(data);

      if (data.profileCompleted === true) {
        const existing = await storage.getCandidate(req.params.id);
        if (!existing) return res.status(404).json({ message: tr(req, "candidate.notFound") });
        const merged = { ...existing, ...data };
        const missing = validateProfileCompleteness(merged);
        if (missing.length > 0) {
          return res.status(400).json({
            message: tr(req, "candidate.profileMissingFields", { fields: missing.join(", ") }),
            missingFields: missing,
          });
        }
        // Promote 'pending_profile' candidates to 'available' the moment the
        // profile-setup wizard succeeds. We deliberately do NOT touch any
        // other status (inactive, blocked, hired, awaiting_activation), so
        // admin-set states are preserved.
        if (existing.status === "pending_profile" && data.status === undefined) {
          (data as any).status = "available";
        }
      }

      // Task #107: Phone-change invalidates pending activation SMS rows.
      // Detect the change BEFORE the update so we can invalidate any
      // outbox rows still pointed at the old phone (otherwise the worker
      // would deliver an activation link to a number the candidate no
      // longer owns).
      const beforeUpdate = await storage.getCandidate(req.params.id);
      if (!beforeUpdate) return res.status(404).json({ message: tr(req, "candidate.notFound") });
      const phoneChanging =
        typeof data.phone === "string" &&
        beforeUpdate.phone !== data.phone;

      // Phone uniqueness: if the new phone is non-empty and already held by
      // another candidate, refuse with 409 unless the admin explicitly opts
      // into ?resolveConflict=transfer (which nulls the other candidate's
      // phone and invalidates their pending activation SMS).
      let transferredFromId: string | null = null;
      if (phoneChanging && data.phone) {
        const other = await storage.getCandidateByPhone(data.phone);
        if (other && other.id !== req.params.id) {
          const resolveConflict = String(req.query.resolveConflict ?? "").toLowerCase();
          if (resolveConflict !== "transfer") {
            return res.status(409).json({
              message: tr(req, "candidate.phoneExists", { phone: data.phone }),
              conflict: {
                id: other.id,
                fullNameEn: other.fullNameEn,
                classification: (other as any).classification ?? "individual",
                status: other.status,
                hasUserAccount: !!other.userId,
              },
            });
          }
          // Transfer requires admin perm — never allow a candidate self-edit
          // to silently steal another worker's phone.
          if (!isAdmin) {
            return res.status(403).json({ message: tr(req, "candidate.phoneTransferAdminOnly") });
          }
          // Race-safe transfer: re-fetch the holder by id and verify the
          // phone still matches what we just looked up. If it changed
          // between the lookup and now (concurrent edit), refuse with 409
          // and let the admin retry against the new state.
          const reFetched = await storage.getCandidate(other.id);
          if (!reFetched || reFetched.phone !== data.phone) {
            return res.status(409).json({
              message: tr(req, "candidate.phoneConflictStateChanged"),
              conflict: { id: other.id, phoneStillHeld: reFetched?.phone === data.phone },
            });
          }
          await storage.updateCandidate(other.id, { phone: null } as any);
          transferredFromId = other.id;
        }
      }

      let candidate;
      try {
        candidate = await storage.updateCandidate(req.params.id, data);
      } catch (mainErr) {
        // Compensating rollback: if the target update fails after we already
        // nulled the previous holder's phone, restore the previous holder's
        // phone so we don't leave a worker phone-less due to a partial write.
        if (transferredFromId && data.phone) {
          try { await storage.updateCandidate(transferredFromId, { phone: data.phone } as any); }
          catch (rbErr) { console.error("[candidates:patch] phone-transfer rollback failed:", rbErr); }
        }
        throw mainErr;
      }
      if (!candidate) {
        if (transferredFromId && data.phone) {
          try { await storage.updateCandidate(transferredFromId, { phone: data.phone } as any); }
          catch (rbErr) { console.error("[candidates:patch] phone-transfer rollback failed:", rbErr); }
        }
        return res.status(404).json({ message: tr(req, "candidate.notFound") });
      }

      if (phoneChanging) {
        try {
          const { invalidatePendingActivationSms } = await import("./sms-outbox");
          const n = await invalidatePendingActivationSms(req.params.id);
          if (n > 0) console.log(`[candidates:patch] Phone changed → invalidated ${n} pending activation SMS for ${req.params.id}.`);
          if (transferredFromId) {
            const m = await invalidatePendingActivationSms(transferredFromId);
            if (m > 0) console.log(`[candidates:patch] Phone transferred away → invalidated ${m} pending activation SMS for ${transferredFromId}.`);
          }
        } catch (e) {
          console.error("[candidates:patch] phone-change invalidation failed:", e);
        }
      }

      return res.json(candidate);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.post("/api/candidates/:id/archive", requirePermission("candidates:archive"), async (req: Request, res: Response) => {
    try {
      const archived = await storage.archiveCandidate(req.params.id);
      if (!archived) return res.status(404).json({ message: tr(req, "candidate.notFoundOrArchived") });
      return res.json({ message: tr(req, "candidate.archived") });
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.post("/api/candidates/:id/unarchive", requirePermission("candidates:archive"), async (req: Request, res: Response) => {
    try {
      const restored = await storage.unarchiveCandidate(req.params.id);
      if (!restored) return res.status(404).json({ message: tr(req, "candidate.notFoundOrActive") });
      return res.json({ message: tr(req, "candidate.restored") });
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.post("/api/candidates/bulk-action", requirePermission("candidates:bulk"), async (req: Request, res: Response) => {
    try {
      const { ids, action } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: tr(req, "common.idsRequired") });
      }
      if (ids.length > 500) {
        return res.status(400).json({ message: tr(req, "candidate.bulkActionLimit") });
      }
      if (action === "block") {
        const affected = await storage.bulkUpdateCandidateStatus(ids, "blocked");
        return res.json({ affected, action });
      } else if (action === "unblock") {
        const affected = await storage.bulkUpdateCandidateStatus(ids, "available");
        return res.json({ affected, action });
      } else if (action === "archive") {
        const affected = await storage.bulkArchiveCandidates(ids);
        return res.json({ affected, action });
      } else if (action === "unarchive") {
        const affected = await storage.bulkUnarchiveCandidates(ids);
        return res.json({ affected, action });
      } else {
        return res.status(400).json({ message: tr(req, "candidate.bulkActionInvalid") });
      }
    } catch (err) {
      return handleError(res, err);
    }
  });

  // Bulk upload endpoint – designed for 70k candidates
  app.post("/api/candidates/bulk", requirePermission("candidates:bulk"), async (req: Request, res: Response) => {
    try {
      const { candidates: rawCandidates } = req.body;
      if (!Array.isArray(rawCandidates) || rawCandidates.length === 0) {
        return res.status(400).json({ message: tr(req, "common.candidatesRequired") });
      }
      if (rawCandidates.length > 1000) {
        return res.status(400).json({ message: tr(req, "candidate.bulkUploadLimit") });
      }
      // Task #107: bulk path on this endpoint is no longer SMP-aware. SMP
      // workers come in via /api/candidates/smp-validate + /api/candidates/smp-commit
      // (the dedicated SMP-only bulk path on the talent page). Reject any
      // attempt to sneak SMP rows through this endpoint.
      const smpRows = rawCandidates.filter(
        (c: Record<string, unknown>) =>
          c.classification === "smp" || c.source === "smp",
      );
      if (smpRows.length > 0) {
        return res.status(400).json({ message: tr(req, "smp.bulkNotAllowed") });
      }
      const errors: { row: number; message: string }[] = [];
      const validated: any[] = [];
      for (let i = 0; i < rawCandidates.length; i++) {
        try {
          const parsed = insertCandidateSchema.parse(
            normalizeBlankFields({ ...(rawCandidates[i] as Record<string, unknown>) }, CANDIDATE_BLANK_FIELDS),
          );
          // Task #133 — canonical write-time IBAN gate (see POST handler).
          // A malformed IBAN throws IbanValidationError which the catch
          // block below records as a per-row validation error so the
          // bulk import returns 400 with the offending row index.
          applyServerIbanFields(parsed);
          if (parsed.profileCompleted) {
            const missing = validateProfileCompleteness(parsed);
            if (missing.length > 0) {
              errors.push({ row: i + 1, message: tr(req, "import.profileMissingFields", { fields: missing.join(", ") }) });
              continue;
            }
          }
          validated.push(parsed);
        } catch (e) {
          // Task #133 — IbanValidationError thrown by applyServerIbanFields
          // surfaces the offending row's IBAN problem (bad checksum,
          // wrong length, etc.) instead of getting collapsed into a
          // generic "invalid row" message.
          errors.push({
            row: i + 1,
            message: e instanceof z.ZodError
              ? e.errors.map(er => `${er.path.join(".")}: ${er.message}`).join("; ")
              : e instanceof IbanValidationError
                ? `ibanNumber: ${e.message}`
                : tr(req, "import.invalidRow"),
          });
        }
      }
      if (errors.length > 0) {
        return res.status(400).json({ message: tr(req, "import.validationFailed", { count: errors.length }), errors: errors.slice(0, 20) });
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
  app.post("/api/candidates/smp-validate", requirePermission("candidates:smp_manage"), async (req: Request, res: Response) => {
    try {
      const { candidates: rows } = req.body;
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ message: tr(req, "common.candidatesRequired") });
      }

      const results: {
        status: "new" | "clean" | "blocked" | "phone_conflict";
        row: Record<string, string>;
        candidate?: { id: string; fullNameEn: string; nationalId: string | null };
        conflictCandidate?: {
          id: string;
          fullNameEn: string;
          nationalId: string | null;
          classification: string;
          status: string;
          hasUserAccount: boolean;
        };
        blockedReason?: string;
      }[] = [];

      // Helper: a row with no nationalId match still needs a phone-conflict
      // check, otherwise we'd silently create a duplicate candidate that
      // shares another worker's phone (the candidates table has a phone
      // index but no unique constraint).
      async function emitNewOrPhoneConflict(row: Record<string, string>) {
        const phone = row.phone?.trim();
        if (phone) {
          const phoneOwner = await storage.getCandidateByPhone(phone);
          // Only flag a conflict when the phone is held by an *active*
          // candidate. If the holder is already inactive (terminated,
          // soft-deactivated, etc.) the phone is effectively free — fall
          // through to the NEW path so the row is created cleanly.
          // (getCandidateByPhone already excludes archived rows.)
          if (phoneOwner && phoneOwner.status !== "inactive") {
            results.push({
              status: "phone_conflict",
              row,
              conflictCandidate: {
                id: phoneOwner.id,
                fullNameEn: phoneOwner.fullNameEn,
                nationalId: phoneOwner.nationalId ?? null,
                classification: (phoneOwner as any).classification ?? "individual",
                status: phoneOwner.status,
                hasUserAccount: !!phoneOwner.userId,
              },
            });
            return;
          }
        }
        results.push({ status: "new", row });
      }

      for (const row of rows) {
        const nationalId = row.nationalId?.trim();
        if (!nationalId) {
          await emitNewOrPhoneConflict(row);
          continue;
        }

        const existing = await storage.getCandidateByNationalId(nationalId);
        if (!existing) {
          await emitNewOrPhoneConflict(row);
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
        const activeOnboarding = onboardingRecords.find(ob => ob.status !== "converted" && ob.status !== "rejected" && ob.status !== "terminated");
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
  app.post("/api/candidates/smp-commit", requirePermission("candidates:smp_manage"), async (req: Request, res: Response) => {
    try {
      const { results: validationResults, eventId, jobId } = req.body as {
        results: {
          status: "new" | "clean" | "blocked" | "phone_conflict";
          confirmed?: boolean;
          // For phone_conflict rows: how the admin chose to resolve the conflict.
          //   reclassify → flip the existing phone-owner to SMP (no new candidate)
          //   transfer   → null phone on existing owner, create new SMP with phone
          //   skip / undefined → drop the row from the batch
          resolution?: "reclassify" | "transfer" | "skip";
          row: Record<string, string>;
          candidate?: { id: string; fullNameEn: string; nationalId: string | null };
          conflictCandidate?: { id: string; fullNameEn: string; nationalId: string | null };
        }[];
        eventId?: string;
        jobId?: string;
      };

      if (!Array.isArray(validationResults) || validationResults.length === 0) {
        return res.status(400).json({ message: tr(req, "common.resultsRequired") });
      }

      // Strict CLEAN confirmation gate: any CLEAN row without confirmed=true is rejected
      const unconfirmedClean = validationResults.filter(r => r.status === "clean" && r.confirmed !== true);
      if (unconfirmedClean.length > 0) {
        return res.status(400).json({
          message: tr(req, "smp.unconfirmedClean", { count: unconfirmedClean.length }),
        });
      }

      // Task #107: SMP commit no longer creates onboarding records. The flow:
      //   NEW row    → create candidate as awaiting_activation, mint token, enqueue activation SMS.
      //   CLEAN row  → flip classification to smp; if userId is null mint token + SMS, else just stamp.
      //   BLOCKED    → skip (client should not have sent these but defense in depth).
      // Onboarding records are created later by the admin "Send to Onboarding"
      // action (see /api/candidates/send-to-onboarding) once workers activate.
      const created: string[] = [];
      const reclassified: string[] = []; // existing candidates flipped to SMP
      const skipped: string[] = [];

      const { getCandidateBlockers } = await import("./candidate-blockers");
      const { mintActivationToken } = await import("./activation-tokens");
      const { enqueueActivationSms } = await import("./sms-outbox");

      // Helper: enqueue activation SMS for a freshly-set-up SMP candidate.
      const enqueueIfPhoneOnFile = async (candidateId: string, kind: "smp_activation" | "smp_activation_reissue" = "smp_activation") => {
        const cand = await storage.getCandidate(candidateId);
        if (!cand?.phone) return;
        if (cand.userId) return; // already activated, no need
        const { plainToken, tokenRow } = await mintActivationToken(candidateId, req.authUserId ?? null);
        await enqueueActivationSms({
          candidateId,
          recipientPhone: cand.phone,
          plainToken,
          tokenRowId: tokenRow.id,
          candidateLocale: "ar",
          kind,
          dedupeKey: `activation:${tokenRow.id}`,
        });
      };

      const { invalidatePendingActivationSms } = await import("./sms-outbox");

      for (const result of validationResults) {
        if (result.status === "blocked") {
          skipped.push(result.candidate?.id ?? result.row.nationalId ?? "?");
          continue;
        }

        // Phone-conflict rows: admin must explicitly choose how to resolve.
        if (result.status === "phone_conflict" && result.conflictCandidate) {
          const resolution = result.resolution ?? "skip";
          const ownerId = result.conflictCandidate.id;

          if (resolution === "skip") {
            skipped.push(ownerId);
            continue;
          }

          // Re-check blockers on the existing phone-owner before either branch
          // can act on them — same authority used by the clean path.
          const [blockers] = await getCandidateBlockers([ownerId]);
          if (blockers && blockers.reasons.length > 0) {
            skipped.push(ownerId);
            continue;
          }

          const owner = await storage.getCandidate(ownerId);
          if (!owner) { skipped.push(ownerId); continue; }

          if (resolution === "reclassify") {
            // Treat exactly like CLEAN: flip the existing phone-owner to SMP.
            const beforeOwner = {
              classification: (owner as any).classification,
              status: (owner as any).status,
            };
            const newStatus = owner.userId ? owner.status : "awaiting_activation";
            await storage.updateCandidate(ownerId, {
              classification: "smp",
              status: newStatus as any,
            } as any);
            await enqueueIfPhoneOnFile(ownerId);
            try {
              await storage.createAuditLog({
                actorId: req.authUserId ?? null,
                action: "candidate.reclassify_as_smp",
                entityType: "candidate",
                entityId: ownerId,
                description: "smp-commit: phone-conflict resolved via reclassify",
                metadata: {
                  before: beforeOwner,
                  after: { classification: "smp", status: newStatus },
                  source: "smp-commit",
                  resolution: "phone_conflict_reclassify",
                  eventId: eventId ?? null,
                  jobId: jobId ?? null,
                } as any,
              } as any);
            } catch (e) {
              console.error("[smp-commit] audit log failed (phone_conflict reclassify):", e);
            }
            reclassified.push(ownerId);
            continue;
          }

          if (resolution === "transfer") {
            // Race-safe transfer: re-fetch the owner and confirm they still
            // hold the phone we expect. If the phone changed since validate
            // (concurrent edit or a prior commit row already moved it), skip
            // the row defensively rather than nulling someone unrelated.
            const expectedPhone = (result.row.phone || "").trim();
            if (!expectedPhone || owner.phone !== expectedPhone) {
              skipped.push(ownerId);
              continue;
            }
            // Also re-check that the new row's phone isn't already held by
            // a *different* candidate (another concurrent transfer could
            // have re-assigned it between validate and now).
            const currentHolder = await storage.getCandidateByPhone(expectedPhone);
            if (!currentHolder || currentHolder.id !== ownerId) {
              skipped.push(ownerId);
              continue;
            }

            await storage.updateCandidate(ownerId, { phone: null } as any);
            try {
              await invalidatePendingActivationSms(ownerId);
            } catch (e) {
              console.error("[smp-commit] phone-transfer invalidation failed:", e);
            }
            // Audit the destructive mutation on the prior phone owner —
            // their phone field was just nulled and any pending activation
            // SMS invalidated. Without this entry, the only forensic trail
            // for "why is this candidate's phone suddenly empty?" would be
            // the new-candidate audit row, which doesn't reference them.
            try {
              await storage.createAuditLog({
                actorId: req.authUserId ?? null,
                action: "candidate.phone_transferred_out",
                entityType: "candidate",
                entityId: ownerId,
                description: "smp-commit: phone nulled to make room for new SMP candidate (transfer resolution)",
                metadata: {
                  before: { phone: expectedPhone },
                  after: { phone: null },
                  source: "smp-commit",
                  resolution: "phone_conflict_transfer",
                  transferredToPhone: expectedPhone,
                  eventId: eventId ?? null,
                  jobId: jobId ?? null,
                } as any,
              } as any);
            } catch (e) {
              console.error("[smp-commit] audit log failed (phone_transferred_out):", e);
            }
            try {
              const row = result.row;
              const parsed = insertCandidateSchema.parse({
                fullNameEn: row.fullNameEn || row.name || "",
                nationalId: row.nationalId || null,
                phone:      row.phone || null,
                ibanNumber: row.ibanNumber || row.iban || undefined,
                classification: "smp",
                status: "awaiting_activation",
                profileCompleted: false,
              });
              // Task #133 — canonical write-time IBAN gate. Same helper
              // every other candidate write endpoint uses; validates,
              // canonicalises, fills bank metadata, mirrors hasIban.
              // No-op when the SMP row carries no IBAN.
              applyServerIbanFields(parsed);
              const newCandidate = await storage.createCandidate(parsed);
              await enqueueIfPhoneOnFile(newCandidate.id);
              try {
                await storage.createAuditLog({
                  actorId: req.authUserId ?? null,
                  action: "candidate.smp_created",
                  entityType: "candidate",
                  entityId: newCandidate.id,
                  description: "smp-commit: phone-conflict resolved via transfer (new SMP candidate created, phone moved from prior owner)",
                  metadata: {
                    after: {
                      classification: "smp",
                      status: "awaiting_activation",
                    },
                    source: "smp-commit",
                    resolution: "phone_conflict_transfer",
                    transferredFromCandidateId: ownerId,
                    eventId: eventId ?? null,
                    jobId: jobId ?? null,
                  } as any,
                } as any);
              } catch (e) {
                console.error("[smp-commit] audit log failed (phone_conflict transfer):", e);
              }
              created.push(newCandidate.id);
            } catch (parseErr) {
              // Compensating rollback: createCandidate failed after we
              // already nulled the previous holder's phone — restore it so
              // the worker isn't left phone-less.
              try {
                await storage.updateCandidate(ownerId, { phone: expectedPhone } as any);
              } catch (rbErr) {
                console.error("[smp-commit] phone-transfer rollback failed:", rbErr);
              }
              skipped.push(result.row.nationalId ?? result.row.fullNameEn ?? "?");
            }
            continue;
          }

          // Unknown resolution → defensive skip
          skipped.push(ownerId);
          continue;
        }

        if (result.status === "clean" && result.candidate) {
          // Re-check blockers via the single authority. Refuse if any.
          const candidateId = result.candidate.id;
          const [blockers] = await getCandidateBlockers([candidateId]);
          if (blockers && blockers.reasons.length > 0) {
            skipped.push(candidateId);
            continue;
          }
          // Flip classification to smp. Status flips to awaiting_activation
          // only if the candidate has no user account (un-activated).
          const cand = await storage.getCandidate(candidateId);
          if (!cand) { skipped.push(candidateId); continue; }
          const beforeClean = {
            classification: (cand as any).classification,
            status: (cand as any).status,
          };
          const newStatus = cand.userId ? cand.status : "awaiting_activation";
          await storage.updateCandidate(candidateId, {
            classification: "smp",
            status: newStatus as any,
          } as any);
          await enqueueIfPhoneOnFile(candidateId);
          try {
            await storage.createAuditLog({
              actorId: req.authUserId ?? null,
              action: "candidate.reclassify_as_smp",
              entityType: "candidate",
              entityId: candidateId,
              description: "smp-commit: clean row reclassified to SMP",
              metadata: {
                before: beforeClean,
                after: { classification: "smp", status: newStatus },
                source: "smp-commit",
                resolution: "clean",
                eventId: eventId ?? null,
                jobId: jobId ?? null,
              } as any,
            } as any);
          } catch (e) {
            console.error("[smp-commit] audit log failed (clean):", e);
          }
          reclassified.push(candidateId);
          continue;
        }

        if (result.status === "new") {
          // Race-guard: if nationalId now matches an existing candidate, treat as CLEAN.
          const row = result.row;
          if (row.nationalId) {
            const maybeExisting = await storage.getCandidateByNationalId(row.nationalId.trim());
            if (maybeExisting) {
              const [blockers] = await getCandidateBlockers([maybeExisting.id]);
              if (blockers && blockers.reasons.length > 0) {
                skipped.push(row.nationalId);
                continue;
              }
              const beforeNidMatch = {
                classification: (maybeExisting as any).classification,
                status: (maybeExisting as any).status,
              };
              const newStatus = maybeExisting.userId ? maybeExisting.status : "awaiting_activation";
              await storage.updateCandidate(maybeExisting.id, {
                classification: "smp",
                status: newStatus as any,
              } as any);
              await enqueueIfPhoneOnFile(maybeExisting.id);
              try {
                await storage.createAuditLog({
                  actorId: req.authUserId ?? null,
                  action: "candidate.reclassify_as_smp",
                  entityType: "candidate",
                  entityId: maybeExisting.id,
                  description: "smp-commit: NEW row matched existing nationalId — reclassified",
                  metadata: {
                    before: beforeNidMatch,
                    after: { classification: "smp", status: newStatus },
                    source: "smp-commit",
                    resolution: "new_matched_existing_nid",
                    eventId: eventId ?? null,
                    jobId: jobId ?? null,
                  } as any,
                } as any);
              } catch (e) {
                console.error("[smp-commit] audit log failed (new_matched_existing_nid):", e);
              }
              reclassified.push(maybeExisting.id);
              continue;
            }
          }
          try {
            const parsed = insertCandidateSchema.parse({
              fullNameEn: row.fullNameEn || row.name || "",
              nationalId:  row.nationalId || null,
              phone:        row.phone || null,
              ibanNumber:  row.ibanNumber || row.iban || undefined,
              classification: "smp",
              status: "awaiting_activation",
              profileCompleted: false,
            });
            // Task #133 — canonical write-time IBAN gate (mirrors the
            // phone-conflict NEW path above and the regular candidate
            // write endpoints). One source of truth shared with
            // storage.ts; no-op when the SMP row carries no IBAN.
            applyServerIbanFields(parsed);
            const newCandidate = await storage.createCandidate(parsed);
            await enqueueIfPhoneOnFile(newCandidate.id);
            try {
              await storage.createAuditLog({
                actorId: req.authUserId ?? null,
                action: "candidate.smp_created",
                entityType: "candidate",
                entityId: newCandidate.id,
                description: "smp-commit: NEW row created as SMP candidate",
                metadata: {
                  after: {
                    classification: "smp",
                    status: "awaiting_activation",
                  },
                  source: "smp-commit",
                  resolution: "new",
                  eventId: eventId ?? null,
                  jobId: jobId ?? null,
                } as any,
              } as any);
            } catch (e) {
              console.error("[smp-commit] audit log failed (new):", e);
            }
            created.push(newCandidate.id);
          } catch (parseErr) {
            skipped.push(row.nationalId ?? row.fullNameEn ?? "?");
          }
        }
      }

      return res.json({
        created: created.length,
        reclassified: reclassified.length,
        skipped: skipped.length,
        message: tr(req, "smp.batchCommitted", { created: created.length, attached: reclassified.length, skipped: skipped.length }),
      });
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ─── Task #107: SMP admin actions (reissue, send-to-onboarding, reclassify) ─

  // Bulk re-issue activation SMS for SMP candidates still in awaiting_activation.
  // Mints a fresh token (invalidating the previous live token via the unique
  // partial index) and enqueues a new SMS row with kind=smp_activation_reissue.
  app.post("/api/candidates/activation-tokens/reissue", requirePermission("candidates:smp_manage"), async (req: Request, res: Response) => {
    try {
      const { ids } = req.body as { ids?: string[] };
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: tr(req, "common.idsRequired") });
      }
      if (ids.length > 500) {
        return res.status(400).json({ message: tr(req, "candidate.bulkActionLimit") });
      }
      const { mintActivationToken } = await import("./activation-tokens");
      const { enqueueActivationSms } = await import("./sms-outbox");

      let reissued = 0, skipped = 0;
      const skippedReasons: { id: string; reason: string }[] = [];
      for (const id of ids) {
        const cand = await storage.getCandidate(id);
        if (!cand) { skipped++; skippedReasons.push({ id, reason: "not_found" }); continue; }
        if ((cand as any).classification !== "smp") { skipped++; skippedReasons.push({ id, reason: "not_smp" }); continue; }
        if (cand.userId) { skipped++; skippedReasons.push({ id, reason: "already_activated" }); continue; }
        if (!cand.phone) { skipped++; skippedReasons.push({ id, reason: "no_phone" }); continue; }
        const { plainToken, tokenRow } = await mintActivationToken(cand.id, req.authUserId ?? null);
        await enqueueActivationSms({
          candidateId: cand.id,
          recipientPhone: cand.phone,
          plainToken,
          tokenRowId: tokenRow.id,
          candidateLocale: ((cand as any).locale === "en" ? "en" : "ar"),
          kind: "smp_activation_reissue",
          dedupeKey: `activation:${tokenRow.id}`,
        });
        reissued++;
      }
      return res.json({ reissued, skipped, skippedReasons });
    } catch (err) {
      return handleError(res, err);
    }
  });

  // Bulk send activated SMP workers into the onboarding pipeline. Creates
  // an onboarding row per candidate (no application linkage, since SMP
  // workers do not apply individually). Refuses any id that's still
  // awaiting_activation or has any outstanding blocker.
  app.post("/api/candidates/send-to-onboarding", requirePermission("candidates:smp_manage"), async (req: Request, res: Response) => {
    try {
      const { ids, eventId } = req.body as { ids?: string[]; eventId?: string };
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: tr(req, "common.idsRequired") });
      }
      if (ids.length > 500) {
        return res.status(400).json({ message: tr(req, "candidate.bulkActionLimit") });
      }
      const { getCandidateBlockers } = await import("./candidate-blockers");
      const blockers = await getCandidateBlockers(ids);
      const blockerById = new Map(blockers.map((b) => [b.candidateId, b]));

      let onboarded = 0, skipped = 0;
      const skippedReasons: { id: string; reason: string }[] = [];

      for (const id of ids) {
        const cand = await storage.getCandidate(id);
        if (!cand) { skipped++; skippedReasons.push({ id, reason: "not_found" }); continue; }
        if ((cand as any).classification !== "smp") { skipped++; skippedReasons.push({ id, reason: "not_smp" }); continue; }
        if ((cand as any).status === "awaiting_activation" || !cand.userId) {
          skipped++; skippedReasons.push({ id, reason: "not_activated" }); continue;
        }
        const b = blockerById.get(id);
        if (b && b.reasons.length > 0) {
          skipped++; skippedReasons.push({ id, reason: b.reasons[0] }); continue;
        }
        try {
          await storage.createOnboardingRecord({
            candidateId: id,
            eventId: eventId ?? null,
            applicationId: null,
            status: "pending",
          } as any);
          onboarded++;
        } catch (e) {
          console.error(`[send-to-onboarding] ${id} failed:`, e);
          skipped++; skippedReasons.push({ id, reason: "create_failed" });
        }
      }
      return res.json({ onboarded, skipped, skippedReasons });
    } catch (err) {
      return handleError(res, err);
    }
  });

  // Reclassify SMP → Individual ONLY. (Task #107: the reverse direction is
  // intentionally NOT exposed as a button — the only path from individual to
  // SMP is the bulk SMP upload, which auto-flips matching NIDs in smp-commit.
  // A reverse button would let admins shortcut the SMP company stapling step.)
  //
  // Requires a non-trivial reason for the audit trail. Refuses if the
  // candidate has any outstanding blocker (active workforce, pending
  // onboarding, scheduled session, pending application). Atomic:
  //   1. Flip classification → individual, clear smpCompanyId
  //   2. Invalidate any live activation tokens (their SMP-mode link is dead)
  //   3. Invalidate any pending SMP activation SMS in the outbox
  //   4. Write an audit_log row capturing actor, before/after, reason
  app.post("/api/candidates/:id/reclassify-as-individual", requirePermission("candidates:smp_manage"), async (req: Request, res: Response) => {
    try {
      const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
      if (reason.length < 10) {
        return res.status(400).json({
          message: tr(req, "candidate.reclassifyReasonRequired"),
        });
      }
      const cand = await storage.getCandidate(req.params.id);
      if (!cand) return res.status(404).json({ message: tr(req, "candidate.notFound") });
      if ((cand as any).classification === "individual") {
        return res.json({ candidate: cand, changed: false });
      }
      const { getCandidateBlockers } = await import("./candidate-blockers");
      const [b] = await getCandidateBlockers([req.params.id]);
      if (b && b.reasons.length > 0) {
        return res.status(409).json({
          message: tr(req, "candidate.blockedByPipeline"),
          blockers: b.reasons,
        });
      }
      const before = {
        classification: (cand as any).classification,
        smpCompanyId: (cand as any).smpCompanyId ?? null,
        status: (cand as any).status,
      };
      // Order matters: invalidate the SMP activation surface BEFORE flipping
      // the classification, so there is never an instant where the candidate
      // appears as Individual while a live SMP-mode activation token or a
      // pending SMP-mode SMS in the outbox can still be consumed against
      // them. If we crash between steps, the candidate stays SMP with no
      // live tokens — the admin simply retries, which is safe and idempotent.
      try {
        const { invalidateAllTokensForCandidate } = await import("./activation-tokens");
        await invalidateAllTokensForCandidate(req.params.id);
      } catch (e) {
        console.error("[reclassify-as-individual] token invalidation failed:", e);
        return res.status(500).json({ message: tr(req, "candidate.reclassifyFailed") });
      }
      try {
        const { invalidatePendingActivationSms } = await import("./sms-outbox");
        await invalidatePendingActivationSms(req.params.id);
      } catch (e) {
        // Outbox invalidation is best-effort: even if a queued SMS slips out
        // post-flip, the token it carries is already invalidated above and
        // consume will reject it. Log and continue.
        console.error("[reclassify-as-individual] outbox invalidation failed:", e);
      }
      const updated = await storage.updateCandidate(req.params.id, {
        classification: "individual",
        smpCompanyId: null,
      } as any);
      // Audit trail.
      try {
        await storage.createAuditLog({
          actorId: req.authUserId ?? null,
          action: "candidate.reclassify_as_individual",
          entityType: "candidate",
          entityId: req.params.id,
          description: reason,
          metadata: {
            before,
            after: {
              classification: "individual",
              smpCompanyId: null,
              status: (updated as any)?.status ?? null,
            },
            reason,
          } as any,
        } as any);
      } catch (e) {
        console.error("[reclassify-as-individual] audit log failed:", e);
      }
      return res.json({ candidate: updated, changed: true });
    } catch (err) {
      return handleError(res, err);
    }
  });

  // Convert-to-SMP — mirror image of reclassify-as-individual. Flips a
  // single individual candidate to SMP classification with the same
  // safety envelope: hard precondition that the candidate has no active
  // pipeline records (workforce / onboarding / scheduled session / open
  // application), enforced via the single-source-of-truth blocker helper.
  // If the candidate has no user account yet, status is moved to
  // awaiting_activation and a fresh activation token + SMS is issued.
  app.post("/api/candidates/:id/reclassify-as-smp", requirePermission("candidates:smp_manage"), async (req: Request, res: Response) => {
    try {
      const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
      if (reason.length < 10) {
        return res.status(400).json({
          message: tr(req, "candidate.reclassifyReasonRequired"),
        });
      }
      const cand = await storage.getCandidate(req.params.id);
      if (!cand) return res.status(404).json({ message: tr(req, "candidate.notFound") });
      if ((cand as any).classification === "smp") {
        return res.json({ candidate: cand, changed: false });
      }
      // Single source of truth for "is this candidate currently entangled
      // with the individual workforce pipeline?". Refuse if anything is
      // live — switching classification mid-flight would corrupt the
      // employment record (a worker cannot be Individual-employed and
      // SMP-classified at the same time).
      const { getCandidateBlockers } = await import("./candidate-blockers");
      const [b] = await getCandidateBlockers([req.params.id]);
      if (b && b.reasons.length > 0) {
        return res.status(409).json({
          message: tr(req, "candidate.blockedByPipeline"),
          blockers: b.reasons,
        });
      }
      const before = {
        classification: (cand as any).classification,
        smpCompanyId: (cand as any).smpCompanyId ?? null,
        status: (cand as any).status,
      };
      // Defense in depth: invalidate any stray live activation surface
      // before flipping classification, identical to the reverse direction.
      // For an individual→SMP flip this is normally a no-op (individuals
      // don't have activation tokens), but it costs nothing and prevents
      // a stale token surviving an admin who flipped back-and-forth.
      try {
        const { invalidateAllTokensForCandidate } = await import("./activation-tokens");
        await invalidateAllTokensForCandidate(req.params.id);
      } catch (e) {
        console.error("[reclassify-as-smp] token invalidation failed:", e);
        return res.status(500).json({ message: tr(req, "candidate.reclassifyFailed") });
      }
      try {
        const { invalidatePendingActivationSms } = await import("./sms-outbox");
        await invalidatePendingActivationSms(req.params.id);
      } catch (e) {
        console.error("[reclassify-as-smp] outbox invalidation failed:", e);
      }
      // TOCTOU mitigation: re-check blockers immediately before the
      // classification update. The first check above gates early-return
      // (saves the token-invalidation work), but a workforce / onboarding
      // / interview / application row could have been inserted in the
      // window between then and now. The reverse endpoint has the same
      // pattern; matching it here keeps the two paths symmetric. A full
      // fix would require a single transaction that locks workforce +
      // onboarding + interviews + applications by candidateId — deferred
      // as a cross-cutting refactor for both directions.
      const [b2] = await getCandidateBlockers([req.params.id]);
      if (b2 && b2.reasons.length > 0) {
        return res.status(409).json({
          message: tr(req, "candidate.blockedByPipeline"),
          blockers: b2.reasons,
        });
      }
      // Flip classification. If the candidate has no user account yet,
      // also move them into awaiting_activation so the portal gates apply
      // and the activation SMS we're about to enqueue has a target state.
      const newStatus = (cand as any).userId ? (cand as any).status : "awaiting_activation";
      const updated = await storage.updateCandidate(req.params.id, {
        classification: "smp",
        status: newStatus as any,
      } as any);
      // If the candidate is un-activated and has a phone on file, mint a
      // fresh activation token and enqueue the SMS via the outbox — same
      // path smp-commit uses for CLEAN rows.
      if (!(cand as any).userId && (cand as any).phone) {
        try {
          const { mintActivationToken } = await import("./activation-tokens");
          const { enqueueActivationSms } = await import("./sms-outbox");
          const { plainToken, tokenRow } = await mintActivationToken(req.params.id, req.authUserId ?? null);
          await enqueueActivationSms({
            candidateId: req.params.id,
            recipientPhone: (cand as any).phone,
            plainToken,
            tokenRowId: tokenRow.id,
            candidateLocale: "ar",
            kind: "smp_activation",
            dedupeKey: `activation:${tokenRow.id}`,
          });
        } catch (e) {
          // Best-effort: classification is already flipped. Admin can
          // retry via the Resend Activation row action.
          console.error("[reclassify-as-smp] activation SMS enqueue failed:", e);
        }
      }
      try {
        await storage.createAuditLog({
          actorId: req.authUserId ?? null,
          action: "candidate.reclassify_as_smp",
          entityType: "candidate",
          entityId: req.params.id,
          description: reason,
          metadata: {
            before,
            after: {
              classification: "smp",
              smpCompanyId: (updated as any)?.smpCompanyId ?? null,
              status: (updated as any)?.status ?? null,
            },
            reason,
          } as any,
        } as any);
      } catch (e) {
        console.error("[reclassify-as-smp] audit log failed:", e);
      }
      return res.json({ candidate: updated, changed: true });
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ─── Events ──────────────────────────────────────────────────────────────
  app.get("/api/events", requirePermission("events:read"), async (req: Request, res: Response) => {
    try {
      const includeArchived = req.query.archived === "true";
      const data = await storage.getEvents({ includeArchived });
      return res.json(data);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.get("/api/events/:id", requirePermission("events:read"), async (req: Request, res: Response) => {
    try {
      const evt = await storage.getEvent(req.params.id);
      if (!evt) return res.status(404).json({ message: tr(req, "event.notFound") });
      return res.json(evt);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.post("/api/events", requirePermission("events:create"), async (req: Request, res: Response) => {
    try {
      const data = insertEventSchema.parse(normalizeBlankFields({ ...req.body }, EVENT_BLANK_FIELDS));
      const evt = await storage.createEvent(data);
      storage.createAdminAlert(
        "New event created",
        `"${evt.name}" has been created${evt.startDate ? ` — starts ${evt.startDate}` : ""}.`,
        { eventId: evt.id, action: "created" }
      ).catch(() => {});
      return res.status(201).json(evt);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.patch("/api/events/:id", requirePermission("events:update"), async (req: Request, res: Response) => {
    try {
      const data = insertEventSchema.partial().parse(normalizeBlankFields({ ...req.body }, EVENT_BLANK_FIELDS));
      const evt = await storage.updateEvent(req.params.id, data);
      if (!evt) return res.status(404).json({ message: tr(req, "event.notFound") });
      return res.json(evt);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.post("/api/events/:id/close", requirePermission("events:close"), async (req: Request, res: Response) => {
    try {
      const actorId = (req as any).userId ?? undefined;
      const evt = await storage.closeEvent(req.params.id);
      if (!evt) return res.status(404).json({ message: tr(req, "event.notFound") });
      await storage.createAuditLog({
        actorId,
        action: "event.closed",
        entityType: "event",
        entityId: evt.id,
        description: `Event "${evt.name}" was manually closed`,
        metadata: { eventName: evt.name, endDate: evt.endDate },
      });
      storage.createAdminAlert(
        "Event closed",
        `"${evt.name}" has been manually closed.`,
        { eventId: evt.id, action: "closed" }
      ).catch(() => {});
      return res.json(evt);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.post("/api/events/:id/reopen", requirePermission("events:reopen"), async (req: Request, res: Response) => {
    try {
      const actorId = (req as any).userId ?? undefined;
      const { reason } = req.body as { reason?: string };
      const evt = await storage.reopenEvent(req.params.id);
      if (!evt) return res.status(404).json({ message: tr(req, "event.notFound") });
      await storage.createAuditLog({
        actorId,
        action: "event.reopened",
        entityType: "event",
        entityId: evt.id,
        description: `Event "${evt.name}" was reopened${reason ? ` — ${reason}` : ""}`,
        metadata: { eventName: evt.name, reason: reason ?? null },
      });
      storage.createAdminAlert(
        "Event reopened",
        `"${evt.name}" has been reopened${reason ? ` — ${reason}` : ""}.`,
        { eventId: evt.id, action: "reopened" }
      ).catch(() => {});
      return res.json(evt);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.post("/api/events/:id/archive", requirePermission("events:archive"), async (req: Request, res: Response) => {
    try {
      const evt = await storage.archiveEvent(req.params.id);
      if (!evt) return res.status(404).json({ message: tr(req, "event.notFound") });
      storage.createAdminAlert(
        "Event archived",
        `"${evt.name}" has been archived.`,
        { eventId: evt.id, action: "archived" }
      ).catch(() => {});
      return res.json(evt);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.post("/api/events/:id/unarchive", requirePermission("events:archive"), async (req: Request, res: Response) => {
    try {
      const evt = await storage.unarchiveEvent(req.params.id);
      if (!evt) return res.status(404).json({ message: tr(req, "event.notFound") });
      storage.createAdminAlert(
        "Event unarchived",
        `"${evt.name}" has been unarchived and restored to active.`,
        { eventId: evt.id, action: "unarchived" }
      ).catch(() => {});
      return res.json(evt);
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ─── Job Postings ─────────────────────────────────────────────────────────
  app.get("/api/jobs", requireAuth, async (req: Request, res: Response) => {
    try {
      const { status, eventId } = req.query as Record<string, string>;
      const isAdminReader = req.authIsSuperAdmin || req.authPermissions?.has("jobs:read");
      // Non-admins (candidates) can only see active jobs.
      const effectiveStatus = isAdminReader ? status : "active";
      const data = await storage.getJobPostings({ status: effectiveStatus, eventId });
      return res.json(data);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.get("/api/jobs/stats", requirePermission("jobs:read"), async (_req: Request, res: Response) => {
    try {
      const stats = await storage.getJobStats();
      return res.json(stats);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.get("/api/jobs/:id", markPublic, async (req: Request, res: Response) => {
    try {
      const job = await storage.getJobPosting(req.params.id);
      if (!job) return res.status(404).json({ message: tr(req, "job.notFound") });
      const userId = getAuthUserId(req);
      if (!userId && job.status !== "active") {
        return res.status(404).json({ message: tr(req, "job.notFound") });
      }
      return res.json(job);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.post("/api/jobs", requirePermission("jobs:create"), async (req: Request, res: Response) => {
    try {
      const body = normalizeBlankFields({ ...req.body }, JOB_BLANK_FIELDS);
      if (typeof body.salaryMin === "number") body.salaryMin = String(body.salaryMin);
      if (typeof body.salaryMax === "number") body.salaryMax = String(body.salaryMax);
      const data = insertJobPostingSchema.parse(body);
      const job = await storage.createJobPosting(data);
      return res.status(201).json(job);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.patch("/api/jobs/:id", requirePermission("jobs:update"), async (req: Request, res: Response) => {
    try {
      const body = normalizeBlankFields({ ...req.body }, JOB_BLANK_FIELDS);
      if (typeof body.salaryMin === "number") body.salaryMin = String(body.salaryMin);
      if (typeof body.salaryMax === "number") body.salaryMax = String(body.salaryMax);
      const data = insertJobPostingSchema.partial().parse(body);
      const job = await storage.updateJobPosting(req.params.id, data);
      if (!job) return res.status(404).json({ message: tr(req, "job.notFound") });
      return res.json(job);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.post("/api/jobs/:id/archive", requirePermission("jobs:archive"), async (req: Request, res: Response) => {
    try {
      const archived = await storage.archiveJobPosting(req.params.id);
      if (!archived) return res.status(404).json({ message: tr(req, "job.notFoundOrArchived") });
      return res.json({ success: true });
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.post("/api/jobs/:id/unarchive", requirePermission("jobs:archive"), async (req: Request, res: Response) => {
    try {
      const restored = await storage.unarchiveJobPosting(req.params.id);
      if (!restored) return res.status(404).json({ message: tr(req, "job.notFound") });
      return res.json({ success: true });
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ─── Applications ─────────────────────────────────────────────────────────
  app.get("/api/applications", requireAuth, async (req: Request, res: Response) => {
    try {
      const { jobId, candidateId, status } = req.query as Record<string, string>;
      const isAdminReader = req.authIsSuperAdmin || req.authPermissions?.has("applications:read");
      if (!isAdminReader) {
        // Self-service: candidate may only query their own applications.
        const myCandidate = await storage.getCandidateByUserId(req.authUserId!);
        if (!myCandidate || !candidateId || candidateId !== myCandidate.id) {
          return res.status(403).json({ message: tr(req, "auth.noPermission"), required: "applications:read" });
        }
      }
      const data = await storage.getApplications({ jobId, candidateId, status, includeCandidate: isAdminReader });
      return res.json(data);
    } catch (err) {
      return handleError(res, err);
    }
  });

  // Paginated applicant list (applications joined with candidate names) for interview scheduling
  app.get("/api/applications/applicants", requirePermission("applications:read"), async (req: Request, res: Response) => {
    try {
      const { jobId, page = "1", limit = "20", search } = req.query as Record<string, string>;
      if (!jobId) return res.status(400).json({ error: tr(req, "common.jobIdRequired") });
      const result = await storage.getApplicantsForJob({
        jobId,
        page: Math.max(1, parseInt(page, 10) || 1),
        limit: Math.min(200, Math.max(1, parseInt(limit, 10) || 20)),
        search,
      });
      return res.json(result);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.get("/api/applications/stats", requirePermission("applications:read"), async (_req: Request, res: Response) => {
    try {
      const stats = await storage.getApplicationStats();
      return res.json(stats);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.post("/api/applications", requireAuth, async (req: Request, res: Response) => {
    try {
      const data = insertApplicationSchema.parse(normalizeBlankFields({ ...req.body }, APPLICATION_BLANK_FIELDS));

      // Authorization: admin with applications:create OR candidate applying on own behalf.
      const isAdmin = req.authIsSuperAdmin || req.authPermissions?.has("applications:create");
      if (!isAdmin) {
        const myCand = await storage.getCandidateByUserId(req.authUserId!);
        if (!myCand || !data.candidateId || myCand.id !== data.candidateId) {
          return res.status(403).json({ message: tr(req, "application.ownOnly") });
        }
        // Hard gate: a candidate may only apply once their profile is complete.
        // Without this server-side check the only enforcement is the
        // ProfileSetupGate component, which is trivially bypassed by closing
        // the browser tab right after registration and navigating directly to
        // a public job URL. Result was candidates landing in the recruiter's
        // pipeline with no city / IBAN / emergency contact / etc.
        if (!(myCand as any).profileCompleted) {
          return res.status(412).json({
            message: tr(req, "application.profileIncomplete"),
            code: "PROFILE_INCOMPLETE",
          });
        }
      }


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
            message: tr(req, "smp.cannotApplyActiveSmp"),
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
            ob => ob.status !== "converted" && ob.status !== "rejected" && ob.status !== "terminated"
          );
          if (pendingOnboarding) {
            return res.status(409).json({
              message: tr(req, "smp.cannotApplyOnboarding"),
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
              ob.status !== "terminated" &&
              !ob.applicationId // SMP onboardings have no job application linkage
          );
          if (pendingSmpOnboarding) {
            return res.status(409).json({
              message: tr(req, "smp.cannotApplyOnboarding"),
            });
          }
        }
      }

      // Task #107: Single-authority SMP-exclusion gate. The inline
      // workforce/onboarding checks above predate the classification authority
      // and are kept for back-compat; the new classification check is the
      // canonical individual-pipeline filter.
      if (data.candidateId) {
        try {
          const { assertIndividualPipelineEligible } = await import("./pipeline-eligibility");
          await assertIndividualPipelineEligible([data.candidateId]);
        } catch (e: any) {
          if (e?.code === "SMP_NOT_ELIGIBLE") {
            return res.status(400).json({ message: tr(req, "pipeline.smpNotEligible"), blockedIds: e.blockedIds });
          }
          throw e;
        }
      }

      const app_ = await storage.createApplication(data);
      return res.status(201).json(app_);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.patch("/api/applications/:id", requirePermission("applications:update"), async (req: Request, res: Response) => {
    try {
      const data = insertApplicationSchema.partial().parse(normalizeBlankFields({ ...req.body }, APPLICATION_BLANK_FIELDS));

      // Task #107: if this PATCH mutates candidateId, the new candidate must
      // be Individual-classified — SMP candidates are not allowed in the
      // applications pipeline.
      if ((data as any).candidateId) {
        try {
          const { assertIndividualPipelineEligible } = await import("./pipeline-eligibility");
          await assertIndividualPipelineEligible([(data as any).candidateId]);
        } catch (e: any) {
          if (e?.code === "SMP_NOT_ELIGIBLE") {
            return res.status(400).json({ message: tr(req, "pipeline.smpNotEligible"), blockedIds: e.blockedIds });
          }
          throw e;
        }
      }

      // Manual "Reset Like" path: wrap the application-status update and
      // the shared shortlist-reset cleanup in a single `db.transaction`
      // so the manual flow gets the same all-or-nothing guarantee that
      // task #219 gave the auto-elimination flow. Status flip + orphan
      // onboarding teardown + audit log all commit together; if any
      // step throws, Postgres rolls everything back so we never leave
      // behind a non-shortlisted application paired with a still-active
      // onboarding row (the partial state task #223 closed off).
      //
      // RBAC note: this is a system-driven invariant — admins with
      // applications:update implicitly trigger an onboarding row removal
      // here. This is intentional per the product rule "always sync both
      // ways with likes and resets" and is reflected in the audit log.
      const { applyApplicationStatusUpdate } = await import("./application-status-cleanup");
      const app_ = await applyApplicationStatusUpdate({
        applicationId: req.params.id,
        data,
        actor: {
          id: req.authUserId ?? null,
          name: req.authUser?.fullName ?? req.authUser?.username ?? "admin",
        },
      });
      if (!app_) return res.status(404).json({ message: tr(req, "application.notFound") });

      return res.json(app_);
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ─── Interviews ───────────────────────────────────────────────────────────
  app.get("/api/interviews", requireAuth, async (req: Request, res: Response) => {
    try {
      const { status, candidateId, eventId } = req.query as Record<string, string>;
      const isAdmin = req.authIsSuperAdmin || req.authPermissions?.has("interviews:read");
      if (!isAdmin) {
        // Self-service: candidate may only query their own interviews.
        const own = await storage.getCandidateByUserId(req.authUserId!);
        if (!own || !candidateId || candidateId !== own.id) {
          return res.status(403).json({ message: tr(req, "auth.noPermission"), required: "interviews:read" });
        }
      }
      const data = await storage.getInterviews({ status, candidateId, eventId });
      return res.json(data);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.get("/api/interviews/stats", requirePermission("interviews:read"), async (_req: Request, res: Response) => {
    try {
      const stats = await storage.getInterviewStats();
      return res.json(stats);
    } catch (err) {
      return handleError(res, err);
    }
  });

  // Must be before /:id to avoid "stats" being treated as an id
  app.get("/api/interviews/:id", requirePermission("interviews:read"), async (req: Request, res: Response) => {
    try {
      const detail = await storage.getInterviewDetail(req.params.id);
      if (!detail) return res.status(404).json({ message: tr(req, "interview.notFound") });
      return res.json(detail);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.post("/api/interviews", requirePermission("interviews:create"), async (req: Request, res: Response) => {
    try {
      const data = insertInterviewSchema.parse(req.body);

      // Task #107: scheduled-session pipeline is individual-classification-only.
      // Reject the entire request if any invitee (or single-candidate target)
      // is classified=smp.
      const inviteeIds: string[] = [
        ...(Array.isArray((data as any).invitedCandidateIds) ? (data as any).invitedCandidateIds : []),
        ...(((data as any).candidateId) ? [(data as any).candidateId] : []),
      ];
      if (inviteeIds.length > 0) {
        try {
          const { assertIndividualPipelineEligible } = await import("./pipeline-eligibility");
          await assertIndividualPipelineEligible(inviteeIds);
        } catch (e: any) {
          if (e?.code === "SMP_NOT_ELIGIBLE") {
            return res.status(400).json({ message: tr(req, "pipeline.smpNotEligible"), blockedIds: e.blockedIds });
          }
          throw e;
        }
      }

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

            const resolved = (interview.notes ?? "")
              .replace(/\{\{batch\}\}/g,    interview.groupName   ?? "")
              .replace(/\{\{date\}\}/g,     date)
              .replace(/\{\{time\}\}/g,     time)
              .replace(/\{\{venue\}\}/g,    interview.type        ?? "")
              .replace(/\{\{location\}\}/g, interview.meetingUrl  ?? "");

            for (const candidateId of interview.invitedCandidateIds ?? []) {
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

  app.patch("/api/interviews/:id", requirePermission("interviews:update"), async (req: Request, res: Response) => {
    try {
      const data = insertInterviewSchema.partial().parse(req.body);

      // Task #107: scheduled-session pipeline is individual-only. If this
      // PATCH mutates candidateId or invitedCandidateIds, every new id must
      // be Individual-classified.
      const inviteeIds: string[] = [
        ...(Array.isArray((data as any).invitedCandidateIds) ? (data as any).invitedCandidateIds : []),
        ...(((data as any).candidateId) ? [(data as any).candidateId] : []),
      ];
      if (inviteeIds.length > 0) {
        try {
          const { assertIndividualPipelineEligible } = await import("./pipeline-eligibility");
          await assertIndividualPipelineEligible(inviteeIds);
        } catch (e: any) {
          if (e?.code === "SMP_NOT_ELIGIBLE") {
            return res.status(400).json({ message: tr(req, "pipeline.smpNotEligible"), blockedIds: e.blockedIds });
          }
          throw e;
        }
      }

      const interview = await storage.updateInterview(req.params.id, data);
      if (!interview) return res.status(404).json({ message: tr(req, "interview.notFound") });

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

  // ─── Bulk shortlist applications (interviews flow only) ───────────────────
  // Dedicated, scope-limited endpoint: the only legitimate caller is the
  // interviews page bulk-shortlist action. The previous generic bulk-status
  // endpoint was retired alongside the applicants-import drop (task #65) so
  // there is no longer a path for arbitrary status changes via spreadsheet.
  app.post("/api/applications/bulk-shortlist", requirePermission("applications:bulk_shortlist"), async (req: Request, res: Response) => {
    try {
      const { updates } = z.object({
        updates: z.array(z.object({
          id: z.string(),
          status: z.literal("shortlisted"),
        })).min(1),
      }).parse(req.body);

      const results: { id: string; success: boolean; error?: string }[] = [];
      for (const u of updates) {
        try {
          const updated = await storage.updateApplication(u.id, { status: u.status });
          results.push({ id: u.id, success: !!updated });
        } catch {
          results.push({ id: u.id, success: false, error: tr(req, "error.updateFailed") });
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
  app.get("/api/onboarding", requireAuth, async (req: Request, res: Response) => {
    try {
      const { status, eventId, candidateId } = req.query as Record<string, string>;
      const isAdmin = req.authIsSuperAdmin || req.authPermissions?.has("onboarding:read");
      if (!isAdmin) {
        // Self-service: candidate may only query their own onboarding records.
        const own = await storage.getCandidateByUserId(req.authUserId!);
        if (!own || !candidateId || candidateId !== own.id) {
          return res.status(403).json({ message: tr(req, "auth.noPermission"), required: "onboarding:read" });
        }
      }
      const records = await storage.getOnboardingRecords({ status, eventId, candidateId });
      // Task #214: enrich each pending row with the derived reminder
      // schedule so the pipeline can render bell + pip-strip without a
      // second round-trip to /api/onboarding/reminders/status.
      const { getReminderConfig, computeRowStatus, loadReminderEventsForRows } = await import("./onboarding-reminders");
      const cfg = await getReminderConfig();
      const now = new Date();
      const eventsByRow = await loadReminderEventsForRows(records.map((r) => r.id));
      // Hotfix: the pipeline UI was rendering "record.unknown" for any
      // onboarding row whose candidate fell outside the client's
      // paginated /api/candidates?limit=1000 lookup (e.g. tenants with
      // > 1000 candidates, where the older onboarded ones drop off the
      // first page sorted by createdAt DESC). Denormalise the small
      // candidate summary the pipeline actually displays — name, IDs,
      // phone, classification, archived flag — so the client never has
      // to chase a missing row through a second paginated round-trip.
      const candidateIds = Array.from(new Set(records.map((r) => r.candidateId).filter((id): id is string => Boolean(id))));
      // Single source of truth for the summary shape — keep storage,
      // route, and client (onboarding.tsx getCandidateFor) aligned.
      const candidateSummaries: Awaited<ReturnType<typeof storage.getCandidateSummariesByIds>> = candidateIds.length > 0
        ? await storage.getCandidateSummariesByIds(candidateIds)
        : new Map();
      // Auto-heal pass: derive each record's prerequisite booleans + readiness
      // status from the candidate's actual file URLs (single source of truth).
      // The shadow flags on `onboarding_records` can drift, most notably because
      // `applyServerIbanFields` flips `candidate.hasIban=true` from the IBAN
      // *number* alone — which then cascades into `onboarding.hasIban=true` at
      // record-creation time. Existing drifted rows (e.g. national-ID
      // 1075054286 / عبدالله العيسي) get silently corrected here so the UI
      // never lies, and we persist the correction so the conversion gate at
      // `convertOnboardingToEmployee` sees the right `status` too.
      const correctedById = new Map<string, { hasPhoto: boolean; hasIban: boolean; hasNationalId: boolean; hasVaccinationReport: boolean; status: typeof records[number]["status"] }>();
      for (const rec of records) {
        if (rec.status === "converted" || rec.status === "rejected" || rec.status === "terminated") continue;
        const cand = candidateSummaries.get(rec.candidateId) ?? null;
        if (!cand) continue;
        const truePhoto = !!cand.photoUrl;
        const trueIban = !!cand.ibanFileUrl
          || (typeof cand.ibanNumber === "string" && cand.ibanNumber.startsWith("/uploads/"));
        const trueNid = !!cand.nationalIdFileUrl;
        const trueVax = !!cand.vaccinationReportFileUrl;
        const isSmpRec = !rec.applicationId;
        const recomputed = computeOnboardingStatus(
          { hasPhoto: truePhoto, hasIban: trueIban, hasNationalId: trueNid, hasVaccinationReport: trueVax, hasSignedContract: rec.hasSignedContract ?? undefined },
          isSmpRec,
        );
        const drifted =
          (rec.hasPhoto ?? false) !== truePhoto
          || (rec.hasIban ?? false) !== trueIban
          || (rec.hasNationalId ?? false) !== trueNid
          || (rec.hasVaccinationReport ?? false) !== trueVax
          || rec.status !== recomputed;
        if (drifted) {
          correctedById.set(rec.id, { hasPhoto: truePhoto, hasIban: trueIban, hasNationalId: trueNid, hasVaccinationReport: trueVax, status: recomputed });
          // Persist asynchronously — don't block the GET response. If the
          // write fails, the next GET will simply re-attempt the heal.
          storage.updateOnboardingRecord(rec.id, {
            hasPhoto: truePhoto,
            hasIban: trueIban,
            hasNationalId: trueNid,
            hasVaccinationReport: trueVax,
            status: recomputed,
          }).catch((e) => console.warn(`[onboarding:auto-heal] failed for record=${rec.id} candidate=${rec.candidateId} nationalId=${cand.nationalId ?? "?"}:`, e));
        }
      }
      const enriched = records.map((rec) => {
        const corrected = correctedById.get(rec.id);
        const effective = corrected ? { ...rec, ...corrected } : rec;
        const events = eventsByRow.get(rec.id) ?? [];
        const status = computeRowStatus(effective, cfg, now, events);
        const cand = candidateSummaries.get(rec.candidateId) ?? null;
        return {
          ...effective,
          candidate: cand,
          reminder: {
            enabled: cfg.enabled,
            paused: rec.remindersPausedAt != null,
            count: rec.reminderCount ?? 0,
            max: cfg.maxReminders,
            lastSentAt: rec.lastReminderSentAt?.toISOString() ?? null,
            nextScheduledAt: status.nextScheduledAt,
            eliminationAt: status.eliminationAt,
            finalWarningAt: status.finalWarningAt,
            finalWarningSentAt: status.finalWarningSentAt,
            state: status.state,
            missingDocs: status.missingDocs,
            events,
          },
        };
      });
      return res.json(enriched);
    } catch (err) {
      return handleError(res, err);
    }
  });

  // Tight, purpose-built endpoint that powers the "Admit Candidate" dialog
  // on /onboarding. Replaces the old client-side filter that fanned out the
  // full /api/applications response (every application + joined candidate).
  // The eligibility rules live in SQL (status='shortlisted' AND not archived
  // AND no active onboarding row) and the result set is already deduped per
  // candidate, so the dialog opens in milliseconds even on tenants with
  // thousands of applications. RBAC mirrors the existing list endpoint:
  // requires applications:read (the previous data-source's gate).
  //
  // Registered BEFORE /api/onboarding/:id to win Express's first-match.
  app.get("/api/onboarding/admit-eligible", requirePermission("applications:read"), async (_req: Request, res: Response) => {
    try {
      const data = await storage.getAdmitEligibleCandidates();
      return res.json(data);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.post("/api/onboarding/bulk-convert", requirePermission("onboarding:bulk_convert"), async (req: Request, res: Response) => {
    try {
      // employmentType can be explicitly provided for the whole batch, or derived
      // per-record from the onboarding record's applicationId:
      //   applicationId === null → SMP onboarding → employmentType = "smp"
      //   applicationId !== null → individual job application → employmentType = "individual"
      const { ids, startDate, eventId, salary, smpCompanyId, employmentType: batchEmploymentType } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: tr(req, "common.idsRequired") });
      if (!startDate) return res.status(400).json({ message: tr(req, "common.startDateRequired") });
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
          // SMP workers must be linked to a company
          if (resolvedEmploymentType === "smp" && !smpCompanyId) {
            errors.push({ id, message: tr(req, "smp.companyIdRequired") });
            continue;
          }
          // Only pass smpCompanyId for SMP workers — individual workers must have it null
          const resolvedSmpCompanyId = resolvedEmploymentType === "smp" ? smpCompanyId : undefined;
          const wf = await storage.convertOnboardingToEmployee(
            id,
            { startDate, eventId, salary, smpCompanyId: resolvedSmpCompanyId, employmentType: resolvedEmploymentType },
            (req as any).userId,
          );
          results.push(wf);
        } catch (e: any) {
          errors.push({ id, message: e?.message || "conversion failed" });
        }
      }
      if (results.length > 0) {
        await logAudit(req, {
          action: "workforce.bulk_converted",
          entityType: "workforce",
          description: `Bulk-converted ${results.length} of ${uniqueIds.length} candidate(s) to employees`,
          metadata: { converted: results.length, failed: errors.length, total: uniqueIds.length },
        });
      }
      const status = results.length === 0 && errors.length > 0 ? 422 : results.length > 0 ? 201 : 200;
      return res.status(status).json({ converted: results.length, errors, total: uniqueIds.length });
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ─── Task #214: Onboarding document-upload reminders ─────────────────────
  // GET  /api/onboarding/reminder-settings        — config + 4 templates
  // PUT  /api/onboarding/reminder-settings        — patch config and/or templates
  // GET  /api/onboarding/reminders/status         — derived per-row status array (legacy, kept for back-compat)
  // POST /api/onboarding/reminder-test-sms        — send a one-off SMS to verify the template & gateway
  // POST /api/onboarding/:id/send-reminder-now    — manual reminder
  // POST /api/onboarding/:id/pause-reminders      — pause this row
  // POST /api/onboarding/:id/resume-reminders     — resume this row
  app.get("/api/onboarding/reminder-settings", requirePermission("onboarding:read"), async (_req: Request, res: Response) => {
    try {
      const { getReminderConfig, getAllReminderTemplates } = await import("./onboarding-reminders");
      const [config, templates] = await Promise.all([getReminderConfig(), getAllReminderTemplates()]);
      return res.json({ config, templates });
    } catch (err) { return handleError(res, err); }
  });

  app.put("/api/onboarding/reminder-settings", requirePermission("onboarding:update"), async (req: Request, res: Response) => {
    try {
      const { setReminderConfig, setReminderTemplates, getAllReminderTemplates, getReminderConfig } = await import("./onboarding-reminders");
      const reminderDocSchema = z.enum(["photo", "iban", "national_id"]);
      const configPatchSchema = z.object({
        enabled: z.boolean().optional(),
        firstAfterHours: z.number().int().min(0).optional(),
        repeatEveryHours: z.number().int().min(0).optional(),
        maxReminders: z.number().int().min(0).optional(),
        totalDeadlineDays: z.number().int().min(0).optional(),
        finalWarningHours: z.number().int().min(0).optional(),
        quietHoursStart: z.string().optional(),
        quietHoursEnd: z.string().optional(),
        quietHoursTz: z.string().optional(),
        requiredDocs: z.array(reminderDocSchema).optional(),
      }).strict();
      const templatesPatchSchema = z.object({
        onboarding_reminder_sms_ar: z.string().optional(),
        onboarding_reminder_sms_en: z.string().optional(),
        onboarding_final_warning_sms_ar: z.string().optional(),
        onboarding_final_warning_sms_en: z.string().optional(),
      }).strict();
      const bodySchema = z.object({
        config: configPatchSchema.optional(),
        templates: templatesPatchSchema.optional(),
      }).strict();
      const body = bodySchema.parse(req.body ?? {});
      const config = body.config !== undefined ? await setReminderConfig(body.config) : await getReminderConfig();
      const templates = body.templates !== undefined ? await setReminderTemplates(body.templates) : await getAllReminderTemplates();
      await logAudit(req, {
        action: "onboarding.reminders.settings_updated",
        entityType: "system_setting",
        entityId: "onboarding_reminder_config",
        description: `Updated onboarding reminder settings (enabled=${config.enabled}, first=${config.firstAfterHours}h, repeat=${config.repeatEveryHours}h, max=${config.maxReminders}, deadline=${config.totalDeadlineDays}d, templatesPatched=${body.templates ? "yes" : "no"}).`,
        metadata: { config, templatesPatched: body.templates ? Object.keys(body.templates) : [] },
      });
      return res.json({ config, templates });
    } catch (err) { return handleError(res, err); }
  });

  app.get("/api/onboarding/reminders/status", requirePermission("onboarding:read"), async (_req: Request, res: Response) => {
    try {
      const { getReminderStatusMap } = await import("./onboarding-reminders");
      return res.json(await getReminderStatusMap());
    } catch (err) { return handleError(res, err); }
  });

  // POST /api/onboarding/reminder-test-sms — sync test send.
  // Response contract on every path: { ok, preview, error? }.
  app.post("/api/onboarding/reminder-test-sms", requirePermission("onboarding:update"), async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        phone: z.string().trim().min(5),
        variant: z.enum(["regular", "final"]).default("regular"),
        locale: z.enum(["ar", "en"]).default("ar"),
      });
      const parsed = schema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          ok: false,
          preview: "",
          error: "validation_failed",
          details: parsed.error.flatten(),
        });
      }
      const { phone, variant, locale } = parsed.data;
      const { getReminderTemplate, renderReminderTemplate } = await import("./onboarding-reminders");
      const tplKey = (variant === "final"
        ? (locale === "ar" ? "onboarding_final_warning_sms_ar" : "onboarding_final_warning_sms_en")
        : (locale === "ar" ? "onboarding_reminder_sms_ar"      : "onboarding_reminder_sms_en")) as
          "onboarding_reminder_sms_ar" | "onboarding_reminder_sms_en"
          | "onboarding_final_warning_sms_ar" | "onboarding_final_warning_sms_en";
      const tpl = await getReminderTemplate(tplKey);
      const portalBase = (await storage.getSystemSetting("public_app_url"))
        ?? process.env.PUBLIC_APP_URL
        ?? "https://workforce.tanaqolapp.com";
      const message = renderReminderTemplate(tpl, {
        name: locale === "ar" ? "مرشح تجريبي" : "Test Candidate",
        missingDocs: locale === "ar" ? "صورة شخصية، رقم الآيبان، تقرير التطعيم" : "photo, IBAN, vaccination report",
        portalUrl: `${portalBase.replace(/\/$/, "")}/candidate/onboarding`,
        deadlineDate: new Date(Date.now() + 24 * 3600_000).toLocaleString(locale === "ar" ? "ar-SA" : "en-GB", {
          timeZone: "Asia/Riyadh", year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit",
        }),
      });
      const { sendSmsViaPlugin } = await import("./sms-sender");
      const plugin = await storage.getActiveSmsPlugin();
      if (!plugin) return res.status(503).json({ ok: false, error: "no_active_sms_plugin", preview: message });
      const result = await sendSmsViaPlugin(plugin, phone, message);
      await logAudit(req, {
        action: "onboarding.reminders.test_sms",
        entityType: "system_setting",
        entityId: tplKey,
        description: `Sent test reminder SMS to ${phone} (variant=${variant}, locale=${locale}, success=${result.success}).`,
        metadata: { phone, variant, locale, success: result.success, error: result.success ? null : result.error },
      });
      if (!result.success) return res.status(502).json({ ok: false, error: result.error, preview: message });
      return res.json({ ok: true, preview: message });
    } catch (err) {
      console.error("[reminder-test-sms] unexpected error", err);
      return res.status(500).json({ ok: false, preview: "", error: "internal_error" });
    }
  });

  app.post("/api/onboarding/:id/send-reminder-now", requirePermission("onboarding:update"), async (req: Request, res: Response) => {
    try {
      const { sendReminderNow } = await import("./onboarding-reminders");
      const updated = await sendReminderNow(req.params.id);
      if (!updated) return res.status(404).json({ message: tr(req, "onboarding.notFound") });
      await logAudit(req, {
        action: "onboarding.reminders.send_now",
        entityType: "onboarding",
        entityId: req.params.id,
        description: `Manual onboarding reminder sent (count now ${updated.reminderCount}).`,
      });
      return res.json(updated);
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/onboarding/:id/pause-reminders", requirePermission("onboarding:update"), async (req: Request, res: Response) => {
    try {
      const { pauseReminders } = await import("./onboarding-reminders");
      const updated = await pauseReminders(req.params.id);
      if (!updated) return res.status(404).json({ message: tr(req, "onboarding.notFound") });
      await logAudit(req, {
        action: "onboarding.reminders.paused",
        entityType: "onboarding",
        entityId: req.params.id,
        description: "Onboarding reminders paused for this candidate.",
      });
      return res.json(updated);
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/onboarding/:id/resume-reminders", requirePermission("onboarding:update"), async (req: Request, res: Response) => {
    try {
      const { resumeReminders } = await import("./onboarding-reminders");
      const updated = await resumeReminders(req.params.id);
      if (!updated) return res.status(404).json({ message: tr(req, "onboarding.notFound") });
      await logAudit(req, {
        action: "onboarding.reminders.resumed",
        entityType: "onboarding",
        entityId: req.params.id,
        description: "Onboarding reminders resumed for this candidate.",
      });
      return res.json(updated);
    } catch (err) { return handleError(res, err); }
  });

  app.get("/api/sms/outbox/:id", requirePermission("onboarding:read"), async (req: Request, res: Response) => {
    try {
      const { smsOutbox: smsOutboxTable } = await import("@shared/schema");
      const [row] = await db.select().from(smsOutboxTable).where(eq(smsOutboxTable.id, req.params.id)).limit(1);
      if (!row) return res.status(404).json({ message: "not_found" });
      return res.json(row);
    } catch (err) { return handleError(res, err); }
  });

  app.get("/api/onboarding/reminders/activity", requirePermission("onboarding:read"), async (_req: Request, res: Response) => {
    try {
      const { getReminderConfig, computeRowStatus, missingDocsFor } = await import("./onboarding-reminders");
      const { onboarding: onboardingTable, candidates: candidatesTable, smsOutbox: smsOutboxTable } = await import("@shared/schema");
      const cfg = await getReminderConfig();
      const now = new Date();
      // Eligible = pending/in_progress/ready, not eliminated.
      const rows = await db.select({
        ob: onboardingTable,
        cand: candidatesTable,
      })
        .from(onboardingTable)
        .leftJoin(candidatesTable, eq(onboardingTable.candidateId, candidatesTable.id))
        .where(and(
          isNull(onboardingTable.eliminatedAt),
          sql`${onboardingTable.status} IN ('pending', 'in_progress', 'ready')`,
        ));

      const out = await Promise.all(rows.map(async ({ ob, cand }) => {
        const status = computeRowStatus(ob, cfg, now);
        const missing = missingDocsFor(ob, cfg);
        // Latest outbox row for this onboarding (regular or final).
        const [latestSms] = await db.select({ id: smsOutboxTable.id, kind: smsOutboxTable.kind, sentAt: smsOutboxTable.sentAt, lastError: smsOutboxTable.lastError })
          .from(smsOutboxTable)
          .where(sql`${smsOutboxTable.dedupeKey} LIKE ${'onboarding_reminder:' + ob.id + ':%'} OR ${smsOutboxTable.dedupeKey} = ${'onboarding_final_warning:' + ob.id}`)
          .orderBy(sql`${smsOutboxTable.createdAt} DESC`)
          .limit(1);
        return {
          onboardingId: ob.id,
          candidateId: ob.candidateId,
          candidateName: cand?.fullNameEn ?? null,
          candidatePhone: cand?.phone ?? null,
          missingDocs: missing,
          reminderCount: ob.reminderCount ?? 0,
          maxReminders: cfg.maxReminders,
          remindersPaused: ob.remindersPausedAt != null,
          lastReminderSentAt: ob.lastReminderSentAt?.toISOString() ?? null,
          nextScheduledAt: status.nextScheduledAt,
          eliminationAt: status.eliminationAt,
          state: status.state,
          latestSmsOutboxId: latestSms?.id ?? null,
          latestSmsKind: latestSms?.kind ?? null,
          latestSmsSentAt: latestSms?.sentAt?.toISOString() ?? null,
          latestSmsLastError: latestSms?.lastError ?? null,
        };
      }));
      return res.json(out);
    } catch (err) { return handleError(res, err); }
  });


  app.get("/api/onboarding/:id", requirePermission("onboarding:read"), async (req: Request, res: Response) => {
    try {
      const record = await storage.getOnboardingRecord(req.params.id);
      if (!record) return res.status(404).json({ message: tr(req, "onboarding.notFound") });
      return res.json(record);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.post("/api/onboarding", requirePermission("onboarding:create"), async (req: Request, res: Response) => {
    try {
      const data = insertOnboardingSchema.parse(req.body);
      // Prevent duplicate onboarding for same candidate
      const existing = await storage.getOnboardingRecords({});
      const dup = existing.find(r => r.candidateId === data.candidateId && r.status !== "converted" && r.status !== "rejected" && r.status !== "terminated");
      if (dup) return res.status(409).json({ message: tr(req, "onboarding.alreadyExists") });
      // Server-side: derive each prerequisite flag from the candidate's
      // actual file URL — not from the candidate's `hasIban`/`hasPhoto`/
      // `hasNationalId` mirror flags. The mirrors can drift (e.g.
      // `applyServerIbanFields` flips `candidate.hasIban=true` whenever
      // the candidate types in their IBAN *number*, even if the IBAN
      // certificate file has never been uploaded). Reading directly from
      // the file URLs guarantees a freshly-admitted onboarding record
      // never shows the IBAN tile as "complete" without an actual upload.
      if (data.candidateId) {
        const candidate = await storage.getCandidate(data.candidateId);
        if (candidate) {
          data.hasPhoto = !!candidate.photoUrl;
          data.hasIban = !!candidate.ibanFileUrl
            || (typeof candidate.ibanNumber === "string" && candidate.ibanNumber.startsWith("/uploads/"));
          data.hasNationalId = !!candidate.nationalIdFileUrl;
          data.hasVaccinationReport = !!candidate.vaccinationReportFileUrl;
          // Derive SMP from onboarding linkage context: applicationId === null = SMP pipeline.
          // This is authoritative and source-agnostic.
          const isSmp = !data.applicationId;
          data.status = computeOnboardingStatus(data as any, isSmp, candidate);
        }
      }
      const record = await storage.createOnboardingRecord(data);
      const candidate = data.candidateId ? await storage.getCandidate(data.candidateId) : null;
      await logAudit(req, {
        action: "onboarding.admit",
        entityType: "onboarding",
        entityId: record.id,
        subjectName: candidate?.fullNameEn ?? undefined,
        description: `Admitted "${candidate?.fullNameEn ?? data.candidateId}" to onboarding`,
        metadata: { candidateId: data.candidateId },
      });
      return res.status(201).json(record);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.patch("/api/onboarding/:id", requirePermission("onboarding:update"), async (req: Request, res: Response) => {
    try {
      const data = insertOnboardingSchema.partial().parse(req.body);
      delete data.hasPhoto;
      delete data.hasIban;
      delete data.hasNationalId;
      delete data.hasVaccinationReport;
      const isRejection = data.status === "rejected";
      if (!isRejection) delete data.status;
      if (data.hasSignedContract !== undefined || isRejection) {
        const current = await storage.getOnboardingRecord(req.params.id);
        if (current && current.status !== "converted" && current.status !== "rejected" && current.status !== "terminated") {
          const merged = { ...current, ...data };
          if (!isRejection) {
            // Derive SMP from onboarding record's applicationId (authoritative, source-agnostic)
            const isSmp = !current.applicationId;
            // Read the candidate's actual file URLs so the readiness gate
            // can't be tripped by a stale `hasIban` flag (see the comment
            // on `computeOnboardingStatus`).
            const cand = current.candidateId ? await storage.getCandidate(current.candidateId) : null;
            data.status = computeOnboardingStatus(merged, isSmp, cand);
          }
        }
      }
      if (isRejection) {
        data.rejectedAt = new Date();
      }
      const record = await storage.updateOnboardingRecord(req.params.id, data);
      if (!record) return res.status(404).json({ message: tr(req, "onboarding.notFound") });
      if (data.status === "rejected" && record.applicationId) {
        await storage.updateApplication(record.applicationId, { status: "interviewed" });
      }
      return res.json(record);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.delete("/api/onboarding/:id", requirePermission("onboarding:delete"), async (req: Request, res: Response) => {
    try {
      const ok = await storage.deleteOnboardingRecord(req.params.id);
      if (!ok) return res.status(404).json({ message: tr(req, "onboarding.notFound") });
      return res.status(204).end();
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.post("/api/onboarding/:id/convert", requirePermission("onboarding:convert"), async (req: Request, res: Response) => {
    try {
      const { startDate, eventId, salary, smpCompanyId, employmentType: clientEmploymentType } = req.body as Record<string, string>;
      if (!startDate) return res.status(400).json({ message: tr(req, "common.startDateRequired") });

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

      // SMP workers must be linked to a company
      if (resolvedEmploymentType === "smp" && !smpCompanyId) {
        return res.status(400).json({ message: tr(req, "smp.companyIdRequired") });
      }

      // Enforce: individual workers must have null smpCompanyId regardless of what client sends
      const resolvedSmpCompanyId = resolvedEmploymentType === "smp" ? (smpCompanyId || undefined) : undefined;
      let workforce;
      try {
        workforce = await storage.convertOnboardingToEmployee(
          req.params.id,
          {
            startDate,
            eventId: eventId || undefined,
            salary: salary && salary.trim() !== "" ? salary : undefined,
            smpCompanyId: resolvedSmpCompanyId,
            employmentType: resolvedEmploymentType,
          },
          (req as any).userId,
        );
      } catch (convErr: any) {
        const msg = convErr?.message || "";
        if (msg.includes("Contract must be signed") || msg.includes("Cannot convert") || msg.includes("Already converted") || msg.includes("not found")) {
          return res.status(400).json({ message: msg });
        }
        throw convErr;
      }
      await logAudit(req, {
        action: "workforce.converted",
        entityType: "workforce",
        entityId: workforce.id,
        employeeNumber: (workforce as any).employeeNumber ?? undefined,
        subjectName: (workforce as any).fullNameEn ?? undefined,
        description: `Converted "${(workforce as any).fullNameEn ?? req.params.id}" to employee #${(workforce as any).employeeNumber ?? "—"}`,
        metadata: { startDate, eventId, salary, employmentType: resolvedEmploymentType },
      });
      return res.status(201).json(workforce);
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ─── Workforce (Employees) ────────────────────────────────────────────────
  app.get("/api/workforce", requirePermission("workforce:read"), async (req: Request, res: Response) => {
    try {
      const { eventId, isActive, active, search } = req.query as Record<string, string>;
      const activeParam = isActive ?? active;
      const data = await storage.getWorkforce({
        eventId,
        isActive: activeParam !== undefined ? activeParam === "true" : undefined,
        search,
      });
      return res.json(data);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.get("/api/workforce/stats", requirePermission("workforce:read"), async (_req: Request, res: Response) => {
    try {
      const stats = await storage.getWorkforceStats();
      return res.json(stats);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.get("/api/workforce/history/:nationalId", requirePermission("workforce:history_read"), async (req: Request, res: Response) => {
    try {
      const history = await storage.getWorkHistory(req.params.nationalId);
      return res.json(history);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.get("/api/workforce/by-candidate/:candidateId", requireAuth, async (req: Request, res: Response) => {
    try {
      const isAdmin = req.authIsSuperAdmin || req.authPermissions?.has("workforce:read");
      if (!isAdmin) {
        const myCand = await storage.getCandidateByUserId(req.authUserId!);
        if (!myCand || myCand.id !== req.params.candidateId) {
          return res.status(403).json({ message: tr(req, "common.accessDenied") });
        }
      }
      const record = await storage.getWorkforceByCandidateId(req.params.candidateId);
      return res.json(record ?? null);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.get("/api/workforce/all-by-candidate/:candidateId", requireAuth, async (req: Request, res: Response) => {
    try {
      const isAdmin = req.authIsSuperAdmin || req.authPermissions?.has("workforce:read");
      if (!isAdmin) {
        const myCand = await storage.getCandidateByUserId(req.authUserId!);
        if (!myCand || myCand.id !== req.params.candidateId) {
          return res.status(403).json({ message: tr(req, "common.accessDenied") });
        }
      }
      const records = await storage.getAllWorkforceByCandidateId(req.params.candidateId);
      return res.json(records);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.get("/api/workforce/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const employee = await storage.getWorkforceEmployee(req.params.id);
      if (!employee) return res.status(404).json({ message: tr(req, "employee.notFound") });
      return res.json(employee);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.post("/api/workforce", requirePermission("workforce:create"), async (req: Request, res: Response) => {
    try {
      const data = insertWorkforceSchema.parse(normalizeBlankFields({ ...req.body }, WORKFORCE_BLANK_FIELDS));
      const record = await storage.createWorkforceRecord(data);
      if (data.candidateId && data.isActive !== false) {
        await storage.updateCandidate(data.candidateId, { status: "hired" });
      }
      return res.status(201).json(record);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.patch("/api/workforce/:id", requirePermission("workforce:update"), async (req: Request, res: Response) => {
    try {
      // Task #187 — Employee numbers are auto-generated (`C######`) and
      // immutable for the life of the record. The allowed-fields filter
      // below already drops any unexpected keys silently, but we fail
      // loud here so a misbehaving client (custom HR script, mass-edit
      // tool, etc.) can't *think* it edited the number and discover
      // hours later that the change was dropped.
      if ("employeeNumber" in (req.body ?? {})) {
        return res.status(400).json({ message: tr(req, "employee.numberImmutable") });
      }
      const allowed = ["salary", "notes", "endDate", "supervisorId", "performanceScore", "isActive", "eventId", "positionId"];
      const body = normalizeBlankFields({ ...req.body }, WORKFORCE_BLANK_FIELDS);
      const data: Record<string, any> = {};
      for (const key of allowed) {
        if (key in body) data[key] = body[key];
      }
      const before = await storage.getWorkforceEmployee(req.params.id);
      const record = await storage.updateWorkforceRecord(req.params.id, data);
      if (!record) return res.status(404).json({ message: tr(req, "employee.notFound") });
      // Build a human-readable diff description
      const changes: string[] = [];
      if (before) {
        if (data.salary !== undefined && String(data.salary) !== String((before as any).salary ?? "")) {
          changes.push(`salary from ${(before as any).salary ?? "—"} to ${data.salary} SAR`);
        }
        if (data.isActive !== undefined && data.isActive !== (before as any).isActive) {
          changes.push(`status → ${data.isActive ? "active" : "inactive"}`);
        }
        if (data.eventId !== undefined) changes.push(`event updated`);
        if (data.positionId !== undefined) changes.push(`position updated`);
        if (data.notes !== undefined) changes.push(`notes updated`);
        if (data.endDate !== undefined) changes.push(`end date → ${data.endDate}`);
        if (data.performanceScore !== undefined) changes.push(`performance score → ${data.performanceScore}`);
      }
      const subjectName = before?.fullNameEn ?? (record as any).fullNameEn ?? undefined;
      const empNum = before?.employeeNumber ?? (record as any).employeeNumber ?? undefined;
      if (data.isActive === false && before?.candidateId) {
        const otherActive = await storage.getWorkforceByCandidateId(before.candidateId);
        if (!otherActive || otherActive.id === req.params.id) {
          const candidate = await storage.getCandidate(before.candidateId);
          if (candidate?.userId) {
            await storage.updateUser(candidate.userId, { isActive: false });
            invalidateUserActiveCache(candidate.userId);
          }
        }
      }
      // Task #64 — capture before/after snapshot for the fields that
      // directly affect event filled-position counts (Golden Rule).
      // Only the fields actually mutable through this route are listed.
      // offboardingStatus / startDate are owned by the dedicated
      // offboarding & reinstate routes which carry their own audit entries.
      const headcountFields = ["eventId", "isActive", "endDate"] as const;
      const headcountDiff: Record<string, { before: any; after: any }> = {};
      if (before) {
        for (const f of headcountFields) {
          if (f in data && (data as any)[f] !== (before as any)[f]) {
            headcountDiff[f] = { before: (before as any)[f] ?? null, after: (data as any)[f] ?? null };
          }
        }
      }
      await logAudit(req, {
        action: "workforce.updated",
        entityType: "workforce",
        entityId: req.params.id,
        employeeNumber: empNum,
        subjectName,
        description: `Updated employee #${empNum ?? "—"} "${subjectName ?? req.params.id}"${changes.length > 0 ? ": " + changes.join(", ") : ""}`,
        metadata: {
          changes: data,
          ...(Object.keys(headcountDiff).length > 0 ? { headcountImpact: headcountDiff } : {}),
        },
      });
      return res.json(record);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.patch("/api/workforce/:id/candidate-profile", requirePermission("workforce:update"), async (req: Request, res: Response) => {
    try {
      const emp = await storage.getWorkforceEmployee(req.params.id);
      if (!emp) return res.status(404).json({ message: tr(req, "employee.notFound") });
      const candidateId = emp.candidateId;
      if (!candidateId) return res.status(400).json({ message: tr(req, "candidate.noLinkedRecord") });

      const allowed = [
        "email", "phone", "dateOfBirth", "gender",
        "nationalityText", "maritalStatus", "iqamaNumber", "city", "region",
        "educationLevel", "university", "major",
        "ibanNumber", "ibanBankName", "ibanBankCode",
        "ibanAccountFirstName", "ibanAccountLastName",
        "emergencyContactName", "emergencyContactPhone",
      ];
      // Task #183 — use the generic helper for empty-string → null
      // normalization. Same write-boundary defence applied across all
      // form-driven routes; replaces the bespoke nullableFields loop.
      // Task #185 — the merged CANDIDATE + IBAN-overlay list is now a
      // single named constant so the wiring stays in one module.
      const normalized = normalizeBlankFields({ ...req.body }, WORKFORCE_PROFILE_BLANK_FIELDS);
      const filtered: Record<string, any> = {};
      for (const key of allowed) {
        if (key in normalized) filtered[key] = normalized[key] ?? null;
      }
      if (Object.keys(filtered).length === 0) return res.status(400).json({ message: tr(req, "common.noFieldsToUpdate") });

      const data = candidateBaseSchema.partial().parse(filtered);

      // Task #133 — canonical write-time IBAN gate on the workforce
      // candidate-profile patch path. Same helper as the candidate
      // write endpoints; validates checksum, canonicalises, fills bank
      // metadata, and mirrors `hasIban` automatically. The previous
      // ad-hoc `data.hasIban = !!data.ibanNumber` block is no longer
      // needed — the helper sets it from the canonicalised value.
      applyServerIbanFields(data);

      const candidate = await storage.updateCandidate(candidateId, data);
      if (!candidate) return res.status(404).json({ message: tr(req, "candidate.notFound") });

      await logAudit(req, {
        action: "candidate.profile_updated_via_workforce",
        entityType: "candidate",
        entityId: candidateId,
        employeeNumber: emp.employeeNumber,
        subjectName: emp.fullNameEn,
        description: `Updated candidate profile for employee #${emp.employeeNumber} "${emp.fullNameEn}": ${Object.keys(data).join(", ")}`,
        metadata: { workforceId: req.params.id, changes: data },
      });

      const updated = await storage.getWorkforceEmployee(req.params.id);
      return res.json(updated);
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ─── Bulk Update via Excel upload ────────────────────────────────────────
  app.post("/api/workforce/bulk-update", requirePermission("workforce:bulk"), uploadXlsx.single("file"), async (req: Request, res: Response) => {
    try {
      if (!req.file) return res.status(400).json({ message: tr(req, "file.noUpload") });

      const wb = XLSX.readFile(req.file.path);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "" });
      fs.unlinkSync(req.file.path);

      if (rows.length === 0) return res.status(400).json({ message: tr(req, "import.excelEmpty") });
      if (rows.length > 5000) return res.status(400).json({ message: tr(req, "import.rowLimit") });

      // Fetch all workforce records, events, SMP companies, and positions for lookups
      const allWorkers = await storage.getWorkforce({});
      const allEvents = await storage.getEvents({});
      const eventsByName: Record<string, string> = {};
      for (const ev of allEvents) eventsByName[ev.name.trim().toLowerCase()] = ev.id;
      const allSmpCompanies = await storage.getSMPCompanies();
      const smpByName: Record<string, string> = {};
      for (const c of allSmpCompanies) smpByName[c.name.trim().toLowerCase()] = c.id;
      // Task #187 — Position is now the canonical role field on the
      // workforce dialog. Mirror the Event / SMP resolver pattern: case
      // -fold the title, only accept active positions (matches the
      // dropdown the dialog itself shows), and surface unknowns as row
      // errors so the admin can pick one from the "Positions
      // (Reference)" sheet on the same workbook.
      const allPositionsForBulk = await storage.getAllPositions(false);
      const positionsByTitle: Record<string, string> = {};
      for (const p of allPositionsForBulk) {
        positionsByTitle[p.title.trim().toLowerCase()] = p.id;
      }

      const results: { employeeNumber: string; status: "updated" | "skipped" | "error"; reason?: string }[] = [];

      for (const row of rows) {
        const employeeNumber = String(row["Employee #"] ?? row["Employee Number"] ?? "").trim();
        if (!employeeNumber) { results.push({ employeeNumber: "(blank)", status: "skipped", reason: "Missing Employee #" }); continue; }

        const worker = allWorkers.find(w => w.employeeNumber === employeeNumber);
        if (!worker) { results.push({ employeeNumber, status: "error", reason: "Employee not found" }); continue; }

        try {
          // Fields to update on the workforce record
          const wfUpdate: Record<string, any> = {};
          const rowErrors: string[] = [];

          // Salary — must be a positive number
          const salary = String(row["Salary (SAR)"] ?? row["Salary"] ?? "").trim();
          if (salary !== "") {
            const salaryNum = Number(salary);
            if (isNaN(salaryNum) || salaryNum < 0) rowErrors.push(`Salary "${salary}" is not a valid number`);
            else if (String(salaryNum) !== String(parseFloat(worker.salary ?? ""))) wfUpdate.salary = salary;
          }

          // Start Date — must be YYYY-MM-DD
          const startDate = String(row["Start Date"] ?? "").trim();
          if (startDate !== "") {
            const dateStr = startDate.length === 5 && !isNaN(Number(startDate))
              ? new Date(Math.round((Number(startDate) - 25569) * 86400 * 1000)).toISOString().slice(0, 10)
              : startDate;
            if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || isNaN(Date.parse(dateStr)))
              rowErrors.push(`Start Date "${startDate}" must be in YYYY-MM-DD format`);
            else if (dateStr !== (worker.startDate ?? "")) wfUpdate.startDate = dateStr;
          }

          // Notes — no special validation, just length cap
          const notes = String(row["Notes"] ?? "").trim();
          if (notes !== "") {
            if (notes.length > 2000) rowErrors.push("Notes exceed maximum 2,000 characters");
            else wfUpdate.notes = notes;
          }

          // Event — must exactly match an existing event name
          const eventName = String(row["Event"] ?? "").trim();
          if (eventName !== "") {
            const eventId = eventsByName[eventName.toLowerCase()];
            if (eventId) wfUpdate.eventId = eventId;
            else rowErrors.push(`Event "${eventName}" does not match any existing event. Check the "Events (Reference)" sheet for valid names.`);
          }

          // Position — case-insensitive title match against the active
          // positions catalog (Task #187). Empty cell = no change.
          // Pass `null` is not supported here — use the per-employee
          // dialog to clear a position.
          const positionTitleCell = String(row["Position"] ?? "").trim();
          if (positionTitleCell !== "") {
            const positionId = positionsByTitle[positionTitleCell.toLowerCase()];
            if (positionId) {
              if (positionId !== (worker.positionId ?? "")) wfUpdate.positionId = positionId;
            } else {
              rowErrors.push(`Position "${positionTitleCell}" does not match any active position. Check the "Positions (Reference)" sheet for valid titles.`);
            }
          }

          // SMP Company — link by name (for SMP employment type workers only).
          // Guards:
          //   1. Must be an SMP-type worker (individual workers cannot have smpCompanyId)
          //   2. Immutable for inactive (historical) records to preserve audit trail integrity
          const smpCompanyName = String(row["SMP Company Name"] ?? row["SMP Company"] ?? "").trim();
          if (smpCompanyName !== "") {
            if (worker.employmentType !== "smp") {
              rowErrors.push(`SMP Company cannot be set on individual-type workers (employee #${worker.employeeNumber})`);
            } else if (!worker.isActive) {
              rowErrors.push(`SMP Company cannot be changed for terminated records (employee #${worker.employeeNumber})`);
            } else {
              const smpId = smpByName[smpCompanyName.toLowerCase()];
              if (smpId) wfUpdate.smpCompanyId = smpId;
              else rowErrors.push(`SMP Company "${smpCompanyName}" not found. Check SMP Companies list for valid names.`);
            }
          }

          // Fields to update on the candidate record
          const candUpdate: Record<string, any> = {};

          const fullName = String(row["Full Name"] ?? "").trim();
          if (fullName !== "" && fullName !== (worker.fullNameEn ?? "")) {
            if (fullName.length < 2) rowErrors.push("Full Name must be at least 2 characters");
            else candUpdate.fullNameEn = fullName;
          }

          // National ID is intentionally excluded from bulk update — change it per-employee via the detail dialog

          // Phone is intentionally excluded from bulk update — it is OTP-verified and must be changed per-employee at profile level

          if (rowErrors.length > 0) {
            results.push({ employeeNumber, status: "error", reason: rowErrors.join(" | ") });
            continue;
          }

          if (Object.keys(wfUpdate).length > 0) await storage.updateWorkforceRecord(worker.id, wfUpdate);
          if (Object.keys(candUpdate).length > 0) await storage.updateCandidate(worker.candidateId, candUpdate);

          results.push({ employeeNumber, status: "updated" });
        } catch (e: any) {
          results.push({ employeeNumber, status: "error", reason: e?.message ?? "Unknown error" });
        }
      }

      const updated = results.filter(r => r.status === "updated").length;
      const errors = results.filter(r => r.status === "error");
      const skipped = results.filter(r => r.status === "skipped").length;
      if (updated > 0) {
        await logAudit(req, {
          action: "workforce.bulk_updated",
          entityType: "workforce",
          description: `Bulk-updated ${updated} of ${rows.length} employee(s) via Excel upload (${skipped} skipped, ${errors.length} errors)`,
          metadata: { updated, skipped, errors: errors.length, total: rows.length },
        });
      }
      return res.json({ updated, skipped, errors, total: rows.length, results });
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.post("/api/workforce/:id/terminate", requirePermission("workforce:terminate"), async (req: Request, res: Response) => {
    try {
      // Task #183 — normalise blank dropdown selections (reason, category)
      // to null so the audit log and downstream consumers don't see empty
      // strings stamped against terminated workforce rows.
      const body = normalizeBlankFields({ ...req.body }, WORKFORCE_BLANK_FIELDS) as {
        endDate?: string;
        terminationReason?: string | null;
        terminationCategory?: string | null;
      };
      const endDate = body.endDate ?? "";
      const terminationReason = body.terminationReason ?? undefined;
      const terminationCategory = body.terminationCategory ?? undefined;
      if (!endDate) return res.status(400).json({ message: tr(req, "common.endDateRequired") });
      const validCategories = ["end_of_season", "resignation", "performance", "disciplinary", "contract_expiry", "other"];
      if (terminationCategory && !validCategories.includes(terminationCategory)) {
        return res.status(400).json({ message: tr(req, "termination.invalidCategory", { categories: validCategories.join(", ") }) });
      }
      const record = await storage.terminateEmployee(req.params.id, { endDate, terminationReason, terminationCategory });
      if (!record) return res.status(404).json({ message: tr(req, "employee.notFound") });
      const empNum = (record as any).employeeNumber ?? undefined;
      const subjectName = (record as any).fullNameEn ?? undefined;

      await logAudit(req, {
        action: "offboarding.started",
        entityType: "offboarding",
        entityId: req.params.id,
        employeeNumber: empNum,
        subjectName,
        description: `Sent employee #${empNum ?? "—"} "${subjectName ?? req.params.id}" to offboarding${terminationCategory ? ` (${terminationCategory})` : ""}${terminationReason ? ` — ${terminationReason}` : ""}`,
        metadata: { endDate, terminationReason, terminationCategory },
      });
      return res.json(record);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.post("/api/workforce/reinstate", requirePermission("workforce:reinstate"), async (req: Request, res: Response) => {
    try {
      const { nationalId, startDate, eventId, salary, jobId, smpCompanyId } = req.body as Record<string, string>;
      if (!nationalId || !startDate) return res.status(400).json({ message: tr(req, "common.nationalIdAndStartRequired") });

      // Derive employment type from the most recent persisted workforce record for this national ID.
      // This prevents clients from forging type to bypass smpCompanyId requirement.
      const history = await storage.getAllWorkforceByCandidateId(
        await storage.getCandidateByNationalId(nationalId).then(c => c?.id ?? ""),
      );
      const latestRecord = history[0];
      const resolvedEmploymentType: "individual" | "smp" | undefined =
        latestRecord?.employmentType === "smp" ? "smp" :
        latestRecord?.employmentType === "individual" ? "individual" :
        undefined;

      // SMP workers must be linked to a company
      if (resolvedEmploymentType === "smp" && !smpCompanyId) {
        return res.status(400).json({ message: tr(req, "smp.companyIdRequired") });
      }
      // Enforce: individual workers must have null smpCompanyId regardless of what client sends
      const resolvedSmpCompanyId = resolvedEmploymentType === "smp" ? (smpCompanyId || undefined) : undefined;
      const record = await storage.reinstateEmployee(nationalId, { startDate, eventId, salary, jobId, smpCompanyId: resolvedSmpCompanyId, employmentType: resolvedEmploymentType });
      const empNum = (record as any).employeeNumber ?? undefined;
      const subjectName = (record as any).fullNameEn ?? undefined;
      await logAudit(req, {
        action: "workforce.reinstated",
        entityType: "workforce",
        entityId: (record as any).id,
        employeeNumber: empNum,
        subjectName,
        description: `Reinstated employee #${empNum ?? "—"} "${subjectName ?? nationalId}" (National ID: ${nationalId})`,
        metadata: { nationalId, startDate, eventId, salary, employmentType: resolvedEmploymentType },
      });
      return res.status(201).json(record);
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ─── Automation Rules ─────────────────────────────────────────────────────
  app.get("/api/automation", requirePermission("automation:read"), async (_req: Request, res: Response) => {
    try {
      const rules = await storage.getAutomationRules();
      return res.json(rules);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.post("/api/automation", requirePermission("automation:write"), async (req: Request, res: Response) => {
    try {
      const data = insertAutomationRuleSchema.parse(req.body);
      const rule = await storage.createAutomationRule(data);
      return res.status(201).json(rule);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.patch("/api/automation/:id", requirePermission("automation:write"), async (req: Request, res: Response) => {
    try {
      const data = insertAutomationRuleSchema.partial().parse(req.body);
      const rule = await storage.updateAutomationRule(req.params.id, data);
      if (!rule) return res.status(404).json({ message: tr(req, "rule.notFound") });
      return res.json(rule);
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ─── Notifications ────────────────────────────────────────────────────────
  app.get("/api/notifications", requirePermission("notifications:read"), async (req: Request, res: Response) => {
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

  app.post("/api/notifications", requirePermission("notifications:write"), async (req: Request, res: Response) => {
    try {
      const data = insertNotificationSchema.parse(req.body);
      const notification = await storage.createNotification(data);
      return res.status(201).json(notification);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.patch("/api/notifications/:id/read", requireAuth, async (req: Request, res: Response) => {
    try {
      const marked = await storage.markNotificationRead(req.params.id);
      if (!marked) return res.status(404).json({ message: tr(req, "notification.notFound") });
      return res.json({ success: true });
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.get("/api/notifications/unread-count/:recipientId", requireAuth, async (req: Request, res: Response) => {
    try {
      const count = await storage.getUnreadCount(req.params.recipientId);
      return res.json({ count });
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ─── Admin Bell Alerts ────────────────────────────────────────────────────
  app.get("/api/admin/event-alerts", requirePermission("admin_alerts:manage"), async (_req: Request, res: Response) => {
    try {
      const [dateAlerts, activityLog, unreadCount] = await Promise.all([
        storage.getEventDateAlerts(),
        storage.getAdminAlerts(50),
        storage.countUnreadAdminAlerts(),
      ]);
      return res.json({ dateAlerts, activityLog, unreadCount });
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.patch("/api/admin/alerts/:id/read", requirePermission("admin_alerts:manage"), async (req: Request, res: Response) => {
    try {
      const ok = await storage.markAdminAlertRead(req.params.id);
      if (!ok) return res.status(404).json({ message: tr(req, "alert.notFound") });
      return res.json({ success: true });
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.post("/api/admin/alerts/read-all", requirePermission("admin_alerts:manage"), async (_req: Request, res: Response) => {
    try {
      const count = await storage.markAllAdminAlertsRead();
      return res.json({ marked: count });
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ─── GitHub Integration ──────────────────────────────────────────────────
  app.get("/api/github/user", requirePermission("integrations:github"), async (_req: Request, res: Response) => {
    try {
      const user = await getAuthenticatedUser();
      return res.json(user);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.get("/api/github/repos", requirePermission("integrations:github"), async (_req: Request, res: Response) => {
    try {
      const repos = await listUserRepos();
      return res.json(repos);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.get("/api/github/repos/:owner/:repo", requirePermission("integrations:github"), async (req: Request, res: Response) => {
    try {
      const repo = await getRepo(req.params.owner, req.params.repo);
      return res.json(repo);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.get("/api/github/repos/:owner/:repo/issues", requirePermission("integrations:github"), async (req: Request, res: Response) => {
    try {
      const issues = await listRepoIssues(req.params.owner, req.params.repo);
      return res.json(issues);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.get("/api/github/repos/:owner/:repo/pulls", requirePermission("integrations:github"), async (req: Request, res: Response) => {
    try {
      const pulls = await listRepoPullRequests(req.params.owner, req.params.repo);
      return res.json(pulls);
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ─── Business Units ────────────────────────────────────────────────────────
  app.get("/api/business-units", requirePermission("business_units:read"), async (_req: Request, res: Response) => {
    try {
      return res.json(await storage.getBusinessUnits());
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.post("/api/business-units", requirePermission("business_units:write"), async (req: Request, res: Response) => {
    try {
      const data = insertBusinessUnitSchema.parse(req.body);
      const bu = await storage.createBusinessUnit(data);
      return res.status(201).json(bu);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.patch("/api/business-units/:id", requirePermission("business_units:write"), async (req: Request, res: Response) => {
    try {
      const data = insertBusinessUnitSchema.partial().parse(req.body);
      const bu = await storage.updateBusinessUnit(req.params.id, data);
      if (!bu) return res.status(404).json({ message: tr(req, "businessUnit.notFound") });
      return res.json(bu);
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ─── Org Chart ──────────────────────────────────────────────────────────────
  app.get("/api/org-chart", requirePermission("org_chart:read"), async (req: Request, res: Response) => {
    try {
      // Permission already enforced by requirePermission("org_chart:read").
      const allDepts = await db.select().from(departments)
        .where(eq(departments.isActive, true))
        .orderBy(departments.sortOrder, departments.name);

      const allPositions = await db.select().from(positions)
        .where(eq(positions.isActive, true))
        .orderBy(positions.sortOrder, positions.title);

      const employeeRows = await db.select({
        positionId: workforce.positionId,
        employeeNumber: workforce.employeeNumber,
        candidateId: workforce.candidateId,
        fullNameEn: candidates.fullNameEn,
        nationalId: candidates.nationalId,
        phone: candidates.phone,
        photoUrl: candidates.photoUrl,
      })
        .from(workforce)
        .innerJoin(candidates, eq(workforce.candidateId, candidates.id))
        .where(and(
          eq(workforce.isActive, true),
          sql`${workforce.positionId} IS NOT NULL`,
          sql`${candidates.status} IN ('active', 'available', 'hired')`,
        ));

      const empsByPosition = new Map<string, typeof employeeRows>();
      for (const e of employeeRows) {
        const pid = e.positionId!;
        if (!empsByPosition.has(pid)) empsByPosition.set(pid, []);
        empsByPosition.get(pid)!.push(e);
      }

      const unassignedRows = await db.select({
        employeeNumber: workforce.employeeNumber,
        candidateId: workforce.candidateId,
        fullNameEn: candidates.fullNameEn,
        nationalId: candidates.nationalId,
        phone: candidates.phone,
        photoUrl: candidates.photoUrl,
      })
        .from(workforce)
        .innerJoin(candidates, eq(workforce.candidateId, candidates.id))
        .where(and(
          eq(workforce.isActive, true),
          sql`${workforce.positionId} IS NULL`,
          sql`${candidates.status} IN ('active', 'available', 'hired')`,
        ));

      const result = allDepts.map(dept => {
        const deptPositions = allPositions
          .filter(p => p.departmentId === dept.id)
          .map(p => {
            const emps = empsByPosition.get(p.id) || [];
            return {
              id: p.id,
              title: p.title,
              code: p.code,
              gradeLevel: p.gradeLevel,
              parentPositionId: p.parentPositionId,
              employeeCount: emps.length,
              employees: emps.map(e => ({
                id: e.candidateId,
                fullName: e.fullNameEn,
                candidateId: e.candidateId,
                employeeNumber: e.employeeNumber,
                fullNameEn: e.fullNameEn,
                nationalId: e.nationalId,
                phone: e.phone,
                photoUrl: e.photoUrl,
              })),
            };
          });
        const totalEmployees = deptPositions.reduce((s, p) => s + p.employeeCount, 0);
        return {
          id: dept.id,
          name: dept.name,
          code: dept.code,
          totalEmployees,
          positions: deptPositions,
        };
      });

      const grandTotal = result.reduce((s, d) => s + d.totalEmployees, 0) + unassignedRows.length;
      return res.json({
        departments: result,
        unassigned: unassignedRows.map(e => ({
          id: e.candidateId,
          fullName: e.fullNameEn,
          candidateId: e.candidateId,
          employeeNumber: e.employeeNumber,
          fullNameEn: e.fullNameEn,
          nationalId: e.nationalId,
          phone: e.phone,
          photoUrl: e.photoUrl,
        })),
        totalEmployees: grandTotal,
      });
    } catch (err) { return handleError(res, err); }
  });

  // ─── Departments ───────────────────────────────────────────────────────────
  app.get("/api/departments", requirePermission("business_units:read"), async (req: Request, res: Response) => {
    try {
      const includeInactive = req.query.includeInactive === "true";
      return res.json(await storage.getDepartments(includeInactive));
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/departments", requirePermission("departments:write"), async (req: Request, res: Response) => {
    try {
      const data = insertDepartmentSchema.parse(req.body);
      const dept = await storage.createDepartment(data);
      return res.status(201).json(dept);
    } catch (err) { return handleError(res, err); }
  });

  app.patch("/api/departments/:id", requirePermission("departments:write"), async (req: Request, res: Response) => {
    try {
      const data = insertDepartmentSchema.partial().parse(req.body);
      const dept = await storage.updateDepartment(req.params.id, data);
      if (!dept) return res.status(404).json({ message: tr(req, "department.notFound") });
      return res.json(dept);
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/departments/:id/toggle-active", requirePermission("departments:write"), async (req: Request, res: Response) => {
    try {
      const result = await storage.toggleDepartmentActive(req.params.id);
      if (!result.success) return res.status(400).json({ message: result.error });
      return res.json(result.department);
    } catch (err) { return handleError(res, err); }
  });

  // ─── Positions ────────────────────────────────────────────────────────────
  app.get("/api/positions", requirePermission("business_units:read"), async (req: Request, res: Response) => {
    try {
      const { departmentId, includeInactive } = req.query;
      if (departmentId) {
        return res.json(await storage.getPositions(departmentId as string, includeInactive === "true"));
      }
      return res.json(await storage.getAllPositions(includeInactive === "true"));
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/positions", requirePermission("positions:write"), async (req: Request, res: Response) => {
    try {
      const data = insertPositionSchema.parse(req.body);
      if (data.parentPositionId) {
        const parent = await storage.getPosition(data.parentPositionId);
        if (!parent) return res.status(400).json({ message: tr(req, "position.parentNotFound") });
        if (parent.departmentId !== data.departmentId) {
          return res.status(400).json({ message: tr(req, "position.parentDeptMismatch") });
        }
      }
      const pos = await storage.createPosition(data);
      return res.status(201).json(pos);
    } catch (err) { return handleError(res, err); }
  });

  app.patch("/api/positions/:id", requirePermission("positions:write"), async (req: Request, res: Response) => {
    try {
      const data = insertPositionSchema.partial().parse(req.body);
      if (data.parentPositionId) {
        const existing = await storage.getPosition(req.params.id);
        const parent = await storage.getPosition(data.parentPositionId);
        if (!parent) return res.status(400).json({ message: tr(req, "position.parentNotFound") });
        const deptId = data.departmentId ?? existing?.departmentId;
        if (parent.departmentId !== deptId) {
          return res.status(400).json({ message: tr(req, "position.parentDeptMismatch") });
        }
        if (data.parentPositionId === req.params.id) {
          return res.status(400).json({ message: tr(req, "position.selfParent") });
        }
        let ancestorId: string | null = parent.parentPositionId;
        const visited = new Set<string>([req.params.id, data.parentPositionId]);
        while (ancestorId) {
          if (visited.has(ancestorId)) {
            return res.status(400).json({ message: tr(req, "position.circularHierarchy") });
          }
          visited.add(ancestorId);
          const anc = await storage.getPosition(ancestorId);
          ancestorId = anc?.parentPositionId ?? null;
        }
      }
      const pos = await storage.updatePosition(req.params.id, data);
      if (!pos) return res.status(404).json({ message: tr(req, "position.notFound") });
      return res.json(pos);
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/positions/:id/toggle-active", requirePermission("positions:write"), async (req: Request, res: Response) => {
    try {
      const result = await storage.togglePositionActive(req.params.id);
      if (!result.success) return res.status(400).json({ message: result.error });
      return res.json(result.position);
    } catch (err) { return handleError(res, err); }
  });

  // ─── Users management (admin) ──────────────────────────────────────────────
  // Helper: Super Admin gate, layered on top of requirePermission middleware.
  async function _requireSuperAdminInline(req: Request, res: Response): Promise<boolean> {
    if (!req.authUserId) {
      res.status(401).json({ message: tr(req, "auth.required") });
      return false;
    }
    if (!req.authIsSuperAdmin) {
      res.status(403).json({ message: tr(req, "auth.superAdminRequired") });
      return false;
    }
    return true;
  }

  app.get("/api/users", requirePermission("admin_users:manage"), async (req: Request, res: Response) => {
    try {
      if (!(await _requireSuperAdminInline(req, res))) return;
      const userList = await storage.listUsers();
      return res.json(userList.map((u) => ({ ...u, password: undefined })));
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.post("/api/users", requirePermission("admin_users:manage"), async (req: Request, res: Response) => {
    try {
      if (!(await _requireSuperAdminInline(req, res))) return;
      const data = insertUserSchema.parse(req.body);
      // Hard rule: only the boot seed may create a Super Admin.
      if (data.roleId) {
        const r = await storage.getRole(data.roleId);
        if (r?.slug === "super_admin") {
          return res.status(403).json({ message: tr(req, "auth.cannotCreateSuperAdmin") });
        }
      }
      const pwRules = [
        { ok: data.password.length >= 8,              msg: "at least 8 characters" },
        { ok: /[A-Z]/.test(data.password),            msg: "one uppercase letter" },
        { ok: /[a-z]/.test(data.password),            msg: "one lowercase letter" },
        { ok: /[0-9]/.test(data.password),            msg: "one number" },
        { ok: /[^A-Za-z0-9]/.test(data.password),    msg: "one special character" },
      ];
      const pwFails = pwRules.filter(r => !r.ok);
      if (pwFails.length > 0) {
        return res.status(400).json({ message: tr(req, "password.rules", { rules: pwFails.map(f => f.msg).join(", ") }) });
      }
      const hashed = await bcrypt.hash(data.password, 10);
      const user = await storage.createUser({ ...data, password: hashed });
      return res.status(201).json({ ...user, password: undefined });
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.patch("/api/users/:id", requirePermission("admin_users:manage"), async (req: Request, res: Response) => {
    try {
      const data = insertUserSchema.partial().omit({ password: true }).parse(req.body);
      // Block escalation to Super Admin.
      if (data.roleId) {
        const r = await storage.getRole(data.roleId);
        if (r?.slug === "super_admin") {
          return res.status(403).json({ message: tr(req, "auth.cannotPromoteSuperAdmin") });
        }
      }
      // Block any modification of the existing Super Admin.
      const target = await storage.getUser(req.params.id);
      const targetRole = target?.roleId ? await storage.getRole(target.roleId) : null;
      if (targetRole?.slug === "super_admin") {
        return res.status(403).json({ message: tr(req, "auth.superAdminReadOnly") });
      }
      const user = await storage.updateUser(req.params.id, data);
      if (!user) return res.status(404).json({ message: tr(req, "user.notFoundShort") });
      invalidateUserActiveCache(req.params.id);
      return res.json({ ...user, password: undefined });
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ─── Admin Users management (Super Admin only) ────────────────────────────
  // Helper: ensure the requester is a Super Admin.
  async function requireSuperAdmin(req: Request, res: Response): Promise<{ id: string } | null> {
    const userId = getAuthUserId(req);
    if (!userId) {
      res.status(401).json({ message: tr(req, "auth.required") });
      return null;
    }
    if (!req.authIsSuperAdmin) {
      res.status(403).json({ message: tr(req, "auth.superAdminRequired") });
      return null;
    }
    return { id: userId };
  }

  function validatePassword(pw: string): string | null {
    const rules = [
      { ok: pw.length >= 8,           msg: "at least 8 characters" },
      { ok: /[A-Z]/.test(pw),         msg: "one uppercase letter" },
      { ok: /[a-z]/.test(pw),         msg: "one lowercase letter" },
      { ok: /[0-9]/.test(pw),         msg: "one number" },
      { ok: /[^A-Za-z0-9]/.test(pw),  msg: "one special character" },
    ];
    const fails = rules.filter(r => !r.ok);
    return fails.length ? `Password must contain: ${fails.map(f => f.msg).join(", ")}` : null;
  }

  // List back-office admin users (excludes candidates and other non-admin roles).
  app.get("/api/admin-users", requirePermission("admin_users:manage"), async (req: Request, res: Response) => {
    try {
      if (!(await requireSuperAdmin(req, res))) return;
      const all = await storage.listUsers();
      // An "admin user" is anyone whose role is NOT a candidate.
      const allRoles = await storage.listRoles();
      const roleById = new Map(allRoles.map((r) => [r.id, r]));
      const filtered = all
        .filter((u) => {
          if (!u.roleId) return false;
          const r = roleById.get(u.roleId);
          return r ? r.slug !== "candidate" : false;
        })
        .map((u) => ({ ...u, password: undefined }));
      return res.json(filtered);
    } catch (err) {
      return handleError(res, err);
    }
  });

  // Create a new admin user. Role must be one of the assignable admin roles
  // (super_admin is intentionally not allowed).
  app.post("/api/admin-users", requirePermission("admin_users:manage"), async (req: Request, res: Response) => {
    try {
      if (!(await requireSuperAdmin(req, res))) return;
      const bodySchema = insertUserSchema.extend({
        roleId: z.string().uuid(),
        fullName: z.string().min(2, "Full name is required"),
        nationalId: z.string().min(8, "National ID is required"),
        phone: saPhoneSchema,
        email: z.string().email("Valid email is required"),
        username: z.string().min(3, "Username is required"),
      });
      const data = bodySchema.parse(req.body);

      const role = await storage.getRole(data.roleId);
      if (!role) return res.status(400).json({ message: tr(req, "role.invalidId") });
      if (role.slug === "super_admin") {
        return res.status(403).json({ message: tr(req, "role.cannotAssignSuperAdmin") });
      }
      if (role.slug === "candidate") {
        return res.status(400).json({ message: tr(req, "user.useCandidateFlow") });
      }
      const pwError = validatePassword(data.password);
      if (pwError) return res.status(400).json({ message: pwError });

      // Uniqueness checks with friendly messages.
      if (await storage.getUserByNationalId(data.nationalId!)) {
        return res.status(409).json({ message: tr(req, "user.nationalIdExists") });
      }
      if (await storage.getUserByEmail(data.email)) {
        return res.status(409).json({ message: tr(req, "user.emailExists") });
      }
      if (await storage.getUserByUsername(data.username)) {
        return res.status(409).json({ message: tr(req, "user.usernameExists") });
      }
      if (data.phone && (await storage.getUserByPhone(data.phone))) {
        return res.status(409).json({ message: tr(req, "user.phoneExists") });
      }

      const hashed = await bcrypt.hash(data.password, 10);
      const user = await storage.createUser({ ...data, password: hashed });
      return res.status(201).json({ ...user, password: undefined });
    } catch (err) {
      return handleError(res, err);
    }
  });

  // Update an admin user. Allows password reset via optional password field.
  // Cannot target the Super Admin or set a role to super_admin.
  app.patch("/api/admin-users/:id", requirePermission("admin_users:manage"), async (req: Request, res: Response) => {
    try {
      if (!(await requireSuperAdmin(req, res))) return;
      const target = await storage.getUser(req.params.id);
      if (!target) return res.status(404).json({ message: tr(req, "adminUser.notFound") });
      const targetRole = target.roleId ? await storage.getRole(target.roleId) : null;
      if (targetRole?.slug === "super_admin") {
        return res.status(403).json({ message: tr(req, "auth.superAdminReadOnly") });
      }
      const bodySchema = z.object({
        fullName: z.string().min(2).optional(),
        nationalId: z.string().min(8).optional(),
        phone: patchSaPhoneSchema,
        email: z.string().email().optional(),
        username: z.string().min(3).optional(),
        roleId: z.string().uuid().optional(),
        isActive: z.boolean().optional(),
        password: z.string().optional(),
      });
      const data = bodySchema.parse(req.body);
      if (data.roleId) {
        const role = await storage.getRole(data.roleId);
        if (!role) return res.status(400).json({ message: tr(req, "role.invalidId") });
        if (role.slug === "super_admin") {
          return res.status(403).json({ message: tr(req, "role.cannotAssignSuperAdmin") });
        }
      }

      const update: Partial<typeof target> = { ...data };
      if (data.password && data.password.length > 0) {
        const pwError = validatePassword(data.password);
        if (pwError) return res.status(400).json({ message: pwError });
        update.password = await bcrypt.hash(data.password, 10);
      } else {
        delete update.password;
      }

      // Uniqueness checks for changed fields.
      if (data.nationalId && data.nationalId !== target.nationalId) {
        const existing = await storage.getUserByNationalId(data.nationalId);
        if (existing && existing.id !== target.id) {
          return res.status(409).json({ message: tr(req, "user.nationalIdTaken") });
        }
      }
      if (data.email && data.email !== target.email) {
        const existing = await storage.getUserByEmail(data.email);
        if (existing && existing.id !== target.id) {
          return res.status(409).json({ message: tr(req, "user.emailTaken") });
        }
      }
      if (data.username && data.username !== target.username) {
        const existing = await storage.getUserByUsername(data.username);
        if (existing && existing.id !== target.id) {
          return res.status(409).json({ message: tr(req, "user.usernameTaken") });
        }
      }
      if (data.phone && data.phone !== target.phone) {
        const existing = await storage.getUserByPhone(data.phone);
        if (existing && existing.id !== target.id) {
          return res.status(409).json({ message: tr(req, "user.phoneTaken") });
        }
      }

      const user = await storage.updateUser(req.params.id, update as any);
      if (!user) return res.status(404).json({ message: tr(req, "adminUser.notFound") });
      invalidateUserActiveCache(req.params.id);
      return res.json({ ...user, password: undefined });
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.delete("/api/admin-users/:id", requirePermission("admin_users:manage"), async (req: Request, res: Response) => {
    try {
      if (!(await requireSuperAdmin(req, res))) return;
      const target = await storage.getUser(req.params.id);
      if (!target) return res.status(404).json({ message: tr(req, "adminUser.notFound") });

      // Refuse to delete yourself.
      if (req.authUser && req.authUser.id === target.id) {
        return res.status(403).json({ message: tr(req, "user.cannotDeleteSelf") });
      }

      // Refuse to delete any Super Admin (the role is the system safety net).
      const targetRole = target.roleId ? await storage.getRole(target.roleId) : null;
      if (targetRole?.slug === "super_admin") {
        return res.status(403).json({ message: tr(req, "user.cannotDeleteSuperAdmin") });
      }

      try {
        const ok = await storage.deleteUser(target.id);
        if (!ok) return res.status(404).json({ message: tr(req, "adminUser.notFound") });
      } catch (e: any) {
        // Foreign-key violations (e.g. user authored audit logs / candidates) → 409.
        if (e?.code === "23503") {
          return res.status(409).json({
            message: tr(req, "user.hasReferences"),
          });
        }
        throw e;
      }

      invalidateUserActiveCache(target.id);
      return res.json({ ok: true });
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ─── RBAC: Roles & Permissions ─────────────────────────────────────────────
  app.get("/api/permissions", requirePermission("roles:read"), async (req: Request, res: Response) => {
    try {
      if (!(await requireSuperAdmin(req, res))) return;
      const perms = await storage.listPermissions();
      return res.json(perms);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.get("/api/roles", requirePermission("roles:read"), async (req: Request, res: Response) => {
    try {
      if (!(await requireSuperAdmin(req, res))) return;
      const list = await storage.listRoles();
      return res.json(list);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.get("/api/roles/:id", requirePermission("roles:read"), async (req: Request, res: Response) => {
    try {
      if (!(await requireSuperAdmin(req, res))) return;
      const role = await storage.getRole(req.params.id);
      if (!role) return res.status(404).json({ message: tr(req, "role.notFound") });
      return res.json(role);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.get("/api/roles/:id/permissions", requirePermission("roles:read"), async (req: Request, res: Response) => {
    try {
      if (!(await requireSuperAdmin(req, res))) return;
      const role = await storage.getRole(req.params.id);
      if (!role) return res.status(404).json({ message: tr(req, "role.notFound") });
      const eff = await storage.getEffectivePermissionsForRole(req.params.id);
      return res.json({ roleId: role.id, isSuperAdmin: eff.isSuperAdmin, permissions: eff.keys });
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.post("/api/roles", requirePermission("roles:manage"), async (req: Request, res: Response) => {
    try {
      if (!(await requireSuperAdmin(req, res))) return;
      const bodySchema = z.object({
        name: z.string().min(2).max(100),
        slug: z.string().min(2).max(64).regex(/^[a-z0-9_-]+$/, "Slug must be lowercase alphanumeric with - or _"),
        description: z.string().max(500).optional(),
        color: z.string().max(16).optional(),
      });
      const data = bodySchema.parse(req.body);
      if (await storage.getRoleBySlug(data.slug)) {
        return res.status(409).json({ message: tr(req, "role.slugExists") });
      }
      const created = await storage.createRole(data as any);
      const actorId = getAuthUserId(req); const actor = actorId ? await storage.getUser(actorId) : null;
      await storage.createAuditLog({
        actorId: actor?.id ?? null,
        actorName: actor?.fullName ?? actor?.username ?? null,
        action: "role.create",
        entityType: "role",
        entityId: created.id,
        description: `Created role "${created.name}"`,
        metadata: { slug: created.slug },
      } as any);
      return res.status(201).json(created);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.patch("/api/roles/:id", requirePermission("roles:manage"), async (req: Request, res: Response) => {
    try {
      if (!(await requireSuperAdmin(req, res))) return;
      const role = await storage.getRole(req.params.id);
      if (!role) return res.status(404).json({ message: tr(req, "role.notFound") });
      if (role.isSystem) {
        return res.status(403).json({ message: tr(req, "role.systemReadOnly") });
      }
      const bodySchema = z.object({
        name: z.string().min(2).max(100).optional(),
        description: z.string().max(500).nullable().optional(),
        color: z.string().max(16).nullable().optional(),
      });
      const data = bodySchema.parse(req.body);
      const updated = await storage.updateRole(req.params.id, data as any);
      const actorId = getAuthUserId(req); const actor = actorId ? await storage.getUser(actorId) : null;
      await storage.createAuditLog({
        actorId: actor?.id ?? null,
        actorName: actor?.fullName ?? actor?.username ?? null,
        action: "role.update",
        entityType: "role",
        entityId: updated.id,
        description: `Updated role "${updated.name}"`,
        metadata: data,
      } as any);
      return res.json(updated);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.delete("/api/roles/:id", requirePermission("roles:manage"), async (req: Request, res: Response) => {
    try {
      if (!(await requireSuperAdmin(req, res))) return;
      const role = await storage.getRole(req.params.id);
      if (!role) return res.status(404).json({ message: tr(req, "role.notFound") });
      const result = await storage.deleteRole(req.params.id);
      if (!result.ok) {
        if (result.reason === "system_role") {
          return res.status(403).json({ message: tr(req, "role.systemNoDelete") });
        }
        if (result.reason === "in_use") {
          return res.status(409).json({
            message: tr(req, "role.assignedToUsers", { count: result.userCount ?? 0 }),
            userCount: result.userCount ?? 0,
          });
        }
        return res.status(404).json({ message: tr(req, "role.notFound") });
      }
      const actorId = getAuthUserId(req); const actor = actorId ? await storage.getUser(actorId) : null;
      await storage.createAuditLog({
        actorId: actor?.id ?? null,
        actorName: actor?.fullName ?? actor?.username ?? null,
        action: "role.delete",
        entityType: "role",
        entityId: req.params.id,
        description: `Deleted role "${role.name}"`,
      } as any);
      return res.json({ ok: true });
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.post("/api/roles/:id/clone", requirePermission("roles:manage"), async (req: Request, res: Response) => {
    try {
      if (!(await requireSuperAdmin(req, res))) return;
      const bodySchema = z.object({
        name: z.string().min(2).max(100),
        slug: z.string().min(2).max(64).regex(/^[a-z0-9_-]+$/),
      });
      const data = bodySchema.parse(req.body);
      if (await storage.getRoleBySlug(data.slug)) {
        return res.status(409).json({ message: tr(req, "role.slugExists") });
      }
      const cloned = await storage.cloneRole(req.params.id, data.name, data.slug);
      const actorId = getAuthUserId(req); const actor = actorId ? await storage.getUser(actorId) : null;
      await storage.createAuditLog({
        actorId: actor?.id ?? null,
        actorName: actor?.fullName ?? actor?.username ?? null,
        action: "role.clone",
        entityType: "role",
        entityId: cloned.id,
        description: `Cloned role to "${cloned.name}"`,
        metadata: { sourceRoleId: req.params.id },
      } as any);
      return res.status(201).json(cloned);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.put("/api/roles/:id/permissions", requirePermission("roles:manage"), async (req: Request, res: Response) => {
    try {
      if (!(await requireSuperAdmin(req, res))) return;
      const role = await storage.getRole(req.params.id);
      if (!role) return res.status(404).json({ message: tr(req, "role.notFound") });
      if (role.isSystem) {
        return res.status(403).json({ message: tr(req, "role.systemPermsReadOnly") });
      }
      const bodySchema = z.object({
        permissions: z.array(z.string()).max(500),
      });
      const data = bodySchema.parse(req.body);
      await storage.setRolePermissions(req.params.id, data.permissions);
      invalidateRoleCache(req.params.id);
      const actorId = getAuthUserId(req); const actor = actorId ? await storage.getUser(actorId) : null;
      await storage.createAuditLog({
        actorId: actor?.id ?? null,
        actorName: actor?.fullName ?? actor?.username ?? null,
        action: "role.set_permissions",
        entityType: "role",
        entityId: req.params.id,
        description: `Updated permissions on role "${role.name}" (${data.permissions.length} keys)`,
        metadata: { count: data.permissions.length },
      } as any);
      return res.json({ ok: true, count: data.permissions.length });
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ─── SMP Companies ─────────────────────────────────────────────────────────
  app.get("/api/smp-companies", requirePermission("smp:read"), async (_req: Request, res: Response) => {
    try {
      const companies = await storage.getSMPCompanies();
      return res.json(companies);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.get("/api/smp-companies/:id", requirePermission("smp:read"), async (req: Request, res: Response) => {
    try {
      const company = await storage.getSMPCompany(req.params.id);
      if (!company) return res.status(404).json({ message: tr(req, "company.notFound") });
      return res.json(company);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.get("/api/smp-companies/:id/workers", requirePermission("smp:read"), async (req: Request, res: Response) => {
    try {
      const workers = await storage.getSMPCompanyWorkers(req.params.id);
      return res.json(workers);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.post("/api/smp-companies", requirePermission("smp:create"), async (req: Request, res: Response) => {
    try {
      const data = insertSMPCompanySchema.parse(normalizeBlankFields({ ...req.body }, SMP_COMPANY_BLANK_FIELDS));
      const company = await storage.createSMPCompany(data);
      await logAudit(req, {
        action: "smp_company.created",
        entityType: "smp_company",
        entityId: company.id,
        description: `SMP company created: ${company.name}`,
      });
      return res.status(201).json(company);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.patch("/api/smp-companies/:id", requirePermission("smp:update"), async (req: Request, res: Response) => {
    try {
      const data = insertSMPCompanySchema.partial().parse(normalizeBlankFields({ ...req.body }, SMP_COMPANY_BLANK_FIELDS));
      const company = await storage.updateSMPCompany(req.params.id, data);
      if (!company) return res.status(404).json({ message: tr(req, "company.notFound") });
      return res.json(company);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.delete("/api/smp-companies/:id", requirePermission("smp:delete"), async (req: Request, res: Response) => {
    try {
      // Block deletion if the company has linked workforce records (active or historical)
      const workers = await storage.getSMPCompanyWorkers(req.params.id);
      if (workers.length > 0) {
        return res.status(409).json({
          message: tr(req, "company.hasWorkforce", { count: workers.length }),
        });
      }
      const ok = await storage.deleteSMPCompany(req.params.id);
      if (!ok) return res.status(404).json({ message: tr(req, "company.notFound") });
      return res.status(204).send();
    } catch (err) {
      return handleError(res, err);
    }
  });

  // SMP Documents (sub-routes under SMP Companies)
  app.get("/api/smp-companies/:id/documents", requirePermission("smp:documents_read"), async (req: Request, res: Response) => {
    try {
      const docs = await storage.getSMPDocuments(req.params.id);
      return res.json(docs);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.post("/api/smp-companies/:id/documents", requirePermission("smp:documents_write"), async (req: Request, res: Response) => {
    try {
      const { fileUrl, fileName, description, eventId } = req.body;
      if (!fileUrl || !fileName) return res.status(400).json({ message: tr(req, "document.fileFieldsRequired") });
      const doc = await storage.createSMPDocument({
        smpCompanyId: req.params.id,
        fileUrl,
        fileName,
        description: description || undefined,
        eventId: eventId || undefined,
        uploadedBy: (req as any).userId ?? undefined,
      });
      return res.status(201).json(doc);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.delete("/api/smp-companies/:companyId/documents/:docId", requirePermission("smp:documents_write"), async (req: Request, res: Response) => {
    try {
      const ok = await storage.deleteSMPDocument(req.params.docId, req.params.companyId);
      if (!ok) return res.status(404).json({ message: tr(req, "document.notFound") });
      return res.status(204).send();
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ─── Contract Templates (Contract Engine) ─────────────────────────────────
  app.get("/api/contract-templates", requirePermission("contract_templates:read"), async (req: Request, res: Response) => {
    try {
      const { eventId, status } = req.query;
      const data = await storage.getContractTemplates({
        eventId: eventId as string | undefined,
        status: status as string | undefined,
      });
      return res.json(data);
    } catch (err) { return handleError(res, err); }
  });

  app.get("/api/contract-templates/:id", requirePermission("contract_templates:read"), async (req: Request, res: Response) => {
    try {
      const t = await storage.getContractTemplate(req.params.id);
      if (!t) return res.status(404).json({ message: tr(req, "template.notFound") });
      return res.json(t);
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/contract-templates", requirePermission("contract_templates:write"), async (req: Request, res: Response) => {
    try {
      const parsed = insertContractTemplateSchema.parse(req.body);
      const created = await storage.createContractTemplate(parsed);
      return res.status(201).json(created);
    } catch (err) { return handleError(res, err); }
  });

  app.patch("/api/contract-templates/:id", requirePermission("contract_templates:write"), async (req: Request, res: Response) => {
    try {
      const existing = await storage.getContractTemplate(req.params.id);
      if (!existing) return res.status(404).json({ message: tr(req, "template.notFound") });
      const updated = await storage.updateContractTemplate(req.params.id, req.body);
      return res.json(updated);
    } catch (err) { return handleError(res, err); }
  });

  app.delete("/api/contract-templates/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const contracts = await storage.getCandidateContracts({ templateId: req.params.id });
      if (contracts.length > 0) {
        return res.status(409).json({ message: tr(req, "template.hasContracts") });
      }
      const ok = await storage.deleteContractTemplate(req.params.id);
      if (!ok) return res.status(404).json({ message: tr(req, "template.notFound") });
      return res.json({ message: tr(req, "template.deleted") });
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/contract-templates/:id/new-version", requireAuth, async (req: Request, res: Response) => {
    try {
      const parent = await storage.getContractTemplate(req.params.id);
      if (!parent) return res.status(404).json({ message: tr(req, "template.notFound") });
      const newVersion = await storage.createContractTemplateVersion(parent, {
        articles: req.body.articles ?? parent.articles,
        createdBy: req.body.createdBy ?? parent.createdBy,
      });
      return res.status(201).json(newVersion);
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/contract-templates/:id/logo", requireAuth, upload.single("file"), async (req: Request, res: Response) => {
    try {
      if (!req.file) return res.status(400).json({ message: tr(req, "file.noUpload") });
      // ACL intent: **public-read** (Task #202 audit row 2 in KNOWN_ISSUES.md).
      // Task #200 — same root cause as Task #198 (ID card backgrounds).
      // The contract logo is rendered directly by the browser via plain
      // `<img src={template.logoUrl}>` in `client/src/pages/onboarding.tsx`
      // and `client/src/pages/candidate-portal.tsx`, and is also embedded
      // in generated contract PDFs. In production those URLs point at DO
      // Spaces; without `isPublic:true` the bucket ACL defaults to "private"
      // and every logo request 403s — the saved logo silently disappears
      // from the preview / PDF even though the URL persists in
      // `contract_templates.logo_url`. Dev still works because dev serves
      // files from local disk via the `/uploads` static handler.
      const logoUrl = await uploadFile(
        req.file.path,
        req.file.filename,
        getMimeType(req.file.filename),
        { isPublic: true },
      );
      const updated = await storage.updateContractTemplate(req.params.id, { logoUrl });
      if (!updated) return res.status(404).json({ message: tr(req, "template.notFound") });
      return res.json(updated);
    } catch (err) { return handleError(res, err); }
  });

  // ─── Candidate Contracts (generate / sign) ──────────────────────────────
  app.get("/api/candidate-contracts", requireAuth, async (req: Request, res: Response) => {
    try {
      const { candidateId, onboardingId, templateId, status } = req.query;
      const isAdmin = req.authIsSuperAdmin || req.authPermissions?.has("candidate_contracts:read");
      if (!isAdmin) {
        // Candidate can only read their own contracts. Force-scope to their candidate row
        // and reject queries that target someone else (or omit the scope entirely).
        const own = await storage.getCandidateByUserId(req.authUserId!);
        if (!own) return res.status(403).json({ message: tr(req, "common.forbidden") });
        if (candidateId && candidateId !== own.id) {
          return res.status(403).json({ message: tr(req, "contract.ownOnly") });
        }
        if (onboardingId) {
          const ob = await storage.getOnboardingRecord(onboardingId as string);
          if (!ob || ob.candidateId !== own.id) {
            return res.status(403).json({ message: tr(req, "contract.ownOnly") });
          }
        }
        if (!candidateId && !onboardingId) {
          // Don't let candidates list everyone's contracts; force scope to self.
          const data = await storage.getCandidateContracts({ candidateId: own.id });
          return res.json(data);
        }
      }
      const data = await storage.getCandidateContracts({
        candidateId: candidateId as string | undefined,
        onboardingId: onboardingId as string | undefined,
        templateId: templateId as string | undefined,
        status: status as string | undefined,
      });
      return res.json(data);
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/onboarding/:id/generate-contract", requireAuth, async (req: Request, res: Response) => {
    try {
      const ob = await storage.getOnboardingRecord(req.params.id);
      if (!ob) return res.status(404).json({ message: tr(req, "onboarding.notFound") });

      const candidate = await storage.getCandidate(ob.candidateId);
      if (!candidate) return res.status(404).json({ message: tr(req, "candidate.notFound") });

      const { templateId } = req.body;
      if (!templateId) return res.status(400).json({ message: tr(req, "common.templateIdRequired") });

      const template = await storage.getContractTemplate(templateId);
      if (!template) return res.status(404).json({ message: tr(req, "template.notFound") });

      const existing = await storage.getCandidateContracts({ onboardingId: ob.id });
      const pending = existing.find(c => c.status !== "signed");
      if (pending) {
        const updated = await storage.updateCandidateContract(pending.id, {
          templateId: template.id,
          snapshotArticles: template.articles as any,
          snapshotVariables: buildVariableSnapshot(candidate, template, ob),
          status: "awaiting_signing",
        });

        if (candidate.phone) {
          const smsPlugin = await storage.getActiveSmsPlugin();
          if (smsPlugin) {
            sendSmsViaPlugin(smsPlugin, candidate.phone, trL(await getCandidateLocale(candidate), "sms.contractReady"))
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
        snapshotArticles: template.articles as any,
        snapshotVariables: buildVariableSnapshot(candidate, template, ob),
      });

      await storage.updateOnboardingRecord(ob.id, { hasSignedContract: false });

      if (candidate.phone) {
        const smsPlugin = await storage.getActiveSmsPlugin();
        if (smsPlugin) {
          sendSmsViaPlugin(smsPlugin, candidate.phone, trL(await getCandidateLocale(candidate), "sms.contractReady"))
            .then(r => { if (r.success) console.log(`[SMS] Contract notification sent to ${candidate.phone}`); else console.error(`[SMS] Contract notification failed: ${r.error}`); })
            .catch(e => console.error("[SMS] Contract notification error:", e));
        }
      }

      return res.status(201).json(contract);
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/onboarding/bulk-generate-contracts", requireAuth, async (req: Request, res: Response) => {
    try {
      const { onboardingIds, templateId } = req.body;
      if (!templateId || !Array.isArray(onboardingIds) || onboardingIds.length === 0) {
        return res.status(400).json({ message: tr(req, "contract.bulkFieldsRequired") });
      }
      const template = await storage.getContractTemplate(templateId);
      if (!template) return res.status(404).json({ message: tr(req, "template.notFound") });

      const results: { onboardingId: string; success: boolean; error?: string }[] = [];
      const smsPlugin = await storage.getActiveSmsPlugin();

      for (const obId of onboardingIds) {
        try {
          const ob = await storage.getOnboardingRecord(obId);
          if (!ob) { results.push({ onboardingId: obId, success: false, error: tr(req, "error.recordNotFound") }); continue; }
          if (ob.status === "converted" || ob.status === "rejected" || ob.status === "terminated") { results.push({ onboardingId: obId, success: false, error: tr(req, "error.alreadyConverted") }); continue; }
          const candidate = await storage.getCandidate(ob.candidateId);
          if (!candidate) { results.push({ onboardingId: obId, success: false, error: tr(req, "error.candidateNotFound") }); continue; }
          // SMP onboardings have no applicationId — they do not get individual contracts
          if (!ob.applicationId) { results.push({ onboardingId: obId, success: false, error: tr(req, "error.smpNoContracts") }); continue; }

          const existing = await storage.getCandidateContracts({ onboardingId: ob.id });
          const pending = existing.find(c => c.status !== "signed");
          if (pending) {
            await storage.updateCandidateContract(pending.id, {
              templateId: template.id,
              snapshotArticles: template.articles as any,
              snapshotVariables: buildVariableSnapshot(candidate, template, ob),
              status: "awaiting_signing",
            });
          } else {
            await storage.createCandidateContract({
              candidateId: candidate.id,
              onboardingId: ob.id,
              templateId: template.id,
              status: "awaiting_signing",
              snapshotArticles: template.articles as any,
              snapshotVariables: buildVariableSnapshot(candidate, template, ob),
            });
            await storage.updateOnboardingRecord(ob.id, { hasSignedContract: false });
          }

          if (candidate.phone && smsPlugin) {
            sendSmsViaPlugin(smsPlugin, candidate.phone, trL(await getCandidateLocale(candidate), "sms.contractReady"))
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

  app.post("/api/candidate-contracts/:id/sign", requireAuth, async (req: Request, res: Response) => {
    try {
      const contract = await storage.getCandidateContract(req.params.id);
      if (!contract) return res.status(404).json({ message: tr(req, "contract.notFound") });
      if (contract.status === "signed") return res.status(409).json({ message: tr(req, "contract.alreadySigned") });

      // Authorization: admin with candidate_contracts:manage OR the contract's own candidate.
      const isAdmin = req.authIsSuperAdmin || req.authPermissions?.has("candidate_contracts:manage");
      if (!isAdmin) {
        const myCand = await storage.getCandidateByUserId(req.authUserId!);
        if (!myCand || !contract.candidateId || myCand.id !== contract.candidateId) {
          return res.status(403).json({ message: tr(req, "contract.signOwnOnly") });
        }
      }

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
          // Pass the candidate's actual file URLs so the readiness gate
          // is keyed off real uploads, not stale shadow flags.
          const cand = ob.candidateId ? await storage.getCandidate(ob.candidateId) : null;
          const newStatus = computeOnboardingStatus(rec, isSmp, cand);
          await storage.updateOnboardingRecord(contract.onboardingId, {
            hasSignedContract: true,
            contractSignedAt: new Date(),
            status: newStatus,
          });

          // Cascade: contract signed → application status "offered"
          // (signals candidate has committed; awaiting formal employee conversion)
          if (ob.applicationId) {
            const linkedApp = await storage.getApplication(ob.applicationId);
            if (linkedApp && !["offered", "hired", "rejected"].includes(linkedApp.status)) {
              await storage.updateApplication(ob.applicationId, { status: "offered" });
              console.log(`[cascade] Contract ${contract.id} signed → application ${ob.applicationId} → offered`);
            }
          }
        }
      }

      return res.json(updated);
    } catch (err) { return handleError(res, err); }
  });

  app.get("/api/candidate-contracts/:id/preview", requireAuth, async (req: Request, res: Response) => {
    try {
      const contract = await storage.getCandidateContract(req.params.id);
      if (!contract) return res.status(404).json({ message: tr(req, "contract.notFound") });

      const isAdmin = req.authIsSuperAdmin || req.authPermissions?.has("candidate_contracts:read");
      if (!isAdmin) {
        const myCand = await storage.getCandidateByUserId(req.authUserId!);
        if (!myCand || !contract.candidateId || myCand.id !== contract.candidateId) {
          return res.status(403).json({ message: tr(req, "common.accessDenied") });
        }
      }

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
  app.get("/api/question-sets", requireAuth, async (_req: Request, res: Response) => {
    try {
      const data = await storage.getQuestionSets();
      return res.json(data);
    } catch (err) { return handleError(res, err); }
  });

  app.get("/api/question-sets/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const qs = await storage.getQuestionSet(req.params.id);
      if (!qs) return res.status(404).json({ message: tr(req, "questionSet.notFound") });
      return res.json(qs);
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/question-sets", requireAuth, async (req: Request, res: Response) => {
    try {
      const data = insertQuestionSetSchema.parse(req.body);
      const qs = await storage.createQuestionSet(data);
      return res.status(201).json(qs);
    } catch (err) { return handleError(res, err); }
  });

  app.patch("/api/question-sets/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const data = insertQuestionSetSchema.partial().parse(req.body);
      const qs = await storage.updateQuestionSet(req.params.id, data);
      if (!qs) return res.status(404).json({ message: tr(req, "questionSet.notFound") });
      return res.json(qs);
    } catch (err) { return handleError(res, err); }
  });

  app.delete("/api/question-sets/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const ok = await storage.deleteQuestionSet(req.params.id);
      if (!ok) return res.status(404).json({ message: tr(req, "questionSet.notFound") });
      return res.status(204).send();
    } catch (err) { return handleError(res, err); }
  });

  // ─── SMS Plugins ──────────────────────────────────────────────────────────
  app.get("/api/sms-plugins", requirePermission("settings:read"), async (_req: Request, res: Response) => {
    try {
      const plugins = await storage.getSmsPlugins();
      return res.json(plugins);
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/sms-plugins", requirePermission("settings:write"), async (req: Request, res: Response) => {
    try {
      const { pluginConfig, credentials } = req.body as { pluginConfig: unknown; credentials?: Record<string, string> };
      if (!pluginConfig) return res.status(400).json({ message: tr(req, "plugin.configRequired") });

      const validation = validatePluginConfig(pluginConfig);
      if (!validation.valid) return res.status(400).json({ message: validation.error });

      const config = validation.config;
      const plugin = await storage.createSmsPlugin({
        name: config.name,
        version: config.version,
        description: config.description ?? null,
        pluginConfig: config as unknown as Record<string, unknown>,
        credentials: (credentials ?? {}) as Record<string, unknown>,
        isActive: false,
      });
      return res.status(201).json(plugin);
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/sms-plugins/validate", requirePermission("settings:write"), async (req: Request, res: Response) => {
    try {
      const validation = validatePluginConfig(req.body);
      if (!validation.valid) return res.status(400).json({ valid: false, error: validation.error });
      return res.json({ valid: true, config: validation.config });
    } catch (err) { return handleError(res, err); }
  });

  app.patch("/api/sms-plugins/:id/credentials", requirePermission("settings:write"), async (req: Request, res: Response) => {
    try {
      const credentials = z.record(z.string()).parse(req.body);
      const plugin = await storage.updateSmsPluginCredentials(req.params.id, credentials);
      if (!plugin) return res.status(404).json({ message: tr(req, "plugin.notFound") });
      return res.json(plugin);
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/sms-plugins/:id/activate", requirePermission("settings:write"), async (req: Request, res: Response) => {
    try {
      const ok = await storage.activateSmsPlugin(req.params.id);
      if (!ok) return res.status(404).json({ message: tr(req, "plugin.notFound") });
      return res.json({ success: true });
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/sms-plugins/:id/test", requirePermission("settings:write"), async (req: Request, res: Response) => {
    try {
      const { to, message } = z.object({
        to: z.string().min(7),
        message: z.string().min(1),
      }).parse(req.body);

      const plugin = await storage.getSmsPlugin(req.params.id);
      if (!plugin) return res.status(404).json({ message: tr(req, "plugin.notFound") });

      console.log(`[SMS Test] Sending to="${to}" message="${message}" via plugin="${plugin.name}"`);
      const result = await sendSmsViaPlugin(plugin, to, message);
      console.log(`[SMS Test] Result:`, JSON.stringify(result));
      return res.json(result);
    } catch (err) { return handleError(res, err); }
  });

  app.delete("/api/sms-plugins/:id", requirePermission("settings:write"), async (req: Request, res: Response) => {
    try {
      const ok = await storage.deleteSmsPlugin(req.params.id);
      if (!ok) return res.status(404).json({ message: tr(req, "plugin.notFound") });
      return res.status(204).send();
    } catch (err) { return handleError(res, err); }
  });

  // ─── ID Card Templates ──────────────────────────────────────────────────────
  app.get("/api/id-card-templates", requireAuth, async (req: Request, res: Response) => {
    try {
      const eventId = req.query.eventId as string | undefined;
      const templates = await storage.getIdCardTemplates(eventId ? { eventId } : undefined);
      return res.json(templates);
    } catch (err) { return handleError(res, err); }
  });

  app.get("/api/id-card-templates/active", requireAuth, async (req: Request, res: Response) => {
    try {
      const eventId = req.query.eventId as string | undefined;
      const template = await storage.getActiveIdCardTemplate(eventId);
      if (!template) return res.status(404).json({ message: tr(req, "template.noneActive") });
      return res.json(template);
    } catch (err) { return handleError(res, err); }
  });

  app.get("/api/id-card-templates/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const template = await storage.getIdCardTemplate(req.params.id);
      if (!template) return res.status(404).json({ message: tr(req, "template.notFound") });
      return res.json(template);
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/id-card-templates", requireAuth, async (req: Request, res: Response) => {
    try {
      const data = insertIdCardTemplateSchema.parse(req.body);
      const template = await storage.createIdCardTemplate(data);
      return res.status(201).json(template);
    } catch (err) { return handleError(res, err); }
  });

  app.patch("/api/id-card-templates/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const data = insertIdCardTemplateSchema.partial().parse(req.body);
      const template = await storage.updateIdCardTemplate(req.params.id, data);
      if (!template) return res.status(404).json({ message: tr(req, "template.notFound") });
      return res.json(template);
    } catch (err) { return handleError(res, err); }
  });

  app.delete("/api/id-card-templates/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const ok = await storage.deleteIdCardTemplate(req.params.id);
      if (!ok) return res.status(404).json({ message: tr(req, "template.notFound") });
      return res.status(204).send();
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/id-card-templates/:id/activate", requireAuth, async (req: Request, res: Response) => {
    try {
      const ok = await storage.activateIdCardTemplate(req.params.id);
      if (!ok) return res.status(404).json({ message: tr(req, "template.notFound") });
      return res.json({ success: true });
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/id-card-templates/:id/background", requireAuth, upload.single("file"), async (req: Request, res: Response) => {
    try {
      if (!req.file) return res.status(400).json({ message: tr(req, "file.noUpload") });
      // ACL intent: **public-read** (Task #202 audit row 3 in KNOWN_ISSUES.md).
      // Task #198 — ID card backgrounds are template assets that the browser
      // loads directly via `<div style="background-image:url(...)">` in the
      // designer preview and the print window (see
      // `client/src/lib/id-card-renderer.ts`). In production they live in DO
      // Spaces; without `isPublic:true` the bucket ACL defaults to "private"
      // and the browser receives 403 on every reload, making the saved
      // background appear to vanish even though the URL persists in
      // `id_card_templates.background_image_url`. Mirrors the candidate-photo
      // flow in `server/lib/photo-upload-handler.ts` and the contract-logo
      // flow at `POST /api/contract-templates/:id/logo` (Task #200).
      const imageUrl = await uploadFile(
        req.file.path,
        req.file.filename,
        getMimeType(req.file.filename),
        { isPublic: true },
      );
      const updateData = { backgroundImageUrl: imageUrl };
      const template = await storage.updateIdCardTemplate(req.params.id, updateData);
      if (!template) return res.status(404).json({ message: tr(req, "template.notFound") });
      return res.json(template);
    } catch (err) { return handleError(res, err); }
  });

  // ─── Printer Plugins ────────────────────────────────────────────────────────
  app.get("/api/printer-plugins", requireAuth, async (_req: Request, res: Response) => {
    try {
      const plugins = await storage.getPrinterPlugins();
      return res.json(plugins);
    } catch (err) { return handleError(res, err); }
  });

  app.get("/api/printer-plugins/active", requireAuth, async (req: Request, res: Response) => {
    try {
      const plugin = await storage.getActivePrinterPlugin();
      if (!plugin) return res.status(404).json({ message: tr(req, "plugin.noActivePrinter") });
      return res.json(plugin);
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/printer-plugins", requireAuth, async (req: Request, res: Response) => {
    try {
      const data = insertPrinterPluginSchema.parse(req.body);
      const plugin = await storage.createPrinterPlugin(data);
      return res.status(201).json(plugin);
    } catch (err) { return handleError(res, err); }
  });

  app.patch("/api/printer-plugins/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const data = insertPrinterPluginSchema.partial().parse(req.body);
      const plugin = await storage.updatePrinterPlugin(req.params.id, data);
      if (!plugin) return res.status(404).json({ message: tr(req, "plugin.notFound") });
      return res.json(plugin);
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/printer-plugins/:id/activate", requireAuth, async (req: Request, res: Response) => {
    try {
      const ok = await storage.activatePrinterPlugin(req.params.id);
      if (!ok) return res.status(404).json({ message: tr(req, "plugin.notFound") });
      return res.json({ success: true });
    } catch (err) { return handleError(res, err); }
  });

  app.delete("/api/printer-plugins/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const ok = await storage.deletePrinterPlugin(req.params.id);
      if (!ok) return res.status(404).json({ message: tr(req, "plugin.notFound") });
      return res.status(204).send();
    } catch (err) { return handleError(res, err); }
  });

  // ─── ID Card Print Logs ─────────────────────────────────────────────────────
  app.get("/api/id-card-print-logs", requireAuth, async (req: Request, res: Response) => {
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

  app.post("/api/id-card-print-logs", requireAuth, async (req: Request, res: Response) => {
    try {
      const data = insertIdCardPrintLogSchema.parse(req.body);
      const log = await storage.createIdCardPrintLog(data);
      return res.status(201).json(log);
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/id-card-print-logs/bulk", requireAuth, async (req: Request, res: Response) => {
    try {
      const body = req.body as { logs?: unknown[] };
      if (!Array.isArray(body.logs) || body.logs.length === 0) {
        return res.status(400).json({ message: tr(req, "common.logsRequired") });
      }
      const validated = body.logs.map((l) => insertIdCardPrintLogSchema.parse(l));
      const created = await storage.bulkCreateIdCardPrintLogs(validated);
      return res.status(201).json(created);
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/id-card-print-jobs", requireAuth, async (req: Request, res: Response) => {
    try {
      const { employeeIds, templateId, printerPluginId, statuses } = req.body as {
        employeeIds: string[];
        templateId?: string | null;
        printerPluginId?: string | null;
        statuses: { employeeId: string; status: string; error?: string }[];
      };
      if (!Array.isArray(employeeIds) || employeeIds.length === 0) {
        return res.status(400).json({ message: tr(req, "common.employeeIdsRequired") });
      }
      if (!Array.isArray(statuses)) {
        return res.status(400).json({ message: tr(req, "common.statusesRequired") });
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

  app.get("/api/workforce/:id/last-printed", requireAuth, async (req: Request, res: Response) => {
    try {
      const date = await storage.getLastPrintDate(req.params.id);
      return res.json({ lastPrintedAt: date?.toISOString() ?? null });
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/workforce/last-printed-bulk", requireAuth, async (req: Request, res: Response) => {
    try {
      const { employeeIds } = req.body as { employeeIds?: string[] };
      if (!Array.isArray(employeeIds)) {
        return res.status(400).json({ message: tr(req, "common.employeeIdsRequired") });
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
  app.get("/api/shifts", requireAuth, async (_req: Request, res: Response) => {
    try { return res.json(await storage.getShifts()); }
    catch (err) { return handleError(res, err); }
  });

  app.get("/api/shifts/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const row = await storage.getShift(req.params.id);
      if (!row) return res.status(404).json({ message: tr(req, "shift.notFound") });
      return res.json(row);
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/shifts", requireAuth, async (req: Request, res: Response) => {
    try {
      const data = insertShiftSchema.parse(req.body);
      const row = await storage.createShift(data);
      return res.status(201).json(row);
    } catch (err) { return handleError(res, err); }
  });

  app.patch("/api/shifts/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const data = insertShiftSchema.partial().parse(req.body);
      const row = await storage.updateShift(req.params.id, data);
      if (!row) return res.status(404).json({ message: tr(req, "shift.notFound") });
      return res.json(row);
    } catch (err) { return handleError(res, err); }
  });

  app.delete("/api/shifts/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const ok = await storage.deleteShift(req.params.id);
      if (!ok) return res.status(404).json({ message: tr(req, "shift.notFound") });
      return res.status(204).end();
    } catch (err) { return handleError(res, err); }
  });

  // ─── Schedule Templates ──────────────────────────────────────────────────────
  app.get("/api/schedule-templates", requireAuth, async (req: Request, res: Response) => {
    try {
      const { eventId } = req.query as { eventId?: string };
      return res.json(await storage.getScheduleTemplates(eventId ? { eventId } : undefined));
    } catch (err) { return handleError(res, err); }
  });

  app.get("/api/schedule-templates/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const row = await storage.getScheduleTemplate(req.params.id);
      if (!row) return res.status(404).json({ message: tr(req, "scheduleTemplate.notFound") });
      return res.json(row);
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/schedule-templates", requireAuth, async (req: Request, res: Response) => {
    try {
      const data = insertScheduleTemplateSchema.parse(req.body);
      const row = await storage.createScheduleTemplate(data);
      return res.status(201).json(row);
    } catch (err) { return handleError(res, err); }
  });

  app.patch("/api/schedule-templates/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const data = insertScheduleTemplateSchema.partial().parse(req.body);
      const row = await storage.updateScheduleTemplate(req.params.id, data);
      if (!row) return res.status(404).json({ message: tr(req, "scheduleTemplate.notFound") });
      return res.json(row);
    } catch (err) { return handleError(res, err); }
  });

  app.delete("/api/schedule-templates/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const ok = await storage.deleteScheduleTemplate(req.params.id);
      if (!ok) return res.status(404).json({ message: tr(req, "scheduleTemplate.notFound") });
      return res.status(204).end();
    } catch (err) { return handleError(res, err); }
  });

  // ─── Schedule Assignments ────────────────────────────────────────────────────
  app.get("/api/schedule-assignments", requireAuth, async (req: Request, res: Response) => {
    try {
      const { workforceId, templateId, activeOnly } = req.query as { workforceId?: string; templateId?: string; activeOnly?: string };
      return res.json(await storage.getScheduleAssignments({
        workforceId,
        templateId,
        activeOnly: activeOnly === "true",
      }));
    } catch (err) { return handleError(res, err); }
  });

  app.get("/api/schedule-assignments/employee/:workforceId/active", requireAuth, async (req: Request, res: Response) => {
    try {
      const row = await storage.getActiveAssignmentForEmployee(req.params.workforceId);
      return res.json(row ?? null);
    } catch (err) { return handleError(res, err); }
  });

  app.get("/api/schedule-assignments/employee/:workforceId", requireAuth, async (req: Request, res: Response) => {
    try {
      const rows = await storage.getScheduleAssignments({ workforceId: req.params.workforceId });
      return res.json(rows);
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/schedule-assignments", requireAuth, async (req: Request, res: Response) => {
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
      const emp = data.workforceId ? await storage.getWorkforceEmployee(data.workforceId) : null;
      const template = data.templateId ? await storage.getScheduleTemplate(data.templateId) : null;
      const empNum = emp?.employeeNumber ?? undefined;
      const subjectName = emp?.fullNameEn ?? undefined;
      await logAudit(req, {
        action: "schedule.assigned",
        entityType: "schedule",
        entityId: row.id,
        employeeNumber: empNum,
        subjectName,
        description: `Assigned schedule "${(template as any)?.name ?? data.templateId}" to employee #${empNum ?? "—"} "${subjectName ?? data.workforceId}" from ${data.startDate}`,
        metadata: { templateId: data.templateId, workforceId: data.workforceId, startDate: data.startDate, endDate },
      });
      return res.status(201).json(row);
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/schedule-assignments/bulk", requireAuth, async (req: Request, res: Response) => {
    try {
      const { workforceIds, templateId, startDate, assignedBy, endDate } = req.body as {
        workforceIds: string[];
        templateId: string;
        startDate: string;
        assignedBy?: string;
        endDate?: string | null;
      };
      if (!Array.isArray(workforceIds) || !templateId || !startDate) {
        return res.status(400).json({ message: tr(req, "schedule.bulkFieldsRequired") });
      }
      const result = await storage.bulkAssignSchedule(workforceIds, templateId, startDate, assignedBy, endDate);
      return res.status(201).json(result);
    } catch (err) { return handleError(res, err); }
  });

  app.patch("/api/schedule-assignments/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const data = insertScheduleAssignmentSchema.partial().parse(req.body);
      const existing = await storage.getScheduleAssignment(req.params.id);
      if (!existing) return res.status(404).json({ message: tr(req, "scheduleAssignment.notFound") });
      const startDate = data.startDate ?? existing.startDate;
      const endDate = data.endDate !== undefined ? data.endDate : existing.endDate;
      const hasOverlap = await storage.checkScheduleOverlap(existing.workforceId, startDate, endDate, req.params.id);
      if (hasOverlap) return res.status(409).json({ message: tr(req, "scheduleAssignment.overlap") });
      const row = await storage.updateScheduleAssignment(req.params.id, data);
      if (!row) return res.status(404).json({ message: tr(req, "scheduleAssignment.notFound") });
      return res.json(row);
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/schedule-assignments/:id/end", requireAuth, async (req: Request, res: Response) => {
    try {
      const { endDate } = req.body as { endDate: string };
      if (!endDate) return res.status(400).json({ message: tr(req, "common.endDateRequired") });
      const row = await storage.endScheduleAssignment(req.params.id, endDate);
      if (!row) return res.status(404).json({ message: tr(req, "assignment.notFound") });
      return res.json(row);
    } catch (err) { return handleError(res, err); }
  });

  app.delete("/api/schedule-assignments/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const ok = await storage.deleteScheduleAssignment(req.params.id);
      if (!ok) return res.status(404).json({ message: tr(req, "assignment.notFound") });
      return res.status(204).end();
    } catch (err) { return handleError(res, err); }
  });

  // ─── Attendance Records ──────────────────────────────────────────────────────
  async function enrichAttendanceMinutes(data: { workforceId: string; date: string; status?: string | null; clockIn?: string | null; clockOut?: string | null; minutesScheduled?: number | null; minutesWorked?: number | null }) {
    if (!data.workforceId || !data.date) return;
    const { timeToMinutes, getShiftForEmployeeDate } = await import("./verification-pipeline");
    const shiftInfo = await getShiftForEmployeeDate(data.workforceId, data.date);
    if (shiftInfo) {
      data.minutesScheduled = shiftInfo.shiftDuration;
      if (data.status === "absent") {
        data.minutesWorked = 0;
      } else if (data.clockIn && data.clockOut) {
        const cIn = timeToMinutes(data.clockIn);
        let cOut = timeToMinutes(data.clockOut);
        if (cOut <= cIn) cOut += 24 * 60;
        data.minutesWorked = Math.min(cOut - cIn, shiftInfo.shiftDuration);
      }
    }
  }

  app.get("/api/attendance", requirePermission("attendance:read"), async (req: Request, res: Response) => {
    try {
      const { workforceId, dateFrom, dateTo, date } = req.query as { workforceId?: string; dateFrom?: string; dateTo?: string; date?: string };
      return res.json(await storage.getAttendanceRecords({ workforceId, dateFrom, dateTo, date }));
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/attendance", requirePermission("attendance:create"), async (req: Request, res: Response) => {
    try {
      const data = insertAttendanceRecordSchema.parse(req.body);
      await enrichAttendanceMinutes(data);
      const row = await storage.upsertAttendanceRecord(data);
      return res.status(201).json(row);
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/attendance/bulk", requirePermission("attendance:create"), async (req: Request, res: Response) => {
    try {
      const { records } = req.body as { records: unknown[] };
      if (!Array.isArray(records)) return res.status(400).json({ message: tr(req, "common.recordsRequired") });
      const parsed = records.map(r => insertAttendanceRecordSchema.parse(r));
      await Promise.all(parsed.map(r => enrichAttendanceMinutes(r)));
      const results = await Promise.all(parsed.map(r => storage.upsertAttendanceRecord(r)));
      return res.status(201).json(results);
    } catch (err) { return handleError(res, err); }
  });

  app.patch("/api/attendance/:id", requirePermission("attendance:update"), async (req: Request, res: Response) => {
    try {
      const existing = await storage.getAttendanceRecord(req.params.id);
      if (!existing) return res.status(404).json({ message: tr(req, "attendance.notFound") });
      const data = insertAttendanceRecordSchema.partial().parse(req.body);
      const merged = { ...existing, ...data };
      await enrichAttendanceMinutes(merged);
      const row = await storage.upsertAttendanceRecord(merged);
      const emp = existing.workforceId ? await storage.getWorkforceEmployee(existing.workforceId) : null;
      const empNum = emp?.employeeNumber ?? undefined;
      const subjectName = emp?.fullNameEn ?? undefined;
      await logAudit(req, {
        action: "attendance.corrected",
        entityType: "attendance",
        entityId: req.params.id,
        employeeNumber: empNum,
        subjectName,
        description: `Manually corrected attendance of employee #${empNum ?? "—"} "${subjectName ?? existing.workforceId}" on ${existing.date ?? "—"} → ${data.status ?? existing.status}`,
        metadata: { date: existing.date, oldStatus: existing.status, newStatus: data.status },
      });
      return res.json(row);
    } catch (err) { return handleError(res, err); }
  });

  app.delete("/api/attendance/:id", requirePermission("attendance:delete"), async (req: Request, res: Response) => {
    try {
      const ok = await storage.deleteAttendanceRecord(req.params.id);
      if (!ok) return res.status(404).json({ message: tr(req, "attendance.notFound") });
      return res.status(204).end();
    } catch (err) { return handleError(res, err); }
  });

  app.get("/api/attendance/summary", requirePermission("attendance:dashboard"), async (req: Request, res: Response) => {
    try {
      const { dateFrom, dateTo } = req.query as { dateFrom?: string; dateTo?: string };
      if (!dateFrom || !dateTo) return res.status(400).json({ message: tr(req, "common.dateRangeRequired") });
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

  app.get("/api/attendance/dashboard-stats", requirePermission("attendance:dashboard"), async (req: Request, res: Response) => {
    try {
      const { dateFrom, dateTo } = req.query as { dateFrom?: string; dateTo?: string };
      if (!dateFrom || !dateTo) return res.status(400).json({ message: tr(req, "common.dateRangeRequired") });
      const allEmployees = await storage.getWorkforce({ isActive: true });
      const workforceIds = allEmployees.map((e: { id: string }) => e.id);
      if (workforceIds.length === 0) return res.json({ totals: { present: 0, absent: 0, late: 0, excused: 0, totalRecords: 0, totalMinutesWorked: 0, totalMinutesScheduled: 0, totalMinutesLate: 0 }, topLate: [], topAbsent: [] });

      const summary = await storage.getWorkedDaySummary(workforceIds, dateFrom, dateTo);
      const enriched = summary.map(s => {
        const emp = allEmployees.find((e: { id: string; fullNameEn?: string | null; employeeNumber?: string }) => e.id === s.workforceId);
        return { ...s, fullNameEn: emp?.fullNameEn ?? null, employeeNumber: emp?.employeeNumber ?? null };
      });

      const totals = enriched.reduce((acc, r) => ({
        present: acc.present + r.workedDays,
        absent: acc.absent + r.absentDays,
        late: acc.late + r.lateDays,
        excused: acc.excused + r.excusedDays,
        totalRecords: acc.totalRecords + r.totalScheduledDays,
        totalMinutesWorked: acc.totalMinutesWorked + r.totalMinutesWorked,
        totalMinutesScheduled: acc.totalMinutesScheduled + r.totalMinutesScheduled,
        totalMinutesLate: acc.totalMinutesLate + r.totalMinutesLate,
      }), { present: 0, absent: 0, late: 0, excused: 0, totalRecords: 0, totalMinutesWorked: 0, totalMinutesScheduled: 0, totalMinutesLate: 0 });

      const topLate = [...enriched].sort((a, b) => b.totalMinutesLate - a.totalMinutesLate).slice(0, 50);
      const topAbsent = [...enriched].sort((a, b) => b.absentDays - a.absentDays).slice(0, 50);

      return res.json({ totals, topLate, topAbsent });
    } catch (err) { return handleError(res, err); }
  });

  app.get("/api/attendance/export-lateness", requirePermission("attendance:export"), async (req: Request, res: Response) => {
    try {
      const { dateFrom, dateTo, format } = req.query as { dateFrom?: string; dateTo?: string; format?: string };
      if (!dateFrom || !dateTo) return res.status(400).json({ message: tr(req, "common.dateRangeRequired") });
      const allEmployees = await storage.getWorkforce({ isActive: true });
      const workforceIds = allEmployees.map((e: { id: string }) => e.id);
      const summary = await storage.getWorkedDaySummary(workforceIds, dateFrom, dateTo);
      const enriched = summary.map(s => {
        const emp = allEmployees.find((e: { id: string; fullNameEn?: string | null; employeeNumber?: string }) => e.id === s.workforceId);
        return { ...s, fullNameEn: emp?.fullNameEn ?? null, employeeNumber: emp?.employeeNumber ?? null };
      });
      const sorted = [...enriched].sort((a, b) => b.totalMinutesLate - a.totalMinutesLate).filter(r => r.totalMinutesLate > 0);

      const headers = ["Employee #", "Name", "Late Days", "Absent Days", "Total Minutes Late", "Total Minutes Worked", "Total Minutes Scheduled"];
      const rows = sorted.map(r => [r.employeeNumber ?? "", r.fullNameEn ?? "", r.lateDays, r.absentDays, r.totalMinutesLate, r.totalMinutesWorked, r.totalMinutesScheduled]);

      if (format === "xlsx") {
        const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Lateness Report");
        const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename="lateness_report_${dateFrom}_${dateTo}.xlsx"`);
        return res.send(buf);
      }

      const csvLines = [headers.join(","), ...rows.map(r => r.join(","))];
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="lateness_report_${dateFrom}_${dateTo}.csv"`);
      return res.send(csvLines.join("\n"));
    } catch (err) { return handleError(res, err); }
  });

  app.get("/api/portal/my-shift/:workforceId", requireAuth, async (req: Request, res: Response) => {
    try {
      const authUserId = getAuthUserId(req);
      if (!authUserId) return res.status(401).json({ message: tr(req, "auth.requiredShort") });
      const { workforceId } = req.params;
      const wfRecord = await storage.getWorkforceEmployee(workforceId);
      if (wfRecord) {
        const user = await storage.getUser(authUserId);
        const isAdmin = req.authIsSuperAdmin || req.authRoleSlug !== "candidate";
        if (!isAdmin) {
          const candidate = user?.nationalId ? await storage.getCandidateByNationalId(user.nationalId) : null;
          if (!candidate || wfRecord.candidateId !== candidate.id) {
            return res.status(403).json({ message: tr(req, "common.accessDenied") });
          }
        }
      }
      const assignment = await storage.getActiveAssignmentForEmployee(workforceId);
      if (!assignment) return res.json({ assignment: null, template: null, shifts: {}, attendance: [] });

      const template = await storage.getScheduleTemplate(assignment.templateId);
      const allShifts = await storage.getShifts();
      const shiftMap: Record<string, { id: string; name: string; startTime: string; endTime: string; color: string }> = {};
      for (const s of allShifts) shiftMap[s.id] = { id: s.id, name: s.name, startTime: s.startTime, endTime: s.endTime, color: s.color };

      const today = new Date();
      const dateFrom = new Date(today);
      dateFrom.setDate(dateFrom.getDate() - 7);
      const dateTo = new Date(today);
      dateTo.setDate(dateTo.getDate() + 7);
      const fmt = (d: Date) => d.toISOString().split("T")[0];

      const attendance = await storage.getAttendanceRecords({ workforceId, dateFrom: fmt(dateFrom), dateTo: fmt(dateTo) });

      return res.json({ assignment, template: template ?? null, shifts: shiftMap, attendance });
    } catch (err) { return handleError(res, err); }
  });

  // Employee portal read-only endpoint: current schedule assignment for candidate portal
  app.get("/api/portal/schedule/:workforceId", requireAuth, async (req: Request, res: Response) => {
    try {
      const assignment = await storage.getActiveAssignmentForEmployee(req.params.workforceId);
      if (!assignment) return res.json(null);
      const template = await storage.getScheduleTemplate(assignment.templateId);
      return res.json({ assignment, template: template ?? null });
    } catch (err) { return handleError(res, err); }
  });

  // ─── Portal: Data Erasure Request ───────────────────────────────────────────
  app.post("/api/portal/data-erasure-request", requireAuth, async (req: Request, res: Response) => {
    try {
      const authUserId = getAuthUserId(req);
      if (!authUserId) {
        return res.status(401).json({ message: tr(req, "auth.requiredRelogin") });
      }

      const { workforceId, reason } = req.body;
      if (!workforceId) {
        return res.status(400).json({ message: tr(req, "common.workforceIdRequired") });
      }

      const wf = await storage.getWorkforceEmployee(workforceId);
      if (!wf) {
        return res.status(404).json({ message: tr(req, "employeeRecord.notFound") });
      }

      const candidate = await storage.getCandidate(wf.candidateId);
      if (!candidate || candidate.userId !== authUserId) {
        return res.status(403).json({ message: tr(req, "erasure.notAuthorized") });
      }

      const employeeName = candidate.fullNameEn || wf.employeeNumber || workforceId;

      const existing = await storage.getInboxItems({ status: "pending", type: "general_request", limit: 500 });
      const hasPending = existing.data.some(item =>
        item.entityType === "workforce" && item.entityId === workforceId &&
        item.title.includes("Data Erasure Request")
      );
      if (hasPending) {
        return res.status(409).json({ message: tr(req, "erasure.alreadyPending") });
      }

      await createInboxItem(
        "general_request",
        `Data Erasure Request — ${employeeName}`,
        `Employee ${employeeName} (${wf.employeeNumber || "N/A"}) has requested erasure of their personal data.\n\nReason: ${reason || "No reason provided"}\n\nPlease review this request in accordance with company data retention policy and applicable labor regulations. Certain employment records may need to be retained per legal requirements.`,
        { workforceId, candidateId: wf.candidateId, requestedAt: new Date().toISOString(), source: "mobile_app" },
        "high",
        { entityType: "workforce", entityId: workforceId }
      );

      await storage.createAuditLog({
        actorId: authUserId,
        actorName: employeeName,
        action: "data_erasure_requested",
        entityType: "workforce",
        entityId: workforceId,
        description: `Data erasure request submitted by ${employeeName} via mobile app`,
        metadata: { requestedAt: new Date().toISOString(), source: "mobile_app", reason: reason || null },
      });

      return res.json({ message: tr(req, "erasure.submitted") });
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/portal/data-deletion-request", requireAuth, async (req: Request, res: Response) => {
    return res.status(410).json({ message: tr(req, "common.endpointDeprecated") });
  });

  app.get("/api/portal/data-erasure-status", requireAuth, async (req: Request, res: Response) => {
    try {
      const authUserId = getAuthUserId(req);
      if (!authUserId) {
        return res.status(401).json({ message: tr(req, "auth.requiredShort") });
      }

      const workforceId = req.query.workforceId as string;
      if (!workforceId) {
        return res.status(400).json({ message: tr(req, "common.workforceIdRequired") });
      }

      const wf = await storage.getWorkforceEmployee(workforceId);
      if (!wf) {
        return res.status(404).json({ message: tr(req, "employeeRecord.notFound") });
      }
      const candidate = await storage.getCandidate(wf.candidateId);
      if (!candidate || candidate.userId !== authUserId) {
        return res.status(403).json({ message: tr(req, "common.notAuthorized") });
      }

      const existing = await storage.getInboxItems({ status: "pending", type: "general_request", limit: 500 });
      const pending = existing.data.find(item =>
        item.entityType === "workforce" && item.entityId === workforceId &&
        item.title.includes("Data Erasure Request")
      );
      return res.json({ hasPendingRequest: !!pending, requestDate: pending?.createdAt || null });
    } catch (err) { return handleError(res, err); }
  });

  // ─── Assets ──────────────────────────────────────────────────────────────────
  app.get("/api/assets", requirePermission("assets:read"), async (req: Request, res: Response) => {
    try {
      const includeInactive = req.query.includeInactive === "true";
      const rows = await storage.getAssets(includeInactive);
      return res.json(rows);
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/assets", requirePermission("assets:create"), async (req: Request, res: Response) => {
    try {
      const data = insertAssetSchema.parse(req.body);
      const row = await storage.createAsset(data);
      return res.status(201).json(row);
    } catch (err) { return handleError(res, err); }
  });

  app.get("/api/assets/:id", requirePermission("assets:read"), async (req: Request, res: Response) => {
    try {
      const row = await storage.getAsset(req.params.id);
      if (!row) return res.status(404).json({ message: tr(req, "asset.notFound") });
      return res.json(row);
    } catch (err) { return handleError(res, err); }
  });

  app.patch("/api/assets/:id", requirePermission("assets:update"), async (req: Request, res: Response) => {
    try {
      if ("price" in req.body)
        return res.status(400).json({ message: tr(req, "asset.priceImmutable") });
      const { price: _price, ...rest } = req.body;
      const data = insertAssetSchema.partial().omit({ price: true }).parse(rest);
      const row = await storage.updateAsset(req.params.id, data);
      if (!row) return res.status(404).json({ message: tr(req, "asset.notFound") });
      return res.json(row);
    } catch (err) { return handleError(res, err); }
  });

  app.delete("/api/assets/:id", requirePermission("assets:delete"), async (req: Request, res: Response) => {
    try {
      const ok = await storage.deleteAsset(req.params.id);
      if (!ok) return res.status(404).json({ message: tr(req, "asset.notFound") });
      return res.status(204).end();
    } catch (err) { return handleError(res, err); }
  });

  // ─── Employee Assets ─────────────────────────────────────────────────────────
  app.get("/api/employee-assets", requirePermission("employee_assets:read"), async (req: Request, res: Response) => {
    try {
      const { workforceId, status, assetId } = req.query as { workforceId?: string; status?: string; assetId?: string };
      const rows = await storage.getEmployeeAssets({ workforceId, status, assetId });
      return res.json(rows);
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/employee-assets", requirePermission("employee_assets:assign"), async (req: Request, res: Response) => {
    try {
      const data = insertEmployeeAssetSchema.parse(req.body);
      const row = await storage.assignAsset(data);
      const emp = data.workforceId ? await storage.getWorkforceEmployee(data.workforceId) : null;
      const asset = data.assetId ? await storage.getAsset(data.assetId) : null;
      const empNum = emp?.employeeNumber ?? undefined;
      const subjectName = emp?.fullNameEn ?? undefined;
      await logAudit(req, {
        action: "assets.assigned",
        entityType: "assets",
        entityId: row.id,
        employeeNumber: empNum,
        subjectName,
        description: `Assigned asset "${(asset as any)?.name ?? data.assetId}" to employee #${empNum ?? "—"} "${subjectName ?? data.workforceId}"`,
        metadata: { assetId: data.assetId, workforceId: data.workforceId },
      });
      return res.status(201).json(row);
    } catch (err) { return handleError(res, err); }
  });

  app.get("/api/employee-assets/:id", requirePermission("employee_assets:read"), async (req: Request, res: Response) => {
    try {
      const row = await storage.getEmployeeAsset(req.params.id);
      if (!row) return res.status(404).json({ message: tr(req, "assignment.notFound") });
      return res.json(row);
    } catch (err) { return handleError(res, err); }
  });

  app.patch("/api/employee-assets/:id", requirePermission("employee_assets:update"), async (req: Request, res: Response) => {
    try {
      const existing = await storage.getEmployeeAsset(req.params.id);
      if (!existing) return res.status(404).json({ message: tr(req, "assignment.notFound") });
      const data = insertEmployeeAssetSchema.partial().parse(req.body);
      const row = await storage.updateEmployeeAsset(req.params.id, data);
      const emp = existing.workforceId ? await storage.getWorkforceEmployee(existing.workforceId) : null;
      const asset = existing.assetId ? await storage.getAsset(existing.assetId) : null;
      const empNum = emp?.employeeNumber ?? undefined;
      const subjectName = emp?.fullNameEn ?? undefined;
      const isReturn = data.status === "returned";
      await logAudit(req, {
        action: isReturn ? "assets.returned" : "assets.updated",
        entityType: "assets",
        entityId: req.params.id,
        employeeNumber: empNum,
        subjectName,
        description: isReturn
          ? `Returned asset "${(asset as any)?.name ?? existing.assetId}" from employee #${empNum ?? "—"} "${subjectName ?? existing.workforceId}"`
          : `Updated asset assignment "${(asset as any)?.name ?? existing.assetId}" for employee #${empNum ?? "—"} "${subjectName ?? existing.workforceId}"`,
        metadata: { assetId: existing.assetId, workforceId: existing.workforceId, newStatus: data.status },
      });
      return res.json(row);
    } catch (err) { return handleError(res, err); }
  });

  app.delete("/api/employee-assets/:id", requirePermission("employee_assets:delete"), async (req: Request, res: Response) => {
    try {
      const ok = await storage.deleteEmployeeAsset(req.params.id);
      if (!ok) return res.status(404).json({ message: tr(req, "assignment.notFound") });
      return res.status(204).end();
    } catch (err) { return handleError(res, err); }
  });

  app.get("/api/employee-assets/worker/:workforceId/unreturned", requireAuth, async (req: Request, res: Response) => {
    try {
      const rows = await storage.getUnreturnedAssetsForWorker(req.params.workforceId);
      return res.json(rows);
    } catch (err) { return handleError(res, err); }
  });

  // ─── Offboarding ──────────────────────────────────────────────────────────────

  app.get("/api/offboarding", requirePermission("offboarding:read"), async (req: Request, res: Response) => {
    try {
      const employees = await storage.getOffboardingEmployees();
      return res.json(employees);
    } catch (err) { return handleError(res, err); }
  });

  app.get("/api/offboarding/stats", requirePermission("offboarding:read"), async (req: Request, res: Response) => {
    try {
      const stats = await storage.getOffboardingStats();
      return res.json(stats);
    } catch (err) { return handleError(res, err); }
  });

  app.get("/api/offboarding/:id/settlement", requirePermission("offboarding:read_settlement"), async (req: Request, res: Response) => {
    try {
      const settlement = await storage.getOffboardingSettlement(req.params.id);
      return res.json(settlement);
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/offboarding/:id/start", requirePermission("offboarding:start"), async (req: Request, res: Response) => {
    try {
      const actorId = (req as any).userId ?? undefined;
      const record = await storage.startOffboarding(req.params.id, actorId);
      if (!record) return res.status(404).json({ message: tr(req, "employee.notFound") });
      await logAudit(req, {
        action: "offboarding.started",
        entityType: "offboarding",
        entityId: req.params.id,
        employeeNumber: record.employeeNumber ?? undefined,
        description: `Started offboarding for employee #${record.employeeNumber ?? "—"}`,
      });
      return res.json(record);
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/offboarding/:id/complete", requirePermission("offboarding:complete"), async (req: Request, res: Response) => {
    try {
      const actorId = (req as any).userId ?? undefined;
      const emp = await storage.getWorkforceEmployee(req.params.id);
      const settlement = await storage.getOffboardingSettlement(req.params.id);
      const record = await storage.completeOffboarding(req.params.id, actorId);

      await logAudit(req, {
        action: "offboarding.completed",
        entityType: "offboarding",
        entityId: req.params.id,
        employeeNumber: record.employeeNumber ?? undefined,
        subjectName: emp?.fullNameEn ?? undefined,
        description: `Completed offboarding for employee #${record.employeeNumber ?? "—"} "${emp?.fullNameEn ?? "—"}". Net settlement: ${settlement?.netSettlement ?? 0} SAR`,
        metadata: { netSettlement: settlement?.netSettlement, totalDeductions: settlement?.totalDeductions },
      });
      return res.json(record);
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/offboarding/bulk-start", requirePermission("offboarding:bulk_start"), async (req: Request, res: Response) => {
    try {
      const { ids } = req.body as { ids: string[] };
      if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: tr(req, "common.idsRequired") });
      const actorId = (req as any).userId ?? undefined;
      let started = 0;
      const errors: { id: string; message: string }[] = [];
      for (const id of ids) {
        try {
          await storage.startOffboarding(id, actorId);
          started++;
        } catch (e: any) {
          errors.push({ id, message: e?.message || "failed" });
        }
      }
      if (started > 0) {
        await logAudit(req, {
          action: "offboarding.bulk_started",
          entityType: "offboarding",
          description: `Bulk-started offboarding for ${started} of ${ids.length} employee(s)`,
          metadata: { started, failed: errors.length, total: ids.length },
        });
      }
      return res.json({ started, errors, total: ids.length });
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/offboarding/bulk-complete", requirePermission("offboarding:bulk_complete"), async (req: Request, res: Response) => {
    try {
      const { ids } = req.body as { ids: string[] };
      if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: tr(req, "common.idsRequired") });
      const actorId = (req as any).userId ?? undefined;
      let completed = 0;
      const errors: { id: string; message: string }[] = [];
      for (const id of ids) {
        try {
          await storage.completeOffboarding(id, actorId);
          completed++;
        } catch (e: any) {
          errors.push({ id, message: e?.message || "failed" });
        }
      }
      if (completed > 0) {
        await logAudit(req, {
          action: "offboarding.bulk_completed",
          entityType: "offboarding",
          description: `Bulk-completed offboarding for ${completed} of ${ids.length} employee(s)`,
          metadata: { completed, failed: errors.length, total: ids.length },
        });
      }
      return res.json({ completed, errors, total: ids.length });
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/offboarding/:id/reassign-event", requirePermission("offboarding:reassign_event"), async (req: Request, res: Response) => {
    try {
      const { eventId } = req.body as { eventId: string };
      if (!eventId) return res.status(400).json({ message: tr(req, "common.eventIdRequired") });
      const emp = await storage.getWorkforceEmployee(req.params.id);
      const record = await storage.reassignEmployeeEvent(req.params.id, eventId);
      const newEvent = await storage.getEvents({});
      const ev = newEvent.find(e => e.id === eventId);
      await logAudit(req, {
        action: "offboarding.reassigned",
        entityType: "offboarding",
        entityId: req.params.id,
        employeeNumber: (emp as any)?.employeeNumber ?? undefined,
        subjectName: (emp as any)?.fullNameEn ?? undefined,
        description: `Reassigned employee #${(emp as any)?.employeeNumber ?? "—"} "${(emp as any)?.fullNameEn ?? "—"}" to event "${ev?.name ?? eventId}" — exited offboarding`,
        metadata: { newEventId: eventId, newEventName: ev?.name },
      });
      return res.json(record);
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/employee-assets/:id/confirm", requirePermission("employee_assets:confirm"), async (req: Request, res: Response) => {
    try {
      const { status } = req.body as { status: "returned" | "not_returned" };
      if (!status || !["returned", "not_returned"].includes(status))
        return res.status(400).json({ message: tr(req, "asset.statusInvalid") });
      const actorId = (req as any).userId ?? undefined;
      const row = await storage.confirmAssetReturn(req.params.id, status, actorId);
      return res.json(row);
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/employee-assets/:id/waive-deduction", requirePermission("employee_assets:waive_deduction"), async (req: Request, res: Response) => {
    try {
      const actorId = (req as any).userId;
      if (!actorId) return res.status(401).json({ message: tr(req, "auth.requiredShort") });
      const existing = await storage.getEmployeeAsset(req.params.id);
      if (!existing) return res.status(404).json({ message: tr(req, "assetAssignment.notFound") });
      const row = await storage.waiveAssetDeduction(req.params.id, actorId);
      const emp = existing.workforceId ? await storage.getWorkforceEmployee(existing.workforceId) : null;
      const asset = existing.assetId ? await storage.getAsset(existing.assetId) : null;
      await logAudit(req, {
        action: "assets.deduction_waived",
        entityType: "assets",
        entityId: req.params.id,
        employeeNumber: emp?.employeeNumber ?? undefined,
        subjectName: emp?.fullNameEn ?? undefined,
        description: `IRREVERSIBLE: Waived deduction for asset "${(asset as any)?.name ?? existing.assetId}" (${(asset as any)?.price ?? 0} SAR) for employee #${emp?.employeeNumber ?? "—"} "${emp?.fullNameEn ?? "—"}"`,
        metadata: { assetId: existing.assetId, assetPrice: (asset as any)?.price },
      });
      return res.json(row);
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/employee-assets/bulk-status", requirePermission("employee_assets:bulk_status"), async (req: Request, res: Response) => {
    try {
      const { ids, status } = req.body as { ids: string[]; status: "returned" | "not_returned" };
      if (!Array.isArray(ids) || ids.length === 0)
        return res.status(400).json({ message: tr(req, "common.idsNonEmpty") });
      if (!status || !["returned", "not_returned"].includes(status))
        return res.status(400).json({ message: tr(req, "asset.statusInvalid") });
      const count = await storage.bulkUpdateAssetStatus(ids, status);
      await logAudit(req, {
        action: "assets.bulk_updated",
        entityType: "assets",
        entityId: "bulk",
        description: `Bulk-marked ${ids.length} assignment(s) as "${status.replace("_", " ")}"`,
        metadata: { ids, status, count },
      });
      return res.json({ updated: count });
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/employee-assets/bulk-confirm", requirePermission("employee_assets:confirm"), async (req: Request, res: Response) => {
    try {
      const { workforceId, status } = req.body as { workforceId: string; status: "returned" | "not_returned" };
      if (!workforceId || !status || !["returned", "not_returned"].includes(status))
        return res.status(400).json({ message: tr(req, "common.workforceIdAndStatusRequired") });
      const actorId = (req as any).userId ?? undefined;
      const count = await storage.bulkConfirmAssets(workforceId, status, actorId);
      const emp = await storage.getWorkforceEmployee(workforceId);
      await logAudit(req, {
        action: "assets.bulk_confirmed",
        entityType: "assets",
        entityId: workforceId,
        employeeNumber: emp?.employeeNumber ?? undefined,
        subjectName: emp?.fullNameEn ?? undefined,
        description: `Bulk-confirmed ${count} asset(s) as "${status.replace("_", " ")}" for employee #${emp?.employeeNumber ?? "—"} "${emp?.fullNameEn ?? "—"}"`,
        metadata: { status, count },
      });
      return res.json({ confirmed: count });
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/employee-assets/bulk-assign", requirePermission("employee_assets:assign"), async (req: Request, res: Response) => {
    try {
      const { assetId, workforceIds, assignedAt, notes } = req.body as {
        assetId: string;
        workforceIds: string[];
        assignedAt: string;
        notes?: string;
      };
      if (!assetId || !Array.isArray(workforceIds) || workforceIds.length === 0 || !assignedAt) {
        return res.status(400).json({ message: tr(req, "assetAssignment.fieldsRequired") });
      }
      const asset = await storage.getAsset(assetId);
      if (!asset) return res.status(404).json({ message: tr(req, "asset.notFound") });
      const result = await storage.bulkAssignAsset(assetId, workforceIds, assignedAt, notes);
      await logAudit(req, {
        action: "assets.bulk_assigned",
        entityType: "assets",
        entityId: assetId,
        description: `Bulk-assigned asset "${asset.name}" to ${result.created} employee(s) (${result.skipped} skipped — already assigned)`,
        metadata: { assetId, created: result.created, skipped: result.skipped, assignedAt },
      });
      return res.status(201).json(result);
    } catch (err) { return handleError(res, err); }
  });

  // ─── Global Search ────────────────────────────────────────────────────────────
  app.get("/api/search", requirePermission("system:search"), async (req: Request, res: Response) => {
    try {
      const { q } = req.query as { q?: string };
      if (!q || q.trim().length < 2) {
        return res.json({ candidates: [], employees: [], events: [], jobs: [] });
      }
      const result = await storage.globalSearch(q.trim());
      return res.json(result);
    } catch (err) { return handleError(res, err); }
  });

  // ─── Audit Logs ───────────────────────────────────────────────────────────────
  const AUDIT_EXPORT_MAX_ROWS = 500_000;

  function csvEscape(value: unknown): string {
    if (value === null || value === undefined) return "";
    const s = typeof value === "string" ? value : (value instanceof Date ? value.toISOString() : (typeof value === "object" ? JSON.stringify(value) : String(value)));
    if (s.includes(",") || s.includes("\"") || s.includes("\n") || s.includes("\r")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }

  const AUDIT_EXPORT_HEADERS = [
    "Timestamp", "Actor", "Action", "Entity Type", "Entity ID",
    "Employee Number", "Subject Name", "Description", "Metadata",
  ];

  function auditRowToValues(log: any): (string | number | null)[] {
    return [
      log.createdAt ? new Date(log.createdAt).toISOString() : "",
      log.actorName ?? "System",
      log.action ?? "",
      log.entityType ?? "",
      log.entityId ?? "",
      log.employeeNumber ?? "",
      log.subjectName ?? "",
      log.description ?? "",
      log.metadata ? JSON.stringify(log.metadata) : "",
    ];
  }

  app.get("/api/audit-logs", requirePermission("audit_logs:read"), async (req: Request, res: Response) => {
    try {
      const { page, limit, search, entityType, actorId, cursor, format, export: exportFlag } = req.query as Record<string, string>;
      const isExport = exportFlag === "true" || format === "csv" || format === "xlsx";

      if (isExport) {
        const fmt = (format ?? "csv").toLowerCase();
        if (fmt !== "csv" && fmt !== "xlsx") {
          return res.status(400).json({ message: "format must be csv or xlsx" });
        }
        const filters = {
          search: search || undefined,
          entityType: entityType || undefined,
          actorId: actorId || undefined,
        };
        const ts = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
        const filename = `audit-log-${ts}.${fmt}`;

        if (fmt === "csv") {
          res.setHeader("Content-Type", "text/csv; charset=utf-8");
          res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
          res.setHeader("Cache-Control", "no-store");
          // BOM for Excel UTF-8 compatibility
          res.write("\uFEFF");
          res.write(AUDIT_EXPORT_HEADERS.map(csvEscape).join(",") + "\n");
          let total = 0;
          for await (const chunk of storage.iterateAuditLogsForExport({ ...filters, chunkSize: 2000, maxRows: AUDIT_EXPORT_MAX_ROWS })) {
            for (const log of chunk) {
              res.write(auditRowToValues(log).map(csvEscape).join(",") + "\n");
              total++;
            }
            if (total >= AUDIT_EXPORT_MAX_ROWS) break;
          }
          return res.end();
        }

        // xlsx — accumulate in chunks (capped) then write workbook
        const aoa: (string | number | null)[][] = [AUDIT_EXPORT_HEADERS];
        let total = 0;
        for await (const chunk of storage.iterateAuditLogsForExport({ ...filters, chunkSize: 2000, maxRows: AUDIT_EXPORT_MAX_ROWS })) {
          for (const log of chunk) {
            aoa.push(auditRowToValues(log));
            total++;
          }
          if (total >= AUDIT_EXPORT_MAX_ROWS) break;
        }
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Audit Log");
        const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.setHeader("Cache-Control", "no-store");
        return res.send(buf);
      }

      // Cursor-based mode (preferred for infinite scroll)
      if (cursor !== undefined || req.query.mode === "cursor") {
        const result = await storage.getAuditLogsCursor({
          cursor: cursor || undefined,
          limit: limit ? Math.min(parseInt(limit), 200) : 50,
          search: search || undefined,
          entityType: entityType || undefined,
          actorId: actorId || undefined,
        });
        return res.json(result);
      }

      // Legacy page-based mode (kept for backwards compatibility)
      const result = await storage.getAuditLogs({
        page: page ? parseInt(page) : 1,
        limit: limit ? Math.min(parseInt(limit), 200) : 50,
        search: search || undefined,
        entityType: entityType || undefined,
        actorId: actorId || undefined,
      });
      return res.json(result);
    } catch (err) { return handleError(res, err); }
  });

  // ─── Inbox Items ──────────────────────────────────────────────────────────────
  const inboxQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    status: z.enum(["pending", "resolved", "dismissed"]).optional(),
    type: z.enum(["document_review", "document_reupload", "application_review", "onboarding_action", "contract_action", "offboarding_action", "schedule_conflict", "asset_return", "candidate_flag", "event_alert", "attendance_verification", "photo_change_request", "excuse_request", "general_request", "system"]).optional(),
    priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
    search: z.string().optional(),
    sortBy: z.enum(["createdAt", "priority", "type"]).default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  });

  app.get("/api/inbox", requirePermission("inbox:read"), async (req: Request, res: Response) => {
    try {
      const params = inboxQuerySchema.parse(req.query);
      const result = await storage.getInboxItems(params);
      return res.json(result);
    } catch (err) { return handleError(res, err); }
  });

  app.get("/api/inbox/count", requirePermission("inbox:read"), async (_req: Request, res: Response) => {
    try {
      const count = await storage.countOpenInboxItems();
      return res.json({ count });
    } catch (err) { return handleError(res, err); }
  });

  app.get("/api/inbox/:id", requirePermission("inbox:read"), async (req: Request, res: Response) => {
    try {
      const item = await storage.getInboxItem(req.params.id);
      if (!item) return res.status(404).json({ message: tr(req, "inbox.notFound") });
      return res.json(item);
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/inbox", requirePermission("inbox:manage"), async (req: Request, res: Response) => {
    try {
      const { insertInboxItemSchema } = await import("@shared/schema");
      const data = insertInboxItemSchema.parse(req.body);
      const item = await storage.createInboxItem(data);
      return res.status(201).json(item);
    } catch (err) { return handleError(res, err); }
  });

  app.patch("/api/inbox/:id/resolve", requirePermission("inbox:manage"), async (req: Request, res: Response) => {
    try {
      const resolvedBy = (req as any).userId ?? "system";
      const notes = typeof req.body?.notes === "string" ? req.body.notes.trim() || undefined : undefined;
      const item = await storage.resolveInboxItem(req.params.id, resolvedBy, notes);
      if (!item) return res.status(404).json({ message: tr(req, "inbox.notFoundOrResolved") });
      await logAudit(req, { action: "inbox_resolve", entityType: "inbox_item", entityId: item.id, description: `Resolved inbox item: ${item.title}` });
      return res.json(item);
    } catch (err) { return handleError(res, err); }
  });

  app.patch("/api/inbox/:id/dismiss", requirePermission("inbox:manage"), async (req: Request, res: Response) => {
    try {
      const resolvedBy = (req as any).userId ?? "system";
      const notes = typeof req.body?.notes === "string" ? req.body.notes.trim() || undefined : undefined;
      const item = await storage.dismissInboxItem(req.params.id, resolvedBy, notes);
      if (!item) return res.status(404).json({ message: tr(req, "inbox.notFoundOrResolved") });
      await logAudit(req, { action: "inbox_dismiss", entityType: "inbox_item", entityId: item.id, description: `Dismissed inbox item: ${item.title}` });
      return res.json(item);
    } catch (err) { return handleError(res, err); }
  });

  const inboxBulkSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(200) });
  const BULK_PROTECTED_TYPES = ["photo_change_request", "attendance_verification", "excuse_request"];

  async function rejectIfProtectedTypes(req: Request, res: Response, ids: string[]): Promise<boolean> {
    const items = await Promise.all(ids.map(id => storage.getInboxItem(id)));
    const protected_ = items.filter(i => i && BULK_PROTECTED_TYPES.includes(i.type));
    if (protected_.length > 0) {
      const types = [...new Set(protected_.map(i => i!.type))].join(", ");
      res.status(422).json({
        message: tr(req, "inbox.bulkProtected", { count: protected_.length, types }),
        protectedCount: protected_.length,
      });
      return true;
    }
    return false;
  }

  app.post("/api/inbox/bulk-resolve", requirePermission("inbox:manage"), async (req: Request, res: Response) => {
    try {
      const { ids } = inboxBulkSchema.parse(req.body);
      if (await rejectIfProtectedTypes(req, res, ids)) return;
      const resolvedBy = (req as any).userId ?? "system";
      const count = await storage.bulkResolveInboxItems(ids, resolvedBy);
      return res.json({ resolved: count });
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/inbox/bulk-dismiss", requirePermission("inbox:manage"), async (req: Request, res: Response) => {
    try {
      const { ids } = inboxBulkSchema.parse(req.body);
      if (await rejectIfProtectedTypes(req, res, ids)) return;
      const resolvedBy = (req as any).userId ?? "system";
      const count = await storage.bulkDismissInboxItems(ids, resolvedBy);
      return res.json({ dismissed: count });
    } catch (err) { return handleError(res, err); }
  });

  // ─── Excuse Requests ─────────────────────────────────────────────────────────
  const excuseRequestSchema = z.object({
    workforceId: z.string(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    reason: z.string().min(1).max(1000),
    attachmentUrl: z.string().nullable().optional(),
  });

  app.post("/api/excuse-requests", requireAuth, async (req: Request, res: Response) => {
    try {
      const authUserId = getAuthUserId(req);
      if (!authUserId) return res.status(401).json({ message: tr(req, "auth.requiredShort") });

      const data = excuseRequestSchema.parse(req.body);

      const wf = await storage.getWorkforceEmployee(data.workforceId);
      if (!wf) return res.status(404).json({ message: tr(req, "employee.notFound") });

      const user = await storage.getUser(authUserId);
      const isAdmin = req.authIsSuperAdmin || req.authRoleSlug !== "candidate";
      if (!isAdmin) {
        const candidate = user?.nationalId ? await storage.getCandidateByNationalId(user.nationalId) : null;
        if (!candidate || wf.candidateId !== candidate.id) {
          return res.status(403).json({ message: tr(req, "common.accessDenied") });
        }
      }

      const existing = await storage.getExcuseRequests({ workforceId: data.workforceId });
      const duplicate = existing.find(e => e.date === data.date && e.status !== "rejected");
      if (duplicate) return res.status(409).json({ message: tr(req, "excuse.alreadyExists") });

      const attendance = await storage.getAttendanceRecords({ workforceId: data.workforceId, date: data.date });
      const todayRecord = attendance[0];
      const hadClockIn = !!(todayRecord && todayRecord.clockIn);

      const now = new Date();
      let effectiveClockOut: string | null = null;
      if (hadClockIn) {
        const hh = String(now.getHours()).padStart(2, "0");
        const mm = String(now.getMinutes()).padStart(2, "0");
        effectiveClockOut = `${hh}:${mm}`;
      }

      const excuse = await storage.createExcuseRequest({
        workforceId: data.workforceId,
        date: data.date,
        reason: data.reason,
        attachmentUrl: data.attachmentUrl ?? null,
        hadClockIn,
        effectiveClockOut,
        status: "pending",
      });

      const employeeName = wf.fullNameEn || wf.employeeNumber || "Employee";
      const excuseType = hadClockIn ? "Partial (mid-shift)" : "Full day";
      await createInboxItem(
        "excuse_request",
        `Excuse Request — ${employeeName}`,
        `${excuseType} excuse for ${data.date}. Reason: ${data.reason}`,
        {
          excuseRequestId: excuse.id,
          workforceId: data.workforceId,
          employeeName,
          employeeNumber: wf.employeeNumber,
          date: data.date,
          hadClockIn,
          effectiveClockOut,
        },
        "medium",
        { entityType: "excuse_request", entityId: excuse.id },
      );

      return res.status(201).json(excuse);
    } catch (err) { return handleError(res, err); }
  });

  app.get("/api/excuse-requests", requireAuth, async (req: Request, res: Response) => {
    try {
      const authUserId = getAuthUserId(req);
      if (!authUserId) return res.status(401).json({ message: tr(req, "auth.requiredShort") });

      const workforceId = req.query.workforceId as string | undefined;
      const status = req.query.status as string | undefined;

      const user = await storage.getUser(authUserId);
      const isAdmin = req.authIsSuperAdmin || req.authRoleSlug !== "candidate";

      if (!isAdmin && !workforceId) {
        return res.status(400).json({ message: tr(req, "common.workforceIdRequired") });
      }

      if (workforceId && !isAdmin) {
        const wf = await storage.getWorkforceEmployee(workforceId);
        if (wf) {
          const candidate = user?.nationalId ? await storage.getCandidateByNationalId(user.nationalId) : null;
          if (!candidate || wf.candidateId !== candidate.id) {
            return res.status(403).json({ message: tr(req, "common.accessDenied") });
          }
        }
      }

      const requests = await storage.getExcuseRequests({ workforceId, status });
      return res.json(requests);
    } catch (err) { return handleError(res, err); }
  });

  app.get("/api/excuse-requests/pending-count", requirePermission("excuse_requests:read"), async (req: Request, res: Response) => {
    try {
      const authUserId = getAuthUserId(req);
      if (!authUserId) return res.status(401).json({ message: tr(req, "auth.requiredShort") });
      const count = await storage.countPendingExcuseRequests();
      return res.json({ count });
    } catch (err) { return handleError(res, err); }
  });

  app.patch("/api/excuse-requests/:id/approve", requirePermission("excuse_requests:approve"), async (req: Request, res: Response) => {
    try {
      const reviewedBy = getAuthUserId(req);
      if (!reviewedBy) return res.status(401).json({ message: tr(req, "auth.requiredShort") });
      // Authorization is handled by requirePermission("excuse_requests:approve") above —
      // any further role check here would be dead (the `users` table no longer carries a
      // string `role` column; permissions are resolved through the role/permissions tables).
      const notes = typeof req.body?.notes === "string" ? req.body.notes.trim() || null : null;
      const excuse = await storage.getExcuseRequest(req.params.id);
      if (!excuse) return res.status(404).json({ message: tr(req, "excuse.notFound") });
      if (excuse.status !== "pending") return res.status(422).json({ message: tr(req, "excuse.cannotApprove", { status: excuse.status }) });

      const updated = await storage.updateExcuseRequest(req.params.id, {
        status: "approved",
        reviewedBy,
        reviewedAt: new Date(),
        reviewNotes: notes,
      });

      const linkedInbox = await db.select().from(inboxItems)
        .where(and(
          eq(inboxItems.type, "excuse_request"),
          eq(inboxItems.entityId, excuse.id),
        ));
      if (linkedInbox[0]) {
        await storage.resolveInboxItem(linkedInbox[0].id, reviewedBy || "system", `Approved${notes ? `: ${notes}` : ""}`);
      }

      await logAudit(req, {
        action: "excuse_approve",
        entityType: "excuse_request",
        entityId: excuse.id,
        description: `Approved excuse request for ${excuse.date} (workforce ${excuse.workforceId})`,
      });

      return res.json(updated);
    } catch (err) { return handleError(res, err); }
  });

  app.patch("/api/excuse-requests/:id/reject", requirePermission("excuse_requests:reject"), async (req: Request, res: Response) => {
    try {
      const reviewedBy = getAuthUserId(req);
      if (!reviewedBy) return res.status(401).json({ message: tr(req, "auth.requiredShort") });
      // Authorization is handled by requirePermission("excuse_requests:reject") above —
      // any further role check here would be dead (the `users` table no longer carries a
      // string `role` column; permissions are resolved through the role/permissions tables).
      const notes = typeof req.body?.notes === "string" ? req.body.notes.trim() || null : null;
      const excuse = await storage.getExcuseRequest(req.params.id);
      if (!excuse) return res.status(404).json({ message: tr(req, "excuse.notFound") });
      if (excuse.status !== "pending") return res.status(422).json({ message: tr(req, "excuse.cannotReject", { status: excuse.status }) });

      const updated = await storage.updateExcuseRequest(req.params.id, {
        status: "rejected",
        reviewedBy,
        reviewedAt: new Date(),
        reviewNotes: notes,
      });

      const linkedInbox = await db.select().from(inboxItems)
        .where(and(
          eq(inboxItems.type, "excuse_request"),
          eq(inboxItems.entityId, excuse.id),
        ));
      if (linkedInbox[0]) {
        await storage.resolveInboxItem(linkedInbox[0].id, reviewedBy || "system", `Rejected${notes ? `: ${notes}` : ""}`);
      }

      await logAudit(req, {
        action: "excuse_reject",
        entityType: "excuse_request",
        entityId: excuse.id,
        description: `Rejected excuse request for ${excuse.date} (workforce ${excuse.workforceId})`,
      });

      return res.json(updated);
    } catch (err) { return handleError(res, err); }
  });

  // ─── Geofence Zones ──────────────────────────────────────────────────────────
  app.get("/api/geofence-zones", requirePermission("geofence:read"), async (_req: Request, res: Response) => {
    try {
      const includeInactive = _req.query.includeInactive === "true";
      const zones = await storage.getGeofenceZones(includeInactive);
      return res.json(zones);
    } catch (err) { return handleError(res, err); }
  });

  app.get("/api/geofence-zones/:id", requirePermission("geofence:read"), async (req: Request, res: Response) => {
    try {
      const zone = await storage.getGeofenceZone(req.params.id);
      if (!zone) return res.status(404).json({ message: tr(req, "zone.notFound") });
      return res.json(zone);
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/geofence-zones", requirePermission("geofence:write"), async (req: Request, res: Response) => {
    try {
      // Task #192 — fail-loud guard against the dormant `polygon` column.
      // The schema reserves a JSONB polygon for future support, but the
      // verification pipeline (server/verification-pipeline.ts) and the
      // admin map UI both implement circles only. Accepting a polygon
      // here would silently break attendance verification: the worker
      // appears inside the polygon on the admin map but the server only
      // ever checks the centre/radius circle. Reject explicitly until
      // polygon support is built end-to-end.
      if (req.body && req.body.polygon != null) {
        return res.status(400).json({ message: tr(req, "geofence.polygonNotSupported") });
      }
      const data = insertGeofenceZoneSchema.parse(req.body);
      const zone = await storage.createGeofenceZone(data);
      await logAudit(req, { action: "create_geofence_zone", entityType: "geofence_zone", entityId: zone.id, description: `Created geofence zone "${zone.name}"` });
      return res.status(201).json(zone);
    } catch (err) { return handleError(res, err); }
  });

  app.patch("/api/geofence-zones/:id", requirePermission("geofence:write"), async (req: Request, res: Response) => {
    try {
      // Task #192 — same polygon guard as the POST handler. See note above.
      if (req.body && req.body.polygon != null) {
        return res.status(400).json({ message: tr(req, "geofence.polygonNotSupported") });
      }
      const updateSchema = z.object({
        name: z.string().min(1).optional(),
        centerLat: z.string().optional(),
        centerLng: z.string().optional(),
        radiusMeters: z.coerce.number().int().min(1).optional(),
        isActive: z.boolean().optional(),
      });
      const data = updateSchema.parse(req.body);
      const zone = await storage.updateGeofenceZone(req.params.id, data);
      if (!zone) return res.status(404).json({ message: tr(req, "zone.notFound") });
      await logAudit(req, { action: "update_geofence_zone", entityType: "geofence_zone", entityId: zone.id, description: `Updated geofence zone "${zone.name}"` });
      return res.json(zone);
    } catch (err) { return handleError(res, err); }
  });

  app.delete("/api/geofence-zones/:id", requirePermission("geofence:write"), async (req: Request, res: Response) => {
    try {
      const deleted = await storage.deleteGeofenceZone(req.params.id);
      if (!deleted) return res.status(404).json({ message: tr(req, "zone.notFound") });
      await logAudit(req, { action: "delete_geofence_zone", entityType: "geofence_zone", entityId: req.params.id, description: "Deleted geofence zone" });
      return res.json({ success: true });
    } catch (err) { return handleError(res, err); }
  });

  // ─── Attendance Mobile Middleware ────────────────────────────────────────────
  const { runVerificationPipeline, approveSubmission, rejectSubmission, getShiftForEmployeeDate, getOrgTimezone, formatInTimezone, timeToMinutes } = await import("./verification-pipeline");

  async function getAttendanceConfig() {
    const [earlyBuf, lateBuf, minDur, maxSubs] = await Promise.all([
      storage.getSystemSetting("attendance_early_buffer_minutes"),
      storage.getSystemSetting("attendance_late_buffer_minutes"),
      storage.getSystemSetting("attendance_min_shift_duration_minutes"),
      storage.getSystemSetting("attendance_max_daily_submissions"),
    ]);
    return {
      earlyBufferMinutes: parseInt(earlyBuf ?? "30", 10),
      lateBufferMinutes: parseInt(lateBuf ?? "60", 10),
      minShiftDurationMinutes: parseInt(minDur ?? "30", 10),
      maxDailySubmissions: parseInt(maxSubs ?? "2", 10),
    };
  }

  app.get("/api/attendance-mobile/status", requireAuth, async (req: Request, res: Response) => {
    try {
      const workforceId = req.query.workforceId as string;
      if (!workforceId) {
        // Task #85 step 2 — every mobile-consumed error path must
        // emit a structured `code`. See docs/api-error-codes.md.
        return mobileError(
          res,
          400,
          MobileErrorCodes.VALIDATION_FAILED,
          tr(req, "common.workforceIdRequired"),
        );
      }

      const userId = getAuthUserId(req);
      if (!userId) {
        return mobileError(
          res,
          401,
          MobileErrorCodes.SESSION_EXPIRED,
          tr(req, "auth.required"),
        );
      }

      const wfRecord = await storage.getWorkforceEmployee(workforceId);
      if (!wfRecord) {
        return mobileError(
          res,
          404,
          MobileErrorCodes.WORKFORCE_NOT_FOUND,
          tr(req, "workforce.notFound"),
        );
      }
      if (wfRecord.candidateId) {
        const candidate = await storage.getCandidate(wfRecord.candidateId);
        if (!candidate || candidate.userId !== userId) {
          return mobileError(
            res,
            403,
            MobileErrorCodes.WORKFORCE_OWNERSHIP_MISMATCH,
            tr(req, "workforce.ownershipMismatch"),
          );
        }
      }

      const orgTz = await getOrgTimezone();
      const now = new Date();
      const { dateStr, timeStr: currentTime } = formatInTimezone(now, orgTz);

      const existing = await db
        .select()
        .from(attendanceRecords)
        .where(
          and(
            eq(attendanceRecords.workforceId, workforceId),
            eq(attendanceRecords.date, dateStr)
          )
        );

      const record = existing[0] ?? null;
      const shiftInfo = await getShiftForEmployeeDate(workforceId, dateStr);
      const config = await getAttendanceConfig();

      let state: "not_checked_in" | "checked_in" | "completed" = "not_checked_in";
      if (record) {
        if (record.clockIn && record.clockOut) {
          state = "completed";
        } else if (record.clockIn) {
          state = "checked_in";
        }
      }

      let nextAllowedAction: "check_in" | "check_out" | "none" = "none";
      if (state === "not_checked_in") nextAllowedAction = "check_in";
      else if (state === "checked_in") nextAllowedAction = "check_out";

      let shiftWindowOpen = true;
      let windowMessage: string | null = null;
      let windowReason: { code: string; params: Record<string, string | number> } | null = null;
      const currentMin = timeToMinutes(currentTime);

      if (shiftInfo && nextAllowedAction !== "none") {
        const shiftStartMin = timeToMinutes(shiftInfo.shiftStartTime);
        const shiftEndMin = timeToMinutes(shiftInfo.shiftEndTime);
        const isOvernight = shiftEndMin <= shiftStartMin;

        const earliestCheckIn = shiftStartMin - config.earlyBufferMinutes;
        const latestCheckOut = isOvernight
          ? (shiftEndMin + 24 * 60 + config.lateBufferMinutes)
          : (shiftEndMin + config.lateBufferMinutes);

        let adjustedCurrent = currentMin;
        if (isOvernight && currentMin < shiftStartMin - config.earlyBufferMinutes) {
          adjustedCurrent += 24 * 60;
        }

        if (nextAllowedAction === "check_in" && adjustedCurrent < earliestCheckIn) {
          shiftWindowOpen = false;
          const waitMin = earliestCheckIn - adjustedCurrent;
          const h = Math.floor(waitMin / 60);
          const m = waitMin % 60;
          const wait = h > 0 ? `${h}h ${m}m` : `${m}m`;
          windowReason = {
            code: "BEFORE_SHIFT_WINDOW",
            params: { start: shiftInfo.shiftStartTime, earliest: formatMinutesToTime(earliestCheckIn), wait },
          };
          windowMessage = tr(req, "attendance.window.beforeShift", windowReason.params);
        } else if (adjustedCurrent > latestCheckOut) {
          shiftWindowOpen = false;
          windowReason = {
            code: "AFTER_SHIFT_WINDOW",
            params: { end: shiftInfo.shiftEndTime },
          };
          windowMessage = tr(req, "attendance.window.afterShift", windowReason.params);
          nextAllowedAction = "none";
        }
      }

      if (state === "checked_in" && record?.clockIn) {
        const clockInMin = timeToMinutes(record.clockIn);
        let elapsed = currentMin - clockInMin;
        if (elapsed < 0) elapsed += 24 * 60;
        if (elapsed < config.minShiftDurationMinutes) {
          shiftWindowOpen = false;
          const remaining = config.minShiftDurationMinutes - elapsed;
          windowReason = {
            code: "MIN_DURATION_NOT_MET",
            params: { required: config.minShiftDurationMinutes, remaining },
          };
          windowMessage = tr(req, "attendance.window.minDuration", windowReason.params);
        }
      }

      const lastSubmission = await db
        .select({ submittedAt: attendanceSubmissions.submittedAt })
        .from(attendanceSubmissions)
        .where(eq(attendanceSubmissions.workforceId, workforceId))
        .orderBy(sql`submitted_at DESC`)
        .limit(1);

      let cooldownUntil: string | null = null;
      if (lastSubmission[0]) {
        const lastAt = new Date(lastSubmission[0].submittedAt).getTime();
        const cooldownEnd = lastAt + 60_000;
        if (cooldownEnd > now.getTime()) {
          cooldownUntil = new Date(cooldownEnd).toISOString();
        }
      }

      // Task #85 step 4 — mint a single-use, HMAC-signed submission
      // token bound to this workforceId. The Android client persists
      // it alongside the captured row at capture time and replays it
      // on the next /submit. The 24h validity window is enough for a
      // worker who pulls status at shift-start to sync later in the
      // day even after going offline.
      const issued = issueSubmissionToken(workforceId);

      return res.json({
        state,
        nextAllowedAction: shiftWindowOpen ? nextAllowedAction : "none",
        shiftAssigned: !!shiftInfo,
        shift: shiftInfo ? {
          startTime: shiftInfo.shiftStartTime,
          endTime: shiftInfo.shiftEndTime,
          durationMinutes: shiftInfo.shiftDuration,
        } : null,
        clockIn: record?.clockIn ?? null,
        clockOut: record?.clockOut ?? null,
        minutesWorked: record?.minutesWorked ?? null,
        shiftWindowOpen,
        windowMessage,
        windowReason,
        cooldownUntil,
        config: {
          earlyBufferMinutes: config.earlyBufferMinutes,
          lateBufferMinutes: config.lateBufferMinutes,
          minShiftDurationMinutes: config.minShiftDurationMinutes,
          maxDailySubmissions: config.maxDailySubmissions,
        },
        date: dateStr,
        currentTime,
        submissionToken: issued.token,
        submissionTokenExpiresAt: issued.expiresAt,
      });
    } catch (err) { return handleError(res, err); }
  });

  function formatMinutesToTime(minutes: number): string {
    const normalized = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
    const h = Math.floor(normalized / 60);
    const m = normalized % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
  }

  app.post("/api/attendance-mobile/submit", requireAuth, upload.single("photo"), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return mobileError(
          res,
          400,
          MobileErrorCodes.PHOTO_REQUIRED,
          tr(req, "photo.required"),
        );
      }

      const schema = z.object({
        workforceId: z.string().min(1),
        gpsLat: z.coerce.number().min(-90).max(90),
        gpsLng: z.coerce.number().min(-180).max(180),
        gpsAccuracy: z.coerce.number().optional(),
        clientTimestamp: z.string().optional(),
        timestamp: z.string().optional(),
        mockLocationDetected: z.preprocess((v) => v === "true" || v === true, z.boolean()).optional(),
        isEmulator: z.preprocess((v) => v === "true" || v === true, z.boolean()).optional(),
        rootDetected: z.preprocess((v) => v === "true" || v === true, z.boolean()).optional(),
        locationProvider: z.string().optional(),
        deviceFingerprint: z.string().optional(),
        ntpTimestamp: z.string().optional(),
        systemClockTimestamp: z.string().optional(),
        lastNtpSyncAt: z.string().optional(),
        locationSource: z.string().optional(),
        submissionToken: z.string().optional(),
        // Task #88 — Play Integrity verdict token from the device.
        // Optional in the schema so capture flows from older builds and
        // pre-rollout staging keep working; the actual gate lives in
        // `verifyAttendanceIntegrityToken` which only enforces when
        // PLAY_INTEGRITY_ENABLED=true.
        integrityToken: z.string().optional(),
      });

      const parsed = schema.parse(req.body);

      const userId = getAuthUserId(req);
      if (!userId) {
        return mobileError(
          res,
          401,
          MobileErrorCodes.AUTH_REQUIRED,
          tr(req, "auth.required"),
        );
      }
      const authUser = await storage.getUser(userId);
      if (!authUser || !authUser.isActive) {
        return mobileError(
          res,
          403,
          MobileErrorCodes.ACCOUNT_DISABLED,
          tr(req, "user.deactivated"),
          {},
          true,
        );
      }

      const wfRecord = await storage.getWorkforceEmployee(parsed.workforceId);
      if (!wfRecord) {
        return mobileError(
          res,
          404,
          MobileErrorCodes.WORKFORCE_NOT_FOUND,
          tr(req, "workforce.notFound"),
        );
      }
      if (wfRecord.candidateId) {
        const candidate = await storage.getCandidate(wfRecord.candidateId);
        if (!candidate || candidate.userId !== userId) {
          return mobileError(
            res,
            403,
            MobileErrorCodes.WORKFORCE_OWNERSHIP_MISMATCH,
            tr(req, "workforce.ownershipMismatch"),
          );
        }
      }
      if (!wfRecord.isActive) {
        if (wfRecord.endDate) {
          const ntpTs = parsed.ntpTimestamp ? new Date(parsed.ntpTimestamp) : null;
          const clientTs = parsed.clientTimestamp || parsed.timestamp;
          let captureTime: number | null = null;
          if (ntpTs && Number.isFinite(ntpTs.getTime())) {
            captureTime = ntpTs.getTime();
          } else if (clientTs) {
            const ct = new Date(clientTs).getTime();
            if (Number.isFinite(ct)) captureTime = ct;
          }
          const endTime = new Date(wfRecord.endDate).getTime();
          if (!Number.isFinite(endTime) || captureTime === null || captureTime > endTime) {
            return mobileError(
              res,
              403,
              MobileErrorCodes.ACCOUNT_TERMINATED,
              tr(req, "workforce.terminated"),
              {},
              true,
            );
          }
        } else {
          return mobileError(
            res,
            403,
            MobileErrorCodes.ACCOUNT_INACTIVE,
            tr(req, "workforce.inactive"),
            {},
            true,
          );
        }
      }

      // ── Task #85 step 4: server-issued submission-token verification ──
      // The Android client receives the token from /status and replays
      // it here. We verify the HMAC, ensure the embedded workforceId
      // matches the request's workforceId (so a token issued for
      // worker A can't be replayed against worker B), and then fall
      // through to the existing UNIQUE-token dedup path for replay
      // detection.
      //
      // Task #85 step 4 — strict enforcement.
      //
      // The submission token is REQUIRED. A request with no token is
      // a pre-Task-#85 client that never received the new HMAC
      // contract; rejecting it with 400 TOKEN_MISSING forces the
      // worker to update / refresh status before they can submit and
      // closes the dedup pre-claim attack surface (a hostile client
      // could mint UUIDs of its own choosing and lock out legitimate
      // workers from the dedup table).
      //
      // Legacy raw-UUID tokens are NOT accepted by default. The
      // `ALLOW_LEGACY_SUBMISSION_TOKENS` env flag exists as an
      // explicit, time-bounded escape hatch (intended to be flipped
      // off and the code path removed entirely in follow-up #93 once
      // ≥99% of devices have rolled to the new build).
      const allowLegacyTokens = process.env.ALLOW_LEGACY_SUBMISSION_TOKENS === "true";

      if (!parsed.submissionToken) {
        return mobileError(
          res,
          400,
          MobileErrorCodes.TOKEN_MISSING,
          "Submission token is required. Refresh attendance status to obtain one.",
        );
      }

      const verdict = verifySubmissionToken(parsed.submissionToken);
      if (!verdict.ok) {
        return mobileError(
          res,
          400,
          verdict.code === "TOKEN_EXPIRED"
            ? MobileErrorCodes.TOKEN_EXPIRED
            : MobileErrorCodes.TOKEN_INVALID,
          verdict.code === "TOKEN_EXPIRED"
            ? "Submission token has expired; please refresh attendance status and retry."
            : "Submission token is invalid.",
        );
      }
      if (verdict.legacy) {
        if (!allowLegacyTokens) {
          return mobileError(
            res,
            400,
            MobileErrorCodes.TOKEN_INVALID,
            "Legacy submission token format is no longer accepted. Please update the app and retry.",
          );
        }
        console.warn(
          "[attendance-mobile/submit] legacy raw-UUID submissionToken accepted under ALLOW_LEGACY_SUBMISSION_TOKENS flag (workforceId=%s)",
          parsed.workforceId,
        );
      } else if (verdict.workforceId !== parsed.workforceId) {
        return mobileError(
          res,
          400,
          MobileErrorCodes.TOKEN_INVALID,
          "Submission token was issued for a different workforce.",
        );
      }

      // Replay detection: the token has already been redeemed.
      // Per docs/api-error-codes.md this is HTTP 409 with code
      // TOKEN_USED (NOT a 200 success — the Android client treats
      // 409 as AlreadySynced and drops the local row, but a 200
      // would falsely advance the state machine on a different
      // device replaying the same token).
      const [existingToken] = await db
        .select()
        .from(attendanceSubmissions)
        .where(eq(attendanceSubmissions.submissionToken, parsed.submissionToken))
        .limit(1);
      if (existingToken) {
        return mobileError(
          res,
          409,
          MobileErrorCodes.TOKEN_USED,
          "Submission token has already been used.",
          {
            submission: existingToken,
            verification: { status: existingToken.status, deduplicated: true },
          },
        );
      }

      // ── Task #88 — Play Integrity verdict gate ───────────────────────
      // When PLAY_INTEGRITY_ENABLED=true the verifier hard-rejects any
      // submit whose integrity token is missing, malformed, or whose
      // verdict fails app/device/account checks. When disabled (default)
      // this is a pass-through, preserving the existing accept-everything
      // behaviour for dev / staging / pre-rollout builds.
      //
      // The canonical nonce is recomputed server-side from the same
      // fields the device used to bind the token. Order MUST match
      // `computeAttendanceNonceHex` and the device-side payload-hash
      // construction in `AttendanceRepository.attemptSubmission` (see
      // docs/android-release-runbook.md §3.2).
      let photoSha256Hex = "";
      try {
        const photoBytes = await fs.promises.readFile(req.file.path);
        photoSha256Hex = crypto
          .createHash("sha256")
          .update(photoBytes)
          .digest("hex");
      } catch (err) {
        console.warn(
          "[attendance-mobile/submit] failed to hash photo for integrity nonce:",
          err,
        );
      }
      const expectedNonceHex = computeAttendanceNonceHex({
        workforceId: parsed.workforceId,
        timestamp: parsed.timestamp ?? parsed.clientTimestamp ?? "",
        gpsLat: parsed.gpsLat,
        gpsLng: parsed.gpsLng,
        photoSha256Hex,
      });
      const integrity = await verifyAttendanceIntegrityToken(
        parsed.integrityToken,
        expectedNonceHex,
      );
      if (!integrity.ok) {
        return res.status(403).json({
          code: integrity.code,
          message: integrity.reason,
        });
      }

      const orgTz = await getOrgTimezone();
      const serverNow = new Date();
      const { dateStr: todayStr, timeStr: nowTime } = formatInTimezone(serverNow, orgTz);
      const attConfig = await getAttendanceConfig();

      const todaySubmissions = await db
        .select({ id: attendanceSubmissions.id })
        .from(attendanceSubmissions)
        .where(
          and(
            eq(attendanceSubmissions.workforceId, parsed.workforceId),
            sql`DATE(${attendanceSubmissions.submittedAt} AT TIME ZONE ${orgTz}) = ${todayStr}`
          )
        );
      if (todaySubmissions.length >= attConfig.maxDailySubmissions) {
        return res.status(429).json({
          message: tr(req, "attendance.dailyLimit", { limit: attConfig.maxDailySubmissions }),
          code: "DAILY_LIMIT_REACHED",
          maxDailySubmissions: attConfig.maxDailySubmissions,
        });
      }

      const todayRecords = await db
        .select()
        .from(attendanceRecords)
        .where(
          and(
            eq(attendanceRecords.workforceId, parsed.workforceId),
            eq(attendanceRecords.date, todayStr)
          )
        );
      const todayRecord = todayRecords[0] ?? null;
      if (todayRecord?.clockIn && todayRecord?.clockOut) {
        return res.status(409).json({
          message: tr(req, "attendance.alreadyComplete"),
          code: "ATTENDANCE_COMPLETED",
          clockIn: todayRecord.clockIn,
          clockOut: todayRecord.clockOut,
        });
      }

      const shiftInfo = await getShiftForEmployeeDate(parsed.workforceId, todayStr);
      const nowMin = timeToMinutes(nowTime);

      if (shiftInfo) {
        const shiftStartMin = timeToMinutes(shiftInfo.shiftStartTime);
        const shiftEndMin = timeToMinutes(shiftInfo.shiftEndTime);
        const isOvernight = shiftEndMin <= shiftStartMin;

        const earliestCheckIn = shiftStartMin - attConfig.earlyBufferMinutes;
        const latestCheckOut = isOvernight
          ? (shiftEndMin + 24 * 60 + attConfig.lateBufferMinutes)
          : (shiftEndMin + attConfig.lateBufferMinutes);

        let adjustedNow = nowMin;
        if (isOvernight && nowMin < shiftStartMin - attConfig.earlyBufferMinutes) {
          adjustedNow += 24 * 60;
        }

        if (!todayRecord && adjustedNow < earliestCheckIn) {
          return res.status(403).json({
            message: tr(req, "attendance.beforeShiftStart", { start: shiftInfo.shiftStartTime, earliest: formatMinutesToTime(earliestCheckIn) }),
            code: "BEFORE_SHIFT_WINDOW",
            shiftStart: shiftInfo.shiftStartTime,
            earliestCheckIn: formatMinutesToTime(earliestCheckIn),
          });
        }
        if (adjustedNow > latestCheckOut) {
          return res.status(403).json({
            message: tr(req, "attendance.afterShiftEnd", { end: shiftInfo.shiftEndTime }),
            code: "AFTER_SHIFT_WINDOW",
            shiftEnd: shiftInfo.shiftEndTime,
            latestCheckOut: formatMinutesToTime(latestCheckOut % (24 * 60)),
          });
        }
      }

      if (todayRecord?.clockIn && !todayRecord?.clockOut) {
        const clockInMin = timeToMinutes(todayRecord.clockIn);
        let elapsed = nowMin - clockInMin;
        if (elapsed < 0) elapsed += 24 * 60;
        if (elapsed < attConfig.minShiftDurationMinutes) {
          return res.status(422).json({
            message: tr(req, "attendance.minShiftDuration", { required: attConfig.minShiftDurationMinutes, remaining: attConfig.minShiftDurationMinutes - elapsed }),
            code: "MIN_DURATION_NOT_MET",
            clockIn: todayRecord.clockIn,
            minDurationMinutes: attConfig.minShiftDurationMinutes,
            elapsedMinutes: elapsed,
          });
        }
      }

      const noShiftAssigned = !shiftInfo;
      // ── End pre-pipeline gate ──

      // ACL intent: **private** (Task #202 audit row 4 in KNOWN_ISSUES.md).
      // Task #201 — Attendance selfies are biometric data, so we keep
      // the upload private (default ACL on DO Spaces). The admin inbox
      // does NOT render these via the raw Spaces URL — it goes through
      // the admin-only proxy `GET /api/attendance-mobile/submissions/:id/photo`
      // defined below, which is gated on `attendance_mobile:review_read`
      // and streams bytes from `getFileBuffer(...)`. This closes
      // ISSUE-008 (admin inbox showed broken images in production for
      // every flagged review) without weakening the ACL the way we did
      // for the lower-sensitivity contract logos (#200) and ID-card
      // backgrounds (#198).
      const photoUrl = await uploadFile(req.file.path, req.file.filename, getMimeType(req.file.filename));
      const serverReceivedAt = new Date();
      // Task #85 step 6 — the server's wall clock at the moment the
      // request was received is the authoritative time-of-record. The
      // client-supplied `clientTimestamp` / `ntpTimestamp` are kept
      // as advisory metadata (audit / drift detection), but they no
      // longer drive the row's `submitted_at` column. This closes
      // F-02: a tampered Android clock can no longer back-date or
      // forward-date a submission past the shift window.
      const submittedAt = serverReceivedAt;

      let ntpTs: Date | null = null;
      let sysClockTs: Date | null = null;
      let lastNtpSync: Date | null = null;

      if (parsed.ntpTimestamp) {
        const d = new Date(parsed.ntpTimestamp);
        if (!isNaN(d.getTime())) ntpTs = d;
      }
      if (parsed.systemClockTimestamp) {
        const d = new Date(parsed.systemClockTimestamp);
        if (!isNaN(d.getTime())) sysClockTs = d;
      }
      if (parsed.lastNtpSyncAt) {
        const d = new Date(parsed.lastNtpSyncAt);
        if (!isNaN(d.getTime())) lastNtpSync = d;
      }

      const clockTamperFlags: string[] = [];

      if (ntpTs && sysClockTs) {
        const drift = Math.abs(ntpTs.getTime() - sysClockTs.getTime());
        if (drift > 5 * 60 * 1000) {
          clockTamperFlags.push(tr(req, "attendance.flag.clockTamperDrift", { minutes: Math.round(drift / 60000) }));
        }
      }

      if (ntpTs && sysClockTs) {
        const submissionAge = serverReceivedAt.getTime() - sysClockTs.getTime();
        const isOfflineSync = submissionAge > 2 * 60 * 1000;
        if (!isOfflineSync) {
          const serverDrift = Math.abs(ntpTs.getTime() - serverReceivedAt.getTime());
          if (serverDrift > 5 * 60 * 1000) {
            clockTamperFlags.push(tr(req, "attendance.flag.serverClockDrift", { minutes: Math.round(serverDrift / 60000) }));
          }
        }
      } else if (ntpTs) {
        const serverDrift = Math.abs(ntpTs.getTime() - serverReceivedAt.getTime());
        if (serverDrift > 5 * 60 * 1000) {
          clockTamperFlags.push(tr(req, "attendance.flag.serverClockDrift", { minutes: Math.round(serverDrift / 60000) }));
        }
      }

      if (lastNtpSync) {
        const ntpAge = serverReceivedAt.getTime() - lastNtpSync.getTime();
        if (ntpAge > 7 * 24 * 60 * 60 * 1000) {
          clockTamperFlags.push(tr(req, "attendance.flag.staleNtp", { days: Math.round(ntpAge / 86400000) }));
        }
      }

      let submission;
      try {
        submission = await storage.createAttendanceSubmission({
          workforceId: parsed.workforceId,
          photoUrl,
          gpsLat: String(parsed.gpsLat),
          gpsLng: String(parsed.gpsLng),
          gpsAccuracy: parsed.gpsAccuracy ? String(parsed.gpsAccuracy) : null,
          submittedAt,
          status: "pending",
          mockLocationDetected: parsed.mockLocationDetected ?? null,
          isEmulator: parsed.isEmulator ?? null,
          rootDetected: parsed.rootDetected ?? null,
          locationProvider: parsed.locationProvider ?? null,
          deviceFingerprint: parsed.deviceFingerprint ?? null,
          serverReceivedAt,
          ntpTimestamp: ntpTs,
          systemClockTimestamp: sysClockTs,
          lastNtpSyncAt: lastNtpSync,
          locationSource: parsed.locationSource ?? null,
          submissionToken: parsed.submissionToken ?? null,
        });
      } catch (insertErr: any) {
        if (parsed.submissionToken && insertErr?.code === "23505" && insertErr?.constraint?.includes("token")) {
          const [dup] = await db
            .select()
            .from(attendanceSubmissions)
            .where(eq(attendanceSubmissions.submissionToken, parsed.submissionToken))
            .limit(1);
          if (dup) return res.status(200).json({ submission: dup, verification: { status: dup.status, deduplicated: true } });
        }
        throw insertErr;
      }

      if (clockTamperFlags.length > 0) {
        const flagReason = clockTamperFlags.join("; ");
        await storage.updateAttendanceSubmission(submission.id, {
          status: "flagged",
          flagReason,
        });
        try {
          const candidate = wfRecord.candidateId ? await storage.getCandidate(wfRecord.candidateId) : null;
          await createInboxItem(
            "attendance_verification",
            `Clock tampering detected — ${candidate?.fullNameEn ?? "Unknown"}`,
            flagReason,
            {
              workforceId: parsed.workforceId,
              employeeNumber: wfRecord.employeeNumber,
              candidateName: candidate?.fullNameEn,
            },
            "high",
            { entityType: "attendance_submission", entityId: submission.id },
          );
        } catch (inboxErr) {
          console.error("[Clock Tampering] Failed to create inbox item:", inboxErr);
        }
      }

      let pipelineResult;
      try {
        pipelineResult = await runVerificationPipeline(submission.id);
      } catch (pipeErr) {
        console.error("[Verification Pipeline] Error:", pipeErr);
        pipelineResult = { status: "flagged" as const, confidence: 0, gpsInside: false, flagReason: tr(req, "attendance.flag.pipelineErrorShort") };
        await storage.updateAttendanceSubmission(submission.id, {
          status: "flagged",
          flagReason: tr(req, "attendance.flag.pipelineError", { detail: pipeErr instanceof Error ? pipeErr.message : "Unknown" }),
          rekognitionConfidence: "0",
        });
      }

      if (noShiftAssigned) {
        try {
          const candidate = wfRecord.candidateId ? await storage.getCandidate(wfRecord.candidateId) : null;
          const existingFlagReason = (await storage.getAttendanceSubmission(submission.id))?.flagReason;
          const noShiftMsg = tr(req, "attendance.flag.noShift");
          const mergedReason = existingFlagReason ? `${existingFlagReason}; ${noShiftMsg}` : noShiftMsg;
          await storage.updateAttendanceSubmission(submission.id, {
            status: "flagged",
            flagReason: mergedReason,
          });
          await createInboxItem(
            "attendance_verification",
            `No shift assigned — ${candidate?.fullNameEn ?? "Unknown"}`,
            `Employee ${wfRecord.employeeNumber ?? parsed.workforceId} submitted attendance but has no shift assigned for today.`,
            {
              workforceId: parsed.workforceId,
              employeeNumber: wfRecord.employeeNumber,
              candidateName: candidate?.fullNameEn,
              reason: "no_shift_assigned",
            },
            "medium",
            { entityType: "attendance_submission", entityId: submission.id },
          );
        } catch (noShiftErr) {
          console.error("[No Shift Flagging] Failed:", noShiftErr);
        }
      }

      const updated = await storage.getAttendanceSubmission(submission.id);
      return res.status(201).json({ submission: updated, verification: pipelineResult });
    } catch (err) { return handleError(res, err); }
  });

  app.get("/api/attendance-mobile/submissions", requirePermission("attendance_mobile:review_read"), async (req: Request, res: Response) => {
    try {
      const filters = {
        workforceId: req.query.workforceId as string | undefined,
        status: req.query.status as string | undefined,
        page: req.query.page ? Number(req.query.page) : 1,
        limit: req.query.limit ? Number(req.query.limit) : 50,
      };
      const result = await storage.getAttendanceSubmissions(filters);
      return res.json(result);
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/attendance-mobile/submissions/statuses", requireAuth, async (req: Request, res: Response) => {
    try {
      const { ids } = req.body ?? {};
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: tr(req, "common.idsRequired") });
      }
      const limitedIds = ids.slice(0, 100);
      const results = await Promise.all(
        limitedIds.map(async (id: string) => {
          const sub = await storage.getAttendanceSubmission(id);
          if (!sub) return { id, status: null };
          return { id: sub.id, status: sub.status, flagReason: sub.flagReason, reviewNotes: sub.reviewNotes, rekognitionConfidence: sub.rekognitionConfidence };
        })
      );
      return res.json(results);
    } catch (err) { return handleError(res, err); }
  });

  app.get("/api/attendance-mobile/submissions/:id", requirePermission("attendance_mobile:review_read"), async (req: Request, res: Response) => {
    try {
      const sub = await storage.getAttendanceSubmission(req.params.id);
      if (!sub) return res.status(404).json({ message: tr(req, "submission.notFound") });
      return res.json(sub);
    } catch (err) { return handleError(res, err); }
  });

  // Task #201 — Admin-only image proxy for the worker selfie attached to
  // a flagged attendance submission. The bytes live on DO Spaces with
  // the default "private" ACL (see the comment at the upload site in
  // POST /api/attendance-mobile/submit), so the admin inbox cannot
  // render them via the raw `submission.photoUrl`. This route streams
  // the bytes through the server, gated on the same permission used by
  // the rest of the review surface (`attendance_mobile:review_read`),
  // so reviewers never need direct Spaces credentials and the photo URL
  // is never handed out to anything other than an authenticated admin
  // session. In dev (no NODE_ENV=production) `getFileBuffer` reads from
  // local /uploads, so this works end-to-end in dev too.
  app.get("/api/attendance-mobile/submissions/:id/photo", requirePermission("attendance_mobile:review_read"), async (req: Request, res: Response) => {
    try {
      const sub = await storage.getAttendanceSubmission(req.params.id);
      if (!sub) return res.status(404).json({ message: tr(req, "submission.notFound") });
      if (!sub.photoUrl) return res.status(404).json({ message: tr(req, "submission.notFound") });
      const buffer = await getFileBuffer(sub.photoUrl);
      res.setHeader("Content-Type", getMimeType(sub.photoUrl));
      res.setHeader("Cache-Control", "private, max-age=300");
      return res.send(buffer);
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.post("/api/attendance-mobile/submissions/:id/approve", requirePermission("attendance_mobile:approve"), async (req: Request, res: Response) => {
    try {
      const { notes, reviewedBy: bodyReviewedBy } = req.body ?? {};
      let reviewedBy = bodyReviewedBy ?? (req as any).userId;
      if (!reviewedBy) {
        const adminUser = await storage.getUserByUsername("admin");
        reviewedBy = adminUser?.id ?? null;
      }
      if (!reviewedBy) return res.status(400).json({ message: tr(req, "common.reviewerRequired") });
      await approveSubmission(req.params.id, reviewedBy, notes);
      await logAudit(req, { action: "approve_attendance_submission", entityType: "attendance_submission", entityId: req.params.id, description: `Approved flagged attendance submission${notes ? `: ${notes}` : ""}` });
      const updated = await storage.getAttendanceSubmission(req.params.id);
      return res.json(updated);
    } catch (err) {
      if (err instanceof Error && (err.message.includes("not found") || err.message.includes("Not found"))) {
        return res.status(404).json({ message: err.message });
      }
      if (err instanceof Error && (err.message.includes("not flagged") || err.message.includes("Only flagged"))) {
        return res.status(409).json({ message: err.message });
      }
      return handleError(res, err);
    }
  });

  app.post("/api/attendance-mobile/submissions/:id/reject", requirePermission("attendance_mobile:reject"), async (req: Request, res: Response) => {
    try {
      const { notes, reviewedBy: bodyReviewedBy } = req.body ?? {};
      let reviewedBy = bodyReviewedBy ?? (req as any).userId;
      if (!reviewedBy) {
        const adminUser = await storage.getUserByUsername("admin");
        reviewedBy = adminUser?.id ?? null;
      }
      if (!reviewedBy) return res.status(400).json({ message: tr(req, "common.reviewerRequired") });
      await rejectSubmission(req.params.id, reviewedBy, notes);
      await logAudit(req, { action: "reject_attendance_submission", entityType: "attendance_submission", entityId: req.params.id, description: `Rejected attendance submission${notes ? `: ${notes}` : ""}` });
      const updated = await storage.getAttendanceSubmission(req.params.id);
      return res.json(updated);
    } catch (err) {
      if (err instanceof Error && (err.message.includes("not found") || err.message.includes("Not found"))) {
        return res.status(404).json({ message: err.message });
      }
      if (err instanceof Error && (err.message.includes("not flagged") || err.message.includes("Only flagged"))) {
        return res.status(409).json({ message: err.message });
      }
      return handleError(res, err);
    }
  });

  // ─── Photo Change Request Endpoints ────────────────────────────────────────
  app.get("/api/photo-change-requests", requireAuth, async (req: Request, res: Response) => {
    try {
      const candidateId = req.query.candidateId as string | undefined;
      const status = req.query.status as string | undefined;

      // Authorization: admin with photo_requests:read OR candidate scoped to own id.
      const isAdmin = req.authIsSuperAdmin || req.authPermissions?.has("photo_requests:read");
      if (!isAdmin) {
        const myCand = await storage.getCandidateByUserId(req.authUserId!);
        if (!myCand) return res.status(403).json({ message: tr(req, "common.accessDenied") });
        if (!candidateId) {
          return res.status(400).json({ message: tr(req, "common.candidateIdRequired") });
        }
        if (candidateId !== myCand.id) {
          return res.status(403).json({ message: tr(req, "common.accessDenied") });
        }
      }

      const requests = await storage.getPhotoChangeRequests({ candidateId, status });
      return res.json(requests);
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/photo-change-requests/:id/approve", requirePermission("photo_requests:approve"), async (req: Request, res: Response) => {
    try {
      const { notes, reviewedBy: bodyReviewedBy } = req.body ?? {};
      let reviewedBy = bodyReviewedBy ?? (req as any).userId;
      if (!reviewedBy) {
        const adminUser = await storage.getUserByUsername("admin");
        reviewedBy = adminUser?.id ?? null;
      }
      if (!reviewedBy) return res.status(400).json({ message: tr(req, "common.reviewerRequired") });

      const changeReq = await storage.getPhotoChangeRequest(req.params.id);
      if (!changeReq) return res.status(404).json({ message: tr(req, "photoChange.notFound") });
      if (changeReq.status !== "pending") return res.status(409).json({ message: tr(req, "common.alreadyReviewed") });

      await storage.updateCandidate(changeReq.candidateId, { photoUrl: changeReq.newPhotoUrl, hasPhoto: true });

      const updated = await storage.updatePhotoChangeRequest(req.params.id, {
        status: "approved",
        reviewedBy,
        reviewedAt: new Date(),
        reviewNotes: notes ?? null,
      });

      await db.update(inboxItems)
        .set({ status: "resolved", resolvedBy: reviewedBy, resolvedAt: new Date(), resolutionNotes: notes ?? "Approved" })
        .where(and(eq(inboxItems.entityType, "photo_change_request"), eq(inboxItems.entityId, req.params.id), eq(inboxItems.status, "pending")));

      const olderPending = await db.select({ id: photoChangeRequests.id })
        .from(photoChangeRequests)
        .where(and(
          eq(photoChangeRequests.candidateId, changeReq.candidateId),
          eq(photoChangeRequests.status, "pending"),
          sql`${photoChangeRequests.id} != ${req.params.id}`,
        ));
      for (const old of olderPending) {
        await storage.updatePhotoChangeRequest(old.id, {
          status: "rejected",
          reviewedBy,
          reviewedAt: new Date(),
          reviewNotes: "Auto-resolved: a newer photo change was approved",
        });
        await db.update(inboxItems)
          .set({ status: "resolved", resolvedBy: reviewedBy, resolvedAt: new Date(), resolutionNotes: "Auto-resolved: a newer photo change was approved" })
          .where(and(eq(inboxItems.entityType, "photo_change_request"), eq(inboxItems.entityId, old.id), eq(inboxItems.status, "pending")));
      }

      await logAudit(req, { action: "approve_photo_change", entityType: "photo_change_request", entityId: req.params.id, description: `Approved photo change for candidate ${changeReq.candidateId}` });
      return res.json(updated);
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/photo-change-requests/:id/reject", requirePermission("photo_requests:reject"), async (req: Request, res: Response) => {
    try {
      const { notes, reviewedBy: bodyReviewedBy } = req.body ?? {};
      let reviewedBy = bodyReviewedBy ?? (req as any).userId;
      if (!reviewedBy) {
        const adminUser = await storage.getUserByUsername("admin");
        reviewedBy = adminUser?.id ?? null;
      }
      if (!reviewedBy) return res.status(400).json({ message: tr(req, "common.reviewerRequired") });

      const changeReq = await storage.getPhotoChangeRequest(req.params.id);
      if (!changeReq) return res.status(404).json({ message: tr(req, "photoChange.notFound") });
      if (changeReq.status !== "pending") return res.status(409).json({ message: tr(req, "common.alreadyReviewed") });

      const updated = await storage.updatePhotoChangeRequest(req.params.id, {
        status: "rejected",
        reviewedBy,
        reviewedAt: new Date(),
        reviewNotes: notes ?? null,
      });

      await db.update(inboxItems)
        .set({ status: "dismissed", resolvedBy: reviewedBy, resolvedAt: new Date(), resolutionNotes: notes ?? "Rejected" })
        .where(and(eq(inboxItems.entityType, "photo_change_request"), eq(inboxItems.entityId, req.params.id), eq(inboxItems.status, "pending")));

      await logAudit(req, { action: "reject_photo_change", entityType: "photo_change_request", entityId: req.params.id, description: `Rejected photo change for candidate ${changeReq.candidateId}` });
      return res.json(updated);
    } catch (err) { return handleError(res, err); }
  });

  // ─── Admin direct photo replace (Task #187) ──────────────────────────────
  // Back-office admins can replace a candidate / employee photo without
  // routing through the candidate-portal pending-review queue. The flow
  // still runs the *same* AWS Rekognition pipeline used by the portal
  // (`validateFaceQuality` + the rotation-rescue ladder + the
  // fail-open / fail-closed telemetry from `decideRekognitionFallback
  // Action`) so an admin uploading a non-face photo gets refused with
  // the same bilingual error envelope. On success we write the new
  // URL straight to `candidate.photoUrl`, supersede any pending
  // `photoChangeRequest` rows for the same candidate, and stamp a
  // closed `approved` row + an audit-log entry so the change is still
  // visible in the photo-change history view.
  app.post(
    "/api/admin/candidates/:id/photo",
    requirePermission("workforce:update"),
    upload.single("file"),
    async (req: Request, res: Response) => {
      const candidateId = req.params.id;
      let uploadedFileUrl: string | null = null;
      let candidateUpdateCommitted = false;
      let prePatchPhotoUrl: string | null = null;
      let prePatchHasPhoto: boolean = false;
      try {
        if (!req.file) return res.status(400).json({ message: tr(req, "file.noUpload") });
        const allowedPhotoMimes = ["image/jpeg", "image/jpg", "image/png"];
        if (!allowedPhotoMimes.includes(req.file.mimetype.toLowerCase())) {
          return res.status(400).json({ message: tr(req, "file.photoFormat") });
        }
        const candidate = await storage.getCandidate(candidateId);
        if (!candidate) return res.status(404).json({ message: tr(req, "candidate.notFound") });

        // ACL intent: **public-read** (Task #202 audit row 5 in KNOWN_ISSUES.md).
        // Upload first so Rekognition can fetch the bytes from S3 (matches
        // the portal flow in createUploadDocumentsHandler).
        // Task #202 — `isPublic: true` is REQUIRED here, not optional. The
        // resulting URL is written to `candidates.photo_url` and is then
        // rendered directly via plain `<img src={photoUrl}>` across the
        // admin panel (talent, workforce, dashboard, org-chart,
        // job-posting-detail, schedules) and the candidate portal, and is
        // also embedded in printed ID cards. Without public-read the DO
        // Spaces bucket defaults to "private" and every browser load 403s
        // — same regression class as Task #198 / Task #200 / ISSUE-008.
        // Mirrors `server/lib/photo-upload-handler.ts` for `docType === "photo"`.
        const fileUrl = await uploadFile(
          req.file.path,
          req.file.filename,
          getMimeType(req.file.filename),
          { isPublic: true },
        );
        uploadedFileUrl = fileUrl;

        const qualityResult = await validateFaceQuality(fileUrl);
        const hasPreviouslyValidatedPhoto = !!(candidate.hasPhoto && candidate.photoUrl);
        const fallbackDecision = decideRekognitionFallbackAction({
          qualityCheckSkipped: !!qualityResult.qualityCheckSkipped,
          hasPreviouslyValidatedPhoto,
        });
        if (fallbackDecision.kind === "block") {
          recordRekognitionFallback(fallbackDecision.telemetry, candidateId);
          try { await deleteFile(fileUrl); } catch {}
          uploadedFileUrl = null;
          return res.status(503).json({
            message: tr(req, "photo.verifyUnavailable"),
            qualityResult: {
              passed: false,
              checks: [{
                code: "service_unavailable",
                name: "Face verification service",
                passed: false,
                tipReason: "service_unavailable",
                tip: "The verification service is currently unreachable. Your photo cannot be processed until the service is available.",
              }],
              qualityCheckSkipped: true,
            },
          });
        }
        if (fallbackDecision.kind === "allow") {
          recordRekognitionFallback(fallbackDecision.telemetry, candidateId);
          (qualityResult as any).serviceUnavailableNotice = tr(req, "photo.verifySkipped");
        }

        if (!qualityResult.passed && !qualityResult.qualityCheckSkipped) {
          try { await deleteFile(fileUrl); } catch {}
          uploadedFileUrl = null;
          const { rotatedBuffer: _rb, ...qualityResultForClient } = qualityResult;
          return res.status(422).json({
            message: tr(req, "photo.qualityFailed"),
            qualityResult: qualityResultForClient,
          });
        }

        // Run the same rotation rescue helper the portal uses so a
        // sideways portrait shot gets re-uploaded upright.
        const rotationOutcome = await persistRotationRescue(
          qualityResult,
          fileUrl,
          candidateId,
          {
            overwriteFile,
            log: (msg: string) => console.log(msg),
            warn: (msg: string, err: unknown) => console.warn(msg, err),
            recordOutcome: recordRotationRescueOutcome,
          },
        );
        const rotationApplied = rotationOutcome.rotationApplied;

        // Resolve the reviewer id the same way the /approve route does
        // — prefer the auth-user, fall back to the seeded `admin` user
        // so the closed audit row always has a non-null reviewer.
        let reviewerId: string | null = req.authUserId ?? null;
        if (!reviewerId) {
          const adminUser = await storage.getUserByUsername("admin");
          reviewerId = adminUser?.id ?? null;
        }

        const previousPhotoUrl = candidate.photoUrl;
        prePatchPhotoUrl = candidate.photoUrl ?? null;
        prePatchHasPhoto = !!candidate.hasPhoto;

        // Supersede any *pending* photo-change-requests for this
        // candidate so the inbox doesn't keep stale review tasks
        // pointing at an old URL the admin has already overridden.
        const olderPending = await db.select({ id: photoChangeRequests.id })
          .from(photoChangeRequests)
          .where(and(
            eq(photoChangeRequests.candidateId, candidateId),
            eq(photoChangeRequests.status, "pending"),
          ));
        for (const old of olderPending) {
          await storage.updatePhotoChangeRequest(old.id, {
            status: "rejected",
            ...(reviewerId ? { reviewedBy: reviewerId } : {}),
            reviewedAt: new Date(),
            reviewNotes: "Superseded by admin direct photo replacement",
          });
          await db.update(inboxItems)
            .set({
              status: "resolved",
              resolvedBy: reviewerId,
              resolvedAt: new Date(),
              resolutionNotes: "Superseded by admin direct photo replacement",
            })
            .where(and(
              eq(inboxItems.entityType, "photo_change_request"),
              eq(inboxItems.entityId, old.id),
              eq(inboxItems.status, "pending"),
            ));
        }

        // Write the new photo straight to the candidate.
        const updatedCandidate = await storage.updateCandidate(candidateId, {
          photoUrl: fileUrl,
          hasPhoto: true,
        });
        candidateUpdateCommitted = true;

        // Audit-history continuity — even though the admin skipped the
        // queue, we still log a `photoChangeRequest` row in `approved`
        // state so the photo-history view shows a complete picture.
        const approvedRequest = await storage.createPhotoChangeRequest({
          candidateId,
          newPhotoUrl: fileUrl,
          previousPhotoUrl,
          status: "approved",
          reviewedBy: reviewerId,
          reviewedAt: new Date(),
          reviewNotes: "Admin direct replacement (Rekognition-validated)",
        } as any);

        // Resolve employee number for the audit log when this candidate
        // is currently an active employee — helps cross-reference the
        // change in the workforce timeline.
        const activeEmployee = await storage.getWorkforceByCandidateId(candidateId);
        const empNum = activeEmployee?.employeeNumber ?? null;
        const subjectName = candidate.fullNameEn ?? null;

        await logAudit(req, {
          action: "candidate.photo_replaced_by_admin",
          entityType: "candidate",
          entityId: candidateId,
          employeeNumber: empNum ?? undefined,
          subjectName: subjectName ?? undefined,
          description: `Admin replaced photo for ${subjectName ?? candidateId}${empNum ? ` (${empNum})` : ""}`,
          metadata: {
            previousPhotoUrl,
            newPhotoUrl: fileUrl,
            rotationApplied: rotationApplied ?? null,
            rekognition: {
              passed: qualityResult.passed,
              skipped: !!qualityResult.qualityCheckSkipped,
              fallback: fallbackDecision.kind,
            },
            photoChangeRequestId: approvedRequest.id,
          },
        });

        const { rotatedBuffer: _rb, ...qualityResultForClient } = qualityResult;
        return res.json({
          url: fileUrl,
          candidate: updatedCandidate,
          qualityResult: qualityResultForClient,
          rotationApplied,
          photoChangeRequestId: approvedRequest.id,
        });
      } catch (err) {
        // Compensating cleanup: if the candidate row was already updated
        // to point at the new file, revert it back to the previous photo
        // first so the avatar isn't left dangling at a soon-to-be-deleted URL.
        if (candidateUpdateCommitted) {
          try {
            await storage.updateCandidate(candidateId, {
              photoUrl: prePatchPhotoUrl,
              hasPhoto: prePatchHasPhoto,
            } as any);
          } catch (revertErr) {
            console.error("[admin-photo-replace] failed to revert candidate photo on rollback", revertErr);
          }
        }
        // Best-effort cleanup of the uploaded blob if anything after the
        // upload threw — otherwise we'd leave an orphan in S3.
        if (uploadedFileUrl) {
          try { await deleteFile(uploadedFileUrl); } catch {}
        }
        return handleError(res, err);
      }
    },
  );

  // ─── SMS Broadcasts ──────────────────────────────────────────────────────────

  app.get("/api/broadcasts", requirePermission("broadcasts:read"), async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const result = await storage.getSmsBroadcasts({ page, limit });
      return res.json(result);
    } catch (err) { return handleError(res, err); }
  });

  app.get("/api/broadcasts/:id", requirePermission("broadcasts:read"), async (req: Request, res: Response) => {
    try {
      const broadcast = await storage.getSmsBroadcast(req.params.id);
      if (!broadcast) return res.status(404).json({ message: tr(req, "broadcast.notFound") });
      const recipients = await storage.getSmsBroadcastRecipients(req.params.id);
      return res.json({ ...broadcast, recipients });
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/broadcasts", requirePermission("broadcasts:write"), async (req: Request, res: Response) => {
    try {
      const { messageTemplate, workforceIds } = req.body;
      if (!messageTemplate || typeof messageTemplate !== "string" || !messageTemplate.trim()) {
        return res.status(400).json({ message: tr(req, "broadcast.templateRequired") });
      }
      if (!Array.isArray(workforceIds) || workforceIds.length === 0) {
        return res.status(400).json({ message: tr(req, "broadcast.recipientRequired") });
      }

      const smsPlugin = await storage.getActiveSmsPlugin();
      if (!smsPlugin) {
        return res.status(400).json({ message: tr(req, "sms.notConfigured") });
      }

      interface WorkforceRow {
        id: string;
        employeeNumber: string;
        phone: string | null;
        fullNameEn: string | null;
        positionTitle: string | null;
        jobTitle: string | null;
        departmentName: string | null;
        eventName: string | null;
      }
      const employees: WorkforceRow[] = await storage.getWorkforce({ isActive: true });
      const employeeMap = new Map(employees.map(e => [e.id, e]));
      const validRecipients: Array<{ workforceId: string; phone: string; name: string; resolvedMessage: string }> = [];

      for (const wid of workforceIds) {
        const emp = employeeMap.get(wid);
        if (!emp || !emp.phone) continue;
        const name = emp.fullNameEn || "Employee";
        const resolved = messageTemplate
          .replace(/\{name\}/g, name)
          .replace(/\{employee_number\}/g, emp.employeeNumber || "")
          .replace(/\{position\}/g, emp.positionTitle || emp.jobTitle || "")
          .replace(/\{department\}/g, emp.departmentName || "")
          .replace(/\{event\}/g, emp.eventName || "");
        validRecipients.push({ workforceId: wid, phone: emp.phone, name, resolvedMessage: resolved });
      }

      if (validRecipients.length === 0) {
        return res.status(400).json({ message: tr(req, "broadcast.noValidPhones") });
      }

      const userId: string | null = (req as Request & { userId?: string }).userId ?? null;

      const broadcast = await storage.createSmsBroadcast({
        messageTemplate,
        totalRecipients: validRecipients.length,
        status: "sending",
        createdBy: userId,
      });

      const recipientRecords = [];
      for (const r of validRecipients) {
        const rec = await storage.createSmsBroadcastRecipient({
          broadcastId: broadcast.id,
          workforceId: r.workforceId,
          phone: r.phone,
          resolvedMessage: r.resolvedMessage,
          recipientName: r.name,
          status: "pending",
        });
        recipientRecords.push(rec);
      }

      (async () => {
        let sentCount = 0;
        let failedCount = 0;
        const BATCH_SIZE = 10;
        for (let i = 0; i < recipientRecords.length; i += BATCH_SIZE) {
          const batch = recipientRecords.slice(i, i + BATCH_SIZE);
          const results = await Promise.allSettled(
            batch.map(async (rec) => {
              const result = await sendSmsViaPlugin(smsPlugin, rec.phone, rec.resolvedMessage);
              if (result.success) {
                await storage.updateSmsBroadcastRecipient(rec.id, { status: "sent", sentAt: new Date() });
                return true;
              } else {
                await storage.updateSmsBroadcastRecipient(rec.id, { status: "failed", error: result.error ?? "Unknown error" });
                return false;
              }
            })
          );
          for (const r of results) {
            if (r.status === "fulfilled" && r.value) sentCount++;
            else failedCount++;
          }
        }
        await storage.updateSmsBroadcast(broadcast.id, {
          sentCount,
          failedCount,
          status: failedCount === validRecipients.length ? "failed" : "completed",
        });
        console.log(`[Broadcast ${broadcast.id}] Complete: ${sentCount} sent, ${failedCount} failed out of ${validRecipients.length}`);
      })();

      await logAudit(req, {
        action: "create_broadcast",
        entityType: "sms_broadcast",
        entityId: broadcast.id,
        description: `SMS broadcast to ${validRecipients.length} recipients`,
      });

      return res.status(201).json({ ...broadcast, recipientCount: validRecipients.length });
    } catch (err) { return handleError(res, err); }
  });

  // ─── Pay Runs ────────────────────────────────────────────────────────────────
  app.get("/api/pay-runs", requirePermission("payroll:pay_runs_read"), async (req: Request, res: Response) => {
    try {
      const runs = await storage.getPayRuns();
      const enriched = await Promise.all(runs.map(async (run) => {
        const lines = await storage.getPayRunLines(run.id);
        const totalAmount = lines.reduce((s, l) => s + parseFloat(l.netPayable ?? "0"), 0);
        const bankCount = lines.filter(l => l.paymentMethod === "bank_transfer").length;
        const cashCount = lines.filter(l => l.paymentMethod === "cash").length;
        let eventName: string | null = null;
        if (run.eventId) {
          const ev = await storage.getEvent(run.eventId);
          eventName = ev?.name ?? null;
        }
        return { ...run, totalAmount: Math.round(totalAmount * 100) / 100, employeeCount: lines.length, bankCount, cashCount, eventName };
      }));
      return res.json(enriched);
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/pay-runs", requirePermission("payroll:pay_runs_create"), async (req: Request, res: Response) => {
    try {
      const userId = getAuthUserId(req);
      const { name, eventId, dateFrom, dateTo, mode, splitPercentage, tranche1DepositDate, tranche2DepositDate } = req.body;
      if (!name || !dateFrom || !dateTo) return res.status(400).json({ error: tr(req, "error.payRunFieldsRequired") });
      if (mode === "split" && (!splitPercentage || splitPercentage < 1 || splitPercentage > 99)) {
        return res.status(400).json({ error: tr(req, "error.splitPercent") });
      }
      const run = await storage.createPayRun({
        name, eventId: eventId || null, dateFrom, dateTo,
        mode: mode || "full",
        splitPercentage: mode === "split" ? splitPercentage : null,
        tranche1DepositDate: tranche1DepositDate || null,
        tranche2DepositDate: mode === "split" ? (tranche2DepositDate || null) : null,
        status: "draft",
        createdBy: userId,
      });
      await logAudit(req, { action: "create_pay_run", entityType: "pay_run", entityId: run.id, description: `Created pay run "${name}" (${mode}) for ${dateFrom} to ${dateTo}` });
      return res.status(201).json(run);
    } catch (err) { return handleError(res, err); }
  });

  app.get("/api/pay-runs/:id", requirePermission("payroll:pay_runs_read"), async (req: Request, res: Response) => {
    try {
      const run = await storage.getPayRun(req.params.id);
      if (!run) return res.status(404).json({ error: tr(req, "error.payRunNotFound") });
      const lines = await storage.getPayRunLines(run.id);
      let eventName: string | null = null;
      if (run.eventId) {
        const ev = await storage.getEvent(run.eventId);
        eventName = ev?.name ?? null;
      }
      const enrichedLines = await Promise.all(lines.map(async (line) => {
        const [cand] = await db.select({ fullNameEn: candidates.fullNameEn, phone: candidates.phone, ibanNumber: candidates.ibanNumber, ibanBankCode: candidates.ibanBankCode, ibanBankName: candidates.ibanBankName, ibanAccountFirstName: candidates.ibanAccountFirstName, ibanAccountLastName: candidates.ibanAccountLastName }).from(candidates).where(eq(candidates.id, line.candidateId));
        const txns = await storage.getPayrollTransactions({ payRunLineId: line.id });
        return { ...line, candidate: cand ?? null, transactions: txns };
      }));
      const totalAmount = lines.reduce((s, l) => s + parseFloat(l.netPayable ?? "0"), 0);
      return res.json({ ...run, eventName, lines: enrichedLines, totalAmount: Math.round(totalAmount * 100) / 100 });
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/pay-runs/:id/process", requirePermission("payroll:pay_runs_process"), async (req: Request, res: Response) => {
    try {
      const result = await storage.processPayRun(req.params.id);
      await logAudit(req, { action: "process_pay_run", entityType: "pay_run", entityId: req.params.id, description: `Processed pay run: ${result.linesCreated} lines created` });
      return res.json(result);
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/pay-runs/:id/mark-t1-paid", requirePermission("payroll:pay_runs_approve"), async (req: Request, res: Response) => {
    try {
      const lines = await storage.getPayRunLines(req.params.id);
      let updated = 0;
      for (const line of lines) {
        if (line.tranche1Status === "pending") {
          await storage.updatePayRunLine(line.id, { tranche1Status: "paid" });
          updated++;
        }
      }
      const run = await storage.getPayRun(req.params.id);
      if (run?.mode === "split") {
        await storage.updatePayRun(req.params.id, { status: "t1_paid" });
      } else {
        await storage.updatePayRun(req.params.id, { status: "completed" });
      }
      await logAudit(req, { action: "mark_t1_paid", entityType: "pay_run", entityId: req.params.id, description: `Marked tranche 1 paid for ${updated} lines` });
      return res.json({ updated });
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/pay-runs/:id/lines/:lineId/manual-addition", requirePermission("payroll:pay_runs_manual_edit"), async (req: Request, res: Response) => {
    try {
      const userId = getAuthUserId(req);
      const line = await storage.getPayRunLine(req.params.lineId);
      if (!line) return res.status(404).json({ error: tr(req, "error.lineNotFound") });
      const { label, amount } = req.body;
      if (!label || !amount) return res.status(400).json({ error: tr(req, "error.labelAndAmountRequired") });
      const additions = (line.manualAdditions as any[]) || [];
      additions.push({ label, amount: parseFloat(amount), addedBy: userId, addedAt: new Date().toISOString() });
      const totalManualAdditions = additions.reduce((s: number, a: any) => s + a.amount, 0);
      await storage.updatePayRunLine(line.id, { manualAdditions: additions, totalManualAdditions: String(totalManualAdditions) });
      return res.json({ success: true });
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/pay-runs/:id/lines/:lineId/manual-deduction", requirePermission("payroll:pay_runs_manual_edit"), async (req: Request, res: Response) => {
    try {
      const userId = getAuthUserId(req);
      const line = await storage.getPayRunLine(req.params.lineId);
      if (!line) return res.status(404).json({ error: tr(req, "error.lineNotFound") });
      const { label, amount } = req.body;
      if (!label || !amount) return res.status(400).json({ error: tr(req, "error.labelAndAmountRequired") });
      const deductions = (line.manualDeductions as any[]) || [];
      deductions.push({ label, amount: parseFloat(amount), addedBy: userId, addedAt: new Date().toISOString() });
      const totalManualDeductions = deductions.reduce((s: number, a: any) => s + a.amount, 0);
      await storage.updatePayRunLine(line.id, { manualDeductions: deductions, totalManualDeductions: String(totalManualDeductions) });
      return res.json({ success: true });
    } catch (err) { return handleError(res, err); }
  });

  // ─── Payment Transaction Recording ─────────────────────────────────────────
  app.post("/api/pay-runs/:id/lines/:lineId/record-payment", requirePermission("payroll:pay_runs_record_payment"), async (req: Request, res: Response) => {
    try {
      const userId = getAuthUserId(req);
      const line = await storage.getPayRunLine(req.params.lineId);
      if (!line) return res.status(404).json({ error: tr(req, "error.lineNotFound") });

      const { bankTransactionId, trancheNumber, depositDate, notes } = req.body;
      if (!bankTransactionId || !depositDate) return res.status(400).json({ error: tr(req, "payroll.bankTxnFieldsRequired") });

      const tranche = trancheNumber ?? 1;
      if (tranche === 2 && line.tranche2Status === "blocked") {
        return res.status(400).json({ error: tr(req, "error.tranche2Blocked") });
      }

      const [cand] = await db.select().from(candidates).where(eq(candidates.id, line.candidateId));
      const amount = tranche === 1 ? (line.tranche1Amount ?? line.netPayable) : (line.tranche2Amount ?? "0");

      const txn = await storage.createPayrollTransaction({
        payRunLineId: line.id,
        workforceId: line.workforceId,
        candidateId: line.candidateId,
        trancheNumber: tranche,
        amount: amount,
        paymentMethod: "bank_transfer",
        bankTransactionId,
        ibanUsed: cand?.ibanNumber ?? null,
        bankCode: cand?.ibanBankCode ?? null,
        bankName: cand?.ibanBankName ?? null,
        beneficiaryName: cand ? `${cand.ibanAccountFirstName ?? ""} ${cand.ibanAccountLastName ?? ""}`.trim() : null,
        depositDate,
        enteredBy: userId ?? "system",
        notes: notes ?? null,
      });

      if (tranche === 1) await storage.updatePayRunLine(line.id, { tranche1Status: "paid" });
      else await storage.updatePayRunLine(line.id, { tranche2Status: "paid" });

      await logAudit(req, { action: "record_payment", entityType: "payroll_transaction", entityId: txn.id, description: `Recorded bank txn ${bankTransactionId} for employee ${line.employeeNumber} tranche ${tranche}` });
      return res.json(txn);
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/pay-runs/:id/import-bank-response", requirePermission("payroll:pay_runs_import_bank"), upload.single("file"), async (req: Request, res: Response) => {
    try {
      const userId = getAuthUserId(req);
      if (!req.file) return res.status(400).json({ error: tr(req, "error.fileRequired") });

      const { ibanColumn, txnIdColumn, depositDate } = req.body;
      if (!ibanColumn || !txnIdColumn) return res.status(400).json({ error: tr(req, "payroll.ibanMappingsRequired") });

      const fileContent = fs.readFileSync(req.file.path, "utf-8");
      const lines = fileContent.split("\n").map(l => l.trim()).filter(l => l.length > 0);
      if (lines.length < 2) return res.status(400).json({ error: tr(req, "error.fileNeedsHeader") });

      const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
      const ibanIdx = headers.indexOf(ibanColumn);
      const txnIdx = headers.indexOf(txnIdColumn);
      if (ibanIdx === -1 || txnIdx === -1) return res.status(400).json({ error: tr(req, "error.columnNamesNotFound") });

      const payRunLines_list = await storage.getPayRunLines(req.params.id);
      const candidateIds = [...new Set(payRunLines_list.map(l => l.candidateId))];
      const candidateRows = candidateIds.length > 0
        ? await db.select({ id: candidates.id, ibanNumber: candidates.ibanNumber }).from(candidates).where(inArray(candidates.id, candidateIds))
        : [];
      const ibanToLine = new Map<string, typeof payRunLines_list[0]>();
      for (const line of payRunLines_list) {
        const cand = candidateRows.find(c => c.id === line.candidateId);
        if (cand?.ibanNumber) ibanToLine.set(cand.ibanNumber.toUpperCase(), line);
      }

      let matched = 0, skipped = 0, notFound = 0;
      const errors: string[] = [];

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",").map(c => c.trim().replace(/^"|"$/g, ""));
        const iban = (cols[ibanIdx] ?? "").toUpperCase().replace(/\s/g, "");
        const txnId = cols[txnIdx] ?? "";
        if (!iban || !txnId) continue;

        const line = ibanToLine.get(iban);
        if (!line) { notFound++; errors.push(`Row ${i + 1}: IBAN ${iban} not found in this pay run`); continue; }

        const existingTxns = await storage.getPayrollTransactions({ payRunLineId: line.id });
        const pendingTranche = line.tranche1Status === "pending" ? 1 : (line.tranche2Status === "pending" ? 2 : null);

        if (!pendingTranche) { skipped++; continue; }
        if (pendingTranche === 2 && line.tranche2Status === "blocked") { errors.push(`Row ${i + 1}: Tranche 2 blocked for ${iban}`); notFound++; continue; }

        const cand = candidateRows.find(c => c.id === line.candidateId);
        const amount = pendingTranche === 1 ? (line.tranche1Amount ?? line.netPayable) : (line.tranche2Amount ?? "0");

        try {
          await storage.createPayrollTransaction({
            payRunLineId: line.id,
            workforceId: line.workforceId,
            candidateId: line.candidateId,
            trancheNumber: pendingTranche,
            amount,
            paymentMethod: "bank_transfer",
            bankTransactionId: txnId,
            ibanUsed: iban,
            bankCode: null,
            bankName: null,
            beneficiaryName: null,
            depositDate: depositDate || new Date().toISOString().slice(0, 10),
            enteredBy: userId ?? "system",
          });
          if (pendingTranche === 1) await storage.updatePayRunLine(line.id, { tranche1Status: "paid" });
          else await storage.updatePayRunLine(line.id, { tranche2Status: "paid" });
          matched++;
        } catch (e: any) {
          if (e.message?.includes("unique") || e.code === "23505") { skipped++; }
          else { notFound++; errors.push(`Row ${i + 1}: ${e.message}`); }
        }
      }

      if (req.file.path) try { fs.unlinkSync(req.file.path); } catch (_e) {}
      await logAudit(req, { action: "import_bank_response", entityType: "pay_run", entityId: req.params.id, description: `Imported bank response: ${matched} matched, ${skipped} skipped, ${notFound} not found` });
      return res.json({ matched, skipped, notFound, errors });
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/pay-runs/:id/lines/:lineId/record-cash-payment", requirePermission("payroll:pay_runs_cash_payment"), async (req: Request, res: Response) => {
    try {
      const userId = getAuthUserId(req);
      const line = await storage.getPayRunLine(req.params.lineId);
      if (!line) return res.status(404).json({ error: tr(req, "error.lineNotFound") });

      const { otp, trancheNumber, depositDate, notes } = req.body;
      const tranche = trancheNumber ?? 1;

      if (tranche === 2 && line.tranche2Status === "blocked") {
        return res.status(400).json({ error: tr(req, "error.tranche2Blocked") });
      }

      const [cand] = await db.select().from(candidates).where(eq(candidates.id, line.candidateId));
      if (!cand?.phone) return res.status(400).json({ error: tr(req, "error.cashOtpNoPhone") });

      if (!otp) {
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const amount = tranche === 1 ? (line.tranche1Amount ?? line.netPayable) : (line.tranche2Amount ?? "0");

        await db.insert(otpVerifications).values({
          phone: cand.phone,
          code,
          purpose: "cash_payment",
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        });

        logOtpForDev(cand.phone, code, "cash_payment");
        const { sendSmsViaPlugin } = await import("./sms-sender");
        const plugins = await storage.getSmsPlugins();
        const activePlugin = plugins.find((p: any) => p.isActive);
        if (activePlugin) {
          const recipientLocale = await getCandidateLocale(cand);
          await sendSmsViaPlugin(activePlugin, cand.phone, trL(recipientLocale, "sms.cashPaymentOtp", { code, amount: String(amount) }));
        }

        return res.json({ otpSent: true, phone: cand.phone.slice(0, 4) + "****" + cand.phone.slice(-2) });
      }

      const [verification] = await db.select().from(otpVerifications)
        .where(and(
          eq(otpVerifications.phone, cand.phone),
          eq(otpVerifications.purpose, "cash_payment"),
          eq(otpVerifications.code, otp),
        ))
        .orderBy(desc(otpVerifications.createdAt))
        .limit(1);

      if (!verification) return res.status(400).json({ error: tr(req, "error.invalidOtp") });
      if (verification.expiresAt && verification.expiresAt < new Date()) return res.status(400).json({ error: tr(req, "error.otpExpired") });
      if ((verification.attempts ?? 0) >= 3) return res.status(429).json({ error: tr(req, "error.tooManyOtpAttempts") });

      await db.update(otpVerifications).set({ verifiedAt: new Date() }).where(eq(otpVerifications.id, verification.id));

      const receiptSeq = await db.select({ value: count() }).from(payrollTransactions).where(eq(payrollTransactions.paymentMethod, "cash"));
      const receiptNumber = `CR-${new Date().getFullYear()}-${String((receiptSeq[0]?.value ?? 0) + 1).padStart(5, "0")}`;
      const amount = tranche === 1 ? (line.tranche1Amount ?? line.netPayable) : (line.tranche2Amount ?? "0");

      const txn = await storage.createPayrollTransaction({
        payRunLineId: line.id,
        workforceId: line.workforceId,
        candidateId: line.candidateId,
        trancheNumber: tranche,
        amount,
        paymentMethod: "cash",
        receiptNumber,
        otpVerified: true,
        otpSentTo: cand.phone,
        otpVerifiedAt: new Date(),
        disbursedBy: userId,
        depositDate: depositDate || new Date().toISOString().slice(0, 10),
        enteredBy: userId ?? "system",
        notes: notes ?? null,
      });

      if (tranche === 1) await storage.updatePayRunLine(line.id, { tranche1Status: "paid" });
      else await storage.updatePayRunLine(line.id, { tranche2Status: "paid" });

      await logAudit(req, { action: "record_cash_payment", entityType: "payroll_transaction", entityId: txn.id, description: `Cash payment ${receiptNumber} for employee ${line.employeeNumber} tranche ${tranche} (OTP verified)` });
      return res.json(txn);
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/pay-runs/:id/lines/:lineId/cash-otp-override", requirePermission("payroll:pay_runs_cash_otp_override"), async (req: Request, res: Response) => {
    try {
      const userId = getAuthUserId(req);
      if (!req.authIsSuperAdmin) return res.status(403).json({ error: tr(req, "error.superAdminOnly") });

      const line = await storage.getPayRunLine(req.params.lineId);
      if (!line) return res.status(404).json({ error: tr(req, "error.lineNotFound") });
      const { overrideReason, trancheNumber, depositDate, notes } = req.body;
      if (!overrideReason) return res.status(400).json({ error: tr(req, "error.overrideReasonRequired") });

      const tranche = trancheNumber ?? 1;
      if (tranche === 2 && line.tranche2Status === "blocked") {
        return res.status(400).json({ error: tr(req, "error.tranche2Blocked") });
      }

      const [cand] = await db.select().from(candidates).where(eq(candidates.id, line.candidateId));
      const receiptSeq = await db.select({ value: count() }).from(payrollTransactions).where(eq(payrollTransactions.paymentMethod, "cash"));
      const receiptNumber = `CR-${new Date().getFullYear()}-${String((receiptSeq[0]?.value ?? 0) + 1).padStart(5, "0")}`;
      const amount = tranche === 1 ? (line.tranche1Amount ?? line.netPayable) : (line.tranche2Amount ?? "0");

      const txn = await storage.createPayrollTransaction({
        payRunLineId: line.id,
        workforceId: line.workforceId,
        candidateId: line.candidateId,
        trancheNumber: tranche,
        amount,
        paymentMethod: "cash",
        receiptNumber,
        otpVerified: false,
        otpSentTo: cand?.phone ?? null,
        manualOverride: true,
        overrideReason,
        disbursedBy: userId,
        depositDate: depositDate || new Date().toISOString().slice(0, 10),
        enteredBy: userId ?? "system",
        notes: notes ?? null,
      });

      if (tranche === 1) await storage.updatePayRunLine(line.id, { tranche1Status: "paid" });
      else await storage.updatePayRunLine(line.id, { tranche2Status: "paid" });

      await logAudit(req, { action: "cash_otp_override", entityType: "payroll_transaction", entityId: txn.id, description: `Cash OTP override for employee ${line.employeeNumber}: ${overrideReason}` });
      return res.json(txn);
    } catch (err) { return handleError(res, err); }
  });

  // ─── Payroll Adjustments ────────────────────────────────────────────────────
  app.post("/api/payroll-adjustments", requirePermission("payroll:adjustments_write"), async (req: Request, res: Response) => {
    try {
      const userId = getAuthUserId(req);
      const { workforceId, date, originalDeductionMinutes, adjustedDeductionMinutes, reason } = req.body;
      if (!workforceId || !date || !reason) return res.status(400).json({ error: tr(req, "payroll.adjustmentFieldsRequired") });
      const adj = await storage.createPayrollAdjustment({
        workforceId, date,
        originalDeductionMinutes: originalDeductionMinutes ?? 0,
        adjustedDeductionMinutes: adjustedDeductionMinutes ?? 0,
        reason, adjustedBy: userId ?? "system",
      });
      await logAudit(req, { action: "create_payroll_adjustment", entityType: "payroll_adjustment", entityId: adj.id, description: `Override for ${workforceId} on ${date}: ${reason}` });
      return res.status(201).json(adj);
    } catch (err) { return handleError(res, err); }
  });

  app.post("/api/payroll-adjustments/bulk", requirePermission("payroll:adjustments_write"), async (req: Request, res: Response) => {
    try {
      const userId = getAuthUserId(req);
      const { date, reason, workforceIds, eventId, departmentId } = req.body;
      if (!date || !reason) return res.status(400).json({ error: tr(req, "payroll.adjustmentBulkFieldsRequired") });

      let targetIds: string[] = workforceIds ?? [];
      if (!workforceIds || workforceIds.length === 0) {
        const conditions: any[] = [eq(workforce.isActive, true)];
        if (eventId) conditions.push(eq(workforce.eventId, eventId));
        const employees = await db.select({ id: workforce.id }).from(workforce).where(and(...conditions));
        targetIds = employees.map(e => e.id);
      }

      const attendanceForDate = await db.select().from(attendanceRecords).where(and(eq(attendanceRecords.date, date), inArray(attendanceRecords.workforceId, targetIds)));

      const adjustments: InsertPayrollAdjustment[] = attendanceForDate
        .filter(a => a.status === "absent" || a.status === "late")
        .map(a => ({
          workforceId: a.workforceId,
          date,
          originalDeductionMinutes: (a.minutesScheduled ?? 0) - (a.minutesWorked ?? 0),
          adjustedDeductionMinutes: 0,
          reason,
          adjustedBy: userId ?? "system",
        }));

      const count = await storage.bulkCreatePayrollAdjustments(adjustments);
      await logAudit(req, { action: "bulk_payroll_adjustment", entityType: "payroll_adjustment", entityId: date, description: `Bulk override for ${count} employees on ${date}: ${reason}` });
      return res.json({ created: count });
    } catch (err) { return handleError(res, err); }
  });

  app.get("/api/payroll-adjustments", requirePermission("payroll:pay_runs_read"), async (req: Request, res: Response) => {
    try {
      const { workforceId, dateFrom, dateTo } = req.query as any;
      const adjustments = await storage.getPayrollAdjustments({ workforceId, dateFrom, dateTo });
      return res.json(adjustments);
    } catch (err) { return handleError(res, err); }
  });

  // ─── Payslips ───────────────────────────────────────────────────────────────
  app.get("/api/payslips/:candidateId", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = getAuthUserId(req);
      if (!userId) return res.status(401).json({ error: tr(req, "error.unauthorized") });

      // Authorization: admin with payroll:read OR candidate viewing own payslips.
      const isAdmin = req.authIsSuperAdmin || (req.authPermissions?.has("payroll:read") ?? false);
      if (!isAdmin) {
        const myCand = await storage.getCandidateByUserId(userId);
        if (!myCand || myCand.id !== req.params.candidateId) {
          return res.status(403).json({ message: tr(req, "common.accessDenied") });
        }
      }

      const txns = await storage.getPayrollTransactions({ candidateId: req.params.candidateId });
      const enriched = await Promise.all(txns.map(async (txn) => {
        const line = await storage.getPayRunLine(txn.payRunLineId);
        const run = line ? await storage.getPayRun(line.payRunId) : null;
        let eventName: string | null = null;
        if (run?.eventId) { const ev = await storage.getEvent(run.eventId); eventName = ev?.name ?? null; }

        let ibanDisplay = txn.ibanUsed;
        if (ibanDisplay && !isAdmin) {
          ibanDisplay = ibanDisplay.slice(0, 4) + " " + ibanDisplay.slice(4, 8) + " **** **** **" + ibanDisplay.slice(-2);
        }

        return {
          ...txn,
          ibanUsed: ibanDisplay,
          payRunLine: line ? {
            effectiveDateFrom: line.effectiveDateFrom,
            effectiveDateTo: line.effectiveDateTo,
            baseSalary: line.baseSalary,
            daysWorked: line.daysWorked,
            excusedDays: line.excusedDays,
            absentDays: line.absentDays,
            lateMinutes: line.lateMinutes,
            grossEarned: line.grossEarned,
            manualAdditions: line.manualAdditions,
            manualDeductions: line.manualDeductions,
            totalManualAdditions: line.totalManualAdditions,
            totalManualDeductions: line.totalManualDeductions,
            absentDeduction: line.absentDeduction,
            lateDeduction: line.lateDeduction,
            assetDeductions: line.assetDeductions,
            totalDeductions: line.totalDeductions,
            netPayable: line.netPayable,
          } : null,
          payRunName: run?.name ?? null,
          eventName,
          payPeriod: run ? { dateFrom: run.dateFrom, dateTo: run.dateTo } : null,
        };
      }));
      return res.json(enriched);
    } catch (err) { return handleError(res, err); }
  });

  // ─── Settlement Payment Tracking ────────────────────────────────────────────
  app.post("/api/workforce/:id/mark-settlement-paid", requirePermission("payroll:pay_runs_record_payment"), async (req: Request, res: Response) => {
    try {
      const userId = getAuthUserId(req);
      // Task #183 — coerce blank/whitespace-only reference to null so the
      // payroll audit and exports don't carry empty strings. The form
      // field is named `reference`; it maps to settlementReference on
      // the workforce row.
      // Task #185 — promoted from inline `["reference"]` to a named
      // constant in `./lib/normalize-blank-fields`.
      const body = normalizeBlankFields({ ...req.body }, PAYROLL_SETTLEMENT_BLANK_FIELDS) as { reference?: string | null };
      const reference = body.reference ?? null;
      const updated = await storage.updateWorkforceRecord(req.params.id, {
        settlementPaidAt: new Date() as any,
        settlementPaidBy: userId,
        settlementReference: reference,
      } as any);
      if (!updated) return res.status(404).json({ error: tr(req, "error.employeeNotFound") });
      await logAudit(req, { action: "mark_settlement_paid", entityType: "workforce", entityId: req.params.id, description: `Settlement marked as paid${reference ? ` (ref: ${reference})` : ""}` });
      return res.json(updated);
    } catch (err) { return handleError(res, err); }
  });

  // ─── Payment Method Management ──────────────────────────────────────────────
  app.patch("/api/workforce/:id/payment-method", requirePermission("workforce:payment_method"), async (req: Request, res: Response) => {
    try {
      const userId = getAuthUserId(req);
      // Task #183 — normalise blank/whitespace-only `reason` to null so a
      // form that submits "  " can't bypass the cash-reason guard or
      // persist an empty string into paymentMethodReason.
      // Task #185 — promoted from inline `["reason"]` to a named
      // constant in `./lib/normalize-blank-fields`.
      const body = normalizeBlankFields({ ...req.body }, WORKFORCE_PAYMENT_METHOD_BLANK_FIELDS) as {
        paymentMethod?: string;
        reason?: string | null;
      };
      const paymentMethod = body.paymentMethod;
      const reason = body.reason ?? null;
      if (!paymentMethod || !["bank_transfer", "cash"].includes(paymentMethod)) {
        return res.status(400).json({ error: tr(req, "workforce.paymentMethodInvalid") });
      }
      if (paymentMethod === "cash" && !reason) {
        return res.status(400).json({ error: tr(req, "error.cashReasonRequired") });
      }
      // Task #189 — capture the previous method so the audit log carries a
      // structured `from → to` payload that the inline history view can
      // render without parsing free-text descriptions.
      // Task #192 — fix runtime crash: storage exposes `getWorkforceEmployee`,
      // not `getWorkforceRecord`. The old call would throw a TypeError on
      // every payment-method change in production.
      const previous = await storage.getWorkforceEmployee(req.params.id);
      const previousMethod = previous?.paymentMethod ?? "bank_transfer";
      const updated = await storage.updateWorkforceRecord(req.params.id, {
        paymentMethod,
        paymentMethodReason: paymentMethod === "cash" ? reason : null,
        paymentMethodSetBy: userId,
        paymentMethodSetAt: new Date() as any,
      } as any);
      if (!updated) return res.status(404).json({ error: tr(req, "error.employeeNotFound") });
      await logAudit(req, {
        action: "update_payment_method",
        entityType: "workforce",
        entityId: req.params.id,
        employeeNumber: updated.employeeNumber ?? undefined,
        description: `Payment method changed from ${previousMethod} to ${paymentMethod}${reason ? `: ${reason}` : ""}`,
        metadata: { from: previousMethod, to: paymentMethod, reason: reason ?? null },
      });
      // Task #189 — return the joined Employee shape (matches the
      // `/candidate-profile` PATCH pattern) so the open profile dialog
      // can refresh in place without losing candidate fields like
      // fullNameEn/photoUrl that the raw workforce row doesn't carry.
      const refreshed = await storage.getWorkforceEmployee(req.params.id);
      return res.json(refreshed ?? updated);
    } catch (err) { return handleError(res, err); }
  });

  // Task #189 — inline payment-method history for the employee profile.
  // Returns the most-recent N audit entries with action `update_payment_method`
  // for this workforce record. Permission-gated identically to the PATCH
  // route. We expose only the fields the UI renders (no metadata leakage).
  app.get("/api/workforce/:id/payment-method-history", requirePermission("workforce:payment_method"), async (req: Request, res: Response) => {
    try {
      const limit = Math.min(parseInt(String(req.query.limit ?? "10"), 10) || 10, 50);
      const rows = await db
        .select({
          id: auditLogs.id,
          actorName: auditLogs.actorName,
          createdAt: auditLogs.createdAt,
          metadata: auditLogs.metadata,
          description: auditLogs.description,
        })
        .from(auditLogs)
        .where(and(
          eq(auditLogs.action, "update_payment_method"),
          eq(auditLogs.entityType, "workforce"),
          eq(auditLogs.entityId, req.params.id),
        ))
        .orderBy(desc(auditLogs.createdAt))
        .limit(limit);
      // Task #189 — explicit response contract. Whitelist `metadata`
      // down to {from, to, reason} so unrelated keys (added later by
      // any caller of logAudit, e.g. ip/user-agent helpers) cannot
      // leak through this read endpoint. Drop `actorId` for the same
      // reason — the UI only renders `actorName`.
      const sanitized = rows.map((r) => {
        const m = (r.metadata ?? null) as Record<string, unknown> | null;
        return {
          id: r.id,
          actorName: r.actorName,
          createdAt: r.createdAt,
          description: r.description,
          metadata: m
            ? {
                from: typeof m.from === "string" ? m.from : null,
                to: typeof m.to === "string" ? m.to : null,
                reason: typeof m.reason === "string" ? m.reason : null,
              }
            : null,
        };
      });
      return res.json(sanitized);
    } catch (err) { return handleError(res, err); }
  });

  // ─── Completed Offboarding List ─────────────────────────────────────────────
  app.get("/api/offboarding/completed", requirePermission("offboarding:read"), async (req: Request, res: Response) => {
    try {
      const rows = await db
        .select({
          id: workforce.id,
          employeeNumber: workforce.employeeNumber,
          candidateId: workforce.candidateId,
          eventId: workforce.eventId,
          salary: workforce.salary,
          startDate: workforce.startDate,
          endDate: workforce.endDate,
          offboardingCompletedAt: workforce.offboardingCompletedAt,
          finalGrossPay: workforce.finalGrossPay,
          finalDeductions: workforce.finalDeductions,
          finalNetSettlement: workforce.finalNetSettlement,
          settlementPaidAt: workforce.settlementPaidAt,
          settlementPaidBy: workforce.settlementPaidBy,
          settlementReference: workforce.settlementReference,
          paymentMethod: workforce.paymentMethod,
          employmentType: workforce.employmentType,
          fullNameEn: candidates.fullNameEn,
        })
        .from(workforce)
        .innerJoin(candidates, eq(workforce.candidateId, candidates.id))
        .where(eq(workforce.offboardingStatus, "completed"))
        .orderBy(desc(workforce.offboardingCompletedAt));

      const enriched = await Promise.all(rows.map(async (row) => {
        let eventName: string | null = null;
        if (row.eventId) { const ev = await storage.getEvent(row.eventId); eventName = ev?.name ?? null; }
        return { ...row, eventName };
      }));
      return res.json(enriched);
    } catch (err) { return handleError(res, err); }
  });

  // ─── Pay Run Export ─────────────────────────────────────────────────────────
  app.get("/api/pay-runs/:id/export", requirePermission("payroll:pay_runs_export"), async (req: Request, res: Response) => {
    try {
      const run = await storage.getPayRun(req.params.id);
      if (!run) return res.status(404).json({ error: tr(req, "error.payRunNotFound") });
      const lines = await storage.getPayRunLines(run.id);
      const { format, lineIds } = req.query as any;

      let targetLines = lines;
      if (lineIds) {
        const ids = lineIds.split(",");
        targetLines = lines.filter(l => ids.includes(l.id));
      }

      const enriched = await Promise.all(targetLines.map(async (line) => {
        const [cand] = await db.select({ fullNameEn: candidates.fullNameEn, ibanNumber: candidates.ibanNumber, ibanBankCode: candidates.ibanBankCode, ibanBankName: candidates.ibanBankName }).from(candidates).where(eq(candidates.id, line.candidateId));
        return { ...line, candidateName: cand?.fullNameEn ?? "", iban: cand?.ibanNumber ?? "", bankCode: cand?.ibanBankCode ?? "", bankName: cand?.ibanBankName ?? "" };
      }));

      if (format === "csv") {
        const headers = ["Employee Number", "Name", "Base Salary", "Days Worked", "Excused Days", "Gross Earned", "Absent Days", "Absent Deduction", "Late Minutes", "Late Deduction", "Asset Deductions", "Manual Additions", "Manual Deductions", "Total Deductions", "Net Payable", "Payment Method", "IBAN", "Bank"];
        if (run.mode === "split") headers.push("Tranche 1", "T1 Status", "Tranche 2", "T2 Status");
        const csvRows = enriched.map(l => {
          const row = [l.employeeNumber, l.candidateName, l.baseSalary, l.daysWorked, l.excusedDays, l.grossEarned, l.absentDays, l.absentDeduction, l.lateMinutes, l.lateDeduction, l.assetDeductions, l.totalManualAdditions, l.totalManualDeductions, l.totalDeductions, l.netPayable, l.paymentMethod, l.iban, l.bankName];
          if (run.mode === "split") row.push(l.tranche1Amount ?? "", l.tranche1Status ?? "", l.tranche2Amount ?? "", l.tranche2Status ?? "");
          return row.map(v => `"${v ?? ""}"`).join(",");
        });
        const csv = [headers.map(h => `"${h}"`).join(","), ...csvRows].join("\n");
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename="payrun-${run.name.replace(/\s/g, "_")}.csv"`);
        return res.send(csv);
      }

      return res.json({ payRun: run, lines: enriched });
    } catch (err) { return handleError(res, err); }
  });

  app.get("/api/pay-runs/:id/export-for-bank", requirePermission("payroll:pay_runs_export"), async (req: Request, res: Response) => {
    try {
      const run = await storage.getPayRun(req.params.id);
      if (!run) return res.status(404).json({ error: tr(req, "error.payRunNotFound") });
      const lines = await storage.getPayRunLines(run.id);
      const bankLines = lines.filter(l => l.paymentMethod === "bank_transfer");

      const rows = await Promise.all(bankLines.map(async (line) => {
        const [cand] = await db.select({ fullNameEn: candidates.fullNameEn, ibanNumber: candidates.ibanNumber, ibanBankCode: candidates.ibanBankCode, ibanAccountFirstName: candidates.ibanAccountFirstName, ibanAccountLastName: candidates.ibanAccountLastName }).from(candidates).where(eq(candidates.id, line.candidateId));
        const amount = line.tranche1Status === "pending" ? (line.tranche1Amount ?? line.netPayable) : (line.tranche2Amount ?? "0");
        return {
          employeeNumber: line.employeeNumber,
          name: cand?.fullNameEn ?? "",
          beneficiaryName: cand ? `${cand.ibanAccountFirstName ?? ""} ${cand.ibanAccountLastName ?? ""}`.trim() : "",
          iban: cand?.ibanNumber ?? "",
          bankCode: cand?.ibanBankCode ?? "",
          amount,
        };
      }));

      const headers = ["Employee Number", "Name", "Beneficiary Name", "IBAN", "Bank Code", "Amount"];
      const csv = [headers.map(h => `"${h}"`).join(","), ...rows.map(r => [r.employeeNumber, r.name, r.beneficiaryName, r.iban, r.bankCode, r.amount].map(v => `"${v}"`).join(","))].join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="bank-export-${run.name.replace(/\s/g, "_")}.csv"`);
      return res.send(csv);
    } catch (err) { return handleError(res, err); }
  });

  return httpServer;
}
