// Helpers for resolving privacy / terms copy from the system_settings table.
//
// Operators can write the new per-locale keys (privacy_policy_ar/en,
// terms_conditions_ar/en) directly via the admin Settings page. The legacy
// combined keys (privacy_policy, terms_conditions) — where AR + EN copy was
// pasted into a single field separated by `\n---\n` — remain readable for
// back-compat: each segment is bucketed into AR or EN by sniffing the first
// 32 non-markdown characters for any Arabic codepoint.

const ARABIC_BLOCK_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

export type LocalizedCopy = { ar: string | null; en: string | null };

export function splitLegacyByLanguage(legacy: string | null | undefined): LocalizedCopy {
  const trimmedSrc = (legacy ?? "").trim();
  if (!trimmedSrc) return { ar: null, en: null };
  const segments = trimmedSrc.split(/\n---\n/);
  const arParts: string[] = [];
  const enParts: string[] = [];
  for (const seg of segments) {
    const segTrim = seg.trim();
    if (!segTrim) continue;
    const sample = segTrim.replace(/^[\s#*\->0-9.()\[\]]+/, "").trimStart().slice(0, 32);
    if (ARABIC_BLOCK_RE.test(sample)) arParts.push(segTrim);
    else enParts.push(segTrim);
  }
  return {
    ar: arParts.length ? arParts.join("\n\n") : null,
    en: enParts.length ? enParts.join("\n\n") : null,
  };
}

export function mergeWithLegacyFallback(
  newAr: string | null | undefined,
  newEn: string | null | undefined,
  legacy: string | null | undefined,
): LocalizedCopy {
  const trimmedAr = newAr?.trim() ? newAr : null;
  const trimmedEn = newEn?.trim() ? newEn : null;
  if (trimmedAr && trimmedEn) return { ar: trimmedAr, en: trimmedEn };
  const fallback = splitLegacyByLanguage(legacy);
  return {
    ar: trimmedAr ?? fallback.ar,
    en: trimmedEn ?? fallback.en,
  };
}
