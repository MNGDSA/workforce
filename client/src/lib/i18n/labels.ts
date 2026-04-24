import type { TFunction } from "i18next";

export function regionLabel(
  t: TFunction,
  region: string | null | undefined,
): string {
  if (!region) return "";
  return t(`common:regionsKsa.${region}`, { defaultValue: region });
}

export function cityLabel(
  t: TFunction,
  city: string | null | undefined,
): string {
  if (!city) return "";
  return t(`profileSetup:cities.${city}`, { defaultValue: city });
}
