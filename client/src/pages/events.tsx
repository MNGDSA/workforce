import DashboardLayout from "@/components/layout";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useState, useRef } from "react";
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

const statusStyles: Record<string, string> = {
  upcoming: "bg-blue-500/10 text-blue-500",
  active: "bg-green-500/10 text-green-500",
  closed: "bg-muted text-muted-foreground",
  archived: "bg-zinc-800 text-zinc-500",
};

const createEventSchema = z.object({
  name: z.string().min(3, "Event name is required"),
  description: z.string().optional(),
  eventType: z.enum(["duration_based", "ongoing"]),
  startDate: z.string().min(1, "Event start date is required"),
  endDate: z.string().optional(),
  region: z.string().optional(),
  targetHeadcount: z.coerce.number().int().min(0).default(0),
  budget: z.coerce.number().optional(),
  status: z.enum(["upcoming", "active"]),
});

type CreateEventForm = z.infer<typeof createEventSchema>;

function CreateEventDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

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
      targetHeadcount: 0,
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
      toast({ title: "Event created", description: "The event has been added successfully." });
      form.reset();
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create event.", variant: "destructive" });
    },
  });

  function onSubmit(data: CreateEventForm) {
    createEvent.mutate(data);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-white font-display text-xl">Create Event</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 pt-1">

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">
                    Event Name <span className="text-primary">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. Hajj 2026"
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
                    Description
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Brief overview of this event's scope and goals..."
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
              <p className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Created By</p>
              <Input
                value={currentUser?.fullName ?? "Loading..."}
                disabled
                className="h-10 bg-muted/10 border-border rounded-sm text-muted-foreground cursor-not-allowed"
                data-testid="input-event-created-by"
              />
            </div>

            <div className="w-full h-px bg-border" />

            {/* ── Event Type ──────────────────────────────────────────── */}
            <FormField
              control={form.control}
              name="eventType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">
                    Event Type <span className="text-primary">*</span>
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
                      <div className="text-left">
                        <div className="text-xs font-semibold">Duration Based</div>
                        <div className="text-[10px] opacity-70 font-normal">Has a fixed end date</div>
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
                      <div className="text-left">
                        <div className="text-xs font-semibold">Ongoing</div>
                        <div className="text-[10px] opacity-70 font-normal">No fixed end date</div>
                      </div>
                    </button>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* ── Timeline ────────────────────────────────────────────── */}
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Timeline</p>
            <div className={`grid gap-4 ${watchedEventType === "duration_based" ? "grid-cols-2" : "grid-cols-1"}`}>
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">
                      Event Start Date <span className="text-primary">*</span>
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
                        End Date
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
                This event has no fixed end date. Workers can be offboarded manually at any time.
              </p>
            )}

            <DialogFooter className="pt-1 flex gap-2 sm:justify-between">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                className="text-muted-foreground"
                data-testid="button-cancel-event"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-primary text-primary-foreground font-bold uppercase tracking-wide text-xs"
                disabled={createEvent.isPending}
                data-testid="button-submit-event"
              >
                {createEvent.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                Create Event
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function InfoTooltip({ text }: { text: string }) {
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
    <span className="inline-flex items-center ml-1.5 normal-case">
      <button
        ref={btnRef}
        type="button"
        className="inline-flex items-center justify-center text-muted-foreground/50 hover:text-primary transition-colors"
        onMouseEnter={show}
        onMouseLeave={() => setVisible(false)}
        aria-label="More information"
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
  if (!event) return null;
  const pct = event.targetHeadcount > 0 ? Math.round((event.filledPositions / event.targetHeadcount) * 100) : 0;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-white font-display text-xl">Event Details</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div>
            <p className="text-muted-foreground text-xs uppercase tracking-wider font-semibold mb-1">Event Name</p>
            <p className="text-white font-medium" data-testid="view-event-name">{event.name}</p>
          </div>
          {event.description && (
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wider font-semibold mb-1">Description</p>
              <p className="text-white text-sm" data-testid="view-event-description">{event.description}</p>
            </div>
          )}
          <div className="flex items-center gap-2">
            {event.eventType === "ongoing" ? (
              <Badge variant="outline" className="border-primary/40 text-primary bg-primary/10 font-medium gap-1">
                <Infinity className="h-3 w-3" /> Ongoing
              </Badge>
            ) : (
              <Badge variant="outline" className="border-border text-muted-foreground font-medium gap-1">
                <CalendarRange className="h-3 w-3" /> Duration Based
              </Badge>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wider font-semibold mb-1 flex items-center gap-1"><Calendar className="h-3 w-3" /> Event Start Date</p>
              <p className="text-white text-sm">{event.startDate}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wider font-semibold mb-1 flex items-center gap-1"><Clock className="h-3 w-3" /> End Date</p>
              {event.endDate ? (
                <p className="text-white text-sm">{event.endDate}</p>
              ) : (
                <p className="text-muted-foreground text-sm flex items-center gap-1"><Infinity className="h-3 w-3" /> Ongoing</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wider font-semibold mb-1 flex items-center gap-1"><MapPin className="h-3 w-3" /> Region</p>
              <p className="text-white text-sm">{event.region || "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wider font-semibold mb-1">Status</p>
              <Badge variant="outline" className={`font-medium border-0 capitalize ${statusStyles[event.status] ?? "bg-muted text-muted-foreground"}`}>
                {event.status}
              </Badge>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wider font-semibold mb-1 flex items-center gap-1"><Target className="h-3 w-3" /> Hiring Progress</p>
              <p className="text-white text-sm">{event.filledPositions} / {event.targetHeadcount} ({pct}%)</p>
              <Progress value={pct} className="h-1.5 mt-1.5" />
            </div>
            {event.budget != null && (
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wider font-semibold mb-1 flex items-center gap-1"><DollarSign className="h-3 w-3" /> Budget</p>
                <p className="text-white text-sm">{Number(event.budget).toLocaleString()} SAR</p>
              </div>
            )}
          </div>
          {event.createdBy && (
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wider font-semibold mb-1">Created By</p>
              <p className="text-white text-sm">{event.createdBy}</p>
            </div>
          )}
        </div>
        <DialogFooter className="pt-2">
          <Button variant="ghost" className="text-muted-foreground" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditEventDialog({ event, open, onOpenChange }: { event: Event | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

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
      toast({ title: "Event updated", description: "Changes saved successfully." });
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update event.", variant: "destructive" });
    },
  });

  if (!event) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-white font-display text-xl">Edit Event</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => updateEvent.mutate(data))} className="space-y-5 pt-1">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Event Name <span className="text-primary">*</span></FormLabel>
                <FormControl><Input placeholder="e.g. Hajj 2026" className="h-10 bg-muted/30 border-border rounded-sm" data-testid="edit-event-name" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Description</FormLabel>
                <FormControl><Textarea placeholder="Brief overview..." rows={3} className="bg-muted/30 border-border rounded-sm resize-none" data-testid="edit-event-description" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <div className="w-full h-px bg-border" />

            {/* ── Event Type ─────────────────────────────────────── */}
            <FormField control={form.control} name="eventType" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Event Type <span className="text-primary">*</span></FormLabel>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" data-testid="edit-radio-event-type-duration"
                    onClick={() => { field.onChange("duration_based"); form.setValue("endDate", ""); }}
                    className={`flex items-center gap-2.5 h-11 px-3 rounded-sm border text-sm font-medium transition-all ${field.value === "duration_based" ? "border-primary bg-primary/10 text-white" : "border-border bg-muted/20 text-muted-foreground hover:border-border/80"}`}
                  >
                    <CalendarRange className="h-4 w-4 shrink-0" />
                    <div className="text-left">
                      <div className="text-xs font-semibold">Duration Based</div>
                      <div className="text-[10px] opacity-70 font-normal">Has a fixed end date</div>
                    </div>
                  </button>
                  <button type="button" data-testid="edit-radio-event-type-ongoing"
                    onClick={() => { field.onChange("ongoing"); form.setValue("endDate", ""); }}
                    className={`flex items-center gap-2.5 h-11 px-3 rounded-sm border text-sm font-medium transition-all ${field.value === "ongoing" ? "border-primary bg-primary/10 text-white" : "border-border bg-muted/20 text-muted-foreground hover:border-border/80"}`}
                  >
                    <Infinity className="h-4 w-4 shrink-0" />
                    <div className="text-left">
                      <div className="text-xs font-semibold">Ongoing</div>
                      <div className="text-[10px] opacity-70 font-normal">No fixed end date</div>
                    </div>
                  </button>
                </div>
                <FormMessage />
              </FormItem>
            )} />

            {/* ── Timeline ────────────────────────────────────────── */}
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Timeline</p>
            <div className={`grid gap-4 ${watchedEventType === "duration_based" ? "grid-cols-2" : "grid-cols-1"}`}>
              <FormField control={form.control} name="startDate" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Event Start Date <span className="text-primary">*</span></FormLabel>
                  <FormControl><DatePickerField value={field.value} onChange={field.onChange} className="h-10 bg-muted/30 border-border rounded-sm" data-testid="edit-event-start-date" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              {watchedEventType === "duration_based" && (
                <FormField control={form.control} name="endDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">End Date</FormLabel>
                    <FormControl><DatePickerField value={field.value ?? ""} onChange={field.onChange} className="h-10 bg-muted/30 border-border rounded-sm" data-testid="edit-event-end-date" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              )}
            </div>
            {watchedEventType === "ongoing" && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5 -mt-2">
                <Infinity className="h-3 w-3 text-primary" />
                This event has no fixed end date. Workers can be offboarded manually at any time.
              </p>
            )}

            <DialogFooter className="pt-1 flex gap-2 sm:justify-between">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="text-muted-foreground">Cancel</Button>
              <Button type="submit" className="bg-primary text-primary-foreground font-bold uppercase tracking-wide text-xs" disabled={updateEvent.isPending} data-testid="button-save-event">
                {updateEvent.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Pencil className="mr-2 h-4 w-4" />}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function EventsPage() {
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
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      const name = closeConfirmEvent?.name ?? "Event";
      setCloseConfirmEvent(null);
      toast({ title: `"${name}" closed`, description: "Workers with completed service periods will appear in the offboarding queue." });
    },
    onError: () => toast({ title: "Error", description: "Failed to close event.", variant: "destructive" }),
  });

  const reopenEvent = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      apiRequest("POST", `/api/events/${id}/reopen`, { reason }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      const name = reopenConfirmEvent?.name ?? "Event";
      setReopenConfirmEvent(null);
      setReopenReason("");
      toast({ title: `"${name}" reopened`, description: "Event is now active again." });
    },
    onError: () => toast({ title: "Error", description: "Failed to reopen event.", variant: "destructive" }),
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
            <h1 className="text-3xl font-display font-bold text-white tracking-tight">Events Management</h1>
            <p className="text-muted-foreground mt-1">Plan and track your event workforce requirements.</p>
          </div>
          <Button
            className="h-11 bg-primary text-primary-foreground font-bold uppercase tracking-wide text-xs"
            data-testid="button-create-event"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="mr-2 h-4 w-4" />
            Create Event
          </Button>
        </div>

        <CreateEventDialog open={createOpen} onOpenChange={setCreateOpen} />
        <ViewEventDialog event={viewEvent} open={!!viewEvent} onOpenChange={(v) => { if (!v) setViewEvent(null); }} />
        <EditEventDialog event={editEvent} open={!!editEvent} onOpenChange={(v) => { if (!v) setEditEvent(null); }} />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-card border-border shadow-sm border-l-4 border-l-primary">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Events</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-white" data-testid="stat-total-events">{eventsList.length}</div>
              <p className="text-xs text-muted-foreground mt-1">Across all time</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Active Campaigns</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-white" data-testid="stat-active-events">{activeCount}</div>
              <p className="text-xs text-muted-foreground mt-1">Currently in progress</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Upcoming</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-white" data-testid="stat-upcoming-events">{upcomingCount}</div>
              <p className="text-xs text-muted-foreground mt-1">In planning phase</p>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col md:flex-row gap-4 items-center bg-card p-4 rounded-sm border border-border">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="Search events by name or region..."
              className="pl-10 h-12 bg-muted/30 border-border focus-visible:ring-primary/20 text-base"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-search-events"
            />
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <Button variant="outline" className="h-12 border-border bg-background flex-1 md:flex-none">
              <Filter className="mr-2 h-4 w-4" />
              Status
            </Button>
            <Button variant="outline" className="h-12 border-border bg-background flex-1 md:flex-none">
              <Calendar className="mr-2 h-4 w-4" />
              Date Range
            </Button>
            <Button
              variant={showArchived ? "default" : "outline"}
              className={`h-12 border-border flex-1 md:flex-none ${showArchived ? "bg-amber-600 hover:bg-amber-700 text-white" : "bg-background"}`}
              onClick={() => setShowArchived(!showArchived)}
              data-testid="button-toggle-archived"
            >
              <Archive className="mr-2 h-4 w-4" />
              {showArchived ? "Showing All" : "Show Archived"}
            </Button>
          </div>
        </div>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg font-display text-white">Events</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Calendar className="h-12 w-12 text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground font-medium">No events found</p>
                <p className="text-muted-foreground/60 text-sm mt-1">Create your first event to get started</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-muted-foreground">Event Name</TableHead>
                    <TableHead className="text-muted-foreground hidden md:table-cell">
                      <span className="flex items-center">
                        Expiry
                        <InfoTooltip text="SMP Contracts expiry dates should be set as the project's contractual expiry date." />
                      </span>
                    </TableHead>
                    <TableHead className="text-muted-foreground hidden md:table-cell">Region</TableHead>
                    <TableHead className="text-muted-foreground hidden lg:table-cell">Hiring Progress</TableHead>
                    <TableHead className="text-muted-foreground">Status</TableHead>
                    <TableHead className="text-right text-muted-foreground">Actions</TableHead>
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
                            <span className="font-medium text-white">{evt.name}</span>
                            {evt.eventType === "ongoing" && (
                              <Badge variant="outline" className="border-primary/30 text-primary bg-primary/10 text-[10px] font-medium gap-0.5 px-1.5 h-4">
                                <Infinity className="h-2.5 w-2.5" /> Ongoing
                              </Badge>
                            )}
                          </div>
                          {evt.description && (
                            <div className="text-xs text-muted-foreground mt-0.5 max-w-[260px] truncate">
                              {evt.description}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {evt.endDate ? (
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm font-medium text-white">{evt.endDate}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Infinity className="h-3 w-3 text-primary" /> No end date
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <span className="text-sm text-muted-foreground">{evt.region ?? "—"}</span>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell w-[200px]">
                          <div className="space-y-1.5">
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground flex items-center gap-1">
                                <Users className="h-3 w-3" /> {evt.filledPositions} / {evt.targetHeadcount}
                              </span>
                              <span className="text-white font-medium">{pct}%</span>
                            </div>
                            <Progress value={pct} className="h-1.5" />
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <Badge
                              variant="outline"
                              className={`font-medium border-0 capitalize ${statusStyles[evt.status] ?? "bg-muted text-muted-foreground"}`}
                              data-testid={`status-event-${evt.id}`}
                            >
                              {evt.status}
                            </Badge>
                            {evt.archivedAt && (
                              <Badge variant="outline" className="font-medium border-0 bg-zinc-800 text-zinc-500 text-[10px]">
                                Archived
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-white" data-testid={`button-event-actions-${evt.id}`}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem onClick={() => setViewEvent(evt)} data-testid={`button-view-event-${evt.id}`}>
                                <Eye className="mr-2 h-4 w-4" /> View Details
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setEditEvent(evt)} data-testid={`button-edit-event-${evt.id}`}>
                                <Pencil className="mr-2 h-4 w-4" /> Edit Event
                              </DropdownMenuItem>
                              {(evt.status === "upcoming" || evt.status === "active" || evt.status === "closed") && !evt.archivedAt && (
                                <>
                                  <DropdownMenuSeparator />
                                  {evt.status === "upcoming" && (
                                    <DropdownMenuItem onClick={() => updateStatus.mutate({ id: evt.id, status: "active" })} data-testid={`button-activate-event-${evt.id}`}>
                                      <RefreshCw className="mr-2 h-4 w-4" /> Activate
                                    </DropdownMenuItem>
                                  )}
                                  {evt.status === "active" && (
                                    <DropdownMenuItem
                                      className="text-red-400 focus:text-red-400"
                                      onClick={() => setCloseConfirmEvent(evt)}
                                      data-testid={`button-close-event-${evt.id}`}
                                    >
                                      <XCircle className="mr-2 h-4 w-4" /> Close Event
                                    </DropdownMenuItem>
                                  )}
                                  {evt.status === "closed" && (
                                    <DropdownMenuItem
                                      className="text-green-400 focus:text-green-400"
                                      onClick={() => { setReopenConfirmEvent(evt); setReopenReason(""); }}
                                      data-testid={`button-reopen-event-${evt.id}`}
                                    >
                                      <RotateCcw className="mr-2 h-4 w-4" /> Reopen Event
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
                                  <ArchiveRestore className="mr-2 h-4 w-4" />
                                  Restore
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  className="text-amber-500"
                                  onClick={() => archiveEvent.mutate(evt.id)}
                                >
                                  <Archive className="mr-2 h-4 w-4" />
                                  Archive
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

      {/* ── Close Event confirmation ─────────────────────────────────────────── */}
      <AlertDialog open={!!closeConfirmEvent} onOpenChange={(v) => { if (!v) setCloseConfirmEvent(null); }}>
        <AlertDialogContent className="bg-card border-border max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white font-display flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-400" />
              Close Event?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-muted-foreground">
                <p>
                  You are about to close <span className="text-white font-medium">"{closeConfirmEvent?.name}"</span>.
                </p>
                <div className="bg-red-500/5 border border-red-500/20 rounded-sm p-3 space-y-1.5 text-xs">
                  <p className="text-red-400 font-semibold uppercase tracking-wider">Impact Warning</p>
                  <ul className="space-y-1 list-disc list-inside text-muted-foreground">
                    <li>All active workers assigned to this event will become eligible for offboarding</li>
                    <li>Payroll cycles referencing this event will be finalised</li>
                    <li>New workers cannot be assigned to a closed event</li>
                    <li>This action is recorded in the audit log</li>
                  </ul>
                </div>
                <p className="text-xs">You can reopen the event later if needed.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="border-border rounded-sm"
              data-testid="button-cancel-close-event"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white rounded-sm"
              disabled={closeEvent.isPending}
              onClick={() => closeConfirmEvent && closeEvent.mutate(closeConfirmEvent.id)}
              data-testid="button-confirm-close-event"
            >
              {closeEvent.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
              Close Event
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Reopen Event confirmation ────────────────────────────────────────── */}
      <AlertDialog open={!!reopenConfirmEvent} onOpenChange={(v) => { if (!v) { setReopenConfirmEvent(null); setReopenReason(""); } }}>
        <AlertDialogContent className="bg-card border-border max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white font-display flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-green-400" />
              Reopen Event?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-muted-foreground">
                <p>
                  You are about to reopen <span className="text-white font-medium">"{reopenConfirmEvent?.name}"</span> and set it back to <span className="text-white">Active</span>.
                </p>
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-sm p-3 space-y-1.5 text-xs">
                  <p className="text-amber-400 font-semibold uppercase tracking-wider flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" /> Note
                  </p>
                  <ul className="space-y-1 list-disc list-inside text-muted-foreground">
                    <li>Employees already in the offboarding queue will remain there</li>
                    <li>Workers can be assigned to this event again</li>
                    <li>This action is recorded in the audit log</li>
                  </ul>
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-white">Reason for reopening (optional)</p>
                  <Input
                    value={reopenReason}
                    onChange={e => setReopenReason(e.target.value)}
                    placeholder="e.g. Event dates extended, error correction..."
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
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-green-700 hover:bg-green-800 text-white rounded-sm"
              disabled={reopenEvent.isPending}
              onClick={() => reopenConfirmEvent && reopenEvent.mutate({ id: reopenConfirmEvent.id, reason: reopenReason || undefined })}
              data-testid="button-confirm-reopen-event"
            >
              {reopenEvent.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
              Reopen Event
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </DashboardLayout>
  );
}
