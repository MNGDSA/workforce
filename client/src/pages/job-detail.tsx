import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  MapPin,
  Banknote,
  CalendarDays,
  Briefcase,
  Users,
  Clock,
  CheckCircle2,
  Loader2,
  Share2,
  Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import ApplyJobDialog from "@/components/apply-job-dialog";

type JobPosting = {
  id: string;
  title: string;
  titleAr?: string;
  description?: string;
  requirements?: string;
  location?: string;
  region?: string;
  department?: string;
  type: string;
  salaryMin?: string;
  salaryMax?: string;
  openings: number;
  status: string;
  deadline?: string;
  skills?: string[];
};

function typeLabel(type: string) {
  const map: Record<string, string> = {
    full_time: "Full Time",
    part_time: "Part Time",
    event_based: "Event-based",
    contract: "Contract",
  };
  return map[type] ?? type;
}

function salaryLabel(job: JobPosting) {
  const min = job.salaryMin ? parseFloat(job.salaryMin) : null;
  const max = job.salaryMax ? parseFloat(job.salaryMax) : null;
  if (min && max) return `${min.toLocaleString()} – ${max.toLocaleString()} SAR / month`;
  if (min) return `From ${min.toLocaleString()} SAR / month`;
  return null;
}

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [applyOpen, setApplyOpen] = useState(false);

  // Get candidate from session
  const candidateId: string | undefined = (() => {
    try { return JSON.parse(localStorage.getItem("workforce_candidate") || "{}").id; } catch { return undefined; }
  })();

  const { data: job, isLoading, isError } = useQuery<JobPosting>({
    queryKey: ["/api/jobs", params.id],
    queryFn: () => apiRequest("GET", `/api/jobs/${params.id}`).then((r) => r.json()),
    enabled: !!params.id,
  });

  // Check if candidate already applied to this job
  const { data: myApplications = [], refetch: refetchApplications } = useQuery<{ jobId: string }[]>({
    queryKey: ["/api/applications/mine", candidateId],
    queryFn: () =>
      apiRequest("GET", `/api/applications?candidateId=${candidateId}`).then((r) => r.json()),
    enabled: !!candidateId,
    staleTime: 0,
    refetchOnMount: true,
  });
  const applied = myApplications.some((a) => a.jobId === params.id);

  function handleShare() {
    if (navigator.share && job) {
      navigator.share({ title: job.title, url: window.location.href }).catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast({ title: "Link copied", description: "Job link copied to clipboard." });
    }
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
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 text-center p-8">
        <Briefcase className="h-14 w-14 text-muted-foreground/30" />
        <p className="text-white font-bold text-xl">Job not found</p>
        <p className="text-muted-foreground text-sm">This position may no longer be available.</p>
        <Button onClick={() => setLocation("/candidate-portal")} variant="outline" className="border-border mt-2">
          Back to Portal
        </Button>
      </div>
    );
  }

  const salary = salaryLabel(job);

  return (
    <div className="min-h-screen bg-background font-sans text-foreground">

      {/* Sticky top bar */}
      <header className="sticky top-0 z-50 h-14 bg-background/90 backdrop-blur-md border-b border-border px-4 lg:px-8 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setLocation("/candidate-portal")}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-white transition-colors"
          data-testid="button-back"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to opportunities
        </button>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={handleShare} className="text-muted-foreground hover:text-white" data-testid="button-share">
            <Share2 className="h-4 w-4" />
          </Button>
          {!applied ? (
            <Button
              className="bg-primary text-primary-foreground font-bold h-9 px-5 text-sm"
              onClick={() => setApplyOpen(true)}
              data-testid="button-apply-header"
            >
              Apply Now
            </Button>
          ) : (
            <Button variant="outline" disabled className="border-emerald-500/40 text-emerald-500 bg-emerald-500/10 font-bold h-9 px-5 text-sm">
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Applied
            </Button>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 lg:px-8 py-8 space-y-8 animate-in fade-in duration-500">

        {/* Hero */}
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
              {job.status === "active" ? "Accepting Applications" : job.status}
            </Badge>
          </div>

          <h1 className="font-display text-3xl lg:text-4xl font-bold text-white leading-tight">
            {job.title}
          </h1>
          {job.titleAr && (
            <p className="text-xl text-muted-foreground font-medium" dir="rtl">{job.titleAr}</p>
          )}

          {/* Quick stats row */}
          <div className="flex flex-wrap gap-x-6 gap-y-3 pt-1">
            {(job.region ?? job.location) && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4 text-primary/70 shrink-0" />
                <span>{job.region ?? job.location}</span>
              </div>
            )}
            {salary && (
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <Banknote className="h-4 w-4 text-primary/70 shrink-0" />
                <span>{salary}</span>
              </div>
            )}
            {job.deadline && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CalendarDays className="h-4 w-4 text-primary/70 shrink-0" />
                <span>Apply by {job.deadline}</span>
              </div>
            )}
            {job.openings > 0 && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="h-4 w-4 text-primary/70 shrink-0" />
                <span>{job.openings} opening{job.openings !== 1 ? "s" : ""}</span>
              </div>
            )}
          </div>
        </div>

        {/* Main Apply CTA */}
        {!applied ? (
          <div className="flex gap-3">
            <Button
              className="bg-primary text-primary-foreground font-bold px-8 h-11 shadow-[0_0_20px_rgba(25,90,55,0.3)] hover:shadow-[0_0_30px_rgba(25,90,55,0.5)] transition-all"
              onClick={() => setApplyOpen(true)}
              data-testid="button-apply-main"
            >
              Apply for this Position
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-3 p-4 rounded-md bg-emerald-500/10 border border-emerald-500/25">
            <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-400">Application submitted</p>
              <p className="text-xs text-emerald-600 mt-0.5">We'll review your application and be in touch.</p>
            </div>
          </div>
        )}

        {/* Description */}
        {job.description && (
          <section className="space-y-3">
            <h2 className="font-display font-bold text-lg text-white flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-primary" />
              About the Role
            </h2>
            <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap bg-muted/10 rounded-md p-4 border border-border">
              {job.description}
            </div>
          </section>
        )}

        {/* Requirements */}
        {job.requirements && (
          <section className="space-y-3">
            <h2 className="font-display font-bold text-lg text-white flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              Requirements
            </h2>
            <div className="space-y-2">
              {job.requirements.split("\n").filter(Boolean).map((line, i) => (
                <div key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-primary/60 mt-0.5 shrink-0" />
                  <span>{line.replace(/^[-•*]\s*/, "")}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Skills */}
        {job.skills && job.skills.length > 0 && (
          <section className="space-y-3">
            <h2 className="font-display font-bold text-lg text-white flex items-center gap-2">
              <Tag className="h-4 w-4 text-primary" />
              Skills & Keywords
            </h2>
            <div className="flex flex-wrap gap-2">
              {job.skills.map((skill) => (
                <Badge key={skill} variant="outline" className="border-primary/30 text-primary bg-primary/10 font-medium">
                  {skill}
                </Badge>
              ))}
            </div>
          </section>
        )}

        {/* Organisation info */}
        <Card className="bg-card border-border">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="h-12 w-12 bg-sidebar rounded-sm flex items-center justify-center shrink-0 border border-border p-1.5">
              <img src="/workforce-logo.svg" alt="Luxury Carts" className="h-full w-full" />
            </div>
            <div>
              <p className="font-bold text-white">LUXURY CARTS</p>
              <p className="text-sm text-muted-foreground">Event-based employment · Kingdom of Saudi Arabia</p>
            </div>
          </CardContent>
        </Card>

        {/* Bottom CTA */}
        {!applied && (
          <div className="pb-8 pt-2 border-t border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-white">Interested in this role?</p>
              <p className="text-sm text-muted-foreground">Submit your application — it only takes a minute.</p>
            </div>
            <Button
              className="bg-primary text-primary-foreground font-bold px-8 h-11 shrink-0"
              onClick={() => setApplyOpen(true)}
              data-testid="button-apply-bottom"
            >
              Apply Now
            </Button>
          </div>
        )}
      </main>

      <ApplyJobDialog
        job={job}
        open={applyOpen}
        onOpenChange={setApplyOpen}
        onSuccess={() => {
          refetchApplications();
          setApplyOpen(false);
        }}
      />
    </div>
  );
}
