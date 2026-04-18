export function toProxiedFileUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  const m = /\/(uploads\/[^?#]+)/.exec(rawUrl);
  if (!m) return rawUrl;
  return `/api/files/${m[1]}`;
}
