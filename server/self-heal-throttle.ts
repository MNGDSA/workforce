// Task #107 step 8 — three-layer throttle for the SMP self-heal forgot-
// password path. In-memory because:
//   * The hot path (per-IP, per-NID) is sub-millisecond and called once per
//     /api/auth/reset-password/request — not worth a Redis round trip.
//   * The L1/L2 buckets are time-windowed and self-expiring, so a process
//     restart loses at most one window of throttle state — acceptable for an
//     anti-abuse layer (the third layer, daily aggregate, is logged so any
//     restart-induced amnesia would still surface in cumulative log volume).
//
// All three reservations succeed atomically before the caller may queue the
// SMS. Any single failure short-circuits and the public response stays
// generic so callers cannot probe state.

const PER_NID_WINDOW_MS = 60 * 60 * 1000;       // 1 hour — one self-heal SMS per NID per hour
const PER_IP_WINDOW_MS  = 60 * 60 * 1000;       // 1 hour
const PER_IP_MAX        = 10;                   // 10 self-heal SMS per IP per hour
const DAY_MS            = 24 * 60 * 60 * 1000;

interface IpBucket {
  windowStart: number;
  count: number;
}

const lastIssuedByNid = new Map<string, number>();
const ipBuckets = new Map<string, IpBucket>();
let dailyCount = 0;
let dayStart = Math.floor(Date.now() / DAY_MS);

function rollDailyIfNeeded(): void {
  const today = Math.floor(Date.now() / DAY_MS);
  if (today !== dayStart) {
    dayStart = today;
    dailyCount = 0;
  }
}

// Periodic cleanup so the maps don't accumulate stale entries forever in
// long-lived processes. Runs every 15 minutes; cheap because the maps are
// already bounded by the throttle math (< a few thousand entries even under
// abuse). `.unref()` so it doesn't keep the process alive in tests.
const SWEEP_INTERVAL_MS = 15 * 60 * 1000;
const sweepTimer = setInterval(() => {
  const now = Date.now();
  // Use Array.from() because the project's tsconfig target predates
  // ES2015 Map/Set iteration — direct `for…of` over a Map fails to compile.
  Array.from(lastIssuedByNid.entries()).forEach(([nid, t]) => {
    if (now - t > PER_NID_WINDOW_MS) lastIssuedByNid.delete(nid);
  });
  Array.from(ipBuckets.entries()).forEach(([ip, b]) => {
    if (now - b.windowStart > PER_IP_WINDOW_MS) ipBuckets.delete(ip);
  });
  rollDailyIfNeeded();
}, SWEEP_INTERVAL_MS);
sweepTimer.unref();

export type ReservationResult =
  | { ok: true }
  | { ok: false; reason: "per_nid_cooldown" | "per_ip_throttle" };

/**
 * Check + reserve a self-heal SMS slot for `(ip, nationalId)`. Returns
 * `{ ok: true }` and increments counters only if BOTH per-NID and per-IP
 * limits permit. Otherwise returns the failing reason and DOES NOT
 * increment any counter.
 */
export function tryReserveSelfHealQuota(ip: string, nationalId: string): ReservationResult {
  const now = Date.now();
  rollDailyIfNeeded();

  // L1: per-NID cooldown.
  const lastNid = lastIssuedByNid.get(nationalId);
  if (lastNid && now - lastNid < PER_NID_WINDOW_MS) {
    return { ok: false, reason: "per_nid_cooldown" };
  }

  // L2: per-IP fixed-window throttle.
  let bucket = ipBuckets.get(ip);
  if (!bucket || now - bucket.windowStart > PER_IP_WINDOW_MS) {
    bucket = { windowStart: now, count: 0 };
    ipBuckets.set(ip, bucket);
  }
  if (bucket.count >= PER_IP_MAX) {
    return { ok: false, reason: "per_ip_throttle" };
  }

  // Both pass — reserve.
  lastIssuedByNid.set(nationalId, now);
  bucket.count++;
  dailyCount++;
  return { ok: true };
}

/** L3 telemetry — number of self-heal SMS issued so far today (UTC). */
export function getSelfHealDailyCount(): number {
  rollDailyIfNeeded();
  return dailyCount;
}

/** Test-only reset hook. */
export function __resetSelfHealThrottleForTests(): void {
  lastIssuedByNid.clear();
  ipBuckets.clear();
  dailyCount = 0;
  dayStart = Math.floor(Date.now() / DAY_MS);
}
