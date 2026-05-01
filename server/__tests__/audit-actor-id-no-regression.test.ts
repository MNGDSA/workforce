/**
 * Static regression guard for the audit log actor-name bug.
 *
 * Long story short: `requireAuth` writes the authenticated user id onto
 * `req.authUserId`. There is NO middleware anywhere that writes to
 * `req.userId`. Multiple callsites in server/routes.ts had drifted into
 * reading `(req as any).userId`, which silently returned undefined and
 * caused every authenticated audit row to land with actor_id=NULL and
 * actor_name="System".
 *
 * This test reads server/routes.ts as text and fails the build the
 * moment any `(req as any).userId` (or its bare `req.userId` cousin)
 * reappears, so the regression cannot sneak back in via copy/paste from
 * older code or a stale snippet.
 *
 * Why a static test instead of a full HTTP integration:
 *  - logAudit is module-private; testing it via real HTTP would require
 *    spinning up the whole Express app + DB just to assert one column
 *    on one row, which is far slower than 5ms of regex.
 *  - The bug is fundamentally a *naming* mistake — the right test is one
 *    that catches the wrong name, not one that runs the wrong code.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROUTES_FILE = path.resolve(process.cwd(), "server/routes.ts");

test("server/routes.ts contains no `(req as any).userId` reads (use req.authUserId)", () => {
  const src = fs.readFileSync(ROUTES_FILE, "utf8");
  // Match against source code bodies, not against comments/doc blocks
  // that legitimately *describe* the regression. We strip block comments
  // and line comments before scanning.
  const stripped = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  const matches = stripped.match(/\(\s*req\s+as\s+any\s*\)\s*\.\s*userId\b/g);
  assert.equal(
    matches,
    null,
    `Found ${matches?.length} stale (req as any).userId read(s) in server/routes.ts. ` +
      `Use req.authUserId instead — req.userId is never assigned anywhere and silently ` +
      `returns undefined, causing every authenticated audit row to log as actor="System".`,
  );
});

test("server/routes.ts contains no bare `req.userId` reads (use req.authUserId)", () => {
  const src = fs.readFileSync(ROUTES_FILE, "utf8");
  const stripped = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  // Look for `req.userId` that is NOT preceded by `auth` (so we skip
  // legitimate `req.authUserId`) and NOT inside a string literal.
  // Cheap heuristic: split on req.authUserId mentions to remove them.
  const cleaned = stripped.replace(/req\.authUserId/g, "<<AUTHED>>");
  const matches = cleaned.match(/\breq\.userId\b/g);
  assert.equal(
    matches,
    null,
    `Found ${matches?.length} stale req.userId read(s) in server/routes.ts. ` +
      `Use req.authUserId instead.`,
  );
});

test("logAudit in server/routes.ts reads req.authUserId (not the legacy field)", () => {
  const src = fs.readFileSync(ROUTES_FILE, "utf8");
  // Find the function declaration, then walk forward counting braces to
  // capture the full body (the params type uses `{...}` so a non-greedy
  // regex stops too early).
  const startIdx = src.indexOf("async function logAudit(");
  assert.ok(startIdx >= 0, "Could not find logAudit() definition in server/routes.ts");
  // Skip past the parameter list `(...)` to the opening `{` of the body.
  let i = src.indexOf(")", startIdx);
  while (i < src.length && src[i] !== "{") i++;
  let depth = 0;
  let bodyEnd = -1;
  for (let j = i; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}") {
      depth--;
      if (depth === 0) { bodyEnd = j; break; }
    }
  }
  assert.ok(bodyEnd > 0, "Could not locate logAudit() body close brace");
  const body = src.slice(startIdx, bodyEnd + 1);
  assert.match(
    body,
    /req\.authUserId/,
    "logAudit() must read req.authUserId — req.userId is never set anywhere.",
  );
});
