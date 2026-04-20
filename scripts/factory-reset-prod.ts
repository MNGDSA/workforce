// Factory-reset the WORKFORCE production database.
//
// What it does (in order):
//   1. SAFETY GATE — refuses to run unless invoked with the exact
//      confirmation phrase AND PROD_DATABASE_URL is set.
//   2. SNAPSHOT — pg_dump of the entire prod DB to /tmp.
//   3. SCHEMA SYNC — drizzle-kit push --force against prod, so the
//      DB structure matches shared/schema.ts.
//   4. DATA WIPE — TRUNCATE ... RESTART IDENTITY CASCADE on every
//      table EXCEPT the preserve-list. The preserve-list keeps the
//      RBAC seed and SMS plugin config so the app boots cleanly.
//   5. USER PRUNE — delete every users row except the pinned
//      Super Admin (Faisal Alamri).
//   6. VERIFY — print row counts so you can confirm the reset.
//
// Run:
//   PROD_DATABASE_URL=... npx tsx scripts/factory-reset-prod.ts \
//     --confirm "FACTORY RESET PROD"
//
// Optional flags:
//   --skip-snapshot       Skip pg_dump (NOT recommended).
//   --skip-schema-sync    Skip drizzle-kit push (use if schema already in sync).
//   --keep-user-id <uuid> Override the pinned Super Admin id.
//   --dry-run             Print the plan; do not execute the destructive steps.

import { Pool } from "pg";
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

// DO managed Postgres serves a CA-signed cert that Node's default trust
// store does not include. Disable strict verification for this script.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const CONFIRM_PHRASE = "FACTORY RESET PROD";

function stripSslmode(url: string): string {
  return url.replace(/[?&]sslmode=[^&]*/g, (m) => (m.startsWith("?") ? "?" : "")).replace(/\?$/, "");
}

// Tables that must survive the wipe. These hold app config / seed data
// the application needs in order to boot and authenticate users.
const PRESERVE_TABLES = new Set<string>([
  "roles",
  "permissions",
  "role_permissions",
  "sms_plugins",
  "users", // handled separately by USER PRUNE step below
  "session", // express-session store, if present
  "__drizzle_migrations",
]);

// Default Super Admin to keep. Override with --keep-user-id.
const DEFAULT_KEEP_USER_ID = "5b1f05b6-68a2-44fe-b48c-d571690301e1"; // Faisal Alamri

interface CliArgs {
  confirm: string | null;
  skipSnapshot: boolean;
  skipSchemaSync: boolean;
  keepUserId: string;
  dryRun: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = {
    confirm: null,
    skipSnapshot: false,
    skipSchemaSync: false,
    keepUserId: DEFAULT_KEEP_USER_ID,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--confirm") out.confirm = argv[++i] ?? null;
    else if (a === "--skip-snapshot") out.skipSnapshot = true;
    else if (a === "--skip-schema-sync") out.skipSchemaSync = true;
    else if (a === "--keep-user-id") out.keepUserId = argv[++i] ?? out.keepUserId;
    else if (a === "--dry-run") out.dryRun = true;
  }
  return out;
}

function fail(msg: string): never {
  console.error(`\n[factory-reset] ABORT: ${msg}\n`);
  process.exit(1);
}

function info(msg: string) {
  console.log(`[factory-reset] ${msg}`);
}

async function snapshotProd(prodUrl: string): Promise<string> {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = "/tmp/workforce-prod-snapshots";
  mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `prod-${ts}.sql`);
  info(`Running pg_dump → ${out}`);
  const r = spawnSync(
    "pg_dump",
    ["--no-owner", "--no-privileges", "--clean", "--if-exists", "-f", out, prodUrl],
    { stdio: "inherit", env: { ...process.env, PGSSLMODE: "require" } },
  );
  if (r.status !== 0) fail(`pg_dump failed (exit ${r.status}). Aborting before destructive steps.`);
  info(`Snapshot complete: ${out}`);
  return out;
}

function schemaSync(prodUrl: string) {
  info("Running drizzle-kit push --force against prod…");
  const r = spawnSync("npx", ["drizzle-kit", "push", "--force"], {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: prodUrl,
      NODE_ENV: "production",
      NODE_TLS_REJECT_UNAUTHORIZED: "0",
    },
  });
  if (r.status !== 0) fail(`drizzle-kit push failed (exit ${r.status}). Aborting.`);
  info("Schema sync complete.");
}

async function listAllTables(pool: Pool): Promise<string[]> {
  const r = await pool.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema='public' AND table_type='BASE TABLE'
     ORDER BY table_name`,
  );
  return r.rows.map((row) => row.table_name);
}

async function rowCounts(pool: Pool, tables: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of tables) {
    const r = await pool.query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM "${t}"`);
    out[t] = Number(r.rows[0]?.n ?? 0);
  }
  return out;
}

async function wipeData(pool: Pool, allTables: string[], keepUserId: string) {
  // STEP 1: snapshot the pinned user row in-memory BEFORE truncate.
  // TRUNCATE ... CASCADE will wipe users if any wiped table has an FK
  // that users references, so we must save-and-restore it.
  info(`Capturing pinned user row id=${keepUserId} before truncate…`);
  const snap = await pool.query(
    `SELECT row_to_json(u) AS r FROM users u WHERE u.id = $1`,
    [keepUserId],
  );
  if (snap.rowCount === 0) {
    fail(`Pinned user id ${keepUserId} not found in users table. Refusing to proceed.`);
  }
  const keepRow = snap.rows[0].r as Record<string, unknown>;
  info(`Captured row: ${keepRow.full_name} (${keepRow.username})`);

  // STEP 2: truncate everything not in preserve-list. CASCADE may wipe
  // preserved tables that are referenced by wiped tables — that is OK
  // for users (we restore below) and harmless for the RBAC seed since
  // those tables are not referenced FROM wiped tables.
  const wipeTargets = allTables.filter((t) => !PRESERVE_TABLES.has(t));
  if (wipeTargets.length === 0) {
    info("No tables to wipe (all are in preserve-list).");
  } else {
    const list = wipeTargets.map((t) => `"${t}"`).join(", ");
    info(`TRUNCATE on ${wipeTargets.length} tables: ${wipeTargets.join(", ")}`);
    await pool.query(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
  }

  // STEP 3: prune users (in case CASCADE did not wipe them) then
  // restore the pinned row from the in-memory snapshot.
  const del = await pool.query(`DELETE FROM users WHERE id <> $1`, [keepUserId]);
  info(`Deleted ${del.rowCount ?? 0} non-pinned user(s) post-truncate.`);

  const exists = await pool.query(`SELECT 1 FROM users WHERE id = $1`, [keepUserId]);
  if (exists.rowCount === 0) {
    info("Pinned user was wiped by CASCADE — restoring from in-memory snapshot…");
    const cols = Object.keys(keepRow);
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
    const values = cols.map((c) => keepRow[c]);
    await pool.query(
      `INSERT INTO users (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${placeholders})`,
      values,
    );
    info("Pinned user restored.");
  } else {
    info("Pinned user survived; no restore needed.");
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const prodUrl = process.env.PROD_DATABASE_URL;

  if (!prodUrl) fail("PROD_DATABASE_URL is not set.");
  if (args.confirm !== CONFIRM_PHRASE)
    fail(`Confirmation required. Re-run with: --confirm "${CONFIRM_PHRASE}"`);

  // Sanity-check: refuse to run against anything that does not look like
  // the DigitalOcean managed prod cluster, to prevent accidentally
  // wiping the dev/Replit database.
  const host = new URL(prodUrl).hostname;
  if (!host.endsWith(".db.ondigitalocean.com")) {
    fail(`PROD_DATABASE_URL host '${host}' does not look like a DO managed Postgres cluster. Refusing.`);
  }

  info(`Target host: ${host}`);
  info(`Pinned Super Admin: ${args.keepUserId}`);
  if (args.dryRun) info("DRY RUN — no destructive ops will execute.");

  const pool = new Pool({
    connectionString: stripSslmode(prodUrl),
    ssl: { rejectUnauthorized: false },
  });

  try {
    const allTables = await listAllTables(pool);
    info(`Found ${allTables.length} tables in prod public schema.`);

    const wipeTargets = allTables.filter((t) => !PRESERVE_TABLES.has(t));
    info(`Will WIPE (${wipeTargets.length}): ${wipeTargets.join(", ") || "(none)"}`);
    info(`Will KEEP (${allTables.length - wipeTargets.length}): ${[...PRESERVE_TABLES].filter((t) => allTables.includes(t)).join(", ")}`);

    if (args.dryRun) {
      const before = await rowCounts(pool, allTables);
      console.table(before);
      info("Dry run complete. Exit.");
      return;
    }

    if (!args.skipSnapshot) await snapshotProd(prodUrl);
    else info("Skipping snapshot (--skip-snapshot).");

    if (!args.skipSchemaSync) schemaSync(prodUrl);
    else info("Skipping schema sync (--skip-schema-sync).");

    // Re-list tables after schema sync in case new tables were created.
    const tablesAfterSync = await listAllTables(pool);
    await wipeData(pool, tablesAfterSync, args.keepUserId);

    info("Post-reset row counts:");
    const after = await rowCounts(pool, await listAllTables(pool));
    console.table(after);

    info("Factory reset complete.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[factory-reset] FATAL:", err);
  process.exit(1);
});
