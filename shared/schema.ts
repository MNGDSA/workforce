import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  integer,
  decimal,
  boolean,
  timestamp,
  pgEnum,
  index,
  uniqueIndex,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── Enums ─────────────────────────────────────────────────────────────────
export const candidateStatusEnum = pgEnum("candidate_status", [
  "active",
  "inactive",
  "blocked",
  "hired",
  "rejected",
  "pending_review",
]);

export const genderEnum = pgEnum("gender", ["male", "female", "other", "prefer_not_to_say"]);

export const nationalityEnum = pgEnum("nationality", ["saudi", "non_saudi"]);

export const applicationStatusEnum = pgEnum("application_status", [
  "new",
  "reviewing",
  "shortlisted",
  "interviewed",
  "offered",
  "hired",
  "rejected",
  "withdrawn",
]);

export const jobStatusEnum = pgEnum("job_status", [
  "draft",
  "active",
  "paused",
  "closed",
  "filled",
]);

export const interviewStatusEnum = pgEnum("interview_status", [
  "scheduled",
  "in_progress",
  "completed",
  "cancelled",
  "no_show",
]);

export const seasonStatusEnum = pgEnum("season_status", [
  "upcoming",
  "active",
  "closed",
  "archived",
]);

export const notificationTypeEnum = pgEnum("notification_type", [
  "sms",
  "email",
  "in_app",
  "push",
]);

export const notificationStatusEnum = pgEnum("notification_status", [
  "pending",
  "sent",
  "failed",
  "read",
]);

export const userRoleEnum = pgEnum("user_role", [
  "super_admin",
  "admin",
  "hr_manager",
  "recruiter",
  "interviewer",
  "viewer",
  "candidate",
]);

// ─── Business Units ─────────────────────────────────────────────────────────
export const businessUnits = pgTable(
  "business_units",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    code: varchar("code", { length: 20 }).notNull().unique(),
    description: text("description"),
    contactEmail: text("contact_email"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().default(sql`now()`),
  },
  (t) => ({
    codeIdx: uniqueIndex("business_units_code_idx").on(t.code),
  })
);

// ─── Users (auth + admin staff) ────────────────────────────────────────────
export const users = pgTable(
  "users",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    username: text("username").notNull().unique(),
    email: text("email").notNull().unique(),
    password: text("password").notNull(),
    role: userRoleEnum("role").notNull().default("recruiter"),
    fullName: text("full_name"),
    phone: text("phone"),
    nationalId: varchar("national_id", { length: 20 }),
    avatarUrl: text("avatar_url"),
    businessUnitId: varchar("business_unit_id").references(() => businessUnits.id, { onDelete: "set null" }),
    isActive: boolean("is_active").notNull().default(true),
    lastLogin: timestamp("last_login"),
    createdAt: timestamp("created_at").notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
  },
  (t) => ({
    emailIdx: uniqueIndex("users_email_idx").on(t.email),
    usernameIdx: uniqueIndex("users_username_idx").on(t.username),
    phoneIdx: index("users_phone_idx").on(t.phone),
    nationalIdIdx: index("users_national_id_idx").on(t.nationalId),
  })
);

// ─── Candidates (the 70k-scale table) ─────────────────────────────────────
export const candidates = pgTable(
  "candidates",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    // Identity
    candidateCode: varchar("candidate_code", { length: 20 }).notNull().unique(),
    fullNameAr: text("full_name_ar"),
    fullNameEn: text("full_name_en").notNull(),
    gender: genderEnum("gender"),
    dateOfBirth: text("date_of_birth"),
    nationality: nationalityEnum("nationality"),
    // Contact
    email: text("email").unique(),
    phone: text("phone"),
    whatsapp: text("whatsapp"),
    city: text("city"),
    region: text("region"),
    country: text("country").notNull().default("SA"),
    // Identity Docs
    nationalId: varchar("national_id", { length: 20 }),
    iqamaNumber: varchar("iqama_number", { length: 20 }),
    passportNumber: varchar("passport_number", { length: 20 }),
    // Professional
    currentRole: text("current_role"),
    experienceYears: integer("experience_years").notNull().default(0),
    educationLevel: text("education_level"),
    university: text("university"),
    major: text("major"),
    skills: text("skills").array(),
    languages: text("languages").array(),
    certifications: text("certifications").array(),
    // Financial
    ibanNumber: text("iban_number"),
    expectedSalary: decimal("expected_salary", { precision: 10, scale: 2 }),
    // Status & Ratings
    status: candidateStatusEnum("status").notNull().default("active"),
    rating: decimal("rating", { precision: 3, scale: 2 }).default("0"),
    totalRatings: integer("total_ratings").notNull().default(0),
    // Profile completion flags
    hasResume: boolean("has_resume").notNull().default(false),
    hasPhoto: boolean("has_photo").notNull().default(false),
    hasNationalId: boolean("has_national_id").notNull().default(false),
    hasIban: boolean("has_iban").notNull().default(false),
    // Meta
    resumeUrl: text("resume_url"),
    photoUrl: text("photo_url"),
    notes: text("notes"),
    tags: text("tags").array(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
  },
  (t) => ({
    // Composite indexes for MAANG-scale search performance
    emailIdx: index("candidates_email_idx").on(t.email),
    phoneIdx: index("candidates_phone_idx").on(t.phone),
    statusIdx: index("candidates_status_idx").on(t.status),
    nationalityIdx: index("candidates_nationality_idx").on(t.nationality),
    cityIdx: index("candidates_city_idx").on(t.city),
    ratingIdx: index("candidates_rating_idx").on(t.rating),
    createdAtIdx: index("candidates_created_at_idx").on(t.createdAt),
    nationalIdIdx: index("candidates_national_id_idx").on(t.nationalId),
    statusCityIdx: index("candidates_status_city_idx").on(t.status, t.city),
    fullNameEnIdx: index("candidates_full_name_en_idx").on(t.fullNameEn),
    candidateCodeIdx: uniqueIndex("candidates_code_idx").on(t.candidateCode),
  })
);

// ─── Seasons ────────────────────────────────────────────────────────────────
export const seasons = pgTable(
  "seasons",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    description: text("description"),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    status: seasonStatusEnum("status").notNull().default("upcoming"),
    targetHeadcount: integer("target_headcount").notNull().default(0),
    filledPositions: integer("filled_positions").notNull().default(0),
    budget: decimal("budget", { precision: 14, scale: 2 }),
    region: text("region"),
    createdBy: varchar("created_by").references(() => users.id),
    createdAt: timestamp("created_at").notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
  },
  (t) => ({
    statusIdx: index("seasons_status_idx").on(t.status),
  })
);

// ─── Job Postings ───────────────────────────────────────────────────────────
export const jobPostings = pgTable(
  "job_postings",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    title: text("title").notNull(),
    titleAr: text("title_ar"),
    description: text("description"),
    requirements: text("requirements"),
    location: text("location"),
    region: text("region"),
    department: text("department"),
    type: text("type").notNull().default("seasonal"),
    salaryMin: decimal("salary_min", { precision: 10, scale: 2 }),
    salaryMax: decimal("salary_max", { precision: 10, scale: 2 }),
    openings: integer("openings").notNull().default(1),
    status: jobStatusEnum("status").notNull().default("draft"),
    seasonId: varchar("season_id").references(() => seasons.id),
    postedBy: varchar("posted_by").references(() => users.id),
    businessUnitId: varchar("business_unit_id").references(() => businessUnits.id, { onDelete: "set null" }),
    deadline: text("deadline"),
    skills: text("skills").array(),
    createdAt: timestamp("created_at").notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
  },
  (t) => ({
    statusIdx: index("jobs_status_idx").on(t.status),
    seasonIdx: index("jobs_season_idx").on(t.seasonId),
    regionIdx: index("jobs_region_idx").on(t.region),
  })
);

// ─── Applications ───────────────────────────────────────────────────────────
export const applications = pgTable(
  "applications",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    candidateId: varchar("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    jobId: varchar("job_id")
      .notNull()
      .references(() => jobPostings.id, { onDelete: "cascade" }),
    seasonId: varchar("season_id").references(() => seasons.id),
    status: applicationStatusEnum("status").notNull().default("new"),
    appliedAt: timestamp("applied_at").notNull().default(sql`now()`),
    reviewedBy: varchar("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at"),
    notes: text("notes"),
    score: integer("score"),
    createdAt: timestamp("created_at").notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
  },
  (t) => ({
    candidateIdx: index("applications_candidate_idx").on(t.candidateId),
    jobIdx: index("applications_job_idx").on(t.jobId),
    statusIdx: index("applications_status_idx").on(t.status),
    candidateJobIdx: uniqueIndex("applications_candidate_job_idx").on(
      t.candidateId,
      t.jobId
    ),
  })
);

// ─── Interviews ─────────────────────────────────────────────────────────────
export const interviews = pgTable(
  "interviews",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    applicationId: varchar("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    candidateId: varchar("candidate_id")
      .notNull()
      .references(() => candidates.id),
    interviewerId: varchar("interviewer_id").references(() => users.id),
    scheduledAt: timestamp("scheduled_at").notNull(),
    durationMinutes: integer("duration_minutes").notNull().default(30),
    status: interviewStatusEnum("status").notNull().default("scheduled"),
    type: text("type").notNull().default("video"),
    meetingUrl: text("meeting_url"),
    notes: text("notes"),
    rating: integer("rating"),
    feedback: text("feedback"),
    createdAt: timestamp("created_at").notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
  },
  (t) => ({
    candidateIdx: index("interviews_candidate_idx").on(t.candidateId),
    scheduledAtIdx: index("interviews_scheduled_at_idx").on(t.scheduledAt),
    statusIdx: index("interviews_status_idx").on(t.status),
  })
);

// ─── Workforce (hired placements) ───────────────────────────────────────────
export const workforce = pgTable(
  "workforce",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    candidateId: varchar("candidate_id")
      .notNull()
      .references(() => candidates.id),
    jobId: varchar("job_id").references(() => jobPostings.id),
    seasonId: varchar("season_id").references(() => seasons.id),
    department: text("department"),
    position: text("position").notNull(),
    startDate: text("start_date").notNull(),
    endDate: text("end_date"),
    salary: decimal("salary", { precision: 10, scale: 2 }),
    isActive: boolean("is_active").notNull().default(true),
    supervisorId: varchar("supervisor_id").references(() => users.id),
    performanceScore: decimal("performance_score", { precision: 3, scale: 2 }),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
  },
  (t) => ({
    candidateIdx: index("workforce_candidate_idx").on(t.candidateId),
    seasonIdx: index("workforce_season_idx").on(t.seasonId),
    activeIdx: index("workforce_active_idx").on(t.isActive),
  })
);

// ─── Automation Rules ───────────────────────────────────────────────────────
export const automationRules = pgTable("automation_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  trigger: text("trigger").notNull(),
  action: text("action").notNull(),
  isEnabled: boolean("is_enabled").notNull().default(true),
  config: jsonb("config"),
  lastRunAt: timestamp("last_run_at"),
  runCount: integer("run_count").notNull().default(0),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// ─── Notifications ──────────────────────────────────────────────────────────
export const notifications = pgTable(
  "notifications",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    recipientId: varchar("recipient_id").references(() => users.id),
    candidateId: varchar("candidate_id").references(() => candidates.id),
    type: notificationTypeEnum("type").notNull().default("in_app"),
    status: notificationStatusEnum("status").notNull().default("pending"),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    metadata: jsonb("metadata"),
    sentAt: timestamp("sent_at"),
    readAt: timestamp("read_at"),
    createdAt: timestamp("created_at").notNull().default(sql`now()`),
  },
  (t) => ({
    recipientIdx: index("notifications_recipient_idx").on(t.recipientId),
    statusIdx: index("notifications_status_idx").on(t.status),
    createdAtIdx: index("notifications_created_at_idx").on(t.createdAt),
  })
);

// ─── Insert Schemas (Zod) ───────────────────────────────────────────────────
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastLogin: true,
});

export const insertCandidateSchema = createInsertSchema(candidates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSeasonSchema = createInsertSchema(seasons).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertJobPostingSchema = createInsertSchema(jobPostings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertApplicationSchema = createInsertSchema(applications).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertInterviewSchema = createInsertSchema(interviews).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertWorkforceSchema = createInsertSchema(workforce).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAutomationRuleSchema = createInsertSchema(automationRules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
});

export const insertBusinessUnitSchema = createInsertSchema(businessUnits).omit({
  id: true,
  createdAt: true,
});

// ─── Types ──────────────────────────────────────────────────────────────────
export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertBusinessUnit = z.infer<typeof insertBusinessUnitSchema>;
export type BusinessUnit = typeof businessUnits.$inferSelect;
export type User = typeof users.$inferSelect;

export type InsertCandidate = z.infer<typeof insertCandidateSchema>;
export type Candidate = typeof candidates.$inferSelect;

export type InsertSeason = z.infer<typeof insertSeasonSchema>;
export type Season = typeof seasons.$inferSelect;

export type InsertJobPosting = z.infer<typeof insertJobPostingSchema>;
export type JobPosting = typeof jobPostings.$inferSelect;

export type InsertApplication = z.infer<typeof insertApplicationSchema>;
export type Application = typeof applications.$inferSelect;

export type InsertInterview = z.infer<typeof insertInterviewSchema>;
export type Interview = typeof interviews.$inferSelect;

export type InsertWorkforce = z.infer<typeof insertWorkforceSchema>;
export type WorkforceRecord = typeof workforce.$inferSelect;

export type InsertAutomationRule = z.infer<typeof insertAutomationRuleSchema>;
export type AutomationRule = typeof automationRules.$inferSelect;

export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

// ─── Query Params Types ─────────────────────────────────────────────────────
export const candidateQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().optional(),
  status: z.enum(["active", "inactive", "blocked", "hired", "rejected", "pending_review"]).optional(),
  city: z.string().optional(),
  nationality: z.enum(["saudi", "non_saudi"]).optional(),
  gender: z.enum(["male", "female", "other", "prefer_not_to_say"]).optional(),
  sortBy: z.enum(["createdAt", "fullNameEn", "rating", "experienceYears"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type CandidateQuery = z.infer<typeof candidateQuerySchema>;
