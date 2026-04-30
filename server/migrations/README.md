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

## CI enforcement (Task #236) — wiring check

A sibling check, `scripts/check-boot-migrate-wiring.mjs`, runs in the same
CI job (`Schema migration coverage`) and fails the build when an
`ensure-*.ts` file exists but its exported function is not awaited from
the boot-migrate `try { ... } catch` block in `server/index.ts`. Task #234
only verifies the ALTER statement exists; without this check, a contributor
can ship a perfectly written ensure-script and still crash production
because the `await ensureXxx(log)` line was forgotten.

### How it works

For each `server/migrations/ensure-*.ts` file the check:

1. Parses every `export async function ensureXxx` declaration.
2. Looks for `await ensureXxx(...)` ONLY inside `try { ... }` blocks
   immediately following a `// @boot-migrate-block` marker comment in
   `server/index.ts`. Calls anywhere else in the file (route handlers,
   helpers, future startup code) do NOT count. Comments and string /
   template-literal contents are stripped before scanning, so a
   `"await ensureXxx(log)"` docstring or a commented-out invocation
   cannot satisfy the check.
3. Fails the build if no exported function is awaited from any marked
   block.

### Required: the `// @boot-migrate-block` marker

Every boot-migrate `try` block in `server/index.ts` must be tagged with
`// @boot-migrate-block` on a line immediately above the `try`. There can
be more than one — `server/index.ts` currently has two (the schema
self-heal block and the `ensure-critical-tables` safety net):

```ts
// Boot-time idempotent schema patches.
// @boot-migrate-block — see scripts/check-boot-migrate-wiring.mjs (Task #236).
try {
  const { ensureFoo } = await import("./migrations/ensure-foo");
  await ensureFoo(log);
} catch (err) {
  log(`boot migration failed: ${err}`, "boot-migrate");
}
```

If you add a new boot-migrate block, add the marker too. If a refactor
removes every marker, the check fails loudly rather than silently letting
all ensure-scripts pass.

### Opt-out: intentionally one-shot ensure-scripts

If an `ensure-*.ts` file is intentionally a one-shot backfill that should
NOT run on every boot (similar to `migrate-to-rbac.ts`), add the marker
`@boot-migrate-optional` somewhere in the file (e.g. in the JSDoc header):

```ts
/**
 * One-shot RBAC backfill. Run manually with `tsx`.
 * @boot-migrate-optional
 */
export async function ensureRbacBackfill(log) { /* ... */ }
```

Prefer renaming such files to a non-`ensure-` prefix when possible — the
opt-out marker exists for the rare case where the `ensure-` name is
already established and changing it would break external references.

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
- ~~It does not enforce that you registered the new ensure-function in
  `server/index.ts`.~~ As of Task #236 the wiring check
  (`scripts/check-boot-migrate-wiring.mjs`) does enforce this — the build
  fails if the exported function is not awaited from `server/index.ts`.
- It does not cover index-only or constraint-only changes. Those are
  rarer and lower-risk than a missing column, but if you add a unique
  index that the application relies on, ship it via an ensure-script
  too.
