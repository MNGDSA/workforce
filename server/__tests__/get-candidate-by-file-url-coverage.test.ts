// Guards against the regression that hid the new `driversLicenseFileUrl`
// and `vaccinationReportFileUrl` columns from the authenticated file
// proxy.
//
// Background: `/api/files/uploads/<key>` (server/routes.ts) calls
// `storage.getCandidateByFileUrl(url)` to find the owning candidate
// before serving a private document. If a new file column is added to
// the candidates table but not to that lookup's OR list, the proxy
// 404s every request for files in that column even though the upload
// flow, the DO Spaces ACL, and the frontend wrapping are all correct.
// The Driver's License / Vaccination Report shipping incident on prod
// was caused by exactly this — see git log near this file.
//
// Strategy: enumerate every column on the `candidates` Drizzle table
// whose JS property name ends in `FileUrl` (plus the two historical
// outliers, `photoUrl` and `resumeUrl`), then read the source of
// `storage.ts` and assert each property name appears inside the body
// of `getCandidateByFileUrl`. Pure static check, no DB required, runs
// in milliseconds under the existing `npm test` runner.
//
// Run with:
//   npx tsx --test server/__tests__/get-candidate-by-file-url-coverage.test.ts

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { getTableColumns } from "drizzle-orm";

import { candidates } from "../../shared/schema";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const STORAGE_PATH = resolve(__dirname, "../storage.ts");

// Historical outliers: file-bearing columns whose JS names don't end in
// `FileUrl`. Both are valid candidate file references and must be
// recognised by the proxy lookup.
const EXTRA_FILE_COLUMNS = ["photoUrl", "resumeUrl"] as const;

function listExpectedFileColumns(): string[] {
  const cols = getTableColumns(candidates);
  const fileUrlCols = Object.keys(cols).filter((name) =>
    name.endsWith("FileUrl"),
  );
  const all = new Set<string>([...fileUrlCols, ...EXTRA_FILE_COLUMNS]);
  // Sort for deterministic assertion failure messages.
  return Array.from(all).sort();
}

function extractFunctionBody(source: string, name: string): string {
  // Find the method declaration and walk braces to capture the body.
  // Matches `async <name>(` or `<name>(` after a method-like prefix.
  // The optional return-type clause must not contain `;` so that this
  // regex does not match the abstract interface declaration
  // (`<name>(...): Promise<...>;`) and then greedily run forward to
  // some later function's body.
  const declRe = new RegExp(
    `(?:async\\s+)?${name}\\s*\\([^)]*\\)\\s*(?::[^\\{;]+)?\\{`,
  );
  const match = declRe.exec(source);
  if (!match) {
    throw new Error(
      `Could not locate '${name}' in storage.ts. The static-analysis test ` +
        `needs to be updated to match the new declaration shape.`,
    );
  }
  let depth = 1;
  let i = match.index + match[0].length;
  const start = i;
  while (i < source.length && depth > 0) {
    const ch = source[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") depth -= 1;
    i += 1;
  }
  if (depth !== 0) {
    throw new Error(`Unbalanced braces while reading body of '${name}'.`);
  }
  return source.slice(start, i - 1);
}

describe("getCandidateByFileUrl proxy lookup coverage", () => {
  const source = readFileSync(STORAGE_PATH, "utf8");
  const body = extractFunctionBody(source, "getCandidateByFileUrl");
  const expected = listExpectedFileColumns();

  it("lists at least the historical file columns plus the two new ones", () => {
    // Sanity check that the introspection is finding what we think it
    // is — guards against the schema rename that would silently empty
    // the expected set and let the real assertion become a no-op.
    for (const required of [
      "photoUrl",
      "resumeUrl",
      "nationalIdFileUrl",
      "ibanFileUrl",
      "driversLicenseFileUrl",
      "vaccinationReportFileUrl",
    ]) {
      assert.ok(
        expected.includes(required),
        `Expected ${required} to be discovered on the candidates table; ` +
          `discovered set was: ${expected.join(", ")}`,
      );
    }
  });

  it("references every file-bearing candidates column inside its OR list", () => {
    const missing = expected.filter(
      (col) => !body.includes(`candidates.${col}`),
    );
    assert.deepEqual(
      missing,
      [],
      `getCandidateByFileUrl is missing OR clauses for: ${missing.join(", ")}.\n` +
        `Add eq(candidates.<col>, url) entries in server/storage.ts so the\n` +
        `authenticated file proxy at /api/files/uploads/* can resolve the\n` +
        `owning candidate for each file column. Without this, the proxy\n` +
        `returns 404 for every file in those columns and the UI renders\n` +
        `nothing — see the Driver's License / Vaccination Report incident.`,
    );
  });
});
