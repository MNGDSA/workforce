import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  MapPin,
  Banknote,
  CalendarDays,
  Briefcase,
  Clock,
  CheckCircle2,
  Loader2,
  Share2,
  Tag,
  Link as LinkIcon,
  LogIn,
  UserPlus,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import ApplyJobDialog from "@/components/apply-job-dialog";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { formatNumber } from "@/lib/format";

type JobPosting = {
  id: string;
  title: string;
  description?: string;
  requirements?: string;
  location?: string;
  region?: string;
  department?: string;
  type: string;
  salaryMin?: string;
  salaryMax?: string;
  status: string;
  deadline?: string;
  skills?: string[];
};

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t, i18n } = useTranslation(["apply", "common"]);
  const isRtl = i18n.language?.startsWith("ar");
  const StartArrow = isRtl ? ArrowRight : ArrowLeft;
  const [applyOpen, setApplyOpen] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const candidateId: string | undefined = (() => {
    try { return JSON.parse(localStorage.getItem("workforce_candidate") || "{}").id; } catch { return undefined; }
  })();

  const isLoggedIn = !!candidateId;

  const { data: job, isLoading, isError } = useQuery<JobPosting>({
    queryKey: ["/api/jobs", params.id],
    queryFn: () => apiRequest("GET", `/api/jobs/${params.id}`).then((r) => r.json()),
    enabled: !!params.id,
  });

  const { data: myApplications = [], refetch: refetchApplications } = useQuery<{ jobId: string }[]>({
    queryKey: ["/api/applications/mine", candidateId],
    queryFn: () =>
      apiRequest("GET", `/api/applications?candidateId=${candidateId}`).then((r) => r.json()),
    enabled: !!candidateId && isLoggedIn,
    staleTime: 0,
    refetchOnMount: true,
  });
  const applied = myApplications.some((a) => a.jobId === params.id);

  function handleCopyLink() {
    navigator.clipboard.writeText(window.location.href);
    setLinkCopied(true);
    toast({ title: t("common:actions.linkCopied"), description: t("common:actions.linkCopiedDescription") });
    setTimeout(() => setLinkCopied(false), 2000);
  }

  function handleWhatsAppShare() {
    if (!job) return;
    const text = `${job.title}${job.region ? ` — ${job.region}` : ""}\n\n${window.location.href}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  }

  function handleApplyClick() {
    if (isLoggedIn) {
      setApplyOpen(true);
    } else {
      setLocation(`/auth?tab=signup&returnTo=${encodeURIComponent(`/jobs/${params.id}`)}`);
    }
  }

  function typeLabel(type: string) {
    return t(`apply:types.${type}`, { defaultValue: type });
  }

  function salaryLabel(j: JobPosting) {
    const min = j.salaryMin ? parseFloat(j.salaryMin) : null;
    const max = j.salaryMax ? parseFloat(j.salaryMax) : null;
    if (min && max) return t("apply:details.salaryRangeMonth", { min: formatNumber(min, i18n.language), max: formatNumber(max, i18n.language) });
    if (min) return t("apply:details.salaryFromMonth", { min: formatNumber(min, i18n.language) });
    return null;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !job) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="h-14 border-b border-border px-4 lg:px-8 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <img src="/workforce-logo.svg" alt="Workforce" className="h-7 w-7" />
            <span className="font-display font-bold text-lg tracking-tight text-white">{t("common:app.name")}</span>
          </div>
          <LanguageSwitcher />
        </header>
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8">
          <Briefcase className="h-14 w-14 text-muted-foreground/30" />
          <p className="text-white font-bold text-xl" data-testid="text-job-not-found">{t("apply:hero.notFound")}</p>
          <p className="text-muted-foreground text-sm">{t("apply:hero.notFoundDescription")}</p>
          {isLoggedIn ? (
            <Button onClick={() => setLocation("/candidate-portal")} variant="outline" className="border-border mt-2" data-testid="button-back-portal">
              {t("apply:header.backPortal")}
            </Button>
          ) : (
            <Button onClick={() => setLocation("/auth")} variant="outline" className="border-border mt-2" data-testid="button-go-login">
              {t("apply:header.signIn")}
            </Button>
          )}
        </div>
      </div>
    );
  }

  const salary = salaryLabel(job);
  const displayTitle = job.title;
  const subtitle: string | undefined = undefined;

  return (
    <div className="min-h-screen bg-background font-sans text-foreground flex flex-col">

      <header className="sticky top-0 z-50 h-14 bg-background/90 backdrop-blur-md border-b border-border px-4 lg:px-8 flex items-center justify-between">
        {isLoggedIn ? (
          <button
            type="button"
            onClick={() => setLocation("/candidate-portal")}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-white transition-colors"
            data-testid="button-back"
          >
            <StartArrow className="h-4 w-4" />
            {t("apply:header.back")}
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <img src="/workforce-logo.svg" alt="Workforce" className="h-7 w-7" />
            <span className="font-display font-bold text-lg tracking-tight text-white">{t("common:app.name")}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <LanguageSwitcher />
          <Button
            variant="ghost"
            size="icon"
            onClick={handleCopyLink}
            className="text-muted-foreground hover:text-white"
            data-testid="button-copy-link"
            title={t("common:actions.copyLink")}
          >
            {linkCopied ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <LinkIcon className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleWhatsAppShare}
            className="text-muted-foreground hover:text-green-500"
            data-testid="button-share-whatsapp"
            title={t("common:actions.shareWhatsApp")}
          >
            <WhatsAppIcon className="h-4 w-4" />
          </Button>
          {isLoggedIn ? (
            !applied ? (
              <Button
                className="bg-primary text-primary-foreground font-bold h-9 px-5 text-sm"
                onClick={handleApplyClick}
                data-testid="button-apply-header"
              >
                {t("apply:cta.applyHeader")}
              </Button>
            ) : (
              <Button variant="outline" disabled className="border-emerald-500/40 text-emerald-500 bg-emerald-500/10 font-bold h-9 px-5 text-sm">
                <CheckCircle2 className="me-1.5 h-3.5 w-3.5" /> {t("apply:cta.applied")}
              </Button>
            )
          ) : (
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation("/auth")}
                className="text-muted-foreground hover:text-white text-sm h-9"
                data-testid="button-login"
              >
                <LogIn className="h-3.5 w-3.5 me-1.5" />
                {t("auth:tabs.login", { defaultValue: "Login", ns: "auth" })}
              </Button>
              <Button
                className="bg-primary text-primary-foreground font-bold h-9 px-5 text-sm"
                onClick={handleApplyClick}
                data-testid="button-apply-header"
              >
                {t("apply:cta.applyHeader")}
              </Button>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-3xl w-full mx-auto px-4 lg:px-8 py-8 space-y-8 animate-in fade-in duration-500 flex-1">

        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="border-primary/40 text-primary bg-primary/10 font-semibold">
              {typeLabel(job.type)}
            </Badge>
            {job.department && (
              <Badge variant="outline" className="border-border text-muted-foreground font-normal">
                {job.department}
              </Badge>
            )}
            <Badge
              variant="outline"
              className={
                job.status === "active"
                  ? "border-emerald-500/30 text-emerald-500 bg-emerald-500/10"
                  : "border-border text-muted-foreground"
              }
            >
              {job.status === "active" ? t("apply:hero.acceptingApplications") : job.status}
            </Badge>
          </div>

          <h1 className="font-display text-3xl lg:text-4xl font-bold text-white leading-tight" data-testid="text-job-title">
            <bdi>{displayTitle}</bdi>
          </h1>
          {subtitle && (
            <p className="text-xl text-muted-foreground font-medium" dir="auto"><bdi>{subtitle}</bdi></p>
          )}

          <div className="flex flex-wrap gap-x-6 gap-y-3 pt-1">
            {(job.region ?? job.location) && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4 text-primary/70 shrink-0" />
                <span><bdi>{job.region ?? job.location}</bdi></span>
              </div>
            )}
            {salary && (
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <Banknote className="h-4 w-4 text-primary/70 shrink-0" />
                <span><bdi>{salary}</bdi></span>
              </div>
            )}
            {job.deadline && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CalendarDays className="h-4 w-4 text-primary/70 shrink-0" />
                <span>{t("apply:details.deadlineApplyBy", { date: job.deadline })}</span>
              </div>
            )}
          </div>
        </div>

        {!applied ? (
          <div className="flex gap-3 items-center">
            <Button
              className="bg-primary text-primary-foreground font-bold px-8 h-11 shadow-[0_0_20px_rgba(25,90,55,0.3)] hover:shadow-[0_0_30px_rgba(25,90,55,0.5)] transition-all"
              onClick={handleApplyClick}
              data-testid="button-apply-main"
            >
              {isLoggedIn ? t("apply:cta.applyMain") : (
                <><UserPlus className="h-4 w-4 me-2" /> {t("apply:cta.signUpAndApply")}</>
              )}
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-3 p-4 rounded-md bg-emerald-500/10 border border-emerald-500/25">
            <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-400">{t("apply:cta.appSubmitted")}</p>
              <p className="text-xs text-emerald-600 mt-0.5">{t("apply:cta.appSubmittedDesc")}</p>
            </div>
          </div>
        )}

        {job.description && (
          <section className="space-y-3">
            <h2 className="font-display font-bold text-lg text-white flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-primary" />
              {t("apply:details.descriptionHeader")}
            </h2>
            <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap bg-muted/10 rounded-md p-4 border border-border">
              <bdi>{job.description}</bdi>
            </div>
          </section>
        )}

        {job.requirements && (
          <section className="space-y-3">
            <h2 className="font-display font-bold text-lg text-white flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              {t("apply:details.requirements")}
            </h2>
            <div className="space-y-2">
              {job.requirements.split("\n").filter(Boolean).map((line, i) => (
                <div key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-primary/60 mt-0.5 shrink-0" />
                  <span><bdi>{line.replace(/^[-•*]\s*/, "")}</bdi></span>
                </div>
              ))}
            </div>
          </section>
        )}

        {job.skills && job.skills.length > 0 && (
          <section className="space-y-3">
            <h2 className="font-display font-bold text-lg text-white flex items-center gap-2">
              <Tag className="h-4 w-4 text-primary" />
              {t("apply:details.skillsHeader")}
            </h2>
            <div className="flex flex-wrap gap-2">
              {job.skills.map((skill) => (
                <Badge key={skill} variant="outline" className="border-primary/30 text-primary bg-primary/10 font-medium">
                  <bdi>{skill}</bdi>
                </Badge>
              ))}
            </div>
          </section>
        )}

        <div className="flex items-center gap-3 p-4 bg-muted/10 rounded-md border border-border flex-wrap">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Share2 className="h-4 w-4 text-primary" />
            {t("apply:share.header")}
          </h3>
          <div className="flex items-center gap-2 ms-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyLink}
              className="border-border text-muted-foreground hover:text-white gap-1.5 h-8"
              data-testid="button-copy-link-section"
            >
              {linkCopied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <LinkIcon className="h-3.5 w-3.5" />}
              {linkCopied ? t("apply:share.copied") : t("apply:share.copyLink")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleWhatsAppShare}
              className="border-border text-green-500 hover:text-green-400 hover:bg-green-500/10 gap-1.5 h-8"
              data-testid="button-share-whatsapp-section"
            >
              <WhatsAppIcon className="h-3.5 w-3.5" />
              {t("apply:share.whatsapp")}
            </Button>
          </div>
        </div>

        {!applied && (
          <div className="pb-8 pt-2 border-t border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-white">{t("apply:interested.title")}</p>
              <p className="text-sm text-muted-foreground">
                {isLoggedIn ? t("apply:interested.loggedIn") : t("apply:interested.guest")}
              </p>
            </div>
            <Button
              className="bg-primary text-primary-foreground font-bold px-8 h-11 shrink-0"
              onClick={handleApplyClick}
              data-testid="button-apply-bottom"
            >
              {isLoggedIn ? t("apply:cta.applyBottom") : t("apply:cta.signUpAndApply")}
            </Button>
          </div>
        )}
      </main>

      <footer className="border-t border-border py-6 flex items-center justify-center gap-2">
        <img src="/workforce-logo.svg" alt="Workforce" className="h-5 w-5" />
        <span className="font-display font-bold text-sm tracking-tight text-muted-foreground">{t("common:app.name")}</span>
      </footer>

      {isLoggedIn && (
        <ApplyJobDialog
          job={job}
          open={applyOpen}
          onOpenChange={setApplyOpen}
          onSuccess={() => {
            refetchApplications();
            setApplyOpen(false);
          }}
        />
      )}
    </div>
  );
}
