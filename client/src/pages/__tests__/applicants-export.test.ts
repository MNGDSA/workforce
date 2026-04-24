// Task #173 behavioural test for the applicants Excel export.
//
// Builds a real workbook via `buildApplicantsWorkbook` and reads it back
// with XLSX.utils.sheet_to_json so we assert on the actual cell contents
// (header order, City + Sex placement, localised gender values, status
// columns) rather than just regex-scanning the source. xlsx is a pure
// Node-friendly library, so this runs under `tsx --test` without a DOM.

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import * as XLSX from "xlsx";

import {
  buildApplicantsWorkbook,
  type ExportApplication,
  type ExportCandidate,
  type ExportJob,
} from "../job-posting-detail-export";

// Minimal stub matching the i18next TFunction surface our exporter uses.
const stubT = ((key: string, opts?: Record<string, unknown>) => {
  if (key === "jobPosting:detail.exportInstruction") {
    return `# Applicants — ${opts?.title} | statuses: ${opts?.validStatuses}`;
  }
  const map: Record<string, string> = {
    "jobPosting:detail.exportColAppId": "__app_id",
    "jobPosting:detail.exportColName": "Candidate Name",
    "jobPosting:detail.exportColNationalId": "National ID",
    "jobPosting:detail.exportColEmail": "Email",
    "jobPosting:detail.exportColPhone": "Phone",
    "jobPosting:detail.colCity": "City",
    "jobPosting:detail.colSex": "Sex",
    "jobPosting:detail.exportColCurrentStatus": "Current Status",
    "jobPosting:detail.exportColNewStatus": "New Status",
    "jobPosting:detail.sexMale": "Male",
    "jobPosting:detail.sexFemale": "Female",
    "jobPosting:detail.sexOther": "—",
    "jobPosting:detail.unknownCandidate": "Unknown Candidate",
  };
  return map[key] ?? key;
}) as unknown as Parameters<typeof buildApplicantsWorkbook>[4];

const job: ExportJob = { title: "Field Driver" };

const candidates: ExportCandidate[] = [
  { id: "c1", fullNameEn: "Salem Al-Qahtani", phone: "0500000001", email: "salem@x.com", nationalId: "1111111111", city: "Riyadh",  gender: "male" },
  { id: "c2", fullNameEn: "Mona Al-Otaibi",   phone: "0500000002", email: "mona@x.com",  nationalId: "2222222222", city: "Jeddah",  gender: "female" },
  { id: "c3", fullNameEn: "Anonymous",        phone: "0500000003", email: "anon@x.com",  nationalId: "3333333333", city: undefined, gender: "other" },
  { id: "c4", fullNameEn: "Quiet One",        phone: "0500000004", email: "quiet@x.com", nationalId: "4444444444", city: "Dammam",  gender: null },
];

const applications: ExportApplication[] = [
  { id: "a1", candidateId: "c1", status: "new" },
  { id: "a2", candidateId: "c2", status: "shortlisted" },
  { id: "a3", candidateId: "c3", status: "interviewed" },
  { id: "a4", candidateId: "c4", status: "rejected" },
];

const wb = buildApplicantsWorkbook(job, applications, candidates, [], stubT);
const ws = wb.Sheets["Applicants"];
const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, blankrows: false }) as string[][];

const instructionRow = rows[0];
const headerRow = rows[1];
const dataRows = rows.slice(2);

describe("Applicants Excel export — workbook contents (task #173)", () => {
  it("builds an Applicants sheet with one instruction row, one header row, and one row per applicant", () => {
    assert.equal(wb.SheetNames[0], "Applicants");
    assert.equal(rows.length, 1 + 1 + applications.length);
  });

  it("instruction row mentions the job title and the valid status reference values", () => {
    const text = instructionRow.join(" ");
    assert.match(text, /Field Driver/);
    assert.match(text, /new.*shortlisted.*interviewed.*offered.*hired.*rejected/);
  });

  it("header row places City and Sex between Phone and Current Status, in that order", () => {
    assert.deepEqual(
      headerRow,
      [
        "__app_id",
        "Candidate Name",
        "National ID",
        "Email",
        "Phone",
        "City",
        "Sex",
        "Current Status",
        "New Status",
      ],
    );
  });

  it("each data row carries the candidate's city in the City column and the localised sex label in the Sex column", () => {
    const cityIdx = headerRow.indexOf("City");
    const sexIdx  = headerRow.indexOf("Sex");
    const cells: Record<string, { city: string; sex: string }> = {};
    for (const row of dataRows) {
      cells[row[0]] = { city: row[cityIdx], sex: row[sexIdx] };
    }
    assert.deepEqual(cells["a1"], { city: "Riyadh", sex: "Male" });
    assert.deepEqual(cells["a2"], { city: "Jeddah", sex: "Female" });
    // "other" → localised "—" via sexOther; no city → empty string.
    assert.deepEqual(cells["a3"], { city: "",       sex: "—"     });
    // null gender → fallback dash from genderLabel; city present.
    assert.deepEqual(cells["a4"], { city: "Dammam", sex: "—"     });
  });

  it("Current Status and New Status columns both initialise to the application's current status", () => {
    const curIdx = headerRow.indexOf("Current Status");
    const newIdx = headerRow.indexOf("New Status");
    for (const row of dataRows) {
      assert.equal(row[curIdx], row[newIdx], `row ${row[0]}: Current and New Status must match on export`);
    }
  });

  it("instruction row spans the full header width via a single merge", () => {
    const merges = ws["!merges"];
    assert.ok(merges && merges.length === 1, "expected a single merge for the instruction row");
    assert.deepEqual(merges![0], { s: { r: 0, c: 0 }, e: { r: 0, c: headerRow.length - 1 } });
  });
});
