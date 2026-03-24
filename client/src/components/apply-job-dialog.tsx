import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Briefcase, Loader2, ChevronLeft,
  CheckCircle2, ClipboardList, AlignLeft, Hash, ToggleLeft, ListChecks, User,
} from "lucide-react";
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

type QuestionType = "yes_no" | "multiple_choice" | "text" | "number";
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
  candidateCode?: string;
};

// ─── Type icon map ────────────────────────────────────────────────────────────

const TYPE_ICON: Record<QuestionType, React.FC<{ className?: string }>> = {
  yes_no: ToggleLeft, multiple_choice: ListChecks, text: AlignLeft, number: Hash,
};

// ─── Confirmation view (no question set) ─────────────────────────────────────

function ConfirmView({ job, candidate, onConfirm, onCancel, isSubmitting }: {
  job: Job;
  candidate: StoredCandidate;
  onConfirm: () => void;
  onCancel: () => void;
  isSubmitting: boolean;
}) {
  return (
    <div className="space-y-5 pt-1">
      <div className="bg-muted/10 border border-border rounded-md p-4 space-y-2">
        <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-3">Applying as</p>
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <User className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="font-semibold text-white text-sm">{candidate.fullNameEn || "—"}</p>
            <p className="text-xs text-muted-foreground font-mono">{candidate.nationalId || candidate.phone || "—"}</p>
          </div>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        You are about to submit an application for <span className="text-white font-medium">"{job.title}"</span>.
        Your profile information will be used for this application.
      </p>

      <div className="flex justify-end gap-3 pt-1">
        <Button variant="outline" className="border-border" onClick={onCancel} data-testid="button-apply-cancel">
          Cancel
        </Button>
        <Button
          className="bg-primary text-primary-foreground font-bold min-w-[160px] gap-2"
          disabled={isSubmitting}
          onClick={onConfirm}
          data-testid="button-apply-confirm"
        >
          {isSubmitting
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <><CheckCircle2 className="h-4 w-4" /> Confirm & Apply</>}
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
      if (q.required && !answers[q.id]?.trim()) {
        newErrors[q.id] = "This question is required";
      }
    }
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }
    onSubmit(answers);
  }

  return (
    <div className="space-y-5 pt-1">
      {questionSet.description && (
        <p className="text-sm text-muted-foreground bg-muted/10 rounded-md p-3 border border-border">
          {questionSet.description}
        </p>
      )}

      <div className="space-y-4 max-h-[400px] overflow-y-auto pr-1">
        {questions.map((q, idx) => {
          const Icon = TYPE_ICON[q.type];
          return (
            <div key={q.id} className="space-y-2">
              <div className="flex items-start gap-2">
                <span className="text-xs font-bold text-primary mt-0.5 shrink-0">{idx + 1}.</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-white">{q.text}</span>
                    {q.required && <span className="text-red-400 text-xs">*</span>}
                    <Badge variant="outline" className="border-border text-muted-foreground text-[10px] flex items-center gap-1">
                      <Icon className="h-2.5 w-2.5" />
                    </Badge>
                  </div>

                  {q.type === "yes_no" && (
                    <div className="flex gap-2 mt-2">
                      {["Yes", "No"].map((opt) => (
                        <button
                          key={opt} type="button"
                          onClick={() => setAnswer(q.id, opt)}
                          data-testid={`button-answer-${q.id}-${opt}`}
                          className={`flex-1 h-9 rounded-sm border text-sm font-medium transition-colors ${
                            answers[q.id] === opt
                              ? "bg-primary border-primary text-primary-foreground"
                              : "bg-muted/20 border-border text-muted-foreground hover:border-primary/50"
                          }`}
                        >
                          {opt}
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
                          {opt}
                        </button>
                      ))}
                    </div>
                  )}

                  {q.type === "text" && (
                    <Textarea
                      value={answers[q.id] ?? ""}
                      onChange={(e) => setAnswer(q.id, e.target.value)}
                      placeholder="Your answer..."
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
            <ChevronLeft className="h-4 w-4" /> Back
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
            : <><CheckCircle2 className="h-4 w-4" /> Submit Application</>}
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
  const { toast } = useToast();

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
      // Use existing candidate id if available, otherwise create a minimal record
      let candidateId = candidate.id;

      if (!candidateId) {
        const ts = Date.now().toString(36).toUpperCase().slice(-4);
        const code = `CND-${(candidate.nationalId ?? "000000").slice(-6)}-${ts}`;
        const newCandidate = await apiRequest("POST", "/api/candidates", {
          candidateCode: code,
          fullNameEn: candidate.fullNameEn ?? "",
          phone: candidate.phone ?? "",
          nationalId: candidate.nationalId ?? "",
        }).then(r => r.json());
        candidateId = newCandidate.id;
      }

      await apiRequest("POST", "/api/applications", {
        candidateId,
        jobId: job!.id,
        status: "new",
        questionSetAnswers: answers ? { questionSetId: job!.questionSetId, answers } : null,
      });

      return job!.id;
    },
    onSuccess: (jobId) => {
      toast({ title: "Application submitted!", description: `Your application for "${job?.title}" has been received.` });
      onSuccess(jobId);
      onOpenChange(false);
    },
    onError: () => toast({ title: "Failed to submit", description: "Please try again.", variant: "destructive" }),
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
              ? <><ClipboardList className="h-5 w-5 text-primary" /> {questionSet?.name ?? "Screening Questions"}</>
              : <><Briefcase className="h-5 w-5 text-primary" /> Apply for Position</>}
          </DialogTitle>
          {job && (
            <DialogDescription className="text-muted-foreground">
              {job.title} · {job.region ?? job.location ?? "KSA"}
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
