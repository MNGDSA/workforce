// Single source of truth for the RBAC permission catalog.
// Mirrors `.local/rbac-catalog.md`. Boot-time seed upserts these into the DB.
// `requirePermission()` is typed against `PermissionKey`, so typos are compile errors.

export interface PermissionDef {
  key: string;
  resource: string;
  action: string;
  description: string;
  category: string;
}

export const PERMISSION_CATALOG = [
  // ─── Candidates ──
  { key: "candidates:read",            resource: "candidates", action: "read",            description: "List & view candidates",                       category: "Candidates" },
  { key: "candidates:create",          resource: "candidates", action: "create",          description: "Create a candidate",                            category: "Candidates" },
  { key: "candidates:update",          resource: "candidates", action: "update",          description: "Edit candidate fields",                         category: "Candidates" },
  { key: "candidates:archive",         resource: "candidates", action: "archive",         description: "Archive / unarchive candidate",                 category: "Candidates" },
  { key: "candidates:bulk",            resource: "candidates", action: "bulk",            description: "Bulk actions and bulk import",                  category: "Candidates" },
  { key: "candidates:export",          resource: "candidates", action: "export",          description: "Export candidate list",                         category: "Candidates" },
  { key: "candidates:documents_read",  resource: "candidates", action: "documents_read",  description: "View candidate documents",                      category: "Candidates" },
  { key: "candidates:documents_write", resource: "candidates", action: "documents_write", description: "Upload / delete candidate documents",           category: "Candidates" },
  { key: "candidates:smp_manage",      resource: "candidates", action: "smp_manage",      description: "Validate & commit SMP candidate batches",       category: "Candidates" },

  // ─── Workforce ──
  { key: "workforce:read",             resource: "workforce",  action: "read",            description: "List & view workforce records",                 category: "Workforce" },
  { key: "workforce:create",           resource: "workforce",  action: "create",          description: "Create workforce record",                       category: "Workforce" },
  { key: "workforce:update",           resource: "workforce",  action: "update",          description: "Edit workforce fields",                         category: "Workforce" },
  { key: "workforce:terminate",        resource: "workforce",  action: "terminate",       description: "Terminate an employee",                         category: "Workforce" },
  { key: "workforce:reinstate",        resource: "workforce",  action: "reinstate",       description: "Reinstate a terminated employee",               category: "Workforce" },
  { key: "workforce:bulk",             resource: "workforce",  action: "bulk",            description: "Bulk updates",                                  category: "Workforce" },
  { key: "workforce:payment_method",   resource: "workforce",  action: "payment_method",  description: "Change payment method on worker",               category: "Workforce" },
  { key: "workforce:history_read",     resource: "workforce",  action: "history_read",    description: "Read cross-candidate employment history",       category: "Workforce" },

  // ─── Onboarding ──
  { key: "onboarding:read",            resource: "onboarding", action: "read",            description: "List & view onboarding records",                category: "Onboarding" },
  { key: "onboarding:create",          resource: "onboarding", action: "create",          description: "Create onboarding record",                      category: "Onboarding" },
  { key: "onboarding:update",          resource: "onboarding", action: "update",          description: "Edit onboarding",                               category: "Onboarding" },
  { key: "onboarding:delete",          resource: "onboarding", action: "delete",          description: "Delete onboarding",                             category: "Onboarding" },
  { key: "onboarding:convert",         resource: "onboarding", action: "convert",         description: "Convert onboarding to workforce",               category: "Onboarding" },
  { key: "onboarding:bulk_convert",    resource: "onboarding", action: "bulk_convert",    description: "Bulk convert onboarding records",               category: "Onboarding" },

  // ─── Offboarding ──
  { key: "offboarding:read",             resource: "offboarding", action: "read",             description: "List offboarding queue",                     category: "Offboarding" },
  { key: "offboarding:read_settlement",  resource: "offboarding", action: "read_settlement",  description: "View settlement calculation",                category: "Offboarding" },
  { key: "offboarding:start",            resource: "offboarding", action: "start",            description: "Start offboarding for an employee",          category: "Offboarding" },
  { key: "offboarding:complete",         resource: "offboarding", action: "complete",         description: "Complete offboarding",                       category: "Offboarding" },
  { key: "offboarding:bulk_start",       resource: "offboarding", action: "bulk_start",       description: "Bulk start offboarding",                     category: "Offboarding" },
  { key: "offboarding:bulk_complete",    resource: "offboarding", action: "bulk_complete",    description: "Bulk complete offboarding",                  category: "Offboarding" },
  { key: "offboarding:reassign_event",   resource: "offboarding", action: "reassign_event",   description: "Reassign offboarded employee to event",      category: "Offboarding" },

  // ─── Events ──
  { key: "events:read",   resource: "events", action: "read",   description: "List & view events",       category: "Events" },
  { key: "events:create", resource: "events", action: "create", description: "Create event",             category: "Events" },
  { key: "events:update", resource: "events", action: "update", description: "Edit event fields",        category: "Events" },
  { key: "events:close",  resource: "events", action: "close",  description: "Close an event",           category: "Events" },
  { key: "events:reopen", resource: "events", action: "reopen", description: "Reopen a closed event",    category: "Events" },
  { key: "events:archive",resource: "events", action: "archive",description: "Archive / unarchive event",category: "Events" },

  // ─── Jobs & Applications ──
  { key: "jobs:read",                 resource: "jobs",         action: "read",         description: "List & view job postings",         category: "Jobs & Applications" },
  { key: "jobs:create",               resource: "jobs",         action: "create",       description: "Create a job",                     category: "Jobs & Applications" },
  { key: "jobs:update",               resource: "jobs",         action: "update",       description: "Edit job",                         category: "Jobs & Applications" },
  { key: "jobs:archive",              resource: "jobs",         action: "archive",      description: "Archive / unarchive job",          category: "Jobs & Applications" },
  { key: "applications:read",         resource: "applications", action: "read",         description: "List & view applications",         category: "Jobs & Applications" },
  { key: "applications:update",       resource: "applications", action: "update",       description: "Edit application status / notes",  category: "Jobs & Applications" },
  { key: "applications:bulk_status",  resource: "applications", action: "bulk_status",  description: "Bulk change application status",   category: "Jobs & Applications" },

  // ─── Interviews ──
  { key: "interviews:read",   resource: "interviews", action: "read",   description: "List & view interviews", category: "Interviews" },
  { key: "interviews:create", resource: "interviews", action: "create", description: "Schedule interviews",    category: "Interviews" },
  { key: "interviews:update", resource: "interviews", action: "update", description: "Edit interviews",        category: "Interviews" },

  // ─── Attendance (admin) ──
  { key: "attendance:read",      resource: "attendance", action: "read",      description: "View raw attendance records",        category: "Attendance" },
  { key: "attendance:create",    resource: "attendance", action: "create",    description: "Manually add attendance record",     category: "Attendance" },
  { key: "attendance:update",    resource: "attendance", action: "update",    description: "Edit attendance record",             category: "Attendance" },
  { key: "attendance:delete",    resource: "attendance", action: "delete",    description: "Delete attendance record",           category: "Attendance" },
  { key: "attendance:export",    resource: "attendance", action: "export",    description: "Export lateness / reports",          category: "Attendance" },
  { key: "attendance:dashboard", resource: "attendance", action: "dashboard", description: "Attendance dashboards & summaries",  category: "Attendance" },

  // ─── Attendance-Mobile Review ──
  { key: "attendance_mobile:review_read", resource: "attendance_mobile", action: "review_read", description: "List mobile submissions",     category: "Attendance Mobile Review" },
  { key: "attendance_mobile:approve",     resource: "attendance_mobile", action: "approve",     description: "Approve mobile submission",   category: "Attendance Mobile Review" },
  { key: "attendance_mobile:reject",      resource: "attendance_mobile", action: "reject",      description: "Reject mobile submission",    category: "Attendance Mobile Review" },

  // ─── Photo Change Requests ──
  { key: "photo_requests:read",    resource: "photo_requests", action: "read",    description: "List pending photo change requests", category: "Photo Change Requests" },
  { key: "photo_requests:approve", resource: "photo_requests", action: "approve", description: "Approve photo change",                category: "Photo Change Requests" },
  { key: "photo_requests:reject",  resource: "photo_requests", action: "reject",  description: "Reject photo change",                 category: "Photo Change Requests" },

  // ─── Excuse Requests (admin) ──
  { key: "excuse_requests:read",    resource: "excuse_requests", action: "read",    description: "List admin-side excuse requests", category: "Excuse Requests" },
  { key: "excuse_requests:approve", resource: "excuse_requests", action: "approve", description: "Approve excuse",                  category: "Excuse Requests" },
  { key: "excuse_requests:reject",  resource: "excuse_requests", action: "reject",  description: "Reject excuse",                   category: "Excuse Requests" },

  // ─── Payroll ──
  { key: "payroll:pay_runs_read",            resource: "payroll", action: "pay_runs_read",            description: "List & view pay runs",                  category: "Payroll" },
  { key: "payroll:pay_runs_create",          resource: "payroll", action: "pay_runs_create",          description: "Create a pay run",                      category: "Payroll" },
  { key: "payroll:pay_runs_process",         resource: "payroll", action: "pay_runs_process",         description: "Run payroll calculation",               category: "Payroll" },
  { key: "payroll:pay_runs_approve",         resource: "payroll", action: "pay_runs_approve",         description: "Mark T1 (initial) payment",             category: "Payroll" },
  { key: "payroll:pay_runs_manual_edit",     resource: "payroll", action: "pay_runs_manual_edit",     description: "Add manual addition / deduction",       category: "Payroll" },
  { key: "payroll:pay_runs_record_payment",  resource: "payroll", action: "pay_runs_record_payment",  description: "Record payment against pay-run line",   category: "Payroll" },
  { key: "payroll:pay_runs_import_bank",     resource: "payroll", action: "pay_runs_import_bank",     description: "Import bank response file",             category: "Payroll" },
  { key: "payroll:pay_runs_cash_payment",    resource: "payroll", action: "pay_runs_cash_payment",    description: "Record cash payment",                   category: "Payroll" },
  { key: "payroll:pay_runs_cash_otp_override",resource: "payroll", action: "pay_runs_cash_otp_override",description:"Override cash OTP",                    category: "Payroll" },
  { key: "payroll:pay_runs_export",          resource: "payroll", action: "pay_runs_export",          description: "Export pay run (csv / bank)",           category: "Payroll" },
  { key: "payroll:adjustments_write",        resource: "payroll", action: "adjustments_write",        description: "Create payroll adjustments (incl. bulk)",category: "Payroll" },

  // ─── Payslips ──
  { key: "payslips:read",     resource: "payslips", action: "read",     description: "View any candidate's payslips (admin)", category: "Payslips" },
  { key: "payslips:read_own", resource: "payslips", action: "read_own", description: "View own payslips (self-service)",      category: "Payslips" },

  // ─── Assets ──
  { key: "assets:read",   resource: "assets", action: "read",   description: "List & view assets catalog", category: "Assets" },
  { key: "assets:create", resource: "assets", action: "create", description: "Create asset",               category: "Assets" },
  { key: "assets:update", resource: "assets", action: "update", description: "Edit asset",                 category: "Assets" },
  { key: "assets:delete", resource: "assets", action: "delete", description: "Delete asset",               category: "Assets" },

  // ─── Employee Assets ──
  { key: "employee_assets:read",            resource: "employee_assets", action: "read",            description: "List & view assigned assets",  category: "Employee Assets" },
  { key: "employee_assets:assign",          resource: "employee_assets", action: "assign",          description: "Assign / bulk-assign assets",  category: "Employee Assets" },
  { key: "employee_assets:update",          resource: "employee_assets", action: "update",          description: "Edit assignment",              category: "Employee Assets" },
  { key: "employee_assets:delete",          resource: "employee_assets", action: "delete",          description: "Remove assignment",            category: "Employee Assets" },
  { key: "employee_assets:confirm",         resource: "employee_assets", action: "confirm",         description: "Confirm return / bulk confirm",category: "Employee Assets" },
  { key: "employee_assets:waive_deduction", resource: "employee_assets", action: "waive_deduction", description: "Waive the deduction",          category: "Employee Assets" },
  { key: "employee_assets:bulk_status",     resource: "employee_assets", action: "bulk_status",     description: "Bulk change status",           category: "Employee Assets" },

  // ─── SMP Companies ──
  { key: "smp:read",            resource: "smp", action: "read",            description: "List & view SMP companies", category: "SMP Companies" },
  { key: "smp:create",          resource: "smp", action: "create",          description: "Create SMP company",        category: "SMP Companies" },
  { key: "smp:update",          resource: "smp", action: "update",          description: "Edit SMP company",          category: "SMP Companies" },
  { key: "smp:delete",          resource: "smp", action: "delete",          description: "Delete SMP company",        category: "SMP Companies" },
  { key: "smp:documents_read",  resource: "smp", action: "documents_read",  description: "View SMP documents",        category: "SMP Companies" },
  { key: "smp:documents_write", resource: "smp", action: "documents_write", description: "Upload / delete SMP docs",  category: "SMP Companies" },

  // ─── Contract Templates ──
  { key: "contract_templates:read",     resource: "contract_templates", action: "read",     description: "List & view templates",         category: "Contract Templates" },
  { key: "contract_templates:write",    resource: "contract_templates", action: "write",    description: "Create / edit / version",       category: "Contract Templates" },
  { key: "contract_templates:activate", resource: "contract_templates", action: "activate", description: "Activate a template",            category: "Contract Templates" },

  // ─── Candidate Contracts ──
  { key: "candidate_contracts:read",   resource: "candidate_contracts", action: "read",   description: "Admin read of candidate contracts",   category: "Candidate Contracts" },
  { key: "candidate_contracts:manage", resource: "candidate_contracts", action: "manage", description: "Generate / re-sign / preview",        category: "Candidate Contracts" },

  // ─── Automation ──
  { key: "automation:read",  resource: "automation", action: "read",  description: "List automation rules",         category: "Automation" },
  { key: "automation:write", resource: "automation", action: "write", description: "Create / edit automation rules",category: "Automation" },

  // ─── Notifications & Inbox ──
  { key: "notifications:read",  resource: "notifications", action: "read",  description: "Read notifications feed",                    category: "Notifications & Inbox" },
  { key: "notifications:write", resource: "notifications", action: "write", description: "Create notifications / mark read",           category: "Notifications & Inbox" },
  { key: "inbox:read",          resource: "inbox",         action: "read",  description: "List inbox items",                           category: "Notifications & Inbox" },
  { key: "inbox:manage",        resource: "inbox",         action: "manage",description: "Resolve / dismiss / bulk operations",        category: "Notifications & Inbox" },
  { key: "admin_alerts:manage", resource: "admin_alerts",  action: "manage",description: "Read & manage event alerts",                 category: "Notifications & Inbox" },

  // ─── Broadcasts ──
  { key: "broadcasts:read",  resource: "broadcasts", action: "read",  description: "List broadcasts",  category: "Broadcasts" },
  { key: "broadcasts:write", resource: "broadcasts", action: "write", description: "Create broadcast", category: "Broadcasts" },

  // ─── Geofence Zones ──
  { key: "geofence:read",  resource: "geofence", action: "read",  description: "View geofence zones (admin & mobile)", category: "Geofence Zones" },
  { key: "geofence:write", resource: "geofence", action: "write", description: "Create / edit / delete zones",         category: "Geofence Zones" },

  // ─── Admin Users & Roles ──
  { key: "admin_users:manage", resource: "admin_users", action: "manage", description: "Create / edit back-office users", category: "Admin Users & Roles" },
  { key: "roles:read",         resource: "roles",       action: "read",   description: "List roles & permissions catalog", category: "Admin Users & Roles" },
  { key: "roles:manage",       resource: "roles",       action: "manage", description: "Create / edit / delete roles; assign permissions", category: "Admin Users & Roles" },

  // ─── Organization Structure ──
  { key: "business_units:read",  resource: "business_units", action: "read",  description: "List business units",            category: "Organization" },
  { key: "business_units:write", resource: "business_units", action: "write", description: "Create / edit business units",   category: "Organization" },
  { key: "departments:write",    resource: "departments",    action: "write", description: "Create / edit / toggle departments", category: "Organization" },
  { key: "positions:write",      resource: "positions",      action: "write", description: "Create / edit / toggle positions",   category: "Organization" },
  { key: "org_chart:read",       resource: "org_chart",      action: "read",  description: "View org chart",                  category: "Organization" },

  // ─── System ──
  { key: "settings:read",     resource: "settings",    action: "read",     description: "View system settings",        category: "System" },
  { key: "settings:write",    resource: "settings",    action: "write",    description: "Modify system settings",      category: "System" },
  { key: "audit_logs:read",   resource: "audit_logs",  action: "read",     description: "Read audit logs",             category: "System" },
  { key: "system:ntp_check",  resource: "system",      action: "ntp_check",description: "Probe NTP servers",           category: "System" },
  { key: "system:search",     resource: "system",      action: "search",   description: "Global search",               category: "System" },

  // ─── Integrations ──
  { key: "integrations:github", resource: "integrations", action: "github", description: "GitHub integration", category: "Integrations" },

  // ─── Self-Service (Candidate / Worker) ──
  { key: "self:profile_read",       resource: "self", action: "profile_read",      description: "Read own profile (/api/me)",          category: "Self-Service" },
  { key: "self:shift_read",         resource: "self", action: "shift_read",        description: "Read own shift / schedule",            category: "Self-Service" },
  { key: "self:attendance_submit",  resource: "self", action: "attendance_submit", description: "Submit own mobile attendance",         category: "Self-Service" },
  { key: "self:attendance_status",  resource: "self", action: "attendance_status", description: "Read own attendance status",           category: "Self-Service" },
  { key: "self:excuse_submit",      resource: "self", action: "excuse_submit",     description: "Submit own excuse request",            category: "Self-Service" },
  { key: "self:excuse_read",        resource: "self", action: "excuse_read",       description: "Read own excuse requests",             category: "Self-Service" },
  { key: "self:data_erasure",       resource: "self", action: "data_erasure",      description: "Request data erasure / status check",  category: "Self-Service" },
  { key: "self:mobile_config",      resource: "self", action: "mobile_config",     description: "Read mobile config",                   category: "Self-Service" },
] as const satisfies readonly PermissionDef[];

export const PERMISSION_KEYS = PERMISSION_CATALOG.map((p) => p.key);
export type PermissionKey = (typeof PERMISSION_CATALOG)[number]["key"];

// Built-in system roles. Super Admin grants every permission via short-circuit
// in the middleware (no rows in role_permissions). Candidate is the mobile/portal
// user role; explicit permission set listed below.
export const SUPER_ADMIN_SLUG = "super_admin" as const;
export const CANDIDATE_SLUG = "candidate" as const;

export const SYSTEM_ROLE_SLUGS = [SUPER_ADMIN_SLUG, CANDIDATE_SLUG] as const;
export type SystemRoleSlug = (typeof SYSTEM_ROLE_SLUGS)[number];

export const CANDIDATE_PERMISSIONS: PermissionKey[] = [
  "self:profile_read",
  "self:shift_read",
  "self:attendance_submit",
  "self:attendance_status",
  "self:excuse_submit",
  "self:excuse_read",
  "self:data_erasure",
  "self:mobile_config",
  "geofence:read",
  "payslips:read_own",
];

// Faisal — prod super-admin user id, baked in as migration safety net.
export const FAISAL_PROD_USER_ID = "5b1f05b6-68a2-44fe-b48c-d571690301e1";
