// Task #173 behavioural test for the applicants table's filter+sort
// composition on /job-posting/:id. Pins:
//   - search narrows to the matching candidates (name / nationalId / phone / email)
//   - status filter ANDs with search
//   - sort runs AFTER filter (so the visible row order is deterministic)
//   - default sort is "applied desc" (newest first)
//   - blanks always sink to the bottom regardless of direction
//   - clicking the same sort key flips direction; clicking a new key resets
//     the comparator (we test the pure filter+sort here; the click handler
//     itself is small UI glue and is covered by the e2e suite)

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  filterApplicants,
  sortApplicants,
  filterAndSortApplicants,
  type ApplicantApplication,
  type ApplicantCandidate,
} from "../job-posting-detail-filter-sort";

const candidates: ApplicantCandidate[] = [
  { id: "c1", fullNameEn: "Salem Al-Qahtani", phone: "0500000001", email: "salem@x.com", nationalId: "1111111111", city: "Riyadh", gender: "male" },
  { id: "c2", fullNameEn: "Mona Al-Otaibi",   phone: "0500000002", email: "mona@x.com",  nationalId: "2222222222", city: "Jeddah", gender: "female" },
  { id: "c3", fullNameEn: "Adam Faisal",      phone: "0500000003", email: "adam@x.com",  nationalId: "3333333333", city: undefined, gender: "other" },
  { id: "c4", fullNameEn: "Bayan Khaled",     phone: "0500000004", email: "bayan@x.com", nationalId: "4444444444", city: "Dammam", gender: null },
];

const candidateMap = Object.fromEntries(candidates.map((c) => [c.id, c]));

const applications: ApplicantApplication[] = [
  { id: "a1", candidateId: "c1", status: "new",         appliedAt: "2026-04-20T10:00:00Z" },
  { id: "a2", candidateId: "c2", status: "shortlisted", appliedAt: "2026-04-22T10:00:00Z" },
  { id: "a3", candidateId: "c3", status: "interviewed", appliedAt: "2026-04-21T10:00:00Z" },
  { id: "a4", candidateId: "c4", status: "rejected",    appliedAt: "2026-04-23T10:00:00Z" },
];

const collator = new Intl.Collator("en", { sensitivity: "base" });

describe("Applicants filter — search and status (task #173)", () => {
  it("returns every applicant when search is empty and status is all", () => {
    const out = filterApplicants(applications, candidateMap, "", "all");
    assert.equal(out.length, 4);
  });

  it("matches on candidate full name (case insensitive)", () => {
    const out = filterApplicants(applications, candidateMap, "MONA", "all");
    assert.deepEqual(out.map((a) => a.id), ["a2"]);
  });

  it("matches on phone substring", () => {
    const out = filterApplicants(applications, candidateMap, "0000003", "all");
    assert.deepEqual(out.map((a) => a.id), ["a3"]);
  });

  it("matches on national ID substring", () => {
    const out = filterApplicants(applications, candidateMap, "4444", "all");
    assert.deepEqual(out.map((a) => a.id), ["a4"]);
  });

  it("matches on email substring (case insensitive)", () => {
    const out = filterApplicants(applications, candidateMap, "SALEM@", "all");
    assert.deepEqual(out.map((a) => a.id), ["a1"]);
  });

  it("ANDs search with status — search hit but wrong status returns nothing", () => {
    const out = filterApplicants(applications, candidateMap, "Mona", "rejected");
    assert.deepEqual(out, []);
  });

  it("ANDs search with status — search hit and matching status returns the row", () => {
    const out = filterApplicants(applications, candidateMap, "Mona", "shortlisted");
    assert.deepEqual(out.map((a) => a.id), ["a2"]);
  });
});

describe("Applicants sort — column comparators (task #173)", () => {
  it("default sort applied desc puts the newest application first", () => {
    const out = sortApplicants(applications, candidateMap, "applied", "desc", collator);
    assert.deepEqual(out.map((a) => a.id), ["a4", "a2", "a3", "a1"]);
  });

  it("applied asc reverses to oldest first", () => {
    const out = sortApplicants(applications, candidateMap, "applied", "asc", collator);
    assert.deepEqual(out.map((a) => a.id), ["a1", "a3", "a2", "a4"]);
  });

  it("candidate asc orders by full name with the active collator", () => {
    const out = sortApplicants(applications, candidateMap, "candidate", "asc", collator);
    // Adam, Bayan, Mona, Salem
    assert.deepEqual(out.map((a) => a.id), ["a3", "a4", "a2", "a1"]);
  });

  it("status asc follows the recruiting pipeline order, not alphabetical", () => {
    const out = sortApplicants(applications, candidateMap, "status", "asc", collator);
    // new(0) < shortlisted(2) < interviewed(3) < rejected(6)
    assert.deepEqual(out.map((a) => a.id), ["a1", "a2", "a3", "a4"]);
  });

  it("sex asc puts female before male, then other, then null/missing at the bottom", () => {
    const out = sortApplicants(applications, candidateMap, "sex", "asc", collator);
    // female(c2/a2), male(c1/a1), other(c3/a3), null(c4/a4)
    assert.deepEqual(out.map((a) => a.id), ["a2", "a1", "a3", "a4"]);
  });

  it("city asc places the missing city at the bottom regardless of direction", () => {
    const ascOut = sortApplicants(applications, candidateMap, "city", "asc", collator);
    assert.equal(ascOut[ascOut.length - 1].id, "a3", "asc must end with the blank-city row");
    const descOut = sortApplicants(applications, candidateMap, "city", "desc", collator);
    assert.equal(descOut[descOut.length - 1].id, "a3", "desc must ALSO end with the blank-city row (blanks-to-bottom contract)");
  });
});

describe("Applicants filter+sort composition (task #173)", () => {
  it("filter narrows the row set, sort then orders only the survivors", () => {
    // Search "otaibi" → matches only Mona Al-Otaibi (a2). Sorting still
    // runs on the survivor list, so the result is exactly [a2].
    const narrowed = filterAndSortApplicants(
      applications, candidateMap,
      "otaibi", "all",
      "candidate", "asc", collator,
    );
    assert.deepEqual(
      narrowed.map((a) => a.id),
      ["a2"],
      "search must narrow the row set BEFORE sort runs",
    );

    // Search "al" → matches Salem Al-Qahtani, Mona Al-Otaibi, Adam Faisal,
    // Bayan Khaled (every name contains the substring "al"). Sorted by
    // candidate ascending: Adam, Bayan, Mona, Salem.
    const wide = filterAndSortApplicants(
      applications, candidateMap,
      "al", "all",
      "candidate", "asc", collator,
    );
    assert.deepEqual(
      wide.map((a) => a.id),
      ["a3", "a4", "a2", "a1"],
      "sort must order only the rows that survived the filter",
    );
  });

  it("status filter + sex sort returns only matching rows in sex order", () => {
    // Status "interviewed" → only a3 (Adam, gender other).
    const out = filterAndSortApplicants(
      applications, candidateMap,
      "", "interviewed",
      "sex", "asc", collator,
    );
    assert.deepEqual(out.map((a) => a.id), ["a3"]);
  });

  it("empty search + 'all' status + applied desc matches the table's default view", () => {
    const out = filterAndSortApplicants(
      applications, candidateMap,
      "", "all",
      "applied", "desc", collator,
    );
    // Same as the default sort test — newest first.
    assert.deepEqual(out.map((a) => a.id), ["a4", "a2", "a3", "a1"]);
  });
});
