import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Briefcase, Loader2, ChevronRight, ChevronLeft,
  CheckCircle2, ClipboardList, AlignLeft, Hash, ToggleLeft, ListChecks,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
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

// ─── Apply form (step 1) ──────────────────────────────────────────────────────

const applySchema = z.object({
  fullNameEn: z.string().min(2, "Full name is required"),
  phone: z.string().min(9, "Phone number is required"),
  nationalId: z.string().min(5, "National ID or Iqama number is required"),
});
type ApplyForm = z.infer<typeof applySchema>;

// ─── Step indicators ─────────────────────────────────────────────────────────

const TYPE_ICON: Record<QuestionType, React.FC<{ className?: string }>> = {
  yes_no: ToggleLeft, multiple_choice: ListChecks, text: AlignLeft, number: Hash,
};

// ─── Step 1: Basic Info ───────────────────────────────────────────────────────

function Step1({ form, onNext, hasQuestions, onCancel, isSubmitting }: {
  form: ReturnType<typeof useForm<ApplyForm>>;
  onNext: () => void;
  hasQuestions: boolean;
  onCancel: () => void;
  isSubmitting: boolean;
}) {
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onNext)} className="space-y-4 pt-1">
        <FormField control={form.control} name="fullNameEn" render={({ field }) => (
          <FormItem>
            <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">
              Full Name (English)
            </FormLabel>
            <FormControl>
              <Input placeholder="e.g. Mohammed Al-Harbi" className="bg-muted/30 border-border" data-testid="input-apply-name" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <FormField control={form.control} name="nationalId" render={({ field }) => (
          <FormItem>
            <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">
              National ID / Iqama No.
            </FormLabel>
            <FormControl>
              <Input placeholder="e.g. 1012345678" className="bg-muted/30 border-border font-mono" inputMode="numeric" data-testid="input-apply-national-id" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <FormField control={form.control} name="phone" render={({ field }) => (
          <FormItem>
            <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">
              Phone Number
            </FormLabel>
            <FormControl>
              <Input placeholder="e.g. 0512345678" className="bg-muted/30 border-border font-mono" inputMode="tel" data-testid="input-apply-phone" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" className="border-border" onClick={onCancel} data-testid="button-apply-cancel">
            Cancel
          </Button>
          {hasQuestions ? (
            <Button type="submit" className="bg-primary text-primary-foreground font-bold gap-2" data-testid="button-apply-next">
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button type="submit" className="bg-primary text-primary-foreground font-bold min-w-[140px]" disabled={isSubmitting} data-testid="button-apply-submit">
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit Application"}
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
}

// ─── Step 2: Screening Questions ─────────────────────────────────────────────

function Step2({ questionSet, onBack, onSubmit, isSubmitting }: {
  questionSet: QuestionSet;
  onBack: () => void;
  onSubmit: (answers: Record<string, string>) => void;
  isSubmitting: boolean;
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

                  {/* Yes/No */}
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

                  {/* Multiple choice */}
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

                  {/* Text */}
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

                  {/* Number */}
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

      <div className="flex justify-between gap-3 pt-2 border-t border-border">
        <Button type="button" variant="outline" className="border-border gap-2" onClick={onBack} data-testid="button-qs-back">
          <ChevronLeft className="h-4 w-4" /> Back
        </Button>
        <Button
          className="bg-primary text-primary-foreground font-bold min-w-[160px] gap-2"
          disabled={isSubmitting}
          onClick={handleSubmit}
          data-testid="button-qs-submit"
        >
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="h-4 w-4" /> Submit Application</>}
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
  const [step, setStep] = useState<1 | 2>(1);

  const form = useForm<ApplyForm>({
    resolver: zodResolver(applySchema),
    defaultValues: { fullNameEn: "", phone: "", nationalId: "" },
  });

  // Fetch question set if job has one
  const { data: questionSet } = useQuery<QuestionSet>({
    queryKey: ["/api/question-sets", job?.questionSetId],
    queryFn: () => apiRequest("GET", `/api/question-sets/${job!.questionSetId}`).then(r => r.json()),
    enabled: !!job?.questionSetId && open,
  });

  const hasQuestions = !!(questionSet?.questions?.length);

  const apply = useMutation({
    mutationFn: async ({ basicData, answers }: { basicData: ApplyForm; answers?: Record<string, string> }) => {
      const ts = Date.now().toString(36).toUpperCase().slice(-4);
      const code = `CND-${basicData.nationalId.slice(-6)}-${ts}`;

      const candidate = await apiRequest("POST", "/api/candidates", {
        candidateCode: code,
        fullNameEn: basicData.fullNameEn,
        phone: basicData.phone,
        nationalId: basicData.nationalId,
      }).then(r => r.json());

      await apiRequest("POST", "/api/applications", {
        candidateId: candidate.id,
        jobId: job!.id,
        status: "new",
        questionSetAnswers: answers ? { questionSetId: job!.questionSetId, answers } : null,
      });

      return job!.id;
    },
    onSuccess: (jobId) => {
      toast({ title: "Application submitted!", description: `Your application for "${job?.title}" has been received.` });
      onSuccess(jobId);
      form.reset();
      setStep(1);
      onOpenChange(false);
    },
    onError: () => toast({ title: "Failed to submit", description: "Please check your details and try again.", variant: "destructive" }),
  });

  function handleStep1Valid(data: ApplyForm) {
    if (hasQuestions) {
      setStep(2);
    } else {
      apply.mutate({ basicData: data });
    }
  }

  function handleQuestionsSubmit(answers: Record<string, string>) {
    apply.mutate({ basicData: form.getValues(), answers });
  }

  function handleClose() {
    form.reset();
    setStep(1);
    onOpenChange(false);
  }

  const stepCount = hasQuestions ? 2 : 1;
  const currentStep = step;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-bold text-white flex items-center gap-2">
            {step === 1 ? <Briefcase className="h-5 w-5 text-primary" /> : <ClipboardList className="h-5 w-5 text-primary" />}
            {step === 1 ? "Apply for Position" : questionSet?.name ?? "Screening Questions"}
          </DialogTitle>
          {job && step === 1 && (
            <DialogDescription className="text-muted-foreground">
              {job.title} · {job.region ?? job.location ?? "KSA"}
            </DialogDescription>
          )}
          {step === 2 && (
            <DialogDescription className="text-muted-foreground">
              {job?.title} · {stepCount > 1 ? `Step 2 of ${stepCount}` : ""}
            </DialogDescription>
          )}
        </DialogHeader>

        {/* Step indicator */}
        {hasQuestions && (
          <div className="flex items-center gap-2 px-0">
            {[1, 2].map((s) => (
              <div key={s} className="flex items-center gap-2 flex-1">
                <div className={`h-1.5 flex-1 rounded-full transition-colors ${s <= currentStep ? "bg-primary" : "bg-border"}`} />
              </div>
            ))}
          </div>
        )}

        {step === 1 && (
          <Step1
            form={form}
            onNext={handleStep1Valid}
            hasQuestions={hasQuestions}
            onCancel={handleClose}
            isSubmitting={apply.isPending}
          />
        )}

        {step === 2 && questionSet && (
          <Step2
            questionSet={questionSet}
            onBack={() => setStep(1)}
            onSubmit={handleQuestionsSubmit}
            isSubmitting={apply.isPending}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
