import type { SmsPlugin, SmsPluginConfig } from "@shared/schema";

function resolvePlaceholders(template: unknown, vars: Record<string, string>): unknown {
  if (typeof template === "string") {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
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

export async function sendSmsViaPlugin(
  plugin: SmsPlugin,
  to: string,
  message: string
): Promise<SmsSendResult> {
  const config = plugin.pluginConfig as SmsPluginConfig;
  const credentials = (plugin.credentials ?? {}) as Record<string, string>;

  const vars: Record<string, string> = {
    ...credentials,
    to,
    message,
    timestamp: Date.now().toString(),
    uuid: crypto.randomUUID(),
  };

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
    console.log(`[SMS Sender] ${sendConfig.method} ${url}`);
    console.log(`[SMS Sender] Headers:`, JSON.stringify(safeHeaders));
    if (sendConfig.method !== "GET") {
      console.log(`[SMS Sender] Body:`, JSON.stringify(resolvedBody));
    }

    const response = await fetch(url, fetchOptions);
    const successCodes = sendConfig.successStatusCodes ?? [200, 201];

    const rawText = await response.text();
    console.log(`[SMS Sender] HTTP ${response.status} — raw response: ${rawText}`);
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
