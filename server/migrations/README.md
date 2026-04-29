# Boot-time schema migrations (`ensure-*.ts`)

This project intentionally does **not** use sequential SQL migrations
(`drizzle-kit migrate`). Production deploys do not run `drizzle-kit push`
either. Instead, every schema change ships with a small, idempotent
**boot-migrate ensure-script** that runs at server startup and brings the
live database forward.

The pattern exists because the team needs zero-touch deploys with no
out-of-band migration step, but Drizzle's "push from schema" workflow is
unsafe in production and can drop columns. Ensure-scripts give us
fine-grained, hand-reviewed `ALTER TABLE ... IF NOT EXISTS` statements that
are safe to run on every boot.

## When you add a column or table to `shared/schema.ts`

1. **Add the column to the appropriate Drizzle table** in `shared/schema.ts`.
2. **Create or extend an ensure-script** in this directory:
   - File name: `ensure-<topic>.ts` (kebab-case).
   - The exported function takes a `log(msg, source?)` callback and uses
     `db.execute(sql\`ALTER TABLE <table> ADD COLUMN IF NOT EXISTS ...\`)`.
   - Use `IF NOT EXISTS` on every statement so the script is idempotent
     and re-running on every boot is free.
   - For `NOT NULL` columns, supply a `DEFAULT` so the `ALTER` runs
     instantly even on tables with millions of rows (Postgres stores the
     default in the catalog and skips the row rewrite).
3. **Register the function** in `server/index.ts` inside the boot-migrate
   try/catch block (look for `// Boot-time idempotent schema patches`).
4. **Run the coverage check locally**:
   ```bash
   node scripts/check-schema-migrations.mjs
   ```
   It should print `Schema migration coverage OK`.

## Existing examples

- `ensure-locale-column.ts` — single column, single table.
- `ensure-sms-outbox-next-attempt.ts` — column + partial index.
- `ensure-onboarding-reminders.ts` — multi-column ALTER + enum value
  additions (`ALTER TYPE ... ADD VALUE IF NOT EXISTS`).
- `ensure-vaccination-report-columns.ts` — same column on two tables.
- `ensure-critical-tables.ts` — production safety net that re-runs
  `drizzle-kit push --force` if a critical table is entirely missing.

## CI enforcement (Task #234)

The job **`Schema migration coverage`** in
`.github/workflows/test.yml` runs `scripts/check-schema-migrations.mjs`
on every push and pull request. The check fails the build when:

- A column appears in `shared/schema.ts` that is not in the baseline
  drizzle snapshot (`migrations/meta/0000_snapshot.json`) **and** no
  `ALTER TABLE <table> ADD COLUMN IF NOT EXISTS <col>` exists in any
  `server/migrations/ensure-*.ts` file (or in `migrations/*.sql`).
- A new table appears in `shared/schema.ts` that is not in the baseline
  and no `CREATE TABLE IF NOT EXISTS` covers it.
- An `ensure-*.ts` script contains a non-idempotent `ALTER TABLE
  ... ADD COLUMN` or `CREATE TABLE` (i.e. missing `IF NOT EXISTS`). Boot-
  migrate scripts run on **every** server start, so a non-idempotent
  statement would crash the second boot. Drizzle SQL files in
  `migrations/*.sql` are exempt because each runs at most once.

This catches the recurring class of bug that took down production with
`column "has_vaccination_report" does not exist` (commit 0930a84) and
`column "locale" does not exist` before that.

### The allowlist

`scripts/schema-migration-allowlist.json` records pre-existing gaps that
predate this check. Each entry is a column or table that landed in
`shared/schema.ts` without an ensure-script but is presumed to exist in
production already (via `drizzle-kit push`, the
`ensure-critical-tables.ts` recovery path, or a one-shot script).

**Do not add new entries to the allowlist.** When the check flags your PR,
add an `ensure-*.ts` script — that is the entire point. The allowlist is
intentionally append-once: stale entries (gaps that have since been
covered) cause the check to fail loudly so the list shrinks over time.

## What the check does *not* do

- It does not validate column **types** match between `shared/schema.ts`
  and the ensure-script. A boolean schema field paired with an
  `ADD COLUMN ... TEXT` migration will pass the check. Reviewers must
  still read the ensure-script.
- It does not enforce that you registered the new ensure-function in
  `server/index.ts`. If you forget, the column will still be missing at
  boot. (A future improvement could parse `server/index.ts` for the
  import and fail when the file exists but is unwired.)
- It does not cover index-only or constraint-only changes. Those are
  rarer and lower-risk than a missing column, but if you add a unique
  index that the application relies on, ship it via an ensure-script
  too.
