import { useTranslation } from "react-i18next";
import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiRequest } from "@/lib/queryClient";

/**
 * Compact two-language switcher (Arabic / English) for headers and menus.
 * - Persists choice to localStorage (via i18next detector cache).
 * - Best-effort POST to /api/auth/locale to persist on the user record.
 *   Silently no-ops if unauthenticated.
 */
export function LanguageSwitcher({ variant = "ghost" }: { variant?: "ghost" | "outline" }) {
  const { i18n, t } = useTranslation("common");

  async function setLocale(locale: "ar" | "en") {
    if (i18n.language === locale) return;
    await i18n.changeLanguage(locale);
    try {
      await apiRequest("POST", "/api/auth/locale", { locale });
    } catch {
      /* unauthenticated visitor — ignore */
    }
  }

  const current = i18n.language?.startsWith("ar") ? "ar" : "en";
  const label = current === "ar" ? "AR" : "EN";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={variant}
          size="sm"
          className="gap-1.5"
          data-testid="button-language-switcher"
        >
          <Languages className="h-4 w-4" />
          <span className="text-xs font-semibold">{label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setLocale("ar")} data-testid="lang-ar">
          العربية {current === "ar" ? "✓" : ""}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setLocale("en")} data-testid="lang-en">
          English {current === "en" ? "✓" : ""}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
