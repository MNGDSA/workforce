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
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
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
      startDate: "",
      endDate: "",
      region: "",
      targetHeadcount: 0,
      budget: undefined,
      status: "upcoming",
    },
  });

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
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Timeline</p>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">
                      Start Date <span className="text-primary">*</span>
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
              <FormField
                control={form.control}
                name="endDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">
                      End Date <span className="text-primary">*</span>
                    </FormLabel>
                    <FormControl>
                      <DatePickerField
                        value={field.value}
                        onChange={field.onChange}
                        className="h-10 bg-muted/30 border-border focus-visible:border-primary/50 rounded-sm"
                        data-testid="input-event-end-date"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

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

export default function EventsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const { data: eventsList = [], isLoading } = useQuery<Event[]>({
    queryKey: ["/api/events", showArchived],
    queryFn: () => apiRequest("GET", `/api/events${showArchived ? "?archived=true" : ""}`).then((r) => r.json()),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/events/${id}`, { status }).then((r) => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/events"] }),
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
                          <div className="font-medium text-white">{evt.name}</div>
                          {evt.description && (
                            <div className="text-xs text-muted-foreground mt-0.5 max-w-[260px] truncate">
                              {evt.description}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium text-white">{evt.endDate}</span>
                          </div>
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
                              <DropdownMenuItem>View Details</DropdownMenuItem>
                              <DropdownMenuItem>Edit Event</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {evt.status === "upcoming" && (
                                <DropdownMenuItem onClick={() => updateStatus.mutate({ id: evt.id, status: "active" })}>
                                  Activate
                                </DropdownMenuItem>
                              )}
                              {evt.status === "active" && (
                                <DropdownMenuItem onClick={() => updateStatus.mutate({ id: evt.id, status: "closed" })}>
                                  Close Event
                                </DropdownMenuItem>
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
    </DashboardLayout>
  );
}
