import DashboardLayout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ClipboardList,
  Plus,
  Pencil,
  Trash2,
  GripVertical,
  ChevronUp,
  ChevronDown,
  X,
  Loader2,
  CheckSquare,
  AlignLeft,
  Hash,
  ToggleLeft,
  ListChecks,
  ListOrdered,
  Save,
  ArrowUpDown,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { formatNumber } from "@/lib/format";

// ─── Types ────────────────────────────────────────────────────────────────────

export type QuestionType = "yes_no" | "multiple_choice" | "text" | "number" | "job_ranking";

export type Question = {
  id: string;
  text: string;
  type: QuestionType;
  required: boolean;
  options?: string[];   // for multiple_choice: answer choices; for job_ranking: job titles to rank
};

type QuestionSet = {
  id: string;
  name: string;
  description?: string;
  questions: Question[];
  isActive: boolean;
  createdAt: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TYPE_META: Record<QuestionType, { Icon: React.FC<{ className?: string }> }> = {
  yes_no:          { Icon: ToggleLeft },
  multiple_choice: { Icon: ListChecks },
  text:            { Icon: AlignLeft },
  number:          { Icon: Hash },
  job_ranking:     { Icon: ListOrdered },
};

function newQuestion(): Question {
  return {
    id: crypto.randomUUID(),
    text: "",
    type: "yes_no",
    required: true,
    options: [],
  };
}

// ─── Question Editor Row ──────────────────────────────────────────────────────

function QuestionRow({
  q, idx, total,
  onChange, onRemove, onMoveUp, onMoveDown,
}: {
  q: Question; idx: number; total: number;
  onChange: (updated: Question) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const { t } = useTranslation(["questionSets"]);
  const [optionText, setOptionText] = useState("");

  function addOption() {
    if (!optionText.trim()) return;
    onChange({ ...q, options: [...(q.options ?? []), optionText.trim()] });
    setOptionText("");
  }

  return (
    <div className="border border-border rounded-md bg-muted/10 p-4 space-y-3">
      <div className="flex items-start gap-3">
        {/* Reorder controls */}
        <div className="flex flex-col gap-0.5 pt-1 shrink-0">
          <button type="button" onClick={onMoveUp} disabled={idx === 0}
            className="p-0.5 text-muted-foreground hover:text-white disabled:opacity-30 transition-colors">
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <GripVertical className="h-4 w-4 text-muted-foreground/40 mx-auto" />
          <button type="button" onClick={onMoveDown} disabled={idx === total - 1}
            className="p-0.5 text-muted-foreground hover:text-white disabled:opacity-30 transition-colors">
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Question number */}
        <div className="h-6 w-6 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center shrink-0 mt-1">
          {idx + 1}
        </div>

        {/* Content */}
        <div className="flex-1 space-y-3 min-w-0">
          <Input
            value={q.text}
            onChange={(e) => onChange({ ...q, text: e.target.value })}
            placeholder={t("questionSets:row.questionPh")}
            className="bg-muted/20 border-border font-medium"
            data-testid={`input-question-text-${idx}`}
          />

          <div className="flex items-center gap-3 flex-wrap">
            {/* Type */}
            <Select
              value={q.type}
              onValueChange={(v) => {
                const usesOptions = v === "multiple_choice" || v === "job_ranking";
                onChange({ ...q, type: v as QuestionType, options: usesOptions ? (q.options ?? []) : [] });
              }}
            >
              <SelectTrigger className="w-44 h-8 bg-muted/20 border-border text-xs" data-testid={`select-question-type-${idx}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                {(Object.entries(TYPE_META) as [QuestionType, typeof TYPE_META[QuestionType]][]).map(([val, meta]) => (
                  <SelectItem key={val} value={val} className="text-xs">
                    <div className="flex items-center gap-2">
                      <meta.Icon className="h-3.5 w-3.5 text-primary" />
                      {t(`questionSets:types.${val}`)}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Required toggle */}
            <button
              type="button"
              onClick={() => onChange({ ...q, required: !q.required })}
              className={`flex items-center gap-1.5 h-8 px-3 rounded-sm border text-xs font-medium transition-colors ${
                q.required
                  ? "bg-primary/10 border-primary/40 text-primary"
                  : "bg-muted/20 border-border text-muted-foreground"
              }`}
              data-testid={`button-question-required-${idx}`}
            >
              <CheckSquare className="h-3.5 w-3.5" />
              {q.required ? t("questionSets:row.required") : t("questionSets:row.optional")}
            </button>
          </div>

          {/* Options (multiple choice) */}
          {q.type === "multiple_choice" && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {(q.options ?? []).map((opt, oi) => (
                  <span key={oi} className="flex items-center gap-1 bg-muted/30 border border-border rounded-sm px-2 py-0.5 text-xs text-white">
                    {opt}
                    <button type="button" onClick={() => onChange({ ...q, options: q.options!.filter((_, i) => i !== oi) })}
                      className="text-muted-foreground hover:text-red-400 ms-0.5">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={optionText}
                  onChange={(e) => setOptionText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addOption())}
                  placeholder={t("questionSets:row.addOptionPh")}
                  className="h-8 bg-muted/20 border-border text-xs flex-1"
                  data-testid={`input-option-${idx}`}
                />
                <Button type="button" size="sm" variant="outline" className="border-border h-8 text-xs" onClick={addOption}>
                  {t("questionSets:row.addOption")}
                </Button>
              </div>
            </div>
          )}

          {/* Job Ranking — ordered list of jobs the candidate will rank */}
          {q.type === "job_ranking" && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs text-amber-400/80 bg-amber-400/5 border border-amber-400/20 rounded-sm px-2.5 py-1.5">
                <ArrowUpDown className="h-3.5 w-3.5 shrink-0" />
                {t("questionSets:row.rankingHint")}
              </div>
              {/* Ranked job list */}
              {(q.options ?? []).length > 0 && (
                <div className="space-y-1">
                  {(q.options ?? []).map((job, ji) => (
                    <div key={ji} className="flex items-center gap-2 bg-muted/20 border border-border rounded-sm px-2 py-1.5">
                      {/* rank number */}
                      <span className="h-5 w-5 rounded-full bg-primary/20 text-primary text-[10px] font-bold flex items-center justify-center shrink-0">
                        {ji + 1}
                      </span>
                      {/* reorder buttons */}
                      <div className="flex flex-col gap-px shrink-0">
                        <button
                          type="button"
                          disabled={ji === 0}
                          onClick={() => {
                            const next = [...(q.options ?? [])];
                            [next[ji - 1], next[ji]] = [next[ji], next[ji - 1]];
                            onChange({ ...q, options: next });
                          }}
                          className="p-0.5 text-muted-foreground hover:text-white disabled:opacity-30"
                        >
                          <ChevronUp className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          disabled={ji === (q.options ?? []).length - 1}
                          onClick={() => {
                            const next = [...(q.options ?? [])];
                            [next[ji], next[ji + 1]] = [next[ji + 1], next[ji]];
                            onChange({ ...q, options: next });
                          }}
                          className="p-0.5 text-muted-foreground hover:text-white disabled:opacity-30"
                        >
                          <ChevronDown className="h-3 w-3" />
                        </button>
                      </div>
                      <span className="flex-1 text-xs text-white truncate">{job}</span>
                      <button
                        type="button"
                        onClick={() => onChange({ ...q, options: q.options!.filter((_, i) => i !== ji) })}
                        className="text-muted-foreground hover:text-red-400 shrink-0"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {/* Add job input */}
              <div className="flex gap-2">
                <Input
                  value={optionText}
                  onChange={(e) => setOptionText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addOption())}
                  placeholder={t("questionSets:row.addJobPh")}
                  className="h-8 bg-muted/20 border-border text-xs flex-1"
                  data-testid={`input-ranking-job-${idx}`}
                />
                <Button type="button" size="sm" variant="outline" className="border-border h-8 text-xs" onClick={addOption}>
                  {t("questionSets:row.addJob")}
                </Button>
              </div>
              {(q.options ?? []).length < 2 && (
                <p className="text-xs text-muted-foreground">{t("questionSets:row.rankingTooFew")}</p>
              )}
            </div>
          )}
        </div>

        {/* Remove */}
        <button type="button" onClick={onRemove}
          className="text-muted-foreground hover:text-red-400 transition-colors shrink-0 pt-1"
          data-testid={`button-remove-question-${idx}`}>
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ─── Question Set Editor Dialog ───────────────────────────────────────────────

function QuestionSetEditor({
  open, initial, onOpenChange,
}: {
  open: boolean;
  initial?: QuestionSet | null;
  onOpenChange: (v: boolean) => void;
}) {
  const { t, i18n } = useTranslation(["questionSets"]);
  const lng = i18n.language;
  const { toast } = useToast();
  const qc = useQueryClient();

  const [name, setName]           = useState(initial?.name ?? "");
  const [desc, setDesc]           = useState(initial?.description ?? "");
  const [questions, setQuestions] = useState<Question[]>(
    initial?.questions?.length ? (initial.questions as Question[]) : [newQuestion()]
  );

  const isEdit = !!initial;

  const save = useMutation({
    mutationFn: async () => {
      const payload = { name: name.trim(), description: desc.trim() || null, questions, isActive: true };
      if (isEdit) {
        return apiRequest("PATCH", `/api/question-sets/${initial!.id}`, payload).then(r => r.json());
      }
      return apiRequest("POST", "/api/question-sets", payload).then(r => r.json());
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/question-sets"] });
      toast({ title: isEdit ? t("questionSets:toasts.updated") : t("questionSets:toasts.created") });
      onOpenChange(false);
    },
    onError: () => toast({ title: t("questionSets:toasts.saveFailed"), variant: "destructive" }),
  });

  function moveQuestion(idx: number, dir: -1 | 1) {
    const next = [...questions];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setQuestions(next);
  }

  const isValid = name.trim().length > 0 && questions.every(q => {
    if (!q.text.trim()) return false;
    if (q.type === "multiple_choice" && (q.options ?? []).length < 1) return false;
    if (q.type === "job_ranking"     && (q.options ?? []).length < 2) return false;
    return true;
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-card border-border max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="font-display text-xl font-bold text-white flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            {isEdit ? t("questionSets:editor.editTitle") : t("questionSets:editor.newTitle")}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {t("questionSets:editor.desc")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-5 py-2 pr-1">
          {/* Name & description */}
          <div className="space-y-3">
            <div>
              <Label className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">
                {t("questionSets:editor.name")}<span className="text-red-500 ms-0.5">*</span>
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("questionSets:editor.namePh")}
                className="bg-muted/20 border-border mt-1.5"
                data-testid="input-qs-name"
              />
            </div>
            <div>
              <Label className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">{t("questionSets:editor.description")}</Label>
              <Textarea
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder={t("questionSets:editor.descriptionPh")}
                className="bg-muted/20 border-border mt-1.5 resize-none"
                rows={2}
                data-testid="input-qs-desc"
              />
            </div>
          </div>

          {/* Questions */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">
                {t("questionSets:editor.questions", { n: formatNumber(questions.length, lng) })}
              </Label>
              <Button
                type="button" size="sm" variant="outline"
                className="border-primary/40 text-primary hover:bg-primary/10 h-7 text-xs gap-1.5"
                onClick={() => setQuestions([...questions, newQuestion()])}
                data-testid="button-add-question"
              >
                <Plus className="h-3.5 w-3.5" /> {t("questionSets:editor.addQuestion")}
              </Button>
            </div>

            {questions.map((q, idx) => (
              <QuestionRow
                key={q.id}
                q={q} idx={idx} total={questions.length}
                onChange={(updated) => setQuestions(questions.map((x, i) => i === idx ? updated : x))}
                onRemove={() => setQuestions(questions.filter((_, i) => i !== idx))}
                onMoveUp={() => moveQuestion(idx, -1)}
                onMoveDown={() => moveQuestion(idx, 1)}
              />
            ))}

            {questions.length === 0 && (
              <div className="text-center py-6 text-sm text-muted-foreground border border-dashed border-border rounded-md">
                {t("questionSets:editor.noneYet")}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-border shrink-0">
          <Button variant="outline" className="border-border" onClick={() => onOpenChange(false)}>
            {t("questionSets:editor.cancel")}
          </Button>
          <Button
            className="bg-primary text-primary-foreground font-bold gap-2 min-w-[140px]"
            disabled={!isValid || save.isPending}
            onClick={() => save.mutate()}
            data-testid="button-save-qs"
          >
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4" /> {t("questionSets:editor.save")}</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function QuestionSetsPage() {
  const { t, i18n } = useTranslation(["questionSets"]);
  const lng = i18n.language;
  const { toast } = useToast();
  const qc = useQueryClient();

  const [editorOpen, setEditorOpen]   = useState(false);
  const [editTarget, setEditTarget]   = useState<QuestionSet | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<QuestionSet | null>(null);

  const { data: sets = [], isLoading } = useQuery<QuestionSet[]>({
    queryKey: ["/api/question-sets"],
    queryFn: () => apiRequest("GET", "/api/question-sets").then(r => r.json()),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/question-sets/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/question-sets"] });
      toast({ title: t("questionSets:toasts.deleted") });
      setDeleteTarget(null);
    },
    onError: () => toast({ title: t("questionSets:toasts.deleteFailed"), variant: "destructive" }),
  });

  function openCreate() { setEditTarget(null); setEditorOpen(true); }
  function openEdit(qs: QuestionSet) { setEditTarget(qs); setEditorOpen(true); }

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6 animate-in fade-in duration-500">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-white flex items-center gap-3">
              <ClipboardList className="h-6 w-6 text-primary" />
              {t("questionSets:title")}
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              {t("questionSets:subtitle")}
            </p>
          </div>
          <Button
            className="bg-primary text-primary-foreground font-bold gap-2"
            onClick={openCreate}
            data-testid="button-new-qs"
          >
            <Plus className="h-4 w-4" /> {t("questionSets:newSet")}
          </Button>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : sets.length === 0 ? (
          <Card className="bg-card border-border">
            <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
              <ClipboardList className="h-14 w-14 text-muted-foreground/20" />
              <div className="text-center">
                <p className="font-bold text-white">{t("questionSets:emptyTitle")}</p>
                <p className="text-sm text-muted-foreground mt-1">{t("questionSets:emptySubtitle")}</p>
              </div>
              <Button className="bg-primary text-primary-foreground font-bold gap-2" onClick={openCreate}>
                <Plus className="h-4 w-4" /> {t("questionSets:createFirst")}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {sets.map((qs) => {
              const questions = qs.questions as Question[];
              return (
                <Card key={qs.id} className="bg-card border-border hover:border-primary/30 transition-colors">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 flex-wrap">
                          <h3 className="font-display font-bold text-white text-lg"><bdi>{qs.name}</bdi></h3>
                          <Badge variant="outline" className="border-primary/30 text-primary bg-primary/10 text-xs">
                            {t("questionSets:questionCount", { count: questions.length, n: formatNumber(questions.length, lng) })}
                          </Badge>
                          {qs.isActive ? (
                            <Badge variant="outline" className="border-emerald-500/30 text-emerald-500 bg-emerald-500/10 text-xs">{t("questionSets:active")}</Badge>
                          ) : (
                            <Badge variant="outline" className="border-border text-muted-foreground text-xs">{t("questionSets:inactive")}</Badge>
                          )}
                        </div>
                        {qs.description && (
                          <p className="text-sm text-muted-foreground mt-1">{qs.description}</p>
                        )}

                        {/* Question preview */}
                        {questions.length > 0 && (
                          <div className="mt-3 space-y-1.5">
                            {questions.slice(0, 4).map((q, i) => {
                              const meta = TYPE_META[q.type] ?? { Icon: AlignLeft };
                              return (
                                <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                                  <meta.Icon className="h-3.5 w-3.5 text-primary/60 mt-0.5 shrink-0" />
                                  <span className="truncate flex-1">{q.text}</span>
                                  {q.type === "job_ranking" && (q.options ?? []).length > 0 && (
                                    <span className="text-primary/60 shrink-0">{t("questionSets:jobsCount", { n: formatNumber(q.options!.length, lng) })}</span>
                                  )}
                                  {q.required && <span className="text-red-400 shrink-0">*</span>}
                                </div>
                              );
                            })}
                            {questions.length > 4 && (
                              <p className="text-xs text-muted-foreground ps-5">{t("questionSets:moreQuestions", { n: formatNumber(questions.length - 4, lng) })}</p>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          variant="outline" size="sm"
                          className="border-border gap-1.5 text-xs"
                          onClick={() => openEdit(qs)}
                          data-testid={`button-edit-qs-${qs.id}`}
                        >
                          <Pencil className="h-3.5 w-3.5" /> {t("questionSets:edit")}
                        </Button>
                        <Button
                          variant="outline" size="sm"
                          className="border-red-500/30 text-red-400 hover:bg-red-500/10 gap-1.5 text-xs"
                          onClick={() => setDeleteTarget(qs)}
                          data-testid={`button-delete-qs-${qs.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Editor dialog */}
      {editorOpen && (
        <QuestionSetEditor
          open={editorOpen}
          initial={editTarget}
          onOpenChange={(v) => { setEditorOpen(v); if (!v) setEditTarget(null); }}
        />
      )}

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">{t("questionSets:delete.title")}</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {t("questionSets:delete.body", { name: deleteTarget?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border">{t("questionSets:delete.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              {t("questionSets:delete.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
