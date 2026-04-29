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
  { id: "00000000-0000-0000-0000-000000000001", fullNameEn: "Mohammed Al Fares", nationalId: "1111111111" },
  { id: "00000000-0000-0000-0000-000000000002", fullNameEn: "Khalid Al Otaibi",  nationalId: "2222222222" },
  { id: "00000000-0000-0000-0000-000000000003", fullNameEn: "Sara Al Harbi",     nationalId: "3333333333" },
  { id: "00000000-0000-0000-0000-000000000004", fullNameEn: "Layla Al Shamri",   nationalId: "4444444444" },
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
