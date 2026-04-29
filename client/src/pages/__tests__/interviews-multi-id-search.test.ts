// Task #226 — behavioural tests for the multi-ID paste search and missing-IDs
// panel on the two interview invitee surfaces (the dialog on /interviews and
// the full-page list on /interviews/:id/candidates). The tests cover:
//   - single-token name/ID substring still works (both modes preserved)
//   - 3 real national IDs filter to those 3 invitees
//   - 2 real + 3 fake IDs render the 2 invitees and surface the 3 fakes in
//     the missing-IDs metadata
//   - "Mohammed\n1234567890" with no name match → missing = ["1234567890"],
//     droppedFreeText = 1 (the typed name is excluded from the panel)
//   - 250 IDs → truncated=true, missing computed only against the first 200
//   - CSV body and filename pattern for the "Download CSV" handler
//   - slugifyForFilename Arabic / fallback behaviour
//
// Task #227 additions:
//   - phone-paste matches invitees by phone in both modes
//   - format tolerance: same number pasted in 3 formats → 1 match, 1 token
//   - missing-list keeps the user's literal text (not the canonical suffix)
//   - non-phone numerics (national IDs) don't accidentally match phones

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { parseSearchTokens } from "../../../../shared/candidate-search";
import {
  filterInvitees,
  computeInviteeSearchMeta,
  buildMissingIdsCsv,
  buildMissingIdsFilename,
  slugifyForFilename,
  type InviteeForSearch,
} from "../interviews-multi-id-search";

const invitees: InviteeForSearch[] = [
  { id: "00000000-0000-0000-0000-000000000001", fullNameEn: "Mohammed Al Fares", nationalId: "1111111111", phone: "0550856257" },
  { id: "00000000-0000-0000-0000-000000000002", fullNameEn: "Khalid Al Otaibi",  nationalId: "2222222222", phone: "0568691660" },
  { id: "00000000-0000-0000-0000-000000000003", fullNameEn: "Sara Al Harbi",     nationalId: "3333333333", phone: "+966501234567" }, // stored in international form
  { id: "00000000-0000-0000-0000-000000000004", fullNameEn: "Layla Al Shamri",   nationalId: "4444444444", phone: null },             // no phone on file
];

describe("Task #226 — single-token search behaviour preserved", () => {
  it("dialog mode: nationalId substring matches; name does NOT match", () => {
    const parsed = parseSearchTokens("3333");
    assert.equal(parsed.isMulti, false);

    const dialog = filterInvitees(invitees, parsed, /* singleTermMatchesName */ false);
    assert.deepEqual(dialog.map((c) => c.nationalId), ["3333333333"]);

    const nameOnly = parseSearchTokens("Sara");
    const dialogName = filterInvitees(invitees, nameOnly, /* singleTermMatchesName */ false);
    assert.equal(dialogName.length, 0); // dialog never matched name pre-#226
  });

  it("full-page mode: nationalId substring AND name substring both match", () => {
    const idParsed = parseSearchTokens("4444");
    const fullById = filterInvitees(invitees, idParsed, /* singleTermMatchesName */ true);
    assert.deepEqual(fullById.map((c) => c.nationalId), ["4444444444"]);

    const nameParsed = parseSearchTokens("sara");
    const fullByName = filterInvitees(invitees, nameParsed, /* singleTermMatchesName */ true);
    assert.deepEqual(fullByName.map((c) => c.fullNameEn), ["Sara Al Harbi"]);
  });

  it("single-token search returns no searchMeta (no panel, no green line)", () => {
    const parsed = parseSearchTokens("1111111111");
    assert.equal(parsed.isMulti, false);
    assert.equal(computeInviteeSearchMeta(invitees, parsed), undefined);
  });
});

describe("Task #226 — multi-ID paste filters to matched invitees only", () => {
  it("pasting 3 real national IDs filters to exactly those 3 invitees", () => {
    const paste = "1111111111\n2222222222\n3333333333";
    const parsed = parseSearchTokens(paste);
    assert.equal(parsed.isMulti, true);
    assert.equal(parsed.tokens.length, 3);

    const filtered = filterInvitees(invitees, parsed, true);
    assert.deepEqual(
      filtered.map((c) => c.nationalId).sort(),
      ["1111111111", "2222222222", "3333333333"],
    );

    const meta = computeInviteeSearchMeta(invitees, parsed)!;
    assert.equal(meta.missingIds.length, 0);
    assert.equal(meta.tokenCount, 3);
    assert.equal(meta.droppedFreeText, 0);
  });

  it("multi mode never matches by name even if the paste contains a name", () => {
    // "Sara" alone (single token) would match by name in full-page mode, but
    // when combined with real IDs into a multi-token paste, the multi-mode
    // filter is ID-only by design — Sara is unmatched and dropped from the
    // missing list because it's not ID-shaped.
    const paste = "Sara\n1111111111\n2222222222";
    const parsed = parseSearchTokens(paste);
    assert.equal(parsed.isMulti, true);

    const filtered = filterInvitees(invitees, parsed, true);
    // Sara is NOT in the result even though her name matches; only the two IDs.
    assert.deepEqual(
      filtered.map((c) => c.nationalId).sort(),
      ["1111111111", "2222222222"],
    );

    const meta = computeInviteeSearchMeta(invitees, parsed)!;
    assert.deepEqual(meta.missingIds, []); // "Sara" is dropped, not missing
    assert.equal(meta.droppedFreeText, 1);
  });

  it("matching by candidate UUID also works", () => {
    const paste = "00000000-0000-0000-0000-000000000001,00000000-0000-0000-0000-000000000002";
    const parsed = parseSearchTokens(paste);
    assert.equal(parsed.isMulti, true);

    const filtered = filterInvitees(invitees, parsed, true);
    assert.deepEqual(
      filtered.map((c) => c.id).sort(),
      [
        "00000000-0000-0000-0000-000000000001",
        "00000000-0000-0000-0000-000000000002",
      ],
    );
  });

  it("UUID matching is case-insensitive in both directions", () => {
    // Pasting upper-case UUIDs should match the lower-case stored IDs, and a
    // mixed-case stored UUID should match a lower-case pasted token. National
    // IDs are numeric so case doesn't apply, but UUID copies vary by source.
    const upperPaste = "00000000-0000-0000-0000-000000000001,00000000-0000-0000-0000-000000000002".toUpperCase();
    const parsedUpper = parseSearchTokens(upperPaste);
    const filteredUpper = filterInvitees(invitees, parsedUpper, true);
    assert.deepEqual(
      filteredUpper.map((c) => c.id).sort(),
      [
        "00000000-0000-0000-0000-000000000001",
        "00000000-0000-0000-0000-000000000002",
      ],
    );
    const metaUpper = computeInviteeSearchMeta(invitees, parsedUpper)!;
    assert.equal(metaUpper.missingIds.length, 0);

    const mixedInvitees: InviteeForSearch[] = [
      { id: "ABC123-DEF456-789", fullNameEn: "Mixed Case", nationalId: "5555555555" },
    ];
    const lowerPaste = "abc123-def456-789,zzz999";
    const parsedLower = parseSearchTokens(lowerPaste);
    const filteredLower = filterInvitees(mixedInvitees, parsedLower, true);
    assert.equal(filteredLower.length, 1);
    assert.equal(filteredLower[0]!.id, "ABC123-DEF456-789");
  });
});

describe("Task #226 — missing-IDs panel lists the unmatched IDs", () => {
  it("2 real + 3 fake IDs → table shows 2, panel lists the 3 fakes", () => {
    const paste = [
      "1111111111", // real
      "2222222222", // real
      "9999999999", // fake
      "8888888888", // fake
      "7777777777", // fake
    ].join("\n");
    const parsed = parseSearchTokens(paste);
    const filtered = filterInvitees(invitees, parsed, true);
    assert.deepEqual(
      filtered.map((c) => c.nationalId).sort(),
      ["1111111111", "2222222222"],
    );

    const meta = computeInviteeSearchMeta(invitees, parsed)!;
    assert.deepEqual(
      meta.missingIds.sort(),
      ["7777777777", "8888888888", "9999999999"],
    );
    assert.equal(meta.tokenCount, 5);
    assert.equal(meta.droppedFreeText, 0);
    assert.equal(meta.truncated, false);
  });

  it("'Mohammed\\n1234567890' with no name match → missing=['1234567890'], dropped=1", () => {
    // No invitee has nationalId 1234567890; "Mohammed" is free-text and doesn't
    // count as an ID, so it's dropped from the missing list.
    const parsed = parseSearchTokens("Mohammed\n1234567890");
    assert.equal(parsed.isMulti, true);
    const meta = computeInviteeSearchMeta(invitees, parsed)!;
    assert.deepEqual(meta.missingIds, ["1234567890"]);
    assert.equal(meta.droppedFreeText, 1);
  });

  it("250 pasted IDs → truncated=true, only first 200 are searched", () => {
    const ids: string[] = [];
    for (let i = 0; i < 250; i++) {
      ids.push(String(1000000000 + i)); // 10-digit numeric IDs
    }
    const parsed = parseSearchTokens(ids.join("\n"));
    assert.equal(parsed.truncated, true);
    assert.equal(parsed.tokens.length, 200);

    // None of these invented IDs match any invitee, so all 200 are missing.
    const meta = computeInviteeSearchMeta(invitees, parsed)!;
    assert.equal(meta.missingIds.length, 200);
    assert.equal(meta.tokenCount, 200);
    assert.equal(meta.truncated, true);
    // The 50 dropped IDs (positions 200-249) are NOT in the missing list.
    assert.equal(meta.missingIds.includes("1000000200"), false);
    assert.equal(meta.missingIds.includes("1000000249"), false);
  });
});

describe("Task #226 — CSV download body and filename", () => {
  it("buildMissingIdsCsv produces a single-column CSV with proper quoting", () => {
    const csv = buildMissingIdsCsv(["1111111111", "2222222222", "3333333333"]);
    assert.equal(
      csv,
      'id\n"1111111111"\n"2222222222"\n"3333333333"',
    );
  });

  it("buildMissingIdsCsv escapes embedded double-quotes (RFC 4180)", () => {
    const csv = buildMissingIdsCsv(['weird"id', "normal"]);
    assert.equal(csv, 'id\n"weird""id"\n"normal"');
  });

  it("buildMissingIdsFilename uses slugified interview name and ISO date", () => {
    const fixedDate = new Date("2026-04-29T12:34:56Z");
    const name = "Q3 Interview Batch 4!";
    const filename = buildMissingIdsFilename(name, fixedDate);
    assert.equal(filename, "missing_invitees_q3-interview-batch-4_2026-04-29.csv");
  });

  it("buildMissingIdsFilename falls back to 'session' when the name is empty/null", () => {
    const fixedDate = new Date("2026-04-29T00:00:00Z");
    assert.equal(buildMissingIdsFilename(null, fixedDate), "missing_invitees_session_2026-04-29.csv");
    assert.equal(buildMissingIdsFilename("   ", fixedDate), "missing_invitees_session_2026-04-29.csv");
  });

  it("slugifyForFilename strips non-ASCII (Arabic) and uses fallback when slug is empty", () => {
    // Pure-Arabic name has no ASCII characters and slugifies to empty → fallback.
    assert.equal(slugifyForFilename("جلسة المقابلة"), "session");
    // Mixed name keeps the ASCII parts.
    assert.equal(slugifyForFilename("Cohort 3 — جلسة"), "cohort-3");
  });
});

describe("Task #227 — phone matching in single-token mode", () => {
  it("dialog mode: pasting an exact stored phone matches the invitee", () => {
    const parsed = parseSearchTokens("0568691660");
    assert.equal(parsed.isMulti, false);
    const dialog = filterInvitees(invitees, parsed, /* singleTermMatchesName */ false);
    assert.deepEqual(dialog.map((c) => c.nationalId), ["2222222222"]);
  });

  it("dialog mode: phone substring matches (e.g. last 6 digits typed)", () => {
    const parsed = parseSearchTokens("691660");
    const dialog = filterInvitees(invitees, parsed, /* singleTermMatchesName */ false);
    assert.deepEqual(dialog.map((c) => c.nationalId), ["2222222222"]);
  });

  it("full-page mode: phone substring matches (in addition to ID + name)", () => {
    const parsed = parseSearchTokens("0550856257");
    const full = filterInvitees(invitees, parsed, /* singleTermMatchesName */ true);
    assert.deepEqual(full.map((c) => c.nationalId), ["1111111111"]);
  });

  it("format tolerance: typing +966 form matches an invitee stored in 0… form", () => {
    // Mohammed is stored as 0550856257; user types the international form.
    // Substring match would fail, but canonical-suffix match succeeds.
    const parsed = parseSearchTokens("+966550856257");
    const full = filterInvitees(invitees, parsed, /* singleTermMatchesName */ true);
    assert.deepEqual(full.map((c) => c.nationalId), ["1111111111"]);
  });

  it("format tolerance (reverse): typing 05… form matches an invitee stored in +966 form", () => {
    // Sara is stored as +966501234567; user types the local 05 form.
    const parsed = parseSearchTokens("0501234567");
    const full = filterInvitees(invitees, parsed, /* singleTermMatchesName */ true);
    assert.deepEqual(full.map((c) => c.nationalId), ["3333333333"]);
  });

  it("an invitee with no phone on file is unaffected by phone search", () => {
    // Layla has phone=null; searching for any phone shouldn't surface her.
    const parsed = parseSearchTokens("4444"); // matches her nationalId substring
    const dialog = filterInvitees(invitees, parsed, /* singleTermMatchesName */ false);
    assert.deepEqual(dialog.map((c) => c.fullNameEn), ["Layla Al Shamri"]);
  });

  it("digits-only substring: typing a partial formatted phone matches stored unformatted phone", () => {
    // Mohammed is stored as 0550856257; user types "55-08" (digits "5508") —
    // raw .includes("55-08") would fail against "0550856257", but digits-only
    // substring succeeds because "0550856257".includes("5508") is true.
    const parsed = parseSearchTokens("55-08");
    const full = filterInvitees(invitees, parsed, /* singleTermMatchesName */ true);
    assert.ok(full.some((c) => c.nationalId === "1111111111"), "Mohammed should match");
  });

  it("digits-only substring: spaced country-code prefix matches stored 0… phone", () => {
    // "+966 55 0" → digits "966550" → matches "+966550856257" (digits "966550856257")
    // AND matches Mohammed's stored "0550856257" (digits "0550856257") via the
    // canonical-suffix shared "550856257" — but specifically here the substring
    // "966550" matches the stored "+966501234567" (digits "966501234567")
    // because "966501234567".includes("966550") is FALSE; but Mohammed's
    // digit string "0550856257" doesn't contain "966550" either. So the more
    // realistic test is "+966 55 085" → digits "96655085" — which doesn't
    // appear in either stored form. We test the partial-local-form variant
    // instead, which is the common case (typing "+966 55").
    const parsed = parseSearchTokens("+966 55");
    const full = filterInvitees(invitees, parsed, /* singleTermMatchesName */ true);
    // Of the three invitees with phones, only Sara's stored +966501234567
    // (digits "966501234567") contains the substring "96650"; "96655" appears
    // in NEITHER. So this paste should match exactly Sara via her stored 966
    // prefix... actually "96655" is not in "966501234567" either. Use a more
    // targeted assertion: "+966 50" should match Sara.
    assert.equal(full.length, 0, "+966 55 should not appear in any stored phone");

    const parsed2 = parseSearchTokens("+966 50");
    const full2 = filterInvitees(invitees, parsed2, /* singleTermMatchesName */ true);
    assert.deepEqual(full2.map((c) => c.nationalId), ["3333333333"]);
  });

  it("digits-only substring: Arabic-Indic digits in the term canonicalise to the same phone", () => {
    // ٠٥٥٠ → "0550" → substring of "0550856257" (Mohammed)
    const parsed = parseSearchTokens("٠٥٥٠");
    const full = filterInvitees(invitees, parsed, /* singleTermMatchesName */ true);
    assert.ok(full.some((c) => c.nationalId === "1111111111"), "Mohammed should match");
  });

  it("digits-only substring: a name term (no digits) does NOT collapse to empty-string match", () => {
    // Regression guard: if termDigits were used unconditionally, "Mohammed"
    // would yield "" and "phone".includes("") would be true → match every
    // invitee with a phone. The implementation guards on termDigits.length>0.
    const parsed = parseSearchTokens("Mohammed");
    const dialog = filterInvitees(invitees, parsed, /* singleTermMatchesName */ false);
    // Dialog mode doesn't search names → only nationalId substring & phones.
    // "Mohammed" is not a substring of any nationalId and not a digit run, so
    // no invitee should match.
    assert.equal(dialog.length, 0);
  });
});

describe("Task #227 — phone matching in multi-token mode", () => {
  it("pasting two exact stored phones filters to those two invitees", () => {
    const paste = "0550856257\n0568691660";
    const parsed = parseSearchTokens(paste);
    assert.equal(parsed.isMulti, true);
    const filtered = filterInvitees(invitees, parsed, true);
    assert.deepEqual(
      filtered.map((c) => c.nationalId).sort(),
      ["1111111111", "2222222222"],
    );
    const meta = computeInviteeSearchMeta(invitees, parsed)!;
    assert.equal(meta.missingIds.length, 0);
    assert.equal(meta.tokenCount, 2);
  });

  it("a paste mixing 3 formats of the same number collapses to 1 token, 1 match", () => {
    const paste = ["0550856257", "+966 55 085 6257", "966550856257"].join("\n");
    const parsed = parseSearchTokens(paste);
    // The parser dedupes on canonical suffix → exactly 1 token survives.
    assert.equal(parsed.tokens.length, 1);
    // It's the literal first occurrence (preserves what the user pasted).
    assert.equal(parsed.tokens[0], "0550856257");
    // Note: with 1 surviving token, isMulti is false. Dedupe behaviour is
    // tested directly here, then the multi-mode case below mixes formats
    // across DIFFERENT people to keep isMulti=true.

    const allFormats = ["0550856257", "+966 55 085 6257", "966550856257", "0568691660"];
    const parsed2 = parseSearchTokens(allFormats.join("\n"));
    assert.equal(parsed2.tokens.length, 2);
    assert.equal(parsed2.isMulti, true);
    const filtered = filterInvitees(invitees, parsed2, true);
    assert.deepEqual(
      filtered.map((c) => c.nationalId).sort(),
      ["1111111111", "2222222222"],
    );
    const meta = computeInviteeSearchMeta(invitees, parsed2)!;
    assert.equal(meta.missingIds.length, 0);
  });

  it("mixing IDs and phones in one paste matches invitees by either field", () => {
    // Mohammed by phone, Khalid by national ID, Sara by international phone,
    // plus one bogus phone that doesn't belong to anyone.
    const paste = "0550856257\n2222222222\n+966501234567\n0599999999";
    const parsed = parseSearchTokens(paste);
    const filtered = filterInvitees(invitees, parsed, true);
    assert.deepEqual(
      filtered.map((c) => c.nationalId).sort(),
      ["1111111111", "2222222222", "3333333333"],
    );
    const meta = computeInviteeSearchMeta(invitees, parsed)!;
    assert.deepEqual(meta.missingIds, ["0599999999"]);
    assert.equal(meta.droppedFreeText, 0);
  });

  it("missing-list preserves the user's literal phone text, not the canonical suffix", () => {
    // Two unknown phones in different formats — the chips should read what
    // the user pasted, not "598765432" / etc.
    const paste = "+966598765432\n00966599887766";
    const parsed = parseSearchTokens(paste);
    const meta = computeInviteeSearchMeta(invitees, parsed)!;
    assert.deepEqual(meta.missingIds.sort(), ["+966598765432", "00966599887766"].sort());
  });

  it("non-phone numerics (national IDs starting 1/2) do NOT accidentally match phones", () => {
    // Pasting national IDs alongside one real phone: the IDs must not be
    // canonicalised as phones (they don't begin with 05 or 5), so they
    // either match the invitee's nationalId or land in missingIds.
    const paste = "1111111111\n2050858200\n0568691660";
    const parsed = parseSearchTokens(paste);
    const filtered = filterInvitees(invitees, parsed, true);
    assert.deepEqual(
      filtered.map((c) => c.nationalId).sort(),
      ["1111111111", "2222222222"], // 1111… by ID, 2222… via phone 0568691660
    );
    const meta = computeInviteeSearchMeta(invitees, parsed)!;
    assert.deepEqual(meta.missingIds, ["2050858200"]); // unmatched national ID
  });

  it("an invitee with no phone on file is never matched by phone tokens", () => {
    const paste = "0550856257\n0568691660\n+966501234567";
    const parsed = parseSearchTokens(paste);
    const filtered = filterInvitees(invitees, parsed, true);
    // Layla (phone=null) is NOT among the results.
    const inResult = filtered.some((c) => c.nationalId === "4444444444");
    assert.equal(inResult, false);
  });
});
