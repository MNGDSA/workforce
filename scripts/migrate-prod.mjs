#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { Client } from "pg";

const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

function fail(msg) {
  console.error(`${RED}${BOLD}ERROR:${RESET} ${msg}`);
  process.exit(1);
}

function log(msg) {
  console.log(msg);
}

const PROD_URL = process.env.PROD_DATABASE_URL;
if (!PROD_URL) {
  fail(
    "PROD_DATABASE_URL is not set in this environment.\n" +
      "       Set it in Replit Secrets before running this script."
  );
}

if (PROD_URL === process.env.DATABASE_URL) {
  fail(
    "PROD_DATABASE_URL equals DATABASE_URL.\n" +
      "       Refusing to run \u2014 PROD_DATABASE_URL must point at the production DB,\n" +
      "       not the dev DB."
  );
}

let host = "(unparseable)";
let dbName = "(unparseable)";
try {
  const u = new URL(PROD_URL);
  host = u.hostname;
  dbName = u.pathname.replace(/^\//, "");
} catch {
  fail("PROD_DATABASE_URL is not a valid URL.");
}

log("");
log(`${YELLOW}${BOLD}\u2554\u2550\u2550 PROD SCHEMA MIGRATION \u2550\u2550\u2557${RESET}`);
log(`${YELLOW}${BOLD}\u2551${RESET}                          ${YELLOW}${BOLD}\u2551${RESET}`);
log(`${YELLOW}${BOLD}\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d${RESET}`);
log("");
log(`${BOLD}Target database${RESET}`);
log(`  host : ${CYAN}${host}${RESET}`);
log(`  db   : ${CYAN}${dbName}${RESET}`);
log("");

log(`${BOLD}Step 1/3${RESET} \u2014 connectivity check...`);
const probe = new Client({
  connectionString: PROD_URL,
  ssl: { rejectUnauthorized: false },
});
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

try {
  await probe.connect();
  const r = await probe.query(
    `SELECT current_database() AS db, current_user AS usr,
            (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public') AS tables`
  );
  const row = r.rows[0];
  log(
    `  connected as ${CYAN}${row.usr}${RESET} \u2192 ${CYAN}${row.db}${RESET} (${row.tables} tables in public schema)`
  );
  await probe.end();
} catch (err) {
  fail(`Could not connect to prod DB: ${err.message}`);
}

log("");
log(
  `${BOLD}Step 2/3${RESET} \u2014 ${YELLOW}drizzle-kit push${RESET} will now run against ${RED}${BOLD}PROD${RESET}.`
);
log(
  "  It will print every CREATE / ALTER / DROP it intends to run and will pause"
);
log(
  "  for confirmation before any destructive change. Read its output carefully."
);
log("");

const tty = process.stdin.isTTY && process.stdout.isTTY;
if (!tty) {
  fail(
    "stdin/stdout is not a TTY \u2014 this script must be run interactively."
  );
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) =>
  new Promise((resolve) => rl.question(q, (ans) => resolve(ans)));

const typed = await ask(
  `${BOLD}Type ${RESET}${RED}${BOLD}APPLY${RESET}${BOLD} (uppercase) to proceed, anything else to cancel: ${RESET}`
);
if (typed.trim() !== "APPLY") {
  rl.close();
  log(`${GREEN}Cancelled. Nothing was changed on prod.${RESET}`);
  process.exit(0);
}
rl.close();

log("");
log(`${BOLD}Step 3/3${RESET} \u2014 running ${CYAN}drizzle-kit push${RESET}...`);
log("");

const child = spawn("npx", ["drizzle-kit", "push"], {
  stdio: "inherit",
  env: {
    ...process.env,
    DATABASE_URL: PROD_URL,
    NODE_ENV: "production",
    NODE_TLS_REJECT_UNAUTHORIZED: "0",
  },
});

child.on("exit", (code) => {
  log("");
  if (code === 0) {
    log(`${GREEN}${BOLD}\u2714 Prod schema sync complete.${RESET}`);
    log(
      `  Verify with: ${CYAN}node scripts/test-db-connection.cjs${RESET} (against PROD_DATABASE_URL)`
    );
  } else {
    log(
      `${RED}${BOLD}\u2718 drizzle-kit push exited with code ${code}.${RESET} Investigate above output.`
    );
  }
  process.exit(code ?? 1);
});
