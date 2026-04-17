CREATE TYPE "public"."application_status" AS ENUM('new', 'reviewing', 'shortlisted', 'interviewed', 'offered', 'hired', 'rejected', 'withdrawn', 'closed');--> statement-breakpoint
CREATE TYPE "public"."attendance_source" AS ENUM('manual', 'mobile');--> statement-breakpoint
CREATE TYPE "public"."attendance_status" AS ENUM('present', 'absent', 'late', 'excused');--> statement-breakpoint
CREATE TYPE "public"."broadcast_recipient_status" AS ENUM('pending', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."broadcast_status" AS ENUM('sending', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."candidate_contract_status" AS ENUM('generated', 'awaiting_signing', 'sent', 'signed');--> statement-breakpoint
CREATE TYPE "public"."candidate_status" AS ENUM('available', 'active', 'inactive', 'blocked', 'hired');--> statement-breakpoint
CREATE TYPE "public"."contract_template_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."employee_asset_status" AS ENUM('assigned', 'returned', 'not_returned');--> statement-breakpoint
CREATE TYPE "public"."employment_type" AS ENUM('individual', 'smp');--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('upcoming', 'active', 'closed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."event_type" AS ENUM('duration_based', 'ongoing');--> statement-breakpoint
CREATE TYPE "public"."excuse_request_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('male', 'female', 'other', 'prefer_not_to_say');--> statement-breakpoint
CREATE TYPE "public"."inbox_item_priority" AS ENUM('low', 'medium', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."inbox_item_status" AS ENUM('pending', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."inbox_item_type" AS ENUM('document_review', 'document_reupload', 'application_review', 'onboarding_action', 'contract_action', 'offboarding_action', 'schedule_conflict', 'asset_return', 'candidate_flag', 'event_alert', 'attendance_verification', 'photo_change_request', 'excuse_request', 'general_request', 'system');--> statement-breakpoint
CREATE TYPE "public"."interview_status" AS ENUM('scheduled', 'in_progress', 'completed', 'cancelled', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('draft', 'active', 'paused', 'closed', 'filled');--> statement-breakpoint
CREATE TYPE "public"."nationality" AS ENUM('saudi', 'non_saudi');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('pending', 'sent', 'failed', 'read');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('sms', 'email', 'in_app', 'push');--> statement-breakpoint
CREATE TYPE "public"."onboarding_status" AS ENUM('pending', 'in_progress', 'ready', 'converted', 'rejected', 'terminated');--> statement-breakpoint
CREATE TYPE "public"."photo_change_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."print_status" AS ENUM('success', 'failed', 'pending');--> statement-breakpoint
CREATE TYPE "public"."submission_status" AS ENUM('pending', 'verified', 'flagged', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('super_admin', 'admin', 'hr_manager', 'hr_specialist', 'hr_attendance_reviewer', 'auditor', 'recruiter', 'interviewer', 'viewer', 'candidate');--> statement-breakpoint
CREATE TABLE "applications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" varchar NOT NULL,
	"job_id" varchar NOT NULL,
	"event_id" varchar,
	"status" "application_status" DEFAULT 'new' NOT NULL,
	"applied_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_by" varchar,
	"reviewed_at" timestamp,
	"notes" text,
	"score" integer,
	"question_set_answers" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text,
	"price" numeric(10, 2) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_records" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workforce_id" varchar NOT NULL,
	"date" text NOT NULL,
	"status" "attendance_status" NOT NULL,
	"clock_in" text,
	"clock_out" text,
	"minutes_scheduled" integer,
	"minutes_worked" integer,
	"notes" text,
	"source" "attendance_source" DEFAULT 'manual' NOT NULL,
	"recorded_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_submissions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workforce_id" varchar NOT NULL,
	"photo_url" text NOT NULL,
	"gps_lat" numeric(10, 7) NOT NULL,
	"gps_lng" numeric(10, 7) NOT NULL,
	"gps_accuracy" numeric(8, 2),
	"submitted_at" timestamp DEFAULT now() NOT NULL,
	"status" "submission_status" DEFAULT 'pending' NOT NULL,
	"rekognition_confidence" numeric(5, 2),
	"gps_inside_geofence" boolean,
	"matched_geofence_id" varchar,
	"flag_reason" text,
	"verified_at" timestamp,
	"reviewed_by" varchar,
	"reviewed_at" timestamp,
	"review_notes" text,
	"linked_attendance_record_id" varchar,
	"reference_photo_url" text,
	"mock_location_detected" boolean,
	"is_emulator" boolean,
	"root_detected" boolean,
	"location_provider" varchar(32),
	"device_fingerprint" text,
	"server_received_at" timestamp,
	"ntp_timestamp" timestamp,
	"system_clock_timestamp" timestamp,
	"last_ntp_sync_at" timestamp,
	"location_source" varchar(32),
	"submission_token" varchar(64),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" varchar,
	"actor_name" varchar(255),
	"action" varchar(100) NOT NULL,
	"entity_type" varchar(50),
	"entity_id" varchar,
	"employee_number" varchar(50),
	"subject_name" varchar(255),
	"description" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_rules" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"trigger" text NOT NULL,
	"action" text NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"config" jsonb,
	"last_run_at" timestamp,
	"run_count" integer DEFAULT 0 NOT NULL,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_units" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"code" varchar(20) NOT NULL,
	"description" text,
	"contact_email" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "business_units_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "candidate_contracts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" varchar NOT NULL,
	"onboarding_id" varchar,
	"template_id" varchar NOT NULL,
	"status" "candidate_contract_status" DEFAULT 'generated' NOT NULL,
	"snapshot_articles" jsonb,
	"snapshot_variables" jsonb,
	"generated_pdf_url" text,
	"signed_at" timestamp,
	"signed_ip" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"candidate_code" varchar(20),
	"full_name_ar" text,
	"full_name_en" text NOT NULL,
	"gender" "gender",
	"date_of_birth" text,
	"nationality" "nationality",
	"email" text,
	"phone" text,
	"whatsapp" text,
	"city" text,
	"region" text,
	"country" text DEFAULT 'SA' NOT NULL,
	"national_id" varchar(20),
	"iqama_number" varchar(20),
	"passport_number" varchar(20),
	"current_role" text,
	"current_employer" text,
	"is_employed_elsewhere" boolean DEFAULT false NOT NULL,
	"education_level" text,
	"university" text,
	"major" text,
	"skills" text[],
	"languages" text[],
	"certifications" text[],
	"nationality_text" text,
	"marital_status" text,
	"has_chronic_diseases" boolean DEFAULT false NOT NULL,
	"chronic_diseases" text,
	"profile_completed" boolean DEFAULT false NOT NULL,
	"emergency_contact_name" text,
	"emergency_contact_phone" text,
	"iban_number" text,
	"iban_account_first_name" text,
	"iban_account_last_name" text,
	"iban_bank_name" text,
	"iban_bank_code" text,
	"expected_salary" numeric(10, 2),
	"status" "candidate_status" DEFAULT 'available' NOT NULL,
	"rating" numeric(3, 2) DEFAULT '0',
	"total_ratings" integer DEFAULT 0 NOT NULL,
	"has_resume" boolean DEFAULT false NOT NULL,
	"has_photo" boolean DEFAULT false NOT NULL,
	"has_national_id" boolean DEFAULT false NOT NULL,
	"has_iban" boolean DEFAULT false NOT NULL,
	"source" text DEFAULT 'individual' NOT NULL,
	"last_login_at" timestamp,
	"resume_url" text,
	"photo_url" text,
	"national_id_file_url" text,
	"iban_file_url" text,
	"notes" text,
	"tags" text[],
	"metadata" jsonb,
	"phone_transferred_at" timestamp,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "candidates_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "contract_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"event_id" varchar,
	"version" integer DEFAULT 1 NOT NULL,
	"parent_template_id" varchar,
	"status" "contract_template_status" DEFAULT 'draft' NOT NULL,
	"logo_url" text,
	"logo_alignment" text DEFAULT 'center',
	"company_name" text,
	"header_text" text,
	"preamble" text,
	"footer_text" text,
	"document_footer" text,
	"articles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"name_ar" text,
	"code" varchar(20) NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "departments_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "employee_assets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" varchar NOT NULL,
	"workforce_id" varchar NOT NULL,
	"assigned_at" text NOT NULL,
	"returned_at" text,
	"status" "employee_asset_status" DEFAULT 'assigned' NOT NULL,
	"notes" text,
	"confirmed_at" timestamp,
	"confirmed_by" varchar,
	"deduction_waived" boolean,
	"deduction_waived_by" varchar,
	"deduction_waived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"event_type" "event_type" DEFAULT 'duration_based' NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text,
	"status" "event_status" DEFAULT 'upcoming' NOT NULL,
	"target_headcount" integer DEFAULT 0 NOT NULL,
	"filled_positions" integer DEFAULT 0 NOT NULL,
	"budget" numeric(14, 2),
	"region" text,
	"created_by" varchar,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "excuse_requests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workforce_id" varchar NOT NULL,
	"date" text NOT NULL,
	"reason" text NOT NULL,
	"attachment_url" text,
	"submitted_at" timestamp DEFAULT now() NOT NULL,
	"had_clock_in" boolean DEFAULT false NOT NULL,
	"effective_clock_out" text,
	"status" "excuse_request_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by" varchar,
	"reviewed_at" timestamp,
	"review_notes" text
);
--> statement-breakpoint
CREATE TABLE "geofence_zones" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"center_lat" numeric(10, 7) NOT NULL,
	"center_lng" numeric(10, 7) NOT NULL,
	"radius_meters" integer DEFAULT 500 NOT NULL,
	"polygon" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "id_card_print_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" varchar NOT NULL,
	"template_id" varchar,
	"printed_by" varchar,
	"printer_plugin_id" varchar,
	"status" "print_status" DEFAULT 'success' NOT NULL,
	"printed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "id_card_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"event_id" varchar,
	"layout_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"logo_url" text,
	"background_image_url" text,
	"fields" text[] DEFAULT ARRAY['fullName','photo','employeeNumber']::text[] NOT NULL,
	"background_color" text DEFAULT '#1a1a2e' NOT NULL,
	"text_color" text DEFAULT '#ffffff' NOT NULL,
	"accent_color" text DEFAULT '#16a34a' NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbox_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "inbox_item_type" NOT NULL,
	"priority" "inbox_item_priority" DEFAULT 'medium' NOT NULL,
	"status" "inbox_item_status" DEFAULT 'pending' NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"entity_type" varchar(64),
	"entity_id" varchar(128),
	"action_url" text,
	"assigned_to" varchar(128),
	"resolved_by" varchar(128),
	"resolved_at" timestamp,
	"resolution_notes" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interviews" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" varchar,
	"application_id" varchar,
	"candidate_id" varchar,
	"interviewer_id" varchar,
	"scheduled_at" timestamp NOT NULL,
	"duration_minutes" integer DEFAULT 30 NOT NULL,
	"status" "interview_status" DEFAULT 'scheduled' NOT NULL,
	"type" text DEFAULT 'video' NOT NULL,
	"meeting_url" text,
	"notes" text,
	"group_name" text,
	"invited_candidate_ids" text[],
	"created_by_name" text,
	"rating" integer,
	"feedback" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_postings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"title_ar" text,
	"description" text,
	"requirements" text,
	"location" text,
	"region" text,
	"department" text,
	"type" text DEFAULT 'seasonal_full_time' NOT NULL,
	"salary_min" numeric(10, 2),
	"salary_max" numeric(10, 2),
	"status" "job_status" DEFAULT 'draft' NOT NULL,
	"event_id" varchar NOT NULL,
	"posted_by" varchar,
	"business_unit_id" varchar,
	"deadline" text,
	"skills" text[],
	"question_set_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"archived_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_id" varchar,
	"candidate_id" varchar,
	"type" "notification_type" DEFAULT 'in_app' NOT NULL,
	"status" "notification_status" DEFAULT 'pending' NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"metadata" jsonb,
	"sent_at" timestamp,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onboarding" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" varchar NOT NULL,
	"application_id" varchar,
	"job_id" varchar,
	"event_id" varchar,
	"status" "onboarding_status" DEFAULT 'pending' NOT NULL,
	"has_photo" boolean DEFAULT false NOT NULL,
	"has_iban" boolean DEFAULT false NOT NULL,
	"has_national_id" boolean DEFAULT false NOT NULL,
	"has_medical_fitness" boolean DEFAULT false NOT NULL,
	"has_signed_contract" boolean DEFAULT false NOT NULL,
	"has_emergency_contact" boolean DEFAULT false NOT NULL,
	"contract_signed_at" timestamp,
	"contract_url" text,
	"start_date" text,
	"notes" text,
	"rejected_at" timestamp,
	"rejected_by" varchar,
	"rejection_reason" text,
	"converted_at" timestamp,
	"converted_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otp_verifications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"code" varchar(6) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"verified_at" timestamp,
	"used_for_registration" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pay_run_lines" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pay_run_id" varchar NOT NULL,
	"workforce_id" varchar NOT NULL,
	"candidate_id" text NOT NULL,
	"employee_number" text NOT NULL,
	"effective_date_from" text NOT NULL,
	"effective_date_to" text NOT NULL,
	"base_salary" numeric(12, 2) NOT NULL,
	"total_scheduled_minutes" integer DEFAULT 0 NOT NULL,
	"total_worked_minutes" integer DEFAULT 0 NOT NULL,
	"days_worked" integer DEFAULT 0 NOT NULL,
	"excused_days" integer DEFAULT 0 NOT NULL,
	"absent_days" integer DEFAULT 0 NOT NULL,
	"late_minutes" integer DEFAULT 0 NOT NULL,
	"adjusted_minutes" integer DEFAULT 0 NOT NULL,
	"effective_minutes" integer DEFAULT 0 NOT NULL,
	"per_minute_rate" numeric(10, 6) DEFAULT '0' NOT NULL,
	"gross_earned" numeric(12, 2) DEFAULT '0' NOT NULL,
	"manual_additions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"manual_deductions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total_manual_additions" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_manual_deductions" numeric(12, 2) DEFAULT '0' NOT NULL,
	"absent_deduction" numeric(12, 2) DEFAULT '0' NOT NULL,
	"late_deduction" numeric(12, 2) DEFAULT '0' NOT NULL,
	"asset_deductions" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_deductions" numeric(12, 2) DEFAULT '0' NOT NULL,
	"net_payable" numeric(12, 2) DEFAULT '0' NOT NULL,
	"tranche1_amount" numeric(12, 2),
	"tranche2_amount" numeric(12, 2),
	"tranche1_status" text DEFAULT 'pending',
	"tranche2_status" text,
	"tranche2_blocked_reason" text,
	"payment_method" text DEFAULT 'bank_transfer' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pay_runs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"event_id" varchar,
	"date_from" text NOT NULL,
	"date_to" text NOT NULL,
	"mode" text DEFAULT 'full' NOT NULL,
	"split_percentage" integer,
	"tranche1_deposit_date" text,
	"tranche2_deposit_date" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_adjustments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workforce_id" varchar NOT NULL,
	"date" text NOT NULL,
	"original_deduction_minutes" integer DEFAULT 0 NOT NULL,
	"adjusted_deduction_minutes" integer DEFAULT 0 NOT NULL,
	"reason" text NOT NULL,
	"adjusted_by" text NOT NULL,
	"adjusted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_transactions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pay_run_line_id" varchar NOT NULL,
	"workforce_id" varchar NOT NULL,
	"candidate_id" text NOT NULL,
	"tranche_number" integer DEFAULT 1 NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"payment_method" text DEFAULT 'bank_transfer' NOT NULL,
	"bank_transaction_id" text,
	"iban_used" text,
	"bank_code" text,
	"bank_name" text,
	"beneficiary_name" text,
	"receipt_number" text,
	"otp_verified" boolean,
	"otp_sent_to" text,
	"otp_verified_at" timestamp,
	"manual_override" boolean DEFAULT false NOT NULL,
	"override_reason" text,
	"disbursed_by" text,
	"deposit_date" text NOT NULL,
	"entered_by" text NOT NULL,
	"entered_at" timestamp DEFAULT now() NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "photo_change_requests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" varchar NOT NULL,
	"new_photo_url" text NOT NULL,
	"previous_photo_url" text,
	"status" "photo_change_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by" varchar,
	"reviewed_at" timestamp,
	"review_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"department_id" varchar NOT NULL,
	"parent_position_id" varchar,
	"title" text NOT NULL,
	"title_ar" text,
	"code" varchar(20) NOT NULL,
	"description" text,
	"grade_level" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "positions_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "printer_plugins" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'zebra_browser_print' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_sets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule_assignments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workforce_id" varchar NOT NULL,
	"template_id" varchar NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text,
	"notes" text,
	"assigned_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"event_id" varchar,
	"monday_shift_id" varchar,
	"tuesday_shift_id" varchar,
	"wednesday_shift_id" varchar,
	"thursday_shift_id" varchar,
	"friday_shift_id" varchar,
	"saturday_shift_id" varchar,
	"sunday_shift_id" varchar,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shifts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"color" text DEFAULT '#10b981' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "smp_companies" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"cr_number" varchar(50),
	"contact_person" text,
	"contact_phone" text,
	"contact_email" text,
	"bank_name" text,
	"bank_iban" varchar(34),
	"region" text,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "smp_documents" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"smp_company_id" varchar NOT NULL,
	"file_url" text NOT NULL,
	"file_name" text NOT NULL,
	"description" text,
	"event_id" varchar,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	"uploaded_by" varchar
);
--> statement-breakpoint
CREATE TABLE "sms_broadcast_recipients" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"broadcast_id" varchar NOT NULL,
	"workforce_id" varchar,
	"phone" text NOT NULL,
	"resolved_message" text NOT NULL,
	"recipient_name" text,
	"status" "broadcast_recipient_status" DEFAULT 'pending' NOT NULL,
	"error" text,
	"sent_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "sms_broadcasts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_template" text NOT NULL,
	"total_recipients" integer DEFAULT 0 NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"status" "broadcast_status" DEFAULT 'sending' NOT NULL,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sms_plugins" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"version" text DEFAULT '1.0.0' NOT NULL,
	"description" text,
	"plugin_config" jsonb NOT NULL,
	"credentials" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"installed_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"email" text NOT NULL,
	"password" text NOT NULL,
	"role" "user_role" DEFAULT 'recruiter' NOT NULL,
	"full_name" text,
	"phone" text,
	"national_id" varchar(20),
	"avatar_url" text,
	"business_unit_id" varchar,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "workforce" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_number" varchar(7) NOT NULL,
	"candidate_id" varchar NOT NULL,
	"job_id" varchar,
	"event_id" varchar,
	"smp_company_id" varchar,
	"position_id" varchar,
	"employment_type" "employment_type" DEFAULT 'individual' NOT NULL,
	"salary" numeric(10, 2),
	"start_date" text NOT NULL,
	"end_date" text,
	"termination_reason" text,
	"termination_category" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"supervisor_id" varchar,
	"performance_score" numeric(3, 2),
	"notes" text,
	"offboarding_status" text,
	"offboarding_started_at" timestamp,
	"offboarding_completed_at" timestamp,
	"final_gross_pay" numeric(12, 2),
	"final_deductions" numeric(12, 2),
	"final_net_settlement" numeric(12, 2),
	"settlement_paid_at" timestamp,
	"settlement_paid_by" text,
	"settlement_reference" text,
	"payment_method" text DEFAULT 'bank_transfer' NOT NULL,
	"payment_method_reason" text,
	"payment_method_set_by" text,
	"payment_method_set_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_job_id_job_postings_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job_postings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_workforce_id_workforce_id_fk" FOREIGN KEY ("workforce_id") REFERENCES "public"."workforce"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_submissions" ADD CONSTRAINT "attendance_submissions_workforce_id_workforce_id_fk" FOREIGN KEY ("workforce_id") REFERENCES "public"."workforce"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_submissions" ADD CONSTRAINT "attendance_submissions_matched_geofence_id_geofence_zones_id_fk" FOREIGN KEY ("matched_geofence_id") REFERENCES "public"."geofence_zones"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_submissions" ADD CONSTRAINT "attendance_submissions_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_submissions" ADD CONSTRAINT "attendance_submissions_linked_attendance_record_id_attendance_records_id_fk" FOREIGN KEY ("linked_attendance_record_id") REFERENCES "public"."attendance_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_contracts" ADD CONSTRAINT "candidate_contracts_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_contracts" ADD CONSTRAINT "candidate_contracts_onboarding_id_onboarding_id_fk" FOREIGN KEY ("onboarding_id") REFERENCES "public"."onboarding"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_contracts" ADD CONSTRAINT "candidate_contracts_template_id_contract_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."contract_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_templates" ADD CONSTRAINT "contract_templates_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_templates" ADD CONSTRAINT "contract_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_assets" ADD CONSTRAINT "employee_assets_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_assets" ADD CONSTRAINT "employee_assets_workforce_id_workforce_id_fk" FOREIGN KEY ("workforce_id") REFERENCES "public"."workforce"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "excuse_requests" ADD CONSTRAINT "excuse_requests_workforce_id_workforce_id_fk" FOREIGN KEY ("workforce_id") REFERENCES "public"."workforce"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "excuse_requests" ADD CONSTRAINT "excuse_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "id_card_print_logs" ADD CONSTRAINT "id_card_print_logs_employee_id_workforce_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."workforce"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "id_card_print_logs" ADD CONSTRAINT "id_card_print_logs_template_id_id_card_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."id_card_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "id_card_print_logs" ADD CONSTRAINT "id_card_print_logs_printed_by_users_id_fk" FOREIGN KEY ("printed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "id_card_print_logs" ADD CONSTRAINT "id_card_print_logs_printer_plugin_id_printer_plugins_id_fk" FOREIGN KEY ("printer_plugin_id") REFERENCES "public"."printer_plugins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "id_card_templates" ADD CONSTRAINT "id_card_templates_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_interviewer_id_users_id_fk" FOREIGN KEY ("interviewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_postings" ADD CONSTRAINT "job_postings_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_postings" ADD CONSTRAINT "job_postings_posted_by_users_id_fk" FOREIGN KEY ("posted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_postings" ADD CONSTRAINT "job_postings_business_unit_id_business_units_id_fk" FOREIGN KEY ("business_unit_id") REFERENCES "public"."business_units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_postings" ADD CONSTRAINT "job_postings_question_set_id_question_sets_id_fk" FOREIGN KEY ("question_set_id") REFERENCES "public"."question_sets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding" ADD CONSTRAINT "onboarding_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding" ADD CONSTRAINT "onboarding_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding" ADD CONSTRAINT "onboarding_job_id_job_postings_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job_postings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding" ADD CONSTRAINT "onboarding_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding" ADD CONSTRAINT "onboarding_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding" ADD CONSTRAINT "onboarding_converted_by_users_id_fk" FOREIGN KEY ("converted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_run_lines" ADD CONSTRAINT "pay_run_lines_pay_run_id_pay_runs_id_fk" FOREIGN KEY ("pay_run_id") REFERENCES "public"."pay_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_run_lines" ADD CONSTRAINT "pay_run_lines_workforce_id_workforce_id_fk" FOREIGN KEY ("workforce_id") REFERENCES "public"."workforce"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_runs" ADD CONSTRAINT "pay_runs_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_runs" ADD CONSTRAINT "pay_runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_workforce_id_workforce_id_fk" FOREIGN KEY ("workforce_id") REFERENCES "public"."workforce"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_transactions" ADD CONSTRAINT "payroll_transactions_pay_run_line_id_pay_run_lines_id_fk" FOREIGN KEY ("pay_run_line_id") REFERENCES "public"."pay_run_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_transactions" ADD CONSTRAINT "payroll_transactions_workforce_id_workforce_id_fk" FOREIGN KEY ("workforce_id") REFERENCES "public"."workforce"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_change_requests" ADD CONSTRAINT "photo_change_requests_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_change_requests" ADD CONSTRAINT "photo_change_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_parent_position_id_positions_id_fk" FOREIGN KEY ("parent_position_id") REFERENCES "public"."positions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_sets" ADD CONSTRAINT "question_sets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_assignments" ADD CONSTRAINT "schedule_assignments_workforce_id_workforce_id_fk" FOREIGN KEY ("workforce_id") REFERENCES "public"."workforce"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_assignments" ADD CONSTRAINT "schedule_assignments_template_id_schedule_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."schedule_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_assignments" ADD CONSTRAINT "schedule_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_templates" ADD CONSTRAINT "schedule_templates_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_templates" ADD CONSTRAINT "schedule_templates_monday_shift_id_shifts_id_fk" FOREIGN KEY ("monday_shift_id") REFERENCES "public"."shifts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_templates" ADD CONSTRAINT "schedule_templates_tuesday_shift_id_shifts_id_fk" FOREIGN KEY ("tuesday_shift_id") REFERENCES "public"."shifts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_templates" ADD CONSTRAINT "schedule_templates_wednesday_shift_id_shifts_id_fk" FOREIGN KEY ("wednesday_shift_id") REFERENCES "public"."shifts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_templates" ADD CONSTRAINT "schedule_templates_thursday_shift_id_shifts_id_fk" FOREIGN KEY ("thursday_shift_id") REFERENCES "public"."shifts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_templates" ADD CONSTRAINT "schedule_templates_friday_shift_id_shifts_id_fk" FOREIGN KEY ("friday_shift_id") REFERENCES "public"."shifts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_templates" ADD CONSTRAINT "schedule_templates_saturday_shift_id_shifts_id_fk" FOREIGN KEY ("saturday_shift_id") REFERENCES "public"."shifts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_templates" ADD CONSTRAINT "schedule_templates_sunday_shift_id_shifts_id_fk" FOREIGN KEY ("sunday_shift_id") REFERENCES "public"."shifts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "smp_documents" ADD CONSTRAINT "smp_documents_smp_company_id_smp_companies_id_fk" FOREIGN KEY ("smp_company_id") REFERENCES "public"."smp_companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "smp_documents" ADD CONSTRAINT "smp_documents_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "smp_documents" ADD CONSTRAINT "smp_documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_broadcast_recipients" ADD CONSTRAINT "sms_broadcast_recipients_broadcast_id_sms_broadcasts_id_fk" FOREIGN KEY ("broadcast_id") REFERENCES "public"."sms_broadcasts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_broadcast_recipients" ADD CONSTRAINT "sms_broadcast_recipients_workforce_id_workforce_id_fk" FOREIGN KEY ("workforce_id") REFERENCES "public"."workforce"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_broadcasts" ADD CONSTRAINT "sms_broadcasts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_business_unit_id_business_units_id_fk" FOREIGN KEY ("business_unit_id") REFERENCES "public"."business_units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workforce" ADD CONSTRAINT "workforce_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workforce" ADD CONSTRAINT "workforce_job_id_job_postings_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job_postings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workforce" ADD CONSTRAINT "workforce_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workforce" ADD CONSTRAINT "workforce_smp_company_id_smp_companies_id_fk" FOREIGN KEY ("smp_company_id") REFERENCES "public"."smp_companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workforce" ADD CONSTRAINT "workforce_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workforce" ADD CONSTRAINT "workforce_supervisor_id_users_id_fk" FOREIGN KEY ("supervisor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "applications_candidate_idx" ON "applications" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "applications_job_idx" ON "applications" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "applications_status_idx" ON "applications" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "applications_candidate_job_idx" ON "applications" USING btree ("candidate_id","job_id");--> statement-breakpoint
CREATE INDEX "assets_name_idx" ON "assets" USING btree ("name");--> statement-breakpoint
CREATE INDEX "attendance_records_workforce_idx" ON "attendance_records" USING btree ("workforce_id");--> statement-breakpoint
CREATE INDEX "attendance_records_date_idx" ON "attendance_records" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_records_workforce_date_idx" ON "attendance_records" USING btree ("workforce_id","date");--> statement-breakpoint
CREATE INDEX "att_sub_workforce_idx" ON "attendance_submissions" USING btree ("workforce_id");--> statement-breakpoint
CREATE INDEX "att_sub_status_idx" ON "attendance_submissions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "att_sub_submitted_at_idx" ON "attendance_submissions" USING btree ("submitted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "att_sub_token_idx" ON "attendance_submissions" USING btree ("submission_token");--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_type_idx" ON "audit_logs" USING btree ("entity_type");--> statement-breakpoint
CREATE UNIQUE INDEX "business_units_code_idx" ON "business_units" USING btree ("code");--> statement-breakpoint
CREATE INDEX "cc_candidate_idx" ON "candidate_contracts" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "cc_onboarding_idx" ON "candidate_contracts" USING btree ("onboarding_id");--> statement-breakpoint
CREATE INDEX "cc_template_idx" ON "candidate_contracts" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "cc_status_idx" ON "candidate_contracts" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "candidates_user_id_idx" ON "candidates" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "candidates_email_idx" ON "candidates" USING btree ("email");--> statement-breakpoint
CREATE INDEX "candidates_phone_idx" ON "candidates" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "candidates_status_idx" ON "candidates" USING btree ("status");--> statement-breakpoint
CREATE INDEX "candidates_nationality_idx" ON "candidates" USING btree ("nationality");--> statement-breakpoint
CREATE INDEX "candidates_city_idx" ON "candidates" USING btree ("city");--> statement-breakpoint
CREATE INDEX "candidates_rating_idx" ON "candidates" USING btree ("rating");--> statement-breakpoint
CREATE INDEX "candidates_created_at_idx" ON "candidates" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "candidates_national_id_idx" ON "candidates" USING btree ("national_id");--> statement-breakpoint
CREATE UNIQUE INDEX "candidates_iqama_number_idx" ON "candidates" USING btree ("iqama_number");--> statement-breakpoint
CREATE UNIQUE INDEX "candidates_passport_number_idx" ON "candidates" USING btree ("passport_number");--> statement-breakpoint
CREATE INDEX "candidates_status_city_idx" ON "candidates" USING btree ("status","city");--> statement-breakpoint
CREATE INDEX "candidates_full_name_en_idx" ON "candidates" USING btree ("full_name_en");--> statement-breakpoint
CREATE INDEX "ct_event_idx" ON "contract_templates" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "ct_status_idx" ON "contract_templates" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ct_parent_idx" ON "contract_templates" USING btree ("parent_template_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ct_name_version_idx" ON "contract_templates" USING btree ("name","version");--> statement-breakpoint
CREATE UNIQUE INDEX "departments_code_idx" ON "departments" USING btree ("code");--> statement-breakpoint
CREATE INDEX "employee_assets_asset_idx" ON "employee_assets" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "employee_assets_workforce_idx" ON "employee_assets" USING btree ("workforce_id");--> statement-breakpoint
CREATE INDEX "employee_assets_status_idx" ON "employee_assets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "events_status_idx" ON "events" USING btree ("status");--> statement-breakpoint
CREATE INDEX "excuse_requests_workforce_idx" ON "excuse_requests" USING btree ("workforce_id");--> statement-breakpoint
CREATE INDEX "excuse_requests_date_idx" ON "excuse_requests" USING btree ("date");--> statement-breakpoint
CREATE INDEX "excuse_requests_status_idx" ON "excuse_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "geofence_zones_active_idx" ON "geofence_zones" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "print_logs_employee_idx" ON "id_card_print_logs" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "print_logs_template_idx" ON "id_card_print_logs" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "print_logs_printed_at_idx" ON "id_card_print_logs" USING btree ("printed_at");--> statement-breakpoint
CREATE INDEX "print_logs_printed_by_idx" ON "id_card_print_logs" USING btree ("printed_by");--> statement-breakpoint
CREATE INDEX "id_card_templates_event_idx" ON "id_card_templates" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "id_card_templates_active_idx" ON "id_card_templates" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "inbox_items_status_idx" ON "inbox_items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "inbox_items_type_idx" ON "inbox_items" USING btree ("type");--> statement-breakpoint
CREATE INDEX "inbox_items_priority_idx" ON "inbox_items" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "inbox_items_created_at_idx" ON "inbox_items" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "inbox_items_entity_idx" ON "inbox_items" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "interviews_event_idx" ON "interviews" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "interviews_candidate_idx" ON "interviews" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "interviews_scheduled_at_idx" ON "interviews" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "interviews_status_idx" ON "interviews" USING btree ("status");--> statement-breakpoint
CREATE INDEX "jobs_status_idx" ON "job_postings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "jobs_event_idx" ON "job_postings" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "jobs_region_idx" ON "job_postings" USING btree ("region");--> statement-breakpoint
CREATE INDEX "notifications_recipient_idx" ON "notifications" USING btree ("recipient_id");--> statement-breakpoint
CREATE INDEX "notifications_status_idx" ON "notifications" USING btree ("status");--> statement-breakpoint
CREATE INDEX "notifications_created_at_idx" ON "notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "onboarding_candidate_idx" ON "onboarding" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "onboarding_status_idx" ON "onboarding" USING btree ("status");--> statement-breakpoint
CREATE INDEX "onboarding_event_idx" ON "onboarding" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "pay_run_lines_pay_run_idx" ON "pay_run_lines" USING btree ("pay_run_id");--> statement-breakpoint
CREATE INDEX "pay_run_lines_workforce_idx" ON "pay_run_lines" USING btree ("workforce_id");--> statement-breakpoint
CREATE INDEX "pay_run_lines_candidate_idx" ON "pay_run_lines" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "pay_runs_event_idx" ON "pay_runs" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "pay_runs_status_idx" ON "pay_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payroll_adj_workforce_idx" ON "payroll_adjustments" USING btree ("workforce_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_adj_workforce_date_idx" ON "payroll_adjustments" USING btree ("workforce_id","date");--> statement-breakpoint
CREATE INDEX "payroll_txn_pay_run_line_idx" ON "payroll_transactions" USING btree ("pay_run_line_id");--> statement-breakpoint
CREATE INDEX "payroll_txn_workforce_idx" ON "payroll_transactions" USING btree ("workforce_id");--> statement-breakpoint
CREATE INDEX "payroll_txn_candidate_idx" ON "payroll_transactions" USING btree ("candidate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_txn_bank_txn_idx" ON "payroll_transactions" USING btree ("bank_transaction_id");--> statement-breakpoint
CREATE INDEX "photo_change_candidate_idx" ON "photo_change_requests" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "photo_change_status_idx" ON "photo_change_requests" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "positions_code_idx" ON "positions" USING btree ("code");--> statement-breakpoint
CREATE INDEX "positions_dept_idx" ON "positions" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "positions_parent_idx" ON "positions" USING btree ("parent_position_id");--> statement-breakpoint
CREATE INDEX "schedule_assignments_workforce_idx" ON "schedule_assignments" USING btree ("workforce_id");--> statement-breakpoint
CREATE INDEX "schedule_assignments_template_idx" ON "schedule_assignments" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "schedule_assignments_start_date_idx" ON "schedule_assignments" USING btree ("start_date");--> statement-breakpoint
CREATE INDEX "schedule_templates_event_idx" ON "schedule_templates" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "smp_companies_name_idx" ON "smp_companies" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "smp_companies_cr_number_idx" ON "smp_companies" USING btree ("cr_number");--> statement-breakpoint
CREATE INDEX "smp_companies_active_idx" ON "smp_companies" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "smp_documents_company_idx" ON "smp_documents" USING btree ("smp_company_id");--> statement-breakpoint
CREATE INDEX "sms_br_broadcast_idx" ON "sms_broadcast_recipients" USING btree ("broadcast_id");--> statement-breakpoint
CREATE INDEX "sms_br_status_idx" ON "sms_broadcast_recipients" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sms_broadcasts_status_idx" ON "sms_broadcasts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sms_broadcasts_created_at_idx" ON "sms_broadcasts" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_idx" ON "users" USING btree ("username");--> statement-breakpoint
CREATE INDEX "users_phone_idx" ON "users" USING btree ("phone");--> statement-breakpoint
CREATE UNIQUE INDEX "users_national_id_idx" ON "users" USING btree ("national_id");--> statement-breakpoint
CREATE INDEX "workforce_candidate_idx" ON "workforce" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "workforce_event_idx" ON "workforce" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "workforce_active_idx" ON "workforce" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "workforce_emp_num_unique_idx" ON "workforce" USING btree ("employee_number");--> statement-breakpoint
CREATE INDEX "workforce_offboarding_idx" ON "workforce" USING btree ("offboarding_status");