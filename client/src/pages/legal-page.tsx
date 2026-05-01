import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Loader2, FileText, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { formatNumber } from "@/lib/format";

type PageType = "privacy" | "terms";

const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

function isArabicBlock(text: string): boolean {
  const trimmed = text.replace(/^[\s#*\->0-9.()\[\]]+/, "").trimStart();
  const sample = trimmed.slice(0, 32);
  return ARABIC_RE.test(sample);
}

function renderInline(text: string, keyBase: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(
      <strong key={`${keyBase}-b-${i++}`} className="font-semibold text-white">
        {m[1]}
      </strong>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

type Block =
  | { kind: "h1" | "h2" | "h3"; text: string }
  | { kind: "p"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "hr" };

function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  let ul: string[] | null = null;
  let ol: string[] | null = null;

  const flushPara = () => {
    if (para.length) {
      blocks.push({ kind: "p", text: para.join(" ") });
      para = [];
    }
  };
  const flushList = () => {
    if (ul) {
      blocks.push({ kind: "ul", items: ul });
      ul = null;
    }
    if (ol) {
      blocks.push({ kind: "ol", items: ol });
      ol = null;
    }
  };
  const flushAll = () => {
    flushPara();
    flushList();
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.trim() === "") {
      flushAll();
      continue;
    }
    if (line.trim() === "---") {
      flushAll();
      blocks.push({ kind: "hr" });
      continue;
    }
    let mh = /^(#{1,3})\s+(.*)$/.exec(line);
    if (mh) {
      flushAll();
      const level = mh[1].length;
      blocks.push({ kind: (level === 1 ? "h1" : level === 2 ? "h2" : "h3"), text: mh[2] });
      continue;
    }
    let mu = /^\s*[-*]\s+(.*)$/.exec(line);
    if (mu) {
      flushPara();
      if (ol) flushList();
      if (!ul) ul = [];
      ul.push(mu[1]);
      continue;
    }
    let mo = /^\s*\d+\.\s+(.*)$/.exec(line);
    if (mo) {
      flushPara();
      if (ul) flushList();
      if (!ol) ol = [];
      ol.push(mo[1]);
      continue;
    }
    flushList();
    para.push(line.trim());
  }
  flushAll();
  return blocks;
}

function renderBlocks(blocks: Block[]): ReactNode {
  return blocks.map((b, i) => {
    const k = `b-${i}`;
    switch (b.kind) {
      case "hr":
        return <hr key={k} className="my-8 border-border/50" />;
      case "h1":
        return (
          <h1 key={k} className="text-2xl font-display font-bold text-white mt-8 mb-4">
            {renderInline(b.text, k)}
          </h1>
        );
      case "h2":
        return (
          <h2 key={k} className="text-xl font-display font-semibold text-white mt-6 mb-3">
            {renderInline(b.text, k)}
          </h2>
        );
      case "h3":
        return (
          <h3 key={k} className="text-base font-semibold text-white mt-4 mb-2">
            {renderInline(b.text, k)}
          </h3>
        );
      case "p":
        return (
          <p key={k} className="text-muted-foreground leading-relaxed my-3">
            {renderInline(b.text, k)}
          </p>
        );
      case "ul":
        return (
          <ul key={k} className="list-disc ps-6 my-3 space-y-1.5 text-muted-foreground">
            {b.items.map((it, j) => (
              <li key={`${k}-${j}`} className="leading-relaxed">{renderInline(it, `${k}-${j}`)}</li>
            ))}
          </ul>
        );
      case "ol":
        return (
          <ol key={k} className="list-decimal ps-6 my-3 space-y-1.5 text-muted-foreground">
            {b.items.map((it, j) => (
              <li key={`${k}-${j}`} className="leading-relaxed">{renderInline(it, `${k}-${j}`)}</li>
            ))}
          </ol>
        );
    }
  });
}

function renderContent(content: string): ReactNode {
  const segments = content.split(/\n---\n/);
  return segments.map((segment, i) => {
    const dir = isArabicBlock(segment) ? "rtl" : "ltr";
    const blocks = parseMarkdown(segment);
    return (
      <div key={`seg-${i}`} dir={dir} className={i > 0 ? "mt-10 pt-10 border-t border-border/50" : ""}>
        {renderBlocks(blocks)}
      </div>
    );
  });
}

export default function LegalPage({ type }: { type: PageType }) {
  const { t } = useTranslation(["legal"]);
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
        ) : content && content.trim() ? (
          <div className="prose prose-invert prose-sm max-w-none" data-testid="text-legal-content">
            {renderContent(content)}
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
