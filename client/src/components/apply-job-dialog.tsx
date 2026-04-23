import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Briefcase, Loader2, ChevronLeft, ChevronRight,
  CheckCircle2, ClipboardList, AlignLeft, Hash, ToggleLeft, ListChecks, User, ListOrdered,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

type QuestionType = "yes_no" | "multiple_choice" | "text" | "number" | "job_ranking";
type Question = {
  id: string; text: string; type: QuestionType;
  required: boolean; options?: string[];
};
type QuestionSet = { id: string; name: string; description?: string; questions: Question[] };

type Job = {
  id: string; title: string; region?: string; location?: string;
  questionSetId?: string | null;
};

type StoredCandidate = {
  id?: string;
  fullNameEn?: string;
  phone?: string;
  nationalId?: string;
};

// ─── Type icon map ────────────────────────────────────────────────────────────

const TYPE_ICON: Record<QuestionType, React.FC<{ className?: string }>> = {
  yes_no: ToggleLeft, multiple_choice: ListChecks, text: AlignLeft, number: Hash, job_ranking: ListOrdered,
};

// ─── Confirmation view (no question set) ─────────────────────────────────────

function ConfirmView({ job, candidate, onConfirm, onCancel, isSubmitting }: {
  job: Job;
  candidate: StoredCandidate;
  onConfirm: () => void;
  onCancel: () => void;
  isSubmitting: boolean;
}) {
  const { t } = useTranslation(["apply"]);
  return (
    <div className="space-y-5 pt-1">
      <div className="bg-muted/10 border border-border rounded-md p-4 space-y-2">
        <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-3">{t("apply:dialog.applyingAs")}</p>
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <User className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="font-semibold text-white text-sm"><bdi>{candidate.fullNameEn || "—"}</bdi></p>
            <p className="text-xs text-muted-foreground font-mono"><bdi>{candidate.nationalId || candidate.phone || "—"}</bdi></p>
          </div>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        {t("apply:dialog.confirmDescription", { title: job.title })}
      </p>

      <div className="flex justify-end gap-3 pt-1">
        <Button variant="outline" className="border-border" onClick={onCancel} data-testid="button-apply-cancel">
          {t("apply:dialog.cancel")}
        </Button>
        <Button
          className="bg-primary text-primary-foreground font-bold min-w-[160px] gap-2"
          disabled={isSubmitting}
          onClick={onConfirm}
          data-testid="button-apply-confirm"
        >
          {isSubmitting
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <><CheckCircle2 className="h-4 w-4" /> {t("apply:dialog.confirmAndApply")}</>}
        </Button>
      </div>
    </div>
  );
}

// ─── Screening Questions view ─────────────────────────────────────────────────

function QuestionsView({ questionSet, onBack, onSubmit, isSubmitting, showBack }: {
  questionSet: QuestionSet;
  onBack: () => void;
  onSubmit: (answers: Record<string, string>) => void;
  isSubmitting: boolean;
  showBack: boolean;
}) {
  const { t, i18n } = useTranslation(["apply"]);
  const isRtl = i18n.language?.startsWith("ar");
  const BackIcon = isRtl ? ChevronRight : ChevronLeft;
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [errors, setErrors]   = useState<Record<string, string>>({});

  const questions = questionSet.questions as Question[];

  function setAnswer(id: string, val: string) {
    setAnswers(prev => ({ ...prev, [id]: val }));
    if (errors[id]) setErrors(prev => ({ ...prev, [id]: "" }));
  }

  function handleSubmit() {
    const newErrors: Record<string, string> = {};
    for (const q of questions) {
      const raw = answers[q.id]?.trim() ?? "";
      if (q.required && !raw) {
        newErrors[q.id] = t("apply:dialog.questionRequired");
        continue;
      }
      // job_ranking: every option must be ranked. Without this guard,
      // candidates click one option and submit, leaving recruiters with
      // a single value where a full ordering was expected.
      if (q.type === "job_ranking" && raw) {
        const optsCount = (q.options ?? []).length;
        const rankedCount = raw.split(",").filter(Boolean).length;
        if (optsCount > 0 && rankedCount < optsCount) {
          newErrors[q.id] = t("apply:dialog.rankingMustRankAll", {
            defaultValue: "Please rank all options in order of preference.",
          });
        }
      }
    }
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }
    onSubmit(answers);
  }

  return (
    <div className="space-y-5 pt-1">
      {questionSet.description && (
        <p className="text-sm text-muted-foreground bg-muted/10 rounded-md p-3 border border-border">
          <bdi>{questionSet.description}</bdi>
        </p>
      )}

      <div className="space-y-4 max-h-[400px] overflow-y-auto pe-1">
        {questions.map((q, idx) => {
          const Icon = TYPE_ICON[q.type];
          return (
            <div key={q.id} className="space-y-2">
              <div className="flex items-start gap-2">
                <span className="text-xs font-bold text-primary mt-0.5 shrink-0"><bdi>{idx + 1}.</bdi></span>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-white"><bdi>{q.text}</bdi></span>
                    {q.required && <span className="text-red-400 text-xs">*</span>}
                    <Badge variant="outline" className="border-border text-muted-foreground text-[10px] flex items-center gap-1">
                      <Icon className="h-2.5 w-2.5" />
                    </Badge>
                  </div>

                  {q.type === "yes_no" && (
                    <div className="flex gap-2 mt-2">
                      {[
                        { value: "Yes", label: t("apply:dialog.yes") },
                        { value: "No", label: t("apply:dialog.no") },
                      ].map((opt) => (
                        <button
                          key={opt.value} type="button"
                          onClick={() => setAnswer(q.id, opt.value)}
                          data-testid={`button-answer-${q.id}-${opt.value}`}
                          className={`flex-1 h-9 rounded-sm border text-sm font-medium transition-colors ${
                            answers[q.id] === opt.value
                              ? "bg-primary border-primary text-primary-foreground"
                              : "bg-muted/20 border-border text-muted-foreground hover:border-primary/50"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {q.type === "multiple_choice" && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {(q.options ?? []).map((opt) => (
                        <button
                          key={opt} type="button"
                          onClick={() => setAnswer(q.id, opt)}
                          data-testid={`button-answer-${q.id}-${opt}`}
                          className={`px-3 h-8 rounded-sm border text-xs font-medium transition-colors ${
                            answers[q.id] === opt
                              ? "bg-primary border-primary text-primary-foreground"
                              : "bg-muted/20 border-border text-muted-foreground hover:border-primary/50"
                          }`}
                        >
                          <bdi>{opt}</bdi>
                        </button>
                      ))}
                    </div>
                  )}

                  {q.type === "text" && (
                    <Textarea
                      value={answers[q.id] ?? ""}
                      onChange={(e) => setAnswer(q.id, e.target.value)}
                      placeholder={t("apply:dialog.placeholderText")}
                      className="bg-muted/30 border-border mt-2 resize-none text-sm"
                      rows={2}
                      data-testid={`textarea-answer-${q.id}`}
                    />
                  )}

                  {q.type === "number" && (
                    <Input
                      type="number"
                      value={answers[q.id] ?? ""}
                      onChange={(e) => setAnswer(q.id, e.target.value)}
                      placeholder="0"
                      className="bg-muted/30 border-border mt-2 font-mono w-32"
                      data-testid={`input-answer-${q.id}`}
                    />
                  )}

                  {q.type === "job_ranking" && (() => {
                    const opts = q.options ?? [];
                    const ranked: string[] = answers[q.id] ? answers[q.id].split(",").filter(Boolean) : [];
                    const toggleRank = (opt: string) => {
                      let next: string[];
                      if (ranked.includes(opt)) {
                        next = ranked.filter(o => o !== opt);
                      } else {
                        next = [...ranked, opt];
                      }
                      setAnswer(q.id, next.join(","));
                    };
                    return (
                      <div className="mt-2 space-y-1.5">
                        <p className="text-[11px] text-muted-foreground">{t("apply:dialog.rankingHelper")}</p>
                        <div className="space-y-1">
                          {opts.map((opt) => {
                            const rank = ranked.indexOf(opt);
                            const isRanked = rank !== -1;
                            return (
                              <button
                                key={opt}
                                type="button"
                                onClick={() => toggleRank(opt)}
                                data-testid={`button-rank-${q.id}-${opt}`}
                                className={`w-full flex items-center gap-3 px-3 h-9 rounded-sm border text-xs font-medium text-start transition-colors ${
                                  isRanked
                                    ? "bg-primary/10 border-primary/40 text-white"
                                    : "bg-muted/20 border-border text-muted-foreground hover:border-primary/50"
                                }`}
                              >
                                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                                  isRanked ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                                }`}>
                                  <bdi>{isRanked ? rank + 1 : "·"}</bdi>
                                </span>
                                <bdi>{opt}</bdi>
                              </button>
                            );
                          })}
                        </div>
                        {ranked.length > 0 && ranked.length < opts.length && (
                          <p className="text-[11px] text-amber-400/80">{t("apply:dialog.rankingRemaining", { count: opts.length - ranked.length })}</p>
                        )}
                      </div>
                    );
                  })()}

                  {errors[q.id] && (
                    <p className="text-red-400 text-xs mt-1">{errors[q.id]}</p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className={`flex gap-3 pt-2 border-t border-border ${showBack ? "justify-between" : "justify-end"}`}>
        {showBack && (
          <Button type="button" variant="outline" className="border-border gap-2" onClick={onBack} data-testid="button-qs-back">
            <BackIcon className="h-4 w-4" /> {t("apply:dialog.back")}
          </Button>
        )}
        <Button
          className="bg-primary text-primary-foreground font-bold min-w-[160px] gap-2"
          disabled={isSubmitting}
          onClick={handleSubmit}
          data-testid="button-qs-submit"
        >
          {isSubmitting
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <><CheckCircle2 className="h-4 w-4" /> {t("apply:dialog.submit")}</>}
        </Button>
      </div>
    </div>
  );
}

// ─── Main Dialog ─────────────────────────────────────────────────────────────

export default function ApplyJobDialog({
  job, open, onOpenChange, onSuccess,
}: {
  job: Job | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: (jobId: string) => void;
}) {
  const { t } = useTranslation(["apply"]);
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  // Read candidate from localStorage (set during login/register)
  const candidate: StoredCandidate = (() => {
    try {
      const raw = localStorage.getItem("workforce_candidate");
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  })();

  // Fetch question set if job has one
  const { data: questionSet, isLoading: loadingQS } = useQuery<QuestionSet>({
    queryKey: ["/api/question-sets", job?.questionSetId],
    queryFn: () => apiRequest("GET", `/api/question-sets/${job!.questionSetId}`).then(r => r.json()),
    enabled: !!job?.questionSetId && open,
  });

  const hasQuestions = !!(questionSet?.questions?.length);

  const apply = useMutation({
    mutationFn: async (answers?: Record<string, string>) => {
      if (!candidate.id) {
        throw new Error("SESSION_LOST");
      }

      await apiRequest("POST", "/api/applications", {
        candidateId: candidate.id,
        jobId: job!.id,
        status: "new",
        questionSetAnswers: answers ? { questionSetId: job!.questionSetId, answers } : null,
      });

      return job!.id;
    },
    onSuccess: (jobId) => {
      toast({
        title: t("apply:dialog.successTitle"),
        description: t("apply:dialog.successDescription", { title: job?.title ?? "" }),
      });
      onSuccess(jobId);
      onOpenChange(false);
    },
    onError: (e: any) => {
      if (e?.message === "SESSION_LOST") {
        toast({
          title: t("apply:dialog.sessionLostTitle"),
          description: t("apply:dialog.sessionLostDescription"),
          variant: "destructive",
        });
        onOpenChange(false);
        const ret = encodeURIComponent(`/jobs/${job!.id}`);
        setLocation(`/auth?tab=signup&returnTo=${ret}`);
        return;
      }
      toast({
        title: t("apply:dialog.errorTitle"),
        description: e?.message || t("apply:dialog.errorDescription"),
        variant: "destructive",
      });
    },
  });

  function handleClose() {
    onOpenChange(false);
  }

  const isLoading = !!job?.questionSetId && loadingQS;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-bold text-white flex items-center gap-2">
            {hasQuestions
              ? <><ClipboardList className="h-5 w-5 text-primary" /> <bdi>{questionSet?.name ?? t("apply:dialog.screeningQuestions")}</bdi></>
              : <><Briefcase className="h-5 w-5 text-primary" /> {t("apply:dialog.applyForPosition")}</>}
          </DialogTitle>
          {job && (
            <DialogDescription className="text-muted-foreground">
              <bdi>{job.title}</bdi> · <bdi>{job.region ?? job.location ?? "KSA"}</bdi>
            </DialogDescription>
          )}
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : hasQuestions ? (
          <QuestionsView
            questionSet={questionSet!}
            onBack={handleClose}
            onSubmit={(answers) => apply.mutate(answers)}
            isSubmitting={apply.isPending}
            showBack={false}
          />
        ) : (
          <ConfirmView
            job={job!}
            candidate={candidate}
            onConfirm={() => apply.mutate(undefined)}
            onCancel={handleClose}
            isSubmitting={apply.isPending}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
