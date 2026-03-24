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
  insertWorkforceSchema,
  insertAutomationRuleSchema,
  insertNotificationSchema,
  insertUserSchema,
  insertBusinessUnitSchema,
  insertSMPContractSchema,
  candidateQuerySchema,
} from "@shared/schema";
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

  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const { fullName, phone, nationalId, password } = req.body as {
        fullName?: string;
        phone?: string;
        nationalId?: string;
        password?: string;
      };

      if (!fullName || !phone || !nationalId || !password) {
        return res.status(400).json({ message: "Full name, phone, national ID and password are required" });
      }
      if (password.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters" });
      }

      // Duplicate checks
      const existingByNationalId = await storage.getUserByNationalId(nationalId.trim());
      if (existingByNationalId) {
        return res.status(409).json({ message: "An account with this National ID already exists" });
      }
      const existingByPhone = await storage.getUserByPhone(phone.trim());
      if (existingByPhone) {
        return res.status(409).json({ message: "An account with this phone number already exists" });
      }

      const syntheticEmail = `${nationalId.trim()}@candidate.workforce.sa`;
      const hashed = await bcrypt.hash(password, 12);

      // Create user account
      const user = await storage.createUser({
        username: nationalId.trim(),
        email: syntheticEmail,
        password: hashed,
        fullName: fullName.trim(),
        phone: phone.trim(),
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
        phone: phone.trim(),
        nationalId: nationalId.trim(),
        email: syntheticEmail,
        status: "active",
        experienceYears: 0,
        country: "SA",
      });

      const { password: _, ...safeUser } = user;
      return res.status(201).json({ user: safeUser, candidate });
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
      const validated = rawCandidates.map((c: unknown, i: number) => {
        try {
          return insertCandidateSchema.parse(c);
        } catch (e) {
          throw new Error(`Row ${i + 1}: ${e instanceof z.ZodError ? e.errors[0].message : "invalid"}`);
        }
      });
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

  app.post("/api/interviews", async (req: Request, res: Response) => {
    try {
      const data = insertInterviewSchema.parse(req.body);
      const interview = await storage.createInterview(data);
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
      return res.json(interview);
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

  return httpServer;
}
