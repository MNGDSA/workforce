/**
 * Unit tests for the InterviewCandidatesPage Excel export helpers.
 *
 * The workbook is now 7 columns (down from the original 10): the internal
 * candidate ID, the Arabic display name, and the question-set name were
 * dropped per recruiter request. These tests pin the new contract — column
 * count, ordering, and the value at every index — so any future
 * reordering / removal trips a clear failure instead of silently shifting
 * cells in downstream Excel pipelines.
 *
 * The helpers in `interviews-export.ts` are pure (no DOM, no xlsx writer),
 * so we exercise them directly with node:test.
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
  fullNameEn: "Full name (English)",
  nationalId: "National / Iqama ID",
  phone: "Phone",
  decision: "Decision",
  decisionRaw: "Decision (raw)",
  applicationStatus: "Application status",
};

function make(overrides: Partial<ExportInvitee> = {}): ExportInvitee {
  return {
    id: "uuid-aaaaaaaa-1111",
    fullNameEn: "Ahmed Almohammed",
    nationalId: "1234567890",
    phone: "+966500000000",
    applicationStatus: null,
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

test("buildExportHeaders returns the 7-column contract in the documented order", () => {
  const headers = buildExportHeaders(HEADERS);
  assert.equal(headers.length, 7);
  assert.deepEqual(headers, [
    "#",
    "Full name (English)",
    "National / Iqama ID",
    "Phone",
    "Decision",
    "Decision (raw)",
    "Application status",
  ]);
});

test("buildExportRow emits exactly 7 cells aligned with the header order", () => {
  const row = buildExportRow(make(), 0, {}, LABELS);
  assert.equal(row.length, 7);
  assert.equal(row[0], 1, "row index is 1-based");
  assert.equal(row[1], "Ahmed Almohammed", "English name in column 2");
  assert.equal(row[2], "1234567890", "National ID in column 3");
  assert.equal(row[3], "+966500000000", "Phone in column 4");
});

test("decision label and raw value reflect the optimistic localStatuses overlay", () => {
  const c = make({ id: "x1", applicationStatus: "interviewed" });
  // Local optimistic state ("Liked") wins over the server status ("interviewed").
  const row = buildExportRow(c, 0, { x1: "shortlisted" }, LABELS);
  assert.equal(row[4], "Liked", "decision label uses overlay");
  assert.equal(row[5], "shortlisted", "decision raw uses overlay");
  assert.equal(row[6], "shortlisted", "application status reflects overlay");

  const fallback = buildExportRow(c, 0, {}, LABELS);
  assert.equal(fallback[4], "No action");
  assert.equal(fallback[5], "none");
  assert.equal(fallback[6], "interviewed");
});

test("rejected decisions render as Disliked / rejected", () => {
  const row = buildExportRow(
    make({ applicationStatus: "rejected" }),
    0,
    {},
    LABELS,
  );
  assert.equal(row[4], "Disliked");
  assert.equal(row[5], "rejected");
});

test("nullable fields collapse to empty strings, never the literal 'null'", () => {
  const row = buildExportRow(
    make({ nationalId: null, phone: null }),
    0,
    {},
    LABELS,
  );
  assert.equal(row.length, 7, "column count never collapses");
  assert.equal(row[2], "", "National ID column is empty, never literal null");
  assert.equal(row[3], "", "Phone column is empty, never literal null");
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
