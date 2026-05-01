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
  smpCompanies,
  smpDocuments,
  questionSets,
  smsPlugins,
  otpVerifications,
  idCardTemplates,
  printerPlugins,
  idCardPrintLogs,
  shifts,
  scheduleTemplates,
  scheduleAssignments,
  attendanceRecords,
  type OtpVerification,
  type InsertOtpVerification,
  type IdCardTemplate,
  type InsertIdCardTemplate,
  type PrinterPlugin,
  type InsertPrinterPlugin,
  type IdCardPrintLog,
  type InsertIdCardPrintLog,
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
  type SMPCompany,
  type InsertSMPCompany,
  type SMPDocument,
  type InsertSMPDocument,
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
  systemSettings,
  type Shift,
  type InsertShift,
  type ScheduleTemplate,
  type InsertScheduleTemplate,
  type ScheduleAssignment,
  type InsertScheduleAssignment,
  type AttendanceRecord,
  type InsertAttendanceRecord,
  assets,
  employeeAssets,
  type Asset,
  type InsertAsset,
  type EmployeeAsset,
  type InsertEmployeeAsset,
  auditLogs,
  roles,
  permissions,
  rolePermissions,
  type Role,
  type InsertRole,
  type Permission,
  type AuditLog,
  type InsertAuditLog,
  inboxItems,
  type InboxItem,
  type InsertInboxItem,
  geofenceZones,
  attendanceSubmissions,
  type GeofenceZone,
  type InsertGeofenceZone,
  type AttendanceSubmission,
  type InsertAttendanceSubmission,
  photoChangeRequests,
  type PhotoChangeRequest,
  type InsertPhotoChangeRequest,
  departments,
  positions,
  type Department,
  type InsertDepartment,
  type Position,
  type InsertPosition,
  smsBroadcasts,
  smsBroadcastRecipients,
  type SmsBroadcast,
  type InsertSmsBroadcast,
  type SmsBroadcastRecipient,
  type InsertSmsBroadcastRecipient,
  excuseRequests,
  type ExcuseRequest,
  type InsertExcuseRequest,
  payRuns,
  payRunLines,
  payrollAdjustments,
  payrollTransactions,
  type PayRun,
  type InsertPayRun,
  type PayRunLine,
  type PayrollAdjustment,
  type InsertPayrollAdjustment,
  type PayrollTransaction,
} from "@shared/schema";
import { eq, and, or, not, ilike, desc, asc, count, sql, inArray, lt, isNull, isNotNull, gte, getTableColumns, type SQL } from "drizzle-orm";
import { parseSearchTokens, looksLikeId, type CandidateSearchMeta } from "@shared/candidate-search";
import { DISPLAY_STATUS_SQL, type DisplayStatus } from "@shared/candidate-status";
import { countFilledForEvent, countFilledForEvents, activeWorkforceFilter } from "./headcount";
import { applyServerIbanFields, applyServerIbanHolderNameFields } from "./lib/iban";

// Task #252 — drop-in SQL fragment that mirrors `computeDisplayStatus`.
// We embed via `sql.raw` because the body is a static literal (no
// user-supplied substrings; the column references are the canonical
// `candidates.<col>` names from the schema). Using `sql.raw` avoids
// every Drizzle parameter slot, so the planner sees a plain CASE
// expression and can use the existing single-column indexes on
// status / archived_at / created_at.
const DISPLAY_STATUS_EXPR = sql.raw(`(${DISPLAY_STATUS_SQL.trim()})`);

function computeCandidateStatusFromLogin(lastLoginAt: Date | null): "available" | "inactive" {
  if (!lastLoginAt) return "inactive";
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  return lastLoginAt >= oneYearAgo ? "available" : "inactive";
}

export type ApplicationCandidateSummary = {
  id: string;
  fullNameEn: string;
  nationalId: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  nationality: string | null;
  gender: "male" | "female" | "other" | "prefer_not_to_say" | null;
  photoUrl: string | null;
  // Doc-presence flags + lifecycle fields used by the onboarding admit
  // dialog so it can render eligible candidates (those with shortlisted
  // applications) without round-tripping to a separately paginated
  // /api/candidates list. Without these, a tenant with more than 1000
  // candidates loses access to anyone whose id falls past the paginated
  // candidates window — even when their application is freshly liked.
  hasPhoto: boolean | null;
  hasIban: boolean | null;
  hasNationalId: boolean | null;
  classification: "individual" | "smp" | null;
  status:
    | "available"
    | "active"
    | "inactive"
    | "blocked"
    | "hired"
    | "awaiting_activation"
    | "pending_profile"
    | null;
  archivedAt: Date | null;
};

export type ApplicationWithCandidate = Application & {
  candidate?: ApplicationCandidateSummary | null;
};

export interface IStorage {
  // Global Search
  globalSearch(query: string): Promise<{
    candidates: { id: string; title: string; subtitle: string; href: string }[];
    employees: { id: string; title: string; subtitle: string; href: string }[];
    events: { id: string; title: string; subtitle: string; href: string }[];
    jobs: { id: string; title: string; subtitle: string; href: string }[];
  }>;

  // Audit Logs
  createAuditLog(data: InsertAuditLog, tx?: any): Promise<AuditLog>;
  getAuditLogs(params?: { page?: number; limit?: number; search?: string; entityType?: string; actorId?: string }): Promise<{ data: AuditLog[]; total: number }>;
  getAuditLogsCursor(params: { cursor?: string; limit: number; search?: string; entityType?: string; actorId?: string }): Promise<{ data: AuditLog[]; total: number; nextCursor: string | null }>;
  iterateAuditLogsForExport(params: { search?: string; entityType?: string; actorId?: string; chunkSize?: number; maxRows: number }): AsyncGenerator<AuditLog[], void, unknown>;

  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByPhone(phone: string): Promise<User | undefined>;
  getUserByNationalId(nationalId: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined>;
  deleteUser(id: string): Promise<boolean>;

  // Candidates (70k scale)
  getCandidates(query: CandidateQuery): Promise<{ data: Candidate[]; total: number; page: number; limit: number }>;
  getCandidate(id: string): Promise<Candidate | undefined>;
  // Batch summary lookup used by the onboarding pipeline to denormalise
  // candidate display fields onto each row, sidestepping the client's
  // paginated candidates query. The shape mirrors every candidate field
  // the onboarding page reads via getCandidateFor — name + IDs for the
  // card/drawer headers, classification for the SMP branch, archivedAt
  // for filter logic, and the file URL set for the checklist drawer's
  // document previews. Without the file URLs the drawer would render
  // "not submitted" placeholders for every doc on off-page candidates
  // even though the row itself is marked complete.
  getCandidateSummariesByIds(ids: string[]): Promise<Map<string, {
    id: string;
    fullNameEn: string;
    nationalId: string | null;
    phone: string | null;
    email: string | null;
    classification: string;
    archivedAt: Date | null;
    photoUrl: string | null;
    nationalIdFileUrl: string | null;
    ibanFileUrl: string | null;
    ibanNumber: string | null;
    vaccinationReportFileUrl: string | null;
  }>>;
  getCandidateByPhone(phone: string): Promise<Candidate | undefined>;
  getCandidateByNationalId(nationalId: string): Promise<Candidate | undefined>;
  getCandidateByUserId(userId: string): Promise<Candidate | undefined>;
  getCandidateByFileUrl(url: string): Promise<Candidate | undefined>;
  createCandidate(candidate: InsertCandidate): Promise<Candidate>;
  updateCandidate(id: string, data: Partial<InsertCandidate>): Promise<Candidate | undefined>;
  archiveCandidate(id: string): Promise<boolean>;
  unarchiveCandidate(id: string): Promise<boolean>;
  bulkInsertCandidates(candidates: InsertCandidate[]): Promise<{ inserted: number; skipped: number; duplicates: { row: number; nationalId?: string; phone?: string; reason: string }[] }>;
  bulkUpdateCandidateStatus(ids: string[], status: string): Promise<number>;
  bulkArchiveCandidates(ids: string[]): Promise<number>;
  bulkUnarchiveCandidates(ids: string[]): Promise<number>;
  exportCandidates(query?: Partial<CandidateQuery>): Promise<{ headers: string[]; rows: any[][]; total: number }>;
  getCandidateStats(): Promise<{ total: number; active: number; hired: number; blocked: number; avgRating: number }>;

  // Events
  getEvents(params?: { includeArchived?: boolean }): Promise<Event[]>;
  getEvent(id: string): Promise<Event | undefined>;
  createEvent(event: InsertEvent): Promise<Event>;
  updateEvent(id: string, data: Partial<InsertEvent>): Promise<Event | undefined>;
  closeEvent(id: string): Promise<Event | undefined>;
  reopenEvent(id: string): Promise<Event | undefined>;
  archiveEvent(id: string): Promise<Event | undefined>;
  unarchiveEvent(id: string): Promise<Event | undefined>;
  autoCloseExpiredEvents(): Promise<{ count: number; names: string[] }>;
  autoActivateUpcomingEvents(): Promise<{ count: number; names: string[] }>;
  ageOutInactiveCandidates(): Promise<number>;
  sweepStaleAwaitingActivationCandidates(): Promise<number>;
  sweepIncompleteProfilesToPending(): Promise<number>;
  countJobPostingsByEvent(eventId: string): Promise<number>;

  // Job Postings
  getJobPostings(params?: { status?: string; eventId?: string }): Promise<JobPosting[]>;
  getJobPosting(id: string): Promise<JobPosting | undefined>;
  createJobPosting(job: InsertJobPosting): Promise<JobPosting>;
  updateJobPosting(id: string, data: Partial<InsertJobPosting>): Promise<JobPosting | undefined>;
  archiveJobPosting(id: string): Promise<boolean>;
  unarchiveJobPosting(id: string): Promise<boolean>;
  getJobStats(): Promise<{ total: number; active: number; draft: number; filled: number }>;

  // Applications
  getApplications(params?: { jobId?: string; candidateId?: string; status?: string; includeCandidate?: boolean }): Promise<ApplicationWithCandidate[]>;
  getApplicantsForJob(params: { jobId: string; page: number; limit: number; search?: string }): Promise<{ data: { candidateId: string; applicationId: string; fullNameEn: string; nationalId: string | null; applicationStatus: string; appliedAt: Date }[]; total: number; searchMeta?: CandidateSearchMeta }>;
  getApplication(id: string): Promise<Application | undefined>;
  createApplication(app: InsertApplication): Promise<Application>;
  updateApplication(id: string, data: Partial<InsertApplication>, tx?: any): Promise<Application | undefined>;
  getApplicationStats(): Promise<{ total: number; new: number; shortlisted: number; hired: number }>;

  // Interviews
  getInterviews(params?: { status?: string; candidateId?: string; eventId?: string }): Promise<Interview[]>;
  getInterviewsWithDecisionCounts(params?: { status?: string; candidateId?: string; eventId?: string }): Promise<(Interview & { shortlistedCount: number; rejectedCount: number; pendingCount: number })[]>;
  getInterview(id: string): Promise<Interview | undefined>;
  getInterviewDetail(id: string): Promise<{ interview: Interview; invitedCandidates: { id: string; fullNameEn: string; nationalId: string | null; phone: string | null; photoUrl: string | null; applicationId: string | null; applicationStatus: string | null; questionSetId: string | null; questionSetAnswers: Record<string, string> | null }[] } | undefined>;
  createInterview(interview: InsertInterview): Promise<Interview>;
  updateInterview(id: string, data: Partial<InsertInterview>): Promise<Interview | undefined>;
  archiveInterview(id: string): Promise<Interview | undefined>;
  getInterviewStats(): Promise<{ total: number; scheduled: number; completed: number; cancelled: number }>;

  // Workforce (Employees)
  getWorkforce(params?: { eventId?: string; isActive?: boolean; search?: string }): Promise<any[]>;
  getWorkforceEmployee(id: string): Promise<any | undefined>;
  getWorkforceByCandidateId(candidateId: string): Promise<any | undefined>;
  getAllWorkforceByCandidateId(candidateId: string): Promise<any[]>;
  getWorkHistory(nationalId: string): Promise<any[]>;
  getContractHistory(candidateId: string): Promise<any[]>;
  createWorkforceRecord(record: InsertWorkforce): Promise<WorkforceRecord>;
  updateWorkforceRecord(id: string, data: Partial<InsertWorkforce>): Promise<WorkforceRecord | undefined>;
  terminateEmployee(id: string, data: { endDate: string; terminationReason?: string; terminationCategory?: string }): Promise<WorkforceRecord | undefined>;
  reinstateEmployee(nationalId: string, data: { startDate: string; eventId?: string; salary?: string; jobId?: string; employmentType?: "individual" | "smp"; smpCompanyId?: string }): Promise<WorkforceRecord>;
  getWorkforceStats(): Promise<{ total: number; active: number; inOffboarding: number; terminated: number; smpWorkers: number }>;
  generateEmployeeNumber(tx?: any): Promise<string>;

  // Offboarding
  getOffboardingEmployees(): Promise<any[]>;
  getOffboardingStats(): Promise<{ pending: number; inProgress: number; ready: number; completedToday: number }>;
  getOffboardingSettlement(workforceId: string): Promise<any>;
  startOffboarding(workforceId: string, startedBy?: string): Promise<any>;
  completeOffboarding(workforceId: string, completedBy?: string): Promise<any>;
  reassignEmployeeEvent(workforceId: string, eventId: string): Promise<any>;
  confirmAssetReturn(assetId: string, status: "returned" | "not_returned", confirmedBy?: string): Promise<EmployeeAsset>;
  waiveAssetDeduction(assetId: string, waivedBy: string): Promise<EmployeeAsset>;
  bulkConfirmAssets(workforceId: string, status: "returned" | "not_returned", confirmedBy?: string): Promise<number>;
  bulkUpdateAssetStatus(ids: string[], status: "returned" | "not_returned"): Promise<number>;
  bulkAssignAsset(assetId: string, workforceIds: string[], assignedAt: string, notes?: string): Promise<{ created: number; skipped: number }>;

  // Automation Rules
  getAutomationRules(): Promise<AutomationRule[]>;
  updateAutomationRule(id: string, data: Partial<InsertAutomationRule>): Promise<AutomationRule | undefined>;
  createAutomationRule(rule: InsertAutomationRule): Promise<AutomationRule>;

  // Notifications
  getNotifications(params?: { recipientId?: string; status?: string; limit?: number }): Promise<Notification[]>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationRead(id: string): Promise<boolean>;
  getUnreadCount(recipientId: string): Promise<number>;

  // Admin Alerts (broadcast, in-app, recipientId=null)
  getAdminAlerts(limit?: number): Promise<Notification[]>;
  createAdminAlert(subject: string, body: string, metadata?: Record<string, unknown>): Promise<Notification>;
  markAdminAlertRead(id: string): Promise<boolean>;
  markAllAdminAlertsRead(): Promise<number>;
  countUnreadAdminAlerts(): Promise<number>;
  getEventDateAlerts(): Promise<{ starting: Array<{ id: string; name: string; startDate: string; daysAway: number }>; ending: Array<{ id: string; name: string; endDate: string; daysAway: number }> }>;

  // Business Units
  getBusinessUnits(): Promise<BusinessUnit[]>;
  getBusinessUnit(id: string): Promise<BusinessUnit | undefined>;
  createBusinessUnit(data: InsertBusinessUnit): Promise<BusinessUnit>;
  updateBusinessUnit(id: string, data: Partial<InsertBusinessUnit>): Promise<BusinessUnit | undefined>;

  // Users (admin management)
  listUsers(): Promise<User[]>;

  // SMP Documents
  getSMPDocuments(smpCompanyId: string): Promise<SMPDocument[]>;
  createSMPDocument(data: InsertSMPDocument): Promise<SMPDocument>;
  deleteSMPDocument(id: string, smpCompanyId?: string): Promise<boolean>;

  // SMP Companies
  getSMPCompanies(): Promise<SMPCompany[]>;
  getSMPCompany(id: string): Promise<SMPCompany | undefined>;
  createSMPCompany(data: InsertSMPCompany): Promise<SMPCompany>;
  updateSMPCompany(id: string, data: Partial<InsertSMPCompany>): Promise<SMPCompany | undefined>;
  deleteSMPCompany(id: string): Promise<boolean>;
  getSMPCompanyWorkers(smpCompanyId: string): Promise<{
    id: string;
    employeeNumber: string;
    startDate: string | null;
    endDate: string | null;
    isActive: boolean;
    salary: string | null;
    fullNameEn: string | null;
    nationalId: string | null;
    phone: string | null;
    photoUrl: string | null;
    candidateId: string;
  }[]>;

  // Question Sets
  getQuestionSets(): Promise<QuestionSet[]>;
  getQuestionSet(id: string): Promise<QuestionSet | undefined>;
  createQuestionSet(data: InsertQuestionSet): Promise<QuestionSet>;
  updateQuestionSet(id: string, data: Partial<InsertQuestionSet>): Promise<QuestionSet | undefined>;
  deleteQuestionSet(id: string): Promise<boolean>;

  // Onboarding
  getOnboardingRecords(filters?: { status?: string; eventId?: string; search?: string; candidateId?: string }): Promise<OnboardingRecord[]>;
  getAdmitEligibleCandidates(): Promise<{
    id: string;
    fullNameEn: string;
    nationalId: string | null;
    phone: string | null;
    photoUrl: string | null;
    hasPhoto: boolean | null;
    hasIban: boolean | null;
    hasNationalId: boolean | null;
    hasVaccinationReport: boolean | null;
    classification: "individual" | "smp" | null;
    applicationId: string;
    jobId: string | null;
  }[]>;
  getOnboardingRecord(id: string): Promise<OnboardingRecord | undefined>;
  getActiveOnboardingByCandidateId(candidateId: string): Promise<OnboardingRecord | undefined>;
  createOnboardingRecord(data: InsertOnboarding): Promise<OnboardingRecord>;
  admitCandidateToOnboarding(data: InsertOnboarding): Promise<{ ok: true; record: OnboardingRecord } | { ok: false; reason: "duplicate"; existing: OnboardingRecord }>;
  updateOnboardingRecord(id: string, data: Partial<InsertOnboarding>): Promise<OnboardingRecord | undefined>;
  deleteOnboardingRecord(id: string, tx?: any): Promise<boolean>;
  convertOnboardingToEmployee(id: string, employmentData: { startDate: string; eventId?: string; salary?: string; employmentType?: "individual" | "smp"; smpCompanyId?: string }, convertedBy?: string): Promise<WorkforceRecord>;

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
  getOtpVerificationById(id: string): Promise<OtpVerification | undefined>;
  incrementOtpAttempts(id: string): Promise<void>;
  markOtpVerified(id: string): Promise<void>;
  markOtpUsedForRegistration(id: string): Promise<void>;
  countRecentOtpRequests(phone: string, sinceMs: number): Promise<number>;
  tryReserveAndCreateOtpVerification(
    phone: string,
    code: string,
    expiresAt: Date,
    purpose: "registration" | "password_reset",
    max: number,
    sinceMs: number,
  ): Promise<{ ok: true; otp: OtpVerification } | { ok: false }>;
  flagPhoneTransferred(candidateId: string): Promise<void>;

  // Contract Templates
  getContractTemplates(filters?: { eventId?: string; status?: string }): Promise<ContractTemplate[]>;
  getContractTemplate(id: string): Promise<ContractTemplate | undefined>;
  createContractTemplate(data: InsertContractTemplate): Promise<ContractTemplate>;
  createContractTemplateVersion(parent: ContractTemplate, overrides: { articles?: any; createdBy?: string }): Promise<ContractTemplate>;
  updateContractTemplate(id: string, data: Partial<InsertContractTemplate>): Promise<ContractTemplate | undefined>;
  deleteContractTemplate(id: string): Promise<boolean>;

  // Candidate Contracts
  getCandidateContracts(filters?: { candidateId?: string; onboardingId?: string; templateId?: string; status?: string }): Promise<CandidateContract[]>;
  getCandidateContract(id: string): Promise<CandidateContract | undefined>;
  createCandidateContract(data: InsertCandidateContract): Promise<CandidateContract>;
  updateCandidateContract(id: string, data: Partial<InsertCandidateContract>): Promise<CandidateContract | undefined>;

  // ID Card Templates
  getIdCardTemplates(filters?: { eventId?: string }): Promise<IdCardTemplate[]>;
  getIdCardTemplate(id: string): Promise<IdCardTemplate | undefined>;
  getActiveIdCardTemplate(eventId?: string): Promise<IdCardTemplate | undefined>;
  createIdCardTemplate(data: InsertIdCardTemplate): Promise<IdCardTemplate>;
  updateIdCardTemplate(id: string, data: Partial<InsertIdCardTemplate>): Promise<IdCardTemplate | undefined>;
  deleteIdCardTemplate(id: string): Promise<boolean>;
  activateIdCardTemplate(id: string): Promise<boolean>;

  // Printer Plugins
  getPrinterPlugins(): Promise<PrinterPlugin[]>;
  getPrinterPlugin(id: string): Promise<PrinterPlugin | undefined>;
  getActivePrinterPlugin(): Promise<PrinterPlugin | undefined>;
  createPrinterPlugin(data: InsertPrinterPlugin): Promise<PrinterPlugin>;
  updatePrinterPlugin(id: string, data: Partial<InsertPrinterPlugin>): Promise<PrinterPlugin | undefined>;
  deletePrinterPlugin(id: string): Promise<boolean>;
  activatePrinterPlugin(id: string): Promise<boolean>;

  // ID Card Print Logs
  getIdCardPrintLogs(filters?: { employeeId?: string; templateId?: string; printedBy?: string; limit?: number }): Promise<Record<string, unknown>[]>;
  createIdCardPrintLog(data: InsertIdCardPrintLog): Promise<IdCardPrintLog>;
  bulkCreateIdCardPrintLogs(data: InsertIdCardPrintLog[]): Promise<IdCardPrintLog[]>;
  getLastPrintDate(employeeId: string): Promise<Date | null>;

  // System Settings
  getSystemSetting(key: string): Promise<string | undefined>;
  setSystemSetting(key: string, value: string): Promise<void>;

  // Shifts
  getShifts(): Promise<Shift[]>;
  getShift(id: string): Promise<Shift | undefined>;
  createShift(data: InsertShift): Promise<Shift>;
  updateShift(id: string, data: Partial<InsertShift>): Promise<Shift | undefined>;
  deleteShift(id: string): Promise<boolean>;

  // Schedule Templates
  getScheduleTemplates(filters?: { eventId?: string }): Promise<ScheduleTemplate[]>;
  getScheduleTemplate(id: string): Promise<ScheduleTemplate | undefined>;
  createScheduleTemplate(data: InsertScheduleTemplate): Promise<ScheduleTemplate>;
  updateScheduleTemplate(id: string, data: Partial<InsertScheduleTemplate>): Promise<ScheduleTemplate | undefined>;
  deleteScheduleTemplate(id: string): Promise<boolean>;

  // Schedule Assignments
  getScheduleAssignments(filters?: { workforceId?: string; templateId?: string; activeOnly?: boolean }): Promise<ScheduleAssignment[]>;
  getScheduleAssignment(id: string): Promise<ScheduleAssignment | undefined>;
  getActiveAssignmentForEmployee(workforceId: string): Promise<ScheduleAssignment | undefined>;
  checkScheduleOverlap(workforceId: string, startDate: string, endDate: string | null, excludeId?: string): Promise<boolean>;
  createScheduleAssignment(data: InsertScheduleAssignment): Promise<ScheduleAssignment>;
  updateScheduleAssignment(id: string, data: Partial<InsertScheduleAssignment>): Promise<ScheduleAssignment | undefined>;
  deleteScheduleAssignment(id: string): Promise<boolean>;
  endScheduleAssignment(id: string, endDate: string): Promise<ScheduleAssignment | undefined>;
  bulkAssignSchedule(workforceIds: string[], templateId: string, startDate: string, assignedBy?: string, endDate?: string | null): Promise<{ assigned: number; ended: number; skipped: number }>;

  // Attendance Records
  getAttendanceRecords(filters?: { workforceId?: string; dateFrom?: string; dateTo?: string; date?: string }): Promise<AttendanceRecord[]>;
  getAttendanceRecord(id: string): Promise<AttendanceRecord | undefined>;
  getAttendanceForEmployee(workforceId: string, dateFrom: string, dateTo: string): Promise<AttendanceRecord[]>;
  upsertAttendanceRecord(data: InsertAttendanceRecord): Promise<AttendanceRecord>;
  deleteAttendanceRecord(id: string): Promise<boolean>;
  getWorkedDaySummary(workforceIds: string[], dateFrom: string, dateTo: string): Promise<Array<{ workforceId: string; workedDays: number; absentDays: number; lateDays: number; excusedDays: number; totalScheduledDays: number; totalMinutesWorked: number; totalMinutesScheduled: number; totalMinutesLate: number }>>;

  // Assets
  getAssets(includeInactive?: boolean): Promise<Asset[]>;
  getAsset(id: string): Promise<Asset | undefined>;
  createAsset(data: InsertAsset): Promise<Asset>;
  updateAsset(id: string, data: Partial<InsertAsset>): Promise<Asset | undefined>;
  deleteAsset(id: string): Promise<boolean>;

  // Employee Assets
  getEmployeeAssets(filters?: { workforceId?: string; status?: string; assetId?: string }): Promise<EmployeeAsset[]>;
  getEmployeeAsset(id: string): Promise<EmployeeAsset | undefined>;
  assignAsset(data: InsertEmployeeAsset): Promise<EmployeeAsset>;
  updateEmployeeAsset(id: string, data: Partial<InsertEmployeeAsset>): Promise<EmployeeAsset | undefined>;
  deleteEmployeeAsset(id: string): Promise<boolean>;
  getUnreturnedAssetsForWorker(workforceId: string): Promise<Array<EmployeeAsset & { asset: Asset }>>;

  // Inbox Items
  getInboxItems(params?: { status?: string; type?: string; priority?: string; page?: number; limit?: number; search?: string; sortBy?: string; sortOrder?: string }): Promise<{ data: InboxItem[]; total: number }>;
  getInboxItem(id: string): Promise<InboxItem | undefined>;
  createInboxItem(data: InsertInboxItem): Promise<InboxItem>;
  resolveInboxItem(id: string, resolvedBy: string, resolutionNotes?: string): Promise<InboxItem | undefined>;
  dismissInboxItem(id: string, resolvedBy: string, resolutionNotes?: string): Promise<InboxItem | undefined>;
  bulkResolveInboxItems(ids: string[], resolvedBy: string): Promise<number>;
  bulkDismissInboxItems(ids: string[], resolvedBy: string): Promise<number>;
  countOpenInboxItems(): Promise<number>;

  // Geofence Zones
  getGeofenceZones(includeInactive?: boolean): Promise<GeofenceZone[]>;
  getGeofenceZone(id: string): Promise<GeofenceZone | undefined>;
  createGeofenceZone(data: InsertGeofenceZone): Promise<GeofenceZone>;
  updateGeofenceZone(id: string, data: Partial<InsertGeofenceZone>): Promise<GeofenceZone | undefined>;
  deleteGeofenceZone(id: string): Promise<boolean>;

  // Attendance Submissions
  getAttendanceSubmissions(filters?: { workforceId?: string; status?: string; page?: number; limit?: number }): Promise<{ data: AttendanceSubmission[]; total: number }>;
  getAttendanceSubmission(id: string): Promise<AttendanceSubmission | undefined>;
  createAttendanceSubmission(data: InsertAttendanceSubmission): Promise<AttendanceSubmission>;
  updateAttendanceSubmission(id: string, data: Partial<InsertAttendanceSubmission>): Promise<AttendanceSubmission | undefined>;

  // Photo Change Requests
  getPhotoChangeRequests(filters?: { candidateId?: string; status?: string }): Promise<PhotoChangeRequest[]>;
  getPhotoChangeRequest(id: string): Promise<PhotoChangeRequest | undefined>;
  createPhotoChangeRequest(data: InsertPhotoChangeRequest): Promise<PhotoChangeRequest>;
  updatePhotoChangeRequest(id: string, data: Partial<InsertPhotoChangeRequest> & { reviewedBy?: string; reviewedAt?: Date; reviewNotes?: string | null }): Promise<PhotoChangeRequest | undefined>;

  // Departments
  getDepartments(includeInactive?: boolean): Promise<Department[]>;
  getDepartment(id: string): Promise<Department | undefined>;
  createDepartment(data: InsertDepartment): Promise<Department>;
  updateDepartment(id: string, data: Partial<InsertDepartment>): Promise<Department | undefined>;
  toggleDepartmentActive(id: string): Promise<{ success: boolean; error?: string; department?: Department }>;

  // Positions
  getPositions(departmentId: string, includeInactive?: boolean): Promise<Position[]>;
  getAllPositions(includeInactive?: boolean): Promise<(Position & { departmentName?: string | null })[]>;
  getPosition(id: string): Promise<Position | undefined>;
  createPosition(data: InsertPosition): Promise<Position>;
  updatePosition(id: string, data: Partial<InsertPosition>): Promise<Position | undefined>;
  togglePositionActive(id: string): Promise<{ success: boolean; error?: string; position?: Position; affectedEmployees?: { id: string; employeeNumber: string; fullNameEn: string | null }[] }>;

  // SMS Broadcasts
  createSmsBroadcast(data: InsertSmsBroadcast): Promise<SmsBroadcast>;
  getSmsBroadcasts(params?: { page?: number; limit?: number }): Promise<{ data: SmsBroadcast[]; total: number }>;
  getSmsBroadcast(id: string): Promise<SmsBroadcast | undefined>;
  updateSmsBroadcast(id: string, data: Partial<SmsBroadcast>): Promise<SmsBroadcast | undefined>;
  createSmsBroadcastRecipient(data: InsertSmsBroadcastRecipient): Promise<SmsBroadcastRecipient>;
  getSmsBroadcastRecipients(broadcastId: string): Promise<SmsBroadcastRecipient[]>;
  updateSmsBroadcastRecipient(id: string, data: Partial<SmsBroadcastRecipient>): Promise<SmsBroadcastRecipient | undefined>;

  // Excuse Requests
  createExcuseRequest(data: InsertExcuseRequest): Promise<ExcuseRequest>;
  getExcuseRequest(id: string): Promise<ExcuseRequest | undefined>;
  getExcuseRequests(params: { workforceId?: string; status?: string }): Promise<ExcuseRequest[]>;
  updateExcuseRequest(id: string, data: Partial<ExcuseRequest>): Promise<ExcuseRequest | undefined>;
  countPendingExcuseRequests(): Promise<number>;

  // Pay Runs
  createPayRun(data: InsertPayRun): Promise<PayRun>;
  getPayRuns(): Promise<PayRun[]>;
  getPayRun(id: string): Promise<PayRun | undefined>;
  updatePayRun(id: string, data: Partial<PayRun>): Promise<PayRun | undefined>;
  getPayRunLines(payRunId: string): Promise<PayRunLine[]>;
  getPayRunLine(id: string): Promise<PayRunLine | undefined>;
  updatePayRunLine(id: string, data: Partial<PayRunLine>): Promise<PayRunLine | undefined>;

  // Payroll Calculation Engine
  calculatePayroll(workforceId: string, dateFrom: string, dateTo: string): Promise<{
    totalScheduledMinutes: number;
    totalWorkedMinutes: number;
    daysWorked: number;
    excusedDays: number;
    absentDays: number;
    lateMinutes: number;
    adjustedMinutes: number;
    effectiveMinutes: number;
    perMinuteRate: number;
    grossEarned: number;
    absentDeduction: number;
    lateDeduction: number;
    assetDeductions: number;
    totalDeductions: number;
    netPayable: number;
  }>;
  processPayRun(payRunId: string): Promise<{ linesCreated: number }>;

  // Payroll Adjustments
  createPayrollAdjustment(data: InsertPayrollAdjustment): Promise<PayrollAdjustment>;
  getPayrollAdjustments(params: { workforceId?: string; dateFrom?: string; dateTo?: string }): Promise<PayrollAdjustment[]>;
  bulkCreatePayrollAdjustments(adjustments: InsertPayrollAdjustment[]): Promise<number>;

  // Payroll Transactions
  createPayrollTransaction(data: Partial<PayrollTransaction> & { payRunLineId: string; workforceId: string; candidateId: string; amount: string; depositDate: string; enteredBy: string }): Promise<PayrollTransaction>;
  getPayrollTransactions(params: { candidateId?: string; workforceId?: string; payRunLineId?: string }): Promise<PayrollTransaction[]>;
  getPayrollTransaction(id: string): Promise<PayrollTransaction | undefined>;

  // Dashboard
  getDashboardStats(): Promise<{
    totalCandidates: number;
    openPositions: number;
    activeEvents: number;
    scheduledInterviews: number;
    recentApplications: Array<{ candidateName: string; role: string; status: string; appliedAt: Date; photoUrl?: string | null }>;
  }>;

  // ─── RBAC ───
  listRoles(): Promise<Array<Role & { userCount: number; permissionCount: number }>>;
  getRole(id: string): Promise<Role | undefined>;
  getRoleBySlug(slug: string): Promise<Role | undefined>;
  createRole(data: InsertRole): Promise<Role>;
  updateRole(id: string, data: Partial<InsertRole>): Promise<Role>;
  deleteRole(id: string): Promise<{ ok: true } | { ok: false; reason: string; userCount?: number }>;
  cloneRole(id: string, newName: string, newSlug: string): Promise<Role>;
  listPermissions(): Promise<Permission[]>;
  getRolePermissions(roleId: string): Promise<string[]>;
  setRolePermissions(roleId: string, permissionKeys: string[]): Promise<void>;
  countUsersWithRole(roleId: string): Promise<number>;
  getEffectivePermissionsForRole(roleId: string): Promise<{ isSuperAdmin: boolean; keys: string[] }>;
}

// ─── Task #195: candidate search helpers ────────────────────────────────────
//
// Extracted so `getCandidates` and `exportCandidates` build identical
// WHERE clauses, and the multi-token "which IDs did not match?"
// companion query can re-use the same non-search filters without
// drift.

// Task #252 — the new five-value display vocabulary the talent page
// uses for the status filter. When the request carries one of these
// values we translate it into a WHERE on the same SQL CASE expression
// the result rows are projected through, so pagination + count stay
// exact. The legacy raw-enum values (available, inactive, etc.) are
// still accepted to keep any third-party / scripted callers working.
const DERIVED_STATUS_FILTER = new Set<DisplayStatus>([
  "completed", "not_activated", "hired", "blocked", "archived",
]);

function buildCandidateOtherConditions(query: Partial<CandidateQuery>): SQL[] {
  const conditions: SQL[] = [];
  const { status, city, nationality, gender } = query;
  if (status) {
    if (DERIVED_STATUS_FILTER.has(status as DisplayStatus)) {
      // Derived filter — apply against the CASE expression, NOT the
      // raw `candidates.status` enum column. The CASE already
      // accounts for archived_at, so the unconditional
      // `IS NULL/IS NOT NULL archived_at` clause below is a no-op
      // for these queries (it never excludes a derived "archived"
      // row, because that branch sets archived='archived' iff
      // archived_at IS NOT NULL).
      conditions.push(sql`${DISPLAY_STATUS_EXPR} = ${status}`);
    } else {
      conditions.push(eq(candidates.status, status as any));
    }
  }
  if (city) conditions.push(ilike(candidates.city, `%${city}%`));
  if (nationality) conditions.push(eq(candidates.nationality, nationality as any));
  if (gender) conditions.push(eq(candidates.gender, gender as any));
  if ((query as any).classification) {
    conditions.push(eq(candidates.classification, (query as any).classification));
  }
  // Task #252 — skip the implicit "exclude archived rows" clause when
  // the caller is filtering by a derived display status. Those derived
  // values (especially `archived` and `hired`) already encode the
  // archived_at signal in their CASE expression: `archived` returns
  // both manually-archived AND derive-archived rows, while `hired`
  // already excludes manually-archived rows because the CASE checks
  // archived_at first. Forcing `archived_at IS NULL` here would
  // wrongly hide manually-archived rows from the Archived filter.
  const hasDerivedStatusFilter =
    typeof status === "string" && DERIVED_STATUS_FILTER.has(status as DisplayStatus);
  if ((query as any).archived === "true") {
    conditions.push(isNotNull(candidates.archivedAt));
  } else if (!hasDerivedStatusFilter) {
    conditions.push(isNull(candidates.archivedAt));
  }
  if ((query as any).region) {
    conditions.push(eq(candidates.region, (query as any).region));
  }
  if ((query as any).formerEmployee === "true") {
    conditions.push(
      sql`EXISTS (SELECT 1 FROM workforce WHERE workforce.candidate_id = candidates.id AND workforce.is_active = false)`
    );
  }
  // Task #209 — recruiter-facing toggles for events that require a
  // licensed driver (catering vans, shuttles) or a vaccination report
  // (food handling, healthcare-adjacent roles). Both flags live on
  // the candidate row and are flipped when the corresponding document
  // is uploaded — see uploadDocumentsHandler / DELETE document route.
  // The two filter fields are not part of the shared
  // `candidateQuerySchema` (the `shared/` folder is immutable for
  // this project) so we model them with a local type extension that
  // narrows the structural cast — no `as any`, no runtime risk.
  const docFlags = query as Partial<CandidateQuery> & {
    hasDriversLicense?: "true";
    hasVaccinationReport?: "true";
  };
  if (docFlags.hasDriversLicense === "true") {
    conditions.push(eq(candidates.hasDriversLicense, true));
  }
  if (docFlags.hasVaccinationReport === "true") {
    conditions.push(eq(candidates.hasVaccinationReport, true));
  }
  return conditions;
}

// UUID detection mirrors looksLikeId's UUID branch — used to add an
// exact-match on candidates.id (varchar) when the token is a canonical
// UUID. Without this, pasted candidate UUIDs (the front-end can copy
// these from the table) would never resolve and would always be
// reported as missing.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function buildCandidateSearchCondition(parsed: ReturnType<typeof parseSearchTokens>): SQL | undefined {
  if (parsed.tokens.length === 0) return undefined;

  if (!parsed.isMulti) {
    const token = parsed.tokens[0];
    const term = `%${token}%`;
    const clauses: SQL[] = [
      ilike(candidates.fullNameEn, term)!,
      ilike(candidates.email, term)!,
      ilike(candidates.phone, term)!,
      ilike(candidates.currentRole, term)!,
      ilike(candidates.nationalId, term)!,
      ilike(candidates.city, term)!,
    ];
    if (UUID_RE.test(token)) clauses.push(eq(candidates.id, token.toLowerCase()));
    return or(...clauses);
  }

  const tokenClauses = parsed.tokens.map((token) => {
    const term = `%${token}%`;
    const clauses: SQL[] = [
      ilike(candidates.fullNameEn, term)!,
      ilike(candidates.email, term)!,
      ilike(candidates.phone, term)!,
      ilike(candidates.currentRole, term)!,
      ilike(candidates.nationalId, term)!,
      ilike(candidates.city, term)!,
      sql`EXISTS (SELECT 1 FROM workforce WHERE workforce.candidate_id = ${candidates.id} AND workforce.employee_number = ${token})`,
    ];
    if (UUID_RE.test(token)) clauses.push(eq(candidates.id, token.toLowerCase()));
    return or(...clauses);
  });
  return or(...tokenClauses);
}

async function fetchMatchedSearchTokens(
  tokens: string[],
  otherWhere: SQL | undefined,
): Promise<Set<string>> {
  if (tokens.length === 0) return new Set();

  // VALUES-list parameterised through Drizzle's sql template. Each
  // token becomes a bound parameter (no SQL injection surface), and
  // the planner can use existing ILIKE/employee_number indexes via
  // the EXISTS subquery.
  const valuesList = sql.join(tokens.map((t) => sql`(${t})`), sql`, `);
  const filterClause = otherWhere ? sql` AND (${otherWhere})` : sql``;

  const result = await db.execute(sql`
    SELECT DISTINCT t.token::text AS token
    FROM (VALUES ${valuesList}) AS t(token)
    WHERE EXISTS (
      SELECT 1 FROM ${candidates}
      WHERE (
        ${candidates.fullNameEn} ILIKE '%' || t.token || '%'
        OR ${candidates.email} ILIKE '%' || t.token || '%'
        OR ${candidates.phone} ILIKE '%' || t.token || '%'
        OR ${candidates.currentRole} ILIKE '%' || t.token || '%'
        OR ${candidates.nationalId} ILIKE '%' || t.token || '%'
        OR ${candidates.city} ILIKE '%' || t.token || '%'
        -- UUID-shaped tokens hit the candidate primary key directly
        -- (lower-cased to match storage convention).
        OR (
          t.token ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          AND ${candidates.id} = lower(t.token)
        )
        OR EXISTS (
          SELECT 1 FROM workforce w
          WHERE w.candidate_id = ${candidates.id}
            AND w.employee_number = t.token
        )
      )${filterClause}
    )
  `);

  const rows = (result as any).rows ?? (result as any);
  return new Set((rows as Array<{ token: string }>).map((r) => r.token));
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

  /**
   * Single-query identifier resolution for /login. Replaces the previous
   * 4-roundtrip cascade (phone → nationalId → email → username) with one
   * indexed OR query — cuts login DB latency to a single round-trip even
   * during 100-req/sec bursts. Precedence is enforced in JS by priority,
   * matching the old waterfall ordering exactly.
   */
  async getUserByAnyIdentifier(identifier: string): Promise<User | undefined> {
    const clean = identifier.trim();
    const rows = await db
      .select()
      .from(users)
      .where(
        or(
          eq(users.phone, clean),
          eq(users.nationalId, clean),
          eq(users.email, clean),
          eq(users.username, clean),
        ),
      )
      .limit(4);
    if (rows.length === 0) return undefined;
    if (rows.length === 1) return rows[0];
    // Multiple users matched (e.g., one user's username equals another's
    // national id). Apply the legacy precedence: phone > nationalId > email > username.
    const byPhone = rows.find((u) => u.phone === clean);
    if (byPhone) return byPhone;
    const byNid = rows.find((u) => u.nationalId === clean);
    if (byNid) return byNid;
    const byEmail = rows.find((u) => u.email === clean);
    if (byEmail) return byEmail;
    return rows.find((u) => u.username === clean);
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

  async deleteUser(id: string): Promise<boolean> {
    const result = await db.delete(users).where(eq(users.id, id)).returning({ id: users.id });
    return result.length > 0;
  }

  // ─── Candidates (MAANG-scale: cursor-based pagination + full-text) ─────────
  //
  // Task #195 — the search box accepts a pasted list of identifiers
  // (national IDs, UUIDs, phone numbers, employee numbers) using
  // newline / comma / semicolon / tab / 2+ space separators, capped
  // at 200 tokens. When more than one token is detected we OR the
  // existing six-column ILIKE match across every token, plus an
  // exact match against `workforce.employee_number`, then run a
  // companion query that reports which tokens did not match so HR
  // can chase them down. A single-token paste behaves exactly as
  // before (no behaviour change), keeping every existing call site
  // safe. See `shared/candidate-search.ts` for the parser shared
  // with the front-end pill.
  async getCandidates(query: CandidateQuery): Promise<{
    data: Candidate[];
    total: number;
    page: number;
    limit: number;
    searchMeta?: CandidateSearchMeta;
  }> {
    const { page, limit, sortBy, sortOrder } = query;
    const offset = (page - 1) * limit;

    const otherConditions = buildCandidateOtherConditions(query);
    const parsed = parseSearchTokens(query.search);
    const searchCondition = buildCandidateSearchCondition(parsed);

    const allConditions = searchCondition ? [...otherConditions, searchCondition] : otherConditions;
    const where = allConditions.length > 0 ? and(...allConditions) : undefined;

    const orderFn = sortOrder === "asc" ? asc : desc;
    const orderCol =
      sortBy === "fullNameEn" ? candidates.fullNameEn
      : sortBy === "rating" ? candidates.rating
      : sortBy === "city" ? candidates.city
      : sortBy === "classification" ? candidates.classification
      : sortBy === "phone" ? candidates.phone
      : sortBy === "email" ? candidates.email
      : candidates.createdAt;

    const workforceCountSq = sql<number>`(SELECT count(*)::int FROM workforce WHERE workforce.candidate_id = candidates.id)`;
    const workforceSeasonsSq = sql<number>`(SELECT count(DISTINCT event_id)::int FROM workforce WHERE workforce.candidate_id = candidates.id AND event_id IS NOT NULL AND workforce.is_active = false)`;
    const completedStintsSq = sql<number>`(SELECT count(*)::int FROM workforce WHERE workforce.candidate_id = candidates.id AND workforce.is_active = false)`;
    const unpaidSettlementsSq = sql<number>`(SELECT count(*)::int FROM workforce WHERE workforce.candidate_id = candidates.id AND workforce.offboarding_status = 'completed' AND workforce.settlement_paid_at IS NULL)`;

    const otherWhere = otherConditions.length > 0 ? and(...otherConditions) : undefined;
    const wantsSearchMeta = parsed.isMulti;

    const [data, [{ value: total }], matchedTokens] = await Promise.all([
      db
        .select({
          ...getTableColumns(candidates),
          workforceRecordCount: workforceCountSq.as("workforceRecordCount"),
          workforceSeasonCount: workforceSeasonsSq.as("workforceSeasonCount"),
          completedStints: completedStintsSq.as("completedStints"),
          unpaidSettlements: unpaidSettlementsSq.as("unpaidSettlements"),
          // Task #252 — derived display status. Computed in SQL via the
          // shared CASE expression so the value the front-end reads
          // matches the WHERE clause exactly. The client also runs
          // `computeDisplayStatus` defensively for any row that
          // arrives without this field (e.g. legacy callers, or rows
          // returned by the profile sheet's per-id endpoint).
          displayStatus: sql<DisplayStatus>`${DISPLAY_STATUS_EXPR}`.as("displayStatus"),
        })
        .from(candidates)
        .where(where)
        .orderBy(orderFn(orderCol))
        .limit(limit)
        .offset(offset),
      db
        .select({ value: count() })
        .from(candidates)
        .where(where),
      wantsSearchMeta ? fetchMatchedSearchTokens(parsed.tokens, otherWhere) : Promise.resolve(new Set<string>()),
    ]);

    let searchMeta: CandidateSearchMeta | undefined;
    if (wantsSearchMeta) {
      const unmatched = parsed.tokens.filter(t => !matchedTokens.has(t));
      const missingIds = unmatched.filter(looksLikeId);
      const droppedFreeText = unmatched.length - missingIds.length;
      searchMeta = {
        tokenCount: parsed.tokens.length,
        truncated: parsed.truncated,
        missingIds,
        droppedFreeText,
      };
    }

    return { data, total: Number(total), page, limit, ...(searchMeta ? { searchMeta } : {}) };
  }

  async getCandidateSummariesByIds(ids: string[]): Promise<Map<string, {
    id: string;
    fullNameEn: string;
    nationalId: string | null;
    phone: string | null;
    email: string | null;
    classification: string;
    archivedAt: Date | null;
    photoUrl: string | null;
    nationalIdFileUrl: string | null;
    ibanFileUrl: string | null;
    ibanNumber: string | null;
    vaccinationReportFileUrl: string | null;
  }>> {
    const map = new Map<string, {
      id: string;
      fullNameEn: string;
      nationalId: string | null;
      phone: string | null;
      email: string | null;
      classification: string;
      archivedAt: Date | null;
      photoUrl: string | null;
      nationalIdFileUrl: string | null;
      ibanFileUrl: string | null;
      ibanNumber: string | null;
      vaccinationReportFileUrl: string | null;
    }>();
    if (ids.length === 0) return map;
    const rows = await db
      .select({
        id: candidates.id,
        fullNameEn: candidates.fullNameEn,
        nationalId: candidates.nationalId,
        phone: candidates.phone,
        email: candidates.email,
        classification: candidates.classification,
        archivedAt: candidates.archivedAt,
        photoUrl: candidates.photoUrl,
        nationalIdFileUrl: candidates.nationalIdFileUrl,
        ibanFileUrl: candidates.ibanFileUrl,
        ibanNumber: candidates.ibanNumber,
        vaccinationReportFileUrl: candidates.vaccinationReportFileUrl,
      })
      .from(candidates)
      .where(inArray(candidates.id, ids));
    for (const r of rows) map.set(r.id, r);
    return map;
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

  async getCandidateByUserId(userId: string): Promise<Candidate | undefined> {
    const [candidate] = await db.select().from(candidates).where(and(eq(candidates.userId, userId), isNull(candidates.archivedAt)));
    return candidate;
  }

  async getCandidateByFileUrl(url: string): Promise<Candidate | undefined> {
    const [candidate] = await db
      .select()
      .from(candidates)
      .where(
        or(
          eq(candidates.photoUrl, url),
          eq(candidates.nationalIdFileUrl, url),
          eq(candidates.ibanFileUrl, url),
          eq(candidates.resumeUrl, url),
          eq(candidates.driversLicenseFileUrl, url),
          eq(candidates.vaccinationReportFileUrl, url),
        ),
      );
    return candidate;
  }

  async createCandidate(candidate: InsertCandidate): Promise<Candidate> {
    // Task #120 — last-line-of-defence IBAN canonicalisation + auto-fill
    // of bank name/code so writes that bypass the route schema (or
    // future internal callers) cannot poison the column.
    // Task #137 — same defence for the IBAN account holder first/last name
    // (must be Latin-only English text; throws IbanHolderNameValidationError).
    applyServerIbanHolderNameFields(candidate as any);
    applyServerIbanFields(candidate as any);
    const [created] = await db.insert(candidates).values(candidate).returning();
    return created;
  }

  async updateCandidate(id: string, data: Partial<InsertCandidate>): Promise<Candidate | undefined> {
    applyServerIbanHolderNameFields(data as any);
    applyServerIbanFields(data as any);
    const [updated] = await db
      .update(candidates)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(candidates.id, id))
      .returning();

    // Phone-change side effects. Two things must happen when an admin or the
    // candidate themselves changes the phone on a candidate row:
    //
    //   1. Invalidate any LIVE activation tokens (Task #107 step 15). The
    //      activation SMS for the previous phone is now in the wrong hands;
    //      a fresh re-issue MUST happen via /api/candidates/activation-tokens
    //      /reissue. We invalidate even when the candidate already has a
    //      `userId` — defence in depth, no live tokens for an activated user
    //      should ever exist anyway.
    //
    //   2. Mirror to users.phone so the linked login keeps OTPs flowing to
    //      the new number.
    //
    // Both are best-effort and never block the primary candidate update.
    if (updated && Object.prototype.hasOwnProperty.call(data, "phone")) {
      try {
        const { invalidateAllTokensForCandidate } = await import("./activation-tokens");
        const n = await invalidateAllTokensForCandidate(updated.id);
        if (n > 0) {
          console.warn(
            `[updateCandidate] phone changed for ${updated.id} — invalidated ${n} live activation token(s).`,
          );
        }
      } catch (e) {
        console.error("[updateCandidate] activation-token invalidation on phone change failed:", e);
      }
      // Cancel any queued SMS that still carry the (now-invalidated) link to
      // the OLD phone. Without this, the outbox worker would happily deliver
      // them — the link itself is harmless (consume rejects an invalidated
      // token), but it wastes SMS credits and confuses the recipient.
      try {
        const { invalidatePendingActivationSms } = await import("./sms-outbox");
        await invalidatePendingActivationSms(updated.id);
      } catch (e) {
        console.error("[updateCandidate] outbox invalidation on phone change failed:", e);
      }
    }
    if (updated && updated.userId && Object.prototype.hasOwnProperty.call(data, "phone")) {
      const newPhone = (data as any).phone as string | null | undefined;
      try {
        if (newPhone) {
          const [conflicting] = await db
            .select({ id: users.id })
            .from(users)
            .where(and(eq(users.phone, newPhone), not(eq(users.id, updated.userId))));
          if (conflicting) {
            console.warn(
              `[updateCandidate] phone-mirror skipped: user ${conflicting.id} already holds phone for candidate ${updated.id}`,
            );
          } else {
            await db
              .update(users)
              .set({ phone: newPhone })
              .where(eq(users.id, updated.userId));
          }
        } else {
          await db
            .update(users)
            .set({ phone: null })
            .where(eq(users.id, updated.userId));
        }
      } catch (e) {
        console.error("[updateCandidate] phone-mirror to users failed:", e);
      }
    }

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

    // Task #120 — same canonicalisation + bank auto-fill as the single
    // insert path. Throws IbanValidationError if any row carries a
    // malformed IBAN, so the bulk endpoint returns 400 to the caller.
    for (const row of data) {
      applyServerIbanHolderNameFields(row as any);
      applyServerIbanFields(row as any);
    }

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

  async bulkUnarchiveCandidates(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await db
      .update(candidates)
      .set({ archivedAt: null, updatedAt: new Date() })
      .where(and(inArray(candidates.id, ids), isNotNull(candidates.archivedAt)))
      .returning({ id: candidates.id });
    return result.length;
  }

  async exportCandidates(query?: Partial<CandidateQuery>): Promise<{ headers: string[]; rows: any[][]; total: number }> {
    // Task #195 — when the user has filters applied (including a
    // multi-ID paste in the search box), the CSV export reflects the
    // exact same filtered set so what they download matches what is
    // on screen. Calling with no filters keeps the legacy "everything
    // not archived" behaviour.
    const fullQuery: CandidateQuery = {
      page: 1,
      limit: 1,
      sortBy: "createdAt",
      sortOrder: "desc",
      ...(query ?? {}),
    } as CandidateQuery;
    const otherConditions = buildCandidateOtherConditions(fullQuery);
    const parsed = parseSearchTokens(fullQuery.search);
    const searchCondition = buildCandidateSearchCondition(parsed);
    const allConditions = searchCondition ? [...otherConditions, searchCondition] : otherConditions;
    const where = allConditions.length > 0 ? and(...allConditions) : undefined;

    const data = await db.select().from(candidates)
      .where(where)
      .orderBy(desc(candidates.createdAt));

    const headers = [
      "ID", "Full Name", "Classification", "Status",
      "Phone", "WhatsApp", "Email", "City", "Region", "Country",
      "Nationality", "Nationality Text", "Gender", "Date of Birth", "Marital Status",
      "National ID", "Iqama Number", "Passport Number",
      "Education Level", "University", "Major",
      "Skills", "Languages", "Certifications",
      "Currently Employed Elsewhere", "Current Employer", "Current Role",
      "Has Chronic Diseases", "Chronic Diseases",
      "Emergency Contact Name", "Emergency Contact Phone",
      "IBAN", "Bank Name", "Bank Code", "IBAN Account First Name", "IBAN Account Last Name",
      "Expected Salary",
      "Has Resume", "Has Photo", "Has National ID", "Has IBAN",
      "Profile Completed", "Rating", "Total Ratings",
      "Tags", "Notes",
      "Last Login At", "Created At", "Updated At",
    ];

    const fmtDate = (d: any) => d ? new Date(d).toISOString().slice(0, 10) : "";
    const fmtTs   = (d: any) => d ? new Date(d).toISOString() : "";
    const fmtArr  = (a: any) => Array.isArray(a) ? a.join(", ") : "";
    const fmtBool = (b: any) => b === true ? "Yes" : b === false ? "No" : "";

    const rows = data.map(r => [
      r.id,
      r.fullNameEn || "",
      r.classification || "individual",
      r.status || "",
      r.phone || "",
      r.whatsapp || "",
      r.email || "",
      r.city || "",
      r.region || "",
      r.country || "",
      r.nationality || "",
      (r as any).nationalityText || "",
      r.gender || "",
      r.dateOfBirth || "",
      (r as any).maritalStatus || "",
      r.nationalId || "",
      r.iqamaNumber || "",
      r.passportNumber || "",
      r.educationLevel || "",
      r.university || "",
      r.major || "",
      fmtArr(r.skills),
      fmtArr(r.languages),
      fmtArr(r.certifications),
      fmtBool(r.isEmployedElsewhere),
      r.currentEmployer || "",
      r.currentRole || "",
      fmtBool((r as any).hasChronicDiseases),
      (r as any).chronicDiseases || "",
      r.emergencyContactName || "",
      r.emergencyContactPhone || "",
      r.ibanNumber || "",
      r.ibanBankName || "",
      r.ibanBankCode || "",
      r.ibanAccountFirstName || "",
      r.ibanAccountLastName || "",
      r.expectedSalary != null ? String(r.expectedSalary) : "",
      fmtBool(r.hasResume),
      fmtBool(r.hasPhoto),
      fmtBool(r.hasNationalId),
      fmtBool(r.hasIban),
      fmtBool((r as any).profileCompleted),
      r.rating != null ? String(r.rating) : "",
      r.totalRatings != null ? String(r.totalRatings) : "",
      fmtArr(r.tags),
      r.notes || "",
      fmtTs(r.lastLoginAt),
      fmtDate(r.createdAt),
      fmtTs(r.updatedAt),
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

    const [activeRow] = await db.select({ value: count() }).from(candidates).where(and(eq(candidates.status, "available"), notArchived));
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
  async getEvents(params?: { includeArchived?: boolean }): Promise<Event[]> {
    const conditions = [];
    if (!params?.includeArchived) {
      conditions.push(isNull(events.archivedAt));
    }
    const eventsData = await db.select().from(events)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(events.createdAt));

    if (eventsData.length === 0) return eventsData as any;

    const eventIds = eventsData.map(e => e.id).filter(Boolean) as string[];
    const countMap = await countFilledForEvents(eventIds);
    return eventsData.map(e => ({ ...e, filledPositions: countMap.get(e.id) ?? 0 })) as any;
  }

  async getEvent(id: string): Promise<Event | undefined> {
    const [evt] = await db.select().from(events).where(eq(events.id, id));
    if (!evt) return undefined;
    const filled = await countFilledForEvent(id);
    return { ...evt, filledPositions: filled } as any;
  }

  async createEvent(event: InsertEvent): Promise<Event> {
    const [created] = await db.insert(events).values(event).returning();
    return created;
  }

  async updateEvent(id: string, data: Partial<InsertEvent>): Promise<Event | undefined> {
    const [updated] = await db.update(events).set({ ...data, updatedAt: new Date() }).where(eq(events.id, id)).returning();
    return updated;
  }

  async closeEvent(id: string): Promise<Event | undefined> {
    const [updated] = await db.update(events)
      .set({ status: "closed", updatedAt: new Date() })
      .where(and(eq(events.id, id), isNull(events.archivedAt)))
      .returning();
    return updated;
  }

  async reopenEvent(id: string): Promise<Event | undefined> {
    const [updated] = await db.update(events)
      .set({ status: "active", updatedAt: new Date() })
      .where(and(eq(events.id, id), isNull(events.archivedAt)))
      .returning();
    return updated;
  }

  async archiveEvent(id: string): Promise<Event | undefined> {
    const [updated] = await db.update(events).set({ archivedAt: new Date(), updatedAt: new Date() }).where(and(eq(events.id, id), isNull(events.archivedAt))).returning();
    return updated;
  }

  async unarchiveEvent(id: string): Promise<Event | undefined> {
    const [updated] = await db.update(events).set({ archivedAt: null, updatedAt: new Date() }).where(and(eq(events.id, id), isNotNull(events.archivedAt))).returning();
    return updated;
  }

  async autoCloseExpiredEvents(): Promise<{ count: number; names: string[] }> {
    const today = new Date().toISOString().slice(0, 10);
    const expired = await db.update(events)
      .set({ status: "closed", updatedAt: new Date() })
      .where(and(
        eq(events.eventType, "duration_based"),
        isNull(events.archivedAt),
        sql`${events.status} IN ('upcoming', 'active')`,
        sql`${events.endDate} IS NOT NULL`,
        sql`${events.endDate} < ${today}`,
      ))
      .returning({ id: events.id, name: events.name });
    return { count: expired.length, names: expired.map(e => e.name) };
  }

  async autoActivateUpcomingEvents(): Promise<{ count: number; names: string[] }> {
    const today = new Date().toISOString().slice(0, 10);
    const activated = await db.update(events)
      .set({ status: "active", updatedAt: new Date() })
      .where(and(
        isNull(events.archivedAt),
        eq(events.status, "upcoming"),
        sql`${events.startDate} IS NOT NULL`,
        sql`${events.startDate} <= ${today}`,
      ))
      .returning({ id: events.id, name: events.name });
    return { count: activated.length, names: activated.map(e => e.name) };
  }

  // Task #107: SMP awaiting-activation sweep — flips to inactive any
  // candidate whose live activation token has expired AND who has no
  // un-consumed/un-invalidated token still alive. Runs daily.
  async sweepStaleAwaitingActivationCandidates(): Promise<number> {
    const result = await db.execute(sql`
      UPDATE candidates
      SET status = 'inactive', updated_at = now()
      WHERE status = 'awaiting_activation'
        AND classification = 'smp'
        AND user_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM candidate_activation_tokens t
          WHERE t.candidate_id = candidates.id
            AND t.consumed_at IS NULL
            AND t.invalidated_at IS NULL
            AND t.expires_at > now()
        )
      RETURNING id
    `);
    const rows = (result as any).rows ?? result;
    return Array.isArray(rows) ? rows.length : 0;
  }

  // Defensive sweep: any individual candidate that ended up flagged
  // 'available' while their profile_completed flag is still false (e.g.
  // because they registered during a deploy window when the registration
  // insert hadn't yet been updated to use 'pending_profile') is demoted
  // back to 'pending_profile'. The PATCH /api/candidates/:id handler will
  // automatically re-promote them to 'available' the moment they finish
  // the profile-setup wizard. SMP candidates are intentionally excluded
  // because their lifecycle (awaiting_activation → inactive → active) is
  // managed by separate flows.
  async sweepIncompleteProfilesToPending(): Promise<number> {
    const result = await db.execute(sql`
      UPDATE candidates
      SET status = 'pending_profile', updated_at = now()
      WHERE classification = 'individual'
        AND profile_completed = false
        AND status = 'available'
      RETURNING id
    `);
    const rows = (result as any).rows ?? result;
    return Array.isArray(rows) ? rows.length : 0;
  }

  async ageOutInactiveCandidates(): Promise<number> {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    // A candidate is "aged out" only when they have been dormant for ≥1 year.
    // For rows that have never logged in we used to flip purely on
    // `lastLoginAt IS NULL`, which incorrectly swept brand-new signups whose
    // lastLoginAt had not yet been stamped by the auto-login path. Require
    // that the row itself is also older than one year before flipping.
    const result = await db.update(candidates)
      .set({ status: "inactive", updatedAt: new Date() })
      .where(and(
        eq(candidates.status, "available"),
        or(
          and(isNotNull(candidates.lastLoginAt), lt(candidates.lastLoginAt, oneYearAgo)),
          and(isNull(candidates.lastLoginAt), lt(candidates.createdAt, oneYearAgo)),
        )
      ))
      .returning({ id: candidates.id });
    return result.length;
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

  async getJobStats(): Promise<{ total: number; active: number; draft: number; filled: number }> {
    const notArchived = isNull(jobPostings.archivedAt);
    const [stats] = await db.select({ total: count() }).from(jobPostings).where(notArchived);

    const [activeRow] = await db.select({ value: count() }).from(jobPostings).where(and(eq(jobPostings.status, "active"), notArchived));
    const [draftRow] = await db.select({ value: count() }).from(jobPostings).where(and(eq(jobPostings.status, "draft"), notArchived));
    const [filledRow] = await db.select({ value: count() }).from(jobPostings).where(and(eq(jobPostings.status, "filled"), notArchived));

    return {
      total: Number(stats.total),
      active: Number(activeRow.value),
      draft: Number(draftRow.value),
      filled: Number(filledRow.value),
    };
  }

  // ─── Applications ───────────────────────────────────────────────────────────
  async getApplications(params?: { jobId?: string; candidateId?: string; status?: string; includeCandidate?: boolean }): Promise<ApplicationWithCandidate[]> {
    const conditions = [];
    if (params?.jobId) conditions.push(eq(applications.jobId, params.jobId));
    if (params?.candidateId) conditions.push(eq(applications.candidateId, params.candidateId));
    if (params?.status) conditions.push(eq(applications.status, params.status as any));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    if (!params?.includeCandidate) {
      return db.select().from(applications).where(where).orderBy(desc(applications.appliedAt));
    }
    const rows = await db
      .select({
        application: applications,
        candidate: {
          id: candidates.id,
          fullNameEn: candidates.fullNameEn,
          nationalId: candidates.nationalId,
          phone: candidates.phone,
          email: candidates.email,
          city: candidates.city,
          nationality: candidates.nationality,
          gender: candidates.gender,
          photoUrl: candidates.photoUrl,
          hasPhoto: candidates.hasPhoto,
          hasIban: candidates.hasIban,
          hasNationalId: candidates.hasNationalId,
          classification: candidates.classification,
          status: candidates.status,
          archivedAt: candidates.archivedAt,
        },
      })
      .from(applications)
      .leftJoin(candidates, eq(applications.candidateId, candidates.id))
      .where(where)
      .orderBy(desc(applications.appliedAt));
    return rows.map((r): ApplicationWithCandidate => ({
      ...r.application,
      candidate: r.candidate && r.candidate.id ? (r.candidate as ApplicationCandidateSummary) : null,
    }));
  }

  async getApplicantsForJob(params: { jobId: string; page: number; limit: number; search?: string }): Promise<{ data: { candidateId: string; applicationId: string; fullNameEn: string; nationalId: string | null; applicationStatus: string; appliedAt: Date }[]; total: number; searchMeta?: CandidateSearchMeta }> {
    const { jobId, page, limit, search } = params;
    const offset = (page - 1) * limit;

    // Task #224 — port the talent page's bulk-paste-IDs search
    // (#195) to the Schedule Interview applicant picker. HR can
    // paste an Excel column of national IDs / phones / employee
    // numbers and get back the matching applicants for the chosen
    // job, plus a "missing IDs" companion report that is scoped to
    // THIS job's applicant pool (not the whole candidate database)
    // so the unmatched panel reflects "didn't apply to this job"
    // rather than "doesn't exist anywhere".
    const parsed = parseSearchTokens(search);
    const searchCondition = buildCandidateSearchCondition(parsed);

    const conditions = [eq(applications.jobId, jobId)];
    if (searchCondition) conditions.push(searchCondition);
    const where = and(...conditions);

    // For the missing-IDs companion query we constrain to candidates
    // that have an application for this jobId, so unmatched tokens
    // mean "no applicant for THIS job", which is what the recruiter
    // is actually looking for on this page.
    const otherWhere = sql`EXISTS (SELECT 1 FROM ${applications} WHERE ${applications.candidateId} = ${candidates.id} AND ${applications.jobId} = ${jobId})`;
    const wantsSearchMeta = parsed.isMulti;

    const [rows, [{ value: totalCount }], matchedTokens] = await Promise.all([
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
        // Order by application date ascending so the earliest applicants
        // appear on page 1 — matches the talent page's oldest-first
        // default. Don't penalise candidates who applied early.
        .orderBy(asc(applications.appliedAt))
        .limit(limit)
        .offset(offset),
      db.select({ value: count() })
        .from(applications)
        .innerJoin(candidates, eq(applications.candidateId, candidates.id))
        .where(where),
      wantsSearchMeta ? fetchMatchedSearchTokens(parsed.tokens, otherWhere) : Promise.resolve(new Set<string>()),
    ]);

    let searchMeta: CandidateSearchMeta | undefined;
    if (wantsSearchMeta) {
      const unmatched = parsed.tokens.filter(t => !matchedTokens.has(t));
      const missingIds = unmatched.filter(looksLikeId);
      const droppedFreeText = unmatched.length - missingIds.length;
      searchMeta = {
        tokenCount: parsed.tokens.length,
        truncated: parsed.truncated,
        missingIds,
        droppedFreeText,
      };
    }

    return { data: rows, total: Number(totalCount), ...(searchMeta ? { searchMeta } : {}) };
  }

  async getApplication(id: string): Promise<Application | undefined> {
    const [app] = await db.select().from(applications).where(eq(applications.id, id));
    return app;
  }

  async createApplication(app: InsertApplication): Promise<Application> {
    const [created] = await db.insert(applications).values(app).returning();
    return created;
  }

  async updateApplication(id: string, data: Partial<InsertApplication>, tx?: any): Promise<Application | undefined> {
    const exec = tx ?? db;
    const [updated] = await exec.update(applications).set({ ...data, updatedAt: new Date() }).where(eq(applications.id, id)).returning();
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
  async getInterviews(params?: { status?: string; candidateId?: string; eventId?: string }): Promise<Interview[]> {
    // Auto-complete elapsed interviews before any read so the UI never
    // shows a stale `scheduled` row whose end-time has passed. See
    // server/interview-auto-complete.ts for the full rationale.
    const { autoCompleteElapsedInterviews } = await import("./interview-auto-complete");
    await autoCompleteElapsedInterviews();
    // Archived interviews are hidden from the default list. Cancellation is
    // for not-yet-finished sessions; archive is the post-completion verb.
    const conditions = [isNull(interviews.archivedAt)];
    if (params?.status) conditions.push(eq(interviews.status, params.status as any));
    if (params?.eventId) conditions.push(eq(interviews.eventId, params.eventId));
    if (params?.candidateId) {
      conditions.push(
        or(
          eq(interviews.candidateId, params.candidateId),
          sql`${params.candidateId} = ANY(${interviews.invitedCandidateIds})`
        )!
      );
    }
    return db.select().from(interviews).where(and(...conditions)).orderBy(desc(interviews.scheduledAt));
  }

  async getInterviewsWithDecisionCounts(params?: { status?: string; candidateId?: string; eventId?: string }): Promise<(Interview & { shortlistedCount: number; rejectedCount: number; pendingCount: number })[]> {
    // Same per-invitee "best application" priority as `getInterviewDetail`,
    // so list counts equal the drawer chips byte-for-byte.
    const rows = await this.getInterviews(params);
    if (rows.length === 0) return [];

    const allInviteeIds = Array.from(new Set(
      rows.flatMap(r => r.invitedCandidateIds ?? [])
    ));
    if (allInviteeIds.length === 0) {
      return rows.map(r => ({ ...r, shortlistedCount: 0, rejectedCount: 0, pendingCount: 0 }));
    }

    const appRows = await db.select({
      id: applications.id,
      candidateId: applications.candidateId,
      status: applications.status,
      jobId: applications.jobId,
    })
      .from(applications)
      .where(inArray(applications.candidateId, allInviteeIds));

    const jobIds = Array.from(new Set(appRows.map(a => a.jobId).filter((v): v is string => !!v)));
    const jobRows = jobIds.length > 0
      ? await db.select({ id: jobPostings.id, eventId: jobPostings.eventId }).from(jobPostings).where(inArray(jobPostings.id, jobIds))
      : [];
    const jobEventMap = new Map(jobRows.map(j => [j.id, j.eventId ?? null]));

    const appsByCandidate = new Map<string, typeof appRows>();
    for (const a of appRows) {
      const list = appsByCandidate.get(a.candidateId) ?? [];
      list.push(a);
      appsByCandidate.set(a.candidateId, list);
    }

    const statusPriority: Record<string, number> = { hired: 6, offered: 5, interviewed: 4, shortlisted: 3, reviewing: 2, new: 1, rejected: 0, withdrawn: 0 };

    return rows.map(iv => {
      let shortlistedCount = 0;
      let rejectedCount = 0;
      let pendingCount = 0;
      for (const cid of iv.invitedCandidateIds ?? []) {
        const candidateApps = appsByCandidate.get(cid) ?? [];
        const boundApp = iv.applicationId
          ? candidateApps.find(a => a.id === iv.applicationId)
          : undefined;
        const sameEventApps = iv.eventId
          ? candidateApps
              .filter(a => a.jobId && jobEventMap.get(a.jobId) === iv.eventId)
              .sort((a, b) => (statusPriority[b.status] ?? 0) - (statusPriority[a.status] ?? 0))
          : [];
        const anyApp = [...candidateApps].sort((a, b) => (statusPriority[b.status] ?? 0) - (statusPriority[a.status] ?? 0))[0];
        const best = boundApp ?? sameEventApps[0] ?? anyApp;
        const status = best?.status ?? null;
        if (status === "shortlisted") shortlistedCount++;
        else if (status === "rejected") rejectedCount++;
        else pendingCount++;
      }
      return { ...iv, shortlistedCount, rejectedCount, pendingCount };
    });
  }

  async archiveInterview(id: string): Promise<Interview | undefined> {
    // Archive is restricted to completed interviews — anything still active
    // (scheduled / in_progress / no_show) must be cancelled instead. The
    // status guard lives in the WHERE so a stale UI cannot archive a
    // not-yet-finished session, and a double-click on the action is a
    // harmless no-op (already-archived rows fall through the isNull check).
    const [updated] = await db.update(interviews)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(and(
        eq(interviews.id, id),
        eq(interviews.status, "completed"),
        isNull(interviews.archivedAt),
      ))
      .returning();
    return updated;
  }

  async getInterview(id: string): Promise<Interview | undefined> {
    const [interview] = await db.select().from(interviews).where(eq(interviews.id, id));
    return interview;
  }

  async getInterviewDetail(id: string): Promise<{ interview: Interview; invitedCandidates: { id: string; fullNameEn: string; nationalId: string | null; phone: string | null; photoUrl: string | null; applicationId: string | null; applicationStatus: string | null; questionSetId: string | null; questionSetAnswers: Record<string, string> | null }[] } | undefined> {
    // Auto-complete elapsed interviews so the detail panel never opens
    // a row that is visibly past its end-time but still labeled
    // "scheduled". See server/interview-auto-complete.ts.
    const { autoCompleteElapsedInterviews } = await import("./interview-auto-complete");
    await autoCompleteElapsedInterviews();
    const [interview] = await db.select().from(interviews).where(eq(interviews.id, id));
    if (!interview) return undefined;
    let invitedCandidates: { id: string; fullNameEn: string; nationalId: string | null; phone: string | null; photoUrl: string | null; applicationId: string | null; applicationStatus: string | null; questionSetId: string | null; questionSetAnswers: Record<string, string> | null }[] = [];
    if (interview.invitedCandidateIds && interview.invitedCandidateIds.length > 0) {
      // Task #227: project `phone` so the client multi-ID search can match
      // pasted Saudi mobile numbers against invitees (in addition to
      // nationalId / candidate UUID). Search remains invitee-scoped — no
      // global candidates lookup happens here or downstream.
      const candidateRows = await db.select({
        id: candidates.id,
        fullNameEn: candidates.fullNameEn,
        nationalId: candidates.nationalId,
        phone: candidates.phone,
        photoUrl: candidates.photoUrl,
      })
        .from(candidates)
        .where(inArray(candidates.id, interview.invitedCandidateIds));

      // Pick the "best" application per candidate. Selection priority — most
      // specific first, so the answers / status surfaced in the UI come from
      // the application that actually relates to this interview:
      //   1. interview.applicationId (explicit 1:1 binding when present)
      //   2. application whose job is in the same event as this interview
      //   3. highest status priority globally (legacy fallback)
      // The original implementation used #3 alone, which could surface answers
      // from an unrelated job when a candidate has multiple applications.
      const statusPriority: Record<string, number> = { hired: 6, offered: 5, interviewed: 4, shortlisted: 3, reviewing: 2, new: 1, rejected: 0, withdrawn: 0 };
      const appRows = await db.select({
        id: applications.id,
        candidateId: applications.candidateId,
        status: applications.status,
        jobId: applications.jobId,
        questionSetAnswers: applications.questionSetAnswers,
      })
        .from(applications)
        .where(inArray(applications.candidateId, interview.invitedCandidateIds));

      // Resolve each application's job → eventId + questionSetId in one shot.
      // We pull both fields so we can prefer same-event apps before reading
      // the question set for the chosen one.
      const jobIds = Array.from(new Set(appRows.map(a => a.jobId).filter((v): v is string => !!v)));
      const jobRows = jobIds.length > 0
        ? await db.select({ id: jobPostings.id, eventId: jobPostings.eventId, questionSetId: jobPostings.questionSetId }).from(jobPostings).where(inArray(jobPostings.id, jobIds))
        : [];
      const jobMetaMap = new Map(jobRows.map(j => [j.id, { eventId: j.eventId ?? null, questionSetId: j.questionSetId ?? null }]));

      invitedCandidates = candidateRows.map(c => {
        const candidateApps = appRows.filter(a => a.candidateId === c.id);
        // 1. Exact bound application.
        const boundApp = interview.applicationId
          ? candidateApps.find(a => a.id === interview.applicationId)
          : undefined;
        // 2. Same-event applications, ordered by status priority.
        const sameEventApps = interview.eventId
          ? candidateApps
              .filter(a => a.jobId && jobMetaMap.get(a.jobId)?.eventId === interview.eventId)
              .sort((a, b) => (statusPriority[b.status] ?? 0) - (statusPriority[a.status] ?? 0))
          : [];
        // 3. Global fallback by status priority.
        const anyApp = [...candidateApps].sort((a, b) => (statusPriority[b.status] ?? 0) - (statusPriority[a.status] ?? 0))[0];
        const best = boundApp ?? sameEventApps[0] ?? anyApp;

        // The answers blob on the application is { questionSetId, answers }.
        // We surface only the inner `answers` map; the questionSetId is read
        // from the job (authoritative — applications can be edited but the
        // job's question set is the one currently displayed in admin UIs).
        const answersBlob = best?.questionSetAnswers as { questionSetId?: string; answers?: Record<string, string> } | null | undefined;
        const answers = answersBlob && answersBlob.answers && typeof answersBlob.answers === "object"
          ? answersBlob.answers
          : null;
        const questionSetId = best?.jobId ? (jobMetaMap.get(best.jobId)?.questionSetId ?? null) : null;
        return {
          ...c,
          phone: c.phone ?? null,
          applicationId: best?.id ?? null,
          applicationStatus: best?.status ?? null,
          questionSetId,
          questionSetAnswers: answers,
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
    // Auto-complete elapsed interviews so the dashboard tile counts
    // reflect reality. See server/interview-auto-complete.ts.
    const { autoCompleteElapsedInterviews } = await import("./interview-auto-complete");
    await autoCompleteElapsedInterviews();
    // Archived interviews are excluded from every tile so the dashboard
    // reflects active (= not-yet-archived) work only.
    const notArchived = isNull(interviews.archivedAt);
    const [total] = await db.select({ value: count() }).from(interviews).where(notArchived);
    const [scheduledRow] = await db.select({ value: count() }).from(interviews).where(and(notArchived, eq(interviews.status, "scheduled")));
    const [completedRow] = await db.select({ value: count() }).from(interviews).where(and(notArchived, eq(interviews.status, "completed")));
    const [cancelledRow] = await db.select({ value: count() }).from(interviews).where(and(notArchived, eq(interviews.status, "cancelled")));

    return {
      total: Number(total.value),
      scheduled: Number(scheduledRow.value),
      completed: Number(completedRow.value),
      cancelled: Number(cancelledRow.value),
    };
  }

  // ─── Workforce ──────────────────────────────────────────────────────────────
  /**
   * Wrap a transaction that inserts into `workforce` with retry-on-collision.
   *
   * The advisory lock in `generateEmployeeNumber` is held for the duration of the
   * generating transaction, but pool eviction, connection drops, or a transaction
   * being rolled back mid-flight can still produce a window where two transactions
   * read the same MAX(employee_number) and one of them loses the unique-constraint
   * race (Postgres SQLSTATE 23505 on `workforce_employee_number_unique`). Once
   * 23505 fires, Postgres aborts the surrounding transaction — there is no in-place
   * retry — so the only correct fix is to re-run the entire txn body with a fresh
   * number. Up to 3 attempts; surfaces a clear error if all fail.
   */
  private async withEmployeeNumberRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
    let lastErr: any;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (e: any) {
        const code = e?.code ?? e?.cause?.code;
        const constraint = e?.constraint ?? e?.cause?.constraint ?? "";
        const msg = String(e?.message ?? "");
        const isEmpNumCollision =
          code === "23505" &&
          (constraint.includes("employee_number") || msg.includes("employee_number"));
        if (!isEmpNumCollision) throw e;
        lastErr = e;
        console.warn(
          `[workforce] employee_number collision (attempt ${attempt}/${maxAttempts}); regenerating…`,
        );
      }
    }
    const err: any = new Error(
      `Failed to allocate a unique employee number after ${maxAttempts} attempts. Please retry.`,
    );
    err.cause = lastErr;
    err.code = "EMPLOYEE_NUMBER_EXHAUSTED";
    throw err;
  }

  async generateEmployeeNumber(tx?: any): Promise<string> {
    const client = tx ?? db;
    await client.execute(sql`SELECT pg_advisory_xact_lock(1001)`);
    const [result] = await client.select({ maxNum: sql<string>`MAX(employee_number)` }).from(workforce);
    const maxNum = result?.maxNum;
    if (!maxNum) return "C000001";
    const numeric = parseInt(String(maxNum).substring(1), 10);
    const next = numeric + 1;
    return `C${String(next).padStart(6, "0")}`;
  }

  async getWorkforce(params?: { eventId?: string; isActive?: boolean; search?: string }): Promise<any[]> {
    const conditions = [];
    if (params?.eventId) conditions.push(eq(workforce.eventId, params.eventId));
    if (params?.isActive !== undefined) conditions.push(eq(workforce.isActive, params.isActive));
    if (params?.search) {
      const s = `%${params.search.toLowerCase()}%`;
      conditions.push(
        or(
          sql`LOWER(${candidates.fullNameEn}) LIKE ${s}`,
          sql`LOWER(${candidates.nationalId}) LIKE ${s}`,
          sql`LOWER(${workforce.employeeNumber}) LIKE ${s}`,
          sql`LOWER(${candidates.phone}) LIKE ${s}`,
        )!,
      );
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const rows = await db
      .select({
        id: workforce.id,
        employeeNumber: workforce.employeeNumber,
        candidateId: workforce.candidateId,
        jobId: workforce.jobId,
        eventId: workforce.eventId,
        salary: workforce.salary,
        startDate: workforce.startDate,
        endDate: workforce.endDate,
        terminationReason: workforce.terminationReason,
        terminationCategory: workforce.terminationCategory,
        isActive: workforce.isActive,
        offboardingStatus: workforce.offboardingStatus,
        supervisorId: workforce.supervisorId,
        performanceScore: workforce.performanceScore,
        notes: workforce.notes,
        createdAt: workforce.createdAt,
        updatedAt: workforce.updatedAt,
        fullNameEn: candidates.fullNameEn,
        nationalId: candidates.nationalId,
        phone: candidates.phone,
        photoUrl: candidates.photoUrl,
        candidateStatus: candidates.status,
        iban: candidates.ibanNumber,
        ibanBankName: candidates.ibanBankName,
        ibanBankCode: candidates.ibanBankCode,
        eventName: events.name,
        jobTitle: jobPostings.title,
        employmentType: workforce.employmentType,
        smpCompanyId: workforce.smpCompanyId,
        smpCompanyName: smpCompanies.name,
        email: candidates.email,
        dateOfBirth: candidates.dateOfBirth,
        gender: candidates.gender,
        nationalityText: candidates.nationalityText,
        maritalStatus: candidates.maritalStatus,
        city: candidates.city,
        region: candidates.region,
        iqamaNumber: candidates.iqamaNumber,
        educationLevel: candidates.educationLevel,
        university: candidates.university,
        major: candidates.major,
        skills: candidates.skills,
        languages: candidates.languages,
        emergencyContactName: candidates.emergencyContactName,
        emergencyContactPhone: candidates.emergencyContactPhone,
        ibanAccountFirstName: candidates.ibanAccountFirstName,
        ibanAccountLastName: candidates.ibanAccountLastName,
        positionId: workforce.positionId,
        positionTitle: positions.title,
        positionIsActive: positions.isActive,
        departmentName: departments.name,
      })
      .from(workforce)
      .leftJoin(candidates, eq(workforce.candidateId, candidates.id))
      .leftJoin(events, eq(workforce.eventId, events.id))
      .leftJoin(jobPostings, eq(workforce.jobId, jobPostings.id))
      .leftJoin(smpCompanies, eq(workforce.smpCompanyId, smpCompanies.id))
      .leftJoin(positions, eq(workforce.positionId, positions.id))
      .leftJoin(departments, eq(positions.departmentId, departments.id))
      .where(where)
      .orderBy(desc(workforce.createdAt));
    return rows;
  }

  async getWorkforceEmployee(id: string): Promise<any | undefined> {
    const [row] = await db
      .select({
        id: workforce.id,
        employeeNumber: workforce.employeeNumber,
        candidateId: workforce.candidateId,
        jobId: workforce.jobId,
        eventId: workforce.eventId,
        salary: workforce.salary,
        startDate: workforce.startDate,
        endDate: workforce.endDate,
        terminationReason: workforce.terminationReason,
        terminationCategory: workforce.terminationCategory,
        isActive: workforce.isActive,
        offboardingStatus: workforce.offboardingStatus,
        supervisorId: workforce.supervisorId,
        performanceScore: workforce.performanceScore,
        notes: workforce.notes,
        createdAt: workforce.createdAt,
        updatedAt: workforce.updatedAt,
        fullNameEn: candidates.fullNameEn,
        nationalId: candidates.nationalId,
        phone: candidates.phone,
        photoUrl: candidates.photoUrl,
        iban: candidates.ibanNumber,
        ibanBankName: candidates.ibanBankName,
        ibanBankCode: candidates.ibanBankCode,
        eventName: events.name,
        jobTitle: jobPostings.title,
        employmentType: workforce.employmentType,
        smpCompanyId: workforce.smpCompanyId,
        smpCompanyName: smpCompanies.name,
        email: candidates.email,
        dateOfBirth: candidates.dateOfBirth,
        gender: candidates.gender,
        nationalityText: candidates.nationalityText,
        maritalStatus: candidates.maritalStatus,
        city: candidates.city,
        region: candidates.region,
        iqamaNumber: candidates.iqamaNumber,
        educationLevel: candidates.educationLevel,
        university: candidates.university,
        major: candidates.major,
        skills: candidates.skills,
        languages: candidates.languages,
        emergencyContactName: candidates.emergencyContactName,
        emergencyContactPhone: candidates.emergencyContactPhone,
        ibanAccountFirstName: candidates.ibanAccountFirstName,
        ibanAccountLastName: candidates.ibanAccountLastName,
        positionId: workforce.positionId,
        positionTitle: positions.title,
        positionIsActive: positions.isActive,
        paymentMethod: workforce.paymentMethod,
        paymentMethodReason: workforce.paymentMethodReason,
      })
      .from(workforce)
      .leftJoin(candidates, eq(workforce.candidateId, candidates.id))
      .leftJoin(events, eq(workforce.eventId, events.id))
      .leftJoin(jobPostings, eq(workforce.jobId, jobPostings.id))
      .leftJoin(smpCompanies, eq(workforce.smpCompanyId, smpCompanies.id))
      .leftJoin(positions, eq(workforce.positionId, positions.id))
      .where(eq(workforce.id, id));
    return row;
  }

  async getWorkforceByCandidateId(candidateId: string): Promise<any | undefined> {
    const [row] = await db
      .select({
        id: workforce.id,
        employeeNumber: workforce.employeeNumber,
        candidateId: workforce.candidateId,
        jobId: workforce.jobId,
        eventId: workforce.eventId,
        employmentType: workforce.employmentType,
        salary: workforce.salary,
        startDate: workforce.startDate,
        endDate: workforce.endDate,
        terminationReason: workforce.terminationReason,
        isActive: workforce.isActive,
        supervisorId: workforce.supervisorId,
        performanceScore: workforce.performanceScore,
        notes: workforce.notes,
        createdAt: workforce.createdAt,
        updatedAt: workforce.updatedAt,
        fullNameEn: candidates.fullNameEn,
        nationalId: candidates.nationalId,
        phone: candidates.phone,
        photoUrl: candidates.photoUrl,
        iban: candidates.ibanNumber,
        ibanBankName: candidates.ibanBankName,
        ibanBankCode: candidates.ibanBankCode,
        eventName: events.name,
        jobTitle: jobPostings.title,
      })
      .from(workforce)
      .leftJoin(candidates, eq(workforce.candidateId, candidates.id))
      .leftJoin(events, eq(workforce.eventId, events.id))
      .leftJoin(jobPostings, eq(workforce.jobId, jobPostings.id))
      .where(and(eq(workforce.candidateId, candidateId), eq(workforce.isActive, true)))
      .orderBy(desc(workforce.createdAt))
      .limit(1);
    return row;
  }

  async getAllWorkforceByCandidateId(candidateId: string): Promise<any[]> {
    const rows = await db
      .select({
        id: workforce.id,
        employeeNumber: workforce.employeeNumber,
        candidateId: workforce.candidateId,
        jobId: workforce.jobId,
        eventId: workforce.eventId,
        employmentType: workforce.employmentType,
        salary: workforce.salary,
        startDate: workforce.startDate,
        endDate: workforce.endDate,
        terminationReason: workforce.terminationReason,
        terminationCategory: workforce.terminationCategory,
        offboardingCompletedAt: workforce.offboardingCompletedAt,
        isActive: workforce.isActive,
        notes: workforce.notes,
        createdAt: workforce.createdAt,
        eventName: events.name,
        jobTitle: jobPostings.title,
        positionId: workforce.positionId,
        positionTitle: positions.title,
        performanceScore: workforce.performanceScore,
        fullNameEn: candidates.fullNameEn,
        photoUrl: candidates.photoUrl,
      })
      .from(workforce)
      .leftJoin(candidates, eq(workforce.candidateId, candidates.id))
      .leftJoin(events, eq(workforce.eventId, events.id))
      .leftJoin(jobPostings, eq(workforce.jobId, jobPostings.id))
      .leftJoin(positions, eq(workforce.positionId, positions.id))
      .where(eq(workforce.candidateId, candidateId))
      .orderBy(desc(workforce.createdAt));
    return rows;
  }

  async getWorkHistory(nationalId: string): Promise<any[]> {
    const rows = await db
      .select({
        id: workforce.id,
        employeeNumber: workforce.employeeNumber,
        salary: workforce.salary,
        startDate: workforce.startDate,
        endDate: workforce.endDate,
        terminationReason: workforce.terminationReason,
        isActive: workforce.isActive,
        notes: workforce.notes,
        createdAt: workforce.createdAt,
        eventName: events.name,
        jobTitle: jobPostings.title,
        employmentType: workforce.employmentType,
      })
      .from(workforce)
      .leftJoin(candidates, eq(workforce.candidateId, candidates.id))
      .leftJoin(events, eq(workforce.eventId, events.id))
      .leftJoin(jobPostings, eq(workforce.jobId, jobPostings.id))
      .where(eq(candidates.nationalId, nationalId))
      .orderBy(desc(workforce.createdAt));
    return rows;
  }

  async getContractHistory(candidateId: string): Promise<any[]> {
    const rows = await db
      .select({
        id: candidateContracts.id,
        status: candidateContracts.status,
        signedAt: candidateContracts.signedAt,
        createdAt: candidateContracts.createdAt,
        snapshotArticles: candidateContracts.snapshotArticles,
        snapshotVariables: candidateContracts.snapshotVariables,
        generatedPdfUrl: candidateContracts.generatedPdfUrl,
        onboardingId: candidateContracts.onboardingId,
        templateId: candidateContracts.templateId,
        onboardingStatus: onboarding.status,
        onboardingConvertedAt: onboarding.convertedAt,
        eventName: events.name,
        jobTitle: jobPostings.title,
      })
      .from(candidateContracts)
      .leftJoin(onboarding, eq(candidateContracts.onboardingId, onboarding.id))
      .leftJoin(jobPostings, eq(onboarding.jobId, jobPostings.id))
      .leftJoin(events, eq(onboarding.eventId, events.id))
      .where(eq(candidateContracts.candidateId, candidateId))
      .orderBy(desc(candidateContracts.createdAt));
    return rows;
  }

  async createWorkforceRecord(record: InsertWorkforce): Promise<WorkforceRecord> {
    const [created] = await db.insert(workforce).values(record).returning();
    return created;
  }

  async updateWorkforceRecord(id: string, data: Partial<InsertWorkforce>): Promise<WorkforceRecord | undefined> {
    const [updated] = await db.update(workforce).set({ ...data, updatedAt: new Date() }).where(eq(workforce.id, id)).returning();
    return updated;
  }

  async terminateEmployee(id: string, data: { endDate: string; terminationReason?: string; terminationCategory?: string }): Promise<WorkforceRecord | undefined> {
    const [existing] = await db.select().from(workforce).where(eq(workforce.id, id));
    if (!existing) return undefined;
    if (!existing.isActive) throw new Error("Employee is already terminated");
    if (existing.offboardingStatus === "in_progress") throw new Error("Employee is already in offboarding");
    const [updated] = await db.update(workforce).set({
      endDate: data.endDate,
      terminationReason: data.terminationReason ?? null,
      terminationCategory: data.terminationCategory ?? null,
      offboardingStatus: "in_progress",
      offboardingStartedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(workforce.id, id)).returning();

    return updated;
  }

  async reinstateEmployee(nationalId: string, data: { startDate: string; eventId?: string; salary?: string; jobId?: string; employmentType?: "individual" | "smp"; smpCompanyId?: string }): Promise<WorkforceRecord> {
    return await this.withEmployeeNumberRetry(() => db.transaction(async (tx) => {
      const prevRecords = await tx
        .select({ employeeNumber: workforce.employeeNumber })
        .from(workforce)
        .leftJoin(candidates, eq(workforce.candidateId, candidates.id))
        .where(eq(candidates.nationalId, nationalId))
        .orderBy(desc(workforce.createdAt))
        .limit(1);

      const [cand] = await tx.select().from(candidates).where(eq(candidates.nationalId, nationalId));
      if (!cand) throw new Error("Candidate not found");

      const empNumber = prevRecords.length > 0 ? prevRecords[0].employeeNumber : await this.generateEmployeeNumber(tx);

      const [created] = await tx.insert(workforce).values({
        employeeNumber: empNumber,
        candidateId: cand.id,
        jobId: data.jobId ?? undefined,
        eventId: data.eventId ?? undefined,
        salary: data.salary ?? undefined,
        startDate: data.startDate,
        isActive: true,
        employmentType: data.employmentType ?? "individual",
        smpCompanyId: data.smpCompanyId ?? undefined,
      }).returning();

      await tx.update(candidates).set({ status: "hired", updatedAt: new Date() }).where(eq(candidates.id, cand.id));

      return created;
    }));
  }

  async getWorkforceStats(): Promise<{ total: number; active: number; inOffboarding: number; terminated: number; smpWorkers: number }> {
    // Task #192 — align the dashboard stats with the Golden Rule from
    // server/headcount.ts so the workforce page tiles agree with the
    // per-event headcount and the offboarding queue. Previously `active`
    // was a raw `isActive = true` count which over-reported by including
    // workers in offboarding and back-dated terminations whose endDate
    // had already passed. Now:
    //   • active         = Golden Rule (isActive=true, no offboarding,
    //                      endDate null or in the future)
    //   • inOffboarding  = isActive=true AND offboardingStatus IS NOT NULL
    //   • terminated     = total - active - inOffboarding
    //
    // Computing terminated as the complement (rather than `isActive=false`)
    // guarantees `active + inOffboarding + terminated == total` even when
    // a row is in the in-between state of `isActive=true` with no
    // offboarding but a back-dated `endDate` that has already passed.
    // That state is reachable today: PATCH /api/workforce/:id allows
    // editing endDate and isActive independently. Code review caught
    // this gap during the Task #192 audit.
    const [total] = await db.select({ value: count() }).from(workforce);
    const [activeRow] = await db.select({ value: count() }).from(workforce).where(activeWorkforceFilter());
    const [offboardingRow] = await db
      .select({ value: count() })
      .from(workforce)
      .where(and(eq(workforce.isActive, true), sql`${workforce.offboardingStatus} IS NOT NULL`));
    const [smpRow] = await db.select({ value: count() }).from(workforce).where(eq(workforce.employmentType, "smp"));

    const totalN = Number(total.value);
    const activeN = Number(activeRow.value);
    const offboardingN = Number(offboardingRow.value);
    const terminatedN = Math.max(0, totalN - activeN - offboardingN);

    return {
      total: totalN,
      active: activeN,
      inOffboarding: offboardingN,
      terminated: terminatedN,
      smpWorkers: Number(smpRow.value),
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

  // ─── Admin Alerts (broadcast in-app, recipientId IS NULL) ───────────────────
  async getAdminAlerts(limit = 50): Promise<Notification[]> {
    return db
      .select()
      .from(notifications)
      .where(and(isNull(notifications.recipientId), eq(notifications.type, "in_app")))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);
  }

  async createAdminAlert(subject: string, body: string, metadata?: Record<string, unknown>): Promise<Notification> {
    const [created] = await db
      .insert(notifications)
      .values({ type: "in_app", status: "pending", subject, body, metadata: metadata ?? null })
      .returning();
    return created;
  }

  async markAdminAlertRead(id: string): Promise<boolean> {
    const result = await db
      .update(notifications)
      .set({ status: "read", readAt: new Date() })
      .where(and(eq(notifications.id, id), isNull(notifications.recipientId)));
    return (result.rowCount ?? 0) > 0;
  }

  async markAllAdminAlertsRead(): Promise<number> {
    const result = await db
      .update(notifications)
      .set({ status: "read", readAt: new Date() })
      .where(and(isNull(notifications.recipientId), eq(notifications.type, "in_app"), eq(notifications.status, "pending")));
    return result.rowCount ?? 0;
  }

  async countUnreadAdminAlerts(): Promise<number> {
    const [row] = await db
      .select({ value: count() })
      .from(notifications)
      .where(and(isNull(notifications.recipientId), eq(notifications.type, "in_app"), eq(notifications.status, "pending")));
    return Number(row.value);
  }

  async getEventDateAlerts(): Promise<{ starting: Array<{ id: string; name: string; startDate: string; daysAway: number }>; ending: Array<{ id: string; name: string; endDate: string; daysAway: number }> }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const plus3 = new Date(today); plus3.setDate(today.getDate() + 3);
    const todayStr = today.toISOString().split("T")[0];
    const plus3Str = plus3.toISOString().split("T")[0];

    const rows = await db
      .select({ id: events.id, name: events.name, startDate: events.startDate, endDate: events.endDate, status: events.status })
      .from(events)
      .where(or(
        and(
          sql`${events.startDate} >= ${todayStr}`,
          sql`${events.startDate} <= ${plus3Str}`,
          sql`${events.status} IN ('upcoming', 'active')`
        ),
        and(
          sql`${events.endDate} IS NOT NULL`,
          sql`${events.endDate} >= ${todayStr}`,
          sql`${events.endDate} <= ${plus3Str}`,
          sql`${events.status} = 'active'`
        )
      ));

    const starting: Array<{ id: string; name: string; startDate: string; daysAway: number }> = [];
    const ending: Array<{ id: string; name: string; endDate: string; daysAway: number }> = [];

    for (const r of rows) {
      if (r.startDate) {
        const sd = new Date(r.startDate); sd.setHours(0,0,0,0);
        const daysAway = Math.round((sd.getTime() - today.getTime()) / 86400000);
        if (daysAway >= 0 && daysAway <= 3) {
          starting.push({ id: r.id, name: r.name, startDate: r.startDate, daysAway });
        }
      }
      if (r.endDate) {
        const ed = new Date(r.endDate); ed.setHours(0,0,0,0);
        const daysAway = Math.round((ed.getTime() - today.getTime()) / 86400000);
        if (daysAway >= 0 && daysAway <= 3) {
          ending.push({ id: r.id, name: r.name, endDate: r.endDate, daysAway });
        }
      }
    }

    return { starting, ending };
  }

  // ─── Assets ─────────────────────────────────────────────────────────────────
  async getAssets(includeInactive = false): Promise<Asset[]> {
    const rows = await db
      .select()
      .from(assets)
      .where(includeInactive ? undefined : eq(assets.isActive, true))
      .orderBy(asc(assets.name));
    return rows;
  }

  async getAsset(id: string): Promise<Asset | undefined> {
    const [row] = await db.select().from(assets).where(eq(assets.id, id));
    return row;
  }

  async createAsset(data: InsertAsset): Promise<Asset> {
    const [row] = await db.insert(assets).values(data).returning();
    return row;
  }

  async updateAsset(id: string, data: Partial<InsertAsset>): Promise<Asset | undefined> {
    const [row] = await db
      .update(assets)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(assets.id, id))
      .returning();
    return row;
  }

  async deleteAsset(id: string): Promise<boolean> {
    const result = await db.delete(assets).where(eq(assets.id, id)).returning({ id: assets.id });
    return result.length > 0;
  }

  // ─── Employee Assets ─────────────────────────────────────────────────────────
  async getEmployeeAssets(filters?: { workforceId?: string; status?: string; assetId?: string }): Promise<EmployeeAsset[]> {
    const conditions = [];
    if (filters?.workforceId) conditions.push(eq(employeeAssets.workforceId, filters.workforceId));
    if (filters?.assetId) conditions.push(eq(employeeAssets.assetId, filters.assetId));
    if (filters?.status) conditions.push(eq(employeeAssets.status, filters.status as any));
    const rows = await db
      .select()
      .from(employeeAssets)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(employeeAssets.createdAt));
    return rows;
  }

  async getEmployeeAsset(id: string): Promise<EmployeeAsset | undefined> {
    const [row] = await db.select().from(employeeAssets).where(eq(employeeAssets.id, id));
    return row;
  }

  async assignAsset(data: InsertEmployeeAsset): Promise<EmployeeAsset> {
    const [row] = await db.insert(employeeAssets).values(data).returning();
    return row;
  }

  async updateEmployeeAsset(id: string, data: Partial<InsertEmployeeAsset>): Promise<EmployeeAsset | undefined> {
    const [row] = await db
      .update(employeeAssets)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(employeeAssets.id, id))
      .returning();
    return row;
  }

  async deleteEmployeeAsset(id: string): Promise<boolean> {
    const result = await db.delete(employeeAssets).where(eq(employeeAssets.id, id)).returning({ id: employeeAssets.id });
    return result.length > 0;
  }

  async getUnreturnedAssetsForWorker(workforceId: string): Promise<Array<EmployeeAsset & { asset: Asset }>> {
    const rows = await db
      .select({ ea: employeeAssets, a: assets })
      .from(employeeAssets)
      .innerJoin(assets, eq(employeeAssets.assetId, assets.id))
      .where(and(eq(employeeAssets.workforceId, workforceId), eq(employeeAssets.status, "assigned")));
    return rows.map(r => ({ ...r.ea, asset: r.a }));
  }

  // ─── Dashboard ──────────────────────────────────────────────────────────────
  async getDashboardStats() {
    // Auto-complete elapsed interviews so the "scheduled interviews"
    // dashboard tile only counts truly upcoming work, not historical
    // rows whose end-time has already passed. See
    // server/interview-auto-complete.ts.
    const { autoCompleteElapsedInterviews } = await import("./interview-auto-complete");
    await autoCompleteElapsedInterviews();
    const [totalCandidates] = await db.select({ value: count() }).from(candidates).where(isNull(candidates.archivedAt));
    const [openPositions] = await db.select({ value: count() }).from(jobPostings).where(and(eq(jobPostings.status, "active"), isNull(jobPostings.archivedAt)));
    const [activeEvents] = await db.select({ value: count() }).from(events).where(and(eq(events.status, "active"), isNull(events.archivedAt)));
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

  // ─── SMP Documents ─────────────────────────────────────────────────────────
  async getSMPDocuments(smpCompanyId: string): Promise<SMPDocument[]> {
    return db.select().from(smpDocuments)
      .where(eq(smpDocuments.smpCompanyId, smpCompanyId))
      .orderBy(desc(smpDocuments.uploadedAt));
  }

  async createSMPDocument(data: InsertSMPDocument): Promise<SMPDocument> {
    const [doc] = await db.insert(smpDocuments).values(data).returning();
    return doc;
  }

  async deleteSMPDocument(id: string, smpCompanyId?: string): Promise<boolean> {
    const condition = smpCompanyId
      ? and(eq(smpDocuments.id, id), eq(smpDocuments.smpCompanyId, smpCompanyId))
      : eq(smpDocuments.id, id);
    const result = await db.delete(smpDocuments).where(condition).returning();
    return result.length > 0;
  }

  // ─── SMP Companies ─────────────────────────────────────────────────────────
  async getSMPCompanies(): Promise<SMPCompany[]> {
    return db.select().from(smpCompanies).orderBy(desc(smpCompanies.createdAt));
  }

  async getSMPCompany(id: string): Promise<SMPCompany | undefined> {
    const [c] = await db.select().from(smpCompanies).where(eq(smpCompanies.id, id));
    return c;
  }

  async createSMPCompany(data: InsertSMPCompany): Promise<SMPCompany> {
    const [c] = await db.insert(smpCompanies).values(data).returning();
    return c;
  }

  async updateSMPCompany(id: string, data: Partial<InsertSMPCompany>): Promise<SMPCompany | undefined> {
    const [c] = await db
      .update(smpCompanies)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(smpCompanies.id, id))
      .returning();
    return c;
  }

  async deleteSMPCompany(id: string): Promise<boolean> {
    const result = await db.delete(smpCompanies).where(eq(smpCompanies.id, id)).returning();
    return result.length > 0;
  }

  async getSMPCompanyWorkers(smpCompanyId: string): Promise<{
    id: string;
    employeeNumber: string;
    startDate: string | null;
    endDate: string | null;
    isActive: boolean;
    salary: string | null;
    fullNameEn: string | null;
    nationalId: string | null;
    phone: string | null;
    photoUrl: string | null;
    candidateId: string;
  }[]> {
    const rows = await db
      .select({
        id: workforce.id,
        employeeNumber: workforce.employeeNumber,
        startDate: workforce.startDate,
        endDate: workforce.endDate,
        isActive: workforce.isActive,
        salary: workforce.salary,
        fullNameEn: candidates.fullNameEn,
        nationalId: candidates.nationalId,
        phone: candidates.phone,
        photoUrl: candidates.photoUrl,
        candidateId: workforce.candidateId,
      })
      .from(workforce)
      .leftJoin(candidates, eq(workforce.candidateId, candidates.id))
      .where(eq(workforce.smpCompanyId, smpCompanyId))
      .orderBy(desc(workforce.createdAt));
    return rows;
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

  // Targeted "is this candidate already in the active onboarding pipeline?"
  // lookup. Returns the existing active row or undefined. "Active" means a
  // status that is NOT a terminal state (converted / rejected / terminated)
  // — those represent finished or abandoned pipelines that may be re-admitted.
  //
  // Used by the admit POST in place of `getOnboardingRecords({}).find(...)`,
  // which previously loaded the entire onboarding table into memory just to
  // answer this one question. With this method:
  //   - cost is constant (one indexed row read), not O(N)
  //   - admit-eligible eligibility check matches the SQL filter in
  //     `getAdmitEligibleCandidates` exactly, so a candidate that the dialog
  //     showed as eligible is the same candidate this guard will accept.
  async getActiveOnboardingByCandidateId(candidateId: string): Promise<OnboardingRecord | undefined> {
    const [rec] = await db
      .select()
      .from(onboarding)
      .where(and(
        eq(onboarding.candidateId, candidateId),
        sql`${onboarding.status} NOT IN ('converted', 'rejected', 'terminated')`,
      ))
      .limit(1);
    return rec;
  }

  // Tight, purpose-built query that powers the "Admit Candidate" dialog on
  // the onboarding page. Doing the eligibility filter in SQL — instead of
  // shipping every application+candidate row to the client and letting the
  // browser fan out the join — is what keeps the dialog opening in
  // milliseconds even on tenants with thousands of applications.
  //
  // Eligibility rules (must match `eligibleCandidates` in onboarding.tsx):
  //   - the application is currently shortlisted
  //   - the candidate is not archived
  //   - the candidate has NO active onboarding row (status NOT IN
  //     converted/rejected/terminated). An active row already covers them
  //     and re-admitting would create a duplicate pipeline.
  //   - dedupe by candidate, picking the most recent shortlisted application
  //     (the one whose appliedAt is greatest) — that is the application the
  //     admit flow will link onboarding to.
  //
  // Indexes leveraged: applications_status_idx (cuts the working set to
  // shortlisted), applications_candidate_idx (drives the DISTINCT ON
  // dedupe), and onboarding_status_idx (the NOT EXISTS sub-select).
  async getAdmitEligibleCandidates(): Promise<{
    id: string;
    fullNameEn: string;
    nationalId: string | null;
    phone: string | null;
    photoUrl: string | null;
    hasPhoto: boolean | null;
    hasIban: boolean | null;
    hasNationalId: boolean | null;
    hasVaccinationReport: boolean | null;
    classification: "individual" | "smp" | null;
    applicationId: string;
    jobId: string | null;
  }[]> {
    const result = await db.execute(sql`
      SELECT DISTINCT ON (a.candidate_id)
        c.id                       AS id,
        c.full_name_en             AS "fullNameEn",
        c.national_id              AS "nationalId",
        c.phone                    AS phone,
        c.photo_url                AS "photoUrl",
        c.has_photo                AS "hasPhoto",
        c.has_iban                 AS "hasIban",
        c.has_national_id          AS "hasNationalId",
        c.has_vaccination_report   AS "hasVaccinationReport",
        c.classification           AS classification,
        a.id                       AS "applicationId",
        a.job_id                   AS "jobId"
      FROM ${applications} a
      INNER JOIN ${candidates} c ON c.id = a.candidate_id
      WHERE a.status = 'shortlisted'
        AND c.archived_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM ${onboarding} o
          WHERE o.candidate_id = a.candidate_id
            AND o.status NOT IN ('converted', 'rejected', 'terminated')
        )
      ORDER BY a.candidate_id, a.applied_at DESC, a.id DESC
    `);
    const rows = ((result as any).rows ?? result) as any[];
    return rows.map(r => ({
      id: r.id,
      fullNameEn: r.fullNameEn,
      nationalId: r.nationalId ?? null,
      phone: r.phone ?? null,
      photoUrl: r.photoUrl ?? null,
      hasPhoto: r.hasPhoto ?? null,
      hasIban: r.hasIban ?? null,
      hasNationalId: r.hasNationalId ?? null,
      hasVaccinationReport: r.hasVaccinationReport ?? null,
      classification: r.classification ?? null,
      applicationId: r.applicationId,
      jobId: r.jobId ?? null,
    }));
  }

  async createOnboardingRecord(data: InsertOnboarding): Promise<OnboardingRecord> {
    const [rec] = await db.insert(onboarding).values(data).returning();
    return rec;
  }

  // Race-safe admit. Without this, two concurrent SELECT-then-INSERT calls
  // for the same candidate both saw "no active row" and both inserted,
  // producing duplicate onboarding rows. SELECT … FOR UPDATE alone does
  // NOT close that gap (Postgres has no predicate / gap lock here), so we
  // take a transaction-scoped advisory lock keyed on the candidate's id
  // — concurrent admits for the SAME candidate serialize on the lock; the
  // loser then sees the row the winner inserted and gets a 409. Admits
  // for different candidates run fully in parallel.
  async admitCandidateToOnboarding(
    data: InsertOnboarding,
  ): Promise<{ ok: true; record: OnboardingRecord } | { ok: false; reason: "duplicate"; existing: OnboardingRecord }> {
    return await db.transaction(async (tx) => {
      const candId = data.candidateId;
      if (!candId) {
        // SMP / no-candidate admits cannot collide on candidate_id.
        const [rec] = await tx.insert(onboarding).values(data).returning();
        return { ok: true as const, record: rec };
      }
      // pg_advisory_xact_lock auto-releases at COMMIT/ROLLBACK. hashtext
      // -> int4 fits the single-key signature.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${candId}))`);
      const [existing] = await tx
        .select()
        .from(onboarding)
        .where(and(
          eq(onboarding.candidateId, candId),
          sql`${onboarding.status} NOT IN ('converted', 'rejected', 'terminated')`,
        ))
        .limit(1);
      if (existing) {
        return { ok: false as const, reason: "duplicate" as const, existing };
      }
      const [rec] = await tx.insert(onboarding).values(data).returning();
      return { ok: true as const, record: rec };
    });
  }

  async updateOnboardingRecord(id: string, data: Partial<InsertOnboarding>): Promise<OnboardingRecord | undefined> {
    const [rec] = await db
      .update(onboarding)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(onboarding.id, id))
      .returning();
    return rec;
  }

  async deleteOnboardingRecord(id: string, tx?: any): Promise<boolean> {
    const exec = tx ?? db;
    const result = await exec.delete(onboarding).where(eq(onboarding.id, id)).returning();
    return result.length > 0;
  }

  async convertOnboardingToEmployee(
    id: string,
    employmentData: { startDate: string; eventId?: string; salary?: string; employmentType?: "individual" | "smp"; smpCompanyId?: string },
    convertedBy?: string,
  ): Promise<WorkforceRecord> {
    return await this.withEmployeeNumberRetry(() => db.transaction(async (tx) => {
      const [rec] = await tx.select().from(onboarding).where(eq(onboarding.id, id)).for("update");
      if (!rec) throw new Error("Onboarding record not found");
      if (rec.status === "converted") throw new Error("Already converted to employee");
      if (rec.status !== "ready") throw new Error(`Cannot convert — status is "${rec.status}", must be "ready"`);

      const [cand] = await tx.select().from(candidates).where(eq(candidates.id, rec.candidateId));
      const isSmpCandidate = cand?.classification === "smp" || !rec.applicationId;
      if (!isSmpCandidate && !rec.hasSignedContract && !rec.contractSignedAt) {
        throw new Error("Contract must be signed before conversion. Generate and have the candidate sign the employment contract first.");
      }

      let employeeNumber: string;
      if (cand?.nationalId) {
        const prev = await tx
          .select({ employeeNumber: workforce.employeeNumber })
          .from(workforce)
          .leftJoin(candidates, eq(workforce.candidateId, candidates.id))
          .where(eq(candidates.nationalId, cand.nationalId))
          .orderBy(desc(workforce.createdAt))
          .limit(1);
        employeeNumber = prev.length > 0 ? prev[0].employeeNumber : await this.generateEmployeeNumber(tx);
      } else {
        employeeNumber = await this.generateEmployeeNumber(tx);
      }

      const derivedEmploymentType: "individual" | "smp" =
        employmentData.employmentType ?? "individual";

      const [workforceRec] = await tx.insert(workforce).values({
        employeeNumber,
        candidateId: rec.candidateId,
        jobId: rec.jobId ?? undefined,
        eventId: employmentData.eventId ?? rec.eventId ?? undefined,
        smpCompanyId: employmentData.smpCompanyId ?? undefined,
        employmentType: derivedEmploymentType,
        salary: employmentData.salary && employmentData.salary.trim() !== "" ? employmentData.salary : undefined,
        startDate: employmentData.startDate,
        isActive: true,
      }).returning();

      await tx.update(onboarding).set({
        status: "converted",
        convertedAt: new Date(),
        convertedBy: convertedBy ?? null,
        updatedAt: new Date(),
      }).where(eq(onboarding.id, id));

      await tx.update(candidates).set({
        status: "hired",
        updatedAt: new Date(),
      }).where(eq(candidates.id, rec.candidateId));

      if (rec.applicationId) {
        await tx.update(applications).set({
          status: "hired",
          updatedAt: new Date(),
        }).where(eq(applications.id, rec.applicationId));
      }

      return workforceRec;
    }));
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
    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(1002)`);
      await tx.update(smsPlugins).set({ isActive: false, updatedAt: new Date() });
      const [p] = await tx
        .update(smsPlugins)
        .set({ isActive: true, updatedAt: new Date() })
        .where(eq(smsPlugins.id, id))
        .returning();
      return !!p;
    });
  }

  async deleteSmsPlugin(id: string): Promise<boolean> {
    const result = await db.delete(smsPlugins).where(eq(smsPlugins.id, id)).returning();
    return result.length > 0;
  }

  // ─── OTP Verifications ────────────────────────────────────────────────────

  async createOtpVerification(
    phone: string,
    code: string,
    expiresAt: Date,
    purpose: "registration" | "password_reset" = "registration",
  ): Promise<OtpVerification> {
    // OTP codes are stored as HMAC-SHA256 hex (peppered) — never plaintext.
    // See server/otp-hash.ts.
    const { hashOtp } = await import("./otp-hash");
    const [otp] = await db
      .insert(otpVerifications)
      .values({ phone, code: hashOtp(code), purpose, expiresAt, attempts: 0 })
      .returning();
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

  async getOtpVerificationById(id: string): Promise<OtpVerification | undefined> {
    const [otp] = await db
      .select()
      .from(otpVerifications)
      .where(eq(otpVerifications.id, id))
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

  /**
   * Atomic per-phone OTP quota: takes a Postgres transaction-scoped advisory
   * lock keyed on the phone number, re-counts recent rows under the lock, and
   * either inserts the new OTP or returns `{ ok: false }`. Closes the
   * check-then-insert race that previously let a fast burst exceed the cap.
   *
   * The advisory lock is per-phone (hashtext is fine for partitioning), so
   * concurrent OTP requests for *different* phones do not serialize.
   */
  async tryReserveAndCreateOtpVerification(
    phone: string,
    code: string,
    expiresAt: Date,
    purpose: "registration" | "password_reset",
    max: number,
    sinceMs: number,
  ): Promise<{ ok: true; otp: OtpVerification } | { ok: false }> {
    const { hashOtp } = await import("./otp-hash");
    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${phone}))`);
      const since = new Date(Date.now() - sinceMs);
      const [row] = await tx
        .select({ count: count() })
        .from(otpVerifications)
        .where(and(eq(otpVerifications.phone, phone), sql`${otpVerifications.createdAt} >= ${since}`));
      if (Number(row?.count ?? 0) >= max) {
        return { ok: false } as const;
      }
      const [otp] = await tx
        .insert(otpVerifications)
        .values({ phone, code: hashOtp(code), purpose, expiresAt, attempts: 0 })
        .returning();
      return { ok: true, otp } as const;
    });
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

  async createContractTemplateVersion(parent: ContractTemplate, overrides: { articles?: any; createdBy?: string }): Promise<ContractTemplate> {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(1005)`);
      const [latestParent] = await tx.select().from(contractTemplates).where(eq(contractTemplates.id, parent.id));
      if (!latestParent) throw new Error("Template not found");
      const nextVersion = latestParent.version + 1;
      const [newVersion] = await tx.insert(contractTemplates).values({
        name: parent.name,
        eventId: parent.eventId,
        version: nextVersion,
        parentTemplateId: parent.id,
        status: "draft",
        logoUrl: parent.logoUrl,
        companyName: parent.companyName,
        headerText: parent.headerText,
        footerText: parent.footerText,
        articles: overrides.articles ?? parent.articles,
        createdBy: overrides.createdBy ?? parent.createdBy,
      }).returning();
      await tx.update(contractTemplates).set({ status: "archived", updatedAt: new Date() }).where(eq(contractTemplates.id, parent.id));
      return newVersion;
    });
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

  async getSystemSetting(key: string): Promise<string | undefined> {
    const [row] = await db.select().from(systemSettings).where(eq(systemSettings.key, key));
    return row?.value;
  }

  async setSystemSetting(key: string, value: string): Promise<void> {
    await db
      .insert(systemSettings)
      .values({ key, value, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value, updatedAt: new Date() },
      });
  }

  // ─── ID Card Templates ──────────────────────────────────────────────────────
  async getIdCardTemplates(filters?: { eventId?: string }): Promise<IdCardTemplate[]> {
    const conditions: any[] = [];
    if (filters?.eventId) conditions.push(eq(idCardTemplates.eventId, filters.eventId));
    return db
      .select()
      .from(idCardTemplates)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(idCardTemplates.createdAt));
  }

  async getIdCardTemplate(id: string): Promise<IdCardTemplate | undefined> {
    const [row] = await db.select().from(idCardTemplates).where(eq(idCardTemplates.id, id));
    return row;
  }

  async getActiveIdCardTemplate(eventId?: string): Promise<IdCardTemplate | undefined> {
    const conditions = [eq(idCardTemplates.isActive, true)];
    if (eventId) conditions.push(eq(idCardTemplates.eventId, eventId));
    const [row] = await db
      .select()
      .from(idCardTemplates)
      .where(and(...conditions))
      .limit(1);
    if (row) return row;
    if (eventId) {
      const [fallback] = await db
        .select()
        .from(idCardTemplates)
        .where(and(eq(idCardTemplates.isActive, true), isNull(idCardTemplates.eventId)))
        .limit(1);
      return fallback;
    }
    return undefined;
  }

  async createIdCardTemplate(data: InsertIdCardTemplate): Promise<IdCardTemplate> {
    const [row] = await db.insert(idCardTemplates).values(data).returning();
    return row;
  }

  async updateIdCardTemplate(id: string, data: Partial<InsertIdCardTemplate>): Promise<IdCardTemplate | undefined> {
    const [row] = await db
      .update(idCardTemplates)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(idCardTemplates.id, id))
      .returning();
    return row;
  }

  async deleteIdCardTemplate(id: string): Promise<boolean> {
    const result = await db.delete(idCardTemplates).where(eq(idCardTemplates.id, id)).returning();
    return result.length > 0;
  }

  async activateIdCardTemplate(id: string): Promise<boolean> {
    const template = await this.getIdCardTemplate(id);
    if (!template) return false;
    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(1003)`);
      await tx
        .update(idCardTemplates)
        .set({ isActive: false, updatedAt: new Date() })
        .where(
          template.eventId
            ? eq(idCardTemplates.eventId, template.eventId)
            : isNull(idCardTemplates.eventId)
        );
      const [updated] = await tx
        .update(idCardTemplates)
        .set({ isActive: true, updatedAt: new Date() })
        .where(eq(idCardTemplates.id, id))
        .returning();
      return !!updated;
    });
  }

  // ─── Printer Plugins ────────────────────────────────────────────────────────
  async getPrinterPlugins(): Promise<PrinterPlugin[]> {
    return db.select().from(printerPlugins).orderBy(desc(printerPlugins.createdAt));
  }

  async getPrinterPlugin(id: string): Promise<PrinterPlugin | undefined> {
    const [row] = await db.select().from(printerPlugins).where(eq(printerPlugins.id, id));
    return row;
  }

  async getActivePrinterPlugin(): Promise<PrinterPlugin | undefined> {
    const [row] = await db
      .select()
      .from(printerPlugins)
      .where(eq(printerPlugins.isActive, true))
      .limit(1);
    return row;
  }

  async createPrinterPlugin(data: InsertPrinterPlugin): Promise<PrinterPlugin> {
    const [row] = await db.insert(printerPlugins).values(data).returning();
    return row;
  }

  async updatePrinterPlugin(id: string, data: Partial<InsertPrinterPlugin>): Promise<PrinterPlugin | undefined> {
    const [row] = await db
      .update(printerPlugins)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(printerPlugins.id, id))
      .returning();
    return row;
  }

  async deletePrinterPlugin(id: string): Promise<boolean> {
    const result = await db.delete(printerPlugins).where(eq(printerPlugins.id, id)).returning();
    return result.length > 0;
  }

  async activatePrinterPlugin(id: string): Promise<boolean> {
    const target = await this.getPrinterPlugin(id);
    if (!target) return false;
    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(1004)`);
      await tx.update(printerPlugins).set({ isActive: false, updatedAt: new Date() });
      const [updated] = await tx
        .update(printerPlugins)
        .set({ isActive: true, updatedAt: new Date() })
        .where(eq(printerPlugins.id, id))
        .returning();
      return !!updated;
    });
  }

  // ─── ID Card Print Logs ─────────────────────────────────────────────────────
  async getIdCardPrintLogs(filters?: { employeeId?: string; templateId?: string; printedBy?: string; limit?: number }): Promise<Record<string, unknown>[]> {
    const conditions: ReturnType<typeof eq>[] = [];
    if (filters?.employeeId) conditions.push(eq(idCardPrintLogs.employeeId, filters.employeeId));
    if (filters?.templateId) conditions.push(eq(idCardPrintLogs.templateId, filters.templateId));
    if (filters?.printedBy) conditions.push(eq(idCardPrintLogs.printedBy, filters.printedBy));

    const rows = await db
      .select({
        id: idCardPrintLogs.id,
        employeeId: idCardPrintLogs.employeeId,
        templateId: idCardPrintLogs.templateId,
        printedBy: idCardPrintLogs.printedBy,
        printerPluginId: idCardPrintLogs.printerPluginId,
        status: idCardPrintLogs.status,
        printedAt: idCardPrintLogs.printedAt,
        employeeNumber: workforce.employeeNumber,
        employeeName: candidates.fullNameEn,
        templateName: idCardTemplates.name,
        printedByName: users.fullName,
      })
      .from(idCardPrintLogs)
      .leftJoin(workforce, eq(idCardPrintLogs.employeeId, workforce.id))
      .leftJoin(candidates, eq(workforce.candidateId, candidates.id))
      .leftJoin(idCardTemplates, eq(idCardPrintLogs.templateId, idCardTemplates.id))
      .leftJoin(users, eq(idCardPrintLogs.printedBy, users.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(idCardPrintLogs.printedAt))
      .limit(filters?.limit ?? 200);

    return rows;
  }

  async createIdCardPrintLog(data: InsertIdCardPrintLog): Promise<IdCardPrintLog> {
    const [row] = await db.insert(idCardPrintLogs).values(data).returning();
    return row;
  }

  async bulkCreateIdCardPrintLogs(data: InsertIdCardPrintLog[]): Promise<IdCardPrintLog[]> {
    if (data.length === 0) return [];
    return db.insert(idCardPrintLogs).values(data).returning();
  }


  async getLastPrintDate(employeeId: string): Promise<Date | null> {
    const [row] = await db
      .select({ printedAt: idCardPrintLogs.printedAt })
      .from(idCardPrintLogs)
      .where(eq(idCardPrintLogs.employeeId, employeeId))
      .orderBy(desc(idCardPrintLogs.printedAt))
      .limit(1);
    return row?.printedAt ?? null;
  }

  // ─── Shifts ─────────────────────────────────────────────────────────────────
  async getShifts(): Promise<Shift[]> {
    return db.select().from(shifts).orderBy(asc(shifts.name));
  }

  async getShift(id: string): Promise<Shift | undefined> {
    const [row] = await db.select().from(shifts).where(eq(shifts.id, id));
    return row;
  }

  async createShift(data: InsertShift): Promise<Shift> {
    const [row] = await db.insert(shifts).values(data).returning();
    return row;
  }

  async updateShift(id: string, data: Partial<InsertShift>): Promise<Shift | undefined> {
    const [row] = await db.update(shifts).set({ ...data, updatedAt: new Date() }).where(eq(shifts.id, id)).returning();
    return row;
  }

  async deleteShift(id: string): Promise<boolean> {
    const result = await db.delete(shifts).where(eq(shifts.id, id)).returning();
    return result.length > 0;
  }

  // ─── Schedule Templates ──────────────────────────────────────────────────────
  async getScheduleTemplates(filters?: { eventId?: string }): Promise<ScheduleTemplate[]> {
    const conditions = [];
    if (filters?.eventId) conditions.push(eq(scheduleTemplates.eventId, filters.eventId));
    return db.select().from(scheduleTemplates)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(asc(scheduleTemplates.name));
  }

  async getScheduleTemplate(id: string): Promise<ScheduleTemplate | undefined> {
    const [row] = await db.select().from(scheduleTemplates).where(eq(scheduleTemplates.id, id));
    return row;
  }

  async createScheduleTemplate(data: InsertScheduleTemplate): Promise<ScheduleTemplate> {
    const [row] = await db.insert(scheduleTemplates).values(data).returning();
    return row;
  }

  async updateScheduleTemplate(id: string, data: Partial<InsertScheduleTemplate>): Promise<ScheduleTemplate | undefined> {
    const [row] = await db.update(scheduleTemplates).set({ ...data, updatedAt: new Date() }).where(eq(scheduleTemplates.id, id)).returning();
    return row;
  }

  async deleteScheduleTemplate(id: string): Promise<boolean> {
    const result = await db.delete(scheduleTemplates).where(eq(scheduleTemplates.id, id)).returning();
    return result.length > 0;
  }

  // ─── Schedule Assignments ────────────────────────────────────────────────────
  async checkScheduleOverlap(workforceId: string, startDate: string, endDate: string | null, excludeId?: string): Promise<boolean> {
    const conditions = [
      eq(scheduleAssignments.workforceId, workforceId),
      sql`${scheduleAssignments.startDate} < ${endDate ?? "9999-12-31"}`,
      or(isNull(scheduleAssignments.endDate), sql`${scheduleAssignments.endDate} > ${startDate}`),
    ];
    if (excludeId) conditions.push(sql`${scheduleAssignments.id} != ${excludeId}`);
    const rows = await db.select({ id: scheduleAssignments.id }).from(scheduleAssignments)
      .where(and(...conditions));
    return rows.length > 0;
  }

  async getScheduleAssignments(filters?: { workforceId?: string; templateId?: string; activeOnly?: boolean }): Promise<ScheduleAssignment[]> {
    const conditions = [];
    if (filters?.workforceId) conditions.push(eq(scheduleAssignments.workforceId, filters.workforceId));
    if (filters?.templateId) conditions.push(eq(scheduleAssignments.templateId, filters.templateId));
    if (filters?.activeOnly) {
      const today = new Date().toISOString().slice(0, 10);
      conditions.push(sql`(${scheduleAssignments.endDate} IS NULL OR ${scheduleAssignments.endDate} > ${today})`);
    }
    return db.select().from(scheduleAssignments)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(scheduleAssignments.startDate));
  }

  async getScheduleAssignment(id: string): Promise<ScheduleAssignment | undefined> {
    const [row] = await db.select().from(scheduleAssignments).where(eq(scheduleAssignments.id, id));
    return row;
  }

  async getActiveAssignmentForEmployee(workforceId: string): Promise<ScheduleAssignment | undefined> {
    const today = new Date().toISOString().slice(0, 10);
    const [row] = await db.select().from(scheduleAssignments)
      .where(and(
        eq(scheduleAssignments.workforceId, workforceId),
        sql`${scheduleAssignments.startDate} <= ${today}`,
        or(isNull(scheduleAssignments.endDate), sql`${scheduleAssignments.endDate} > ${today}`)
      ))
      .orderBy(desc(scheduleAssignments.startDate))
      .limit(1);
    return row;
  }

  async createScheduleAssignment(data: InsertScheduleAssignment): Promise<ScheduleAssignment> {
    const [row] = await db.insert(scheduleAssignments).values(data).returning();
    return row;
  }

  async updateScheduleAssignment(id: string, data: Partial<InsertScheduleAssignment>): Promise<ScheduleAssignment | undefined> {
    const [row] = await db.update(scheduleAssignments).set({ ...data, updatedAt: new Date() }).where(eq(scheduleAssignments.id, id)).returning();
    return row;
  }

  async deleteScheduleAssignment(id: string): Promise<boolean> {
    const result = await db.delete(scheduleAssignments).where(eq(scheduleAssignments.id, id)).returning();
    return result.length > 0;
  }

  async endScheduleAssignment(id: string, endDate: string): Promise<ScheduleAssignment | undefined> {
    const [row] = await db.update(scheduleAssignments)
      .set({ endDate, updatedAt: new Date() })
      .where(eq(scheduleAssignments.id, id))
      .returning();
    return row;
  }

  async bulkAssignSchedule(workforceIds: string[], templateId: string, startDate: string, assignedBy?: string, endDate?: string | null): Promise<{ assigned: number; ended: number; skipped: number }> {
    const resolvedEndDate = endDate ?? null;
    return await db.transaction(async (tx) => {
      let ended = 0;
      let assigned = 0;
      let skipped = 0;
      for (const wid of workforceIds) {
        const allExisting = await tx.select().from(scheduleAssignments).where(eq(scheduleAssignments.workforceId, wid)).orderBy(desc(scheduleAssignments.createdAt));
        for (const existing of allExisting) {
          const existsEnd = existing.endDate ?? "9999-12-31";
          const newEnd = resolvedEndDate ?? "9999-12-31";
          const overlaps = existing.startDate < newEnd && existsEnd > startDate;
          if (overlaps) {
            if (existing.startDate < startDate) {
              await tx.update(scheduleAssignments).set({ endDate: startDate, updatedAt: new Date() }).where(eq(scheduleAssignments.id, existing.id));
              ended++;
            } else {
              await tx.delete(scheduleAssignments).where(eq(scheduleAssignments.id, existing.id));
              ended++;
            }
          }
        }
        await tx.insert(scheduleAssignments).values({ workforceId: wid, templateId, startDate, endDate: resolvedEndDate, assignedBy: assignedBy ?? null });
        assigned++;
      }
      return { assigned, ended, skipped };
    });
  }

  // ─── Attendance Records ──────────────────────────────────────────────────────
  async getAttendanceRecords(filters?: { workforceId?: string; dateFrom?: string; dateTo?: string; date?: string }): Promise<AttendanceRecord[]> {
    const conditions = [];
    if (filters?.workforceId) conditions.push(eq(attendanceRecords.workforceId, filters.workforceId));
    if (filters?.date) conditions.push(eq(attendanceRecords.date, filters.date));
    if (filters?.dateFrom) conditions.push(sql`${attendanceRecords.date} >= ${filters.dateFrom}`);
    if (filters?.dateTo) conditions.push(sql`${attendanceRecords.date} <= ${filters.dateTo}`);
    return db.select().from(attendanceRecords)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(attendanceRecords.date));
  }

  async getAttendanceRecord(id: string): Promise<AttendanceRecord | undefined> {
    const [row] = await db.select().from(attendanceRecords).where(eq(attendanceRecords.id, id));
    return row;
  }

  async getAttendanceForEmployee(workforceId: string, dateFrom: string, dateTo: string): Promise<AttendanceRecord[]> {
    return db.select().from(attendanceRecords)
      .where(and(
        eq(attendanceRecords.workforceId, workforceId),
        sql`${attendanceRecords.date} >= ${dateFrom}`,
        sql`${attendanceRecords.date} <= ${dateTo}`
      ))
      .orderBy(asc(attendanceRecords.date));
  }

  async upsertAttendanceRecord(data: InsertAttendanceRecord): Promise<AttendanceRecord> {
    const [row] = await db.insert(attendanceRecords).values(data)
      .onConflictDoUpdate({
        target: [attendanceRecords.workforceId, attendanceRecords.date],
        set: { status: data.status, clockIn: data.clockIn, clockOut: data.clockOut, minutesScheduled: data.minutesScheduled, minutesWorked: data.minutesWorked, notes: data.notes, recordedBy: data.recordedBy, updatedAt: new Date() },
      })
      .returning();
    return row;
  }

  async deleteAttendanceRecord(id: string): Promise<boolean> {
    const result = await db.delete(attendanceRecords).where(eq(attendanceRecords.id, id)).returning();
    return result.length > 0;
  }

  async getWorkedDaySummary(workforceIds: string[], dateFrom: string, dateTo: string): Promise<Array<{ workforceId: string; workedDays: number; absentDays: number; lateDays: number; excusedDays: number; totalScheduledDays: number; totalMinutesWorked: number; totalMinutesScheduled: number; totalMinutesLate: number }>> {
    if (workforceIds.length === 0) return [];
    const rows = await db.select({
      workforceId: attendanceRecords.workforceId,
      status: attendanceRecords.status,
      cnt: count(attendanceRecords.id),
      sumMinutesWorked: sql<number>`COALESCE(SUM(${attendanceRecords.minutesWorked}), 0)`,
      sumMinutesScheduled: sql<number>`COALESCE(SUM(${attendanceRecords.minutesScheduled}), 0)`,
    })
      .from(attendanceRecords)
      .where(and(
        inArray(attendanceRecords.workforceId, workforceIds),
        sql`${attendanceRecords.date} >= ${dateFrom}`,
        sql`${attendanceRecords.date} <= ${dateTo}`
      ))
      .groupBy(attendanceRecords.workforceId, attendanceRecords.status);

    const map: Record<string, { workedDays: number; absentDays: number; lateDays: number; excusedDays: number; totalScheduledDays: number; totalMinutesWorked: number; totalMinutesScheduled: number; totalMinutesLate: number }> = {};
    for (const wid of workforceIds) {
      map[wid] = { workedDays: 0, absentDays: 0, lateDays: 0, excusedDays: 0, totalScheduledDays: 0, totalMinutesWorked: 0, totalMinutesScheduled: 0, totalMinutesLate: 0 };
    }
    for (const r of rows) {
      const entry = map[r.workforceId];
      if (!entry) continue;
      const n = Number(r.cnt);
      const mw = Number(r.sumMinutesWorked);
      const ms = Number(r.sumMinutesScheduled);
      entry.totalScheduledDays += n;
      entry.totalMinutesWorked += mw;
      entry.totalMinutesScheduled += ms;
      if (r.status === "present") entry.workedDays += n;
      else if (r.status === "absent") { entry.absentDays += n; }
      else if (r.status === "late") { entry.lateDays += n; entry.workedDays += n; entry.totalMinutesLate += Math.max(0, ms - mw); }
      else if (r.status === "excused") entry.excusedDays += n;
    }
    return workforceIds.map(wid => ({ workforceId: wid, ...map[wid] }));
  }

  // ─── Offboarding ────────────────────────────────────────────────────────────

  async getOffboardingEmployees(): Promise<any[]> {
    const today = new Date().toISOString().slice(0, 10);
    // Auto-eligible: active + event ended + not yet completed offboarding
    // In-progress: explicitly started
    const rows = await db
      .select({
        id: workforce.id,
        employeeNumber: workforce.employeeNumber,
        candidateId: workforce.candidateId,
        salary: workforce.salary,
        startDate: workforce.startDate,
        endDate: workforce.endDate,
        eventId: workforce.eventId,
        isActive: workforce.isActive,
        offboardingStatus: workforce.offboardingStatus,
        offboardingStartedAt: workforce.offboardingStartedAt,
        offboardingCompletedAt: workforce.offboardingCompletedAt,
        employmentType: workforce.employmentType,
        terminationReason: workforce.terminationReason,
        terminationCategory: workforce.terminationCategory,
        notes: workforce.notes,
        fullNameEn: candidates.fullNameEn,
        nationalId: candidates.nationalId,
        phone: candidates.phone,
        photoUrl: candidates.photoUrl,
        eventName: events.name,
        eventEndDate: events.endDate,
        eventStartDate: events.startDate,
      })
      .from(workforce)
      .leftJoin(candidates, eq(workforce.candidateId, candidates.id))
      .leftJoin(events, eq(workforce.eventId, events.id))
      .where(
        and(
          eq(workforce.isActive, true),
          sql`(
            ${workforce.offboardingStatus} = 'in_progress'
            OR (
              ${workforce.offboardingStatus} IS NULL
              AND ${events.endDate} IS NOT NULL
              AND ${events.endDate} < ${today}
            )
          )`
        )
      )
      .orderBy(desc(workforce.createdAt));
    return rows;
  }

  async getOffboardingStats(): Promise<{ pending: number; inProgress: number; ready: number; completedToday: number }> {
    const today = new Date().toISOString().slice(0, 10);
    const todayStart = new Date(today + "T00:00:00.000Z");

    const [pendingRow] = await db.select({ value: count() }).from(workforce)
      .leftJoin(events, eq(workforce.eventId, events.id))
      .where(and(
        eq(workforce.isActive, true),
        sql`${workforce.offboardingStatus} IS NULL AND ${events.endDate} IS NOT NULL AND ${events.endDate} < ${today}`
      ));

    const [inProgressRow] = await db.select({ value: count() }).from(workforce)
      .where(and(eq(workforce.isActive, true), sql`${workforce.offboardingStatus} = 'in_progress'`));

    const [completedTodayRow] = await db.select({ value: count() }).from(workforce)
      .where(and(
        sql`${workforce.offboardingStatus} = 'completed'`,
        sql`${workforce.offboardingCompletedAt} >= ${todayStart}`
      ));

    const inProgressIds = await db.select({ id: workforce.id }).from(workforce)
      .where(and(eq(workforce.isActive, true), sql`${workforce.offboardingStatus} = 'in_progress'`));
    let readyCount = 0;
    if (inProgressIds.length > 0) {
      const unconfirmedCounts = await db.select({
        workforceId: employeeAssets.workforceId,
        cnt: count(),
      }).from(employeeAssets)
        .where(and(
          sql`${employeeAssets.workforceId} IN (${sql.join(inProgressIds.map(r => sql`${r.id}`), sql`, `)})`,
          eq(employeeAssets.status, "assigned"),
        ))
        .groupBy(employeeAssets.workforceId);
      const unconfirmedSet = new Set(unconfirmedCounts.map(r => r.workforceId));
      readyCount = inProgressIds.filter(r => !unconfirmedSet.has(r.id)).length;
    }

    return {
      pending: Number(pendingRow.value),
      inProgress: Number(inProgressRow.value),
      ready: readyCount,
      completedToday: Number(completedTodayRow.value),
    };
  }

  async getOffboardingSettlement(workforceId: string): Promise<any> {
    const emp = await this.getWorkforceEmployee(workforceId);
    if (!emp) throw new Error("Employee not found");

    const today = new Date().toISOString().slice(0, 10);
    const start = emp.startDate ?? today;
    let eventEndDate: string | null = null;
    if (emp.eventId) {
      const [ev] = await db.select({ endDate: events.endDate }).from(events).where(eq(events.id, emp.eventId));
      if (ev?.endDate) eventEndDate = ev.endDate;
    }
    const end = emp.endDate ?? (eventEndDate && eventEndDate < today ? eventEndDate : today);
    const startMs = new Date(start).getTime();
    const endMs = new Date(end).getTime();
    const calendarDays = Math.max(0, Math.round((endMs - startMs) / 86400000) + 1);
    const salary = parseFloat(emp.salary ?? "0");

    const attendanceRows = await this.getAttendanceForEmployee(workforceId, start, end);

    const totalMinutesWorked = attendanceRows.reduce((sum, r) => sum + (r.minutesWorked ?? 0), 0);
    const totalMinutesScheduled = attendanceRows.reduce((sum, r) => sum + (r.minutesScheduled ?? 0), 0);
    const workedDays = attendanceRows.filter(r => r.status === "present" || r.status === "late").length;
    const absentDays = attendanceRows.filter(r => r.status === "absent").length;
    const excusedDays = attendanceRows.filter(r => r.status === "excused").length;
    const loggedDays = attendanceRows.length;

    let grossPay: number;
    let dailyRate: number;
    let perMinuteRate: number | null = null;

    dailyRate = salary / 30;
    if (totalMinutesScheduled > 0) {
      perMinuteRate = salary / 30 / (totalMinutesScheduled / loggedDays);
      grossPay = Math.round(totalMinutesWorked * perMinuteRate * 100) / 100;
    } else {
      grossPay = 0;
    }

    const empAssets = await this.getEmployeeAssets({ workforceId });
    const allAssets = await this.getAssets(true);
    const assetMap: Record<string, any> = {};
    for (const a of allAssets) assetMap[a.id] = a;

    const deductions: any[] = [];
    let totalDeductions = 0;
    for (const ea of empAssets) {
      if (ea.status === "not_returned" && ea.deductionWaived !== true) {
        const assetData = assetMap[ea.assetId];
        const price = parseFloat(assetData?.price ?? "0");
        deductions.push({
          assetId: ea.assetId,
          employeeAssetId: ea.id,
          assetName: assetData?.name ?? "Unknown Asset",
          price,
          deductionWaived: ea.deductionWaived,
        });
        totalDeductions += price;
      }
    }

    const netSettlement = Math.max(0, grossPay - totalDeductions);

    const assetChecklist = empAssets.map(ea => ({
      ...ea,
      assetName: assetMap[ea.assetId]?.name ?? "Unknown",
      assetPrice: parseFloat(assetMap[ea.assetId]?.price ?? "0"),
      assetCategory: assetMap[ea.assetId]?.category ?? null,
    }));
    const allAssetsConfirmed = assetChecklist.every(ea => ea.status !== "assigned");

    return {
      employee: emp,
      period: { start, end, calendarDays },
      salary: { monthly: salary, daily: Math.round(dailyRate * 100) / 100, gross: grossPay, perMinuteRate: perMinuteRate ? Math.round(perMinuteRate * 10000) / 10000 : null },
      attendance: { workedDays, absentDays, excusedDays, loggedDays, total: attendanceRows.length, totalMinutesWorked, totalMinutesScheduled },
      deductions,
      totalDeductions: Math.round(totalDeductions * 100) / 100,
      netSettlement: Math.round(netSettlement * 100) / 100,
      assetChecklist,
      allAssetsConfirmed,
    };
  }

  async startOffboarding(workforceId: string, startedBy?: string): Promise<any> {
    const [existing] = await db.select().from(workforce).where(eq(workforce.id, workforceId));
    if (!existing) throw new Error("Employee not found");
    if (!existing.isActive) throw new Error("Employee is not active");
    if (existing.offboardingStatus === "in_progress") throw new Error("Offboarding already in progress");
    if (existing.offboardingStatus === "completed") throw new Error("Offboarding already completed");

    const [updated] = await db
      .update(workforce)
      .set({ offboardingStatus: "in_progress", offboardingStartedAt: new Date(), updatedAt: new Date() })
      .where(eq(workforce.id, workforceId))
      .returning();
    return updated;
  }

  async completeOffboarding(workforceId: string, completedBy?: string): Promise<any> {
    const assets = await this.getEmployeeAssets({ workforceId });
    const unconfirmed = assets.filter(a => a.status === "assigned");
    if (unconfirmed.length > 0) throw new Error(`${unconfirmed.length} asset(s) still need confirmation before completing offboarding`);

    const [wf] = await db.select().from(workforce).where(eq(workforce.id, workforceId));
    if (!wf) throw new Error("Employee not found");

    const today = new Date().toISOString().slice(0, 10);
    const start = wf.startDate ?? today;
    const end = wf.endDate ?? today;
    let finalGrossPay = "0";
    let finalDeductions = "0";
    let finalNetSettlement = "0";
    try {
      const calc = await this.calculatePayroll(workforceId, start, end);
      finalGrossPay = String(calc.grossEarned);
      finalDeductions = String(calc.totalDeductions);
      finalNetSettlement = String(calc.netPayable);
    } catch (_e) {}

    return await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(workforce)
        .set({
          offboardingStatus: "completed",
          offboardingCompletedAt: new Date(),
          isActive: false,
          finalGrossPay,
          finalDeductions,
          finalNetSettlement,
          updatedAt: new Date(),
        })
        .where(eq(workforce.id, workforceId))
        .returning();

      await tx.update(payRunLines)
        .set({ tranche2Status: "pending", tranche2BlockedReason: null })
        .where(and(
          eq(payRunLines.workforceId, workforceId),
          eq(payRunLines.tranche2Status, "blocked"),
        ));

      const otherActive = await tx
        .select({ id: workforce.id })
        .from(workforce)
        .where(and(eq(workforce.candidateId, wf.candidateId), eq(workforce.isActive, true)))
        .limit(1);
      if (otherActive.length === 0) {
        await tx.update(candidates).set({ status: "available", updatedAt: new Date() }).where(eq(candidates.id, wf.candidateId));
      }

      await tx.update(applications)
        .set({ status: "closed", updatedAt: new Date() })
        .where(and(eq(applications.candidateId, wf.candidateId), eq(applications.status, "hired")));

      await tx.update(onboarding)
        .set({ status: "terminated", updatedAt: new Date() })
        .where(and(eq(onboarding.candidateId, wf.candidateId), eq(onboarding.status, "converted")));

      return updated;
    });
  }

  async reassignEmployeeEvent(workforceId: string, eventId: string): Promise<any> {
    const [updated] = await db
      .update(workforce)
      .set({
        eventId,
        endDate: null,
        terminationReason: null,
        terminationCategory: null,
        offboardingStatus: null,
        offboardingStartedAt: null,
        offboardingCompletedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(workforce.id, workforceId))
      .returning();
    return updated;
  }

  async confirmAssetReturn(assetId: string, status: "returned" | "not_returned", confirmedBy?: string): Promise<EmployeeAsset> {
    const now = new Date();
    const [updated] = await db
      .update(employeeAssets)
      .set({
        status,
        confirmedAt: now,
        confirmedBy: confirmedBy ?? null,
        returnedAt: status === "returned" ? now.toISOString().slice(0, 10) : null,
        updatedAt: now,
      })
      .where(eq(employeeAssets.id, assetId))
      .returning();
    return updated;
  }

  async waiveAssetDeduction(assetId: string, waivedBy: string): Promise<EmployeeAsset> {
    // Fetch current status - must be not_returned
    const [existing] = await db.select().from(employeeAssets).where(eq(employeeAssets.id, assetId));
    if (!existing) throw new Error("Asset assignment not found");
    if (existing.status !== "not_returned") throw new Error("Can only waive deductions for unreturned assets");
    if (existing.deductionWaived === true) throw new Error("Deduction has already been waived — this action is irreversible");

    const [updated] = await db
      .update(employeeAssets)
      .set({ deductionWaived: true, deductionWaivedBy: waivedBy, deductionWaivedAt: new Date(), updatedAt: new Date() })
      .where(eq(employeeAssets.id, assetId))
      .returning();
    return updated;
  }

  async bulkConfirmAssets(workforceId: string, status: "returned" | "not_returned", confirmedBy?: string): Promise<number> {
    const now = new Date();
    const result = await db
      .update(employeeAssets)
      .set({
        status,
        confirmedAt: now,
        confirmedBy: confirmedBy ?? null,
        returnedAt: status === "returned" ? now.toISOString().slice(0, 10) : null,
        updatedAt: now,
      })
      .where(and(eq(employeeAssets.workforceId, workforceId), eq(employeeAssets.status, "assigned")));
    return (result as any).rowCount ?? 0;
  }

  async bulkUpdateAssetStatus(ids: string[], status: "returned" | "not_returned"): Promise<number> {
    if (ids.length === 0) return 0;
    const now = new Date();
    const result = await db
      .update(employeeAssets)
      .set({
        status,
        returnedAt: status === "returned" ? now.toISOString().slice(0, 10) : null,
        updatedAt: now,
      })
      .where(inArray(employeeAssets.id, ids));
    return (result as any).rowCount ?? ids.length;
  }

  async bulkAssignAsset(assetId: string, workforceIds: string[], assignedAt: string, notes?: string): Promise<{ created: number; skipped: number }> {
    const uniqueIds = [...new Set(workforceIds)];
    if (uniqueIds.length === 0) return { created: 0, skipped: 0 };
    return await db.transaction(async (tx) => {
      const existing = await tx
        .select({ workforceId: employeeAssets.workforceId })
        .from(employeeAssets)
        .where(and(eq(employeeAssets.assetId, assetId), eq(employeeAssets.status, "assigned"), inArray(employeeAssets.workforceId, uniqueIds)));
      const existingSet = new Set(existing.map(e => e.workforceId));
      const toInsert = uniqueIds.filter(wId => !existingSet.has(wId));
      if (toInsert.length > 0) {
        const batchSize = 500;
        for (let i = 0; i < toInsert.length; i += batchSize) {
          const batch = toInsert.slice(i, i + batchSize);
          await tx.insert(employeeAssets).values(batch.map(wId => ({
            assetId,
            workforceId: wId,
            assignedAt,
            status: "assigned" as const,
            notes: notes || null,
          })));
        }
      }
      return { created: toInsert.length, skipped: existingSet.size };
    });
  }

  async createAuditLog(data: InsertAuditLog, tx?: any): Promise<AuditLog> {
    const exec = tx ?? db;
    const [row] = await exec.insert(auditLogs).values(data).returning();
    return row;
  }

  async globalSearch(query: string): Promise<{
    candidates: { id: string; title: string; subtitle: string; href: string }[];
    employees: { id: string; title: string; subtitle: string; href: string }[];
    events: { id: string; title: string; subtitle: string; href: string }[];
    jobs: { id: string; title: string; subtitle: string; href: string }[];
  }> {
    const q = `%${query.toLowerCase()}%`;

    const [rawCandidates, rawEmployees, rawEvents, rawJobs] = await Promise.all([
      // Candidates by name, nationalId, or phone
      db.select({
        id: candidates.id,
        fullNameEn: candidates.fullNameEn,
        nationalId: candidates.nationalId,
        phone: candidates.phone,
      }).from(candidates)
        .where(or(
          sql`LOWER(${candidates.fullNameEn}) LIKE ${q}`,
          sql`LOWER(COALESCE(${candidates.nationalId}, '')) LIKE ${q}`,
          sql`LOWER(COALESCE(${candidates.phone}, '')) LIKE ${q}`,
        ))
        .limit(6),

      // Workforce (employees) by employeeNumber or candidate name
      db.select({
        id: workforce.id,
        employeeNumber: workforce.employeeNumber,
        fullNameEn: candidates.fullNameEn,
        jobId: workforce.jobId,
      }).from(workforce)
        .leftJoin(candidates, eq(workforce.candidateId, candidates.id))
        .where(or(
          sql`LOWER(${workforce.employeeNumber}) LIKE ${q}`,
          sql`LOWER(COALESCE(${candidates.fullNameEn}, '')) LIKE ${q}`,
        ))
        .limit(6),

      // Events by name
      db.select({
        id: events.id,
        name: events.name,
        status: events.status,
        eventType: events.eventType,
      }).from(events)
        .where(sql`LOWER(${events.name}) LIKE ${q}`)
        .limit(6),

      // Jobs by title
      db.select({
        id: jobPostings.id,
        title: jobPostings.title,
        status: jobPostings.status,
      }).from(jobPostings)
        .where(sql`LOWER(${jobPostings.title}) LIKE ${q}`)
        .limit(6),
    ]);

    return {
      candidates: rawCandidates.map(c => ({
        id: c.id,
        title: c.fullNameEn ?? "(Unknown)",
        subtitle: c.nationalId ?? c.phone ?? "No ID",
        href: `/talent?highlight=${c.id}`,
      })),
      employees: rawEmployees.map(e => ({
        id: e.id,
        title: e.fullNameEn ?? e.employeeNumber,
        subtitle: `Employee #${e.employeeNumber}`,
        href: `/workforce?highlight=${e.id}`,
      })),
      events: rawEvents.map(ev => ({
        id: ev.id,
        title: ev.name,
        subtitle: ev.status.charAt(0).toUpperCase() + ev.status.slice(1) + (ev.eventType === "ongoing" ? " · Ongoing" : ""),
        href: `/events`,
      })),
      jobs: rawJobs.map(j => ({
        id: j.id,
        title: j.title,
        subtitle: j.status.charAt(0).toUpperCase() + j.status.slice(1),
        href: `/job-posting`,
      })),
    };
  }

  async getAuditLogs(params?: { page?: number; limit?: number; search?: string; entityType?: string; actorId?: string }): Promise<{ data: AuditLog[]; total: number }> {
    const page = params?.page ?? 1;
    const limit = params?.limit ?? 50;
    const offset = (page - 1) * limit;
    const where = this.buildAuditLogWhere(params);
    const [data, [{ cnt }]] = await Promise.all([
      db.select().from(auditLogs).where(where).orderBy(desc(auditLogs.createdAt)).limit(limit).offset(offset),
      db.select({ cnt: count() }).from(auditLogs).where(where),
    ]);
    return { data, total: Number(cnt) };
  }

  private buildAuditLogWhere(params?: { search?: string; entityType?: string; actorId?: string; cursor?: string }) {
    const conditions: any[] = [];
    if (params?.entityType) conditions.push(eq(auditLogs.entityType, params.entityType));
    if (params?.actorId) conditions.push(eq(auditLogs.actorId, params.actorId));
    if (params?.search) {
      const s = `%${params.search.toLowerCase()}%`;
      conditions.push(or(
        sql`LOWER(${auditLogs.description}) LIKE ${s}`,
        sql`LOWER(${auditLogs.actorName}) LIKE ${s}`,
        sql`LOWER(${auditLogs.employeeNumber}) LIKE ${s}`,
        sql`LOWER(${auditLogs.subjectName}) LIKE ${s}`,
      )!);
    }
    if (params?.cursor) {
      const cursorDate = new Date(params.cursor);
      if (!isNaN(cursorDate.getTime())) {
        conditions.push(sql`${auditLogs.createdAt} < ${cursorDate}`);
      }
    }
    return conditions.length > 0 ? and(...conditions) : undefined;
  }

  async getAuditLogsCursor(params: { cursor?: string; limit: number; search?: string; entityType?: string; actorId?: string }): Promise<{ data: AuditLog[]; total: number; nextCursor: string | null }> {
    const limit = Math.min(Math.max(params.limit, 1), 200);
    const filterWhere = this.buildAuditLogWhere({ search: params.search, entityType: params.entityType, actorId: params.actorId });
    const pageWhere = this.buildAuditLogWhere(params);
    const [data, [{ cnt }]] = await Promise.all([
      db.select().from(auditLogs).where(pageWhere).orderBy(desc(auditLogs.createdAt), desc(auditLogs.id)).limit(limit + 1),
      db.select({ cnt: count() }).from(auditLogs).where(filterWhere),
    ]);
    let nextCursor: string | null = null;
    let trimmed = data;
    if (data.length > limit) {
      trimmed = data.slice(0, limit);
      const lastRow = trimmed[trimmed.length - 1];
      nextCursor = lastRow?.createdAt ? new Date(lastRow.createdAt).toISOString() : null;
    }
    return { data: trimmed, total: Number(cnt), nextCursor };
  }

  async *iterateAuditLogsForExport(params: { search?: string; entityType?: string; actorId?: string; chunkSize?: number; maxRows: number }): AsyncGenerator<AuditLog[], void, unknown> {
    const chunkSize = Math.min(params.chunkSize ?? 2000, 5000);
    let cursor: string | undefined;
    let yielded = 0;
    while (yielded < params.maxRows) {
      const remaining = params.maxRows - yielded;
      const take = Math.min(chunkSize, remaining);
      const where = this.buildAuditLogWhere({ search: params.search, entityType: params.entityType, actorId: params.actorId, cursor });
      const rows = await db.select().from(auditLogs).where(where).orderBy(desc(auditLogs.createdAt), desc(auditLogs.id)).limit(take);
      if (rows.length === 0) return;
      yield rows;
      yielded += rows.length;
      if (rows.length < take) return;
      const last = rows[rows.length - 1];
      cursor = last?.createdAt ? new Date(last.createdAt).toISOString() : undefined;
      if (!cursor) return;
    }
  }

  // ─── Inbox Items ────────────────────────────────────────────────────────────
  async getInboxItems(params?: { status?: string; type?: string; priority?: string; page?: number; limit?: number; search?: string; sortBy?: string; sortOrder?: string }): Promise<{ data: InboxItem[]; total: number }> {
    const page = params?.page ?? 1;
    const limit = params?.limit ?? 50;
    const offset = (page - 1) * limit;
    const conditions = [];
    if (params?.status) conditions.push(sql`${inboxItems.status} = ${params.status}`);
    if (params?.type) conditions.push(sql`${inboxItems.type} = ${params.type}`);
    if (params?.priority) conditions.push(sql`${inboxItems.priority} = ${params.priority}`);
    if (params?.search) {
      const s = `%${params.search.toLowerCase()}%`;
      conditions.push(or(
        sql`LOWER(${inboxItems.title}) LIKE ${s}`,
        sql`LOWER(${inboxItems.body}) LIKE ${s}`,
      )!);
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const orderFn = params?.sortOrder === "asc" ? asc : desc;
    const orderCol = params?.sortBy === "priority" ? inboxItems.priority
      : params?.sortBy === "type" ? inboxItems.type
      : inboxItems.createdAt;
    const [data, [{ cnt }]] = await Promise.all([
      db.select().from(inboxItems).where(where).orderBy(orderFn(orderCol)).limit(limit).offset(offset),
      db.select({ cnt: count() }).from(inboxItems).where(where),
    ]);
    return { data, total: Number(cnt) };
  }

  async getInboxItem(id: string): Promise<InboxItem | undefined> {
    const [item] = await db.select().from(inboxItems).where(eq(inboxItems.id, id));
    return item;
  }

  async createInboxItem(data: InsertInboxItem): Promise<InboxItem> {
    const [item] = await db.insert(inboxItems).values(data).returning();
    return item;
  }

  async resolveInboxItem(id: string, resolvedBy: string, resolutionNotes?: string): Promise<InboxItem | undefined> {
    const [item] = await db
      .update(inboxItems)
      .set({ status: "resolved", resolvedBy, resolvedAt: new Date(), resolutionNotes: resolutionNotes ?? null })
      .where(and(eq(inboxItems.id, id), eq(inboxItems.status, "pending")))
      .returning();
    return item;
  }

  async dismissInboxItem(id: string, resolvedBy: string, resolutionNotes?: string): Promise<InboxItem | undefined> {
    const [item] = await db
      .update(inboxItems)
      .set({ status: "dismissed", resolvedBy, resolvedAt: new Date(), resolutionNotes: resolutionNotes ?? null })
      .where(and(eq(inboxItems.id, id), eq(inboxItems.status, "pending")))
      .returning();
    return item;
  }

  async bulkResolveInboxItems(ids: string[], resolvedBy: string): Promise<number> {
    if (ids.length === 0) return 0;
    const updated = await db
      .update(inboxItems)
      .set({ status: "resolved", resolvedBy, resolvedAt: new Date() })
      .where(and(inArray(inboxItems.id, ids), eq(inboxItems.status, "pending")))
      .returning({ id: inboxItems.id });
    return updated.length;
  }

  async bulkDismissInboxItems(ids: string[], resolvedBy: string): Promise<number> {
    if (ids.length === 0) return 0;
    const updated = await db
      .update(inboxItems)
      .set({ status: "dismissed", resolvedBy, resolvedAt: new Date() })
      .where(and(inArray(inboxItems.id, ids), eq(inboxItems.status, "pending")))
      .returning({ id: inboxItems.id });
    return updated.length;
  }

  async countOpenInboxItems(): Promise<number> {
    const [{ cnt }] = await db.select({ cnt: count() }).from(inboxItems).where(eq(inboxItems.status, "pending"));
    return Number(cnt);
  }

  // ─── Geofence Zones ────────────────────────────────────────────────────────
  async getGeofenceZones(includeInactive = false): Promise<GeofenceZone[]> {
    if (includeInactive) {
      return db.select().from(geofenceZones).orderBy(desc(geofenceZones.createdAt));
    }
    return db.select().from(geofenceZones).where(eq(geofenceZones.isActive, true)).orderBy(desc(geofenceZones.createdAt));
  }

  async getGeofenceZone(id: string): Promise<GeofenceZone | undefined> {
    const [zone] = await db.select().from(geofenceZones).where(eq(geofenceZones.id, id));
    return zone;
  }

  async createGeofenceZone(data: InsertGeofenceZone): Promise<GeofenceZone> {
    const [zone] = await db.insert(geofenceZones).values(data).returning();
    return zone;
  }

  async updateGeofenceZone(id: string, data: Partial<InsertGeofenceZone>): Promise<GeofenceZone | undefined> {
    const [zone] = await db.update(geofenceZones).set({ ...data, updatedAt: new Date() }).where(eq(geofenceZones.id, id)).returning();
    return zone;
  }

  async deleteGeofenceZone(id: string): Promise<boolean> {
    const result = await db.delete(geofenceZones).where(eq(geofenceZones.id, id)).returning();
    return result.length > 0;
  }

  // ─── Attendance Submissions ────────────────────────────────────────────────
  async getAttendanceSubmissions(filters?: { workforceId?: string; status?: string; page?: number; limit?: number }): Promise<{ data: AttendanceSubmission[]; total: number }> {
    const conditions = [];
    if (filters?.workforceId) conditions.push(eq(attendanceSubmissions.workforceId, filters.workforceId));
    if (filters?.status) {
      const validStatuses = ["pending", "verified", "flagged", "rejected"] as const;
      const s = filters.status as typeof validStatuses[number];
      if (validStatuses.includes(s)) conditions.push(eq(attendanceSubmissions.status, s));
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 50;
    const offset = (page - 1) * limit;

    const [{ cnt }] = await db.select({ cnt: count() }).from(attendanceSubmissions).where(where);
    const data = await db.select().from(attendanceSubmissions).where(where).orderBy(desc(attendanceSubmissions.submittedAt)).limit(limit).offset(offset);
    return { data, total: Number(cnt) };
  }

  async getAttendanceSubmission(id: string): Promise<AttendanceSubmission | undefined> {
    const [sub] = await db.select().from(attendanceSubmissions).where(eq(attendanceSubmissions.id, id));
    return sub;
  }

  async createAttendanceSubmission(data: InsertAttendanceSubmission): Promise<AttendanceSubmission> {
    const [sub] = await db.insert(attendanceSubmissions).values(data).returning();
    return sub;
  }

  async updateAttendanceSubmission(id: string, data: Partial<InsertAttendanceSubmission>): Promise<AttendanceSubmission | undefined> {
    const [sub] = await db.update(attendanceSubmissions).set(data).where(eq(attendanceSubmissions.id, id)).returning();
    return sub;
  }

  // ─── Photo Change Requests ──────────────────────────────────────────────────
  async getPhotoChangeRequests(filters?: { candidateId?: string; status?: string }): Promise<PhotoChangeRequest[]> {
    const conditions: any[] = [];
    if (filters?.candidateId) conditions.push(eq(photoChangeRequests.candidateId, filters.candidateId));
    if (filters?.status) conditions.push(eq(photoChangeRequests.status, filters.status as any));
    return db.select().from(photoChangeRequests)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(photoChangeRequests.createdAt));
  }

  async getPhotoChangeRequest(id: string): Promise<PhotoChangeRequest | undefined> {
    const [req] = await db.select().from(photoChangeRequests).where(eq(photoChangeRequests.id, id));
    return req;
  }

  async createPhotoChangeRequest(data: InsertPhotoChangeRequest): Promise<PhotoChangeRequest> {
    const [req] = await db.insert(photoChangeRequests).values(data).returning();
    return req;
  }

  async updatePhotoChangeRequest(id: string, data: Partial<InsertPhotoChangeRequest> & { reviewedBy?: string; reviewedAt?: Date; reviewNotes?: string | null }): Promise<PhotoChangeRequest | undefined> {
    const [req] = await db.update(photoChangeRequests).set(data).where(eq(photoChangeRequests.id, id)).returning();
    return req;
  }

  // ─── Departments ─────────────────────────────────────────────────────────────
  async getDepartments(includeInactive?: boolean): Promise<Department[]> {
    const conditions = includeInactive ? undefined : eq(departments.isActive, true);
    return db.select().from(departments).where(conditions).orderBy(asc(departments.sortOrder), asc(departments.name));
  }

  async getDepartment(id: string): Promise<Department | undefined> {
    const [dept] = await db.select().from(departments).where(eq(departments.id, id));
    return dept;
  }

  async createDepartment(data: InsertDepartment): Promise<Department> {
    const [dept] = await db.insert(departments).values(data).returning();
    return dept;
  }

  async updateDepartment(id: string, data: Partial<InsertDepartment>): Promise<Department | undefined> {
    const [dept] = await db.update(departments).set(data).where(eq(departments.id, id)).returning();
    return dept;
  }

  async toggleDepartmentActive(id: string): Promise<{ success: boolean; error?: string; department?: Department }> {
    const dept = await this.getDepartment(id);
    if (!dept) return { success: false, error: "Department not found" };

    if (dept.isActive) {
      const activePositions = await db.select({ id: positions.id, title: positions.title }).from(positions)
        .where(and(eq(positions.departmentId, id), eq(positions.isActive, true)));
      if (activePositions.length > 0) {
        const posNames = activePositions.map(p => p.title).join(", ");
        return { success: false, error: `Cannot deactivate: ${activePositions.length} active position(s) in this department (${posNames}). Deactivate them first.` };
      }
    }

    const [updated] = await db.update(departments).set({ isActive: !dept.isActive }).where(eq(departments.id, id)).returning();
    return { success: true, department: updated };
  }

  // ─── Positions ───────────────────────────────────────────────────────────────
  async getPositions(departmentId: string, includeInactive?: boolean): Promise<Position[]> {
    const conditions = [eq(positions.departmentId, departmentId)];
    if (!includeInactive) conditions.push(eq(positions.isActive, true));
    return db.select().from(positions).where(and(...conditions)).orderBy(asc(positions.sortOrder), asc(positions.title));
  }

  async getAllPositions(includeInactive?: boolean): Promise<(Position & { departmentName?: string | null })[]> {
    const conditions = includeInactive ? undefined : eq(positions.isActive, true);
    const rows = await db.select({
      id: positions.id,
      departmentId: positions.departmentId,
      parentPositionId: positions.parentPositionId,
      title: positions.title,
      code: positions.code,
      description: positions.description,
      gradeLevel: positions.gradeLevel,
      isActive: positions.isActive,
      sortOrder: positions.sortOrder,
      createdAt: positions.createdAt,
      departmentName: departments.name,
    }).from(positions)
      .leftJoin(departments, eq(positions.departmentId, departments.id))
      .where(conditions)
      .orderBy(asc(departments.name), asc(positions.sortOrder), asc(positions.title));
    return rows;
  }

  async getPosition(id: string): Promise<Position | undefined> {
    const [pos] = await db.select().from(positions).where(eq(positions.id, id));
    return pos;
  }

  async createPosition(data: InsertPosition): Promise<Position> {
    const [pos] = await db.insert(positions).values(data).returning();
    return pos;
  }

  async updatePosition(id: string, data: Partial<InsertPosition>): Promise<Position | undefined> {
    const [pos] = await db.update(positions).set(data).where(eq(positions.id, id)).returning();
    return pos;
  }

  async togglePositionActive(id: string): Promise<{ success: boolean; error?: string; position?: Position; affectedEmployees?: { id: string; employeeNumber: string; fullNameEn: string | null }[] }> {
    const pos = await this.getPosition(id);
    if (!pos) return { success: false, error: "Position not found" };

    if (pos.isActive) {
      const activeChildren = await db.select({ id: positions.id, title: positions.title }).from(positions)
        .where(and(eq(positions.parentPositionId, id), eq(positions.isActive, true)));
      if (activeChildren.length > 0) {
        const childNames = activeChildren.map(c => c.title).join(", ");
        return { success: false, error: `Cannot deactivate: ${activeChildren.length} active child position(s) exist (${childNames}). Deactivate or reassign them first.` };
      }

      const activeEmployees = await db.select({
        id: workforce.id,
        employeeNumber: workforce.employeeNumber,
        fullNameEn: candidates.fullNameEn,
      }).from(workforce)
        .leftJoin(candidates, eq(workforce.candidateId, candidates.id))
        .where(and(eq(workforce.positionId, id), eq(workforce.isActive, true)));
      if (activeEmployees.length > 0) {
        const empNames = activeEmployees.map(e => `${e.employeeNumber} (${e.fullNameEn ?? "Unknown"})`).join(", ");
        return {
          success: false,
          error: `Cannot deactivate: ${activeEmployees.length} active employee(s) assigned — ${empNames}. Reassign them first.`,
          affectedEmployees: activeEmployees,
        };
      }
    }

    const [updated] = await db.update(positions).set({ isActive: !pos.isActive }).where(eq(positions.id, id)).returning();
    return { success: true, position: updated };
  }

  // ─── SMS Broadcasts ─────────────────────────────────────────────────────────
  async createSmsBroadcast(data: InsertSmsBroadcast): Promise<SmsBroadcast> {
    const [row] = await db.insert(smsBroadcasts).values(data).returning();
    return row;
  }

  async getSmsBroadcasts(params?: { page?: number; limit?: number }): Promise<{ data: SmsBroadcast[]; total: number }> {
    const page = params?.page ?? 1;
    const limit = params?.limit ?? 20;
    const offset = (page - 1) * limit;
    const [{ value: total }] = await db.select({ value: count() }).from(smsBroadcasts);
    const data = await db.select().from(smsBroadcasts).orderBy(desc(smsBroadcasts.createdAt)).limit(limit).offset(offset);
    return { data, total };
  }

  async getSmsBroadcast(id: string): Promise<SmsBroadcast | undefined> {
    const [row] = await db.select().from(smsBroadcasts).where(eq(smsBroadcasts.id, id));
    return row;
  }

  async updateSmsBroadcast(id: string, data: Partial<SmsBroadcast>): Promise<SmsBroadcast | undefined> {
    const [row] = await db.update(smsBroadcasts).set(data).where(eq(smsBroadcasts.id, id)).returning();
    return row;
  }

  async createSmsBroadcastRecipient(data: InsertSmsBroadcastRecipient): Promise<SmsBroadcastRecipient> {
    const [row] = await db.insert(smsBroadcastRecipients).values(data).returning();
    return row;
  }

  async getSmsBroadcastRecipients(broadcastId: string): Promise<SmsBroadcastRecipient[]> {
    return db.select().from(smsBroadcastRecipients).where(eq(smsBroadcastRecipients.broadcastId, broadcastId)).orderBy(smsBroadcastRecipients.recipientName);
  }

  async updateSmsBroadcastRecipient(id: string, data: Partial<SmsBroadcastRecipient>): Promise<SmsBroadcastRecipient | undefined> {
    const [row] = await db.update(smsBroadcastRecipients).set(data).where(eq(smsBroadcastRecipients.id, id)).returning();
    return row;
  }

  async createExcuseRequest(data: InsertExcuseRequest): Promise<ExcuseRequest> {
    const [row] = await db.insert(excuseRequests).values(data).returning();
    return row;
  }

  async getExcuseRequest(id: string): Promise<ExcuseRequest | undefined> {
    const [row] = await db.select().from(excuseRequests).where(eq(excuseRequests.id, id));
    return row;
  }

  async getExcuseRequests(params: { workforceId?: string; status?: string }): Promise<ExcuseRequest[]> {
    const conditions: any[] = [];
    if (params.workforceId) conditions.push(eq(excuseRequests.workforceId, params.workforceId));
    if (params.status) conditions.push(eq(excuseRequests.status, params.status as any));
    return db.select().from(excuseRequests)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(excuseRequests.submittedAt));
  }

  async updateExcuseRequest(id: string, data: Partial<ExcuseRequest>): Promise<ExcuseRequest | undefined> {
    const [row] = await db.update(excuseRequests).set(data).where(eq(excuseRequests.id, id)).returning();
    return row;
  }

  async countPendingExcuseRequests(): Promise<number> {
    const [result] = await db.select({ value: count() }).from(excuseRequests).where(eq(excuseRequests.status, "pending"));
    return result?.value ?? 0;
  }

  // ─── Pay Runs ───────────────────────────────────────────────────────────────
  async createPayRun(data: InsertPayRun): Promise<PayRun> {
    const [row] = await db.insert(payRuns).values(data).returning();
    return row;
  }

  async getPayRuns(): Promise<PayRun[]> {
    return db.select().from(payRuns).orderBy(desc(payRuns.createdAt));
  }

  async getPayRun(id: string): Promise<PayRun | undefined> {
    const [row] = await db.select().from(payRuns).where(eq(payRuns.id, id));
    return row;
  }

  async updatePayRun(id: string, data: Partial<PayRun>): Promise<PayRun | undefined> {
    const [row] = await db.update(payRuns).set({ ...data, updatedAt: new Date() }).where(eq(payRuns.id, id)).returning();
    return row;
  }

  async getPayRunLines(payRunId: string): Promise<PayRunLine[]> {
    return db.select().from(payRunLines).where(eq(payRunLines.payRunId, payRunId));
  }

  async getPayRunLine(id: string): Promise<PayRunLine | undefined> {
    const [row] = await db.select().from(payRunLines).where(eq(payRunLines.id, id));
    return row;
  }

  async updatePayRunLine(id: string, data: Partial<PayRunLine>): Promise<PayRunLine | undefined> {
    const [row] = await db.update(payRunLines).set(data).where(eq(payRunLines.id, id)).returning();
    return row;
  }

  // ─── Payroll Calculation Engine ─────────────────────────────────────────────
  async calculatePayroll(workforceId: string, dateFrom: string, dateTo: string) {
    const emp = await this.getWorkforceEmployee(workforceId);
    if (!emp) throw new Error("Employee not found");

    const salary = parseFloat(emp.salary ?? "0");
    const effectiveTo = emp.endDate && emp.endDate < dateTo ? emp.endDate : dateTo;
    const effectiveFrom = emp.startDate > dateFrom ? emp.startDate : dateFrom;

    if (effectiveFrom > effectiveTo) {
      return {
        totalScheduledMinutes: 0, totalWorkedMinutes: 0, daysWorked: 0,
        excusedDays: 0, absentDays: 0, lateMinutes: 0, adjustedMinutes: 0,
        effectiveMinutes: 0, perMinuteRate: 0, grossEarned: 0,
        absentDeduction: 0, lateDeduction: 0, assetDeductions: 0,
        totalDeductions: 0, netPayable: 0,
      };
    }

    const attendanceRows = await this.getAttendanceForEmployee(workforceId, effectiveFrom, effectiveTo);

    const approvedExcuses = await db.select().from(excuseRequests)
      .where(and(
        eq(excuseRequests.workforceId, workforceId),
        eq(excuseRequests.status, "approved"),
        gte(excuseRequests.date, effectiveFrom),
      ));
    const excuseDateSet = new Set(approvedExcuses.filter(e => e.date <= effectiveTo).map(e => e.date));

    const adjustmentRows = await db.select().from(payrollAdjustments)
      .where(and(
        eq(payrollAdjustments.workforceId, workforceId),
        gte(payrollAdjustments.date, effectiveFrom),
      ));
    const adjustmentMap = new Map(adjustmentRows.filter(a => a.date <= effectiveTo).map(a => [a.date, a]));

    let totalScheduledMinutes = 0;
    let totalWorkedMinutes = 0;
    let daysWorked = 0;
    let excusedDays = 0;
    let absentDays = 0;
    let lateMinutes = 0;
    let adjustedMinutes = 0;
    let effectiveMinutes = 0;

    for (const row of attendanceRows) {
      const scheduled = row.minutesScheduled ?? 0;
      const worked = row.minutesWorked ?? 0;
      totalScheduledMinutes += scheduled;

      if (excuseDateSet.has(row.date)) {
        excusedDays++;
        totalWorkedMinutes += scheduled;
        effectiveMinutes += scheduled;
        continue;
      }

      const adj = adjustmentMap.get(row.date);
      if (adj) {
        const restored = (adj.originalDeductionMinutes ?? 0) - (adj.adjustedDeductionMinutes ?? 0);
        adjustedMinutes += restored;
        totalWorkedMinutes += worked;
        effectiveMinutes += worked + restored;
        if (row.status === "absent") absentDays++;
        else if (row.status === "late") {
          daysWorked++;
          lateMinutes += scheduled - worked;
        } else {
          daysWorked++;
        }
        continue;
      }

      totalWorkedMinutes += worked;
      effectiveMinutes += worked;

      if (row.status === "absent") {
        absentDays++;
      } else if (row.status === "late") {
        daysWorked++;
        lateMinutes += scheduled - worked;
      } else {
        daysWorked++;
      }
    }

    const loggedDays = attendanceRows.length;
    let perMinuteRate = 0;
    if (totalScheduledMinutes > 0 && loggedDays > 0) {
      const avgScheduled = totalScheduledMinutes / loggedDays;
      perMinuteRate = (salary / 30) / avgScheduled;
    }

    const grossEarned = Math.round(effectiveMinutes * perMinuteRate * 100) / 100;

    const absentMinutes = attendanceRows
      .filter(r => r.status === "absent" && !excuseDateSet.has(r.date) && !adjustmentMap.has(r.date))
      .reduce((sum, r) => sum + (r.minutesScheduled ?? 0), 0);
    const absentDeduction = Math.round(absentMinutes * perMinuteRate * 100) / 100;

    const lateDeduction = Math.round(lateMinutes * perMinuteRate * 100) / 100;

    const empAssets = await this.getEmployeeAssets({ workforceId });
    const allAssets = await this.getAssets(true);
    const assetMap: Record<string, any> = {};
    for (const a of allAssets) assetMap[a.id] = a;

    let assetDeductions = 0;
    for (const ea of empAssets) {
      if (ea.status === "not_returned" && ea.deductionWaived !== true) {
        assetDeductions += parseFloat(assetMap[ea.assetId]?.price ?? "0");
      }
    }
    assetDeductions = Math.round(assetDeductions * 100) / 100;

    const totalDeductions = Math.round((absentDeduction + lateDeduction + assetDeductions) * 100) / 100;
    const netPayable = Math.round(Math.max(0, grossEarned - totalDeductions) * 100) / 100;

    return {
      totalScheduledMinutes, totalWorkedMinutes, daysWorked, excusedDays,
      absentDays, lateMinutes, adjustedMinutes, effectiveMinutes,
      perMinuteRate: Math.round(perMinuteRate * 1000000) / 1000000,
      grossEarned, absentDeduction, lateDeduction, assetDeductions,
      totalDeductions, netPayable,
    };
  }

  async processPayRun(payRunId: string): Promise<{ linesCreated: number }> {
    const payRun = await this.getPayRun(payRunId);
    if (!payRun) throw new Error("Pay run not found");
    if (payRun.status !== "draft") throw new Error("Pay run must be in draft status to process");

    const conditions: any[] = [eq(workforce.isActive, true), eq(workforce.employmentType, "individual")];
    if (payRun.eventId) {
      conditions.push(eq(workforce.eventId, payRun.eventId));
    }

    const employees = await db.select().from(workforce).where(and(...conditions));

    const eligibleEmployees = employees.filter(emp => {
      const empStart = emp.startDate;
      const empEnd = emp.endDate ?? "9999-12-31";
      return empStart <= payRun.dateTo && empEnd >= payRun.dateFrom;
    });

    const lines: any[] = [];
    for (const emp of eligibleEmployees) {
      const calc = await this.calculatePayroll(emp.id, payRun.dateFrom, payRun.dateTo);

      const lineData: any = {
        payRunId,
        workforceId: emp.id,
        candidateId: emp.candidateId,
        employeeNumber: emp.employeeNumber,
        effectiveDateFrom: emp.startDate > payRun.dateFrom ? emp.startDate : payRun.dateFrom,
        effectiveDateTo: emp.endDate && emp.endDate < payRun.dateTo ? emp.endDate : payRun.dateTo,
        baseSalary: emp.salary ?? "0",
        totalScheduledMinutes: calc.totalScheduledMinutes,
        totalWorkedMinutes: calc.totalWorkedMinutes,
        daysWorked: calc.daysWorked,
        excusedDays: calc.excusedDays,
        absentDays: calc.absentDays,
        lateMinutes: calc.lateMinutes,
        adjustedMinutes: calc.adjustedMinutes,
        effectiveMinutes: calc.effectiveMinutes,
        perMinuteRate: String(calc.perMinuteRate),
        grossEarned: String(calc.grossEarned),
        manualAdditions: [],
        manualDeductions: [],
        totalManualAdditions: "0",
        totalManualDeductions: "0",
        absentDeduction: String(calc.absentDeduction),
        lateDeduction: String(calc.lateDeduction),
        assetDeductions: String(calc.assetDeductions),
        totalDeductions: String(calc.totalDeductions),
        netPayable: String(calc.netPayable),
        paymentMethod: emp.paymentMethod ?? "bank_transfer",
      };

      if (payRun.mode === "split" && payRun.splitPercentage) {
        const pct = payRun.splitPercentage / 100;
        const t1 = Math.round(calc.netPayable * pct * 100) / 100;
        const t2 = Math.round((calc.netPayable - t1) * 100) / 100;
        lineData.tranche1Amount = String(t1);
        lineData.tranche2Amount = String(t2);
        lineData.tranche1Status = "pending";
        const offboardingComplete = emp.offboardingStatus === "completed";
        lineData.tranche2Status = offboardingComplete ? "pending" : "blocked";
        lineData.tranche2BlockedReason = offboardingComplete ? null : "Offboarding not complete";
      } else {
        lineData.tranche1Amount = String(calc.netPayable);
        lineData.tranche1Status = "pending";
      }

      lines.push(lineData);
    }

    return await db.transaction(async (tx) => {
      if (lines.length > 0) {
        await tx.insert(payRunLines).values(lines);
      }

      await tx.update(payRuns)
        .set({ status: "processing", updatedAt: new Date() })
        .where(eq(payRuns.id, payRunId));

      return { linesCreated: lines.length };
    });
  }

  // ─── Payroll Adjustments ────────────────────────────────────────────────────
  async createPayrollAdjustment(data: InsertPayrollAdjustment): Promise<PayrollAdjustment> {
    const [row] = await db.insert(payrollAdjustments).values(data).returning();
    return row;
  }

  async getPayrollAdjustments(params: { workforceId?: string; dateFrom?: string; dateTo?: string }): Promise<PayrollAdjustment[]> {
    const conditions: any[] = [];
    if (params.workforceId) conditions.push(eq(payrollAdjustments.workforceId, params.workforceId));
    if (params.dateFrom) conditions.push(gte(payrollAdjustments.date, params.dateFrom));
    if (params.dateTo) conditions.push(sql`${payrollAdjustments.date} <= ${params.dateTo}`);
    return db.select().from(payrollAdjustments)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(payrollAdjustments.adjustedAt));
  }

  async bulkCreatePayrollAdjustments(adjustments: InsertPayrollAdjustment[]): Promise<number> {
    if (adjustments.length === 0) return 0;
    const result = await db.insert(payrollAdjustments).values(adjustments)
      .onConflictDoUpdate({
        target: [payrollAdjustments.workforceId, payrollAdjustments.date],
        set: {
          adjustedDeductionMinutes: sql`EXCLUDED.adjusted_deduction_minutes`,
          reason: sql`EXCLUDED.reason`,
          adjustedBy: sql`EXCLUDED.adjusted_by`,
          adjustedAt: new Date(),
        },
      })
      .returning();
    return result.length;
  }

  // ─── Payroll Transactions ───────────────────────────────────────────────────
  async createPayrollTransaction(data: any): Promise<PayrollTransaction> {
    const [row] = await db.insert(payrollTransactions).values(data).returning();
    return row;
  }

  async getPayrollTransactions(params: { candidateId?: string; workforceId?: string; payRunLineId?: string }): Promise<PayrollTransaction[]> {
    const conditions: any[] = [];
    if (params.candidateId) conditions.push(eq(payrollTransactions.candidateId, params.candidateId));
    if (params.workforceId) conditions.push(eq(payrollTransactions.workforceId, params.workforceId));
    if (params.payRunLineId) conditions.push(eq(payrollTransactions.payRunLineId, params.payRunLineId));
    return db.select().from(payrollTransactions)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(payrollTransactions.enteredAt));
  }

  async getPayrollTransaction(id: string): Promise<PayrollTransaction | undefined> {
    const [row] = await db.select().from(payrollTransactions).where(eq(payrollTransactions.id, id));
    return row;
  }

  // ─── RBAC ─────────────────────────────────────────────────────────────────
  async listRoles(): Promise<Array<Role & { userCount: number; permissionCount: number }>> {
    const rows = await db.select().from(roles).orderBy(roles.isSystem, roles.name);
    const counts = await Promise.all(
      rows.map(async (r) => {
        const [{ uc }] = await db
          .select({ uc: sql<number>`count(*)::int` })
          .from(users)
          .where(eq(users.roleId, r.id));
        const [{ pc }] = await db
          .select({ pc: sql<number>`count(*)::int` })
          .from(rolePermissions)
          .where(eq(rolePermissions.roleId, r.id));
        return { ...r, userCount: uc ?? 0, permissionCount: pc ?? 0 };
      })
    );
    return counts;
  }

  async getRole(id: string): Promise<Role | undefined> {
    const [row] = await db.select().from(roles).where(eq(roles.id, id));
    return row;
  }

  async getRoleBySlug(slug: string): Promise<Role | undefined> {
    const [row] = await db.select().from(roles).where(eq(roles.slug, slug));
    return row;
  }

  async createRole(data: InsertRole): Promise<Role> {
    const [row] = await db
      .insert(roles)
      .values({ ...data, isSystem: false })
      .returning();
    return row;
  }

  async updateRole(id: string, data: Partial<InsertRole>): Promise<Role> {
    const existing = await this.getRole(id);
    if (!existing) throw new Error("Role not found");
    if (existing.isSystem && (data.slug || typeof data.isSystem === "boolean")) {
      throw new Error("Cannot change slug or system flag of a system role");
    }
    const [row] = await db
      .update(roles)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(roles.id, id))
      .returning();
    return row;
  }

  async deleteRole(id: string) {
    const role = await this.getRole(id);
    if (!role) return { ok: false as const, reason: "not_found" };
    if (role.isSystem) return { ok: false as const, reason: "system_role" };
    const userCount = await this.countUsersWithRole(id);
    if (userCount > 0) return { ok: false as const, reason: "in_use", userCount };
    await db.delete(roles).where(eq(roles.id, id));
    return { ok: true as const };
  }

  async cloneRole(id: string, newName: string, newSlug: string): Promise<Role> {
    const src = await this.getRole(id);
    if (!src) throw new Error("Source role not found");
    return await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(roles)
        .values({
          name: newName,
          slug: newSlug,
          description: src.description,
          color: src.color,
          isSystem: false,
        })
        .returning();
      const srcPerms = await tx
        .select({ key: rolePermissions.permissionKey })
        .from(rolePermissions)
        .where(eq(rolePermissions.roleId, id));
      if (srcPerms.length) {
        await tx.insert(rolePermissions).values(
          srcPerms.map((p) => ({ roleId: created.id, permissionKey: p.key }))
        );
      }
      return created;
    });
  }

  async listPermissions(): Promise<Permission[]> {
    return await db.select().from(permissions).orderBy(permissions.category, permissions.key);
  }

  async getRolePermissions(roleId: string): Promise<string[]> {
    const rows = await db
      .select({ key: rolePermissions.permissionKey })
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, roleId));
    return rows.map((r) => r.key);
  }

  async setRolePermissions(roleId: string, permissionKeys: string[]): Promise<void> {
    const role = await this.getRole(roleId);
    if (!role) throw new Error("Role not found");
    if (role.isSystem) throw new Error("Cannot modify permissions of a system role");
    await db.transaction(async (tx) => {
      await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
      if (permissionKeys.length) {
        const validKeys = await tx
          .select({ key: permissions.key })
          .from(permissions)
          .where(inArray(permissions.key, permissionKeys));
        const validSet = new Set(validKeys.map((k) => k.key));
        const filtered = permissionKeys.filter((k) => validSet.has(k));
        if (filtered.length) {
          await tx.insert(rolePermissions).values(
            filtered.map((key) => ({ roleId, permissionKey: key }))
          );
        }
      }
    });
  }

  async countUsersWithRole(roleId: string): Promise<number> {
    const [{ c }] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(users)
      .where(eq(users.roleId, roleId));
    return c ?? 0;
  }

  async getEffectivePermissionsForRole(
    roleId: string
  ): Promise<{ isSuperAdmin: boolean; keys: string[] }> {
    const role = await this.getRole(roleId);
    if (!role) return { isSuperAdmin: false, keys: [] };
    if (role.slug === "super_admin") return { isSuperAdmin: true, keys: [] };
    const keys = await this.getRolePermissions(roleId);
    return { isSuperAdmin: false, keys };
  }
}

export const storage = new DatabaseStorage();

export async function createInboxItem(
  type: InsertInboxItem["type"],
  title: string,
  body?: string,
  metadata?: Record<string, unknown>,
  priority: InsertInboxItem["priority"] = "medium",
  opts?: { entityType?: string; entityId?: string; actionUrl?: string; assignedTo?: string }
): Promise<InboxItem> {
  return storage.createInboxItem({
    type,
    title,
    body: body ?? null,
    priority,
    metadata: metadata ?? null,
    entityType: opts?.entityType ?? null,
    entityId: opts?.entityId ?? null,
    actionUrl: opts?.actionUrl ?? null,
    assignedTo: opts?.assignedTo ?? null,
  });
}
