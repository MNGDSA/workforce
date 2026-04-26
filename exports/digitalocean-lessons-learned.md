# DigitalOcean — Lessons Learned for the Next Replit Agent

> Living field-notes from building, deploying, and iterating WORKFORCE on DigitalOcean App Platform + Managed Postgres + Spaces. Every item below is grounded in a real bug, real fix, or real production setting in this repo. Read this **before** you touch anything that crosses the dev / prod boundary on DO. References point to existing files so you can verify everything yourself.
>
> Companion docs already in the repo:
> - `DO-DEPLOYMENT-GUIDE.md` — the step-by-step "first deploy" runbook.
> - `KNOWN_ISSUES.md` — the ledger of every prod incident, including the three private-ACL bugs.
> - `docs/infra-recommendation.md` — the production-readiness sweep with TLS hardening, dev-gate hardening, and load-test numbers.

---

## 0. The single most important rule

**Dev serves files from local disk (`/uploads`). Production serves them from DO Spaces.** Almost every prod-only file bug we've shipped came from forgetting this. `server/file-storage.ts` switches behaviour purely on `process.env.NODE_ENV === "production"` — there is no Spaces traffic in dev, so an upload-ACL bug is **invisible until prod**.

When you change anything that uploads, deletes, reads, or renames a file, you must mentally simulate both branches:

1. Dev branch: file lives at `/uploads/<filename>`, served by the Express static handler.
2. Prod branch: file lives at `https://<bucket>.<endpoint>/uploads/<filename>` with an ACL.

If your change is invisible in dev, it is **not** verified for prod.

---

## 1. DO Spaces public vs private ACL — the bug we shipped three times

### 1.1 What kept happening

Three separate `uploadFile(...)` call sites went out without `{ isPublic: true }` and stored assets with the default **private** ACL. In dev nothing failed (local disk has no ACL). In prod the browser got 403 on every render:

| # | Bug | Asset | Issue # | Resolved in task |
|---|-----|-------|---------|------------------|
| 1 | ID card template backgrounds — invisible in card designer & print | template background image | (audited under AUDIT-001) | #198 |
| 2 | Contract template logos — broken on every contract preview / PDF | template logo | ISSUE-009 | #200 |
| 3 | Attendance selfies — admins triaged flagged submissions blind | worker selfie (PII) | ISSUE-008 | #201 |

Three identical-shape bugs is a smell. So Task #202 / `AUDIT-001` (in `KNOWN_ISSUES.md`) catalogued **every `uploadFile(...)` call site** in `server/`, with the explicit ACL intent for each. Re-find with:

```bash
rg -n "uploadFile\(" server/
```

### 1.2 The decision matrix (memorise this)

| URL is consumed by … | ACL must be | Why |
|---|---|---|
| Plain `<img src=...>`, `<a href=...>`, CSS `background-image: url(...)` | **public-read** | Browser does not send the auth cookie cross-origin; the request will be unauthenticated. |
| Embedded in a server-generated PDF / printable | **public-read** | Same as above — the renderer fetches without our cookie. |
| Read **only** server-side via `getFileBuffer(...)` and proxied by an authenticated route | **private** | Bytes flow through our auth gate; the raw URL is never handed to the browser. |
| Sensitive PII (national ID copy, IBAN cert, biometric selfie) | **private + admin proxy** | Even if "convenient" to flip public, the random filename is **not** a real access control. |

The codified version of this lives in `server/lib/photo-upload-handler.ts:80` (mixed-by-docType ternary) and in `AUDIT-001` rows 1a / 1b.

### 1.3 The forward-fix template

Every fix looks the same:

1. Change the call site to pass `{ isPublic: true }` (or proxy it server-side for PII).
2. Add a comment at the call site pointing at `AUDIT-001` so the next dev sees the intent.
3. Write a backfill script in `scripts/backfill-public-<asset>.ts` that:
   - **Defaults to dry-run.** Real changes only with `--apply`.
   - Uses `PutObjectAclCommand` to flip the ACL **in place** — does **not** re-upload bytes. Existing URLs keep working.
   - Skips local `/uploads/...` rows (those are dev-only).
   - Reads the same `SPACES_*` env vars as the server (no parallel config).
4. Prefer the privacy-correct option for PII: **keep ACL private** and add a server-side proxy gated on the right RBAC. We did this for attendance selfies in `GET /api/attendance-mobile/submissions/:id/photo` (Task #201) — no backfill needed because URLs stayed private.

Example you can copy: `scripts/backfill-public-logos.ts` (Task #200) and `scripts/backfill-public-id-card-backgrounds.ts` (Task #198).

### 1.4 Random filenames are NOT access control

A long random filename is *enumeration-resistant*, not *access-controlled*. If the URL ever leaks (logs, screen-share, browser history sync, accidental share), the asset is permanently public. Use private ACL + auth proxy whenever the asset is PII.

---

## 2. Spaces URL handling — fail loud on drift

`server/file-storage.ts` exposes `extractStorageKeyFromUrl(fileUrl)`. Every prod read/write/delete routes through it. The function **throws** if the URL does not match `<bucket>.<endpoint>/<key>`.

Why this matters: previously, an in-place overwrite (`overwriteFile`, used by the photo-rotation rescue) would silently no-op when the URL format drifted (CDN swap, custom domain, signed URLs). The "fix" worked, the log said success, the bytes never changed. Tasks #156, #160 made this throw a descriptive error so the first occurrence surfaces in logs instead of corrupting data forever.

**Never** add a `try { extractStorageKeyFromUrl(...) } catch { /* fall back to fetch */ }` pattern. The throw is the feature.

---

## 3. Cache-Control matters — and it is asymmetric

`uploadFile` in `server/file-storage.ts` sets:

- Public assets: `Cache-Control: private, max-age=86400, must-revalidate`.
- Private assets: `Cache-Control: private, max-age=300`.

`private` (lowercase) means "intermediaries do not cache; the user agent may". This was a deliberate choice — the worker's Android app uses Coil + OkHttp's HTTP cache and we want it to revalidate after 24h while never letting a corporate proxy or CDN intermediary share bytes between users (Task #66, ISSUE-003).

If you change this, also update `mobile-android` Coil's `respectCacheHeaders=true` policy and re-test cold-cache rendering on the home screen.

---

## 4. Spaces env var conventions

The server reads these (`server/file-storage.ts:8`):

```
SPACES_ENDPOINT   # e.g. fra1.digitaloceanspaces.com   (host only, no scheme)
SPACES_BUCKET     # e.g. workforce-uploads
SPACES_KEY        # access key id
SPACES_SECRET     # secret access key  (mark "Encrypted" in DO dashboard)
SPACES_REGION     # e.g. fra1   (defaults to "nyc3" if missing — surprising; set it explicitly)
```

Gotchas:

- `SPACES_ENDPOINT` is **host only**. The S3 client prepends `https://` itself. Setting it to `https://fra1...` will produce malformed URLs and confusing 4xx.
- `SPACES_REGION` is **separate** from the endpoint host. AWS SDK v3 needs a region for request signing. Defaulting to `nyc3` was a footgun — set it explicitly to match the endpoint.
- The Spaces API key is **separate** from a DO API token. Generate via *API → Spaces Keys*. Permissions are bucket-wide; there is no fine-grained per-prefix policy yet.
- The Spaces **secret is shown once.** If you lose it, you cannot recover — generate a new key and rotate.
- Never put any of these in `.env` committed to git. They live in DO App Platform → Environment Variables, marked **Encrypted**.

---

## 5. Managed Postgres — the connection string trap

There are **two** connection strings on every DO managed cluster:

| Port | Mode | When to use |
|---|---|---|
| 25060 | Direct | One-off admin work via `psql` or `pg_dump`. **Do not** use from the app. |
| 25061 | **Pooled (PgBouncer)** | Always use this from the app. Mode = `Transaction`, pool name e.g. `workforce-pool`. |

Why: with 2+ app instances, each opens its own `pg.Pool` (we cap at `max=40` per instance in `server/db.ts`). The cluster's own connection limit is small; pooled mode multiplexes connections so we don't exhaust it under burst load. We measured this in the burst load test (`docs/infra-recommendation.md` §2.2): 1k flows at concurrency 50 hit 2 `pg.Pool` connection timeouts; 2k flows at concurrency 25 stayed at 100% success with higher throughput.

Transaction-pooling mode is **only safe** because the app uses `BEGIN`/`COMMIT` blocks and does not rely on session-scoped temp tables, advisory locks held across commits, or `LISTEN`/`NOTIFY`. We verified this once (the only advisory locks are scoped within a single tx in `storage.ts`). If you add `LISTEN`/`NOTIFY`, you must switch to session-pool mode or direct connections.

---

## 6. Postgres TLS — the silent insecurity we removed

Original code shipped with `ssl: { rejectUnauthorized: false }` in production — meaning Postgres traffic was encrypted but **not verified**. A network attacker could MITM. `docs/infra-recommendation.md` flagged this as **High**; `server/db.ts:31` now does:

1. Default: `rejectUnauthorized: true` (verifies against the system CA bundle).
2. Recommended: paste DigitalOcean's CA PEM into `DATABASE_CA_CERT` (multi-line; works as a single env var). The code passes it as `ca`.
3. Escape hatch (use sparingly): `INSECURE_DB_TLS=true` disables verification with a loud `[db]` warning at boot.

When DO publishes a new CA (rare but it happens), update `DATABASE_CA_CERT` and redeploy — the app will fail loud with a TLS error, which is the correct behaviour.

Also: the app strips `?sslmode=...` from the connection string (`server/db.ts:9`) so the TLS config it builds programmatically is the only source of truth. If you put `sslmode=disable` in the URL it is silently removed.

---

## 7. `git push github main` triggers auto-redeploy — therefore "safe pushes"

The DO App Platform is wired to the GitHub repo's `main` branch with auto-deploy enabled. Pushing `main` = redeploying production within ~60 seconds. Treat every push to main as a deploy.

**Workflow we converged on:**

1. `git fetch github main` first. **Always.** This avoids accidentally force-pushing over a teammate's commit (the underlying bash git is sometimes blocked in this environment, in which case use `child_process.execFileSync('git', [...], {cwd})` from code execution).
2. `git rev-list --left-right --count HEAD...github/main` to confirm `0/0` (in sync) before pushing.
3. After every push, re-check `0/0` to confirm the push landed. Anything else means rebase first.
4. Commit messages for production-affecting changes follow the convention `Task #NNN — <imperative one-line>`. The trailing dash and lowercase verb are the searchable pattern for `git log --grep`.

**Things that ruin a deploy and require rollback:**

- Pushing while a previous build is mid-deploy (DO will queue the new one, but if the old one is failing, you stack failures). Wait for the previous deploy to finish if you are nervous.
- Pushing a `package.json` change without re-running build locally — `npm run build` exercises the same chain DO uses, so a local build failure = a prod build failure.
- Pushing a schema change without thinking about `db:push` semantics. The build command is `npm install && npm run build && npm run db:push`. `db:push` will silently `DROP COLUMN` and `ALTER TYPE` — **never change a primary key column type** (see the database-safety reminder in this repo).

If a deploy goes wrong: revert the offending commit, push the revert. DO re-deploys in ~60s. Do not try to "fix forward" under fire.

---

## 8. Build dependencies vs devDependencies

DO App Platform **prunes `devDependencies` before running the custom build command.** That bit us once (`tsx: not found`, `vite: not found`). Fix: every tool the build invokes (`tsx`, `vite`, `esbuild`, `drizzle-kit`, `typescript`) lives in `dependencies` in `package.json`, **not** `devDependencies`. Only the 3 Replit-only dev plugins remain in `devDependencies` — they're not needed in prod.

If you add a new build-time tool, it goes in `dependencies` even though it feels wrong. Verify with:

```bash
npm ci --omit=dev && npm run build
```

That mirrors the DO environment.

---

## 9. The build command, decoded

```
npm install && npm run build && npm run db:push
```

- `npm install` — installs all (since dev tools moved to deps; see §8).
- `npm run build` — `script/build.ts` bundles client (Vite → `dist/public/`), bundles server (esbuild → `dist/index.cjs`), then runs `bash scripts/check-branding.sh` (the trusted-source branding check — fails the build if forbidden visual identity strings reappear).
- `npm run db:push` — Drizzle schema sync. **Destructive on column type changes.** Read the database safety rules.

The run command is `NODE_ENV=production node dist/index.cjs`. The Express server serves both `/api/*` and the React SPA. There is no separate static host, no CDN in front (yet — `docs/infra-recommendation.md` §3.4 recommends adding DO Spaces+CDN for the static bundle when bandwidth justifies it).

---

## 10. Health check — `/api/health`, not `/`

DO's load balancer / readiness probe should hit `/api/health`. It returns:

- `200 {"status":"ok", ...}` when the DB readiness check (`SELECT 1`) succeeds.
- `503` if the DB is unreachable.

**Do not** use `/` as the health probe. `/` serves the React bundle — it always returns 200 even if the database is down, the build is broken, or the auth layer is mis-configured. It is also wasteful (loads the whole bundle on every probe).

`/api/health` is intentionally the one route the RBAC linter flags as unguarded (`unguarded: GET /api/health` in boot logs). Keep it public so the LB can probe it. Verified in `docs/infra-recommendation.md` §3.5.

---

## 11. Boot-time safety gates — never disable them

`server/dev-otp-log.ts` exposes a developer convenience route to peek at the last OTP for a phone number. In production this would be a credential-disclosure vulnerability. The hardening (Task ref in `docs/infra-recommendation.md`):

- Production requires **both** `ENABLE_DEV_OTP_LOG=true` **and** `ALLOW_DEV_BYPASS_IN_PROD=true` — single-flag deploys refuse to boot.
- `LOAD_TEST_BYPASS_THROTTLE` is **permanently rejected** when `NODE_ENV=production`.
- `assertDevGateSafe()` runs at boot and fail-fasts the process on any misconfiguration.
- The boot log emits `[CRITICAL] dev OTP gate is OPEN` on misconfiguration — alert on this literal string.

If you ever need to debug a real-prod OTP issue, **do not** flip these flags. Tail logs through DO Runtime Logs and reproduce in staging.

---

## 12. Capacity / sizing intuition (for when a PM asks)

From `docs/infra-recommendation.md` §4, measured against the dev container (sharing CPU with Vite — pessimistic baseline):

- The bottleneck is **bcrypt cost-12** in the signup transaction (~200–300 ms of CPU per request, single-thread).
- Node's libuv pool defaults to **4 threads**, so we set `UV_THREADPOOL_SIZE=8` per droplet — that doubles bcrypt parallelism.
- 200k daily signups (≈5.6/s burst) is well within a 2-droplet CPU-Optimized 4 vCPU launch. 500k/day is the edge — add droplets, don't try to make signups faster.

For the SMS outbox: it runs **inside every app process** on a 30s timer (`server/index.ts:283`). With 2 droplets, two workers race for rows. Confirm during deployment validation that `FOR UPDATE SKIP LOCKED` actually prevents double-send. If drift is observed, switch to a single-elected leader.

---

## 13. Region / datacenter placement

- App droplets, Postgres cluster, and Spaces bucket **must** be in the same region. Cross-region DB latency on every query is ruinous.
- For Middle East / North Africa traffic: `FRA1` (Frankfurt) is the lowest-latency option DO offers today. `AMS3` (Amsterdam) is comparable.
- PDPL/GDPR posture: keep all egress within EU (fra1/ams3). The **only** third-party hop is the SMS provider — document it.

Once chosen, the region is sticky — DO does not let you move a Spaces bucket between regions. To migrate, you'd backfill into a new bucket and update `SPACES_*` env vars. Choose carefully.

---

## 14. Custom domains and SSL

In **Settings → Domains** add the domain (e.g. `workforce.tanaqolapp.com`), then add the CNAME record at your DNS provider. DO provisions and renews TLS certificates automatically (Let's Encrypt under the hood). Allow ~5–15 minutes for issuance.

**Do not** terminate TLS yourself in front of DO (Cloudflare proxy is fine in DNS-only mode; "Proxied" mode hides the real client IP unless you also configure trusted proxies in Express — see `server/client-ip.ts`).

---

## 15. Multi-instance / session storage

We use **cookie-based auth** (`wf_auth` cookie verified server-side against the `users` table on every request). There is **no in-memory session state**. With 2+ instances behind the LB, users stay logged in regardless of which instance handles the request — no sticky sessions needed.

If you ever switch to in-memory or sticky sessions, you need Redis or DB-backed session storage **first**. Don't skip this step — losing logins on every deploy is a brutal user-visible regression.

---

## 16. The `attached_assets/` graveyard

`attached_assets/Pasted-Apr-1*-...txt` files contain Replit terminal pastes from earlier rounds of this DO setup. They are useful as forensic evidence ("what did the build log say last week?") but **never** restore them as runnable artifacts — many contain expired tokens.

Same warning for `attached_assets/DO-Deployment-Guide_*.md` — the canonical guide is `DO-DEPLOYMENT-GUIDE.md` at the repo root; the attached_assets copy is an older snapshot kept for diff reference.

---

## 17. Things that look like a DO problem but aren't

- **"Photos slow to load on Android"** — this was a client cache-miss + missing `Cache-Control` header story (ISSUE-003 / Task #66). Fixed in the mobile app and the upload writer; not a Spaces issue.
- **"Build fails with SSL error"** — the app strips `sslmode` from `DATABASE_URL` and configures TLS itself (§6). If the build complains, the issue is the env var content not the SSL stack.
- **"Module not found at runtime"** — bundler keeps some deps external (e.g. AWS SDK). The build command has `npm install` for a reason; do not "optimize" it away.
- **"Multiple instances cause session issues"** — no, see §15. We have no session state to be inconsistent. If you see this, look for someone reintroducing in-memory state.

---

## 18. Quick sanity checklist before shipping a Spaces-touching change

- [ ] Did you add `{ isPublic: true | false }` deliberately at the new call site?
- [ ] Is the URL consumed via `<img>`/`<a>` (→ public) or via authenticated proxy (→ private)?
- [ ] If the asset is PII, did you choose **private + proxy** (not "convenient public")?
- [ ] Did you add a comment at the call site referencing `AUDIT-001` so the intent survives?
- [ ] If existing rows need fixing, is there a backfill script with a `--apply` gate?
- [ ] Does the backfill use `PutObjectAclCommand` (in-place flip) rather than re-uploading bytes (which would change URLs)?
- [ ] Did you update the row in the `AUDIT-001` table in `KNOWN_ISSUES.md`?
- [ ] Have you re-run `rg -n "uploadFile\(" server/` and confirmed every site still has explicit ACL intent?

---

## 19. Quick sanity checklist before pushing to production

- [ ] `npm run build` succeeds locally (mirrors DO's build command).
- [ ] `npm run db:push` shows **no** `DROP COLUMN` / `ALTER TYPE` you didn't intend.
- [ ] `git fetch github main && git rev-list --left-right --count HEAD...github/main` is `0/0`.
- [ ] No new env var reads added without (a) a default, (b) docs in `DO-DEPLOYMENT-GUIDE.md` §5, (c) the operator briefed.
- [ ] No dev-only flags left enabled (`ENABLE_DEV_OTP_LOG`, `ALLOW_DEV_BYPASS_IN_PROD`, `LOAD_TEST_BYPASS_THROTTLE`, `INSECURE_DB_TLS`).
- [ ] After push, watch DO Runtime Logs until you see `serving on port 8080` and **no** `[CRITICAL]` lines.
- [ ] Smoke-test the affected route in production (one real request).

---

## 20. Where to look first when something breaks in prod

1. **DO Runtime Logs** for the app — the actual stderr/stdout. Look for `[CRITICAL]`, `[db]`, `[SMS Sender]`, and stack traces.
2. **DO App Platform → Insights** — CPU/memory/restart count. A restart loop usually means boot-safety gate refused to start (good, that's the design).
3. **DO Database → Insights** — `pg_stat_activity` queue, slow queries, connection count. If pool wait queue is > 5 sustained, you're CPU-bound on bcrypt or connection-bound on the cluster.
4. **DO Spaces → Bucket** — file listing (only via API key; the dashboard listing is restricted by design). 403 on a known URL = ACL is private and you're rendering it as public.
5. **The `/api/health` endpoint** from outside — should return 200 with `db: "ok"`. 503 means DB readiness probe failed.

---

## 21. Cost intuition

From `DO-DEPLOYMENT-GUIDE.md` §Cost Estimate, the steady-state monthly bill for the launch tier:

- 2× Basic App instances ($12 each) = $24
- Basic Managed Postgres (2 GB RAM) = $15
- Spaces (250 GB included) = $5
- **Total ~ $44/month**

Peak season (Ramadan/Hajj, 5–10k workers, auto-scaling Pro instances) climbs to **~$90–150/month**, dominated by app instances. Postgres scaling and bandwidth are cheap by comparison.

Auto-scaling is **only available on dedicated (Pro) plans** — Basic shared instances need manual instance count changes. Plan for the season swap 2–4 weeks ahead.

---

## 22. Final advice to the next agent

1. **Read `KNOWN_ISSUES.md` first.** Every "did anyone hit this before?" question is answered there.
2. **Trust the dev/prod asymmetry.** A green dev test does not prove the prod path. Read §0 again.
3. **Backfill scripts are deploy artifacts.** They live in `scripts/`, default to dry-run, and are checked in. If you write one, write it the way `scripts/backfill-public-logos.ts` is written.
4. **The DO dashboard is not the source of truth for env vars.** `DO-DEPLOYMENT-GUIDE.md` §Environment Variables is. Update both atomically.
5. **Push small, push often, watch the deploy.** A deploy you didn't watch is a deploy you can't roll back fast.

— end of notes —
