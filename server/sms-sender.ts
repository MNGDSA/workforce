import type { SmsPlugin, SmsPluginConfig } from "@shared/schema";
import { toE164SaPhone } from "@shared/phone";

type VarMap = Record<string, string | number>;

function resolvePlaceholders(template: unknown, vars: VarMap): unknown {
  if (typeof template === "string") {
    // If the entire string is a single {{variable}} reference, return the
    // variable's native type (number or string) so JSON fields stay typed.
    const singleRef = template.match(/^\{\{(\w+)\}\}$/);
    if (singleRef) {
      const val = vars[singleRef[1]];
      return val !== undefined ? val : template;
    }
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) =>
      vars[key] !== undefined ? String(vars[key]) : `{{${key}}}`
    );
  }
  if (Array.isArray(template)) {
    return template.map((v) => resolvePlaceholders(v, vars));
  }
  if (template !== null && typeof template === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(template as Record<string, unknown>)) {
      result[resolvePlaceholders(k, vars) as string] = resolvePlaceholders(v, vars);
    }
    return result;
  }
  return template;
}

function getValueAtPath(obj: unknown, path: string): string | undefined {
  if (!path || obj === null || obj === undefined) return undefined;
  const parts = path.split(".");
  let current: unknown = obj;
  for (const p of parts) {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      const idx = parseInt(p, 10);
      current = isNaN(idx) ? undefined : current[idx];
    } else if (typeof current === "object") {
      current = (current as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  if (current === undefined || current === null) return undefined;
  return typeof current === "string" ? current : JSON.stringify(current);
}

function parseUrlEncodedResponse(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const pair of text.split("&")) {
    const eqIdx = pair.indexOf("=");
    if (eqIdx === -1) continue;
    const key = decodeURIComponent(pair.slice(0, eqIdx).replace(/\+/g, " "));
    const val = decodeURIComponent(pair.slice(eqIdx + 1).replace(/\+/g, " "));
    result[key] = val;
  }
  return result;
}

export interface SmsSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  statusCode?: number;
  rawResponse?: unknown;
}

export function validatePluginConfig(raw: unknown): { valid: true; config: SmsPluginConfig } | { valid: false; error: string } {
  if (!raw || typeof raw !== "object") return { valid: false, error: "Plugin must be a JSON object." };
  const obj = raw as Record<string, unknown>;

  if (!obj.name || typeof obj.name !== "string") return { valid: false, error: "Missing required field: name" };
  if (!obj.version || typeof obj.version !== "string") return { valid: false, error: "Missing required field: version" };
  if (!Array.isArray(obj.credentials)) return { valid: false, error: "Missing required field: credentials (must be an array)" };
  if (!obj.send || typeof obj.send !== "object") return { valid: false, error: "Missing required field: send" };

  const send = obj.send as Record<string, unknown>;
  if (!send.endpoint || typeof send.endpoint !== "string") return { valid: false, error: "Missing send.endpoint" };
  if (!send.method || !["POST", "GET", "PUT"].includes(send.method as string)) return { valid: false, error: "send.method must be POST, GET, or PUT" };
  if (!Array.isArray(send.successStatusCodes) || send.successStatusCodes.length === 0) return { valid: false, error: "send.successStatusCodes must be a non-empty array of numbers" };

  for (const cred of obj.credentials as unknown[]) {
    if (!cred || typeof cred !== "object") return { valid: false, error: "Each credential must be an object" };
    const c = cred as Record<string, unknown>;
    if (!c.key || typeof c.key !== "string") return { valid: false, error: "Each credential must have a key (string)" };
    if (!c.label || typeof c.label !== "string") return { valid: false, error: "Each credential must have a label (string)" };
    if (!["text", "secret"].includes(c.type as string)) return { valid: false, error: `Credential '${c.key}' type must be 'text' or 'secret'` };
  }

  return { valid: true, config: raw as SmsPluginConfig };
}

/**
 * Returns true if the message contains characters outside the GSM-7 basic
 * character set. Arabic, emoji, and most non-Latin scripts trigger this.
 */
function requiresUnicode(text: string): boolean {
  // GSM-7 basic charset + extension table (common characters only)
  const gsm7 = new Set([
    ...'@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\x1BÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ`¿abcdefghijklmnopqrstuvwxyzäöñüà',
  ]);
  return [...text].some((ch) => !gsm7.has(ch));
}

export async function sendSmsViaPlugin(
  plugin: SmsPlugin,
  to: string,
  message: string
): Promise<SmsSendResult> {
  // ───────────────────────────────────────────────────────────────────────
  // Dev/test bypass — when the SMS gateway is unreachable (carrier or
  // gateway outage), skip the HTTP call entirely and return success so
  // OTP/activation flows complete locally. The plaintext code is already
  // logged via logOtpForDev() at the call site, so the developer can copy
  // it from the workflow log.
  //
  // SECURITY: same allow-list contract as logOtpForDev — only fires when
  // NODE_ENV is exactly "development" or "test", or when the explicit
  // ENABLE_DEV_OTP_LOG=true override is set. Any production deployment
  // (NODE_ENV=production, unset, "prod", "Production", etc.) falls
  // through to the real gateway. Fail-closed by design.
  // ───────────────────────────────────────────────────────────────────────
  const env = process.env.NODE_ENV;
  const explicitOverride = process.env.ENABLE_DEV_OTP_LOG === "true";
  const inDevOrTest = env === "development" || env === "test";
  if (inDevOrTest || explicitOverride) {
    const toE164Bypass = toE164SaPhone(to);
    console.log(`[SMS Sender] DEV BYPASS — skipping gateway "${plugin.name ?? "unknown"}" for to=${toE164Bypass}. Code/message available in [DEV-OTP] log line above.`);
    return {
      success: true,
      messageId: `dev-bypass-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      statusCode: 200,
      rawResponse: { devBypass: true, gateway: plugin.name ?? null, to: toE164Bypass },
    };
  }

  const config = plugin.pluginConfig as SmsPluginConfig;
  const credentials = (plugin.credentials ?? {}) as Record<string, string>;

  const isUnicode = requiresUnicode(message);

  // International SMS gateways (e.g. GoInfinito) accept local-format Saudi
  // numbers syntactically (HTTP 200 + status:Success) but the SMSC silently
  // drops them — the carrier never receives the message. Convert to E.164
  // (`966XXXXXXXXX`, no "+") at the sender boundary so the canonical DB
  // format (`05XXXXXXXX`) stays intact for display.
  const toE164 = toE164SaPhone(to);

  const vars: VarMap = {
    ...credentials,
    to: toE164,
    message,
    timestamp: Date.now().toString(),
    uuid: crypto.randomUUID(),
    // Encoding helpers — reference these in your plugin config body:
    //   {{unicode}}   → "1" for Arabic/non-Latin, "0" for plain text
    //   {{encoding}}  → "unicode" | "gsm7"
    //   {{charset}}   → "UCS2" | "GSM7"
    //   {{coding}}    → always 8 (UCS-2); GoInfinito v2 only accepts 8, and UCS-2
    //                   handles both Arabic and Latin safely in Saudi Arabia deployments
    unicode:  isUnicode ? "1" : "0",
    encoding: isUnicode ? "unicode" : "gsm7",
    charset:  isUnicode ? "UCS2" : "GSM7",
    coding:   "8",
  };

  if (isUnicode) {
    console.log("[SMS Sender] Non-GSM-7 characters detected — using Unicode encoding");
  }

  const sendConfig = config.send;
  const endpoint = (sendConfig.endpoint ?? "").replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
  const headers = resolvePlaceholders(sendConfig.headers ?? {}, vars) as Record<string, string>;
  const resolvedBody = resolvePlaceholders(sendConfig.body ?? {}, vars);
  const resolvedQueryParams = resolvePlaceholders(sendConfig.queryParams ?? {}, vars) as Record<string, string>;

  let url = endpoint;
  const qsEntries = Object.entries(resolvedQueryParams).filter(([, v]) => v !== "");
  if (qsEntries.length > 0) {
    url += "?" + new URLSearchParams(Object.fromEntries(qsEntries)).toString();
  }

  try {
    const defaultHeaders: Record<string, string> = {};
    if (sendConfig.method !== "GET") {
      defaultHeaders["Content-Type"] = "application/json";
    }

    const finalHeaders = { ...defaultHeaders, ...headers };
    const fetchOptions: RequestInit = {
      method: sendConfig.method,
      headers: finalHeaders,
    };
    if (sendConfig.method !== "GET") {
      fetchOptions.body = JSON.stringify(resolvedBody);
    }

    const safeHeaders = Object.fromEntries(
      Object.entries(finalHeaders).map(([k, v]) =>
        k.toLowerCase().includes("password") || k.toLowerCase().includes("auth") || k.toLowerCase().includes("token")
          ? [k, "***"]
          : [k, v]
      )
    );
    // Redact activation tokens (and any /activate?token=... URLs) from
    // logs. Task #107 contract: the plaintext token only ever exists
    // on the candidate's phone — never in server logs, never in the
    // DB. The redaction is also defence-in-depth against any future
    // SMS payload that happens to embed a credential-like value.
    const redactStr = (s: string): string =>
      s
        // /activate?token=<...> in path or query (any field name token=)
        .replace(/(\btoken=)[^\s"&'<>]+/gi, "$1***")
        // any /activate/<rawToken> path style (defence-in-depth)
        .replace(/(\/activate\/)[A-Za-z0-9_\-\.]+/gi, "$1***");
    const redact = (v: unknown): unknown => {
      if (typeof v === "string") return redactStr(v);
      if (Array.isArray(v)) return v.map(redact);
      if (v && typeof v === "object") {
        return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, vv]) => [k, redact(vv)]));
      }
      return v;
    };
    console.log(`[SMS Sender] ${sendConfig.method} ${redactStr(url)}`);
    console.log(`[SMS Sender] Headers:`, JSON.stringify(safeHeaders));
    if (sendConfig.method !== "GET") {
      console.log(`[SMS Sender] Body:`, JSON.stringify(redact(resolvedBody)));
    }

    const response = await fetch(url, fetchOptions);
    const successCodes = sendConfig.successStatusCodes ?? [200, 201];

    const rawText = await response.text();
    console.log(`[SMS Sender] HTTP ${response.status} — raw response: ${redactStr(rawText)}`);
    let responseData: unknown;

    const ct = response.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      try { responseData = JSON.parse(rawText); } catch { responseData = rawText; }
    } else {
      try { responseData = JSON.parse(rawText); } catch {
        if (rawText.includes("=") && rawText.includes("&")) {
          responseData = parseUrlEncodedResponse(rawText);
        } else {
          responseData = rawText;
        }
      }
    }

    const httpOk = successCodes.includes(response.status);

    let bodyOk = true;
    if (sendConfig.responseSuccessField && sendConfig.responseSuccessValue) {
      const fieldVal = getValueAtPath(responseData, sendConfig.responseSuccessField);
      bodyOk = fieldVal === sendConfig.responseSuccessValue;
    } else if (sendConfig.responseSuccessField && !sendConfig.responseSuccessValue) {
      const fieldVal = getValueAtPath(responseData, sendConfig.responseSuccessField);
      bodyOk = fieldVal === "0" || fieldVal?.toLowerCase() === "success" || fieldVal?.toLowerCase() === "ok";
    }

    let partialError: string | undefined;
    if (httpOk && bodyOk && sendConfig.responsePartialErrorPath) {
      const errorsVal = getValueAtPath(responseData, sendConfig.responsePartialErrorPath);
      if (errorsVal && errorsVal !== "[]" && errorsVal !== "null") {
        try {
          const errArray = JSON.parse(errorsVal);
          if (Array.isArray(errArray) && errArray.length > 0) {
            const first = errArray[0] as Record<string, unknown>;
            partialError = (first.errortext ?? first.errorMessage ?? JSON.stringify(first)) as string;
          }
        } catch {
          partialError = errorsVal;
        }
      }
    }

    if (httpOk && bodyOk && !partialError) {
      const messageId = sendConfig.responseMessageIdPath
        ? getValueAtPath(responseData, sendConfig.responseMessageIdPath)
        : undefined;
      return { success: true, messageId, statusCode: response.status, rawResponse: responseData };
    } else {
      const errorMsg = sendConfig.responseErrorPath
        ? getValueAtPath(responseData, sendConfig.responseErrorPath)
        : undefined;
      return {
        success: false,
        error: partialError ?? errorMsg ?? `HTTP ${response.status}`,
        statusCode: response.status,
        rawResponse: responseData,
      };
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
