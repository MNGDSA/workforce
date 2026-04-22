# Workforce signup load-test toolkit

Two drivers, both exercising the same four real production routes:

```
POST /api/auth/otp/request   → generate + persist OTP + enqueue SMS
GET  /api/_dev/last-otp/:p   → fetch the plaintext code (dev-only)
POST /api/auth/otp/verify    → mark OTP verified, returns otpId
POST /api/auth/register      → atomic user+candidate creation in a transaction
```

**Both drivers depend on the dev OTP gate being open.** That gate
(`server/dev-otp-log.ts:devGateOpen()`) refuses to open in any
`NODE_ENV=production` process unless the operator explicitly sets
**both** `ENABLE_DEV_OTP_LOG=true` and `ALLOW_DEV_BYPASS_IN_PROD=true`.
Use those flags only on a dedicated staging/preview deployment that no
real users hit. Running either driver against the live tenants would
flood the SMS gateway, burn real OTPs and consume real PDPL identifiers.

---

## 1. `local-burst.mjs` — Replit dev / localhost driver

A single-file Node 20 driver. No dependencies beyond the Node standard
library. Reports throughput, end-to-end success rate, per-phase latency
percentiles (p50/p95/p99/max) and a sample of error messages.

### Prepare the dev server

The OTP/IP throttle bypass must be enabled so the burst is not
immediately rate-limited:

```bash
LOAD_TEST_BYPASS_THROTTLE=1 npm run dev
```

Boot logs should show:

```
[boot-safety] dev OTP gate active: NODE_ENV=development, LOAD_TEST_BYPASS_THROTTLE=1.
              /api/_dev/last-otp/:phone is reachable; SMS sender skips real gateway calls.
```

### Run

```bash
# 50 flows — sanity check, ~5s
node scripts/load-test/local-burst.mjs --total 50 --concurrency 10

# 1k flows — single-droplet steady state, ~80s
node scripts/load-test/local-burst.mjs --total 1000 --concurrency 50 --offset 1000

# 5k flows — sustained burst, ~5 min
node scripts/load-test/local-burst.mjs --total 5000 --concurrency 30 --offset 5000

# 10k flows — large burst, ~10 min
node scripts/load-test/local-burst.mjs --total 10000 --concurrency 30 --offset 20000
```

### Flags

| Flag             | Default                  | Notes |
|------------------|--------------------------|-------|
| `--total`        | `1000`                   | Number of full signup flows to run |
| `--concurrency`  | `50`                     | Parallel flows in flight at any moment |
| `--offset`       | `0`                      | Starting index in the synthetic pool — bump between back-to-back runs to avoid phone/NID collisions |
| `--base`         | `http://localhost:5000`  | Server under test |

### Synthetic identifiers

Phones use the `057XXXXXXX` slot, NIDs use the `2900XXXXXX` slot. Both are
deliberately far from any real Saudi Arabia mobile range / national ID
range so test rows can be deleted by prefix:

```sql
DELETE FROM candidates WHERE phone LIKE '057%';
DELETE FROM users      WHERE national_id LIKE '2900%';
```

---

## 2. `signup-burst.js` — k6 script for DigitalOcean staging

Same four-phase flow, packaged for [k6](https://k6.io). Use this for any
test driven from outside the Replit dev container — DO droplets, GitHub
Actions runners, etc. The script refuses to continue if the dev OTP peek
endpoint returns 404, so it cannot accidentally hit production.

### Install k6 on Ubuntu 22.04

```bash
sudo gpg -k && sudo gpg --no-default-keyring \
  --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 \
  --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] \
  https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt update && sudo apt install k6
```

### Pre-flight check (mandatory)

```bash
export BASE_URL="https://staging.workforce.tanaqolapp.com"
curl -fsS "$BASE_URL/api/_dev/last-otp/0570000000" || \
  echo "REFUSE TO RUN — dev gate is closed; this is a real-prod environment."
```

### Profiles

| Profile  | Ramp           | Sustained VUs | Approx. flows | Use when |
|----------|----------------|---------------|---------------|----------|
| `smoke`  | 30s up + down  |  10           |  ~100         | first run on a new env |
| `burst`  | 2 min ramp     | 200           |  ~6k          | normal seasonal-onboarding day |
| `stress` | 5 min ramp     | 500           | ~30k          | peak day + surge buffer |

### Run

```bash
# burst (default)
k6 run --env BASE_URL="$BASE_URL" --env OFFSET=20000 \
       scripts/load-test/signup-burst.js

# stress
k6 run --env BASE_URL="$BASE_URL" --env OFFSET=40000 --env PROFILE=stress \
       scripts/load-test/signup-burst.js
```

### Built-in SLO thresholds

The script fails the run if any of these are violated:

* `http_req_failed < 1%`
* `phase_register p95 < 3s`
* `phase_otp_request p95 < 800ms`
* `flow_success > 99%`

Failures here indicate that the chosen droplet / managed-PG tier cannot
absorb the burst — see `docs/infra-recommendation.md` for sizing.

---

## Cleanup after a load-test run

```sql
-- one transaction per prefix is fine; table sizes never get large
BEGIN;
DELETE FROM otp_verifications WHERE phone LIKE '057%';
DELETE FROM candidates        WHERE phone LIKE '057%' OR national_id LIKE '2900%';
DELETE FROM users             WHERE national_id LIKE '2900%';
COMMIT;
```
