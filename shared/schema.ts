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

export const onboardingStatusEnum = pgEnum("onboarding_status", [
  "pending",
  "in_progress",
  "ready",
  "converted",
  "rejected",
]);

export const interviewStatusEnum = pgEnum("interview_status", [
  "scheduled",
  "in_progress",
  "completed",
  "cancelled",
  "no_show",
]);

export const eventStatusEnum = pgEnum("event_status", [
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
    nationalIdIdx: uniqueIndex("users_national_id_idx").on(t.nationalId),
  })
);

// ─── Candidates (the 70k-scale table) ─────────────────────────────────────
export const candidates = pgTable(
  "candidates",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
    // Identity
    candidateCode: varchar("candidate_code", { length: 20 }),
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
    currentEmployer: text("current_employer"),
    isEmployedElsewhere: boolean("is_employed_elsewhere").notNull().default(false),
    experienceYears: integer("experience_years").notNull().default(0),
    educationLevel: text("education_level"),
    university: text("university"),
    major: text("major"),
    skills: text("skills").array(),
    languages: text("languages").array(),
    certifications: text("certifications").array(),
    // Extended profile
    nationalityText: text("nationality_text"),
    maritalStatus: text("marital_status"),
    hasChronicDiseases: boolean("has_chronic_diseases").notNull().default(false),
    chronicDiseases: text("chronic_diseases"),
    profileCompleted: boolean("profile_completed").notNull().default(false),
    // Emergency Contact
    emergencyContactName: text("emergency_contact_name"),
    emergencyContactPhone: text("emergency_contact_phone"),
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
    // Classification & Activity
    source: text("source").notNull().default("individual"),
    lastLoginAt: timestamp("last_login_at"),
    // Meta
    resumeUrl: text("resume_url"),
    photoUrl: text("photo_url"),
    nationalIdFileUrl: text("national_id_file_url"),
    ibanFileUrl: text("iban_file_url"),
    notes: text("notes"),
    tags: text("tags").array(),
    metadata: jsonb("metadata"),
    phoneTransferredAt: timestamp("phone_transferred_at"),
    archivedAt: timestamp("archived_at"),
    createdAt: timestamp("created_at").notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
  },
  (t) => ({
    // Composite indexes for MAANG-scale search performance
    userIdIdx: uniqueIndex("candidates_user_id_idx").on(t.userId),
    emailIdx: index("candidates_email_idx").on(t.email),
    phoneIdx: index("candidates_phone_idx").on(t.phone),
    statusIdx: index("candidates_status_idx").on(t.status),
    nationalityIdx: index("candidates_nationality_idx").on(t.nationality),
    cityIdx: index("candidates_city_idx").on(t.city),
    ratingIdx: index("candidates_rating_idx").on(t.rating),
    createdAtIdx: index("candidates_created_at_idx").on(t.createdAt),
    nationalIdIdx: uniqueIndex("candidates_national_id_idx").on(t.nationalId),
    statusCityIdx: index("candidates_status_city_idx").on(t.status, t.city),
    fullNameEnIdx: index("candidates_full_name_en_idx").on(t.fullNameEn),
  })
);

// ─── Events ─────────────────────────────────────────────────────────────────
export const events = pgTable(
  "events",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    description: text("description"),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    status: eventStatusEnum("status").notNull().default("upcoming"),
    targetHeadcount: integer("target_headcount").notNull().default(0),
    filledPositions: integer("filled_positions").notNull().default(0),
    budget: decimal("budget", { precision: 14, scale: 2 }),
    region: text("region"),
    createdBy: varchar("created_by").references(() => users.id),
    archivedAt: timestamp("archived_at"),
    createdAt: timestamp("created_at").notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
  },
  (t) => ({
    statusIdx: index("events_status_idx").on(t.status),
  })
);

// ─── SMP Contracts ──────────────────────────────────────────────────────────
export const smpContractTypeEnum = pgEnum("smp_contract_type", ["fixed_term", "open_ended", "project_based"]);

export const smpContracts = pgTable(
  "smp_contracts",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    contractNumber: text("contract_number").notNull().unique(),
    contractorName: text("contractor_name").notNull(),
    contractType: smpContractTypeEnum("contract_type").notNull().default("fixed_term"),
    region: text("region").notNull(),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    notes: text("notes"),
    employees: jsonb("employees").default([]),
    createdAt: timestamp("created_at").notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
  },
  (t) => ({
    contractNumberIdx: uniqueIndex("smp_contracts_number_idx").on(t.contractNumber),
  })
);

// ─── Question Sets ──────────────────────────────────────────────────────────
export const questionSets = pgTable("question_sets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  questions: jsonb("questions").notNull().default(sql`'[]'::jsonb`),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

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
    type: text("type").notNull().default("seasonal_full_time"),
    salaryMin: decimal("salary_min", { precision: 10, scale: 2 }),
    salaryMax: decimal("salary_max", { precision: 10, scale: 2 }),
    openings: integer("openings").notNull().default(1),
    status: jobStatusEnum("status").notNull().default("draft"),
    eventId: varchar("event_id").notNull().references(() => events.id),
    postedBy: varchar("posted_by").references(() => users.id),
    businessUnitId: varchar("business_unit_id").references(() => businessUnits.id, { onDelete: "set null" }),
    deadline: text("deadline"),
    skills: text("skills").array(),
    questionSetId: varchar("question_set_id").references(() => questionSets.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
    archivedAt: timestamp("archived_at"),
  },
  (t) => ({
    statusIdx: index("jobs_status_idx").on(t.status),
    eventIdx: index("jobs_event_idx").on(t.eventId),
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
    eventId: varchar("event_id").references(() => events.id),
    status: applicationStatusEnum("status").notNull().default("new"),
    appliedAt: timestamp("applied_at").notNull().default(sql`now()`),
    reviewedBy: varchar("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at"),
    notes: text("notes"),
    score: integer("score"),
    questionSetAnswers: jsonb("question_set_answers"),
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
    eventId: varchar("event_id").references(() => events.id, { onDelete: "set null" }),
    applicationId: varchar("application_id")
      .references(() => applications.id, { onDelete: "set null" }),
    candidateId: varchar("candidate_id")
      .references(() => candidates.id),
    interviewerId: varchar("interviewer_id").references(() => users.id),
    scheduledAt: timestamp("scheduled_at").notNull(),
    durationMinutes: integer("duration_minutes").notNull().default(30),
    status: interviewStatusEnum("status").notNull().default("scheduled"),
    type: text("type").notNull().default("video"),
    meetingUrl: text("meeting_url"),
    notes: text("notes"),
    groupName: text("group_name"),
    invitedCandidateIds: text("invited_candidate_ids").array(),
    createdByName: text("created_by_name"),
    rating: integer("rating"),
    feedback: text("feedback"),
    createdAt: timestamp("created_at").notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
  },
  (t) => ({
    eventIdx: index("interviews_event_idx").on(t.eventId),
    candidateIdx: index("interviews_candidate_idx").on(t.candidateId),
    scheduledAtIdx: index("interviews_scheduled_at_idx").on(t.scheduledAt),
    statusIdx: index("interviews_status_idx").on(t.status),
  })
);

// ─── Onboarding ─────────────────────────────────────────────────────────────
export const onboarding = pgTable(
  "onboarding",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    candidateId: varchar("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    applicationId: varchar("application_id")
      .references(() => applications.id, { onDelete: "set null" }),
    jobId: varchar("job_id").references(() => jobPostings.id, { onDelete: "set null" }),
    eventId: varchar("event_id").references(() => events.id, { onDelete: "set null" }),
    status: onboardingStatusEnum("status").notNull().default("pending"),
    // Prerequisite checklist
    hasPhoto: boolean("has_photo").notNull().default(false),
    hasIban: boolean("has_iban").notNull().default(false),
    hasNationalId: boolean("has_national_id").notNull().default(false),
    hasMedicalFitness: boolean("has_medical_fitness").notNull().default(false),
    hasSignedContract: boolean("has_signed_contract").notNull().default(false),
    hasEmergencyContact: boolean("has_emergency_contact").notNull().default(false),
    // Contract
    contractSignedAt: timestamp("contract_signed_at"),
    contractUrl: text("contract_url"),
    startDate: text("start_date"),
    // Meta
    notes: text("notes"),
    rejectedAt: timestamp("rejected_at"),
    rejectedBy: varchar("rejected_by").references(() => users.id),
    rejectionReason: text("rejection_reason"),
    convertedAt: timestamp("converted_at"),
    convertedBy: varchar("converted_by").references(() => users.id),
    createdAt: timestamp("created_at").notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
  },
  (t) => ({
    candidateIdx: index("onboarding_candidate_idx").on(t.candidateId),
    statusIdx: index("onboarding_status_idx").on(t.status),
    eventIdx: index("onboarding_event_idx").on(t.eventId),
  })
);

// ─── Workforce (hired employees) ────────────────────────────────────────────
export const workforce = pgTable(
  "workforce",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    employeeNumber: varchar("employee_number", { length: 7 }).notNull(),
    candidateId: varchar("candidate_id")
      .notNull()
      .references(() => candidates.id),
    jobId: varchar("job_id").references(() => jobPostings.id),
    eventId: varchar("event_id").references(() => events.id),
    salary: decimal("salary", { precision: 10, scale: 2 }),
    startDate: text("start_date").notNull(),
    endDate: text("end_date"),
    terminationReason: text("termination_reason"),
    isActive: boolean("is_active").notNull().default(true),
    supervisorId: varchar("supervisor_id").references(() => users.id),
    performanceScore: decimal("performance_score", { precision: 3, scale: 2 }),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
  },
  (t) => ({
    candidateIdx: index("workforce_candidate_idx").on(t.candidateId),
    eventIdx: index("workforce_event_idx").on(t.eventId),
    activeIdx: index("workforce_active_idx").on(t.isActive),
    empNumIdx: index("workforce_emp_num_idx").on(t.employeeNumber),
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

// ─── SMS Plugins ────────────────────────────────────────────────────────────
export const smsPlugins = pgTable("sms_plugins", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  version: text("version").notNull().default("1.0.0"),
  description: text("description"),
  pluginConfig: jsonb("plugin_config").notNull(),
  credentials: jsonb("credentials").notNull().default(sql`'{}'::jsonb`),
  isActive: boolean("is_active").notNull().default(false),
  installedAt: timestamp("installed_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// ─── OTP Verifications ──────────────────────────────────────────────────────
export const otpVerifications = pgTable("otp_verifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  phone: text("phone").notNull(),
  code: varchar("code", { length: 6 }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  attempts: integer("attempts").notNull().default(0),
  verifiedAt: timestamp("verified_at"),
  usedForRegistration: boolean("used_for_registration").notNull().default(false),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

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

export const insertEventSchema = createInsertSchema(events).omit({
  id: true,
  archivedAt: true,
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

export const insertInterviewSchema = createInsertSchema(interviews, {
  scheduledAt: z.coerce.date(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  candidateId: z.string().optional().nullable(),
  applicationId: z.string().optional().nullable(),
  invitedCandidateIds: z.array(z.string()).optional().nullable(),
  createdByName: z.string().optional().nullable(),
});

export const insertOnboardingSchema = createInsertSchema(onboarding).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  convertedAt: true,
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

export const insertQuestionSetSchema = createInsertSchema(questionSets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// ─── Types ──────────────────────────────────────────────────────────────────
export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertBusinessUnit = z.infer<typeof insertBusinessUnitSchema>;
export type BusinessUnit = typeof businessUnits.$inferSelect;
export type User = typeof users.$inferSelect;

export type InsertCandidate = z.infer<typeof insertCandidateSchema>;
export type Candidate = typeof candidates.$inferSelect;

export type InsertEvent = z.infer<typeof insertEventSchema>;
export type Event = typeof events.$inferSelect;

export type InsertJobPosting = z.infer<typeof insertJobPostingSchema>;
export type JobPosting = typeof jobPostings.$inferSelect;

export type InsertApplication = z.infer<typeof insertApplicationSchema>;
export type Application = typeof applications.$inferSelect;

export type InsertInterview = z.infer<typeof insertInterviewSchema>;
export type Interview = typeof interviews.$inferSelect;

export type InsertOnboarding = z.infer<typeof insertOnboardingSchema>;
export type OnboardingRecord = typeof onboarding.$inferSelect;

export type InsertWorkforce = z.infer<typeof insertWorkforceSchema>;
export type WorkforceRecord = typeof workforce.$inferSelect;

export type InsertAutomationRule = z.infer<typeof insertAutomationRuleSchema>;
export type AutomationRule = typeof automationRules.$inferSelect;

export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

export type InsertQuestionSet = z.infer<typeof insertQuestionSetSchema>;
export type QuestionSet = typeof questionSets.$inferSelect;

export const insertSMPContractSchema = createInsertSchema(smpContracts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSMPContract = z.infer<typeof insertSMPContractSchema>;
export type SMPContract = typeof smpContracts.$inferSelect;

export const insertSmsPluginSchema = createInsertSchema(smsPlugins).omit({
  id: true,
  installedAt: true,
  updatedAt: true,
});
export type InsertSmsPlugin = z.infer<typeof insertSmsPluginSchema>;
export type SmsPlugin = typeof smsPlugins.$inferSelect;

export const insertOtpVerificationSchema = createInsertSchema(otpVerifications).omit({
  id: true,
  createdAt: true,
});
export type InsertOtpVerification = z.infer<typeof insertOtpVerificationSchema>;
export type OtpVerification = typeof otpVerifications.$inferSelect;

// ─── Contract Templates (Contract Engine) ──────────────────────────────────
export const contractTemplateStatusEnum = pgEnum("contract_template_status", [
  "draft",
  "active",
  "archived",
]);

export const contractTemplates = pgTable(
  "contract_templates",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    eventId: varchar("event_id").references(() => events.id, { onDelete: "set null" }),
    version: integer("version").notNull().default(1),
    parentTemplateId: varchar("parent_template_id"),
    status: contractTemplateStatusEnum("status").notNull().default("draft"),
    logoUrl: text("logo_url"),
    logoAlignment: text("logo_alignment").default("center"),
    companyName: text("company_name"),
    headerText: text("header_text"),
    preamble: text("preamble"),
    footerText: text("footer_text"),
    documentFooter: text("document_footer"),
    articles: jsonb("articles").notNull().default(sql`'[]'::jsonb`),
    createdBy: varchar("created_by").references(() => users.id),
    createdAt: timestamp("created_at").notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
  },
  (t) => ({
    eventIdx: index("ct_event_idx").on(t.eventId),
    statusIdx: index("ct_status_idx").on(t.status),
    parentIdx: index("ct_parent_idx").on(t.parentTemplateId),
  })
);

// ─── Candidate Contracts (generated from templates) ─────────────────────────
export const candidateContractStatusEnum = pgEnum("candidate_contract_status", [
  "generated",
  "awaiting_signing",
  "sent",
  "signed",
]);

export const candidateContracts = pgTable(
  "candidate_contracts",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    candidateId: varchar("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    onboardingId: varchar("onboarding_id")
      .references(() => onboarding.id, { onDelete: "set null" }),
    templateId: varchar("template_id")
      .notNull()
      .references(() => contractTemplates.id, { onDelete: "restrict" }),
    status: candidateContractStatusEnum("status").notNull().default("generated"),
    snapshotArticles: jsonb("snapshot_articles"),
    snapshotVariables: jsonb("snapshot_variables"),
    generatedPdfUrl: text("generated_pdf_url"),
    signedAt: timestamp("signed_at"),
    signedIp: text("signed_ip"),
    createdAt: timestamp("created_at").notNull().default(sql`now()`),
  },
  (t) => ({
    candidateIdx: index("cc_candidate_idx").on(t.candidateId),
    onboardingIdx: index("cc_onboarding_idx").on(t.onboardingId),
    templateIdx: index("cc_template_idx").on(t.templateId),
    statusIdx: index("cc_status_idx").on(t.status),
  })
);

// ─── SMS Plugin Config Format (the contract every plugin must satisfy) ───────
export interface SmsCredentialDef {
  key: string;
  label: string;
  type: "text" | "secret";
  required: boolean;
  placeholder?: string;
  hint?: string;
}

export interface SmsPluginConfig {
  name: string;
  description?: string;
  version: string;
  author?: string;
  credentials: SmsCredentialDef[];
  send: {
    endpoint: string;
    method: "POST" | "GET" | "PUT";
    headers?: Record<string, string>;
    body?: Record<string, unknown>;
    queryParams?: Record<string, string>;
    successStatusCodes: number[];
    responseMessageIdPath?: string;
    responseErrorPath?: string;
    responseSuccessField?: string;
    responseSuccessValue?: string;
    responsePartialErrorPath?: string;
  };
  compliance?: {
    region?: string;
    notes?: string;
  };
}

export const insertContractTemplateSchema = createInsertSchema(contractTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertContractTemplate = z.infer<typeof insertContractTemplateSchema>;
export type ContractTemplate = typeof contractTemplates.$inferSelect;

export const insertCandidateContractSchema = createInsertSchema(candidateContracts).omit({
  id: true,
  createdAt: true,
});
export type InsertCandidateContract = z.infer<typeof insertCandidateContractSchema>;
export type CandidateContract = typeof candidateContracts.$inferSelect;

// ─── Saudi Arabia Official 13 Administrative Regions ────────────────────────
export const KSA_REGIONS = [
  "Riyadh", "Makkah", "Madinah", "Eastern Province", "Asir",
  "Tabuk", "Hail", "Northern Borders", "Jazan", "Najran",
  "Al Bahah", "Al Jawf", "Qassim",
] as const;

// ─── ID Card Templates ──────────────────────────────────────────────────────
export const idCardTemplates = pgTable(
  "id_card_templates",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    eventId: varchar("event_id").references(() => events.id, { onDelete: "set null" }),
    layoutConfig: jsonb("layout_config").notNull().default(sql`'{}'::jsonb`),
    logoUrl: text("logo_url"),
    backgroundImageUrl: text("background_image_url"),
    fields: text("fields").array().notNull().default(sql`ARRAY['fullName','photo','employeeNumber']::text[]`),
    backgroundColor: text("background_color").notNull().default("#1a1a2e"),
    textColor: text("text_color").notNull().default("#ffffff"),
    accentColor: text("accent_color").notNull().default("#16a34a"),
    isActive: boolean("is_active").notNull().default(false),
    createdAt: timestamp("created_at").notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
  },
  (t) => ({
    eventIdx: index("id_card_templates_event_idx").on(t.eventId),
    activeIdx: index("id_card_templates_active_idx").on(t.isActive),
  })
);

export const insertIdCardTemplateSchema = createInsertSchema(idCardTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertIdCardTemplate = z.infer<typeof insertIdCardTemplateSchema>;
export type IdCardTemplate = typeof idCardTemplates.$inferSelect;

// ─── Printer Plugins ────────────────────────────────────────────────────────
export const printerPlugins = pgTable("printer_plugins", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  type: text("type").notNull().default("zebra_browser_print"),
  config: jsonb("config").notNull().default(sql`'{}'::jsonb`),
  isActive: boolean("is_active").notNull().default(false),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

export const insertPrinterPluginSchema = createInsertSchema(printerPlugins).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPrinterPlugin = z.infer<typeof insertPrinterPluginSchema>;
export type PrinterPlugin = typeof printerPlugins.$inferSelect;

// ─── ID Card Print Logs ─────────────────────────────────────────────────────
export const printStatusEnum = pgEnum("print_status", [
  "success",
  "failed",
  "pending",
]);

export const idCardPrintLogs = pgTable(
  "id_card_print_logs",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    employeeId: varchar("employee_id").notNull().references(() => workforce.id),
    templateId: varchar("template_id").references(() => idCardTemplates.id, { onDelete: "set null" }),
    printedBy: varchar("printed_by").references(() => users.id, { onDelete: "set null" }),
    printerPluginId: varchar("printer_plugin_id").references(() => printerPlugins.id, { onDelete: "set null" }),
    status: printStatusEnum("status").notNull().default("success"),
    printedAt: timestamp("printed_at").notNull().default(sql`now()`),
  },
  (t) => ({
    employeeIdx: index("print_logs_employee_idx").on(t.employeeId),
    templateIdx: index("print_logs_template_idx").on(t.templateId),
    printedAtIdx: index("print_logs_printed_at_idx").on(t.printedAt),
    printedByIdx: index("print_logs_printed_by_idx").on(t.printedBy),
  })
);

export const insertIdCardPrintLogSchema = createInsertSchema(idCardPrintLogs).omit({
  id: true,
});
export type InsertIdCardPrintLog = z.infer<typeof insertIdCardPrintLogSchema>;
export type IdCardPrintLog = typeof idCardPrintLogs.$inferSelect;

// ─── System Settings ────────────────────────────────────────────────────────
export const systemSettings = pgTable("system_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type SystemSetting = typeof systemSettings.$inferSelect;

// ─── Query Params Types ─────────────────────────────────────────────────────
export const candidateQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  search: z.string().optional(),
  status: z.enum(["active", "inactive", "blocked", "hired", "rejected", "pending_review"]).optional(),
  dormant: z.enum(["true"]).optional(),
  inactive: z.enum(["true"]).optional(),
  archived: z.enum(["true"]).optional(),
  city: z.string().optional(),
  nationality: z.enum(["saudi", "non_saudi"]).optional(),
  gender: z.enum(["male", "female", "other", "prefer_not_to_say"]).optional(),
  source: z.enum(["individual", "smp"]).optional(),
  sortBy: z.enum(["createdAt", "fullNameEn", "rating", "experienceYears", "city", "source", "phone", "email"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type CandidateQuery = z.infer<typeof candidateQuerySchema>;
