// Task #107 — Tests for the SMS outbox enqueue / drain pipeline.
//
// Validates the contract documented in server/sms-outbox.ts:
//   1.  enqueueActivationSms inserts a row with the expected payload
//   2.  dedupeKey makes a second enqueue idempotent (still one row)
//   3.  drainSmsOutbox does NOT consume the retry budget when no active
//       SMS plugin is configured
//   4.  invalidatePendingActivationSms stamps dead_letter_at on pending
//       rows and is idempotent on already-invalidated rows
//   5.  Per-phone rate limit at drain time (PHONE_RATE_MAX successful
//       sends per PHONE_RATE_WINDOW_MS) is honored: an over-limit row
//       stays pending with lastError = phone_rate_limited and its
//       attempts increment is rolled back so the retry budget is
//       preserved for when the window slides.
//   6.  FOR UPDATE SKIP LOCKED: a row locked by another transaction
//       is skipped by drainSmsOutbox (its attempts stays 0) and gets
//       picked up on the next drain after the lock releases.
//   7.  Concurrent workers achieve exactly-once-claim semantics: two
//       parallel drainSmsOutbox() calls over a fresh batch of N rows
//       result in each row being claimed exactly once (sum of
//       attempts == N), which is only possible because the per-row
//       claim-and-process happens inside a single transaction that
//       holds the row's lock through the send call.
//   8.  Dead-letter once attempts > MAX_ATTEMPTS (5)
//
// Run:  npx tsx scripts/test-sms-outbox.ts

import { db } from "../server/db";
import {
  candidates,
  smsOutbox,
  smsPlugins,
  type SmsOutboxRow,
  type InsertSmsPlugin,
  type SmsPluginConfig,
  type InsertCandidate,
} from "../shared/schema";
import { eq, inArray, sql } from "drizzle-orm";
import {
  enqueueActivationSms,
  drainSmsOutbox,
  invalidatePendingActivationSms,
  PHONE_RATE_MAX,
} from "../server/sms-outbox";
import { generatePlainToken } from "../server/activation-tokens";

let pass = 0, fail = 0;
function ok(cond: boolean, name: string, detail = "") {
  if (cond) { pass++; console.log(`✓ ${name}`); }
  else      { fail++; console.error(`✗ ${name}${detail ? "  " + detail : ""}`); }
}

interface OutboxPayload {
  link: string;
  locale: string;
  tokenRowId?: string;
}

const stamp = Date.now();
const nid = `9${String(stamp).slice(-9).padStart(9, "0")}`;
const phone = `05${String(stamp).slice(-8).padStart(8, "0")}`;
const phoneRl = `05${String(stamp + 1).slice(-8).padStart(8, "0")}`;

async function clearActivePlugin(): Promise<string[]> {
  const rows = await db
    .select({ id: smsPlugins.id })
    .from(smsPlugins)
    .where(eq(smsPlugins.isActive, true));
  if (rows.length === 0) return [];
  await db
    .update(smsPlugins)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(smsPlugins.isActive, true));
  return rows.map((r) => r.id);
}

async function restoreActivePlugin(ids: string[]) {
  for (const id of ids) {
    await db
      .update(smsPlugins)
      .set({ isActive: true, updatedAt: new Date() })
      .where(eq(smsPlugins.id, id));
  }
}

/** Install an SMS plugin whose endpoint will hard-fail (connection
 * refused) so the drain's catch branch runs without sending. Returns
 * a handle to uninstall it after the test. */
async function installFailingPlugin(): Promise<{ id: string; restoreIds: string[] }> {
  const restoreIds = await clearActivePlugin();
  const config: SmsPluginConfig = {
    name: "outbox-test-failing",
    version: "0.0.0",
    credentials: [],
    send: {
      endpoint: "http://127.0.0.1:1/never",
      method: "POST",
      body: { to: "{{to}}", text: "{{message}}" },
      successStatusCodes: [200],
    },
  };
  const insert: InsertSmsPlugin = {
    name: "outbox-test-failing",
    version: "0.0.0",
    pluginConfig: config,
    credentials: {},
    isActive: true,
  };
  const [plugin] = await db.insert(smsPlugins).values(insert).returning({ id: smsPlugins.id });
  return { id: plugin.id, restoreIds };
}

async function uninstallPlugin(pluginId: string, restoreIds: string[]) {
  await db.delete(smsPlugins).where(eq(smsPlugins.id, pluginId));
  await restoreActivePlugin(restoreIds);
}

async function rowsForCandidate(candId: string): Promise<SmsOutboxRow[]> {
  return db.select().from(smsOutbox).where(eq(smsOutbox.candidateId, candId));
}

async function main() {
  // Seed candidate.
  const candidateInsert: InsertCandidate = {
    fullNameEn: "OutboxTest Candidate",
    phone,
    nationalId: nid,
    classification: "smp",
    status: "awaiting_activation",
  };
  const [cand] = await db
    .insert(candidates)
    .values(candidateInsert)
    .returning({ id: candidates.id });

  const candId = cand.id;
  const dedupeKey = `outbox-test:${candId}`;
  const tokenA = generatePlainToken();

  try {
    // ─── 1. Enqueue inserts a single row with the expected payload ───────
    await enqueueActivationSms({
      candidateId: candId,
      recipientPhone: phone,
      plainToken: tokenA,
      tokenRowId: "00000000-0000-0000-0000-000000000000",
      candidateLocale: "ar",
      kind: "smp_activation",
      dedupeKey,
    });
    let rows = await rowsForCandidate(candId);
    ok(rows.length === 1, "enqueueActivationSms inserts one row");
    ok(rows[0].kind === "smp_activation", "kind is smp_activation");
    ok(rows[0].recipientPhone === phone, "recipient phone persisted");
    const payload0 = rows[0].payload as OutboxPayload;
    ok(payload0.link.includes("/activate?token="), "payload carries activation link");
    ok(payload0.locale === "ar", "payload carries candidate locale");

    // ─── 2. Dedupe — second enqueue with same key is a no-op ─────────────
    await enqueueActivationSms({
      candidateId: candId,
      recipientPhone: phone,
      plainToken: generatePlainToken(),
      tokenRowId: "00000000-0000-0000-0000-000000000001",
      candidateLocale: "ar",
      kind: "smp_activation_reissue",
      dedupeKey,
    });
    rows = await rowsForCandidate(candId);
    ok(rows.length === 1, "duplicate dedupeKey does not insert a second row");

    // ─── 3. No-plugin drain does not consume retry budget ────────────────
    const restoreIdsA = await clearActivePlugin();
    try {
      const beforeAttempts = rows[0].attempts;
      await drainSmsOutbox();
      const after = await rowsForCandidate(candId);
      ok(after[0].sentAt === null, "no plugin → row remains unsent");
      ok(after[0].deadLetterAt === null, "no plugin → row not dead-lettered");
      ok(after[0].attempts === beforeAttempts,
         `no plugin → attempts not consumed (was=${beforeAttempts}, now=${after[0].attempts})`);
      ok(after[0].lastError === "no_active_sms_plugin",
         "lastError records misconfiguration reason");
    } finally {
      await restoreActivePlugin(restoreIdsA);
    }

    // ─── 4. invalidatePendingActivationSms ───────────────────────────────
    const invalidated = await invalidatePendingActivationSms(candId);
    ok(invalidated === 1, "invalidatePendingActivationSms returns count of stamped rows");
    const afterInvalidate = await rowsForCandidate(candId);
    ok(afterInvalidate[0].deadLetterAt !== null,
       "invalidated row carries dead_letter_at");
    ok(afterInvalidate[0].lastError === "phone_change_invalidated",
       "invalidated row carries phone_change_invalidated reason");

    // ─── 5. invalidate is idempotent ─────────────────────────────────────
    const second = await invalidatePendingActivationSms(candId);
    ok(second === 0, "invalidate is idempotent (already dead-lettered → 0)");

    // ─── 6. Per-phone rate limit at drain time ──────────────────────────
    // Pre-stamp PHONE_RATE_MAX rows as already sent within the rate
    // window for `phoneRl`. Then enqueue a fresh pending row for the
    // same phone and drain. The drain MUST roll back the attempt
    // increment, leave sent_at NULL, and record lastError =
    // phone_rate_limited. Plugin is never even invoked (we install
    // a failing plugin as a tripwire — if the drain reached send, the
    // failing plugin would have set lastError = "fetch failed", not
    // phone_rate_limited).
    const ratePreSeed: string[] = [];
    for (let i = 0; i < PHONE_RATE_MAX; i++) {
      const [r] = await db.insert(smsOutbox).values({
        recipientPhone: phoneRl,
        kind: "smp_activation",
        payload: { link: "https://example.test/activate?token=rl", locale: "ar" },
        candidateId: candId,
        dedupeKey: `outbox-test:rl:preseed:${candId}:${i}`,
        sentAt: new Date(),
      }).returning({ id: smsOutbox.id });
      ratePreSeed.push(r.id);
    }
    const [rlPending] = await db.insert(smsOutbox).values({
      recipientPhone: phoneRl,
      kind: "smp_activation",
      payload: { link: "https://example.test/activate?token=rl-pending", locale: "ar" },
      candidateId: candId,
      dedupeKey: `outbox-test:rl:pending:${candId}`,
    }).returning({ id: smsOutbox.id });

    const rlPlugin = await installFailingPlugin();
    try {
      await drainSmsOutbox();
      const after = (await db
        .select()
        .from(smsOutbox)
        .where(eq(smsOutbox.id, rlPending.id)))[0];
      ok(after.sentAt === null,
         "rate limit: over-cap row not sent");
      ok(after.deadLetterAt === null,
         "rate limit: over-cap row not dead-lettered (still pending)");
      ok(after.lastError === "phone_rate_limited",
         `rate limit: lastError = phone_rate_limited (got=${after.lastError ?? "null"})`);
      ok(after.attempts === 0,
         `rate limit: attempts increment rolled back (attempts=${after.attempts})`);
    } finally {
      await uninstallPlugin(rlPlugin.id, rlPlugin.restoreIds);
      await db.delete(smsOutbox).where(inArray(smsOutbox.id, [...ratePreSeed, rlPending.id]));
    }

    // ─── 6b. Concurrent rate-limit safety ───────────────────────────────
    // Two parallel drains over a fresh batch of pending rows for the
    // SAME phone, with ZERO prior sent_at rows. Without phone-keyed
    // locking, both workers could observe count=0, count=1, ..., and
    // both proceed to send beyond PHONE_RATE_MAX. With the advisory
    // xact lock, the first PHONE_RATE_MAX sends succeed and the rest
    // are rate-limited. Use a passing plugin so sent_at actually moves.
    const concurrentRlPhone = `05${String(stamp + 50).slice(-8).padStart(8, "0")}`;
    const RL_BATCH = PHONE_RATE_MAX + 3; // extras must be rate-limited
    const concurrentRlIds: string[] = [];
    for (let i = 0; i < RL_BATCH; i++) {
      const [r] = await db.insert(smsOutbox).values({
        recipientPhone: concurrentRlPhone,
        kind: "smp_activation",
        payload: { link: "https://example.test/activate?token=crl", locale: "ar" },
        candidateId: candId,
        dedupeKey: `outbox-test:concurrent-rl:${candId}:${i}`,
      }).returning({ id: smsOutbox.id });
      concurrentRlIds.push(r.id);
    }
    // Install a passing plugin that points at an echo endpoint we
    // mock by intercepting fetch via an in-process http server.
    const http = await import("node:http");
    const okServer = http.createServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
    await new Promise<void>((r) => okServer.listen(0, "127.0.0.1", r));
    const okPort = (okServer.address() as { port: number }).port;
    const okRestore = await clearActivePlugin();
    const okConfig: SmsPluginConfig = {
      name: "outbox-test-ok",
      version: "0.0.0",
      credentials: [],
      send: {
        endpoint: `http://127.0.0.1:${okPort}/send`,
        method: "POST",
        body: { to: "{{to}}", text: "{{message}}" },
        successStatusCodes: [200],
      },
    };
    const okInsert: InsertSmsPlugin = {
      name: "outbox-test-ok",
      version: "0.0.0",
      pluginConfig: okConfig,
      credentials: {},
      isActive: true,
    };
    const [okPlugin] = await db.insert(smsPlugins).values(okInsert).returning({ id: smsPlugins.id });
    try {
      await Promise.all([drainSmsOutbox(), drainSmsOutbox()]);
      const after = await db
        .select()
        .from(smsOutbox)
        .where(inArray(smsOutbox.id, concurrentRlIds));
      const sentCount = after.filter((r) => r.sentAt !== null).length;
      const rateLimitedCount = after.filter((r) => r.lastError === "phone_rate_limited").length;
      ok(sentCount <= PHONE_RATE_MAX,
         `concurrent rate-limit: sent count never exceeds cap (sent=${sentCount}, cap=${PHONE_RATE_MAX})`);
      ok(sentCount === PHONE_RATE_MAX,
         `concurrent rate-limit: cap-many rows were sent (sent=${sentCount}, expected=${PHONE_RATE_MAX})`);
      ok(rateLimitedCount === RL_BATCH - PHONE_RATE_MAX,
         `concurrent rate-limit: extras carry phone_rate_limited (limited=${rateLimitedCount}, expected=${RL_BATCH - PHONE_RATE_MAX})`);
    } finally {
      await db.delete(smsPlugins).where(eq(smsPlugins.id, okPlugin.id));
      await restoreActivePlugin(okRestore);
      okServer.close();
      await db.delete(smsOutbox).where(inArray(smsOutbox.id, concurrentRlIds));
    }

    // ─── 7. SKIP LOCKED — drain skips rows already locked by another tx ──
    // Open a transaction holding FOR UPDATE on one specific outbox row,
    // then drain concurrently. The drain's per-row claim is FOR UPDATE
    // SKIP LOCKED, so the locked row MUST be skipped (attempts stays 0);
    // unlocked rows are claimed normally. After the holder commits, a
    // follow-up drain picks up the previously-locked row.
    const N = 4;
    const seededIds: string[] = [];
    for (let i = 0; i < N; i++) {
      const [r] = await db.insert(smsOutbox).values({
        recipientPhone: phone,
        kind: "smp_activation",
        payload: { link: "https://example.test/activate?token=x", locale: "ar" },
        candidateId: candId,
        dedupeKey: `outbox-test:skiplocked:${candId}:${i}`,
      }).returning({ id: smsOutbox.id });
      seededIds.push(r.id);
    }
    const lockedId = seededIds[0];

    const failPlugin1 = await installFailingPlugin();
    try {
      let release!: () => void;
      const releaseGate = new Promise<void>((r) => { release = r; });
      const holder = db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT id FROM sms_outbox WHERE id = ${lockedId} FOR UPDATE`,
        );
        await releaseGate;
      });

      // Give the holder a moment to acquire the lock.
      await new Promise((r) => setTimeout(r, 100));
      await drainSmsOutbox();
      release();
      await holder;

      const afterFirst = await db
        .select()
        .from(smsOutbox)
        .where(inArray(smsOutbox.id, seededIds));
      const lockedRow = afterFirst.find((r) => r.id === lockedId);
      const others = afterFirst.filter((r) => r.id !== lockedId);
      ok(lockedRow !== undefined && lockedRow.attempts === 0,
         `SKIP LOCKED: locked row was skipped (attempts=${lockedRow?.attempts ?? "missing"})`);
      ok(others.every((r) => r.attempts === 1),
         `SKIP LOCKED: unlocked rows claimed exactly once (attempts=${others.map((r) => r.attempts).join(",")})`);
      ok(others.every((r) => r.lastError !== null),
         "SKIP LOCKED: unlocked rows recorded a lastError");

      // Follow-up drain (no lock holder) now claims the previously-locked row.
      await drainSmsOutbox();
      const afterSecond = (await db
        .select()
        .from(smsOutbox)
        .where(eq(smsOutbox.id, lockedId)))[0];
      ok(afterSecond.attempts === 1,
         `SKIP LOCKED: previously-locked row is claimed by next drain (attempts=${afterSecond.attempts})`);
    } finally {
      await uninstallPlugin(failPlugin1.id, failPlugin1.restoreIds);
      await db.delete(smsOutbox).where(inArray(smsOutbox.id, seededIds));
    }

    // ─── 8. Concurrent workers — exactly-once claim semantics ──────────
    // Two parallel drainSmsOutbox() calls over a fresh batch of N rows.
    // Per-row transactional claim+process means each row's lock is held
    // through the send call, so the other worker's claim subquery skips
    // it. With a hard-failing plugin (catch branch, no decrement) and
    // attempts pre-set to 0, the only way each row ends with attempts=1
    // is if it was claimed by exactly one worker. Sum of attempts across
    // all rows must equal N — any double-claim would push that sum above
    // N (e.g. attempts=2 on at least one row).
    const M = 6;
    const concurrentIds: string[] = [];
    for (let i = 0; i < M; i++) {
      const [r] = await db.insert(smsOutbox).values({
        recipientPhone: `05${String(stamp + 100 + i).slice(-8).padStart(8, "0")}`,
        kind: "smp_activation",
        payload: { link: `https://example.test/activate?token=c${i}`, locale: "ar" },
        candidateId: candId,
        dedupeKey: `outbox-test:concurrent:${candId}:${i}`,
      }).returning({ id: smsOutbox.id });
      concurrentIds.push(r.id);
    }
    const failPlugin2 = await installFailingPlugin();
    try {
      await Promise.all([drainSmsOutbox(), drainSmsOutbox()]);
      const after = await db
        .select()
        .from(smsOutbox)
        .where(inArray(smsOutbox.id, concurrentIds));
      const overClaimed = after.filter((r) => r.attempts > 1);
      ok(overClaimed.length === 0,
         `concurrent workers: no row claimed twice (over-claimed=${overClaimed.length}/${M})`);
      const totalAttempts = after.reduce((s, r) => s + r.attempts, 0);
      ok(totalAttempts === M,
         `concurrent workers: sum of attempts equals row count (sum=${totalAttempts}, expected=${M})`);
      ok(after.every((r) => r.sentAt === null && r.deadLetterAt === null),
         "concurrent workers: failing plugin → no row marked sent or dead-lettered yet");
    } finally {
      await uninstallPlugin(failPlugin2.id, failPlugin2.restoreIds);
      await db.delete(smsOutbox).where(inArray(smsOutbox.id, concurrentIds));
    }

    // ─── 9. Dead-letter boundary: attempts > MAX_ATTEMPTS (5) ───────────
    // Spec: dead-letter fires when row.attempts (post-increment) > 5,
    // i.e. the 6th-or-later attempt. Pre-seed three rows at attempts =
    // 4, 5, 6, drain with a failing plugin. After the claim each row's
    // attempts becomes 5, 6, 7. Only attempts=5 (the 5th attempt)
    // stays pending; the others (6th and 7th) get dead-lettered.
    const dlRows: { id: string; preSeed: number }[] = [];
    for (const preSeed of [4, 5, 6]) {
      const [r] = await db.insert(smsOutbox).values({
        recipientPhone: `05${String(stamp + 900 + preSeed).slice(-8).padStart(8, "0")}`,
        kind: "smp_activation",
        payload: { link: "https://example.test/activate?token=dl", locale: "ar" },
        candidateId: candId,
        dedupeKey: `outbox-test:dl:${candId}:${preSeed}`,
        attempts: preSeed,
      }).returning({ id: smsOutbox.id });
      dlRows.push({ id: r.id, preSeed });
    }
    const failPlugin3 = await installFailingPlugin();
    try {
      // BATCH_SIZE = 25, so a single drain processes all three.
      await drainSmsOutbox();
      const after = await db
        .select()
        .from(smsOutbox)
        .where(inArray(smsOutbox.id, dlRows.map((r) => r.id)));
      const byId = new Map(after.map((r) => [r.id, r]));
      const rowAt4 = byId.get(dlRows[0].id)!;
      const rowAt5 = byId.get(dlRows[1].id)!;
      const rowAt6 = byId.get(dlRows[2].id)!;
      ok(rowAt4.deadLetterAt === null,
         `dead-letter boundary: 5th attempt (preSeed=4→5) stays pending (deadLetterAt=${rowAt4.deadLetterAt})`);
      ok(rowAt5.deadLetterAt !== null,
         `dead-letter boundary: 6th attempt (preSeed=5→6) IS dead-lettered (deadLetterAt=${rowAt5.deadLetterAt ?? "null"})`);
      ok(rowAt6.deadLetterAt !== null,
         `dead-letter boundary: 7th attempt (preSeed=6→7) IS dead-lettered (deadLetterAt=${rowAt6.deadLetterAt ?? "null"})`);
      ok(rowAt6.lastError !== null && rowAt6.lastError !== "no_active_sms_plugin",
         `dead-letter: lastError carries the failure reason (got=${rowAt6.lastError ?? "null"})`);
      ok(after.every((r) => r.sentAt === null),
         "dead-letter: no row marked sent");
    } finally {
      await uninstallPlugin(failPlugin3.id, failPlugin3.restoreIds);
      await db.delete(smsOutbox).where(inArray(smsOutbox.id, dlRows.map((r) => r.id)));
    }

    // ─── 10. Log-redaction guard: activation tokens never appear in logs ──
    // Capture stdout while a drain runs that actually invokes the SMS
    // plugin (passing local http server). The drain MUST NOT log any
    // /activate?token=<actualToken> URL anywhere — only the redacted
    // form /activate?token=*** is acceptable. This guards against any
    // future change in sendSmsViaPlugin that accidentally re-introduces
    // body logging without redaction.
    const guardPhone = `05${String(stamp + 700).slice(-8).padStart(8, "0")}`;
    const tokenLeak = `LEAK_TOKEN_${stamp}_must_never_appear_in_logs`;
    const [guardRow] = await db.insert(smsOutbox).values({
      recipientPhone: guardPhone,
      kind: "smp_activation",
      payload: {
        link: `https://example.test/activate?token=${tokenLeak}`,
        locale: "ar",
      },
      candidateId: candId,
      dedupeKey: `outbox-test:guard:${candId}`,
    }).returning({ id: smsOutbox.id });
    const httpMod = await import("node:http");
    // Echo the request URL back in the response body so the test
    // also exercises the "raw response" log path: if the sender
    // logs the response unredacted, the leak token would surface.
    // Realistic gateway behaviour: many SMS providers echo back the
    // request body (or fragments of it) in their response. If our
    // sender logs that response unredacted, the activation link
    // (which contains the plaintext token) would surface in stdout.
    const guardServer = httpMod.createServer((req, res) => {
      let bodyChunks = "";
      req.on("data", (c) => { bodyChunks += c.toString(); });
      req.on("end", () => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, echo: bodyChunks }));
      });
    });
    await new Promise<void>((r) => guardServer.listen(0, "127.0.0.1", r));
    const guardPort = (guardServer.address() as { port: number }).port;
    const guardRestore = await clearActivePlugin();
    const guardConfig: SmsPluginConfig = {
      name: "outbox-test-guard",
      version: "0.0.0",
      credentials: [],
      send: {
        endpoint: `http://127.0.0.1:${guardPort}/send`,
        method: "POST",
        body: { to: "{{to}}", text: "{{message}}" },
        successStatusCodes: [200],
      },
    };
    const guardInsert: InsertSmsPlugin = {
      name: "outbox-test-guard",
      version: "0.0.0",
      pluginConfig: guardConfig,
      credentials: {},
      isActive: true,
    };
    const [guardPlugin] = await db.insert(smsPlugins).values(guardInsert).returning({ id: smsPlugins.id });
    const captured: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => {
      captured.push(args.map((a) => typeof a === "string" ? a : JSON.stringify(a)).join(" "));
    };
    try {
      await drainSmsOutbox();
    } finally {
      console.log = origLog;
      await db.delete(smsPlugins).where(eq(smsPlugins.id, guardPlugin.id));
      await restoreActivePlugin(guardRestore);
      guardServer.close();
      await db.delete(smsOutbox).where(eq(smsOutbox.id, guardRow.id));
    }
    const allLogs = captured.join("\n");
    ok(!allLogs.includes(tokenLeak),
       `log-redaction guard: plain token never appears in logs (token leaked: ${allLogs.includes(tokenLeak)})`);
    ok(allLogs.includes("/activate?token=***"),
       "log-redaction guard: redacted placeholder DOES appear in logs (sanity check)");
  } finally {
    // Cleanup.
    await db.delete(smsOutbox).where(eq(smsOutbox.candidateId, candId));
    await db.delete(candidates).where(eq(candidates.id, candId));
  }

  console.log(`\nResult: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
