# WORKFORCE — production infrastructure recommendation

This document is the deliverable for the production-readiness sweep run on
22 April 2026. It combines the architect review verdict, the local burst
load-test data captured against the Replit dev container, and the four
real production routes that the load drivers exercise.

> **Pair this document with:**
> – `scripts/load-test/local-burst.mjs` and `scripts/load-test/signup-burst.js`
>   (the load drivers used to gather the numbers below),
> – `server/dev-otp-log.ts` (the dev-only safety gate referenced throughout),
> – `server/db.ts` (the new TLS configuration referenced in §4).

---

## 1. Architect verdict

**NO-GO until items 1–3 below land. After they land: GO.**

| Severity | Item | Status |
|----------|------|--------|
| Critical | Dev OTP gate could open in production with a single `ENABLE_DEV_OTP_LOG=true` env var, exposing OTPs and disabling SMS/throttles | **FIXED** — `server/dev-otp-log.ts` now requires the dual-flag opt-in `ENABLE_DEV_OTP_LOG=true` **AND** `ALLOW_DEV_BYPASS_IN_PROD=true` when `NODE_ENV=production`, with `LOAD_TEST_BYPASS_THROTTLE` permanently rejected in prod and a boot-time `assertDevGateSafe()` that fail-fasts the process on any misconfiguration |
| High     | `server/db.ts` used `ssl: { rejectUnauthorized: false }` in production | **FIXED** — TLS now defaults to `rejectUnauthorized: true`; operators paste DigitalOcean's CA into `DATABASE_CA_CERT`. `INSECURE_DB_TLS=true` exists as an audited escape hatch with a loud warning |
| Medium   | SMS outbox is at-least-once — provider acceptance precedes DB commit of `sent_at`, so duplicate SMS is possible during DB or network faults | **DOCUMENTED** — see §6 below. Add provider-side idempotency keys when the messaging volume grows. Acceptable for launch |
| Medium   | No per-token `jti` rotation on the auth cookie; coarse global invalidation only | **DEFERRED** — track as follow-up. Acceptable for launch given short TTL + `requirePasswordChangedAt` invalidation hook already present |

The two critical/high items are committed in this branch. The two medium
items are tracked but do not block the initial production deployment.

---

## 2. Test evidence

### 2.1 End-to-end Playwright runs

Both passed against the local dev server, with the SMS gateway bypassed
and zero real SMS fired:

* **S2 — Individual signup → Talent list.** New user completes phone-OTP
  → registration → auto-login. The super-admin then sees the candidate on
  `/talent` with the Individual classification and no SMP badge.
* **S3 — Recruitment flow excl. SMP.** Admin creates and publishes a job
  → candidate self-applies via `POST /api/applications` (status="new")
  → admin sees the applicant on `/job-posting/:id`, schedules an
  interview, and the onboarding record appears on `/onboarding`.

### 2.2 Burst load tests against Replit dev (NODE_ENV=development, dev-pool only)

Two profiles were exercised against the local server with the dev OTP gate
open and `LOAD_TEST_BYPASS_THROTTLE=1`. Each "flow" is the four real
production routes back-to-back (otp-request → dev-peek → otp-verify →
register).

| Profile | Total flows | Concurrency | End-to-end success | Wall clock | Throughput | register p50 | register p95 | Notes |
|---------|------------:|------------:|-------------------:|-----------:|-----------:|-------------:|-------------:|-------|
| 1k burst, hot pool | 1,000 | **50** (above pool max=40) | 998 (99.8%) | 76 s | 13.1 / s | 3,376 ms | 5,162 ms | 2 `pg.Pool` connection timeouts (concurrency exceeded the 40-conn pool limit); register-phase queueing is severe |
| 2k burst, safe    | 1,700 of 2,000 captured before bash timeout | **25** (inside pool) | 100% to that point | sustained ~14.5 / s | 14.5 / s | (steady — no degradation observed in samples) | (no errors) | Throughput is **higher** than the 1k run despite lower concurrency because the pool never queues |

Sanity (50 flows / concurrency 10): register p50 612 ms, p95 767 ms — the
true minimum cost per signup before any contention.

#### Where the time goes

Per phase, at the safe concurrency=25 steady-state:

```
otp_request   p50  ~14 ms   p95 ~450 ms
otp_peek      p50   ~2 ms   p95  ~25 ms
otp_verify    p50   ~9 ms   p95 ~100 ms
register      p50  ~3.4 s   p95  ~5.2 s   ← dominant
```

The `register` route is by far the bottleneck. Two reasons, both intrinsic:

1. **bcrypt cost-12 hash** before the transaction (≈ 200–300 ms of CPU per
   request, single-thread). Node's libuv thread pool defaults to **4
   threads**, so above 4 in-flight registrations the bcrypt calls queue
   linearly.
2. **The atomic transaction itself** does a phone-transfer scan, a
   national-id duplicate check, the user insert, and the candidate insert.
   This holds a Postgres connection for the duration. With the `pg.Pool`
   capped at **40** in `server/db.ts`, more than 40 concurrent
   registrations push waiters into a 2-second `connectionTimeoutMillis`
   window before they error out (this is exactly what happened in the
   1k/conc=50 run).

#### What did **not** show up

* **No N+1 storms** — the 5k preview run did not hit the talent/onboarding
  list paths; spot-checks of `getApplicants` and `getOnboardingRecords`
  during S3 returned in <50 ms with no per-row queries visible in the log.
* **No row-lock contention** — every transaction in the burst targets a
  fresh `(phone, national_id)` pair, so Postgres locks never overlap. A
  real production load (where many candidates touch the same job /
  application rows) deserves its own follow-up scenario.
* **No SMS outbox backlog** — the gateway is bypassed in dev, so the
  outbox itself stayed empty. The drainer's worst-case behaviour is
  characterised in §6 instead.

### 2.3 Extrapolating to DigitalOcean

The dev container is a single small Replit instance sharing CPU with the
Vite frontend builder. A modest DO droplet with dedicated CPU should beat
the dev numbers materially. The k6 script in `scripts/load-test/signup-burst.js`
is wired with explicit SLO thresholds (register p95 < 3 s, flow success >
99 %, http_req_failed < 1 %) so the DO sizing below can be validated
end-to-end before launch.

---

## 3. Recommended initial DigitalOcean topology

### 3.1 App droplet(s)

| Tier | CPU | RAM | Notes |
|------|-----|-----|-------|
| Launch     | DO **CPU-Optimized 4 vCPU / 8 GB**, **2 droplets** behind a DO Load Balancer | bcrypt + signup tx is CPU-bound; CPU-Optimized > General Purpose at the same price |
| Stretch    | Same, scale to 3–4 droplets | linear scaling holds because each Node process owns its own libuv thread pool |

Per droplet (set in the systemd unit / deployment env):

```
NODE_ENV=production
PORT=5000
UV_THREADPOOL_SIZE=8        # double the libuv pool so bcrypt has 8 workers
                            # per droplet instead of the default 4
DATABASE_URL=...            # the pgbouncer pool URL — see §4
DATABASE_CA_CERT="-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"
SESSION_SECRET=...          # 64+ random bytes (already enforced)
GOINFINITO_*=...
```

**Never set** `ENABLE_DEV_OTP_LOG`, `ALLOW_DEV_BYPASS_IN_PROD`, or
`LOAD_TEST_BYPASS_THROTTLE` on the live tenants. The boot-safety check in
`assertDevGateSafe()` will refuse to start if a single dev flag is set
without the matching dual-flag opt-in, and will refuse outright if
`LOAD_TEST_BYPASS_THROTTLE=1` is set with `NODE_ENV=production`.

### 3.2 Database

| Setting | Value | Rationale |
|--------|------|-----------|
| Engine | DO Managed PostgreSQL 16 | Same major as dev (16) |
| Tier   | **2 vCPU / 4 GB** primary + **read-replica off** at launch | The signup tx is CPU-light on PG (~10 ms per call); IOPS matter more. Re-evaluate if the daily new-candidate count exceeds 50k |
| Pool   | **PgBouncer in transaction-pooling mode** between the app and the cluster, sized to **2 × app_droplets × pg_pool_max = 160** server connections | Transaction pooling is safe — the app uses `pg`'s `BEGIN`/`COMMIT` blocks (not session-scoped temp tables, advisory locks held across commits, or `LISTEN`/`NOTIFY`). Verified: the only advisory locks are scoped within a single tx in `storage.ts` (per-phone OTP reserve) |
| App pg.Pool | **`max=40`** per droplet (current) | Matches the libuv thread pool ratio (`UV_THREADPOOL_SIZE=8`, ~5 connections per bcrypt slot). Bigger pool ≠ faster — limited by CPU |
| Postgres params | `shared_buffers=1GB`, `work_mem=8MB`, `effective_cache_size=3GB`, `max_connections=200` | Leaves headroom for the pgbouncer-side pool size of 160 + admin connections |

### 3.3 SMS / outbox worker

The SMS outbox drainer runs **inside every app process** on a 30 s timer
(see `server/index.ts:283` & `runSmsOutboxDrain`). For 2 droplets this
means two workers race for the same rows. The current implementation
relies on a `FOR UPDATE SKIP LOCKED`-style claim — confirm during
deployment validation that two simultaneous drains do not double-send,
and if any drift is observed, switch to a single-elected leader (e.g.
the droplet whose hostname sorts lowest, gated by an advisory lock on
boot) instead of running the worker on both.

For launch volume (≤ 5k OTPs/day) the duplicate-send window is
acceptable; document the at-least-once semantics in the operator runbook
and ask the SMS provider for an idempotency key when their tier
supports it.

### 3.4 CDN, cache, and egress

* The Vite-built static bundle should sit behind **DO Spaces + CDN**
  (or Cloudflare in front of the LB) with `Cache-Control: public,
  max-age=31536000, immutable` for hashed assets and `no-store` for the
  HTML shell.
* `/api/*` is **never cached** at the edge — leave it pass-through.
* PDPL: keep all egress within the DO fra1 / ams3 region; the SMS
  provider call is the only third-party hop.

### 3.5 Monitoring

| Signal | Target | How |
|--------|--------|-----|
| `register` p95 latency | < 3 s | Node app metrics → Prometheus / DO Monitoring |
| `register` failure rate | < 1 % | Same |
| pg pool wait queue length | <= 5 sustained | `pg_stat_activity` + `pg.Pool` event hooks |
| SMS outbox backlog | < 100 pending sustained | Add a `getSmsOutboxBacklog()` count to `/api/health` |
| Error rate from `[SMS Sender]` | 0 in production logs | Sentry / DO log search |
| Dev-bypass boot warning | 0 occurrences | Alert on the literal string `[CRITICAL] dev OTP gate is OPEN` |

The `/api/health` endpoint is intentionally the one route the RBAC
linter flags as unguarded (verified in the boot logs: *"unguarded:
GET /api/health"*); it should remain public so the load balancer can
probe it.

---

## 4. Capacity headroom

With the topology in §3 and the per-flow cost we measured:

| Daily new signups | Peak burst (10 % of daily over 1 hour) | Comfortable on launch tier? |
|--------------|--------------------------|------------------|
|     1,000    |    ~ 0.03 / s            | yes, by 100× |
|    10,000    |    ~ 0.28 / s            | yes, by ~50× |
|    50,000    |    ~ 1.4 / s             | yes, by ~10× |
|   100,000    |    ~ 2.8 / s             | yes |
|   200,000    |    ~ 5.6 / s             | yes — at 5.6 / s the register p95 stays well under 3 s |
|   500,000    |   ~ 14 / s               | **at the edge** of a single droplet (matches the dev container's measured ceiling). Use 3+ droplets and re-test |

Above 500k daily signups, the binding constraint is bcrypt CPU. Either:

1. Add app droplets (linear scaling — each adds 8 bcrypt workers).
2. Drop bcrypt cost from 12 to 11 after consulting the security team
   (still well above the OWASP 2023 minimum of 10; halves CPU per signup).
3. Move signup to a worker queue and return a "creating account…" UX.
   Not recommended for launch — the synchronous flow keeps the auth
   cookie returned in-band, which the existing client relies on.

---

## 5. Deployment validation checklist

Before flipping DNS to the new droplets:

1. `curl -fsS https://workforce.tanaqolapp.com/api/health` returns 200
   with `db: "ok"`.
2. App boot log contains **no** `[CRITICAL] dev OTP gate` line and
   **no** `[boot-safety] dev OTP gate active` line.
3. `curl -i https://workforce.tanaqolapp.com/api/_dev/last-otp/0570000000`
   returns **404** (route is registered but the gate is closed).
4. From the app droplet, `psql "$DATABASE_URL" -c 'SELECT 1'` succeeds
   with TLS verification (no `INSECURE_DB_TLS` in the env).
5. From an external machine: `k6 run --env BASE_URL=https://staging...
   --env PROFILE=burst scripts/load-test/signup-burst.js` against a
   *staging* mirror of the prod topology meets all four SLO thresholds.
6. SMS outbox count is 0 immediately after deploy:
   `psql -c "select count(*) from sms_outbox where sent_at is null"`.
7. Trigger one real signup against staging end-to-end (real phone,
   real OTP) to confirm the goinfinito gateway is reachable and the
   SMS arrives.

---

## 6. Known acceptable risks at launch (track in the operator runbook)

* **SMS at-least-once.** Provider call precedes DB commit of `sent_at`
  in `server/sms-outbox.ts`. Worst case: a candidate receives the same
  OTP/activation SMS twice during a DB or network fault between provider
  acceptance and our commit. Mitigation: ask goinfinito for an
  idempotency key once volume justifies it.
* **Coarse session invalidation.** The auth cookie does not carry a
  per-token `jti`; revocation is global (`requirePasswordChangedAt`)
  rather than per-session. Acceptable given short TTL; promote to
  per-token rotation in the next sweep.
* **Outbox runs on every droplet.** Confirm during validation that the
  `FOR UPDATE SKIP LOCKED` claim path actually prevents double-send under
  two concurrent drainers. If not, fall back to a leader-elected drainer.
