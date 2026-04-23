// scripts/backfill-iban-holder-names.ts ─ Task #137 backfill.
//
// Background:
//   `iban_account_first_name` / `iban_account_last_name` go straight onto
//   payroll wire transfers. Saudi banks reject the wire when the
//   beneficiary name on the transfer doesn't match the Latin name on the
//   bank's record — so these columns must be English-only. Task #137
//   shipped the validator (`server/lib/iban.ts` + Zod refine in
//   `shared/schema.ts`) that blocks Arabic at every write path going
//   forward; this script cleans up the rows already in prod.
//
// As of 2026-04-23: 806 candidates have Arabic in `first`, 817 have it
// in `last` (overlapping set: 817 distinct candidates need backfill).
//
// Strategy:
//   1. SELECT every candidate where either column matches the Arabic
//      Unicode block (U+0600-U+06FF). Pull both columns together so the
//      transliterator sees the full name in context.
//   2. For each row, ask Claude to transliterate the Arabic name into a
//      Saudi-passport-style English spelling. Claude returns JSON with
//      `firstName` and `lastName`. We ask in batches of 25 rows per
//      request to amortise the round-trip latency.
//   3. Validate every returned name through `validateIbanHolderName`
//      from `server/lib/iban.ts` BEFORE writing — if the model returns
//      something that still has non-Latin chars (e.g. an apostrophe in
//      a name like "Al-A'rifi" with a curly quote), we drop it from the
//      apply set and surface it in the CSV for manual review.
//   4. Write all valid rows inside a SINGLE transaction. Roll back on
//      any error so partial bank-record divergence can't happen.
//
// Usage:
//   tsx scripts/backfill-iban-holder-names.ts                 # dry-run
//   tsx scripts/backfill-iban-holder-names.ts --apply         # commit
//   tsx scripts/backfill-iban-holder-names.ts --limit 50      # sample
//
// Always emits a CSV report to .local/iban-name-backfill-report.csv
// listing every row inspected with: candidate_id, before_first,
// before_last, after_first, after_last, action (transliterate | skip |
// invalid_response | rejected_by_validator).

import { Client } from "pg";
import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { validateIbanHolderName } from "../server/lib/iban";

const ARABIC_RANGE = /[\u0600-\u06FF]/;
const BATCH_SIZE = 25;
// Claude Haiku 4.5 (Oct 2025) — fast + cheap, ample quality for proper-noun
// transliteration. Override via env if a newer model ships.
const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5";

type Row = { id: string; iban_account_first_name: string | null; iban_account_last_name: string | null };

type Decision =
  | { kind: "transliterate"; row: Row; firstAfter: string; lastAfter: string }
  | { kind: "skip"; row: Row; reason: string }
  | { kind: "invalid_response"; row: Row; rawResponse: string }
  | { kind: "rejected_by_validator"; row: Row; firstAfter: string; lastAfter: string; reason: string };

function parseArgs(argv: string[]) {
  const apply = argv.includes("--apply");
  const limitIdx = argv.indexOf("--limit");
  const limit = limitIdx >= 0 ? Number(argv[limitIdx + 1]) : null;
  return { apply, limit };
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Translation prompt — kept compact + explicit so the model returns
// strict JSON we can parse without retries. We give 2 example rows and
// ask for an array back so a single request handles a whole batch.
function buildPrompt(batch: Row[]): string {
  const items = batch.map((r, i) => ({
    id: r.id,
    first: r.iban_account_first_name ?? "",
    last: r.iban_account_last_name ?? "",
    index: i,
  }));
  return [
    "You are transliterating Saudi/Arab personal names from Arabic script",
    "to English LATIN letters as they would appear on a Saudi national ID,",
    "passport, or bank debit card. Use the most common Saudi-English",
    "spelling convention.",
    "",
    "RULES (strict):",
    "- Output ONLY a JSON array. No prose, no markdown fences.",
    "- Each item: {\"id\":\"...\",\"firstName\":\"...\",\"lastName\":\"...\"}.",
    "- LATIN letters only: A-Z a-z space hyphen apostrophe period.",
    "- Capitalise each name part. Do NOT translate (keep proper nouns).",
    "- Do NOT add titles (no \"Mr\", no \"bin\", no \"Al-\" unless it was in the source).",
    "- If a column is already pure Latin, copy it through unchanged.",
    "- If a column is empty, return an empty string.",
    "- Use ONLY straight ASCII apostrophe (') and hyphen (-), never curly quotes.",
    "",
    "EXAMPLES:",
    'Input  : {"id":"x","first":"محمد","last":"الحارثي"}',
    'Output : {"id":"x","firstName":"Mohammed","lastName":"Al-Harthi"}',
    'Input  : {"id":"y","first":"عبدالله","last":"السبيعي"}',
    'Output : {"id":"y","firstName":"Abdullah","lastName":"Al-Subaie"}',
    "",
    "INPUT:",
    JSON.stringify(items),
  ].join("\n");
}

async function transliterateBatch(client: Anthropic, batch: Row[]): Promise<Map<string, { firstName: string; lastName: string } | { error: string }>> {
  const result = new Map<string, { firstName: string; lastName: string } | { error: string }>();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [{ role: "user", content: buildPrompt(batch) }],
  });
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  // Strip accidental ```json fences just in case.
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    for (const r of batch) result.set(r.id, { error: `non-JSON response: ${cleaned.slice(0, 200)}` });
    return result;
  }
  if (!Array.isArray(parsed)) {
    for (const r of batch) result.set(r.id, { error: "response was not an array" });
    return result;
  }
  for (const item of parsed) {
    if (!item || typeof item !== "object" || typeof (item as any).id !== "string") continue;
    const id = (item as any).id as string;
    const firstName = String((item as any).firstName ?? "");
    const lastName = String((item as any).lastName ?? "");
    result.set(id, { firstName, lastName });
  }
  // Anything in the input batch but missing from the response gets flagged.
  for (const r of batch) {
    if (!result.has(r.id)) result.set(r.id, { error: "id missing from model response" });
  }
  return result;
}

function decide(row: Row, translation: { firstName: string; lastName: string } | { error: string } | undefined): Decision {
  if (!translation) return { kind: "skip", row, reason: "no translation returned" };
  if ("error" in translation) return { kind: "invalid_response", row, rawResponse: translation.error };

  // Preserve already-Latin columns: if input was pure ASCII, keep as-is.
  const firstWasArabic = ARABIC_RANGE.test(row.iban_account_first_name ?? "");
  const lastWasArabic = ARABIC_RANGE.test(row.iban_account_last_name ?? "");
  const firstAfter = firstWasArabic ? translation.firstName.trim() : (row.iban_account_first_name ?? "").trim();
  const lastAfter = lastWasArabic ? translation.lastName.trim() : (row.iban_account_last_name ?? "").trim();

  // Validator gate — same rule that blocks new writes (Task #137 main fix).
  // If the model returned something that still trips it, we DON'T write
  // and the row goes into the CSV for human review.
  if (firstAfter) {
    const v = validateIbanHolderName(firstAfter);
    if (!v.ok) return { kind: "rejected_by_validator", row, firstAfter, lastAfter, reason: `firstName ${v.reason}` };
  }
  if (lastAfter) {
    const v = validateIbanHolderName(lastAfter);
    if (!v.ok) return { kind: "rejected_by_validator", row, firstAfter, lastAfter, reason: `lastName ${v.reason}` };
  }
  if (!firstAfter && !lastAfter) {
    return { kind: "skip", row, reason: "both columns empty after transliteration" };
  }
  return { kind: "transliterate", row, firstAfter, lastAfter };
}

async function main() {
  const { apply, limit } = parseArgs(process.argv.slice(2));
  const url = (process.env.PROD_DATABASE_URL || process.env.DATABASE_URL || "").replace("sslmode=require", "sslmode=no-verify");
  if (!url) { console.error("ERROR: PROD_DATABASE_URL (or DATABASE_URL) must be set."); process.exit(1); }
  if (!process.env.ANTHROPIC_API_KEY) { console.error("ERROR: ANTHROPIC_API_KEY must be set."); process.exit(1); }

  const pg = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await pg.connect();
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  console.log(`[backfill-iban-names] mode=${apply ? "APPLY" : "DRY-RUN"} limit=${limit ?? "ALL"} model=${MODEL}`);

  const limitClause = limit ? `LIMIT ${Number(limit)}` : "";
  const { rows } = await pg.query<Row>(
    `SELECT id, iban_account_first_name, iban_account_last_name
       FROM candidates
      WHERE (iban_account_first_name ~ '[\u0600-\u06FF]')
         OR (iban_account_last_name ~ '[\u0600-\u06FF]')
      ORDER BY id
      ${limitClause}`,
  );
  console.log(`[backfill-iban-names] ${rows.length} candidates need transliteration.`);

  const decisions: Decision[] = [];
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    process.stdout.write(`  [${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(rows.length / BATCH_SIZE)}] translating ${batch.length} rows… `);
    let translations: Map<string, { firstName: string; lastName: string } | { error: string }>;
    try {
      translations = await transliterateBatch(anthropic, batch);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`API ERROR: ${msg}`);
      for (const r of batch) decisions.push({ kind: "invalid_response", row: r, rawResponse: msg });
      continue;
    }
    let ok = 0; let bad = 0;
    for (const r of batch) {
      const d = decide(r, translations.get(r.id));
      decisions.push(d);
      if (d.kind === "transliterate") ok++; else bad++;
    }
    console.log(`ok=${ok} flagged=${bad}`);
  }

  // CSV report — every decision gets a row.
  const reportPath = path.resolve(".local/iban-name-backfill-report.csv");
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const header = ["candidate_id","action","before_first","before_last","after_first","after_last","note"].join(",");
  const lines = decisions.map((d) => {
    if (d.kind === "transliterate") return [d.row.id, "transliterate", csvEscape(d.row.iban_account_first_name), csvEscape(d.row.iban_account_last_name), csvEscape(d.firstAfter), csvEscape(d.lastAfter), ""].join(",");
    if (d.kind === "skip") return [d.row.id, "skip", csvEscape(d.row.iban_account_first_name), csvEscape(d.row.iban_account_last_name), "", "", csvEscape(d.reason)].join(",");
    if (d.kind === "invalid_response") return [d.row.id, "invalid_response", csvEscape(d.row.iban_account_first_name), csvEscape(d.row.iban_account_last_name), "", "", csvEscape(d.rawResponse)].join(",");
    return [d.row.id, "rejected_by_validator", csvEscape(d.row.iban_account_first_name), csvEscape(d.row.iban_account_last_name), csvEscape(d.firstAfter), csvEscape(d.lastAfter), csvEscape(d.reason)].join(",");
  });
  fs.writeFileSync(reportPath, [header, ...lines].join("\n") + "\n");
  console.log(`[backfill-iban-names] report → ${reportPath}`);

  const transliterations = decisions.filter((d): d is Extract<Decision, { kind: "transliterate" }> => d.kind === "transliterate");
  const flagged = decisions.length - transliterations.length;
  console.log(`[backfill-iban-names] ready=${transliterations.length} flagged=${flagged}`);

  if (!apply) {
    console.log("[backfill-iban-names] dry-run — no DB writes. Re-run with --apply to commit.");
    await pg.end();
    return;
  }

  await pg.query("BEGIN");
  try {
    for (const d of transliterations) {
      await pg.query(
        `UPDATE candidates
            SET iban_account_first_name = $1,
                iban_account_last_name  = $2,
                updated_at = NOW()
          WHERE id = $3`,
        [d.firstAfter, d.lastAfter, d.row.id],
      );
    }
    await pg.query("COMMIT");
    console.log(`[backfill-iban-names] APPLIED ${transliterations.length} updates in one transaction.`);
  } catch (err) {
    await pg.query("ROLLBACK");
    console.error("[backfill-iban-names] FAILED — rolled back.", err);
    process.exitCode = 1;
  } finally {
    await pg.end();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
