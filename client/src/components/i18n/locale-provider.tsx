import { useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { setHtmlDirAttr } from "@/lib/i18n";

/**
 * Mounts i18next and keeps the <html lang> and <html dir> attributes
 * synced with the active locale. Wraps the entire app at the root.
 */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();

  useEffect(() => {
    setHtmlDirAttr(i18n.language);
  }, [i18n.language]);

  return <>{children}</>;
}
