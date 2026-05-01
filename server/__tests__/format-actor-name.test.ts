/**
 * Unit tests for `formatActorName` — the bilingual display name helper used
 * by audit logging. Pinning the priority order so refactors can't silently
 * regress us back to "System" appearing in place of a real name.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatActorName } from "../lib/actor-name";

test("formatActorName: returns 'Unknown' for null/undefined", () => {
  assert.equal(formatActorName(null), "Unknown");
  assert.equal(formatActorName(undefined), "Unknown");
});

test("formatActorName: combines English + Arabic when both present", () => {
  assert.equal(
    formatActorName({
      fullName: "Faisal Alamri",
      fullNameAr: "فيصل العمري",
      username: "faisal.alamri",
    }),
    "Faisal Alamri فيصل العمري",
  );
});

test("formatActorName: returns just English when Arabic is missing", () => {
  assert.equal(
    formatActorName({
      fullName: "System Administrator",
      fullNameAr: null,
      username: "admin",
    }),
    "System Administrator",
  );
});

test("formatActorName: returns just Arabic when English is missing", () => {
  assert.equal(
    formatActorName({
      fullName: null,
      fullNameAr: "ياسر الزهراني",
      username: "1051862496",
    }),
    "ياسر الزهراني",
  );
});

test("formatActorName: falls back to username when both names absent", () => {
  assert.equal(
    formatActorName({
      fullName: null,
      fullNameAr: null,
      username: "admin",
    }),
    "admin",
  );
});

test("formatActorName: trims whitespace before deciding presence", () => {
  // A user record with empty-string names (DB NULLs that came back as "") must
  // not produce "  " or skip past username — they must be treated as absent.
  assert.equal(
    formatActorName({
      fullName: "  ",
      fullNameAr: "",
      username: "fallback_user",
    }),
    "fallback_user",
  );
});

test("formatActorName: returns 'Unknown' when nothing usable exists", () => {
  assert.equal(
    formatActorName({
      fullName: undefined,
      fullNameAr: undefined,
      username: "",
    }),
    "Unknown",
  );
});

test("formatActorName: preserves bidi-friendly LTR-then-RTL order so <bdi> can render correctly", () => {
  // The render side wraps the result in <bdi>, so the CALLER decides the
  // text order. We emit English-first because that's how the project goal
  // example reads ("Faisal Alamri فيصل العمري"). Lock that order in.
  const out = formatActorName({
    fullName: "Faisal Alamri",
    fullNameAr: "فيصل العمري",
    username: "faisal.alamri",
  });
  const enIdx = out.indexOf("Faisal");
  const arIdx = out.indexOf("فيصل");
  assert.ok(enIdx >= 0 && arIdx > enIdx, `Expected English to come first; got "${out}"`);
});
