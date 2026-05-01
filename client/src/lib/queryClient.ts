import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { LOCALE_STORAGE_KEY, DEFAULT_LOCALE } from "@/lib/i18n";
import { throwIfResNotOk } from "@/lib/api-error";

export { ApiError, isApiError, getApiErrorMessage } from "@/lib/api-error";

/**
 * Reads the active locale from localStorage and produces an Accept-Language
 * header value. Defaults to the project default (Arabic). The server reads
 * this and resolves localized 4xx/5xx messages.
 */
function localeHeader(): Record<string, string> {
  try {
    const stored = (typeof window !== "undefined" && window.localStorage)
      ? window.localStorage.getItem(LOCALE_STORAGE_KEY)
      : null;
    return { "Accept-Language": stored || DEFAULT_LOCALE };
  } catch {
    return { "Accept-Language": DEFAULT_LOCALE };
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: {
      ...(data ? { "Content-Type": "application/json" } : {}),
      ...localeHeader(),
    },
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
      headers: { ...localeHeader() },
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
