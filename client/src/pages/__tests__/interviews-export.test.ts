/**
 * Unit tests for the InterviewCandidatesPage Excel export helpers
 * (Task #255 follow-on, satisfying the validation requirement for
 * committed coverage of decision bucketing, candidate-ID fallback,
 * filename derivation, and the 10-column workbook contract).
 *
 * The helpers in `interviews-export.ts` are pure — they do not touch the
 * DOM or the xlsx writer — so we exercise them directly with node:test.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bucketDecision,
  buildExportRow,
  buildExportHeaders,
  buildExportFilename,
  buildSheetName,
  type ExportInvitee,
} from "../interviews-export";

const LABELS = { liked: "Liked", disliked: "Disliked", none: "No action" };
const HEADERS = {
  num: "#",
  candidateId: "Candidate ID",
  fullNameAr: "Full name (Arabic)",
  fullNameEn: "Full name (English)",
  nationalId: "National / Iqama ID",
  phone: "Phone",
  decision: "Decision",
  decisionRaw: "Decision (raw)",
  applicationStatus: "Application status",
  questionSet: "Question set",
};

function make(overrides: Partial<ExportInvitee> = {}): ExportInvitee {
  return {
    id: "uuid-aaaaaaaa-1111",
    candidateCode: "C-00042",
    fullName: "أحمد المحمد",
    fullNameEn: "Ahmed Almohammed",
    nationalId: "1234567890",
    phone: "+966500000000",
    applicationStatus: null,
    questionSetId: null,
    ...overrides,
  };
}

test("bucketDecision maps every input to one of the three buckets", () => {
  assert.equal(bucketDecision("shortlisted"), "shortlisted");
  assert.equal(bucketDecision("rejected"), "rejected");
  assert.equal(bucketDecision("interviewed"), "none");
  assert.equal(bucketDecision("invited"), "none");
  assert.equal(bucketDecision("withdrawn"), "none");
  assert.equal(bucketDecision(null), "none");
  assert.equal(bucketDecision(undefined), "none");
  assert.equal(bucketDecision(""), "none");
});

test("buildExportHeaders returns the 10-column contract in the documented order", () => {
  const headers = buildExportHeaders(HEADERS);
  assert.equal(headers.length, 10);
  assert.deepEqual(headers, [
    "#",
    "Candidate ID",
    "Full name (Arabic)",
    "Full name (English)",
    "National / Iqama ID",
    "Phone",
    "Decision",
    "Decision (raw)",
    "Application status",
    "Question set",
  ]);
});

test("buildExportRow emits exactly 10 cells aligned with the header order", () => {
  const row = buildExportRow(make(), 0, {}, {}, LABELS);
  assert.equal(row.length, 10);
  assert.equal(row[0], 1, "row index is 1-based");
  assert.equal(row[2], "أحمد المحمد", "Arabic name in column 3");
  assert.equal(row[3], "Ahmed Almohammed", "English name in column 4");
});

test("Arabic name column is reserved as empty string when the source is null", () => {
  // The candidates table has no Arabic name field today; the column is
  // preserved in the contract with an empty placeholder so downstream
  // tooling sees a stable layout.
  const row = buildExportRow(make({ fullName: null }), 0, {}, {}, LABELS);
  assert.equal(row.length, 10, "column count never collapses");
  assert.equal(row[2], "", "Arabic column is empty, never literal null");
  assert.equal(row[3], "Ahmed Almohammed", "English column still populated");
});

test("candidate ID prefers candidate_code; falls back to UUID when missing or blank", () => {
  const withCode = buildExportRow(make({ candidateCode: "C-99999" }), 0, {}, {}, LABELS);
  assert.equal(withCode[1], "C-99999");

  const noCode = buildExportRow(make({ candidateCode: null }), 0, {}, {}, LABELS);
  assert.equal(noCode[1], "uuid-aaaaaaaa-1111");

  const blankCode = buildExportRow(make({ candidateCode: "   " }), 0, {}, {}, LABELS);
  assert.equal(blankCode[1], "uuid-aaaaaaaa-1111", "all-whitespace code falls back");
});

test("decision label and raw value reflect the optimistic localStatuses overlay", () => {
  const c = make({ id: "x1", applicationStatus: "interviewed" });
  // Local optimistic state ("Liked") wins over the server status ("interviewed").
  const row = buildExportRow(c, 0, { x1: "shortlisted" }, {}, LABELS);
  assert.equal(row[6], "Liked", "decision label uses overlay");
  assert.equal(row[7], "shortlisted", "decision raw uses overlay");
  assert.equal(row[8], "shortlisted", "application status reflects overlay");

  const fallback = buildExportRow(c, 0, {}, {}, LABELS);
  assert.equal(fallback[6], "No action");
  assert.equal(fallback[7], "none");
  assert.equal(fallback[8], "interviewed");
});

test("rejected decisions render as Disliked / rejected", () => {
  const row = buildExportRow(
    make({ applicationStatus: "rejected" }),
    0,
    {},
    {},
    LABELS,
  );
  assert.equal(row[6], "Disliked");
  assert.equal(row[7], "rejected");
});

test("question set name is resolved from the lookup map; empty when missing", () => {
  const c = make({ questionSetId: "qs-1" });
  const named = buildExportRow(c, 0, {}, { "qs-1": "Driver Screening" }, LABELS);
  assert.equal(named[9], "Driver Screening");

  const missing = buildExportRow(c, 0, {}, {}, LABELS);
  assert.equal(missing[9], "", "empty string when qs id is unknown");

  const noQs = buildExportRow(make({ questionSetId: null }), 0, {}, {}, LABELS);
  assert.equal(noQs[9], "");
});

test("nullable fields collapse to empty strings, never the literal 'null'", () => {
  const row = buildExportRow(
    make({ fullName: null, nationalId: null, phone: null }),
    0,
    {},
    {},
    LABELS,
  );
  assert.equal(row[2], "");
  assert.equal(row[4], "");
  assert.equal(row[5], "");
});

test("buildSheetName sanitizes Excel-illegal characters and respects 31-char limit", () => {
  assert.equal(buildSheetName("Drivers Q1"), "Drivers Q1");
  assert.equal(buildSheetName(null), "Interview");
  assert.equal(buildSheetName(""), "Interview");
  assert.equal(buildSheetName("   "), "Interview");
  assert.equal(buildSheetName("a/b\\c:d?e*f[g]h"), "a-b-c-d-e-f-g-h");
  const long = "x".repeat(60);
  assert.equal(buildSheetName(long).length, 31);
});

test("buildExportFilename always includes a slug and the ISO date", () => {
  const fixed = new Date("2026-05-01T10:00:00Z");
  assert.equal(buildExportFilename("Drivers Q1", fixed), "interview_drivers-q1_2026-05-01.xlsx");
  // All-Arabic name strips to empty ASCII → falls back to "session" so the
  // filename still carries a stable identifier (never just `interview_<date>`).
  assert.equal(buildExportFilename("مقابلة السائقين", fixed), "interview_session_2026-05-01.xlsx");
  assert.equal(buildExportFilename(null, fixed), "interview_session_2026-05-01.xlsx");
  assert.equal(buildExportFilename("", fixed), "interview_session_2026-05-01.xlsx");
});
