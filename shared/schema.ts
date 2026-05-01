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
  primaryKey,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sanitizeHumanName } from "./name-sanitizer";

// ─── Enums ─────────────────────────────────────────────────────────────────
export const candidateStatusEnum = pgEnum("candidate_status", [
  "available",
  "active",
  "inactive",
  "blocked",
  "hired",
  "awaiting_activation",
  "pending_profile",
]);

// Task #107: Replaces the legacy free-text `candidates.source` column.
// Determines whether a candidate goes through the individual self-signup
// pipeline (jobs/interviews/payslips/contract) or the SMP-batch pipeline
// (parent-company-mediated, no IBAN/CV/jobs/payslips).
export const candidateClassificationEnum = pgEnum("candidate_classification", [
  "individual",
  "smp",
]);

// Task #107: SMS outbox kinds — drives template selection at drain time.
export const smsOutboxKindEnum = pgEnum("sms_outbox_kind", [
  "smp_activation",
  "smp_activation_reissue",
  "smp_activation_self_heal",
  "onboarding_reminder",
  "onboarding_final_warning",
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
  "closed",
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
  "terminated",
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

export const employmentTypeEnum = pgEnum("employment_type", ["individual", "smp"]);

// NOTE: Legacy `userRoleEnum`, `ADMIN_ROLES`, `ASSIGNABLE_ADMIN_ROLES` removed
// in T10. Roles are now stored in the `roles` table (see below) with a
// dynamic permission catalog in `shared/permissions.ts`. The migration
// `server/migrations/migrate-to-rbac.ts` drops the legacy `users.role` column
// and `user_role` Postgres enum.

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
    email: text("email").unique(),
    password: text("password").notNull(),
    roleId: varchar("role_id").notNull(),
    fullName: text("full_name"),
    // Bilingual display name (Arabic). Optional — admins seeded before this
    // column existed will be NULL until populated. When both names are
    // present the audit log + UI render them together as
    // "Faisal Alamri فيصل العمري" so RTL viewers always see the Arabic
    // form and the bidi <bdi> wrapping handles direction.
    fullNameAr: text("full_name_ar"),
    phone: text("phone"),
    nationalId: varchar("national_id", { length: 20 }),
    avatarUrl: text("avatar_url"),
    businessUnitId: varchar("business_unit_id").references(() => businessUnits.id, { onDelete: "set null" }),
    locale: varchar("locale", { length: 8 }).notNull().default("ar"),
    isActive: boolean("is_active").notNull().default(true),
    lastLogin: timestamp("last_login"),
    // Server-side token revocation, split by TRANSPORT so that web logout
    // never kills a worker's Android attendance device (and vice versa).
    // The wf_auth HMAC token is shared by both transports — what tells us
    // which "session" a request belongs to is the carrier:
    //   • Cookie `wf_auth=…`               → web    → checked against web col
    //   • Header `Authorization: Bearer …` → mobile → checked against mobile col
    // requireAuth rejects a token whose `iat` is at-or-before the column for
    // its transport. Logout bumps only the column matching the request that
    // initiated it. The 7-day token TTL stays intentionally long for the
    // Android fleet (Hajj/Ramadan field deployments with spotty connectivity).
    webTokensInvalidatedAt: timestamp("web_tokens_invalidated_at"),
    mobileTokensInvalidatedAt: timestamp("mobile_tokens_invalidated_at"),
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
    ibanAccountFirstName: text("iban_account_first_name"),
    ibanAccountLastName:  text("iban_account_last_name"),
    ibanBankName: text("iban_bank_name"),
    ibanBankCode: text("iban_bank_code"),
    expectedSalary: decimal("expected_salary", { precision: 10, scale: 2 }),
    // Status & Ratings
    status: candidateStatusEnum("status").notNull().default("available"),
    rating: decimal("rating", { precision: 3, scale: 2 }).default("0"),
    totalRatings: integer("total_ratings").notNull().default(0),
    // Profile completion flags
    hasResume: boolean("has_resume").notNull().default(false),
    hasPhoto: boolean("has_photo").notNull().default(false),
    hasNationalId: boolean("has_national_id").notNull().default(false),
    hasIban: boolean("has_iban").notNull().default(false),
    hasDriversLicense: boolean("has_drivers_license").notNull().default(false),
    hasVaccinationReport: boolean("has_vaccination_report").notNull().default(false),
    // Classification & Activity
    classification: candidateClassificationEnum("classification").notNull().default("individual"),
    lastLoginAt: timestamp("last_login_at"),
    // Meta
    resumeUrl: text("resume_url"),
    photoUrl: text("photo_url"),
    nationalIdFileUrl: text("national_id_file_url"),
    ibanFileUrl: text("iban_file_url"),
    driversLicenseFileUrl: text("drivers_license_file_url"),
    vaccinationReportFileUrl: text("vaccination_report_file_url"),
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
    iqamaNumberIdx: uniqueIndex("candidates_iqama_number_idx").on(t.iqamaNumber),
    passportNumberIdx: uniqueIndex("candidates_passport_number_idx").on(t.passportNumber),
    statusCityIdx: index("candidates_status_city_idx").on(t.status, t.city),
    fullNameEnIdx: index("candidates_full_name_en_idx").on(t.fullNameEn),
    // Task #107: composite for the awaiting-activation sweep, the SMP
    // exclusion filters in interviews/applications, and the talent list.
    classificationStatusIdx: index("candidates_classification_status_idx").on(
      t.classification,
      t.status,
    ),
  })
);

// ─── Candidate Activation Tokens (Task #107) ───────────────────────────────
// One-time tokens minted at SMP worker creation (or reissue/self-heal). Plain
// token is sent in SMS, only the SHA-256 hash is stored. Single live token per
// candidate is enforced by the partial unique index below — re-issuance
// invalidates any prior live row inside the same transaction.
export const candidateActivationTokens = pgTable(
  "candidate_activation_tokens",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    candidateId: varchar("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    consumedAt: timestamp("consumed_at"),
    invalidatedAt: timestamp("invalidated_at"),
    smsSentAt: timestamp("sms_sent_at"),
    createdByUserId: varchar("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().default(sql`now()`),
  },
  (t) => ({
    tokenHashIdx: uniqueIndex("cand_activation_tokens_hash_idx").on(t.tokenHash),
    expiresAtIdx: index("cand_activation_tokens_expires_at_idx").on(t.expiresAt),
    // Live-token invariant. Postgres syntax: drizzle accepts raw `where` via
    // sql template — exposed via the .where() builder method.
    // Live-token invariant — at most one un-consumed, un-invalidated row per
    // candidate. Expiry is checked at consumption time (the predicate must
    // be IMMUTABLE, so `now()` cannot appear here). Reissue paths MUST
    // stamp `invalidated_at` on the prior live row inside the same tx.
    liveTokenPerCandidateIdx: uniqueIndex("cand_activation_tokens_live_idx")
      .on(t.candidateId)
      .where(sql`consumed_at IS NULL AND invalidated_at IS NULL`),
    candidateIdx: index("cand_activation_tokens_candidate_idx").on(t.candidateId),
  })
);

// ─── SMS Outbox (Task #107) ────────────────────────────────────────────────
// Decouples enqueue (e.g. inside an SMP commit transaction or a bulk reissue)
// from delivery (rate-limited, retried). The outbox worker drains rows in
// `FOR UPDATE SKIP LOCKED` claims; on success stamps sent_at, on transient
// failure increments attempts, after 5 attempts stamps dead_letter_at.
export const smsOutbox = pgTable(
  "sms_outbox",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    recipientPhone: varchar("recipient_phone", { length: 20 }).notNull(),
    kind: smsOutboxKindEnum("kind").notNull(),
    payload: jsonb("payload").notNull(),
    candidateId: varchar("candidate_id").references(() => candidates.id, {
      onDelete: "set null",
    }),
    dedupeKey: varchar("dedupe_key", { length: 100 }),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    sentAt: timestamp("sent_at"),
    deadLetterAt: timestamp("dead_letter_at"),
    nextAttemptAt: timestamp("next_attempt_at"),
    createdAt: timestamp("created_at").notNull().default(sql`now()`),
  },
  (t) => ({
    pendingIdx: index("sms_outbox_pending_idx")
      .on(t.createdAt)
      .where(sql`sent_at IS NULL AND dead_letter_at IS NULL`),
    // Worker-oriented partial index. Matches the drainSmsOutbox claim
    // predicate (sent_at IS NULL AND dead_letter_at IS NULL AND
    // (next_attempt_at IS NULL OR next_attempt_at <= now())) so the
    // "smallest pending row that is due now" lookup stays a single
    // index scan as the queue grows. Backed by the boot-migrate
    // ensureSmsOutboxNextAttempt for environments where drizzle-kit
    // push has not yet run.
    pendingDueIdx: index("sms_outbox_pending_due_idx")
      .on(t.nextAttemptAt, t.createdAt)
      .where(sql`sent_at IS NULL AND dead_letter_at IS NULL`),
    dedupeIdx: uniqueIndex("sms_outbox_dedupe_idx").on(t.dedupeKey),
    candidateIdx: index("sms_outbox_candidate_idx").on(t.candidateId),
  })
);

// ─── Events ─────────────────────────────────────────────────────────────────
export const eventTypeEnum = pgEnum("event_type", ["duration_based", "ongoing"]);

export const events = pgTable(
  "events",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    description: text("description"),
    eventType: eventTypeEnum("event_type").notNull().default("duration_based"),
    startDate: text("start_date").notNull(),
    endDate: text("end_date"),
    status: eventStatusEnum("status").notNull().default("upcoming"),
    targetHeadcount: integer("target_headcount").notNull().default(0),
    // NOTE: filled_positions column was removed in Task #64. Filled
    // headcount is now always computed from the workforce table via
    // server/headcount.ts (single source of truth) and attached to event
    // payloads at read time as `filledPositions: number`.
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

// ─── SMP Companies (master entity) ──────────────────────────────────────────
export const smpCompanies = pgTable(
  "smp_companies",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    crNumber: varchar("cr_number", { length: 50 }),
    contactPerson: text("contact_person"),
    contactPhone: text("contact_phone"),
    contactEmail: text("contact_email"),
    bankName: text("bank_name"),
    bankIban: varchar("bank_iban", { length: 34 }),
    region: text("region"),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
  },
  (t) => ({
    nameIdx: index("smp_companies_name_idx").on(t.name),
    crNumberIdx: uniqueIndex("smp_companies_cr_number_idx").on(t.crNumber),
    activeIdx: index("smp_companies_active_idx").on(t.isActive),
    // Task #107: case-insensitive uniqueness so the bulk-upload company
    // matcher can lookup by lower(name) and reject ambiguous duplicates.
    lowerNameIdx: uniqueIndex("smp_companies_lower_name_idx")
      .on(sql`lower(${t.name})`),
  })
);

// ─── SMP Documents (document vault per company) ──────────────────────────────
export const smpDocuments = pgTable(
  "smp_documents",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    smpCompanyId: varchar("smp_company_id").notNull().references(() => smpCompanies.id, { onDelete: "cascade" }),
    fileUrl: text("file_url").notNull(),
    fileName: text("file_name").notNull(),
    description: text("description"),
    eventId: varchar("event_id").references(() => events.id, { onDelete: "set null" }),
    uploadedAt: timestamp("uploaded_at").notNull().default(sql`now()`),
    uploadedBy: varchar("uploaded_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => ({
    companyIdx: index("smp_documents_company_idx").on(t.smpCompanyId),
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
    description: text("description"),
    requirements: text("requirements"),
    location: text("location"),
    region: text("region"),
    department: text("department"),
    type: text("type").notNull().default("seasonal_full_time"),
    salaryMin: decimal("salary_min", { precision: 10, scale: 2 }),
    salaryMax: decimal("salary_max", { precision: 10, scale: 2 }),
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
    // Archive lifecycle: only completed interviews can be archived (the cancel
    // action is reserved for not-yet-finished sessions). Archived rows are
    // hidden from the default list and stats but kept for audit. Mirrors the
    // events / candidates / workforce archive pattern.
    archivedAt: timestamp("archived_at"),
    createdAt: timestamp("created_at").notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
  },
  (t) => ({
    eventIdx: index("interviews_event_idx").on(t.eventId),
    candidateIdx: index("interviews_candidate_idx").on(t.candidateId),
    scheduledAtIdx: index("interviews_scheduled_at_idx").on(t.scheduledAt),
    statusIdx: index("interviews_status_idx").on(t.status),
    archivedAtIdx: index("interviews_archived_at_idx").on(t.archivedAt),
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
    hasVaccinationReport: boolean("has_vaccination_report").notNull().default(false),
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
    // Task #214 — document-upload reminders
    lastReminderSentAt: timestamp("last_reminder_sent_at"),
    reminderCount: integer("reminder_count").notNull().default(0),
    finalWarningSentAt: timestamp("final_warning_sent_at"),
    remindersPausedAt: timestamp("reminders_paused_at"),
    eliminatedAt: timestamp("eliminated_at"),
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
    // SMP company snapshot — set at deployment, nullable for individual workers
    smpCompanyId: varchar("smp_company_id").references(() => smpCompanies.id, { onDelete: "set null" }),
    positionId: varchar("position_id").references(() => positions.id, { onDelete: "set null" }),
    employmentType: employmentTypeEnum("employment_type").notNull().default("individual"),
    salary: decimal("salary", { precision: 10, scale: 2 }),
    startDate: text("start_date").notNull(),
    endDate: text("end_date"),
    terminationReason: text("termination_reason"),
    terminationCategory: text("termination_category"),
    isActive: boolean("is_active").notNull().default(true),
    supervisorId: varchar("supervisor_id").references(() => users.id),
    performanceScore: decimal("performance_score", { precision: 3, scale: 2 }),
    notes: text("notes"),
    offboardingStatus: text("offboarding_status"), // "in_progress" | "completed" | null
    offboardingStartedAt: timestamp("offboarding_started_at"),
    offboardingCompletedAt: timestamp("offboarding_completed_at"),
    finalGrossPay: decimal("final_gross_pay", { precision: 12, scale: 2 }),
    finalDeductions: decimal("final_deductions", { precision: 12, scale: 2 }),
    finalNetSettlement: decimal("final_net_settlement", { precision: 12, scale: 2 }),
    settlementPaidAt: timestamp("settlement_paid_at"),
    settlementPaidBy: text("settlement_paid_by"),
    settlementReference: text("settlement_reference"),
    paymentMethod: text("payment_method").notNull().default("bank_transfer"),
    paymentMethodReason: text("payment_method_reason"),
    paymentMethodSetBy: text("payment_method_set_by"),
    paymentMethodSetAt: timestamp("payment_method_set_at"),
    createdAt: timestamp("created_at").notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
  },
  (t) => ({
    candidateIdx: index("workforce_candidate_idx").on(t.candidateId),
    eventIdx: index("workforce_event_idx").on(t.eventId),
    activeIdx: index("workforce_active_idx").on(t.isActive),
    empNumIdx: uniqueIndex("workforce_emp_num_unique_idx").on(t.employeeNumber),
    offboardingIdx: index("workforce_offboarding_idx").on(t.offboardingStatus),
    // Task #64 — partial index supporting the headcount Golden Rule.
    // Keeps the events-list count step cheap at the 10K-worker scale
    // (Task #37). Matches activeWorkforceFilter() in server/headcount.ts.
    eventActiveIdx: index("workforce_event_active_idx")
      .on(t.eventId)
      .where(sql`is_active = true AND offboarding_status IS NULL`),
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
  // Stored as HMAC-SHA256 hex (64 chars), never plaintext. See server/otp-hash.ts.
  code: text("code").notNull(),
  // Binds the OTP to its issuance flow so a code minted for password reset
  // can never satisfy a registration check, and vice versa.
  purpose: text("purpose").notNull().default("registration"),
  expiresAt: timestamp("expires_at").notNull(),
  attempts: integer("attempts").notNull().default(0),
  verifiedAt: timestamp("verified_at"),
  usedForRegistration: boolean("used_for_registration").notNull().default(false),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// ─── Insert Schemas (Zod) ───────────────────────────────────────────────────
import { optionalSaPhoneSchema, optionalContactPhoneSchema } from "./phone";

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastLogin: true,
}).extend({
  phone: optionalSaPhoneSchema,
});

// Task #120 — refuse malformed IBANs at the API boundary so non-browser
// callers (curl, mobile imports) cannot persist garbage. Format check
// (SA + 22 digits, whitespace tolerated) plus the bank's own mod-97
// checksum (Task #123) so a typo that swaps two digits is rejected at
// API time instead of bouncing later from the bank. The storage layer
// additionally canonicalises and auto-fills bank name/code via
// server/lib/iban.ts.
function ibanMod97(clean: string): boolean {
  if (clean.length < 5) return false;
  const rearranged = clean.slice(4) + clean.slice(0, 4);
  let numeric = "";
  for (const ch of rearranged) {
    const code = ch.charCodeAt(0);
    if (code >= 48 && code <= 57) numeric += ch;
    else if (code >= 65 && code <= 90) numeric += (code - 55).toString();
    else return false;
  }
  let remainder = 0;
  for (let i = 0; i < numeric.length; i += 7) {
    remainder = Number(remainder.toString() + numeric.slice(i, i + 7)) % 97;
  }
  return remainder === 1;
}

const ibanFormatSchema = z
  .string()
  .nullable()
  .optional()
  .refine(
    (v) => {
      if (v === null || v === undefined) return true;
      const clean = v.replace(/\s+/g, "").toUpperCase();
      if (clean === "") return true;
      return /^SA\d{22}$/.test(clean);
    },
    { message: "Invalid IBAN: must start with SA followed by 22 digits" },
  )
  .refine(
    (v) => {
      if (v === null || v === undefined) return true;
      const clean = v.replace(/\s+/g, "").toUpperCase();
      if (clean === "") return true;
      if (!/^SA\d{22}$/.test(clean)) return true; // first refine reports format
      return ibanMod97(clean);
    },
    { message: "Invalid IBAN: failed bank checksum check (likely a typo)" },
  );

// Snapchat-pollution defence — fullNameEn must be a real human name, not
// an emoji-laden Snapchat display name. Mirrors `sanitizeHumanName` in
// `shared/name-sanitizer.ts` so curl / mobile / bulk callers can't bypass
// the apply-form sanitation. We accept the name *only after* sanitation
// strips emoji + Unicode mathematical-bold pseudo-Latin + control chars
// and confirms the residue is a real letter-bearing string.
// (sanitizeHumanName imported at the top of the file alongside other
// shared helpers — kept here in a comment for context.)
const fullNameEnSchema = z
  .string({ required_error: "Full name is required" })
  .transform((v, ctx) => {
    const r = sanitizeHumanName(v);
    if (!r.ok) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          r.reason === "too_short"
            ? "Full name is too short (minimum 2 letters)"
            : r.reason === "too_long"
              ? "Full name is too long (maximum 80 characters)"
              : r.reason === "no_letters"
                ? "Full name must contain letters, not only symbols or emoji"
                : "Full name is required",
      });
      return z.NEVER;
    }
    return r.canonical;
  });

// Task #137 — IBAN holder name (account first/last name) must be English-only.
// These names go straight onto payroll wire transfers and Saudi banks reject
// the wire when the beneficiary name contains non-Latin characters that don't
// match the name on the account. Mirrors `validateIbanHolderName` in
// server/lib/iban.ts so the rule cannot drift between client/server.
const IBAN_HOLDER_NAME_MAX_LEN_SHARED = 64;
const IBAN_HOLDER_NAME_RE_SHARED = /^[A-Za-z][A-Za-z\s\-'.]*$/;
const ibanHolderNameSchema = z
  .string()
  .nullable()
  .optional()
  .refine(
    (v) => {
      if (v === null || v === undefined) return true;
      const collapsed = v.replace(/\s+/g, " ").trim();
      if (collapsed === "") return true; // empty = clear; required-ness handled separately
      if (collapsed.length > IBAN_HOLDER_NAME_MAX_LEN_SHARED) return false;
      return IBAN_HOLDER_NAME_RE_SHARED.test(collapsed);
    },
    {
      message:
        "IBAN holder name must contain English letters only (A-Z, a-z, space, hyphen, apostrophe, period) and be at most 64 characters",
    },
  );

// Base candidate-insert schema as a pure ZodObject so callers can still
// use ZodObject-only methods like `.partial()` (used by PATCH routes).
// The cross-field "same-value" defences live in `insertCandidateSchema`
// below as a `superRefine`, which would otherwise turn this into a
// ZodEffects and break `.partial()` at runtime — the cause of the
// `xc.partial is not a function` 500 from PATCH /api/candidates/:id.
export const candidateBaseSchema = createInsertSchema(candidates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  phone: optionalSaPhoneSchema,
  emergencyContactPhone: optionalContactPhoneSchema,
  ibanNumber: ibanFormatSchema,
  ibanAccountFirstName: ibanHolderNameSchema,
  ibanAccountLastName: ibanHolderNameSchema,
  // Snapchat-pollution defence — apply form + every other write path runs
  // every value of `fullNameEn` through the sanitiser before it reaches
  // the DB. Required (notNull on the column) so we keep the .pipe() chain
  // tight: outer .string() rejects undefined, sanitiser handles content.
  fullNameEn: fullNameEnSchema,
});

export const insertCandidateSchema = candidateBaseSchema.superRefine((d, ctx) => {
  // Snapchat-pollution defence — Snapchat's in-app browser autofills the
  // same phone into both the personal-phone and emergency-phone tel
  // inputs. We surface a hard validation error so the caller has to fix
  // it instead of silently storing one phone twice (we observed 239
  // such rows in a single day from one campaign).
  if (
    d.phone &&
    d.emergencyContactPhone &&
    String(d.phone).replace(/\D/g, "") ===
      String(d.emergencyContactPhone).replace(/\D/g, "")
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["emergencyContactPhone"],
      message:
        "Emergency contact phone cannot be the same as your personal phone — please provide a different number",
    });
  }
  // Same defence for the holder-name fields. If the candidate typed
  // their own name as the emergency contact name (autofill or "I have
  // nobody else"), we'd lose the safety-net the field exists to provide.
  if (
    d.fullNameEn &&
    d.emergencyContactName &&
    String(d.fullNameEn).trim().toLowerCase() ===
      String(d.emergencyContactName).trim().toLowerCase()
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["emergencyContactName"],
      message:
        "Emergency contact name cannot be the same as your own name — please provide a different person",
    });
  }
});

export const insertEventSchema = createInsertSchema(events).omit({
  id: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  endDate: z.string().optional().nullable(),
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
  // archivedAt is a lifecycle field. It must only be settable via the
  // dedicated archive endpoint (gated by `interviews:archive`); allowing
  // it through the generic create/update payload would let any caller
  // with `interviews:update` archive or — worse — un-archive interviews,
  // bypassing the permission split.
  archivedAt: true,
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

// Task #107
export const insertCandidateActivationTokenSchema = createInsertSchema(candidateActivationTokens).omit({
  id: true,
  createdAt: true,
  consumedAt: true,
  invalidatedAt: true,
  smsSentAt: true,
});
export type InsertCandidateActivationToken = z.infer<typeof insertCandidateActivationTokenSchema>;
export type CandidateActivationToken = typeof candidateActivationTokens.$inferSelect;

export const insertSmsOutboxSchema = createInsertSchema(smsOutbox).omit({
  id: true,
  createdAt: true,
  sentAt: true,
  deadLetterAt: true,
  attempts: true,
  lastError: true,
});
export type InsertSmsOutbox = z.infer<typeof insertSmsOutboxSchema>;
export type SmsOutboxRow = typeof smsOutbox.$inferSelect;

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

export const insertSMPCompanySchema = createInsertSchema(smpCompanies)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    contactPhone: optionalSaPhoneSchema,
  });
export type InsertSMPCompany = z.infer<typeof insertSMPCompanySchema>;
export type SMPCompany = typeof smpCompanies.$inferSelect;

export const insertSMPDocumentSchema = createInsertSchema(smpDocuments).omit({
  id: true,
  uploadedAt: true,
});
export type InsertSMPDocument = z.infer<typeof insertSMPDocumentSchema>;
export type SMPDocument = typeof smpDocuments.$inferSelect;

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
    nameVersionIdx: uniqueIndex("ct_name_version_idx").on(t.name, t.version),
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

// ─── Work Schedules & Shifts ─────────────────────────────────────────────────
export const attendanceStatusEnum = pgEnum("attendance_status", [
  "present",
  "absent",
  "late",
  "excused",
]);

export const attendanceSourceEnum = pgEnum("attendance_source", [
  "manual",
  "mobile",
]);

export const shifts = pgTable(
  "shifts",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    startTime: text("start_time").notNull(),
    endTime: text("end_time").notNull(),
    color: text("color").notNull().default("#10b981"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
  }
);

export const scheduleTemplates = pgTable(
  "schedule_templates",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    eventId: varchar("event_id").references(() => events.id, { onDelete: "set null" }),
    mondayShiftId: varchar("monday_shift_id").references(() => shifts.id, { onDelete: "set null" }),
    tuesdayShiftId: varchar("tuesday_shift_id").references(() => shifts.id, { onDelete: "set null" }),
    wednesdayShiftId: varchar("wednesday_shift_id").references(() => shifts.id, { onDelete: "set null" }),
    thursdayShiftId: varchar("thursday_shift_id").references(() => shifts.id, { onDelete: "set null" }),
    fridayShiftId: varchar("friday_shift_id").references(() => shifts.id, { onDelete: "set null" }),
    saturdayShiftId: varchar("saturday_shift_id").references(() => shifts.id, { onDelete: "set null" }),
    sundayShiftId: varchar("sunday_shift_id").references(() => shifts.id, { onDelete: "set null" }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
  },
  (t) => ({
    eventIdx: index("schedule_templates_event_idx").on(t.eventId),
  })
);

export const scheduleAssignments = pgTable(
  "schedule_assignments",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    workforceId: varchar("workforce_id").notNull().references(() => workforce.id, { onDelete: "cascade" }),
    templateId: varchar("template_id").notNull().references(() => scheduleTemplates.id, { onDelete: "restrict" }),
    startDate: text("start_date").notNull(),
    endDate: text("end_date"),
    notes: text("notes"),
    assignedBy: varchar("assigned_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
  },
  (t) => ({
    workforceIdx: index("schedule_assignments_workforce_idx").on(t.workforceId),
    templateIdx: index("schedule_assignments_template_idx").on(t.templateId),
    startDateIdx: index("schedule_assignments_start_date_idx").on(t.startDate),
  })
);

export const attendanceRecords = pgTable(
  "attendance_records",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    workforceId: varchar("workforce_id").notNull().references(() => workforce.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    status: attendanceStatusEnum("status").notNull(),
    clockIn: text("clock_in"),
    clockOut: text("clock_out"),
    minutesScheduled: integer("minutes_scheduled"),
    minutesWorked: integer("minutes_worked"),
    notes: text("notes"),
    source: attendanceSourceEnum("source").notNull().default("manual"),
    recordedBy: varchar("recorded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
  },
  (t) => ({
    workforceIdx: index("attendance_records_workforce_idx").on(t.workforceId),
    dateIdx: index("attendance_records_date_idx").on(t.date),
    workforceDateIdx: uniqueIndex("attendance_records_workforce_date_idx").on(t.workforceId, t.date),
  })
);

export const insertShiftSchema = createInsertSchema(shifts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertShift = z.infer<typeof insertShiftSchema>;
export type Shift = typeof shifts.$inferSelect;

export const insertScheduleTemplateSchema = createInsertSchema(scheduleTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertScheduleTemplate = z.infer<typeof insertScheduleTemplateSchema>;
export type ScheduleTemplate = typeof scheduleTemplates.$inferSelect;

export const insertScheduleAssignmentSchema = createInsertSchema(scheduleAssignments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertScheduleAssignment = z.infer<typeof insertScheduleAssignmentSchema>;
export type ScheduleAssignment = typeof scheduleAssignments.$inferSelect;

export const insertAttendanceRecordSchema = createInsertSchema(attendanceRecords).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAttendanceRecord = z.infer<typeof insertAttendanceRecordSchema>;
export type AttendanceRecord = typeof attendanceRecords.$inferSelect;

// ─── Assets ─────────────────────────────────────────────────────────────────
export const assets = pgTable(
  "assets",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    description: text("description"),
    category: text("category"),
    price: decimal("price", { precision: 10, scale: 2 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
  },
  (t) => ({
    nameIdx: index("assets_name_idx").on(t.name),
  })
);

export const employeeAssetStatusEnum = pgEnum("employee_asset_status", [
  "assigned",
  "returned",
  "not_returned",
]);

export const employeeAssets = pgTable(
  "employee_assets",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    assetId: varchar("asset_id")
      .notNull()
      .references(() => assets.id),
    workforceId: varchar("workforce_id")
      .notNull()
      .references(() => workforce.id),
    assignedAt: text("assigned_at").notNull(),
    returnedAt: text("returned_at"),
    status: employeeAssetStatusEnum("status").notNull().default("assigned"),
    notes: text("notes"),
    confirmedAt: timestamp("confirmed_at"),
    confirmedBy: varchar("confirmed_by"),
    deductionWaived: boolean("deduction_waived"), // null=undecided, true=waived (non-deductible), false=will deduct
    deductionWaivedBy: varchar("deduction_waived_by"),
    deductionWaivedAt: timestamp("deduction_waived_at"),
    createdAt: timestamp("created_at").notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
  },
  (t) => ({
    assetIdx: index("employee_assets_asset_idx").on(t.assetId),
    workforceIdx: index("employee_assets_workforce_idx").on(t.workforceId),
    statusIdx: index("employee_assets_status_idx").on(t.status),
  })
);

export const insertAssetSchema = createInsertSchema(assets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAsset = z.infer<typeof insertAssetSchema>;
export type Asset = typeof assets.$inferSelect;

export const insertEmployeeAssetSchema = createInsertSchema(employeeAssets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertEmployeeAsset = z.infer<typeof insertEmployeeAssetSchema>;
export type EmployeeAsset = typeof employeeAssets.$inferSelect;

// ─── Audit Logs ─────────────────────────────────────────────────────────────
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    actorId: varchar("actor_id").references(() => users.id, { onDelete: "set null" }),
    actorName: varchar("actor_name", { length: 255 }),
    action: varchar("action", { length: 100 }).notNull(),
    entityType: varchar("entity_type", { length: 50 }),
    entityId: varchar("entity_id"),
    employeeNumber: varchar("employee_number", { length: 50 }),
    subjectName: varchar("subject_name", { length: 255 }),
    description: text("description").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    createdAtIdx: index("audit_logs_created_at_idx").on(t.createdAt),
    actorIdx: index("audit_logs_actor_idx").on(t.actorId),
    entityTypeIdx: index("audit_logs_entity_type_idx").on(t.entityType),
  })
);
export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, createdAt: true });
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;

// ─── RBAC: Roles, Permissions, Role-Permissions ─────────────────────────────
export const roles = pgTable(
  "roles",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    name: text("name").notNull().unique(),
    slug: varchar("slug", { length: 64 }).notNull().unique(),
    description: text("description"),
    color: varchar("color", { length: 16 }),
    isSystem: boolean("is_system").notNull().default(false),
    createdAt: timestamp("created_at").notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
  },
  (t) => ({
    slugIdx: uniqueIndex("roles_slug_idx").on(t.slug),
  })
);

export const permissions = pgTable(
  "permissions",
  {
    key: varchar("key", { length: 80 }).primaryKey(),
    resource: varchar("resource", { length: 40 }).notNull(),
    action: varchar("action", { length: 40 }).notNull(),
    description: text("description").notNull(),
    category: varchar("category", { length: 64 }).notNull(),
  },
  (t) => ({
    categoryIdx: index("permissions_category_idx").on(t.category),
  })
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: varchar("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
    permissionKey: varchar("permission_key", { length: 80 }).notNull().references(() => permissions.key, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().default(sql`now()`),
  },
  (t) => ({
    pk: uniqueIndex("role_permissions_pk").on(t.roleId, t.permissionKey),
    roleIdx: index("role_permissions_role_idx").on(t.roleId),
    permIdx: index("role_permissions_perm_idx").on(t.permissionKey),
  })
);

export const insertRoleSchema = createInsertSchema(roles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertPermissionSchema = createInsertSchema(permissions);
export const insertRolePermissionSchema = createInsertSchema(rolePermissions).omit({
  createdAt: true,
});
export type InsertRole = z.infer<typeof insertRoleSchema>;
export type Role = typeof roles.$inferSelect;
export type Permission = typeof permissions.$inferSelect;
export type InsertPermission = z.infer<typeof insertPermissionSchema>;
export type RolePermission = typeof rolePermissions.$inferSelect;

// ─── Inbox Items ─────────────────────────────────────────────────────────────
export const inboxItemTypeEnum = pgEnum("inbox_item_type", [
  "document_review",
  "document_reupload",
  "application_review",
  "onboarding_action",
  "contract_action",
  "offboarding_action",
  "schedule_conflict",
  "asset_return",
  "candidate_flag",
  "event_alert",
  "attendance_verification",
  "photo_change_request",
  "excuse_request",
  "general_request",
  "system",
]);

export const inboxItemPriorityEnum = pgEnum("inbox_item_priority", [
  "low",
  "medium",
  "high",
  "urgent",
]);

export const inboxItemStatusEnum = pgEnum("inbox_item_status", [
  "pending",
  "resolved",
  "dismissed",
]);

export const inboxItems = pgTable("inbox_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: inboxItemTypeEnum("type").notNull(),
  priority: inboxItemPriorityEnum("priority").notNull().default("medium"),
  status: inboxItemStatusEnum("status").notNull().default("pending"),
  title: text("title").notNull(),
  body: text("body"),
  entityType: varchar("entity_type", { length: 64 }),
  entityId: varchar("entity_id", { length: 128 }),
  actionUrl: text("action_url"),
  assignedTo: varchar("assigned_to", { length: 128 }),
  resolvedBy: varchar("resolved_by", { length: 128 }),
  resolvedAt: timestamp("resolved_at"),
  resolutionNotes: text("resolution_notes"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  statusIdx: index("inbox_items_status_idx").on(t.status),
  typeIdx: index("inbox_items_type_idx").on(t.type),
  priorityIdx: index("inbox_items_priority_idx").on(t.priority),
  createdAtIdx: index("inbox_items_created_at_idx").on(t.createdAt),
  entityIdx: index("inbox_items_entity_idx").on(t.entityType, t.entityId),
}));

export const insertInboxItemSchema = createInsertSchema(inboxItems).omit({ id: true, createdAt: true, resolvedAt: true, resolvedBy: true, resolutionNotes: true });
export type InsertInboxItem = z.infer<typeof insertInboxItemSchema>;
export type InboxItem = typeof inboxItems.$inferSelect;

// ─── Geofence Zones ──────────────────────────────────────────────────────────
export const geofenceZones = pgTable(
  "geofence_zones",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    centerLat: decimal("center_lat", { precision: 10, scale: 7 }).notNull(),
    centerLng: decimal("center_lng", { precision: 10, scale: 7 }).notNull(),
    radiusMeters: integer("radius_meters").notNull().default(500),
    polygon: jsonb("polygon"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
  },
  (t) => ({
    activeIdx: index("geofence_zones_active_idx").on(t.isActive),
  })
);

export const insertGeofenceZoneSchema = createInsertSchema(geofenceZones).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertGeofenceZone = z.infer<typeof insertGeofenceZoneSchema>;
export type GeofenceZone = typeof geofenceZones.$inferSelect;

// ─── Attendance Submissions (Mobile Middleware Queue) ─────────────────────────
export const submissionStatusEnum = pgEnum("submission_status", [
  "pending",
  "verified",
  "flagged",
  "rejected",
]);

export const attendanceSubmissions = pgTable(
  "attendance_submissions",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    workforceId: varchar("workforce_id").notNull().references(() => workforce.id, { onDelete: "cascade" }),
    photoUrl: text("photo_url").notNull(),
    gpsLat: decimal("gps_lat", { precision: 10, scale: 7 }).notNull(),
    gpsLng: decimal("gps_lng", { precision: 10, scale: 7 }).notNull(),
    gpsAccuracy: decimal("gps_accuracy", { precision: 8, scale: 2 }),
    submittedAt: timestamp("submitted_at").notNull().default(sql`now()`),
    status: submissionStatusEnum("status").notNull().default("pending"),
    rekognitionConfidence: decimal("rekognition_confidence", { precision: 5, scale: 2 }),
    gpsInsideGeofence: boolean("gps_inside_geofence"),
    matchedGeofenceId: varchar("matched_geofence_id").references(() => geofenceZones.id, { onDelete: "set null" }),
    flagReason: text("flag_reason"),
    verifiedAt: timestamp("verified_at"),
    reviewedBy: varchar("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at"),
    reviewNotes: text("review_notes"),
    linkedAttendanceRecordId: varchar("linked_attendance_record_id").references(() => attendanceRecords.id, { onDelete: "set null" }),
    referencePhotoUrl: text("reference_photo_url"),
    mockLocationDetected: boolean("mock_location_detected"),
    isEmulator: boolean("is_emulator"),
    rootDetected: boolean("root_detected"),
    locationProvider: varchar("location_provider", { length: 32 }),
    deviceFingerprint: text("device_fingerprint"),
    serverReceivedAt: timestamp("server_received_at"),
    ntpTimestamp: timestamp("ntp_timestamp"),
    systemClockTimestamp: timestamp("system_clock_timestamp"),
    lastNtpSyncAt: timestamp("last_ntp_sync_at"),
    locationSource: varchar("location_source", { length: 32 }),
    submissionToken: varchar("submission_token", { length: 64 }),
    createdAt: timestamp("created_at").notNull().default(sql`now()`),
  },
  (t) => ({
    workforceIdx: index("att_sub_workforce_idx").on(t.workforceId),
    statusIdx: index("att_sub_status_idx").on(t.status),
    submittedAtIdx: index("att_sub_submitted_at_idx").on(t.submittedAt),
    submissionTokenIdx: uniqueIndex("att_sub_token_idx").on(t.submissionToken),
  })
);

export const insertAttendanceSubmissionSchema = createInsertSchema(attendanceSubmissions).omit({
  id: true,
  createdAt: true,
  verifiedAt: true,
  reviewedBy: true,
  reviewedAt: true,
  reviewNotes: true,
  linkedAttendanceRecordId: true,
});
export type InsertAttendanceSubmission = z.infer<typeof insertAttendanceSubmissionSchema>;
export type AttendanceSubmission = typeof attendanceSubmissions.$inferSelect;

// ─── Photo Change Requests ────────────────────────────────────────────────────

export const photoChangeStatusEnum = pgEnum("photo_change_status", [
  "pending",
  "approved",
  "rejected",
]);

export const photoChangeRequests = pgTable("photo_change_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  candidateId: varchar("candidate_id").notNull().references(() => candidates.id, { onDelete: "cascade" }),
  newPhotoUrl: text("new_photo_url").notNull(),
  previousPhotoUrl: text("previous_photo_url"),
  status: photoChangeStatusEnum("status").notNull().default("pending"),
  reviewedBy: varchar("reviewed_by").references(() => users.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at"),
  reviewNotes: text("review_notes"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (t) => ({
  candidateIdx: index("photo_change_candidate_idx").on(t.candidateId),
  statusIdx: index("photo_change_status_idx").on(t.status),
}));

export const insertPhotoChangeRequestSchema = createInsertSchema(photoChangeRequests).omit({
  id: true,
  createdAt: true,
  reviewedBy: true,
  reviewedAt: true,
  reviewNotes: true,
});
export type InsertPhotoChangeRequest = z.infer<typeof insertPhotoChangeRequestSchema>;
export type PhotoChangeRequest = typeof photoChangeRequests.$inferSelect;

// ─── SMS Broadcasts ──────────────────────────────────────────────────────────

export const broadcastStatusEnum = pgEnum("broadcast_status", ["sending", "completed", "failed"]);
export const broadcastRecipientStatusEnum = pgEnum("broadcast_recipient_status", ["pending", "sent", "failed"]);

export const smsBroadcasts = pgTable("sms_broadcasts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  messageTemplate: text("message_template").notNull(),
  totalRecipients: integer("total_recipients").notNull().default(0),
  sentCount: integer("sent_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  status: broadcastStatusEnum("status").notNull().default("sending"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (t) => ({
  statusIdx: index("sms_broadcasts_status_idx").on(t.status),
  createdAtIdx: index("sms_broadcasts_created_at_idx").on(t.createdAt),
}));

export const smsBroadcastRecipients = pgTable("sms_broadcast_recipients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  broadcastId: varchar("broadcast_id").notNull().references(() => smsBroadcasts.id, { onDelete: "cascade" }),
  workforceId: varchar("workforce_id").references(() => workforce.id, { onDelete: "set null" }),
  phone: text("phone").notNull(),
  resolvedMessage: text("resolved_message").notNull(),
  recipientName: text("recipient_name"),
  status: broadcastRecipientStatusEnum("status").notNull().default("pending"),
  error: text("error"),
  sentAt: timestamp("sent_at"),
}, (t) => ({
  broadcastIdx: index("sms_br_broadcast_idx").on(t.broadcastId),
  statusIdx: index("sms_br_status_idx").on(t.status),
}));

export const insertSmsBroadcastSchema = createInsertSchema(smsBroadcasts).omit({
  id: true,
  createdAt: true,
  sentCount: true,
  failedCount: true,
});
export type InsertSmsBroadcast = z.infer<typeof insertSmsBroadcastSchema>;
export type SmsBroadcast = typeof smsBroadcasts.$inferSelect;

export const insertSmsBroadcastRecipientSchema = createInsertSchema(smsBroadcastRecipients).omit({
  id: true,
  sentAt: true,
  error: true,
});
export type InsertSmsBroadcastRecipient = z.infer<typeof insertSmsBroadcastRecipientSchema>;
export type SmsBroadcastRecipient = typeof smsBroadcastRecipients.$inferSelect;

// ─── Departments ─────────────────────────────────────────────────────────────

export const departments = pgTable("departments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  code: varchar("code", { length: 20 }).notNull().unique(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (t) => ({
  codeIdx: uniqueIndex("departments_code_idx").on(t.code),
}));

export const insertDepartmentSchema = createInsertSchema(departments).omit({
  id: true,
  createdAt: true,
});
export type InsertDepartment = z.infer<typeof insertDepartmentSchema>;
export type Department = typeof departments.$inferSelect;

// ─── Positions ───────────────────────────────────────────────────────────────

export const positions = pgTable("positions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  departmentId: varchar("department_id").notNull().references(() => departments.id, { onDelete: "restrict" }),
  parentPositionId: varchar("parent_position_id").references((): any => positions.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  code: varchar("code", { length: 20 }).notNull().unique(),
  description: text("description"),
  gradeLevel: integer("grade_level"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (t) => ({
  codeIdx: uniqueIndex("positions_code_idx").on(t.code),
  deptIdx: index("positions_dept_idx").on(t.departmentId),
  parentIdx: index("positions_parent_idx").on(t.parentPositionId),
}));

export const insertPositionSchema = createInsertSchema(positions).omit({
  id: true,
  createdAt: true,
});
export type InsertPosition = z.infer<typeof insertPositionSchema>;
export type Position = typeof positions.$inferSelect;

// ─── Query Params Types ─────────────────────────────────────────────────────
export const candidateQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  // Task #195 — search may be a multi-line/comma/semicolon/tab paste
  // of up to 200 identifiers; cap raw input at 20k chars to avoid
  // pathological payloads while leaving plenty of headroom.
  search: z.string().max(20000).optional(),
  // Task #252 — accepts both the legacy raw enum values (kept so
  // any external/scripted callers don't break) and the new derived
  // display vocabulary used by the talent page filter dropdown
  // (`completed`, `not_activated`, `archived`). The server's
  // `buildCandidateOtherConditions` translates derived values into a
  // WHERE on the shared CASE expression and routes raw values to the
  // legacy `eq(candidates.status, …)` clause. `hired` and `blocked`
  // appear in both vocabularies and resolve identically.
  status: z.enum([
    "available", "active", "inactive", "blocked", "hired", "awaiting_activation",
    "completed", "not_activated", "archived",
  ]).optional(),
  archived: z.enum(["true"]).optional(),
  city: z.string().optional(),
  nationality: z.enum(["saudi", "non_saudi"]).optional(),
  gender: z.enum(["male", "female", "other", "prefer_not_to_say"]).optional(),
  classification: z.enum(["individual", "smp"]).optional(),
  formerEmployee: z.enum(["true"]).optional(),
  sortBy: z.enum(["createdAt", "fullNameEn", "rating", "city", "classification", "phone", "email"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type CandidateQuery = z.infer<typeof candidateQuerySchema>;

// ─── Excuse Requests ──────────────────────────────────────────────────────────
export const excuseRequestStatusEnum = pgEnum("excuse_request_status", [
  "pending",
  "approved",
  "rejected",
]);

export const excuseRequests = pgTable("excuse_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workforceId: varchar("workforce_id").notNull().references(() => workforce.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  reason: text("reason").notNull(),
  attachmentUrl: text("attachment_url"),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
  hadClockIn: boolean("had_clock_in").notNull().default(false),
  effectiveClockOut: text("effective_clock_out"),
  status: excuseRequestStatusEnum("status").notNull().default("pending"),
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  reviewNotes: text("review_notes"),
}, (t) => ({
  workforceIdx: index("excuse_requests_workforce_idx").on(t.workforceId),
  dateIdx: index("excuse_requests_date_idx").on(t.date),
  statusIdx: index("excuse_requests_status_idx").on(t.status),
}));

export const insertExcuseRequestSchema = createInsertSchema(excuseRequests).omit({
  id: true,
  submittedAt: true,
  reviewedBy: true,
  reviewedAt: true,
  reviewNotes: true,
});
export type InsertExcuseRequest = z.infer<typeof insertExcuseRequestSchema>;
export type ExcuseRequest = typeof excuseRequests.$inferSelect;

// ─── Pay Runs ─────────────────────────────────────────────────────────────────
export const payRuns = pgTable("pay_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  eventId: varchar("event_id").references(() => events.id),
  dateFrom: text("date_from").notNull(),
  dateTo: text("date_to").notNull(),
  mode: text("mode").notNull().default("full"),
  splitPercentage: integer("split_percentage"),
  tranche1DepositDate: text("tranche1_deposit_date"),
  tranche2DepositDate: text("tranche2_deposit_date"),
  status: text("status").notNull().default("draft"),
  createdBy: text("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
}, (t) => ({
  eventIdx: index("pay_runs_event_idx").on(t.eventId),
  statusIdx: index("pay_runs_status_idx").on(t.status),
}));

export const insertPayRunSchema = createInsertSchema(payRuns).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPayRun = z.infer<typeof insertPayRunSchema>;
export type PayRun = typeof payRuns.$inferSelect;

// ─── Pay Run Lines ────────────────────────────────────────────────────────────
export const payRunLines = pgTable("pay_run_lines", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  payRunId: varchar("pay_run_id").notNull().references(() => payRuns.id, { onDelete: "cascade" }),
  workforceId: varchar("workforce_id").notNull().references(() => workforce.id),
  candidateId: text("candidate_id").notNull(),
  employeeNumber: text("employee_number").notNull(),
  effectiveDateFrom: text("effective_date_from").notNull(),
  effectiveDateTo: text("effective_date_to").notNull(),
  baseSalary: decimal("base_salary", { precision: 12, scale: 2 }).notNull(),
  totalScheduledMinutes: integer("total_scheduled_minutes").notNull().default(0),
  totalWorkedMinutes: integer("total_worked_minutes").notNull().default(0),
  daysWorked: integer("days_worked").notNull().default(0),
  excusedDays: integer("excused_days").notNull().default(0),
  absentDays: integer("absent_days").notNull().default(0),
  lateMinutes: integer("late_minutes").notNull().default(0),
  adjustedMinutes: integer("adjusted_minutes").notNull().default(0),
  effectiveMinutes: integer("effective_minutes").notNull().default(0),
  perMinuteRate: decimal("per_minute_rate", { precision: 10, scale: 6 }).notNull().default("0"),
  grossEarned: decimal("gross_earned", { precision: 12, scale: 2 }).notNull().default("0"),
  manualAdditions: jsonb("manual_additions").notNull().default(sql`'[]'::jsonb`),
  manualDeductions: jsonb("manual_deductions").notNull().default(sql`'[]'::jsonb`),
  totalManualAdditions: decimal("total_manual_additions", { precision: 12, scale: 2 }).notNull().default("0"),
  totalManualDeductions: decimal("total_manual_deductions", { precision: 12, scale: 2 }).notNull().default("0"),
  absentDeduction: decimal("absent_deduction", { precision: 12, scale: 2 }).notNull().default("0"),
  lateDeduction: decimal("late_deduction", { precision: 12, scale: 2 }).notNull().default("0"),
  assetDeductions: decimal("asset_deductions", { precision: 12, scale: 2 }).notNull().default("0"),
  totalDeductions: decimal("total_deductions", { precision: 12, scale: 2 }).notNull().default("0"),
  netPayable: decimal("net_payable", { precision: 12, scale: 2 }).notNull().default("0"),
  tranche1Amount: decimal("tranche1_amount", { precision: 12, scale: 2 }),
  tranche2Amount: decimal("tranche2_amount", { precision: 12, scale: 2 }),
  tranche1Status: text("tranche1_status").default("pending"),
  tranche2Status: text("tranche2_status"),
  tranche2BlockedReason: text("tranche2_blocked_reason"),
  paymentMethod: text("payment_method").notNull().default("bank_transfer"),
}, (t) => ({
  payRunIdx: index("pay_run_lines_pay_run_idx").on(t.payRunId),
  workforceIdx: index("pay_run_lines_workforce_idx").on(t.workforceId),
  candidateIdx: index("pay_run_lines_candidate_idx").on(t.candidateId),
}));

export type PayRunLine = typeof payRunLines.$inferSelect;

// ─── Payroll Adjustments ──────────────────────────────────────────────────────
export const payrollAdjustments = pgTable("payroll_adjustments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workforceId: varchar("workforce_id").notNull().references(() => workforce.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  originalDeductionMinutes: integer("original_deduction_minutes").notNull().default(0),
  adjustedDeductionMinutes: integer("adjusted_deduction_minutes").notNull().default(0),
  reason: text("reason").notNull(),
  adjustedBy: text("adjusted_by").notNull(),
  adjustedAt: timestamp("adjusted_at").notNull().default(sql`now()`),
}, (t) => ({
  workforceIdx: index("payroll_adj_workforce_idx").on(t.workforceId),
  workforceDateIdx: uniqueIndex("payroll_adj_workforce_date_idx").on(t.workforceId, t.date),
}));

export const insertPayrollAdjustmentSchema = createInsertSchema(payrollAdjustments).omit({
  id: true,
  adjustedAt: true,
});
export type InsertPayrollAdjustment = z.infer<typeof insertPayrollAdjustmentSchema>;
export type PayrollAdjustment = typeof payrollAdjustments.$inferSelect;

// ─── Payroll Transactions ─────────────────────────────────────────────────────
export const payrollTransactions = pgTable("payroll_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  payRunLineId: varchar("pay_run_line_id").notNull().references(() => payRunLines.id, { onDelete: "cascade" }),
  workforceId: varchar("workforce_id").notNull().references(() => workforce.id),
  candidateId: text("candidate_id").notNull(),
  trancheNumber: integer("tranche_number").notNull().default(1),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  paymentMethod: text("payment_method").notNull().default("bank_transfer"),
  bankTransactionId: text("bank_transaction_id"),
  ibanUsed: text("iban_used"),
  bankCode: text("bank_code"),
  bankName: text("bank_name"),
  beneficiaryName: text("beneficiary_name"),
  receiptNumber: text("receipt_number"),
  otpVerified: boolean("otp_verified"),
  otpSentTo: text("otp_sent_to"),
  otpVerifiedAt: timestamp("otp_verified_at"),
  manualOverride: boolean("manual_override").notNull().default(false),
  overrideReason: text("override_reason"),
  disbursedBy: text("disbursed_by"),
  depositDate: text("deposit_date").notNull(),
  enteredBy: text("entered_by").notNull(),
  enteredAt: timestamp("entered_at").notNull().default(sql`now()`),
  notes: text("notes"),
}, (t) => ({
  payRunLineIdx: index("payroll_txn_pay_run_line_idx").on(t.payRunLineId),
  workforceIdx: index("payroll_txn_workforce_idx").on(t.workforceId),
  candidateIdx: index("payroll_txn_candidate_idx").on(t.candidateId),
  bankTxnIdx: uniqueIndex("payroll_txn_bank_txn_idx").on(t.bankTransactionId),
}));

export type PayrollTransaction = typeof payrollTransactions.$inferSelect;

// ─── Login rate-limit buckets (Postgres-backed for multi-instance) ─────────
export const loginRateLimitBuckets = pgTable("login_rate_limit_buckets", {
  scope: varchar("scope", { length: 16 }).notNull(),
  key: text("key").notNull(),
  attemptCount: integer("attempt_count").notNull().default(0),
  windowStart: timestamp("window_start").notNull().default(sql`now()`),
  lockedUntil: timestamp("locked_until"),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
}, (t) => ({
  pk: primaryKey({ columns: [t.scope, t.key] }),
  lockedUntilIdx: index("lrlb_locked_until_idx").on(t.lockedUntil),
}));

export type LoginRateLimitBucket = typeof loginRateLimitBuckets.$inferSelect;
