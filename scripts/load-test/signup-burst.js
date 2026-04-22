// k6 load-test script for the WORKFORCE signup flow.
//
//   Run against a staging/load-test environment ONLY. The script depends on
//   the dev OTP peek endpoint (/api/_dev/last-otp/:phone), which is gated by
//   server/dev-otp-log.ts: in production the gate refuses to open unless BOTH
//   ENABLE_DEV_OTP_LOG=true AND ALLOW_DEV_BYPASS_IN_PROD=true are set, and
//   the SMS gateway is bypassed when NODE_ENV != "production". Running this
//   script is therefore a destructive operation against any environment with
//   real users — do NOT point BASE_URL at workforce.tanaqolapp.com.
//
//   Quickstart on a DigitalOcean droplet:
//
//     # 1. install k6 (Ubuntu 22.04)
//     sudo gpg -k && sudo gpg --no-default-keyring \
//       --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
//       --keyserver hkp://keyserver.ubuntu.com:80 \
//       --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
//     echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] \
//       https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
//     sudo apt update && sudo apt install k6
//
//     # 2. confirm the target is the staging/load-test box, not prod
//     export BASE_URL="https://staging.workforce.tanaqolapp.com"
//     curl -s "$BASE_URL/api/_dev/last-otp/0570000000"   # must return 200/404
//                                                         # NEVER run if 404
//                                                         # against real prod
//
//     # 3. burst (default profile = ramp to 200 VUs over 2 min, sustain 5 min)
//     k6 run --env BASE_URL="$BASE_URL" \
//            --env OFFSET=20000              \   # phone-pool starting index
//            scripts/load-test/signup-burst.js
//
//     # 4. larger burst — push toward 10k completed signups
//     k6 run --env BASE_URL="$BASE_URL" \
//            --env OFFSET=40000          \
//            --env PROFILE=stress           \   # ramp to 500 VUs / 10 min
//            scripts/load-test/signup-burst.js
//
// Tunables (all via --env):
//   BASE_URL     target host                                (required)
//   OFFSET       starting index in the synthetic phone/NID  pool (default 0)
//   PROFILE      'smoke' | 'burst' | 'stress'                (default 'burst')
//   PASSWORD     password used for every synthetic signup   (default LoadTest@2026!)

import http   from "k6/http";
import { check, sleep, fail } from "k6";
import { Trend, Counter, Rate } from "k6/metrics";
import exec   from "k6/execution";

const BASE      = __ENV.BASE_URL  || fail("BASE_URL is required");
const OFFSET    = parseInt(__ENV.OFFSET || "0", 10);
const PASSWORD  = __ENV.PASSWORD  || "LoadTest@2026!";
const PROFILE   = __ENV.PROFILE   || "burst";

const PHONE_PREFIX = "057";       // 057XXXXXXX — synthetic test pool
const NID_PREFIX   = "2900";      // 2900XXXXXX — synthetic test pool

// ─── Profiles ────────────────────────────────────────────────────────────────
// smoke   ~  100 flows total. Validates the script + bypass before scaling.
// burst   ~  6k flows.  ramp to 200 VUs / 2 min, sustain 5 min.
// stress  ~ 30k flows.  ramp to 500 VUs / 5 min, sustain 10 min.
// huge    ~ 60k flows.  ramp to 1000 VUs / 2 min, sustain 8 min.
//                       Designed to drive the 100k-candidate burst together
//                       with a parallel artillery scenario that contributes
//                       ~40k more arrivals.
const profiles = {
  smoke:  { stages: [{ duration: "30s", target:  10 }, { duration: "30s", target: 0 }] },
  burst:  { stages: [
            { duration: "2m", target: 200 },
            { duration: "5m", target: 200 },
            { duration: "1m", target:   0 },
          ] },
  stress: { stages: [
            { duration: "5m",  target: 500 },
            { duration: "10m", target: 500 },
            { duration: "2m",  target:   0 },
          ] },
  huge:   { stages: [
            { duration: "1m",  target:  200 },
            { duration: "1m",  target: 1000 },
            { duration: "8m",  target: 1000 },
            { duration: "1m",  target:    0 },
          ] },
};

if (!profiles[PROFILE]) fail(`unknown PROFILE='${PROFILE}', expected one of ${Object.keys(profiles).join(", ")}`);

export const options = {
  scenarios: {
    signup: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: profiles[PROFILE].stages,
      gracefulRampDown: "30s",
    },
  },
  // SLO targets the infra recommendation derives — failure here means the
  // chosen droplet/database tier is undersized for the burst profile.
  thresholds: {
    http_req_failed: ["rate<0.01"],          //  <1% HTTP failures
    "phase_register":          ["p(95)<3000"], // register p95 <3s
    "phase_otp_request":       ["p(95)<800"],  // otp request p95 <0.8s
    "flow_success":            ["rate>0.99"],  // >99% end-to-end success
  },
};

const tOtpReq    = new Trend("phase_otp_request", true);
const tOtpPeek   = new Trend("phase_otp_peek", true);
const tOtpVerify = new Trend("phase_otp_verify", true);
const tRegister  = new Trend("phase_register", true);
const flowOk     = new Rate("flow_success");
const flowsDone  = new Counter("flows_completed");

function pad(n, w) { return String(n).padStart(w, "0"); }

// Each VU iteration consumes one slot in the phone/NID pool. The slot is
// derived from k6's globally-unique scenario iteration counter so every
// signup across every VU gets a unique synthetic identity.
function slotIndex() { return OFFSET + exec.scenario.iterationInTest; }

function doRequest(url, body, phase) {
  const r = http.request(body ? "POST" : "GET", url, body ? JSON.stringify(body) : null, {
    headers: body ? { "Content-Type": "application/json" } : {},
    tags: { phase },
    timeout: "30s",
  });
  return r;
}

export default function () {
  const i     = slotIndex();
  const phone = PHONE_PREFIX + pad(i, 7);
  const nid   = NID_PREFIX   + pad(i, 6);
  const name  = `LoadTest k6-${i}`;

  // Phase 1 — request OTP
  let r = doRequest(`${BASE}/api/auth/otp/request`, { phone }, "otp_request");
  tOtpReq.add(r.timings.duration);
  if (!check(r, { "otp_request 200": x => x.status === 200 })) { flowOk.add(false); return; }

  // Phase 2 — peek the dev OTP. If this returns 404 you are pointed at a
  // real-prod environment. Abort the iteration so we never flood real users.
  r = doRequest(`${BASE}/api/_dev/last-otp/${phone}`, null, "otp_peek");
  tOtpPeek.add(r.timings.duration);
  if (r.status === 404) {
    fail(`dev OTP gate is closed at ${BASE}. Refusing to continue — this script must NOT run against production.`);
  }
  if (!check(r, { "otp_peek 200": x => x.status === 200 })) { flowOk.add(false); return; }
  const code = r.json("code");
  if (!code) { flowOk.add(false); return; }

  // Phase 3 — verify
  r = doRequest(`${BASE}/api/auth/otp/verify`, { phone, code }, "otp_verify");
  tOtpVerify.add(r.timings.duration);
  if (!check(r, { "otp_verify 200": x => x.status === 200 })) { flowOk.add(false); return; }
  const otpId = r.json("otpId");
  if (!otpId) { flowOk.add(false); return; }

  // Phase 4 — register (the bcrypt-bound atomic transaction)
  r = doRequest(`${BASE}/api/auth/register`, {
    fullName: name, phone, nationalId: nid, password: PASSWORD, otpId,
  }, "register");
  tRegister.add(r.timings.duration);
  const ok = check(r, { "register 201": x => x.status === 201 || x.status === 200 });
  flowOk.add(ok);
  flowsDone.add(1);

  sleep(0.1);
}

export function handleSummary(data) {
  // Print a concise human-readable summary that matches the local-burst
  // driver — easy to paste into the infra recommendation doc.
  const pick = (m, p) => {
    const v = data.metrics[m]?.values?.[`p(${p})`];
    return v == null ? "—" : `${v.toFixed(0)}ms`;
  };
  const lines = [];
  lines.push("");
  lines.push("─────────  k6 SIGNUP-BURST RESULT  ─────────");
  lines.push(`  flows completed       : ${data.metrics.flows_completed?.values?.count ?? 0}`);
  lines.push(`  flow success rate     : ${(100 * (data.metrics.flow_success?.values?.rate ?? 0)).toFixed(2)}%`);
  lines.push(`  http request failures : ${(100 * (data.metrics.http_req_failed?.values?.rate ?? 0)).toFixed(2)}%`);
  lines.push("");
  lines.push("  phase                 p50      p95      p99");
  lines.push(`  otp_request         ${pick("phase_otp_request", 50).padStart(6)}  ${pick("phase_otp_request", 95).padStart(6)}  ${pick("phase_otp_request", 99).padStart(6)}`);
  lines.push(`  otp_peek            ${pick("phase_otp_peek", 50).padStart(6)}  ${pick("phase_otp_peek", 95).padStart(6)}  ${pick("phase_otp_peek", 99).padStart(6)}`);
  lines.push(`  otp_verify          ${pick("phase_otp_verify", 50).padStart(6)}  ${pick("phase_otp_verify", 95).padStart(6)}  ${pick("phase_otp_verify", 99).padStart(6)}`);
  lines.push(`  register            ${pick("phase_register", 50).padStart(6)}  ${pick("phase_register", 95).padStart(6)}  ${pick("phase_register", 99).padStart(6)}`);
  lines.push("─────────────────────────────────────────────");
  lines.push("");
  return { stdout: lines.join("\n") + "\n" };
}
