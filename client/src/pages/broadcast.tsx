import { useState, useMemo, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
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
  ArrowLeft,
  Send,
  Search,
  Users,
  MessageSquare,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  Hash,
  Loader2,
  Radio,
  History,
  AlertTriangle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

interface WorkforceEmployee {
  id: string;
  employeeNumber: string;
  fullNameEn: string | null;
  fullNameAr: string | null;
  phone: string | null;
  positionTitle: string | null;
  departmentName: string | null;
  eventName: string | null;
  employmentType: string;
  smpCompanyName: string | null;
  photoUrl: string | null;
  isActive: boolean;
}

interface BroadcastRecord {
  id: string;
  messageTemplate: string;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  status: "sending" | "completed" | "failed";
  createdAt: string;
  recipients?: RecipientRecord[];
}

interface RecipientRecord {
  id: string;
  recipientName: string | null;
  phone: string;
  resolvedMessage: string;
  status: "pending" | "sent" | "failed";
  error: string | null;
  sentAt: string | null;
}

const TEMPLATE_TAGS = [
  { tag: "{name}", label: "Name", icon: "👤" },
  { tag: "{employee_number}", label: "Employee #", icon: "#" },
  { tag: "{position}", label: "Position", icon: "💼" },
  { tag: "{department}", label: "Department", icon: "🏢" },
  { tag: "{event}", label: "Event", icon: "📅" },
];

function requiresUnicode(text: string): boolean {
  const gsm7 = new Set([
    ...'@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\x1BÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ`¿abcdefghijklmnopqrstuvwxyzäöñüà',
  ]);
  return [...text].some((ch) => !gsm7.has(ch));
}

function getCharCount(text: string) {
  const isUnicode = requiresUnicode(text);
  const maxPerSegment = isUnicode ? 70 : 160;
  const chars = text.length;
  const segments = chars === 0 ? 0 : Math.ceil(chars / maxPerSegment);
  return { chars, segments, maxPerSegment, isUnicode };
}

export default function BroadcastPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [message, setMessage] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [positionFilter, setPositionFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [eventFilter, setEventFilter] = useState("all");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [expandedBroadcast, setExpandedBroadcast] = useState<string | null>(null);
  const [tab, setTab] = useState<"compose" | "history">("compose");

  const { data: employees = [], isLoading: loadingEmployees } = useQuery<WorkforceEmployee[]>({
    queryKey: ["/api/workforce", "active-broadcast"],
    queryFn: () => apiRequest("GET", "/api/workforce?isActive=true").then(r => r.json()),
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: broadcastsData, isLoading: loadingHistory } = useQuery<{ data: BroadcastRecord[]; total: number }>({
    queryKey: ["/api/broadcasts"],
    queryFn: () => apiRequest("GET", "/api/broadcasts?limit=50").then(r => r.json()),
  });
  const broadcasts = broadcastsData?.data ?? [];

  const { data: expandedDetail } = useQuery<BroadcastRecord>({
    queryKey: ["/api/broadcasts", expandedBroadcast],
    queryFn: () => apiRequest("GET", `/api/broadcasts/${expandedBroadcast}`).then(r => r.json()),
    enabled: !!expandedBroadcast,
  });

  const sendMutation = useMutation({
    mutationFn: (body: { messageTemplate: string; workforceIds: string[] }) =>
      apiRequest("POST", "/api/broadcasts", body).then(r => r.json()),
    onSuccess: (data) => {
      toast({ title: "Broadcast Sent", description: `SMS queued for ${data.recipientCount} recipients.` });
      setMessage("");
      setSelectedIds(new Set());
      qc.invalidateQueries({ queryKey: ["/api/broadcasts"] });
      setTab("history");
    },
    onError: (e: Error) => toast({ title: "Broadcast Failed", description: e.message, variant: "destructive" }),
  });

  const activeEmployees = useMemo(() => employees.filter(e => e.isActive), [employees]);

  const positions = useMemo(() => {
    const set = new Set<string>();
    activeEmployees.forEach(e => { if (e.positionTitle) set.add(e.positionTitle); });
    return Array.from(set).sort();
  }, [activeEmployees]);

  const departmentsList = useMemo(() => {
    const set = new Set<string>();
    activeEmployees.forEach(e => { if (e.departmentName) set.add(e.departmentName); });
    return Array.from(set).sort();
  }, [activeEmployees]);

  const eventsList = useMemo(() => {
    const set = new Set<string>();
    activeEmployees.forEach(e => { if (e.eventName) set.add(e.eventName); });
    return Array.from(set).sort();
  }, [activeEmployees]);

  const filteredEmployees = useMemo(() => {
    return activeEmployees.filter(e => {
      if (search) {
        const q = search.toLowerCase();
        const match = (e.fullNameEn?.toLowerCase().includes(q)) ||
          (e.fullNameAr?.toLowerCase().includes(q)) ||
          (e.employeeNumber?.toLowerCase().includes(q)) ||
          (e.phone?.includes(q));
        if (!match) return false;
      }
      if (positionFilter !== "all" && e.positionTitle !== positionFilter) return false;
      if (departmentFilter !== "all" && e.departmentName !== departmentFilter) return false;
      if (typeFilter !== "all" && e.employmentType !== typeFilter) return false;
      if (eventFilter !== "all" && e.eventName !== eventFilter) return false;
      return true;
    });
  }, [activeEmployees, search, positionFilter, departmentFilter, typeFilter, eventFilter]);

  const allFilteredSelected = filteredEmployees.length > 0 && filteredEmployees.every(e => selectedIds.has(e.id));
  const someFilteredSelected = filteredEmployees.some(e => selectedIds.has(e.id));
  const recipientsWithPhone = useMemo(() => {
    return activeEmployees.filter(e => selectedIds.has(e.id) && e.phone).length;
  }, [activeEmployees, selectedIds]);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filteredEmployees.forEach(e => next.delete(e.id));
      } else {
        filteredEmployees.forEach(e => next.add(e.id));
      }
      return next;
    });
  }, [filteredEmployees, allFilteredSelected]);

  const toggleOne = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const insertTag = useCallback((tag: string) => {
    const ta = textareaRef.current;
    if (!ta) {
      setMessage(prev => prev + tag);
      return;
    }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const before = message.slice(0, start);
    const after = message.slice(end);
    const newMsg = before + tag + after;
    setMessage(newMsg);
    setTimeout(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = start + tag.length;
    }, 0);
  }, [message]);

  const charInfo = getCharCount(message);

  const handleSend = () => {
    if (!message.trim()) {
      toast({ title: "Empty Message", description: "Please write a message first.", variant: "destructive" });
      return;
    }
    if (selectedIds.size === 0) {
      toast({ title: "No Recipients", description: "Select at least one employee.", variant: "destructive" });
      return;
    }
    setConfirmOpen(true);
  };

  const confirmSend = () => {
    setConfirmOpen(false);
    sendMutation.mutate({
      messageTemplate: message,
      workforceIds: Array.from(selectedIds),
    });
  };

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/workforce")}
            className="text-muted-foreground hover:text-white shrink-0"
            data-testid="button-back-workforce"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-3xl font-display font-bold text-white tracking-tight" data-testid="text-page-title">
              SMS Broadcast
            </h1>
            <p className="text-muted-foreground mt-1">Send mass SMS messages to your workforce</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant={tab === "compose" ? "default" : "outline"}
              onClick={() => setTab("compose")}
              className={cn(
                "gap-2",
                tab === "compose"
                  ? "bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:text-white"
              )}
              data-testid="tab-compose"
            >
              <MessageSquare className="h-4 w-4" />
              Compose
            </Button>
            <Button
              variant={tab === "history" ? "default" : "outline"}
              onClick={() => setTab("history")}
              className={cn(
                "gap-2",
                tab === "history"
                  ? "bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:text-white"
              )}
              data-testid="tab-history"
            >
              <History className="h-4 w-4" />
              History
              {broadcasts.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs">{broadcasts.length}</Badge>
              )}
            </Button>
          </div>
        </div>

        {tab === "compose" && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <Card className="bg-card border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base text-white flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-primary" />
                    Message Template
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wider font-semibold">Insert Variable</p>
                    <div className="flex flex-wrap gap-1.5">
                      {TEMPLATE_TAGS.map(t => (
                        <button
                          key={t.tag}
                          onClick={() => insertTag(t.tag)}
                          className="px-2.5 py-1.5 rounded-md bg-primary/10 border border-primary/20 text-primary text-xs font-mono hover:bg-primary/20 transition-colors cursor-pointer"
                          data-testid={`tag-${t.tag.replace(/[{}]/g, "")}`}
                        >
                          {t.tag}
                        </button>
                      ))}
                    </div>
                  </div>

                  <Textarea
                    ref={textareaRef}
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    placeholder="Type your message here... Use tags like {name} to personalize."
                    rows={6}
                    className="bg-muted/30 border-border font-mono text-sm resize-none"
                    data-testid="input-message"
                  />

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center gap-3">
                      <span>{charInfo.chars} chars</span>
                      <span>{charInfo.segments} segment{charInfo.segments !== 1 ? "s" : ""}</span>
                    </div>
                    <span className={cn(
                      charInfo.isUnicode ? "text-amber-400" : "text-muted-foreground"
                    )}>
                      {charInfo.isUnicode ? "Unicode (Arabic)" : "GSM-7"} · {charInfo.maxPerSegment}/segment
                    </span>
                  </div>

                  <Separator className="bg-border" />

                  <div className="flex items-center justify-between">
                    <div className="text-sm">
                      <span className="text-muted-foreground">Recipients: </span>
                      <span className="text-white font-semibold">{selectedIds.size}</span>
                      {recipientsWithPhone < selectedIds.size && (
                        <span className="text-amber-400 text-xs ml-2">
                          ({selectedIds.size - recipientsWithPhone} without phone)
                        </span>
                      )}
                    </div>
                    <Button
                      onClick={handleSend}
                      disabled={sendMutation.isPending || !message.trim() || selectedIds.size === 0}
                      className="bg-primary text-primary-foreground font-bold gap-2"
                      data-testid="button-send-broadcast"
                    >
                      {sendMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                      Send Broadcast
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {message && (
                <Card className="bg-card border-border">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Preview</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="bg-muted/20 rounded-md p-3 text-sm text-white font-mono whitespace-pre-wrap" data-testid="text-message-preview">
                      {message
                        .replace(/\{name\}/g, "Ahmed Al-Harbi")
                        .replace(/\{employee_number\}/g, "C000042")
                        .replace(/\{position\}/g, "Golf Cart Operator")
                        .replace(/\{department\}/g, "Operations")
                        .replace(/\{event\}/g, "Ramadan 1447")}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            <div className="lg:col-span-3">
              <Card className="bg-card border-border">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base text-white flex items-center gap-2">
                      <Users className="h-4 w-4 text-primary" />
                      Select Recipients
                      <Badge variant="secondary" className="text-xs ml-1">
                        {activeEmployees.length} active
                      </Badge>
                    </CardTitle>
                    {selectedIds.size > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedIds(new Set())}
                        className="text-xs text-muted-foreground hover:text-white"
                        data-testid="button-clear-selection"
                      >
                        Clear ({selectedIds.size})
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search by name, ID, or phone..."
                        className="pl-9 bg-muted/30 border-border"
                        data-testid="input-search-employees"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <Select value={positionFilter} onValueChange={setPositionFilter}>
                      <SelectTrigger className="bg-muted/30 border-border text-xs h-9" data-testid="filter-position">
                        <SelectValue placeholder="Position" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Positions</SelectItem>
                        {positions.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                      <SelectTrigger className="bg-muted/30 border-border text-xs h-9" data-testid="filter-department">
                        <SelectValue placeholder="Department" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Departments</SelectItem>
                        {departmentsList.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={typeFilter} onValueChange={setTypeFilter}>
                      <SelectTrigger className="bg-muted/30 border-border text-xs h-9" data-testid="filter-type">
                        <SelectValue placeholder="Type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="individual">Individual</SelectItem>
                        <SelectItem value="smp">SMP</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={eventFilter} onValueChange={setEventFilter}>
                      <SelectTrigger className="bg-muted/30 border-border text-xs h-9" data-testid="filter-event">
                        <SelectValue placeholder="Event" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Events</SelectItem>
                        {eventsList.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="border border-border rounded-md overflow-hidden">
                    <div className="flex items-center gap-3 px-3 py-2 bg-muted/20 border-b border-border">
                      <Checkbox
                        checked={allFilteredSelected}
                        onCheckedChange={toggleSelectAll}
                        data-testid="checkbox-select-all"
                        className={someFilteredSelected && !allFilteredSelected ? "data-[state=checked]:bg-primary/50" : ""}
                      />
                      <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider flex-1">
                        {filteredEmployees.length} employee{filteredEmployees.length !== 1 ? "s" : ""}
                        {selectedIds.size > 0 && ` · ${selectedIds.size} selected`}
                      </span>
                      <span className="text-xs text-muted-foreground">Phone</span>
                    </div>

                    <div className="max-h-[480px] overflow-y-auto">
                      {loadingEmployees ? (
                        <div className="p-8 text-center">
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto" />
                          <p className="text-sm text-muted-foreground mt-2">Loading workforce...</p>
                        </div>
                      ) : filteredEmployees.length === 0 ? (
                        <div className="p-8 text-center">
                          <Users className="h-8 w-8 text-muted-foreground/30 mx-auto" />
                          <p className="text-sm text-muted-foreground mt-2">No employees match your filters</p>
                        </div>
                      ) : (
                        filteredEmployees.map(emp => (
                          <label
                            key={emp.id}
                            className={cn(
                              "flex items-center gap-3 px-3 py-2.5 border-b border-border/50 cursor-pointer transition-colors hover:bg-muted/10",
                              selectedIds.has(emp.id) && "bg-primary/5"
                            )}
                            data-testid={`row-employee-${emp.employeeNumber}`}
                          >
                            <Checkbox
                              checked={selectedIds.has(emp.id)}
                              onCheckedChange={() => toggleOne(emp.id)}
                            />
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              {emp.photoUrl ? (
                                <img src={emp.photoUrl} alt="" className="h-8 w-8 rounded-full object-cover shrink-0" />
                              ) : (
                                <div className="h-8 w-8 rounded-full bg-muted/30 flex items-center justify-center shrink-0">
                                  <span className="text-xs text-muted-foreground font-semibold">
                                    {(emp.fullNameEn || "?")[0]}
                                  </span>
                                </div>
                              )}
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm text-white font-medium truncate">
                                    {emp.fullNameEn || emp.fullNameAr || "Unknown"}
                                  </span>
                                  <span className="text-xs text-muted-foreground font-mono">{emp.employeeNumber}</span>
                                </div>
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                  {emp.positionTitle && <span>{emp.positionTitle}</span>}
                                  {emp.positionTitle && emp.departmentName && <span>·</span>}
                                  {emp.departmentName && <span>{emp.departmentName}</span>}
                                  {emp.employmentType === "smp" && (
                                    <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-amber-500/30 text-amber-400">SMP</Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="shrink-0 text-xs text-muted-foreground font-mono">
                              {emp.phone || (
                                <span className="text-amber-400 flex items-center gap-1">
                                  <AlertTriangle className="h-3 w-3" /> No phone
                                </span>
                              )}
                            </div>
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {tab === "history" && (
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-white flex items-center gap-2">
                <History className="h-4 w-4 text-primary" />
                Broadcast History
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingHistory ? (
                <div className="p-8 text-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto" />
                </div>
              ) : broadcasts.length === 0 ? (
                <div className="p-8 text-center">
                  <Radio className="h-8 w-8 text-muted-foreground/30 mx-auto" />
                  <p className="text-sm text-muted-foreground mt-2">No broadcasts yet</p>
                  <Button variant="outline" size="sm" className="mt-3 border-border" onClick={() => setTab("compose")} data-testid="button-compose-first">
                    Send your first broadcast
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {broadcasts.map(b => {
                    const isExpanded = expandedBroadcast === b.id;
                    const detail = isExpanded ? expandedDetail : null;
                    return (
                      <div key={b.id} className="border border-border rounded-md overflow-hidden">
                        <button
                          onClick={() => setExpandedBroadcast(isExpanded ? null : b.id)}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/10 transition-colors text-left"
                          data-testid={`broadcast-row-${b.id}`}
                        >
                          <div className={cn(
                            "h-8 w-8 rounded-full flex items-center justify-center shrink-0",
                            b.status === "completed" && b.failedCount === 0 ? "bg-emerald-500/15 text-emerald-400" :
                            b.status === "completed" && b.failedCount > 0 ? "bg-amber-500/15 text-amber-400" :
                            b.status === "sending" ? "bg-blue-500/15 text-blue-400" :
                            "bg-red-500/15 text-red-400"
                          )}>
                            {b.status === "sending" ? <Loader2 className="h-4 w-4 animate-spin" /> :
                             b.status === "completed" && b.failedCount === 0 ? <CheckCircle2 className="h-4 w-4" /> :
                             b.status === "completed" ? <AlertTriangle className="h-4 w-4" /> :
                             <XCircle className="h-4 w-4" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white truncate font-mono">{b.messageTemplate}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {new Date(b.createdAt).toLocaleString()} · {b.totalRecipients} recipients
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {b.sentCount > 0 && (
                              <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/20 text-xs">
                                {b.sentCount} sent
                              </Badge>
                            )}
                            {b.failedCount > 0 && (
                              <Badge className="bg-red-500/15 text-red-400 border-red-500/20 text-xs">
                                {b.failedCount} failed
                              </Badge>
                            )}
                            {b.status === "sending" && (
                              <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/20 text-xs">
                                Sending...
                              </Badge>
                            )}
                            {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                          </div>
                        </button>

                        {isExpanded && detail?.recipients && (
                          <div className="border-t border-border bg-muted/5">
                            <div className="px-4 py-2 bg-muted/10 border-b border-border/50">
                              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                                Recipients ({detail.recipients.length})
                              </p>
                            </div>
                            <div className="max-h-[300px] overflow-y-auto">
                              {detail.recipients.map(r => (
                                <div key={r.id} className="flex items-center gap-3 px-4 py-2 border-b border-border/30 text-sm">
                                  {r.status === "sent" ? (
                                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                                  ) : r.status === "failed" ? (
                                    <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                                  ) : (
                                    <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                                  )}
                                  <span className="text-white flex-1 min-w-0 truncate">{r.recipientName || "Unknown"}</span>
                                  <span className="text-muted-foreground font-mono text-xs shrink-0">{r.phone}</span>
                                  {r.error && (
                                    <span className="text-red-400 text-xs truncate max-w-[200px]" title={r.error}>{r.error}</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Broadcast</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to send an SMS to <strong>{recipientsWithPhone}</strong> employee{recipientsWithPhone !== 1 ? "s" : ""}.
              {selectedIds.size > recipientsWithPhone && (
                <span className="block mt-1 text-amber-400">
                  {selectedIds.size - recipientsWithPhone} selected employee(s) have no phone number and will be skipped.
                </span>
              )}
              <span className="block mt-2">This action cannot be undone. Each SMS will be sent via the active SMS gateway plugin.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSend} className="bg-primary text-primary-foreground" data-testid="button-confirm-send">
              <Send className="h-4 w-4 mr-2" />
              Send to {recipientsWithPhone} recipients
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
