import type { Request, Response, NextFunction } from "express";

declare module "express-serve-static-core" {
  interface Request {
    locale?: "ar" | "en";
  }
}

const SUPPORTED = ["ar", "en"] as const;
type Locale = (typeof SUPPORTED)[number];

function parseAcceptLanguage(header?: string): Locale | null {
  if (!header) return null;
  const tags = header
    .split(",")
    .map((s) => s.trim().split(";")[0].toLowerCase());
  for (const t of tags) {
    if (t.startsWith("ar")) return "ar";
    if (t.startsWith("en")) return "en";
  }
  return null;
}

/**
 * Resolves the request locale from (in priority order):
 * 1. Explicit `?lang=ar|en` query param.
 * 2. `X-Locale` request header.
 * 3. Authenticated user's stored locale (req.authUserLocale, set later by auth middleware).
 * 4. `Accept-Language` header.
 * 5. Default: "ar".
 */
export function localeMiddleware(req: Request, _res: Response, next: NextFunction) {
  const q = (req.query.lang as string | undefined)?.toLowerCase();
  if (q === "ar" || q === "en") {
    req.locale = q;
    return next();
  }
  const xLocale = (req.headers["x-locale"] as string | undefined)?.toLowerCase();
  if (xLocale === "ar" || xLocale === "en") {
    req.locale = xLocale;
    return next();
  }
  // Future: pull from authenticated user's locale column once exposed on req.
  const accept = parseAcceptLanguage(req.headers["accept-language"]);
  req.locale = accept ?? "ar";
  next();
}
