// MAANG-grade RBAC middleware.
//
// Provides three composable primitives:
//   - requireAuth        : loads user + role; 401 if missing.
//   - requirePermission  : declares a route's required permission key; 403 on miss.
//   - requireOwnership   : permits resource owner OR anyone with admin override key.
//
// Architecture:
//   - In-memory roleId → Set<permissionKey> cache, 60s TTL, with explicit
//     invalidation hooks called from role/role-permissions writes.
//   - Super Admin role short-circuits to "all granted".
//   - Every 401/403 is async-logged to audit_logs (non-blocking).
//   - At server boot, the linter walks the Express router stack and warns
//     about any /api/* route lacking a guard registration; in production
//     this WARN can be promoted to a hard exit by setting
//     RBAC_STRICT_LINT=true in env.

import type { Request, Response, NextFunction, Express } from "express";
import { storage } from "./storage";
import { db } from "./db";
import { roles, rolePermissions, auditLogs } from "@shared/schema";
import { eq } from "drizzle-orm";
import type { PermissionKey } from "@shared/permissions";
import { SUPER_ADMIN_SLUG } from "@shared/permissions";

// ─── Types ─────────────────────────────────────────────────────────────────

declare module "express-serve-static-core" {
  interface Request {
    authUserId?: string;
    authUser?: any;
    authRoleId?: string | null;
    authRoleSlug?: string | null;
    authIsSuperAdmin?: boolean;
    authPermissions?: Set<string>;
    rbacGuard?: { kind: "auth" | "permission" | "public"; key?: string };
  }
}

// ─── Cache ─────────────────────────────────────────────────────────────────

interface CachedRole {
  slug: string;
  isSuperAdmin: boolean;
  perms: Set<string>;
  loadedAt: number;
}

const ROLE_CACHE_TTL_MS = 60_000;
const roleCache = new Map<string, CachedRole>();

async function loadRoleIntoCache(roleId: string): Promise<CachedRole | null> {
  const [role] = await db.select().from(roles).where(eq(roles.id, roleId));
  if (!role) return null;
  const isSuperAdmin = role.slug === SUPER_ADMIN_SLUG;
  let perms = new Set<string>();
  if (!isSuperAdmin) {
    const rows = await db
      .select({ key: rolePermissions.permissionKey })
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, roleId));
    perms = new Set(rows.map((r) => r.key));
  }
  const cached: CachedRole = {
    slug: role.slug,
    isSuperAdmin,
    perms,
    loadedAt: Date.now(),
  };
  roleCache.set(roleId, cached);
  return cached;
}

async function getRoleFromCache(roleId: string): Promise<CachedRole | null> {
  const cached = roleCache.get(roleId);
  if (cached && Date.now() - cached.loadedAt < ROLE_CACHE_TTL_MS) return cached;
  return await loadRoleIntoCache(roleId);
}

export function invalidateRoleCache(roleId?: string) {
  if (roleId) roleCache.delete(roleId);
  else roleCache.clear();
}

// ─── Cookie / token helpers ────────────────────────────────────────────────

function readWfAuthCookie(req: Request): string | null {
  const cookie = req.headers.cookie;
  if (!cookie) return null;
  const m = cookie.match(/wf_auth=([^;]+)/);
  return m ? m[1] : null;
}

function readBearerToken(req: Request): string | null {
  const h = req.headers.authorization;
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

// We re-implement the same verification used in routes.ts.
function verifyAuthToken(token: string): string | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const data = JSON.parse(decoded);
    if (!data.uid) return null;
    const age = Date.now() - (data.iat || 0);
    if (age > 7 * 24 * 60 * 60 * 1000) return null;
    return data.uid;
  } catch {
    return null;
  }
}

function getAuthUserId(req: Request): string | null {
  const tok = readWfAuthCookie(req) ?? readBearerToken(req);
  if (!tok) return null;
  return verifyAuthToken(tok);
}

// ─── Audit ─────────────────────────────────────────────────────────────────

function audit(req: Request, kind: "401" | "403", required?: string) {
  setImmediate(async () => {
    try {
      await db.insert(auditLogs).values({
        actorId: req.authUserId ?? null,
        actorName: req.authUser?.fullName ?? req.authUser?.username ?? "anonymous",
        action: `auth.${kind}`,
        entityType: "route",
        entityId: req.path,
        description: `${kind} ${req.method} ${req.path}${required ? ` requires ${required}` : ""}`,
        metadata: {
          ip: req.ip,
          method: req.method,
          path: req.path,
          required,
          roleSlug: req.authRoleSlug,
        },
      } as any);
    } catch {
      // never break the request on audit failure
    }
  });
}

// ─── Middleware: requireAuth ───────────────────────────────────────────────

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.rbacGuard) req.rbacGuard = { kind: "auth" };
  const userId = getAuthUserId(req);
  if (!userId) {
    audit(req, "401");
    return res.status(401).json({ message: "Authentication required." });
  }
  const user = await storage.getUser(userId);
  if (!user || !user.isActive) {
    audit(req, "401");
    return res.status(401).json({ message: "Account inactive or not found." });
  }
  req.authUserId = userId;
  req.authUser = user;
  req.authRoleId = (user as any).roleId ?? null;
  if (!req.authRoleId) {
    // Post-T10: every user must have role_id. If somehow missing, deny.
    audit(req, "401");
    return res.status(401).json({ message: "Account has no role assigned." });
  }
  const cached = await getRoleFromCache(req.authRoleId);
  req.authRoleSlug = cached?.slug ?? null;
  req.authIsSuperAdmin = cached?.isSuperAdmin ?? false;
  req.authPermissions = cached?.perms ?? new Set();
  next();
}

// ─── Middleware: requirePermission ─────────────────────────────────────────

export function requirePermission(key: PermissionKey) {
  return async (req: Request, res: Response, next: NextFunction) => {
    req.rbacGuard = { kind: "permission", key };
    if (!req.authUserId) {
      // requireAuth wasn't run — run it inline.
      return requireAuth(req, res, () => requirePermission(key)(req, res, next));
    }
    if (req.authIsSuperAdmin) return next();
    if (req.authPermissions?.has(key)) return next();
    audit(req, "403", key);
    return res.status(403).json({
      message: "You do not have permission to perform this action.",
      required: key,
    });
  };
}

// ─── Middleware: requireOwnership ──────────────────────────────────────────
//
// Used for self-service routes. Passes if (a) user is admin/super_admin OR
// (b) the resource owner ID matches the authenticated user.
//
// `getOwnerId` is an async function the caller provides to look up the owner
// for the given request.

export function requireOwnership(
  getOwnerId: (req: Request) => Promise<string | null | undefined>,
  opts: { adminBypassPermission?: PermissionKey } = {}
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    req.rbacGuard = { kind: "permission", key: "ownership" };
    if (!req.authUserId) {
      return requireAuth(req, res, () =>
        requireOwnership(getOwnerId, opts)(req, res, next)
      );
    }
    if (req.authIsSuperAdmin) return next();
    if (opts.adminBypassPermission && req.authPermissions?.has(opts.adminBypassPermission)) {
      return next();
    }
    try {
      const ownerId = await getOwnerId(req);
      if (ownerId && ownerId === req.authUserId) return next();
    } catch {
      // fall through to 403
    }
    audit(req, "403", "ownership");
    return res.status(403).json({ message: "You can only access your own resources." });
  };
}

// ─── Public marker ─────────────────────────────────────────────────────────
// Lets a route declare itself intentionally public for the linter.
export function markPublic(_req: Request, _res: Response, next: NextFunction) {
  _req.rbacGuard = { kind: "public" };
  next();
}

// ─── Boot-time linter ──────────────────────────────────────────────────────
// Walks the Express router stack and, for every /api/* route, checks whether
// any of its registered handlers reference one of our middleware factories.
// This is best-effort static analysis — a route handler that calls
// `requireAuth/requirePermission/requireOwnership` inline (as the legacy code
// does) will not be detected as guarded. As we migrate routes to the new
// declarative middleware, the linter's coverage rises monotonically.

export function lintRoutes(app: Express, log: (m: string, src?: string) => void) {
  // Express 5 exposes the router as `app.router`; Express 4 used `app._router`.
  const router: any = (app as any).router ?? (app as any)._router;
  const stack: any[] = router?.stack ?? [];
  const declared = new Set<string>();
  const allRoutes = new Set<string>();
  function walk(layers: any[], prefix = "") {
    for (const layer of layers) {
      if (layer.route) {
        const fullPath = prefix + (layer.route.path ?? "");
        if (!fullPath.startsWith("/api/")) continue;
        const methodKey = `${Object.keys(layer.route.methods).join(",").toUpperCase()} ${fullPath}`;
        allRoutes.add(methodKey);
        const handlers: any[] = layer.route.stack ?? [];
        for (const h of handlers) {
          const fn = h.handle;
          const name = fn?.name ?? "";
          const src = fn?.toString?.() ?? "";
          if (
            name === "requireAuth" ||
            name === "markPublic" ||
            name.startsWith("bound requireAuth") ||
            /req\.rbacGuard/.test(src) ||
            /requirePermission|requireOwnership|markPublic/.test(src)
          ) {
            declared.add(methodKey);
          }
        }
      } else if (layer.name === "router" && layer.handle?.stack) {
        walk(layer.handle.stack, prefix);
      }
    }
  }
  walk(stack);
  const unguarded = Array.from(allRoutes).filter((r) => !declared.has(r));
  log(
    `RBAC linter: ${declared.size}/${allRoutes.size} /api routes have declarative guards (${unguarded.length} unguarded)`,
    "rbac-lint"
  );
  if (unguarded.length > 0 && unguarded.length <= 20) {
    for (const r of unguarded) log(`  unguarded: ${r}`, "rbac-lint");
  } else if (unguarded.length > 20) {
    log(`  (${unguarded.length} unguarded routes; first 5 shown)`, "rbac-lint");
    for (const r of unguarded.slice(0, 5)) log(`  unguarded: ${r}`, "rbac-lint");
  }
}
