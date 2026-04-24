// Task #173 wiring test — pins the City + Sex columns into both the rendered
// applicants table AND the Excel export on /job-posting/:id.
//
// Source-level checks (same style as the IBAN wiring tests in
// server/__tests__/) because the export function lives inside a React page
// module that imports browser-only deps (xlsx, lucide-react) — pulling it
// into a node:test runtime would require a heavy mock of the React module
// graph for a payoff this test already delivers cheaply.

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const here = import.meta.dirname;
const pagePath = path.join(here, "..", "job-posting-detail.tsx");
const enLocalePath = path.join(
  here, "..", "..", "lib", "i18n", "locales", "en", "jobPosting.json",
);
const arLocalePath = path.join(
  here, "..", "..", "lib", "i18n", "locales", "ar", "jobPosting.json",
);

const pageSource = readFileSync(pagePath, "utf8");
const enLocale = JSON.parse(readFileSync(enLocalePath, "utf8"));
const arLocale = JSON.parse(readFileSync(arLocalePath, "utf8"));

describe("Applicants table — Excel export wiring (task #173)", () => {
  it("exportToExcel header list includes City and Sex columns", () => {
    const fnMatch = pageSource.match(/function\s+exportToExcel\([\s\S]*?\n\}\n/);
    assert.ok(fnMatch, "exportToExcel function not found in job-posting-detail.tsx");
    const fnBody = fnMatch[0];
    assert.match(
      fnBody,
      /jobPosting:detail\.colCity/,
      "Export headers must include the City column (i18n key jobPosting:detail.colCity)",
    );
    assert.match(
      fnBody,
      /jobPosting:detail\.colSex/,
      "Export headers must include the Sex column (i18n key jobPosting:detail.colSex)",
    );
  });

  it("exportToExcel writes city and gender values into each row", () => {
    const fnMatch = pageSource.match(/function\s+exportToExcel\([\s\S]*?\n\}\n/);
    assert.ok(fnMatch);
    const fnBody = fnMatch[0];
    assert.match(
      fnBody,
      /\?\.city\b/,
      "Each exported row must read the candidate's city (look for `c?.city` or `candidate?.city`)",
    );
    assert.match(
      fnBody,
      /genderLabel\(/,
      "Each exported row must localise gender via genderLabel(...)",
    );
  });

  it("exportToExcel takes a t() translator (no hardcoded English headers)", () => {
    const sigMatch = pageSource.match(/function\s+exportToExcel\([\s\S]*?\)\s*{/);
    assert.ok(sigMatch, "exportToExcel signature not found");
    assert.match(
      sigMatch[0],
      /t:\s*TFunction/,
      "exportToExcel must accept a TFunction `t` so headers and the instruction row are localised",
    );
  });
});

describe("Applicants table — City/Sex i18n key parity (task #173)", () => {
  const requiredKeys = [
    "colCity",
    "colSex",
    "sexMale",
    "sexFemale",
    "sexOther",
    "sortBy",
    "sortAsc",
    "sortDesc",
    "exportColAppId",
    "exportColName",
    "exportColNationalId",
    "exportColEmail",
    "exportColPhone",
    "exportColCurrentStatus",
    "exportColNewStatus",
    "exportInstruction",
  ];

  for (const key of requiredKeys) {
    it(`detail.${key} exists in en/jobPosting.json`, () => {
      assert.ok(
        enLocale?.detail?.[key],
        `en/jobPosting.json is missing detail.${key}`,
      );
    });
    it(`detail.${key} exists in ar/jobPosting.json`, () => {
      assert.ok(
        arLocale?.detail?.[key],
        `ar/jobPosting.json is missing detail.${key}`,
      );
    });
  }
});

describe("Applicants table — sortable headers + sex badge wiring (task #173)", () => {
  it("renders sortable headers for candidate, city, sex, status, applied", () => {
    for (const key of ["candidate", "city", "sex", "status", "applied"]) {
      const re = new RegExp(`data-testid="header-sort-${key}"|testId="header-sort-${key}"|sortKey="${key}"`);
      assert.match(
        pageSource,
        re,
        `Missing sortable header wiring for "${key}" in job-posting-detail.tsx`,
      );
    }
  });

  it("sex cell renders a Badge with the female (pink) / male (blue) class contract", () => {
    assert.match(
      pageSource,
      /text-pink-400/,
      "Female sex badge must use text-pink-400",
    );
    assert.match(
      pageSource,
      /text-blue-400/,
      "Male sex badge must use text-blue-400",
    );
  });

  it("default sort state is applied desc", () => {
    assert.match(
      pageSource,
      /useState<SortKey>\("applied"\)/,
      "Default sortKey must be 'applied'",
    );
    assert.match(
      pageSource,
      /useState<SortDir>\("desc"\)/,
      "Default sortDir must be 'desc'",
    );
  });
});
