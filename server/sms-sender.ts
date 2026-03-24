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
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[p];
  }
  if (current === undefined || current === null) return undefined;
  return typeof current === "string" ? current : JSON.stringify(current);
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

  const vars: Record<string, string> = { ...credentials, to, message };

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
    const fetchOptions: RequestInit = {
      method: sendConfig.method,
      headers: { "Content-Type": "application/json", ...headers },
    };
    if (sendConfig.method !== "GET") {
      fetchOptions.body = JSON.stringify(resolvedBody);
    }

    const response = await fetch(url, fetchOptions);
    const successCodes = sendConfig.successStatusCodes ?? [200, 201];

    let responseData: unknown;
    const ct = response.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      responseData = await response.json();
    } else {
      responseData = await response.text();
    }

    if (successCodes.includes(response.status)) {
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
        error: errorMsg ?? `HTTP ${response.status}`,
        statusCode: response.status,
        rawResponse: responseData,
      };
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
