// Task #276 — Structured API error type.
//
// `apiRequest` (and `getQueryFn`) historically signalled non-2xx responses
// by throwing a plain `Error` whose `message` was hand-formatted as
// `${status}: ${responseBodyText}`. Consumers that wanted to react to a
// specific status or pull a structured JSON body back out had to re-parse
// that string, which is fragile (any future tweak to the format silently
// breaks them).
//
// `ApiError` keeps the status, the raw body text, and — when the body
// parses as JSON — the parsed payload available as first-class fields,
// so consumers can read `err.status` / `err.body` directly without text
// scraping. The legacy `${status}: ${text}` `message` is preserved so
// existing toast / log paths that surface `err.message` are unchanged.

export class ApiError extends Error {
  readonly status: number;
  readonly statusText: string;
  /**
   * Parsed JSON body when the response was JSON; the raw text body when
   * it wasn't; `null` when the body was empty.
   */
  readonly body: unknown;
  /** The unparsed response body, always preserved for fallback display. */
  readonly bodyText: string;

  constructor(status: number, statusText: string, bodyText: string, body: unknown) {
    super(`${status}: ${bodyText || statusText}`);
    this.name = "ApiError";
    this.status = status;
    this.statusText = statusText;
    this.bodyText = bodyText;
    this.body = body;
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

/**
 * Read the response body once, attempt to JSON-parse it, and throw an
 * `ApiError` when the status is non-2xx. Mirrors the previous
 * `throwIfResNotOk` behaviour but exposes structured fields on the error.
 */
export async function throwIfResNotOk(res: Response): Promise<void> {
  if (res.ok) return;
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  throw new ApiError(res.status, res.statusText, text || res.statusText, body);
}

/**
 * Best-effort friendly message extraction. Prefers `body.message` from a
 * JSON error payload (the shape our auth routes return), then falls back
 * to the raw body text, then the generic fallback. Used by call-sites
 * that previously regex-scraped `err.message` to pull `"message":"…"`
 * back out of the formatted string.
 */
export function getApiErrorMessage(err: unknown, fallback: string): string {
  if (isApiError(err)) {
    if (err.body && typeof err.body === "object") {
      const m = (err.body as { message?: unknown }).message;
      if (typeof m === "string" && m.trim()) return m;
    }
    if (err.bodyText && err.bodyText.trim()) return err.bodyText;
    return err.statusText || fallback;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
