// Task #184 — direct unit tests for the `normalizeBlankFields` helper
// introduced in task #183. The helper is the write-boundary that
// turns "" / whitespace-only dropdown values into `null` for optional
// text columns on candidates, events, jobs, smp-companies, workforce,
// and applications. Without these tests, a future refactor to the
// helper or to its per-model field lists could silently re-open the
// original bug where `x ?? fallback` display sites treat `""` as a
// present value (e.g. the `job.region ?? job.location` regression
// that motivated tasks #182/#183).
//
// Pinned contracts:
//   1. "" and whitespace-only strings (spaces, tabs, newlines) → null.
//   2. Non-empty strings, non-string primitives, and `null` are left
//      untouched.
//   3. Only keys present in `fields` are inspected — keys outside the
//      list are passed through untouched even when blank.
//   4. Missing keys stay missing — the helper never invents them.
//   5. Required columns deliberately omitted from each per-model list
//      (event.name, job.title, candidate.fullNameEn, etc) are ignored
//      by the helper because they are not in the fields list, even
//      when the caller mistakenly hands them a blank value.
//   6. Non-object bodies (`null`, `undefined`, primitives) are returned
//      as-is so the helper can be piped over unparsed payloads.
//   7. Mutation contract: the helper mutates the input in-place and
//      returns the same reference (callers always spread `{...req.body}`
//      first; this test pins the in-place semantics so a future
//      "make it return a copy" refactor doesn't silently change call
//      sites).

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  normalizeBlankFields,
  EVENT_BLANK_FIELDS,
  JOB_BLANK_FIELDS,
  SMP_COMPANY_BLANK_FIELDS,
  WORKFORCE_BLANK_FIELDS,
  APPLICATION_BLANK_FIELDS,
  CANDIDATE_BLANK_FIELDS,
} from "../lib/normalize-blank-fields";

describe("normalizeBlankFields — helper unit tests (task #184)", () => {
  it("turns an empty string into null for a listed field", () => {
    const out = normalizeBlankFields({ region: "" }, ["region"]);
    assert.equal(out.region, null);
  });

  it("turns a whitespace-only string into null (spaces)", () => {
    const out = normalizeBlankFields({ region: "   " }, ["region"]);
    assert.equal(out.region, null);
  });

  it("turns a whitespace-only string into null (tabs / newlines)", () => {
    const out = normalizeBlankFields({ region: "\t\n  \r\n" }, ["region"]);
    assert.equal(out.region, null);
  });

  it("leaves a non-empty string untouched", () => {
    const out = normalizeBlankFields({ region: "Riyadh" }, ["region"]);
    assert.equal(out.region, "Riyadh");
  });

  it("preserves leading/trailing whitespace on non-blank strings (no trim side-effect)", () => {
    const out = normalizeBlankFields({ region: "  Riyadh  " }, ["region"]);
    assert.equal(out.region, "  Riyadh  ");
  });

  it("leaves non-string values untouched even when they are falsy", () => {
    const body: Record<string, unknown> = {
      a: null,
      b: 0,
      c: false,
      d: undefined,
      e: [],
      f: {},
    };
    const out = normalizeBlankFields(body, ["a", "b", "c", "d", "e", "f"]);
    assert.equal(out.a, null);
    assert.equal(out.b, 0);
    assert.equal(out.c, false);
    assert.equal(out.d, undefined);
    assert.deepEqual(out.e, []);
    assert.deepEqual(out.f, {});
  });

  it("ignores keys that are not in the fields list, even when blank", () => {
    // A required column accidentally posted as "" must not be silenced
    // to null — it should still be there so Zod can reject it. The
    // helper deliberately only touches the per-model lists.
    const out = normalizeBlankFields(
      { region: "", name: "" },
      ["region"],
    );
    assert.equal(out.region, null);
    assert.equal(out.name, "");
  });

  it("never invents keys — missing keys stay missing", () => {
    const body: Record<string, unknown> = { region: "" };
    normalizeBlankFields(body, ["region", "description", "endDate"]);
    assert.equal("description" in body, false);
    assert.equal("endDate" in body, false);
  });

  it("returns the same object reference (mutates in place)", () => {
    const body = { region: "" };
    const out = normalizeBlankFields(body, ["region"]);
    assert.equal(out, body, "helper must mutate in place and return the same reference");
  });

  it("is a no-op when fields list is empty", () => {
    const body = { region: "", description: "  " };
    const out = normalizeBlankFields(body, []);
    assert.equal(out.region, "");
    assert.equal(out.description, "  ");
  });

  it("returns null bodies unchanged", () => {
    assert.equal(normalizeBlankFields(null, ["region"]), null);
  });

  it("returns undefined bodies unchanged", () => {
    assert.equal(normalizeBlankFields(undefined, ["region"]), undefined);
  });

  it("returns primitive bodies unchanged", () => {
    assert.equal(normalizeBlankFields("hello", ["region"]), "hello");
    assert.equal(normalizeBlankFields(42, ["region"]), 42);
    assert.equal(normalizeBlankFields(true, ["region"]), true);
  });

  // ─── Per-model field-list smoke tests ───────────────────────────────
  // These guard against a future refactor that shrinks one of the
  // per-model constants or re-orders entries: every column listed in
  // each constant must still be normalised to null when the form
  // posts an empty string for it.
  const PER_MODEL: Array<{ name: string; fields: readonly string[] }> = [
    { name: "EVENT_BLANK_FIELDS", fields: EVENT_BLANK_FIELDS },
    { name: "JOB_BLANK_FIELDS", fields: JOB_BLANK_FIELDS },
    { name: "SMP_COMPANY_BLANK_FIELDS", fields: SMP_COMPANY_BLANK_FIELDS },
    { name: "WORKFORCE_BLANK_FIELDS", fields: WORKFORCE_BLANK_FIELDS },
    { name: "APPLICATION_BLANK_FIELDS", fields: APPLICATION_BLANK_FIELDS },
    { name: "CANDIDATE_BLANK_FIELDS", fields: CANDIDATE_BLANK_FIELDS },
  ];

  for (const { name, fields } of PER_MODEL) {
    it(`${name}: every listed column is normalised when posted blank`, () => {
      const body: Record<string, unknown> = {};
      for (const f of fields) body[f] = "";
      const out = normalizeBlankFields(body, fields) as Record<string, unknown>;
      for (const f of fields) {
        assert.equal(
          out[f],
          null,
          `${name} expected ${f} to be normalised to null`,
        );
      }
    });

    it(`${name}: whitespace-only values for every listed column are normalised`, () => {
      const body: Record<string, unknown> = {};
      for (const f of fields) body[f] = "   \t\n";
      const out = normalizeBlankFields(body, fields) as Record<string, unknown>;
      for (const f of fields) {
        assert.equal(out[f], null, `${name} expected ${f} to be normalised to null`);
      }
    });

    it(`${name}: non-blank values for every listed column are preserved`, () => {
      const body: Record<string, unknown> = {};
      for (const f of fields) body[f] = `value-for-${f}`;
      const out = normalizeBlankFields(body, fields) as Record<string, unknown>;
      for (const f of fields) {
        assert.equal(out[f], `value-for-${f}`);
      }
    });
  }
});
