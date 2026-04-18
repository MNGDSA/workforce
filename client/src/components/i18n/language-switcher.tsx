import { useTranslation } from "react-i18next";
import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";

/**
 * Compact two-language toggle (Arabic / English).
 * Shows the OPPOSITE language label (so on AR pages it says "EN" and vice-versa)
 * and switches directly on click — no dropdown.
 */
export function LanguageSwitcher({ variant = "ghost" }: { variant?: "ghost" | "outline" }) {
  const { i18n } = useTranslation("common");

  const current = i18n.language?.startsWith("ar") ? "ar" : "en";
  const next: "ar" | "en" = current === "ar" ? "en" : "ar";
  const label = next === "ar" ? "AR" : "EN";

  async function toggle() {
    await i18n.changeLanguage(next);
    try {
      await apiRequest("POST", "/api/auth/locale", { locale: next });
    } catch {
      /* unauthenticated visitor — ignore */
    }
  }

  return (
    <Button
      variant={variant}
      size="sm"
      className="gap-1.5"
      onClick={toggle}
      data-testid="button-language-switcher"
      aria-label={`Switch to ${label}`}
    >
      <Languages className="h-4 w-4" />
      <span className="text-xs font-semibold">{label}</span>
    </Button>
  );
}
