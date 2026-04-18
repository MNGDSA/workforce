import DashboardLayout from "@/components/layout";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useState, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Search,
  Filter,
  MoreHorizontal,
  Calendar,
  Users,
  Plus,
  Loader2,
  Info,
  Archive,
  ArchiveRestore,
  Eye,
  Pencil,
  MapPin,
  DollarSign,
  Target,
  Clock,
  Infinity,
  CalendarRange,
  XCircle,
  RefreshCw,
  AlertTriangle,
  RotateCcw,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import type { Event } from "@shared/schema";
import { useTranslation, Trans } from "react-i18next";
import { formatNumber } from "@/lib/format";

const statusStyles: Record<string, string> = {
  upcoming: "bg-blue-500/10 text-blue-500",
  active: "bg-green-500/10 text-green-500",
  closed: "bg-muted text-muted-foreground",
  archived: "bg-zinc-800 text-zinc-500",
};

function CreateEventDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = useTranslation(["events"]);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createEventSchema = useMemo(() => z.object({
    name: z.string().min(3, t("events:validation.name")),
    description: z.string().optional(),
    eventType: z.enum(["duration_based", "ongoing"]),
    startDate: z.string().min(1, t("events:validation.startDate")),
    endDate: z.string().optional(),
    region: z.string().optional(),
    targetHeadcount: z.coerce.number().int().min(1, t("events:validation.headcount")),
    budget: z.coerce.number().optional(),
    status: z.enum(["upcoming", "active"]),
  }).superRefine((data, ctx) => {
    if (data.eventType === "duration_based" && !data.endDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: t("events:validation.endDate"), path: ["endDate"] });
    }
  }), [t]);
  type CreateEventForm = z.infer<typeof createEventSchema>;

  const { data: currentUser } = useQuery<{ fullName: string }>({
    queryKey: ["/api/me"],
    queryFn: () => apiRequest("GET", "/api/me").then((r) => r.json()),
  });

  const form = useForm<CreateEventForm>({
    resolver: zodResolver(createEventSchema),
    defaultValues: {
      name: "",
      description: "",
      eventType: "duration_based",
      startDate: "",
      endDate: "",
      region: "",
      targetHeadcount: undefined as unknown as number,
      budget: undefined,
      status: "upcoming",
    },
  });

  const watchedEventType = form.watch("eventType");

  const createEvent = useMutation({
    mutationFn: (data: CreateEventForm) =>
      apiRequest("POST", "/api/events", data).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      toast({ title: t("events:create.successTitle"), description: t("events:create.successDesc") });
      form.reset();
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: t("events:create.errorTitle"), description: t("events:create.errorDesc"), variant: "destructive" });
    },
  });

  function onSubmit(data: CreateEventForm) {
    createEvent.mutate(data);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-white font-display text-xl">{t("events:create.title")}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 pt-1">

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">
                    {t("events:form.name")} <span className="text-primary">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("events:form.namePh")}
                      className="h-10 bg-muted/30 border-border focus-visible:border-primary/50 rounded-sm"
                      data-testid="input-event-name"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">
                    {t("events:form.description")}
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={t("events:form.descPh")}
                      rows={3}
                      className="bg-muted/30 border-border focus-visible:border-primary/50 rounded-sm resize-none"
                      data-testid="textarea-event-description"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-2">
              <p className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">{t("events:form.createdBy")}</p>
              <Input
                value={currentUser?.fullName ?? t("events:form.loading")}
                disabled
                className="h-10 bg-muted/10 border-border rounded-sm text-muted-foreground cursor-not-allowed"
                data-testid="input-event-created-by"
              />
            </div>

            <div className="w-full h-px bg-border" />

            <FormField
              control={form.control}
              name="eventType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">
                    {t("events:form.type")} <span className="text-primary">*</span>
                  </FormLabel>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      data-testid="radio-event-type-duration"
                      onClick={() => { field.onChange("duration_based"); form.setValue("endDate", ""); }}
                      className={`flex items-center gap-2.5 h-11 px-3 rounded-sm border text-sm font-medium transition-all ${
                        field.value === "duration_based"
                          ? "border-primary bg-primary/10 text-white"
                          : "border-border bg-muted/20 text-muted-foreground hover:border-border/80"
                      }`}
                    >
                      <CalendarRange className="h-4 w-4 shrink-0" />
                      <div className="text-start">
                        <div className="text-xs font-semibold">{t("events:type.duration")}</div>
                        <div className="text-[10px] opacity-70 font-normal">{t("events:type.durationDesc")}</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      data-testid="radio-event-type-ongoing"
                      onClick={() => { field.onChange("ongoing"); form.setValue("endDate", ""); }}
                      className={`flex items-center gap-2.5 h-11 px-3 rounded-sm border text-sm font-medium transition-all ${
                        field.value === "ongoing"
                          ? "border-primary bg-primary/10 text-white"
                          : "border-border bg-muted/20 text-muted-foreground hover:border-border/80"
                      }`}
                    >
                      <Infinity className="h-4 w-4 shrink-0" />
                      <div className="text-start">
                        <div className="text-xs font-semibold">{t("events:type.ongoing")}</div>
                        <div className="text-[10px] opacity-70 font-normal">{t("events:type.ongoingDesc")}</div>
                      </div>
                    </button>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">{t("events:form.timeline")}</p>
            <div className={`grid gap-4 ${watchedEventType === "duration_based" ? "grid-cols-2" : "grid-cols-1"}`}>
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">
                      {t("events:form.startDate")} <span className="text-primary">*</span>
                    </FormLabel>
                    <FormControl>
                      <DatePickerField
                        value={field.value}
                        onChange={field.onChange}
                        className="h-10 bg-muted/30 border-border focus-visible:border-primary/50 rounded-sm"
                        data-testid="input-event-start-date"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {watchedEventType === "duration_based" && (
                <FormField
                  control={form.control}
                  name="endDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">
                        {t("events:form.endDate")} <span className="text-red-400">*</span>
                      </FormLabel>
                      <FormControl>
                        <DatePickerField
                          value={field.value ?? ""}
                          onChange={field.onChange}
                          className="h-10 bg-muted/30 border-border focus-visible:border-primary/50 rounded-sm"
                          data-testid="input-event-end-date"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>
            {watchedEventType === "ongoing" && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5 -mt-2">
                <Infinity className="h-3 w-3 text-primary" />
                {t("events:type.ongoingHelp")}
              </p>
            )}

            <FormField
              control={form.control}
              name="targetHeadcount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">
                    {t("events:form.headcount")} <span className="text-primary">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      dir="ltr"
                      placeholder={t("events:form.headcountPh")}
                      {...field}
                      onChange={e => field.onChange(Number(e.target.value))}
                      className="h-10 bg-muted/30 border-border rounded-sm"
                      data-testid="input-event-headcount"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="pt-1 flex gap-2 sm:justify-between">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                className="text-muted-foreground"
                data-testid="button-cancel-event"
              >
                {t("events:form.cancel")}
              </Button>
              <Button
                type="submit"
                className="bg-primary text-primary-foreground font-bold uppercase tracking-wide text-xs"
                disabled={createEvent.isPending}
                data-testid="button-submit-event"
              >
                {createEvent.isPending ? (
                  <Loader2 className="me-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="me-2 h-4 w-4" />
                )}
                {t("events:create.submit")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function InfoTooltip({ text }: { text: string }) {
  const { t } = useTranslation(["events"]);
  const [visible, setVisible] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const show = () => {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 6, left: Math.max(8, r.right - 240) });
    }
    setVisible(true);
  };

  return (
    <span className="inline-flex items-center ms-1.5 normal-case">
      <button
        ref={btnRef}
        type="button"
        className="inline-flex items-center justify-center text-muted-foreground/50 hover:text-primary transition-colors"
        onMouseEnter={show}
        onMouseLeave={() => setVisible(false)}
        aria-label={t("events:tooltip.moreInfo")}
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {visible && pos && createPortal(
        <span
          className="fixed z-[9999] w-60 rounded-sm bg-popover border border-border px-3 py-2 text-xs text-muted-foreground shadow-lg leading-relaxed pointer-events-none normal-case tracking-normal font-normal"
          style={{ top: pos.top, left: pos.left }}
        >
          {text}
        </span>,
        document.body
      )}
    </span>
  );
}

function ViewEventDialog({ event, open, onOpenChange }: { event: Event | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t, i18n } = useTranslation(["events"]);
  if (!event) return null;
  const pct = event.targetHeadcount > 0 ? Math.round((event.filledPositions / event.targetHeadcount) * 100) : 0;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-white font-display text-xl">{t("events:view.title")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div>
            <p className="text-muted-foreground text-xs uppercase tracking-wider font-semibold mb-1">{t("events:view.name")}</p>
            <p className="text-white font-medium" data-testid="view-event-name"><bdi>{event.name}</bdi></p>
          </div>
          {event.description && (
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wider font-semibold mb-1">{t("events:view.description")}</p>
              <p className="text-white text-sm" data-testid="view-event-description"><bdi>{event.description}</bdi></p>
            </div>
          )}
          <div className="flex items-center gap-2">
            {event.eventType === "ongoing" ? (
              <Badge variant="outline" className="border-primary/40 text-primary bg-primary/10 font-medium gap-1">
                <Infinity className="h-3 w-3" /> {t("events:type.ongoing")}
              </Badge>
            ) : (
              <Badge variant="outline" className="border-border text-muted-foreground font-medium gap-1">
                <CalendarRange className="h-3 w-3" /> {t("events:type.duration")}
              </Badge>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wider font-semibold mb-1 flex items-center gap-1"><Calendar className="h-3 w-3" /> {t("events:view.startDate")}</p>
              <p className="text-white text-sm" dir="ltr">{event.startDate}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wider font-semibold mb-1 flex items-center gap-1"><Clock className="h-3 w-3" /> {t("events:view.endDate")}</p>
              {event.endDate ? (
                <p className="text-white text-sm" dir="ltr">{event.endDate}</p>
              ) : (
                <p className="text-muted-foreground text-sm flex items-center gap-1"><Infinity className="h-3 w-3" /> {t("events:type.ongoing")}</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wider font-semibold mb-1 flex items-center gap-1"><MapPin className="h-3 w-3" /> {t("events:view.region")}</p>
              <p className="text-white text-sm"><bdi>{event.region || "—"}</bdi></p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wider font-semibold mb-1">{t("events:view.status")}</p>
              <Badge variant="outline" className={`font-medium border-0 ${statusStyles[event.status] ?? "bg-muted text-muted-foreground"}`}>
                {t(`events:status.${event.status}`, { defaultValue: event.status })}
              </Badge>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wider font-semibold mb-1 flex items-center gap-1"><Target className="h-3 w-3" /> {t("events:view.progress")}</p>
              <p className="text-white text-sm">
                {t("events:view.progressFmt", {
                  filled: formatNumber(event.filledPositions, i18n.language),
                  target: formatNumber(event.targetHeadcount, i18n.language),
                  pct: formatNumber(pct, i18n.language),
                })}
              </p>
              <Progress value={pct} className="h-1.5 mt-1.5" />
            </div>
            {event.budget != null && (
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wider font-semibold mb-1 flex items-center gap-1"><DollarSign className="h-3 w-3" /> {t("events:view.budget")}</p>
                <p className="text-white text-sm">
                  {t("events:view.budgetFmt", { value: formatNumber(Number(event.budget), i18n.language) })}
                </p>
              </div>
            )}
          </div>
          {event.createdBy && (
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wider font-semibold mb-1">{t("events:view.createdBy")}</p>
              <p className="text-white text-sm"><bdi>{event.createdBy}</bdi></p>
            </div>
          )}
        </div>
        <DialogFooter className="pt-2">
          <Button variant="ghost" className="text-muted-foreground" onClick={() => onOpenChange(false)}>{t("events:view.close")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditEventDialog({ event, open, onOpenChange }: { event: Event | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t } = useTranslation(["events"]);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createEventSchema = useMemo(() => z.object({
    name: z.string().min(3, t("events:validation.name")),
    description: z.string().optional(),
    eventType: z.enum(["duration_based", "ongoing"]),
    startDate: z.string().min(1, t("events:validation.startDate")),
    endDate: z.string().optional(),
    region: z.string().optional(),
    targetHeadcount: z.coerce.number().int().min(1, t("events:validation.headcount")),
    budget: z.coerce.number().optional(),
    status: z.enum(["upcoming", "active"]),
  }).superRefine((data, ctx) => {
    if (data.eventType === "duration_based" && !data.endDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: t("events:validation.endDate"), path: ["endDate"] });
    }
  }), [t]);
  type CreateEventForm = z.infer<typeof createEventSchema>;

  const form = useForm<CreateEventForm>({
    resolver: zodResolver(createEventSchema),
    values: event ? {
      name: event.name,
      description: event.description ?? "",
      eventType: (event.eventType ?? "duration_based") as "duration_based" | "ongoing",
      startDate: event.startDate,
      endDate: event.endDate ?? "",
      region: event.region ?? "",
      targetHeadcount: event.targetHeadcount,
      budget: event.budget != null ? Number(event.budget) : undefined,
      status: event.status as "upcoming" | "active",
    } : undefined,
  });

  const watchedEventType = form.watch("eventType");

  const updateEvent = useMutation({
    mutationFn: (data: CreateEventForm) =>
      apiRequest("PATCH", `/api/events/${event!.id}`, data).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      toast({ title: t("events:edit.successTitle"), description: t("events:edit.successDesc") });
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: t("events:edit.errorTitle"), description: t("events:edit.errorDesc"), variant: "destructive" });
    },
  });

  if (!event) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-white font-display text-xl">{t("events:edit.title")}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => updateEvent.mutate(data))} className="space-y-5 pt-1">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">{t("events:form.name")} <span className="text-primary">*</span></FormLabel>
                <FormControl><Input placeholder={t("events:form.namePh")} className="h-10 bg-muted/30 border-border rounded-sm" data-testid="edit-event-name" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">{t("events:form.description")}</FormLabel>
                <FormControl><Textarea placeholder={t("events:edit.descPh")} rows={3} className="bg-muted/30 border-border rounded-sm resize-none" data-testid="edit-event-description" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <div className="w-full h-px bg-border" />

            <FormField control={form.control} name="eventType" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">{t("events:form.type")} <span className="text-primary">*</span></FormLabel>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" data-testid="edit-radio-event-type-duration"
                    onClick={() => { field.onChange("duration_based"); form.setValue("endDate", ""); }}
                    className={`flex items-center gap-2.5 h-11 px-3 rounded-sm border text-sm font-medium transition-all ${field.value === "duration_based" ? "border-primary bg-primary/10 text-white" : "border-border bg-muted/20 text-muted-foreground hover:border-border/80"}`}
                  >
                    <CalendarRange className="h-4 w-4 shrink-0" />
                    <div className="text-start">
                      <div className="text-xs font-semibold">{t("events:type.duration")}</div>
                      <div className="text-[10px] opacity-70 font-normal">{t("events:type.durationDesc")}</div>
                    </div>
                  </button>
                  <button type="button" data-testid="edit-radio-event-type-ongoing"
                    onClick={() => { field.onChange("ongoing"); form.setValue("endDate", ""); }}
                    className={`flex items-center gap-2.5 h-11 px-3 rounded-sm border text-sm font-medium transition-all ${field.value === "ongoing" ? "border-primary bg-primary/10 text-white" : "border-border bg-muted/20 text-muted-foreground hover:border-border/80"}`}
                  >
                    <Infinity className="h-4 w-4 shrink-0" />
                    <div className="text-start">
                      <div className="text-xs font-semibold">{t("events:type.ongoing")}</div>
                      <div className="text-[10px] opacity-70 font-normal">{t("events:type.ongoingDesc")}</div>
                    </div>
                  </button>
                </div>
                <FormMessage />
              </FormItem>
            )} />

            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">{t("events:form.timeline")}</p>
            <div className={`grid gap-4 ${watchedEventType === "duration_based" ? "grid-cols-2" : "grid-cols-1"}`}>
              <FormField control={form.control} name="startDate" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">{t("events:form.startDate")} <span className="text-primary">*</span></FormLabel>
                  <FormControl><DatePickerField value={field.value} onChange={field.onChange} className="h-10 bg-muted/30 border-border rounded-sm" data-testid="edit-event-start-date" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              {watchedEventType === "duration_based" && (
                <FormField control={form.control} name="endDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">{t("events:form.endDate")} <span className="text-red-400">*</span></FormLabel>
                    <FormControl><DatePickerField value={field.value ?? ""} onChange={field.onChange} className="h-10 bg-muted/30 border-border rounded-sm" data-testid="edit-event-end-date" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              )}
            </div>
            {watchedEventType === "ongoing" && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5 -mt-2">
                <Infinity className="h-3 w-3 text-primary" />
                {t("events:type.ongoingHelp")}
              </p>
            )}

            <FormField control={form.control} name="targetHeadcount" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">{t("events:form.headcount")} <span className="text-primary">*</span></FormLabel>
                <FormControl>
                  <Input
                    type="number" min={1} dir="ltr" placeholder={t("events:form.headcountPh")}
                    {...field}
                    onChange={e => field.onChange(Number(e.target.value))}
                    className="h-10 bg-muted/30 border-border rounded-sm"
                    data-testid="edit-event-headcount"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <DialogFooter className="pt-1 flex gap-2 sm:justify-between">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="text-muted-foreground">{t("events:form.cancel")}</Button>
              <Button type="submit" className="bg-primary text-primary-foreground font-bold uppercase tracking-wide text-xs" disabled={updateEvent.isPending} data-testid="button-save-event">
                {updateEvent.isPending ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Pencil className="me-2 h-4 w-4" />}
                {t("events:edit.submit")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function EventsPage() {
  const { t, i18n } = useTranslation(["events"]);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [viewEvent, setViewEvent] = useState<Event | null>(null);
  const [editEvent, setEditEvent] = useState<Event | null>(null);
  const [closeConfirmEvent, setCloseConfirmEvent] = useState<Event | null>(null);
  const [reopenConfirmEvent, setReopenConfirmEvent] = useState<Event | null>(null);
  const [reopenReason, setReopenReason] = useState("");

  const { data: eventsList = [], isLoading } = useQuery<Event[]>({
    queryKey: ["/api/events", showArchived],
    queryFn: () => apiRequest("GET", `/api/events${showArchived ? "?archived=true" : ""}`).then((r) => r.json()),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/events/${id}`, { status }).then((r) => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/events"] }),
  });

  const closeEvent = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/events/${id}/close`).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      const name = closeConfirmEvent?.name ?? "";
      setCloseConfirmEvent(null);
      toast({ title: t("events:close.successTitle", { name }), description: t("events:close.successDesc") });
    },
    onError: () => toast({ title: t("events:close.errorTitle"), description: t("events:close.errorDesc"), variant: "destructive" }),
  });

  const reopenEvent = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      apiRequest("POST", `/api/events/${id}/reopen`, { reason }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      const name = reopenConfirmEvent?.name ?? "";
      setReopenConfirmEvent(null);
      setReopenReason("");
      toast({ title: t("events:reopen.successTitle", { name }), description: t("events:reopen.successDesc") });
    },
    onError: () => toast({ title: t("events:reopen.errorTitle"), description: t("events:reopen.errorDesc"), variant: "destructive" }),
  });

  const archiveEvent = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/events/${id}/archive`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/events"] }),
  });

  const unarchiveEvent = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/events/${id}/unarchive`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/events"] }),
  });

  const filtered = eventsList.filter(
    (s) => !search || s.name.toLowerCase().includes(search.toLowerCase())
  );

  const activeCount = eventsList.filter((s) => s.status === "active" && !s.archivedAt).length;
  const upcomingCount = eventsList.filter((s) => s.status === "upcoming" && !s.archivedAt).length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-white tracking-tight">{t("events:page.title")}</h1>
            <p className="text-muted-foreground mt-1">{t("events:page.subtitle")}</p>
          </div>
          <Button
            className="h-11 bg-primary text-primary-foreground font-bold uppercase tracking-wide text-xs"
            data-testid="button-create-event"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="me-2 h-4 w-4" />
            {t("events:page.createBtn")}
          </Button>
        </div>

        <CreateEventDialog open={createOpen} onOpenChange={setCreateOpen} />
        <ViewEventDialog event={viewEvent} open={!!viewEvent} onOpenChange={(v) => { if (!v) setViewEvent(null); }} />
        <EditEventDialog event={editEvent} open={!!editEvent} onOpenChange={(v) => { if (!v) setEditEvent(null); }} />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-card border-border shadow-sm border-s-4 border-s-primary">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{t("events:stats.total")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-white" data-testid="stat-total-events">{formatNumber(eventsList.length, i18n.language)}</div>
              <p className="text-xs text-muted-foreground mt-1">{t("events:stats.totalHelp")}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{t("events:stats.active")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-white" data-testid="stat-active-events">{formatNumber(activeCount, i18n.language)}</div>
              <p className="text-xs text-muted-foreground mt-1">{t("events:stats.activeHelp")}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{t("events:stats.upcoming")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-white" data-testid="stat-upcoming-events">{formatNumber(upcomingCount, i18n.language)}</div>
              <p className="text-xs text-muted-foreground mt-1">{t("events:stats.upcomingHelp")}</p>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col md:flex-row gap-4 items-center bg-card p-4 rounded-sm border border-border">
          <div className="relative flex-1 w-full">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder={t("events:search.placeholder")}
              className="ps-10 h-12 bg-muted/30 border-border focus-visible:ring-primary/20 text-base"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-search-events"
            />
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <Button variant="outline" className="h-12 border-border bg-background flex-1 md:flex-none">
              <Filter className="me-2 h-4 w-4" />
              {t("events:search.status")}
            </Button>
            <Button variant="outline" className="h-12 border-border bg-background flex-1 md:flex-none">
              <Calendar className="me-2 h-4 w-4" />
              {t("events:search.dateRange")}
            </Button>
            <Button
              variant={showArchived ? "default" : "outline"}
              className={`h-12 border-border flex-1 md:flex-none ${showArchived ? "bg-amber-600 hover:bg-amber-700 text-white" : "bg-background"}`}
              onClick={() => setShowArchived(!showArchived)}
              data-testid="button-toggle-archived"
            >
              <Archive className="me-2 h-4 w-4" />
              {showArchived ? t("events:search.showingAll") : t("events:search.showArchived")}
            </Button>
          </div>
        </div>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg font-display text-white">{t("events:table.title")}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Calendar className="h-12 w-12 text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground font-medium">{t("events:table.noEvents")}</p>
                <p className="text-muted-foreground/60 text-sm mt-1">{t("events:table.noEventsHelp")}</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-muted-foreground">{t("events:table.name")}</TableHead>
                    <TableHead className="text-muted-foreground hidden md:table-cell">
                      <span className="flex items-center">
                        {t("events:table.expiry")}
                        <InfoTooltip text={t("events:table.expiryTip")} />
                      </span>
                    </TableHead>
                    <TableHead className="text-muted-foreground hidden md:table-cell">{t("events:table.region")}</TableHead>
                    <TableHead className="text-muted-foreground hidden lg:table-cell">{t("events:table.progress")}</TableHead>
                    <TableHead className="text-muted-foreground">{t("events:table.status")}</TableHead>
                    <TableHead className="text-end text-muted-foreground">{t("events:table.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((evt) => {
                    const pct =
                      evt.targetHeadcount > 0
                        ? Math.round((evt.filledPositions / evt.targetHeadcount) * 100)
                        : 0;
                    return (
                      <TableRow key={evt.id} className="border-border hover:bg-muted/20" data-testid={`row-event-${evt.id}`}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-white"><bdi>{evt.name}</bdi></span>
                            {evt.eventType === "ongoing" && (
                              <Badge variant="outline" className="border-primary/30 text-primary bg-primary/10 text-[10px] font-medium gap-0.5 px-1.5 h-4">
                                <Infinity className="h-2.5 w-2.5" /> {t("events:table.ongoing")}
                              </Badge>
                            )}
                          </div>
                          {evt.description && (
                            <div className="text-xs text-muted-foreground mt-0.5 max-w-[260px] truncate">
                              <bdi>{evt.description}</bdi>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {evt.endDate ? (
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm font-medium text-white" dir="ltr">{evt.endDate}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Infinity className="h-3 w-3 text-primary" /> {t("events:table.noEndDate")}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <span className="text-sm text-muted-foreground"><bdi>{evt.region ?? "—"}</bdi></span>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell w-[200px]">
                          <div className="space-y-1.5">
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground flex items-center gap-1">
                                <Users className="h-3 w-3" /> {formatNumber(evt.filledPositions, i18n.language)} / {formatNumber(evt.targetHeadcount, i18n.language)}
                              </span>
                              <span className="text-white font-medium">{formatNumber(pct, i18n.language)}%</span>
                            </div>
                            <Progress value={pct} className="h-1.5" />
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <Badge
                              variant="outline"
                              className={`font-medium border-0 ${statusStyles[evt.status] ?? "bg-muted text-muted-foreground"}`}
                              data-testid={`status-event-${evt.id}`}
                            >
                              {t(`events:status.${evt.status}`, { defaultValue: evt.status })}
                            </Badge>
                            {evt.archivedAt && (
                              <Badge variant="outline" className="font-medium border-0 bg-zinc-800 text-zinc-500 text-[10px]">
                                {t("events:table.archived")}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-end">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-white" data-testid={`button-event-actions-${evt.id}`}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem onClick={() => setViewEvent(evt)} data-testid={`button-view-event-${evt.id}`}>
                                <Eye className="me-2 h-4 w-4" /> {t("events:row.view")}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setEditEvent(evt)} data-testid={`button-edit-event-${evt.id}`}>
                                <Pencil className="me-2 h-4 w-4" /> {t("events:row.edit")}
                              </DropdownMenuItem>
                              {(evt.status === "upcoming" || evt.status === "active" || evt.status === "closed") && !evt.archivedAt && (
                                <>
                                  <DropdownMenuSeparator />
                                  {evt.status === "upcoming" && (
                                    <DropdownMenuItem onClick={() => updateStatus.mutate({ id: evt.id, status: "active" })} data-testid={`button-activate-event-${evt.id}`}>
                                      <RefreshCw className="me-2 h-4 w-4" /> {t("events:row.activate")}
                                    </DropdownMenuItem>
                                  )}
                                  {evt.status === "active" && (
                                    <DropdownMenuItem
                                      className="text-red-400 focus:text-red-400"
                                      onClick={() => setCloseConfirmEvent(evt)}
                                      data-testid={`button-close-event-${evt.id}`}
                                    >
                                      <XCircle className="me-2 h-4 w-4" /> {t("events:row.close")}
                                    </DropdownMenuItem>
                                  )}
                                  {evt.status === "closed" && (
                                    <DropdownMenuItem
                                      className="text-green-400 focus:text-green-400"
                                      onClick={() => { setReopenConfirmEvent(evt); setReopenReason(""); }}
                                      data-testid={`button-reopen-event-${evt.id}`}
                                    >
                                      <RotateCcw className="me-2 h-4 w-4" /> {t("events:row.reopen")}
                                    </DropdownMenuItem>
                                  )}
                                </>
                              )}
                              <DropdownMenuSeparator />
                              {evt.archivedAt ? (
                                <DropdownMenuItem
                                  className="text-green-500"
                                  onClick={() => unarchiveEvent.mutate(evt.id)}
                                >
                                  <ArchiveRestore className="me-2 h-4 w-4" />
                                  {t("events:row.restore")}
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  className="text-amber-500"
                                  onClick={() => archiveEvent.mutate(evt.id)}
                                >
                                  <Archive className="me-2 h-4 w-4" />
                                  {t("events:row.archive")}
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={!!closeConfirmEvent} onOpenChange={(v) => { if (!v) setCloseConfirmEvent(null); }}>
        <AlertDialogContent className="bg-card border-border max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white font-display flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-400" />
              {t("events:close.title")}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-muted-foreground">
                <p>
                  <Trans
                    i18nKey="events:close.intro"
                    values={{ name: closeConfirmEvent?.name ?? "" }}
                    components={{ strong: <span className="text-white font-medium"><bdi /></span> }}
                  />
                </p>
                <div className="bg-red-500/5 border border-red-500/20 rounded-sm p-3 space-y-1.5 text-xs">
                  <p className="text-red-400 font-semibold uppercase tracking-wider">{t("events:close.warnTitle")}</p>
                  <ul className="space-y-1 list-disc list-inside text-muted-foreground">
                    <li>{t("events:close.warn1")}</li>
                    <li>{t("events:close.warn2")}</li>
                    <li>{t("events:close.warn3")}</li>
                    <li>{t("events:close.warn4")}</li>
                  </ul>
                </div>
                <p className="text-xs">{t("events:close.note")}</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="border-border rounded-sm"
              data-testid="button-cancel-close-event"
            >
              {t("events:close.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white rounded-sm"
              disabled={closeEvent.isPending}
              onClick={() => closeConfirmEvent && closeEvent.mutate(closeConfirmEvent.id)}
              data-testid="button-confirm-close-event"
            >
              {closeEvent.isPending ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <XCircle className="me-2 h-4 w-4" />}
              {t("events:close.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!reopenConfirmEvent} onOpenChange={(v) => { if (!v) { setReopenConfirmEvent(null); setReopenReason(""); } }}>
        <AlertDialogContent className="bg-card border-border max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white font-display flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-green-400" />
              {t("events:reopen.title")}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-muted-foreground">
                <p>
                  <Trans
                    i18nKey="events:reopen.intro"
                    values={{ name: reopenConfirmEvent?.name ?? "" }}
                    components={{
                      strong: <span className="text-white font-medium"><bdi /></span>,
                      strong2: <span className="text-white" />,
                    }}
                  />
                </p>
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-sm p-3 space-y-1.5 text-xs">
                  <p className="text-amber-400 font-semibold uppercase tracking-wider flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" /> {t("events:reopen.noteTitle")}
                  </p>
                  <ul className="space-y-1 list-disc list-inside text-muted-foreground">
                    <li>{t("events:reopen.note1")}</li>
                    <li>{t("events:reopen.note2")}</li>
                    <li>{t("events:reopen.note3")}</li>
                  </ul>
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-white">{t("events:reopen.reasonLabel")}</p>
                  <Input
                    value={reopenReason}
                    onChange={e => setReopenReason(e.target.value)}
                    placeholder={t("events:reopen.reasonPh")}
                    className="h-9 bg-muted/30 border-border rounded-sm text-sm"
                    data-testid="input-reopen-reason"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="border-border rounded-sm"
              data-testid="button-cancel-reopen-event"
            >
              {t("events:reopen.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-green-700 hover:bg-green-800 text-white rounded-sm"
              disabled={reopenEvent.isPending}
              onClick={() => reopenConfirmEvent && reopenEvent.mutate({ id: reopenConfirmEvent.id, reason: reopenReason || undefined })}
              data-testid="button-confirm-reopen-event"
            >
              {reopenEvent.isPending ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <RotateCcw className="me-2 h-4 w-4" />}
              {t("events:reopen.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </DashboardLayout>
  );
}
