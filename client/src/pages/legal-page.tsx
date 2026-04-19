import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Loader2, FileText, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { formatNumber } from "@/lib/format";

type PageType = "privacy" | "terms";

export default function LegalPage({ type }: { type: PageType }) {
  const { t, i18n } = useTranslation(["legal"]);
  const [, setLocation] = useLocation();
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const title = type === "privacy" ? t("legal:privacy") : t("legal:terms");
  const Icon = type === "privacy" ? Shield : FileText;

  useEffect(() => {
    fetch("/api/settings/public", { credentials: "include" })
      .then(r => r.json())
      .then(d => {
        setContent(type === "privacy" ? d.privacyPolicy : d.termsConditions);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [type]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation("/auth")}
            className="text-muted-foreground hover:text-white gap-1.5"
            data-testid="button-back-to-login"
          >
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
            {t("legal:back")}
          </Button>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-10">
        <div className="flex items-center gap-3 mb-8">
          <div className="p-2.5 rounded-sm bg-primary/10 border border-primary/20">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold text-white" data-testid="text-legal-title">{title}</h1>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : content ? (
          <div className="prose prose-invert prose-sm max-w-none" data-testid="text-legal-content">
            {content.split("\n").map((line, i) => (
              <p key={i} className={`text-muted-foreground leading-relaxed ${line.trim() === "" ? "h-4" : ""}`}>
                {line || "\u00A0"}
              </p>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Icon className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground font-medium">{t("legal:noContent")}</p>
            <p className="text-muted-foreground/60 text-sm mt-1">{t("legal:comingSoon")}</p>
          </div>
        )}
      </main>

      <footer className="border-t border-border/50 py-6">
        <p className="text-center text-xs text-muted-foreground">
          {t("legal:copyright", { year: formatNumber(new Date().getFullYear(), { useGrouping: false }) })}
        </p>
      </footer>
    </div>
  );
}
