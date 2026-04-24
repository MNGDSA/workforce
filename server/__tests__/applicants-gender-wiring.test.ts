// Task #173 wiring test — pins three contracts:
//   1. The ApplicationCandidateSummary type exposes `gender`.
//   2. getApplications() selects `gender` from the candidates table when
//      includeCandidate is true (so the /job-posting/:id sex column has data).
//   3. The candidates table actually has a `gender` enum column to select from.
//
// This is a source-level wiring check (same style as
// `candidate-iban-resolution.test.ts`) because the project has no DB-backed
// integration harness — but it still surfaces a regression if anyone removes
// the gender field from the type, the select, or the schema.

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const storagePath = path.join(import.meta.dirname, "..", "storage.ts");
const schemaPath = path.join(import.meta.dirname, "..", "..", "shared", "schema.ts");

const storageSource = readFileSync(storagePath, "utf8");
const schemaSource = readFileSync(schemaPath, "utf8");

describe("Applicants table — gender wiring (task #173)", () => {
  it("ApplicationCandidateSummary type includes gender", () => {
    const typeMatch = storageSource.match(
      /export\s+type\s+ApplicationCandidateSummary\s*=\s*{[\s\S]*?};/,
    );
    assert.ok(typeMatch, "ApplicationCandidateSummary type not found in server/storage.ts");
    assert.match(
      typeMatch[0],
      /\bgender\??:/,
      "ApplicationCandidateSummary must declare a `gender` field — required by the sex column on /job-posting/:id",
    );
  });

  it("getApplications selects gender from candidates", () => {
    const fnMatch = storageSource.match(
      /async\s+getApplications\s*\([\s\S]*?\n\s{2}\}\s*\n/,
    );
    assert.ok(fnMatch, "getApplications method body not found in server/storage.ts");
    assert.match(
      fnMatch[0],
      /candidates\.gender/,
      "getApplications must select candidates.gender so the applicants table can render the sex column",
    );
  });

  it("candidates schema exposes a gender enum column", () => {
    assert.match(
      schemaSource,
      /genderEnum\s*=\s*pgEnum\(/,
      "shared/schema.ts must define `genderEnum`",
    );
    assert.match(
      schemaSource,
      /gender:\s*genderEnum\(/,
      "candidates table must have a `gender` column typed by genderEnum",
    );
  });
});
