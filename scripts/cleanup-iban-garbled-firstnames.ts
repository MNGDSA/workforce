// scripts/cleanup-iban-garbled-firstnames.ts ─ Task #139 cleanup.
//
// Background:
//   The Task #137 IBAN holder-name backfill (scripts/backfill-iban-holder-
//   names.ts) successfully transliterated 819 of 827 affected candidates
//   from Arabic to Latin. 8 candidates were rejected by the IBAN holder-
//   name validator because their `iban_account_first_name` field
//   contains garbled symbols / styled-Unicode / emoji that aren't Arabic
//   and so can't be transliterated:
//
//     2280ab6c…  "Ã7 ☤."          | last "اهلي"        → Ahli
//     3517451f…  ":/"              | last "خواجي"       → Khawaji
//     570ec357…  "1"               | last "فلاته"       → Falata
//     6e308faf…  "𝙼𝚄𝙰𝙰𝚃𝙷♐︎↯."  | last "معاذ خبراني" → Moaz Khobrani
//     6f53ec29…  "W&w✨❤️"          | last "الجيزاني"    → Al-Jizani
//     7c15ebb5…  "FHD⚛︎'"          | last "المجنوني"    → Al-Majnuni
//     f4f9e2f5…  "🕸️"              | last "الحسيني"     → Al-Husseini
//     fc3fd487…  "."               | last "العتيبي"     → Al-Otaibi
//
//   Their LAST names are proper Arabic and the dry-run produced safe
//   Latin spellings. Their FIRST names cannot be derived programmatically
//   — the operator (or candidate) must enter them manually.
//
//   Until then, these 8 accounts cannot pass the IBAN holder-name
//   validator and so cannot receive payroll. They need to be flagged.
//
// Strategy (per row, INSIDE A SINGLE TRANSACTION):
//   1. Re-validate the row's *current* state. If `iban_account_first_name`
//      now passes `validateIbanHolderName` (i.e. an operator already
//      cleaned this row by hand), SKIP and log "already_cleaned".
//   2. Otherwise:
//        a. NULL `iban_account_first_name`. Storing a known-bad value
//           is worse than storing nothing — the gate (and the talent
//           list "needs IBAN" filter) treats NULL as "missing", which
//           is what we want the operator to see.
//        b. Write the safe Latin `iban_account_last_name` from the
//           dry-run output (only if the current value is still Arabic;
//           if it's already been overwritten with something Latin, we
//           don't clobber the operator's edit).
//        c. Set `profile_completed = false` so ProfileSetupGate re-runs
//           on the candidate's next login and re-prompts both names.
//        d. Append a structured note to `notes` so support staff seeing
//           the candidate in admin understand why the field is blank.
//   3. CSV report to `.local/iban-firstname-cleanup-report.csv` listing
//      every row touched (or skipped) with before/after values.
//
// Usage:
//   tsx scripts/cleanup-iban-garbled-firstnames.ts            # dry-run
//   tsx scripts/cleanup-iban-garbled-firstnames.ts --apply    # commit
//
// Env: PROD_DATABASE_URL or DATABASE_URL must point at the prod DB.

import { Client } from "pg";
import fs from "node:fs";
import path from "node:path";
import { validateIbanHolderName } from "../server/lib/iban";

// Hardcoded from .local/iban-name-backfill-report.csv (rejected_by_validator
// rows). The Latin last names below are the dry-run output of the
// transliterator and have been validator-checked off-line.
const TARGETS: ReadonlyArray<{
  id: string;
  expectedFirstBefore: string;
  expectedLastBefore: string;
  safeLastAfter: string;
}> = [
  { id: "2280ab6c-4501-42ac-bff7-4d4935ce3884", expectedFirstBefore: "Ã7 ☤.",          expectedLastBefore: "اهلي",         safeLastAfter: "Ahli" },
  { id: "3517451f-64f7-495a-ae96-cdaebfca2edc", expectedFirstBefore: ":/",              expectedLastBefore: "خواجي",        safeLastAfter: "Khawaji" },
  { id: "570ec357-8289-4a7c-8828-1d332988f127", expectedFirstBefore: "1",               expectedLastBefore: "فلاته",         safeLastAfter: "Falata" },
  // Task body lists the operator-approved safe last name as "Khobrani"
  // (single word) for this candidate, even though the dry-run output
  // included the first name "Moaz" too. Honour the task's mapping.
  { id: "6e308faf-f364-4d0a-9d21-865b07790a2c", expectedFirstBefore: "𝙼𝚄𝙰𝙰𝚃𝙷♐︎↯.",   expectedLastBefore: "معاذ خبراني",  safeLastAfter: "Khobrani" },
  { id: "6f53ec29-de33-41bc-a437-2e974b89a38b", expectedFirstBefore: "W&w✨❤️",          expectedLastBefore: "الجيزاني",      safeLastAfter: "Al-Jizani" },
  { id: "7c15ebb5-d2ee-415c-8f5f-a069baac381c", expectedFirstBefore: "FHD⚛︎\u2019",    expectedLastBefore: "المجنوني",      safeLastAfter: "Al-Majnuni" },
  { id: "f4f9e2f5-22cb-450d-8fe9-b56ee21aa31f", expectedFirstBefore: "🕸️",              expectedLastBefore: "الحسيني",       safeLastAfter: "Al-Husseini" },
  { id: "fc3fd487-3ac0-47ef-965e-28a5cdfc67a9", expectedFirstBefore: ".",               expectedLastBefore: "العتيبي",       safeLastAfter: "Al-Otaibi" },
];

const NOTE_TAG = "[task-139:iban-garbled-firstname]";
const NOTE_BODY =
  `${NOTE_TAG} First-name field contained garbled symbols / styled-Unicode ` +
  `/ emoji that the Arabic→Latin backfill could not transliterate. The bad ` +
  `value was cleared so the IBAN holder-name validator no longer rejects ` +
  `the row. Operator must collect a clean Latin first name from the ` +
  `candidate (or archive the account if it's a test/inactive registration) ` +
  `before payroll can be released.`;

const ARABIC_RANGE = /[\u0600-\u06FF]/;

type Row = {
  id: string;
  status: string | null;
  candidate_code: string | null;
  full_name_en: string | null;
  iban_account_first_name: string | null;
  iban_account_last_name: string | null;
  notes: string | null;
};

type Decision =
  | { kind: "apply"; row: Row; clearFirst: boolean; setLast: string | null; appendNote: boolean; resetProfileCompleted: boolean }
  | { kind: "skip_already_cleaned"; row: Row }
  | { kind: "skip_not_found"; id: string }
  | { kind: "skip_already_flagged"; row: Row };

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function decide(target: typeof TARGETS[number], row: Row | undefined): Decision {
  if (!row) return { kind: "skip_not_found", id: target.id };

  const firstOk = validateIbanHolderName(row.iban_account_first_name);
  const lastOk = validateIbanHolderName(row.iban_account_last_name);

  // Fully cleaned by hand → nothing to do.
  if (firstOk.ok && lastOk.ok) {
    return { kind: "skip_already_cleaned", row };
  }

  // Idempotent re-run: previous apply left first NULL, last cleaned, note
  // tagged. Nothing more to write.
  const noteAlreadyTagged = (row.notes ?? "").includes(NOTE_TAG);
  const firstAlreadyClear = row.iban_account_first_name === null;
  const lastAlreadyClean = !ARABIC_RANGE.test(row.iban_account_last_name ?? "");
  if (noteAlreadyTagged && firstAlreadyClear && lastAlreadyClean) {
    return { kind: "skip_already_flagged", row };
  }

  // Plan the writes — independently per field so we never destroy an
  // operator's manual edit.
  //
  // 1. first name: ONLY clear it if the current value fails the validator
  //    (i.e. is still garbled / Arabic / empty). If an operator has
  //    already typed a clean Latin first name, leave it alone — even if
  //    the last name still needs fixing.
  const clearFirst = row.iban_account_first_name !== null && !firstOk.ok;

  // 2. last name: ONLY overwrite if the current value is still Arabic.
  //    Don't clobber an operator-supplied Latin spelling.
  const setLast =
    row.iban_account_last_name && ARABIC_RANGE.test(row.iban_account_last_name)
      ? target.safeLastAfter
      : null;

  // 3. admin note + profile-completed reset: needed whenever the row
  //    will end up with no usable first name AND the row hasn't yet
  //    been flagged for the operator. This covers both the fresh clear
  //    case AND the edge case where some prior tool nulled the field
  //    without leaving the [task-139] note for support staff.
  const firstWillBeNull = clearFirst || row.iban_account_first_name === null;
  const appendNote = firstWillBeNull && !noteAlreadyTagged;
  const resetProfileCompleted = appendNote;

  // If nothing to write (e.g. operator already fixed first name and last
  // is already Latin but the validator failed for an unrelated reason
  // like length), treat as already cleaned to keep the report honest.
  if (!clearFirst && setLast === null && !appendNote) {
    return { kind: "skip_already_cleaned", row };
  }

  return { kind: "apply", row, clearFirst, setLast, appendNote, resetProfileCompleted };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const url = (process.env.PROD_DATABASE_URL || process.env.DATABASE_URL || "")
    .replace("sslmode=require", "sslmode=no-verify");
  if (!url) {
    console.error("ERROR: PROD_DATABASE_URL (or DATABASE_URL) must be set.");
    process.exit(1);
  }
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();

  console.log(`[task-139] mode=${apply ? "APPLY" : "DRY-RUN"} targets=${TARGETS.length}`);

  const ids = TARGETS.map((t) => t.id);
  const { rows } = await client.query<Row>(
    `SELECT id, status, candidate_code, full_name_en,
            iban_account_first_name, iban_account_last_name, notes
       FROM candidates
      WHERE id = ANY($1::varchar[])`,
    [ids],
  );
  const byId = new Map(rows.map((r) => [r.id, r]));

  const decisions: Decision[] = TARGETS.map((t) => decide(t, byId.get(t.id)));

  const summary = {
    apply: decisions.filter((d) => d.kind === "apply").length,
    skip_already_cleaned: decisions.filter((d) => d.kind === "skip_already_cleaned").length,
    skip_already_flagged: decisions.filter((d) => d.kind === "skip_already_flagged").length,
    skip_not_found: decisions.filter((d) => d.kind === "skip_not_found").length,
  };
  console.log(`[task-139] decisions:`, summary);

  // ── CSV report ──────────────────────────────────────────────────────────
  const reportPath = path.resolve(".local/iban-firstname-cleanup-report.csv");
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const header = [
    "candidate_id",
    "decision",
    "candidate_code",
    "status",
    "full_name_en",
    "first_before",
    "last_before",
    "first_after",
    "last_after",
    "note_appended",
  ].join(",");
  const lines = decisions.map((d) => {
    if (d.kind === "skip_not_found") {
      return [d.id, "skip_not_found", "", "", "", "", "", "", "", ""].map(csvEscape).join(",");
    }
    const r = d.row;
    const firstAfter =
      d.kind === "apply" && d.clearFirst ? "" : (r.iban_account_first_name ?? "");
    const lastAfter =
      d.kind === "apply" && d.setLast !== null ? d.setLast : (r.iban_account_last_name ?? "");
    return [
      r.id,
      d.kind,
      r.candidate_code ?? "",
      r.status ?? "",
      r.full_name_en ?? "",
      r.iban_account_first_name ?? "",
      r.iban_account_last_name ?? "",
      firstAfter,
      lastAfter,
      d.kind === "apply" && d.appendNote ? "yes" : "no",
    ].map(csvEscape).join(",");
  });
  fs.writeFileSync(reportPath, [header, ...lines].join("\n") + "\n");
  console.log(`[task-139] report → ${reportPath}`);

  if (!apply) {
    console.log("[task-139] dry-run — no DB writes. Re-run with --apply to commit.");
    await client.end();
    return;
  }

  // ── Apply inside a SINGLE transaction ───────────────────────────────────
  await client.query("BEGIN");
  try {
    let written = 0;
    for (const d of decisions) {
      if (d.kind !== "apply") continue;
      const sets: string[] = [];
      const params: unknown[] = [];
      if (d.clearFirst) sets.push(`iban_account_first_name = NULL`);
      if (d.setLast !== null) {
        params.push(d.setLast);
        sets.push(`iban_account_last_name = $${params.length}`);
      }
      if (d.appendNote) {
        params.push(NOTE_BODY);
        // Append on a new line if there's an existing note, else just set it.
        sets.push(
          `notes = CASE WHEN notes IS NULL OR notes = '' THEN $${params.length} ` +
            `ELSE notes || E'\\n\\n' || $${params.length} END`,
        );
      }
      if (d.resetProfileCompleted) sets.push(`profile_completed = FALSE`);
      sets.push(`updated_at = NOW()`);
      params.push(d.row.id);
      await client.query(
        `UPDATE candidates SET ${sets.join(", ")} WHERE id = $${params.length}`,
        params,
      );
      written++;
    }
    await client.query("COMMIT");
    console.log(`[task-139] APPLIED ${written} updates in one transaction.`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[task-139] FAILED — rolled back.", err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("[task-139] fatal:", err);
  process.exit(1);
});
