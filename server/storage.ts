import { db } from "./db";
import {
  users,
  candidates,
  events,
  jobPostings,
  applications,
  interviews,
  onboarding,
  workforce,
  automationRules,
  notifications,
  businessUnits,
  smpContracts,
  questionSets,
  smsPlugins,
  otpVerifications,
  type OtpVerification,
  type InsertOtpVerification,
  type User,
  type InsertUser,
  type Candidate,
  type InsertCandidate,
  type Event,
  type InsertEvent,
  type JobPosting,
  type InsertJobPosting,
  type Application,
  type InsertApplication,
  type Interview,
  type InsertInterview,
  type OnboardingRecord,
  type InsertOnboarding,
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
  type SmsPlugin,
  type InsertSmsPlugin,
  type CandidateQuery,
  contractTemplates,
  candidateContracts,
  type ContractTemplate,
  type InsertContractTemplate,
  type CandidateContract,
  type InsertCandidateContract,
} from "@shared/schema";
import { eq, and, or, not, ilike, desc, asc, count, sql, inArray, lt, isNull, isNotNull } from "drizzle-orm";

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
  getCandidateByPhone(phone: string): Promise<Candidate | undefined>;
  getCandidateByNationalId(nationalId: string): Promise<Candidate | undefined>;
  createCandidate(candidate: InsertCandidate): Promise<Candidate>;
  updateCandidate(id: string, data: Partial<InsertCandidate>): Promise<Candidate | undefined>;
  archiveCandidate(id: string): Promise<boolean>;
  unarchiveCandidate(id: string): Promise<boolean>;
  bulkInsertCandidates(candidates: InsertCandidate[]): Promise<{ inserted: number; skipped: number; duplicates: { row: number; nationalId?: string; phone?: string; reason: string }[] }>;
  bulkUpdateCandidateStatus(ids: string[], status: string): Promise<number>;
  bulkArchiveCandidates(ids: string[]): Promise<number>;
  getCandidatesByIds(ids: string[]): Promise<any[]>;
  exportCandidates(): Promise<{ headers: string[]; rows: any[][]; total: number }>;
  getCandidateStats(): Promise<{ total: number; active: number; hired: number; blocked: number; avgRating: number }>;

  // Events
  getEvents(): Promise<Event[]>;
  getEvent(id: string): Promise<Event | undefined>;
  createEvent(event: InsertEvent): Promise<Event>;
  updateEvent(id: string, data: Partial<InsertEvent>): Promise<Event | undefined>;
  deleteEvent(id: string): Promise<boolean>;
  countJobPostingsByEvent(eventId: string): Promise<number>;

  // Job Postings
  getJobPostings(params?: { status?: string; eventId?: string }): Promise<JobPosting[]>;
  getJobPosting(id: string): Promise<JobPosting | undefined>;
  createJobPosting(job: InsertJobPosting): Promise<JobPosting>;
  updateJobPosting(id: string, data: Partial<InsertJobPosting>): Promise<JobPosting | undefined>;
  archiveJobPosting(id: string): Promise<boolean>;
  unarchiveJobPosting(id: string): Promise<boolean>;
  getJobStats(): Promise<{ total: number; active: number; draft: number; filled: number; totalOpenings: number }>;

  // Applications
  getApplications(params?: { jobId?: string; candidateId?: string; status?: string }): Promise<Application[]>;
  getApplicantsForJob(params: { jobId: string; page: number; limit: number; search?: string }): Promise<{ data: { candidateId: string; applicationId: string; fullNameEn: string; nationalId: string | null; applicationStatus: string; appliedAt: Date }[]; total: number }>;
  getApplication(id: string): Promise<Application | undefined>;
  createApplication(app: InsertApplication): Promise<Application>;
  updateApplication(id: string, data: Partial<InsertApplication>): Promise<Application | undefined>;
  getApplicationStats(): Promise<{ total: number; new: number; shortlisted: number; hired: number }>;

  // Interviews
  getInterviews(params?: { status?: string; candidateId?: string }): Promise<Interview[]>;
  getInterview(id: string): Promise<Interview | undefined>;
  getInterviewDetail(id: string): Promise<{ interview: Interview; invitedCandidates: { id: string; fullNameEn: string; nationalId: string | null; photoUrl: string | null; applicationId: string | null; applicationStatus: string | null }[] } | undefined>;
  createInterview(interview: InsertInterview): Promise<Interview>;
  updateInterview(id: string, data: Partial<InsertInterview>): Promise<Interview | undefined>;
  getInterviewStats(): Promise<{ total: number; scheduled: number; completed: number; cancelled: number }>;

  // Workforce
  getWorkforce(params?: { eventId?: string; isActive?: boolean }): Promise<WorkforceRecord[]>;
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

  // Onboarding
  getOnboardingRecords(filters?: { status?: string; eventId?: string; search?: string; candidateId?: string }): Promise<OnboardingRecord[]>;
  getOnboardingRecord(id: string): Promise<OnboardingRecord | undefined>;
  createOnboardingRecord(data: InsertOnboarding): Promise<OnboardingRecord>;
  updateOnboardingRecord(id: string, data: Partial<InsertOnboarding>): Promise<OnboardingRecord | undefined>;
  deleteOnboardingRecord(id: string): Promise<boolean>;
  convertOnboardingToEmployee(id: string, employmentData: { startDate: string; eventId?: string; }, convertedBy?: string): Promise<WorkforceRecord>;

  // SMS Plugins
  getSmsPlugins(): Promise<SmsPlugin[]>;
  getSmsPlugin(id: string): Promise<SmsPlugin | undefined>;
  getActiveSmsPlugin(): Promise<SmsPlugin | undefined>;
  createSmsPlugin(data: InsertSmsPlugin): Promise<SmsPlugin>;
  updateSmsPluginCredentials(id: string, credentials: Record<string, string>): Promise<SmsPlugin | undefined>;
  activateSmsPlugin(id: string): Promise<boolean>;
  deleteSmsPlugin(id: string): Promise<boolean>;

  // OTP Verifications
  createOtpVerification(phone: string, code: string, expiresAt: Date): Promise<OtpVerification>;
  getLatestOtpVerification(phone: string): Promise<OtpVerification | undefined>;
  incrementOtpAttempts(id: string): Promise<void>;
  markOtpVerified(id: string): Promise<void>;
  markOtpUsedForRegistration(id: string): Promise<void>;
  countRecentOtpRequests(phone: string, sinceMs: number): Promise<number>;
  flagPhoneTransferred(candidateId: string): Promise<void>;

  // Contract Templates
  getContractTemplates(filters?: { eventId?: string; status?: string }): Promise<ContractTemplate[]>;
  getContractTemplate(id: string): Promise<ContractTemplate | undefined>;
  createContractTemplate(data: InsertContractTemplate): Promise<ContractTemplate>;
  updateContractTemplate(id: string, data: Partial<InsertContractTemplate>): Promise<ContractTemplate | undefined>;
  deleteContractTemplate(id: string): Promise<boolean>;

  // Candidate Contracts
  getCandidateContracts(filters?: { candidateId?: string; onboardingId?: string; templateId?: string; status?: string }): Promise<CandidateContract[]>;
  getCandidateContract(id: string): Promise<CandidateContract | undefined>;
  createCandidateContract(data: InsertCandidateContract): Promise<CandidateContract>;
  updateCandidateContract(id: string, data: Partial<InsertCandidateContract>): Promise<CandidateContract | undefined>;

  // Dashboard
  getDashboardStats(): Promise<{
    totalCandidates: number;
    openPositions: number;
    activeEvents: number;
    scheduledInterviews: number;
    recentApplications: Array<{ candidateName: string; role: string; status: string; appliedAt: Date; photoUrl?: string | null }>;
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
    const { page, limit, search, status, city, nationality, gender, sortBy, sortOrder, dormant } = query;
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
          ilike(candidates.nationalId, term),
          ilike(candidates.city, term),
        )
      );
    }

    if (status) conditions.push(eq(candidates.status, status as any));
    if (dormant === "true") {
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      conditions.push(
        not(inArray(candidates.status, ["blocked", "hired"])),
        or(
          and(isNotNull(candidates.lastLoginAt), lt(candidates.lastLoginAt, oneYearAgo)),
          and(isNull(candidates.lastLoginAt), lt(candidates.createdAt, oneYearAgo)),
        )
      );
    }
    if ((query as any).inactive === "true") {
      conditions.push(eq(candidates.profileCompleted, false));
      conditions.push(not(inArray(candidates.status, ["blocked", "hired"])));
    }
    if (city) conditions.push(ilike(candidates.city, `%${city}%`));
    if (nationality) conditions.push(eq(candidates.nationality, nationality as any));
    if (gender) conditions.push(eq(candidates.gender, gender as any));
    if ((query as any).source) conditions.push(eq(candidates.source, (query as any).source));
    if ((query as any).archived === "true") {
      conditions.push(isNotNull(candidates.archivedAt));
    } else {
      conditions.push(isNull(candidates.archivedAt));
    }
    if ((query as any).region) conditions.push(eq(candidates.region, (query as any).region));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const orderFn = sortOrder === "asc" ? asc : desc;
    const orderCol =
      sortBy === "fullNameEn" ? candidates.fullNameEn
      : sortBy === "rating" ? candidates.rating
      : sortBy === "experienceYears" ? candidates.experienceYears
      : sortBy === "city" ? candidates.city
      : sortBy === "source" ? candidates.source
      : sortBy === "phone" ? candidates.phone
      : sortBy === "email" ? candidates.email
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

  async getCandidateByPhone(phone: string): Promise<Candidate | undefined> {
    const [candidate] = await db.select().from(candidates).where(and(eq(candidates.phone, phone), isNull(candidates.archivedAt)));
    return candidate;
  }

  async getCandidateByNationalId(nationalId: string): Promise<Candidate | undefined> {
    const [candidate] = await db.select().from(candidates).where(and(eq(candidates.nationalId, nationalId), isNull(candidates.archivedAt)));
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

  async archiveCandidate(id: string): Promise<boolean> {
    const result = await db
      .update(candidates)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(candidates.id, id), isNull(candidates.archivedAt)))
      .returning({ id: candidates.id });
    return result.length > 0;
  }

  async unarchiveCandidate(id: string): Promise<boolean> {
    const result = await db
      .update(candidates)
      .set({ archivedAt: null, updatedAt: new Date() })
      .where(and(eq(candidates.id, id), isNotNull(candidates.archivedAt)))
      .returning({ id: candidates.id });
    return result.length > 0;
  }

  async bulkInsertCandidates(data: InsertCandidate[]): Promise<{ inserted: number; skipped: number; duplicates: { row: number; nationalId?: string; phone?: string; reason: string }[] }> {
    if (data.length === 0) return { inserted: 0, skipped: 0, duplicates: [] };

    const existingNatIds = new Set<string>();
    const existingPhones = new Set<string>();

    const natIds = data.map(c => c.nationalId).filter(Boolean) as string[];
    const phones = data.map(c => c.phone).filter(Boolean) as string[];

    if (natIds.length > 0) {
      const found = await db.select({ nationalId: candidates.nationalId }).from(candidates).where(inArray(candidates.nationalId, natIds));
      found.forEach(r => { if (r.nationalId) existingNatIds.add(r.nationalId); });
    }
    if (phones.length > 0) {
      const found = await db.select({ phone: candidates.phone }).from(candidates).where(inArray(candidates.phone, phones));
      found.forEach(r => { if (r.phone) existingPhones.add(r.phone); });
    }

    const toInsert: InsertCandidate[] = [];
    const duplicates: { row: number; nationalId?: string; phone?: string; reason: string }[] = [];
    const batchNatIds = new Set<string>();
    const batchPhones = new Set<string>();

    for (let i = 0; i < data.length; i++) {
      const c = data[i];
      const reasons: string[] = [];

      if (c.nationalId && existingNatIds.has(c.nationalId)) reasons.push(`National ID ${c.nationalId} already exists`);
      if (c.phone && existingPhones.has(c.phone)) reasons.push(`Phone ${c.phone} already exists`);
      if (c.nationalId && batchNatIds.has(c.nationalId)) reasons.push(`Duplicate National ID ${c.nationalId} within upload`);
      if (c.phone && batchPhones.has(c.phone)) reasons.push(`Duplicate phone ${c.phone} within upload`);

      if (reasons.length > 0) {
        duplicates.push({ row: i + 1, nationalId: c.nationalId ?? undefined, phone: c.phone ?? undefined, reason: reasons.join("; ") });
      } else {
        toInsert.push(c);
        if (c.nationalId) batchNatIds.add(c.nationalId);
        if (c.phone) batchPhones.add(c.phone);
      }
    }

    let inserted = 0;
    if (toInsert.length > 0) {
      const result = await db.insert(candidates).values(toInsert).returning({ id: candidates.id });
      inserted = result.length;
    }

    return { inserted, skipped: duplicates.length, duplicates };
  }

  async bulkUpdateCandidateStatus(ids: string[], status: string): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await db
      .update(candidates)
      .set({ status: status as any, updatedAt: new Date() })
      .where(inArray(candidates.id, ids))
      .returning({ id: candidates.id });
    return result.length;
  }

  async bulkArchiveCandidates(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await db
      .update(candidates)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(and(inArray(candidates.id, ids), isNull(candidates.archivedAt)))
      .returning({ id: candidates.id });
    return result.length;
  }

  async getCandidatesByIds(ids: string[]): Promise<any[]> {
    if (ids.length === 0) return [];
    return db.select({
      id: candidates.id,
      fullNameEn: candidates.fullNameEn,
      nationalId: candidates.nationalId,
      phone: candidates.phone,
      email: candidates.email,
      city: candidates.city,
      nationality: candidates.nationality,
      photoUrl: candidates.photoUrl,
    }).from(candidates).where(inArray(candidates.id, ids));
  }

  async exportCandidates(): Promise<{ headers: string[]; rows: any[][]; total: number }> {
    const data = await db.select({
      id: candidates.id,
      fullNameEn: candidates.fullNameEn,
      fullNameAr: candidates.fullNameAr,
      source: candidates.source,
      status: candidates.status,
      phone: candidates.phone,
      email: candidates.email,
      city: candidates.city,
      region: candidates.region,
      nationality: candidates.nationality,
      nationalId: candidates.nationalId,
      ibanNumber: candidates.ibanNumber,
      gender: candidates.gender,
      dateOfBirth: candidates.dateOfBirth,
      educationLevel: candidates.educationLevel,
      major: candidates.major,
      experienceYears: candidates.experienceYears,
      createdAt: candidates.createdAt,
    })
      .from(candidates)
      .where(isNull(candidates.archivedAt))
      .orderBy(desc(candidates.createdAt));

    const headers = ["ID", "Full Name (EN)", "Full Name (AR)", "Classification", "Status", "Phone", "Email", "City", "Region", "Nationality", "National ID", "IBAN", "Gender", "Date of Birth", "Education", "Major", "Experience (Yrs)", "Created At"];
    const rows = data.map(r => [
      r.id, r.fullNameEn || "", r.fullNameAr || "",
      r.source || "individual", r.status, r.phone || "", r.email || "",
      r.city || "", r.region || "", r.nationality || "", r.nationalId || "",
      r.ibanNumber || "", r.gender || "", r.dateOfBirth || "",
      r.educationLevel || "", r.major || "", r.experienceYears ?? "",
      r.createdAt ? new Date(r.createdAt).toISOString().slice(0, 10) : "",
    ]);

    return { headers, rows, total: rows.length };
  }

  async getCandidateStats(): Promise<{ total: number; active: number; hired: number; blocked: number; avgRating: number }> {
    const notArchived = isNull(candidates.archivedAt);
    const [stats] = await db
      .select({
        total: count(),
        avgRating: sql<number>`coalesce(avg(${candidates.rating}::numeric), 0)`,
      })
      .from(candidates)
      .where(notArchived);

    const [activeRow] = await db.select({ value: count() }).from(candidates).where(and(eq(candidates.status, "active"), notArchived));
    const [hiredRow] = await db.select({ value: count() }).from(candidates).where(and(eq(candidates.status, "hired"), notArchived));
    const [blockedRow] = await db.select({ value: count() }).from(candidates).where(and(eq(candidates.status, "blocked"), notArchived));

    return {
      total: Number(stats.total),
      active: Number(activeRow.value),
      hired: Number(hiredRow.value),
      blocked: Number(blockedRow.value),
      avgRating: Number(Number(stats.avgRating).toFixed(2)),
    };
  }

  // ─── Events ─────────────────────────────────────────────────────────────────
  async getEvents(): Promise<Event[]> {
    return db.select().from(events).orderBy(desc(events.createdAt));
  }

  async getEvent(id: string): Promise<Event | undefined> {
    const [evt] = await db.select().from(events).where(eq(events.id, id));
    return evt;
  }

  async createEvent(event: InsertEvent): Promise<Event> {
    const [created] = await db.insert(events).values(event).returning();
    return created;
  }

  async updateEvent(id: string, data: Partial<InsertEvent>): Promise<Event | undefined> {
    const [updated] = await db.update(events).set({ ...data, updatedAt: new Date() }).where(eq(events.id, id)).returning();
    return updated;
  }

  async deleteEvent(id: string): Promise<boolean> {
    const result = await db.delete(events).where(eq(events.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async countJobPostingsByEvent(eventId: string): Promise<number> {
    const [row] = await db
      .select({ value: count() })
      .from(jobPostings)
      .where(eq(jobPostings.eventId, eventId));
    return Number(row?.value ?? 0);
  }

  // ─── Job Postings ───────────────────────────────────────────────────────────
  async getJobPostings(params?: { status?: string; eventId?: string }): Promise<JobPosting[]> {
    const conditions = [isNull(jobPostings.archivedAt)];
    if (params?.status) conditions.push(eq(jobPostings.status, params.status as any));
    if (params?.eventId) conditions.push(eq(jobPostings.eventId, params.eventId));
    return db.select().from(jobPostings).where(and(...conditions)).orderBy(desc(jobPostings.createdAt));
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

  async archiveJobPosting(id: string): Promise<boolean> {
    const result = await db.update(jobPostings).set({ archivedAt: new Date() }).where(and(eq(jobPostings.id, id), isNull(jobPostings.archivedAt))).returning({ id: jobPostings.id });
    return result.length > 0;
  }

  async unarchiveJobPosting(id: string): Promise<boolean> {
    const result = await db.update(jobPostings).set({ archivedAt: null }).where(eq(jobPostings.id, id)).returning({ id: jobPostings.id });
    return result.length > 0;
  }

  async getJobStats(): Promise<{ total: number; active: number; draft: number; filled: number; totalOpenings: number }> {
    const notArchived = isNull(jobPostings.archivedAt);
    const [stats] = await db.select({
      total: count(),
      totalOpenings: sql<number>`coalesce(sum(${jobPostings.openings}), 0)`,
    }).from(jobPostings).where(notArchived);

    const [activeRow] = await db.select({ value: count() }).from(jobPostings).where(and(eq(jobPostings.status, "active"), notArchived));
    const [draftRow] = await db.select({ value: count() }).from(jobPostings).where(and(eq(jobPostings.status, "draft"), notArchived));
    const [filledRow] = await db.select({ value: count() }).from(jobPostings).where(and(eq(jobPostings.status, "filled"), notArchived));

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

  async getApplicantsForJob(params: { jobId: string; page: number; limit: number; search?: string }): Promise<{ data: { candidateId: string; applicationId: string; fullNameEn: string; nationalId: string | null; applicationStatus: string; appliedAt: Date }[]; total: number }> {
    const { jobId, page, limit, search } = params;
    const offset = (page - 1) * limit;
    const conditions = [eq(applications.jobId, jobId)];
    if (search?.trim()) {
      conditions.push(or(
        ilike(candidates.fullNameEn, `%${search.trim()}%`),
        ilike(candidates.nationalId, `%${search.trim()}%`),
      )!);
    }
    const where = and(...conditions);

    const [rows, [{ value: totalCount }]] = await Promise.all([
      db.select({
        candidateId: candidates.id,
        applicationId: applications.id,
        fullNameEn: candidates.fullNameEn,
        nationalId: candidates.nationalId,
        applicationStatus: applications.status,
        appliedAt: applications.appliedAt,
      })
        .from(applications)
        .innerJoin(candidates, eq(applications.candidateId, candidates.id))
        .where(where)
        .orderBy(desc(applications.appliedAt))
        .limit(limit)
        .offset(offset),
      db.select({ value: count() })
        .from(applications)
        .innerJoin(candidates, eq(applications.candidateId, candidates.id))
        .where(where),
    ]);

    return { data: rows, total: Number(totalCount) };
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
    if (params?.candidateId) {
      conditions.push(
        or(
          eq(interviews.candidateId, params.candidateId),
          sql`${params.candidateId} = ANY(${interviews.invitedCandidateIds})`
        )!
      );
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    return db.select().from(interviews).where(where).orderBy(desc(interviews.scheduledAt));
  }

  async getInterview(id: string): Promise<Interview | undefined> {
    const [interview] = await db.select().from(interviews).where(eq(interviews.id, id));
    return interview;
  }

  async getInterviewDetail(id: string): Promise<{ interview: Interview; invitedCandidates: { id: string; fullNameEn: string; nationalId: string | null; photoUrl: string | null; applicationId: string | null; applicationStatus: string | null }[] } | undefined> {
    const [interview] = await db.select().from(interviews).where(eq(interviews.id, id));
    if (!interview) return undefined;
    let invitedCandidates: { id: string; fullNameEn: string; nationalId: string | null; photoUrl: string | null; applicationId: string | null; applicationStatus: string | null }[] = [];
    if (interview.invitedCandidateIds && interview.invitedCandidateIds.length > 0) {
      const candidateRows = await db.select({
        id: candidates.id,
        fullNameEn: candidates.fullNameEn,
        nationalId: candidates.nationalId,
        photoUrl: candidates.photoUrl,
      })
        .from(candidates)
        .where(inArray(candidates.id, interview.invitedCandidateIds));

      // Look up the best application for each candidate (prefer most-progressed status)
      const statusPriority: Record<string, number> = { hired: 6, shortlisted: 5, interviewed: 4, offered: 3, reviewing: 2, new: 1, rejected: 0, withdrawn: 0 };
      const appRows = await db.select({
        id: applications.id,
        candidateId: applications.candidateId,
        status: applications.status,
        jobId: applications.jobId,
      })
        .from(applications)
        .where(inArray(applications.candidateId, interview.invitedCandidateIds));

      invitedCandidates = candidateRows.map(c => {
        const candidateApps = appRows.filter(a => a.candidateId === c.id);
        // Prefer app linked to same job, else highest priority status
        const best = candidateApps.sort((a, b) => (statusPriority[b.status] ?? 0) - (statusPriority[a.status] ?? 0))[0];
        return {
          ...c,
          applicationId: best?.id ?? null,
          applicationStatus: best?.status ?? null,
        };
      });
    }
    return { interview, invitedCandidates };
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
  async getWorkforce(params?: { eventId?: string; isActive?: boolean }): Promise<WorkforceRecord[]> {
    const conditions = [];
    if (params?.eventId) conditions.push(eq(workforce.eventId, params.eventId));
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
    const [totalCandidates] = await db.select({ value: count() }).from(candidates).where(isNull(candidates.archivedAt));
    const [openPositions] = await db.select({ value: count() }).from(jobPostings).where(eq(jobPostings.status, "active"));
    const [activeEvents] = await db.select({ value: count() }).from(events).where(eq(events.status, "active"));
    const [scheduledInterviews] = await db.select({ value: count() }).from(interviews).where(eq(interviews.status, "scheduled"));

    const recentApps = await db
      .select({
        candidateName: candidates.fullNameEn,
        role: jobPostings.title,
        status: applications.status,
        appliedAt: applications.appliedAt,
        photoUrl: candidates.photoUrl,
      })
      .from(applications)
      .leftJoin(candidates, eq(applications.candidateId, candidates.id))
      .leftJoin(jobPostings, eq(applications.jobId, jobPostings.id))
      .orderBy(desc(applications.appliedAt))
      .limit(10);

    return {
      totalCandidates: Number(totalCandidates.value),
      openPositions: Number(openPositions.value),
      activeEvents: Number(activeEvents.value),
      scheduledInterviews: Number(scheduledInterviews.value),
      recentApplications: recentApps.map((r) => ({
        candidateName: r.candidateName ?? "Unknown",
        role: r.role ?? "Unknown",
        status: r.status,
        appliedAt: r.appliedAt,
        photoUrl: (r as any).photoUrl ?? null,
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

  // ─── Onboarding ─────────────────────────────────────────────────────────────
  async getOnboardingRecords(filters?: { status?: string; eventId?: string; search?: string; candidateId?: string }): Promise<OnboardingRecord[]> {
    const conditions: any[] = [];
    if (filters?.status) conditions.push(eq(onboarding.status, filters.status as any));
    if (filters?.eventId) conditions.push(eq(onboarding.eventId, filters.eventId));
    if (filters?.candidateId) conditions.push(eq(onboarding.candidateId, filters.candidateId));
    const query = db.select().from(onboarding).orderBy(desc(onboarding.createdAt));
    if (conditions.length > 0) return query.where(and(...conditions));
    return query;
  }

  async getOnboardingRecord(id: string): Promise<OnboardingRecord | undefined> {
    const [rec] = await db.select().from(onboarding).where(eq(onboarding.id, id));
    return rec;
  }

  async createOnboardingRecord(data: InsertOnboarding): Promise<OnboardingRecord> {
    const [rec] = await db.insert(onboarding).values(data).returning();
    return rec;
  }

  async updateOnboardingRecord(id: string, data: Partial<InsertOnboarding>): Promise<OnboardingRecord | undefined> {
    const [rec] = await db
      .update(onboarding)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(onboarding.id, id))
      .returning();
    return rec;
  }

  async deleteOnboardingRecord(id: string): Promise<boolean> {
    const result = await db.delete(onboarding).where(eq(onboarding.id, id)).returning();
    return result.length > 0;
  }

  async convertOnboardingToEmployee(
    id: string,
    employmentData: { startDate: string; eventId?: string },
    convertedBy?: string,
  ): Promise<WorkforceRecord> {
    const rec = await this.getOnboardingRecord(id);
    if (!rec) throw new Error("Onboarding record not found");
    if (rec.status === "converted") throw new Error("Already converted to employee");
    if (rec.status !== "ready") throw new Error(`Cannot convert — status is "${rec.status}", must be "ready"`);

    const [workforceRec] = await db.insert(workforce).values({
      candidateId: rec.candidateId,
      jobId: rec.jobId ?? undefined,
      eventId: employmentData.eventId ?? rec.eventId ?? undefined,
      startDate: employmentData.startDate,
      isActive: true,
    }).returning();

    await db.update(onboarding).set({
      status: "converted",
      convertedAt: new Date(),
      convertedBy: convertedBy ?? null,
      updatedAt: new Date(),
    }).where(eq(onboarding.id, id));

    await db.update(candidates).set({
      status: "hired",
      updatedAt: new Date(),
    }).where(eq(candidates.id, rec.candidateId));

    return workforceRec;
  }

  // ─── SMS Plugins ────────────────────────────────────────────────────────────
  async getSmsPlugins(): Promise<SmsPlugin[]> {
    return db.select().from(smsPlugins).orderBy(desc(smsPlugins.installedAt));
  }

  async getSmsPlugin(id: string): Promise<SmsPlugin | undefined> {
    const [p] = await db.select().from(smsPlugins).where(eq(smsPlugins.id, id));
    return p;
  }

  async getActiveSmsPlugin(): Promise<SmsPlugin | undefined> {
    const [p] = await db.select().from(smsPlugins).where(eq(smsPlugins.isActive, true));
    return p;
  }

  async createSmsPlugin(data: InsertSmsPlugin): Promise<SmsPlugin> {
    const [p] = await db.insert(smsPlugins).values(data).returning();
    return p;
  }

  async updateSmsPluginCredentials(id: string, credentials: Record<string, string>): Promise<SmsPlugin | undefined> {
    const [p] = await db
      .update(smsPlugins)
      .set({ credentials, updatedAt: new Date() })
      .where(eq(smsPlugins.id, id))
      .returning();
    return p;
  }


  async activateSmsPlugin(id: string): Promise<boolean> {
    await db.update(smsPlugins).set({ isActive: false, updatedAt: new Date() });
    const [p] = await db
      .update(smsPlugins)
      .set({ isActive: true, updatedAt: new Date() })
      .where(eq(smsPlugins.id, id))
      .returning();
    return !!p;
  }

  async deleteSmsPlugin(id: string): Promise<boolean> {
    const result = await db.delete(smsPlugins).where(eq(smsPlugins.id, id)).returning();
    return result.length > 0;
  }

  // ─── OTP Verifications ────────────────────────────────────────────────────

  async createOtpVerification(phone: string, code: string, expiresAt: Date): Promise<OtpVerification> {
    const [otp] = await db.insert(otpVerifications).values({ phone, code, expiresAt, attempts: 0 }).returning();
    return otp;
  }

  async getLatestOtpVerification(phone: string): Promise<OtpVerification | undefined> {
    const [otp] = await db
      .select()
      .from(otpVerifications)
      .where(eq(otpVerifications.phone, phone))
      .orderBy(desc(otpVerifications.createdAt))
      .limit(1);
    return otp;
  }

  async incrementOtpAttempts(id: string): Promise<void> {
    await db
      .update(otpVerifications)
      .set({ attempts: sql`${otpVerifications.attempts} + 1` })
      .where(eq(otpVerifications.id, id));
  }

  async markOtpVerified(id: string): Promise<void> {
    await db
      .update(otpVerifications)
      .set({ verifiedAt: new Date() })
      .where(eq(otpVerifications.id, id));
  }

  async markOtpUsedForRegistration(id: string): Promise<void> {
    await db
      .update(otpVerifications)
      .set({ usedForRegistration: true })
      .where(eq(otpVerifications.id, id));
  }

  async countRecentOtpRequests(phone: string, sinceMs: number): Promise<number> {
    const since = new Date(Date.now() - sinceMs);
    const [result] = await db
      .select({ count: count() })
      .from(otpVerifications)
      .where(and(eq(otpVerifications.phone, phone), sql`${otpVerifications.createdAt} >= ${since}`));
    return Number(result?.count ?? 0);
  }

  async flagPhoneTransferred(candidateId: string): Promise<void> {
    await db
      .update(candidates)
      .set({ phone: null, phoneTransferredAt: new Date(), updatedAt: new Date() })
      .where(eq(candidates.id, candidateId));
  }

  // ─── Contract Templates ────────────────────────────────────────────────────
  async getContractTemplates(filters?: { eventId?: string; status?: string }): Promise<ContractTemplate[]> {
    const conditions: any[] = [];
    if (filters?.eventId) conditions.push(eq(contractTemplates.eventId, filters.eventId));
    if (filters?.status) conditions.push(eq(contractTemplates.status, filters.status as any));
    return db
      .select()
      .from(contractTemplates)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(contractTemplates.createdAt));
  }

  async getContractTemplate(id: string): Promise<ContractTemplate | undefined> {
    const [row] = await db.select().from(contractTemplates).where(eq(contractTemplates.id, id));
    return row;
  }

  async createContractTemplate(data: InsertContractTemplate): Promise<ContractTemplate> {
    const [row] = await db.insert(contractTemplates).values(data).returning();
    return row;
  }

  async updateContractTemplate(id: string, data: Partial<InsertContractTemplate>): Promise<ContractTemplate | undefined> {
    const [row] = await db
      .update(contractTemplates)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(contractTemplates.id, id))
      .returning();
    return row;
  }

  async deleteContractTemplate(id: string): Promise<boolean> {
    const result = await db.delete(contractTemplates).where(eq(contractTemplates.id, id)).returning();
    return result.length > 0;
  }

  // ─── Candidate Contracts ───────────────────────────────────────────────────
  async getCandidateContracts(filters?: { candidateId?: string; onboardingId?: string; templateId?: string; status?: string }): Promise<CandidateContract[]> {
    const conditions: any[] = [];
    if (filters?.candidateId) conditions.push(eq(candidateContracts.candidateId, filters.candidateId));
    if (filters?.onboardingId) conditions.push(eq(candidateContracts.onboardingId, filters.onboardingId));
    if (filters?.templateId) conditions.push(eq(candidateContracts.templateId, filters.templateId));
    if (filters?.status) conditions.push(eq(candidateContracts.status, filters.status as any));
    return db
      .select()
      .from(candidateContracts)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(candidateContracts.createdAt));
  }

  async getCandidateContract(id: string): Promise<CandidateContract | undefined> {
    const [row] = await db.select().from(candidateContracts).where(eq(candidateContracts.id, id));
    return row;
  }

  async createCandidateContract(data: InsertCandidateContract): Promise<CandidateContract> {
    const [row] = await db.insert(candidateContracts).values(data).returning();
    return row;
  }

  async updateCandidateContract(id: string, data: Partial<InsertCandidateContract>): Promise<CandidateContract | undefined> {
    const [row] = await db
      .update(candidateContracts)
      .set(data)
      .where(eq(candidateContracts.id, id))
      .returning();
    return row;
  }
}

export const storage = new DatabaseStorage();
