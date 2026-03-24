import { db } from "./db";
import {
  users,
  candidates,
  seasons,
  jobPostings,
  applications,
  interviews,
  workforce,
  automationRules,
  notifications,
  businessUnits,
  smpContracts,
  questionSets,
  type User,
  type InsertUser,
  type Candidate,
  type InsertCandidate,
  type Season,
  type InsertSeason,
  type JobPosting,
  type InsertJobPosting,
  type Application,
  type InsertApplication,
  type Interview,
  type InsertInterview,
  type WorkforceRecord,
  type InsertWorkforce,
  type AutomationRule,
  type InsertAutomationRule,
  type Notification,
  type InsertNotification,
  type BusinessUnit,
  type InsertBusinessUnit,
  type SMPContract,
  type InsertSMPContract,
  type QuestionSet,
  type InsertQuestionSet,
  type CandidateQuery,
} from "@shared/schema";
import { eq, and, or, ilike, desc, asc, count, sql, inArray } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByPhone(phone: string): Promise<User | undefined>;
  getUserByNationalId(nationalId: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined>;

  // Candidates (70k scale)
  getCandidates(query: CandidateQuery): Promise<{ data: Candidate[]; total: number; page: number; limit: number }>;
  getCandidate(id: string): Promise<Candidate | undefined>;
  createCandidate(candidate: InsertCandidate): Promise<Candidate>;
  updateCandidate(id: string, data: Partial<InsertCandidate>): Promise<Candidate | undefined>;
  deleteCandidate(id: string): Promise<boolean>;
  bulkInsertCandidates(candidates: InsertCandidate[]): Promise<number>;
  getCandidateStats(): Promise<{ total: number; active: number; hired: number; blocked: number; avgRating: number }>;

  // Seasons
  getSeasons(): Promise<Season[]>;
  getSeason(id: string): Promise<Season | undefined>;
  createSeason(season: InsertSeason): Promise<Season>;
  updateSeason(id: string, data: Partial<InsertSeason>): Promise<Season | undefined>;
  deleteSeason(id: string): Promise<boolean>;
  countJobPostingsBySeason(seasonId: string): Promise<number>;

  // Job Postings
  getJobPostings(params?: { status?: string; seasonId?: string }): Promise<JobPosting[]>;
  getJobPosting(id: string): Promise<JobPosting | undefined>;
  createJobPosting(job: InsertJobPosting): Promise<JobPosting>;
  updateJobPosting(id: string, data: Partial<InsertJobPosting>): Promise<JobPosting | undefined>;
  deleteJobPosting(id: string): Promise<boolean>;
  getJobStats(): Promise<{ total: number; active: number; draft: number; filled: number; totalOpenings: number }>;

  // Applications
  getApplications(params?: { jobId?: string; candidateId?: string; status?: string }): Promise<Application[]>;
  getApplication(id: string): Promise<Application | undefined>;
  createApplication(app: InsertApplication): Promise<Application>;
  updateApplication(id: string, data: Partial<InsertApplication>): Promise<Application | undefined>;
  getApplicationStats(): Promise<{ total: number; new: number; shortlisted: number; hired: number }>;

  // Interviews
  getInterviews(params?: { status?: string; candidateId?: string }): Promise<Interview[]>;
  getInterview(id: string): Promise<Interview | undefined>;
  createInterview(interview: InsertInterview): Promise<Interview>;
  updateInterview(id: string, data: Partial<InsertInterview>): Promise<Interview | undefined>;
  getInterviewStats(): Promise<{ total: number; scheduled: number; completed: number; cancelled: number }>;

  // Workforce
  getWorkforce(params?: { seasonId?: string; isActive?: boolean }): Promise<WorkforceRecord[]>;
  createWorkforceRecord(record: InsertWorkforce): Promise<WorkforceRecord>;
  updateWorkforceRecord(id: string, data: Partial<InsertWorkforce>): Promise<WorkforceRecord | undefined>;
  getWorkforceStats(): Promise<{ total: number; active: number; byDepartment: Record<string, number> }>;

  // Automation Rules
  getAutomationRules(): Promise<AutomationRule[]>;
  updateAutomationRule(id: string, data: Partial<InsertAutomationRule>): Promise<AutomationRule | undefined>;
  createAutomationRule(rule: InsertAutomationRule): Promise<AutomationRule>;

  // Notifications
  getNotifications(params?: { recipientId?: string; status?: string; limit?: number }): Promise<Notification[]>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationRead(id: string): Promise<boolean>;
  getUnreadCount(recipientId: string): Promise<number>;

  // Business Units
  getBusinessUnits(): Promise<BusinessUnit[]>;
  getBusinessUnit(id: string): Promise<BusinessUnit | undefined>;
  createBusinessUnit(data: InsertBusinessUnit): Promise<BusinessUnit>;
  updateBusinessUnit(id: string, data: Partial<InsertBusinessUnit>): Promise<BusinessUnit | undefined>;

  // Users (admin management)
  listUsers(): Promise<User[]>;

  // SMP Contracts
  getSMPContracts(): Promise<SMPContract[]>;
  getSMPContract(id: string): Promise<SMPContract | undefined>;
  createSMPContract(data: InsertSMPContract): Promise<SMPContract>;
  updateSMPContract(id: string, data: Partial<InsertSMPContract>): Promise<SMPContract | undefined>;
  deleteSMPContract(id: string): Promise<boolean>;

  // Question Sets
  getQuestionSets(): Promise<QuestionSet[]>;
  getQuestionSet(id: string): Promise<QuestionSet | undefined>;
  createQuestionSet(data: InsertQuestionSet): Promise<QuestionSet>;
  updateQuestionSet(id: string, data: Partial<InsertQuestionSet>): Promise<QuestionSet | undefined>;
  deleteQuestionSet(id: string): Promise<boolean>;

  // Dashboard
  getDashboardStats(): Promise<{
    totalCandidates: number;
    openPositions: number;
    activeSeasons: number;
    scheduledInterviews: number;
    recentApplications: Array<{ candidateName: string; role: string; status: string; appliedAt: Date }>;
  }>;
}

export class DatabaseStorage implements IStorage {
  // ─── Users ─────────────────────────────────────────────────────────────────
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUserByPhone(phone: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.phone, phone));
    return user;
  }

  async getUserByNationalId(nationalId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.nationalId, nationalId));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  // ─── Candidates (MAANG-scale: cursor-based pagination + full-text) ─────────
  async getCandidates(query: CandidateQuery): Promise<{
    data: Candidate[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { page, limit, search, status, city, nationality, gender, sortBy, sortOrder } = query;
    const offset = (page - 1) * limit;

    const conditions = [];

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      conditions.push(
        or(
          ilike(candidates.fullNameEn, term),
          ilike(candidates.email, term),
          ilike(candidates.phone, term),
          ilike(candidates.currentRole, term),
          ilike(candidates.candidateCode, term),
          ilike(candidates.city, term),
        )
      );
    }

    if (status) conditions.push(eq(candidates.status, status as any));
    if (city) conditions.push(ilike(candidates.city, `%${city}%`));
    if (nationality) conditions.push(eq(candidates.nationality, nationality as any));
    if (gender) conditions.push(eq(candidates.gender, gender as any));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const orderFn = sortOrder === "asc" ? asc : desc;
    const orderCol =
      sortBy === "fullNameEn" ? candidates.fullNameEn
      : sortBy === "rating" ? candidates.rating
      : sortBy === "experienceYears" ? candidates.experienceYears
      : candidates.createdAt;

    const [data, [{ value: total }]] = await Promise.all([
      db
        .select()
        .from(candidates)
        .where(where)
        .orderBy(orderFn(orderCol))
        .limit(limit)
        .offset(offset),
      db
        .select({ value: count() })
        .from(candidates)
        .where(where),
    ]);

    return { data, total: Number(total), page, limit };
  }

  async getCandidate(id: string): Promise<Candidate | undefined> {
    const [candidate] = await db.select().from(candidates).where(eq(candidates.id, id));
    return candidate;
  }

  async createCandidate(candidate: InsertCandidate): Promise<Candidate> {
    const [created] = await db.insert(candidates).values(candidate).returning();
    return created;
  }

  async updateCandidate(id: string, data: Partial<InsertCandidate>): Promise<Candidate | undefined> {
    const [updated] = await db
      .update(candidates)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(candidates.id, id))
      .returning();
    return updated;
  }

  async deleteCandidate(id: string): Promise<boolean> {
    const result = await db.delete(candidates).where(eq(candidates.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async bulkInsertCandidates(data: InsertCandidate[]): Promise<number> {
    if (data.length === 0) return 0;
    // Insert in batches of 1000 for safety
    const batchSize = 1000;
    let inserted = 0;
    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);
      const result = await db.insert(candidates).values(batch).onConflictDoNothing().returning({ id: candidates.id });
      inserted += result.length;
    }
    return inserted;
  }

  async getCandidateStats(): Promise<{ total: number; active: number; hired: number; blocked: number; avgRating: number }> {
    const [stats] = await db
      .select({
        total: count(),
        avgRating: sql<number>`coalesce(avg(${candidates.rating}::numeric), 0)`,
      })
      .from(candidates);

    const [activeRow] = await db.select({ value: count() }).from(candidates).where(eq(candidates.status, "active"));
    const [hiredRow] = await db.select({ value: count() }).from(candidates).where(eq(candidates.status, "hired"));
    const [blockedRow] = await db.select({ value: count() }).from(candidates).where(eq(candidates.status, "blocked"));

    return {
      total: Number(stats.total),
      active: Number(activeRow.value),
      hired: Number(hiredRow.value),
      blocked: Number(blockedRow.value),
      avgRating: Number(Number(stats.avgRating).toFixed(2)),
    };
  }

  // ─── Seasons ────────────────────────────────────────────────────────────────
  async getSeasons(): Promise<Season[]> {
    return db.select().from(seasons).orderBy(desc(seasons.createdAt));
  }

  async getSeason(id: string): Promise<Season | undefined> {
    const [season] = await db.select().from(seasons).where(eq(seasons.id, id));
    return season;
  }

  async createSeason(season: InsertSeason): Promise<Season> {
    const [created] = await db.insert(seasons).values(season).returning();
    return created;
  }

  async updateSeason(id: string, data: Partial<InsertSeason>): Promise<Season | undefined> {
    const [updated] = await db.update(seasons).set({ ...data, updatedAt: new Date() }).where(eq(seasons.id, id)).returning();
    return updated;
  }

  async deleteSeason(id: string): Promise<boolean> {
    const result = await db.delete(seasons).where(eq(seasons.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async countJobPostingsBySeason(seasonId: string): Promise<number> {
    const [row] = await db
      .select({ value: count() })
      .from(jobPostings)
      .where(eq(jobPostings.seasonId, seasonId));
    return Number(row?.value ?? 0);
  }

  // ─── Job Postings ───────────────────────────────────────────────────────────
  async getJobPostings(params?: { status?: string; seasonId?: string }): Promise<JobPosting[]> {
    const conditions = [];
    if (params?.status) conditions.push(eq(jobPostings.status, params.status as any));
    if (params?.seasonId) conditions.push(eq(jobPostings.seasonId, params.seasonId));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    return db.select().from(jobPostings).where(where).orderBy(desc(jobPostings.createdAt));
  }

  async getJobPosting(id: string): Promise<JobPosting | undefined> {
    const [job] = await db.select().from(jobPostings).where(eq(jobPostings.id, id));
    return job;
  }

  async createJobPosting(job: InsertJobPosting): Promise<JobPosting> {
    const [created] = await db.insert(jobPostings).values(job).returning();
    return created;
  }

  async updateJobPosting(id: string, data: Partial<InsertJobPosting>): Promise<JobPosting | undefined> {
    const [updated] = await db.update(jobPostings).set({ ...data, updatedAt: new Date() }).where(eq(jobPostings.id, id)).returning();
    return updated;
  }

  async deleteJobPosting(id: string): Promise<boolean> {
    const result = await db.delete(jobPostings).where(eq(jobPostings.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getJobStats(): Promise<{ total: number; active: number; draft: number; filled: number; totalOpenings: number }> {
    const [stats] = await db.select({
      total: count(),
      totalOpenings: sql<number>`coalesce(sum(${jobPostings.openings}), 0)`,
    }).from(jobPostings);

    const [activeRow] = await db.select({ value: count() }).from(jobPostings).where(eq(jobPostings.status, "active"));
    const [draftRow] = await db.select({ value: count() }).from(jobPostings).where(eq(jobPostings.status, "draft"));
    const [filledRow] = await db.select({ value: count() }).from(jobPostings).where(eq(jobPostings.status, "filled"));

    return {
      total: Number(stats.total),
      active: Number(activeRow.value),
      draft: Number(draftRow.value),
      filled: Number(filledRow.value),
      totalOpenings: Number(stats.totalOpenings),
    };
  }

  // ─── Applications ───────────────────────────────────────────────────────────
  async getApplications(params?: { jobId?: string; candidateId?: string; status?: string }): Promise<Application[]> {
    const conditions = [];
    if (params?.jobId) conditions.push(eq(applications.jobId, params.jobId));
    if (params?.candidateId) conditions.push(eq(applications.candidateId, params.candidateId));
    if (params?.status) conditions.push(eq(applications.status, params.status as any));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    return db.select().from(applications).where(where).orderBy(desc(applications.appliedAt));
  }

  async getApplication(id: string): Promise<Application | undefined> {
    const [app] = await db.select().from(applications).where(eq(applications.id, id));
    return app;
  }

  async createApplication(app: InsertApplication): Promise<Application> {
    const [created] = await db.insert(applications).values(app).returning();
    return created;
  }

  async updateApplication(id: string, data: Partial<InsertApplication>): Promise<Application | undefined> {
    const [updated] = await db.update(applications).set({ ...data, updatedAt: new Date() }).where(eq(applications.id, id)).returning();
    return updated;
  }

  async getApplicationStats(): Promise<{ total: number; new: number; shortlisted: number; hired: number }> {
    const [total] = await db.select({ value: count() }).from(applications);
    const [newRow] = await db.select({ value: count() }).from(applications).where(eq(applications.status, "new"));
    const [shortlistedRow] = await db.select({ value: count() }).from(applications).where(eq(applications.status, "shortlisted"));
    const [hiredRow] = await db.select({ value: count() }).from(applications).where(eq(applications.status, "hired"));

    return {
      total: Number(total.value),
      new: Number(newRow.value),
      shortlisted: Number(shortlistedRow.value),
      hired: Number(hiredRow.value),
    };
  }

  // ─── Interviews ─────────────────────────────────────────────────────────────
  async getInterviews(params?: { status?: string; candidateId?: string }): Promise<Interview[]> {
    const conditions = [];
    if (params?.status) conditions.push(eq(interviews.status, params.status as any));
    if (params?.candidateId) conditions.push(eq(interviews.candidateId, params.candidateId));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    return db.select().from(interviews).where(where).orderBy(desc(interviews.scheduledAt));
  }

  async getInterview(id: string): Promise<Interview | undefined> {
    const [interview] = await db.select().from(interviews).where(eq(interviews.id, id));
    return interview;
  }

  async createInterview(interview: InsertInterview): Promise<Interview> {
    const [created] = await db.insert(interviews).values(interview).returning();
    return created;
  }

  async updateInterview(id: string, data: Partial<InsertInterview>): Promise<Interview | undefined> {
    const [updated] = await db.update(interviews).set({ ...data, updatedAt: new Date() }).where(eq(interviews.id, id)).returning();
    return updated;
  }

  async getInterviewStats(): Promise<{ total: number; scheduled: number; completed: number; cancelled: number }> {
    const [total] = await db.select({ value: count() }).from(interviews);
    const [scheduledRow] = await db.select({ value: count() }).from(interviews).where(eq(interviews.status, "scheduled"));
    const [completedRow] = await db.select({ value: count() }).from(interviews).where(eq(interviews.status, "completed"));
    const [cancelledRow] = await db.select({ value: count() }).from(interviews).where(eq(interviews.status, "cancelled"));

    return {
      total: Number(total.value),
      scheduled: Number(scheduledRow.value),
      completed: Number(completedRow.value),
      cancelled: Number(cancelledRow.value),
    };
  }

  // ─── Workforce ──────────────────────────────────────────────────────────────
  async getWorkforce(params?: { seasonId?: string; isActive?: boolean }): Promise<WorkforceRecord[]> {
    const conditions = [];
    if (params?.seasonId) conditions.push(eq(workforce.seasonId, params.seasonId));
    if (params?.isActive !== undefined) conditions.push(eq(workforce.isActive, params.isActive));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    return db.select().from(workforce).where(where).orderBy(desc(workforce.createdAt));
  }

  async createWorkforceRecord(record: InsertWorkforce): Promise<WorkforceRecord> {
    const [created] = await db.insert(workforce).values(record).returning();
    return created;
  }

  async updateWorkforceRecord(id: string, data: Partial<InsertWorkforce>): Promise<WorkforceRecord | undefined> {
    const [updated] = await db.update(workforce).set({ ...data, updatedAt: new Date() }).where(eq(workforce.id, id)).returning();
    return updated;
  }

  async getWorkforceStats(): Promise<{ total: number; active: number; byDepartment: Record<string, number> }> {
    const [total] = await db.select({ value: count() }).from(workforce);
    const [activeRow] = await db.select({ value: count() }).from(workforce).where(eq(workforce.isActive, true));

    const deptRows = await db
      .select({
        dept: workforce.department,
        cnt: count(),
      })
      .from(workforce)
      .groupBy(workforce.department);

    const byDepartment: Record<string, number> = {};
    for (const row of deptRows) {
      if (row.dept) byDepartment[row.dept] = Number(row.cnt);
    }

    return {
      total: Number(total.value),
      active: Number(activeRow.value),
      byDepartment,
    };
  }

  // ─── Automation Rules ───────────────────────────────────────────────────────
  async getAutomationRules(): Promise<AutomationRule[]> {
    return db.select().from(automationRules).orderBy(asc(automationRules.createdAt));
  }

  async createAutomationRule(rule: InsertAutomationRule): Promise<AutomationRule> {
    const [created] = await db.insert(automationRules).values(rule).returning();
    return created;
  }

  async updateAutomationRule(id: string, data: Partial<InsertAutomationRule>): Promise<AutomationRule | undefined> {
    const [updated] = await db.update(automationRules).set({ ...data, updatedAt: new Date() }).where(eq(automationRules.id, id)).returning();
    return updated;
  }

  // ─── Notifications ──────────────────────────────────────────────────────────
  async getNotifications(params?: { recipientId?: string; status?: string; limit?: number }): Promise<Notification[]> {
    const conditions = [];
    if (params?.recipientId) conditions.push(eq(notifications.recipientId, params.recipientId));
    if (params?.status) conditions.push(eq(notifications.status, params.status as any));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    return db
      .select()
      .from(notifications)
      .where(where)
      .orderBy(desc(notifications.createdAt))
      .limit(params?.limit ?? 100);
  }

  async createNotification(notification: InsertNotification): Promise<Notification> {
    const [created] = await db.insert(notifications).values(notification).returning();
    return created;
  }

  async markNotificationRead(id: string): Promise<boolean> {
    const result = await db
      .update(notifications)
      .set({ status: "read", readAt: new Date() })
      .where(eq(notifications.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getUnreadCount(recipientId: string): Promise<number> {
    const [row] = await db
      .select({ value: count() })
      .from(notifications)
      .where(and(eq(notifications.recipientId, recipientId), eq(notifications.status, "pending")));
    return Number(row.value);
  }

  // ─── Dashboard ──────────────────────────────────────────────────────────────
  async getDashboardStats() {
    const [totalCandidates] = await db.select({ value: count() }).from(candidates);
    const [openPositions] = await db.select({ value: count() }).from(jobPostings).where(eq(jobPostings.status, "active"));
    const [activeSeasons] = await db.select({ value: count() }).from(seasons).where(eq(seasons.status, "active"));
    const [scheduledInterviews] = await db.select({ value: count() }).from(interviews).where(eq(interviews.status, "scheduled"));

    const recentApps = await db
      .select({
        candidateName: candidates.fullNameEn,
        role: jobPostings.title,
        status: applications.status,
        appliedAt: applications.appliedAt,
      })
      .from(applications)
      .leftJoin(candidates, eq(applications.candidateId, candidates.id))
      .leftJoin(jobPostings, eq(applications.jobId, jobPostings.id))
      .orderBy(desc(applications.appliedAt))
      .limit(10);

    return {
      totalCandidates: Number(totalCandidates.value),
      openPositions: Number(openPositions.value),
      activeSeasons: Number(activeSeasons.value),
      scheduledInterviews: Number(scheduledInterviews.value),
      recentApplications: recentApps.map((r) => ({
        candidateName: r.candidateName ?? "Unknown",
        role: r.role ?? "Unknown",
        status: r.status,
        appliedAt: r.appliedAt,
      })),
    };
  }

  // ─── Business Units ──────────────────────────────────────────────────────────
  async getBusinessUnits(): Promise<BusinessUnit[]> {
    return db.select().from(businessUnits).orderBy(asc(businessUnits.name));
  }

  async getBusinessUnit(id: string): Promise<BusinessUnit | undefined> {
    const [bu] = await db.select().from(businessUnits).where(eq(businessUnits.id, id));
    return bu;
  }

  async createBusinessUnit(data: InsertBusinessUnit): Promise<BusinessUnit> {
    const [bu] = await db.insert(businessUnits).values(data).returning();
    return bu;
  }

  async updateBusinessUnit(id: string, data: Partial<InsertBusinessUnit>): Promise<BusinessUnit | undefined> {
    const [bu] = await db.update(businessUnits).set(data).where(eq(businessUnits.id, id)).returning();
    return bu;
  }

  // ─── Users list (for admin management) ──────────────────────────────────────
  async listUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(asc(users.fullName));
  }

  // ─── SMP Contracts ────────────────────────────────────────────────────────
  async getSMPContracts(): Promise<SMPContract[]> {
    return db.select().from(smpContracts).orderBy(desc(smpContracts.createdAt));
  }

  async getSMPContract(id: string): Promise<SMPContract | undefined> {
    const [c] = await db.select().from(smpContracts).where(eq(smpContracts.id, id));
    return c;
  }

  async createSMPContract(data: InsertSMPContract): Promise<SMPContract> {
    const [c] = await db.insert(smpContracts).values(data).returning();
    return c;
  }

  async updateSMPContract(id: string, data: Partial<InsertSMPContract>): Promise<SMPContract | undefined> {
    const [c] = await db
      .update(smpContracts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(smpContracts.id, id))
      .returning();
    return c;
  }

  async deleteSMPContract(id: string): Promise<boolean> {
    const result = await db.delete(smpContracts).where(eq(smpContracts.id, id)).returning();
    return result.length > 0;
  }

  // ─── Question Sets ─────────────────────────────────────────────────────────
  async getQuestionSets(): Promise<QuestionSet[]> {
    return db.select().from(questionSets).orderBy(desc(questionSets.createdAt));
  }

  async getQuestionSet(id: string): Promise<QuestionSet | undefined> {
    const [qs] = await db.select().from(questionSets).where(eq(questionSets.id, id));
    return qs;
  }

  async createQuestionSet(data: InsertQuestionSet): Promise<QuestionSet> {
    const [qs] = await db.insert(questionSets).values(data).returning();
    return qs;
  }

  async updateQuestionSet(id: string, data: Partial<InsertQuestionSet>): Promise<QuestionSet | undefined> {
    const [qs] = await db
      .update(questionSets)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(questionSets.id, id))
      .returning();
    return qs;
  }

  async deleteQuestionSet(id: string): Promise<boolean> {
    const result = await db.delete(questionSets).where(eq(questionSets.id, id)).returning();
    return result.length > 0;
  }
}

export const storage = new DatabaseStorage();
