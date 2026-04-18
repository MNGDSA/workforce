import type { Request } from "express";
import { db } from "./db";
import { auditLogs } from "@shared/schema";

const WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_MS = 30 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const MAX_BUCKETS = 50_000;

interface Bucket {
  attempts: number[];
  lockedUntil: number;
}

const ipBuckets = new Map<string, Bucket>();
const idBuckets = new Map<string, Bucket>();

function getClientIp(req: Request): string {
  // DO App Platform / typical reverse proxy: the load balancer APPENDS the
  // real client IP to any client-supplied X-Forwarded-For. So the rightmost
  // entry is the only one we trust. Taking the leftmost would let an attacker
  // pre-poison the header to rotate fake IPs and bypass the limiter.
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) {
    const parts = xff.split(",");
    return parts[parts.length - 1]!.trim();
  }
  return req.ip ?? "unknown";
}

function sanitizeIdentifierForLog(id: string): string {
  // Audit metadata is human-readable. Users sometimes mistype passwords into
  // the username field; we don't want that ending up in audit_logs in plain
  // text. Keep first 3 chars + length, drop the rest.
  if (!id) return "(empty)";
  const head = id.slice(0, 3);
  return `${head}***[len=${id.length}]`;
}

function normalizeIdentifier(raw: unknown): string {
  return String(raw ?? "").trim().toLowerCase();
}

function prune(bucket: Bucket, now: number): void {
  const cutoff = now - WINDOW_MS;
  while (bucket.attempts.length > 0 && bucket.attempts[0]! < cutoff) {
    bucket.attempts.shift();
  }
}

function checkBucket(map: Map<string, Bucket>, key: string, now: number): { locked: boolean; retryAfterSec: number } {
  const b = map.get(key);
  if (!b) return { locked: false, retryAfterSec: 0 };
  if (b.lockedUntil > now) {
    return { locked: true, retryAfterSec: Math.ceil((b.lockedUntil - now) / 1000) };
  }
  prune(b, now);
  return { locked: false, retryAfterSec: 0 };
}

function recordFailure(map: Map<string, Bucket>, key: string, now: number): { lockedNow: boolean } {
  let b = map.get(key);
  if (!b) {
    if (map.size >= MAX_BUCKETS) {
      // Hard cap to bound memory under flood of unique IPs/identifiers.
      // Drop one arbitrary entry (insertion order via Map iteration) to make room.
      const firstKey = map.keys().next().value;
      if (firstKey !== undefined) map.delete(firstKey);
    }
    b = { attempts: [], lockedUntil: 0 };
    map.set(key, b);
  }
  prune(b, now);
  b.attempts.push(now);
  if (b.attempts.length >= MAX_ATTEMPTS && b.lockedUntil <= now) {
    b.lockedUntil = now + LOCKOUT_MS;
    return { lockedNow: true };
  }
  return { lockedNow: false };
}

function auditLockout(req: Request, scope: "ip" | "identifier", value: string, identifier: string): void {
  setImmediate(async () => {
    try {
      await db.insert(auditLogs).values({
        actorId: null,
        actorName: "anonymous",
        action: "auth.login_lockout",
        entityType: "auth",
        entityId: scope,
        description: `Login lockout (${scope}) for ${LOCKOUT_MS / 60000} min after ${MAX_ATTEMPTS} failed attempts`,
        metadata: {
          scope,
          value: scope === "identifier" ? sanitizeIdentifierForLog(value) : value,
          identifier: sanitizeIdentifierForLog(identifier),
          ip: getClientIp(req),
          windowMin: WINDOW_MS / 60000,
          lockoutMin: LOCKOUT_MS / 60000,
        },
      } as any);
    } catch {
      // never break login on audit failure
    }
  });
}

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSec: number;
  reason?: "ip_locked" | "identifier_locked";
}

export function checkLoginRateLimit(req: Request, identifierRaw: unknown): RateLimitDecision {
  const now = Date.now();
  const ip = getClientIp(req);
  const id = normalizeIdentifier(identifierRaw);

  const ipCheck = checkBucket(ipBuckets, ip, now);
  if (ipCheck.locked) {
    return { allowed: false, retryAfterSec: ipCheck.retryAfterSec, reason: "ip_locked" };
  }
  if (id) {
    const idCheck = checkBucket(idBuckets, id, now);
    if (idCheck.locked) {
      return { allowed: false, retryAfterSec: idCheck.retryAfterSec, reason: "identifier_locked" };
    }
  }
  return { allowed: true, retryAfterSec: 0 };
}

export function recordLoginFailure(req: Request, identifierRaw: unknown): void {
  const now = Date.now();
  const ip = getClientIp(req);
  const id = normalizeIdentifier(identifierRaw);

  const ipResult = recordFailure(ipBuckets, ip, now);
  if (ipResult.lockedNow) auditLockout(req, "ip", ip, id);

  if (id) {
    const idResult = recordFailure(idBuckets, id, now);
    if (idResult.lockedNow) auditLockout(req, "identifier", id, id);
  }
}

export function recordLoginSuccess(req: Request, identifierRaw: unknown): void {
  const ip = getClientIp(req);
  const id = normalizeIdentifier(identifierRaw);
  ipBuckets.delete(ip);
  if (id) idBuckets.delete(id);
}

setInterval(() => {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  ipBuckets.forEach((b, k) => {
    if (b.lockedUntil <= now && (b.attempts.length === 0 || b.attempts[b.attempts.length - 1]! < cutoff)) {
      ipBuckets.delete(k);
    }
  });
  idBuckets.forEach((b, k) => {
    if (b.lockedUntil <= now && (b.attempts.length === 0 || b.attempts[b.attempts.length - 1]! < cutoff)) {
      idBuckets.delete(k);
    }
  });
}, SWEEP_INTERVAL_MS).unref();

export const __testing = { ipBuckets, idBuckets, WINDOW_MS, LOCKOUT_MS, MAX_ATTEMPTS };
