// Task #173 wiring test — pins UI surface contracts on the applicants
// table that aren't naturally covered by the behavioural workbook test
// (`applicants-export.test.ts`):
//   - sortable header testids exist for every sort key
//   - the female / male badge colour pairing is intact
//   - default sort is "applied desc"
//   - i18n keys exist in both en/jobPosting.json and ar/jobPosting.json
//
// Source-level checks because the surrounding component module (job-
// posting-detail.tsx) imports React + Tailwind + a query client; pulling
// the whole module into `tsx --test` for one element-level assertion
// would cost more than the wiring catches it gives us.

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
      const re = new RegExp(`testId="header-sort-${key}"|sortKey="${key}"`);
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
