import DashboardLayout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import {
  Workflow,
  Plus,
  Search,
  MessageSquare,
  Mail,
  UserCheck,
  Calendar,
  AlertTriangle,
  Zap,
  PlayCircle,
  MoreHorizontal,
  ArrowRight,
  Loader2,
  Send,
  PhoneCall,
  FileText,
  RefreshCw,
  ShieldAlert,
  Users,
  ClipboardCheck,
  TrendingUp,
  Bell,
  CheckCheck,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AutomationRule } from "@shared/schema";

// ─── Trigger → icon / colour mapping ────────────────────────────────────────
const iconMap: Record<string, React.ElementType> = {
  "candidate.created": MessageSquare,
  "interview.scheduled": Calendar,
  "candidate.incomplete_profile": AlertTriangle,
  "application.submitted": UserCheck,
  "workforce.contract_ending": Zap,
};

const colorMap: Record<string, { color: string; bg: string }> = {
  "candidate.created": { color: "text-emerald-500", bg: "bg-emerald-500/10" },
  "interview.scheduled": { color: "text-blue-500", bg: "bg-blue-500/10" },
  "candidate.incomplete_profile": { color: "text-amber-500", bg: "bg-amber-500/10" },
  "application.submitted": { color: "text-purple-500", bg: "bg-purple-500/10" },
  "workforce.contract_ending": { color: "text-orange-500", bg: "bg-orange-500/10" },
};

function getIconStyle(trigger: string) {
  return colorMap[trigger] ?? { color: "text-primary", bg: "bg-primary/10" };
}
function getIcon(trigger: string): React.ElementType {
  return iconMap[trigger] ?? Workflow;
}

// ─── Category filters ────────────────────────────────────────────────────────
const COMMUNICATION_TRIGGERS = ["candidate.created", "interview.scheduled", "application.submitted"];
const PIPELINE_TRIGGERS      = ["candidate.incomplete_profile", "workforce.contract_ending"];

// ─── Template definitions ────────────────────────────────────────────────────
interface RuleTemplate {
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  title: string;
  description: string;
  when: string;
  then: string;
  tag: string;
  tagColor: string;
}

const COMMUNICATION_TEMPLATES: RuleTemplate[] = [
  {
    icon: Mail,
    iconColor: "text-rose-400",
    iconBg: "bg-rose-500/10",
    title: "Rejection Notice Email",
    description: "Automatically email candidates when their application is rejected.",
    when: "application.rejected",
    then: "email.send › rejection_template",
    tag: "Email",
    tagColor: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  },
  {
    icon: CheckCheck,
    iconColor: "text-green-400",
    iconBg: "bg-green-500/10",
    title: "Offer Letter Email",
    description: "Send a personalised offer letter email when a candidate is marked as hired.",
    when: "candidate.hired",
    then: "email.send › offer_letter_template",
    tag: "Email",
    tagColor: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  },
  {
    icon: FileText,
    iconColor: "text-amber-400",
    iconBg: "bg-amber-500/10",
    title: "Document Request SMS",
    description: "Notify candidates via SMS when required documents are missing from their profile.",
    when: "candidate.documents_missing",
    then: "sms.send › document_request",
    tag: "SMS",
    tagColor: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  },
  {
    icon: RefreshCw,
    iconColor: "text-sky-400",
    iconBg: "bg-sky-500/10",
    title: "Interview Reschedule Alert",
    description: "Notify the candidate and interviewer via SMS when an interview is rescheduled.",
    when: "interview.rescheduled",
    then: "sms.send › reschedule_alert",
    tag: "SMS",
    tagColor: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  },
  {
    icon: Send,
    iconColor: "text-teal-400",
    iconBg: "bg-teal-500/10",
    title: "Pre-Interview Brief",
    description: "Send candidates a preparation brief 2 hours before their interview slot.",
    when: "interview.upcoming_2h",
    then: "email.send › interview_brief",
    tag: "Email",
    tagColor: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  },
  {
    icon: PhoneCall,
    iconColor: "text-indigo-400",
    iconBg: "bg-indigo-500/10",
    title: "No-Show Follow-Up SMS",
    description: "Reach out automatically when a candidate misses a scheduled interview.",
    when: "interview.no_show",
    then: "sms.send › no_show_followup",
    tag: "SMS",
    tagColor: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  },
];

const PIPELINE_TEMPLATES: RuleTemplate[] = [
  {
    icon: ShieldAlert,
    iconColor: "text-red-400",
    iconBg: "bg-red-500/10",
    title: "Blacklist Screening",
    description: "Automatically flag candidates who appear on the internal blacklist upon profile creation.",
    when: "candidate.created",
    then: "flag.check_blacklist",
    tag: "Flag",
    tagColor: "bg-red-500/10 text-red-400 border-red-500/20",
  },
  {
    icon: Users,
    iconColor: "text-orange-400",
    iconBg: "bg-orange-500/10",
    title: "Duplicate Profile Detection",
    description: "Detect and flag duplicate national ID submissions to prevent double-entry.",
    when: "candidate.duplicate_detected",
    then: "flag.merge_review",
    tag: "Flag",
    tagColor: "bg-red-500/10 text-red-400 border-red-500/20",
  },
  {
    icon: TrendingUp,
    iconColor: "text-emerald-400",
    iconBg: "bg-emerald-500/10",
    title: "Auto-Advance Stage",
    description: "Move qualified candidates to the interview stage once their profile score exceeds the threshold.",
    when: "candidate.score_threshold_met",
    then: "pipeline.advance_stage",
    tag: "Stage",
    tagColor: "bg-green-500/10 text-green-400 border-green-500/20",
  },
  {
    icon: Bell,
    iconColor: "text-yellow-400",
    iconBg: "bg-yellow-500/10",
    title: "Coverage Below Minimum",
    description: "Alert the operations manager when shift coverage drops below the configured minimum threshold.",
    when: "workforce.below_threshold",
    then: "notify.operations_manager",
    tag: "Alert",
    tagColor: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  },
  {
    icon: ClipboardCheck,
    iconColor: "text-blue-400",
    iconBg: "bg-blue-500/10",
    title: "Profile Completeness Check",
    description: "Validate that mandatory profile fields are filled before advancing a candidate to interviews.",
    when: "stage.pre_interview",
    then: "flag.incomplete_check",
    tag: "Flag",
    tagColor: "bg-red-500/10 text-red-400 border-red-500/20",
  },
  {
    icon: Zap,
    iconColor: "text-purple-400",
    iconBg: "bg-purple-500/10",
    title: "Contract Renewal Prompt",
    description: "Notify HR 14 days before a seasonal worker's contract expires to prompt renewal or offboarding.",
    when: "workforce.contract_expiry_14d",
    then: "notify.hr_manager",
    tag: "Alert",
    tagColor: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  },
];

// ─── Reusable rules table ────────────────────────────────────────────────────
function RulesTable({
  rules,
  isLoading,
  emptyLabel,
  toggleRule,
}: {
  rules: AutomationRule[];
  isLoading: boolean;
  emptyLabel: string;
  toggleRule: (args: { id: string; isEnabled: boolean }) => void;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (rules.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Workflow className="h-10 w-10 text-muted-foreground/30 mb-3" />
        <p className="text-muted-foreground text-sm">{emptyLabel}</p>
      </div>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow className="border-border hover:bg-transparent">
          <TableHead className="text-muted-foreground pl-6">Rule Name</TableHead>
          <TableHead className="text-muted-foreground hidden md:table-cell">Trigger & Action</TableHead>
          <TableHead className="text-muted-foreground text-center">Executions</TableHead>
          <TableHead className="text-muted-foreground text-center">Status</TableHead>
          <TableHead className="text-right text-muted-foreground pr-6">Manage</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rules.map((rule) => {
          const { color, bg } = getIconStyle(rule.trigger);
          const Icon = getIcon(rule.trigger);
          return (
            <TableRow key={rule.id} className="border-border hover:bg-muted/20" data-testid={`row-rule-${rule.id}`}>
              <TableCell className="pl-6 py-4">
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-md ${bg} flex items-center justify-center shrink-0`}>
                    <Icon className={`h-5 w-5 ${color}`} />
                  </div>
                  <div>
                    <div className="font-medium text-white">{rule.name}</div>
                    {rule.description && (
                      <div className="text-xs text-muted-foreground mt-0.5 max-w-[200px] truncate">{rule.description}</div>
                    )}
                  </div>
                </div>
              </TableCell>
              <TableCell className="hidden md:table-cell py-4">
                <div className="flex flex-col gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider w-16">When</span>
                    <Badge variant="outline" className="bg-muted/30 border-border font-normal text-xs">
                      {rule.trigger.replace(/\./g, " › ")}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider w-16">Then</span>
                    <div className="flex items-center gap-2">
                      <ArrowRight className="h-3 w-3 text-primary" />
                      <span className="text-white text-xs">{rule.action}</span>
                    </div>
                  </div>
                </div>
              </TableCell>
              <TableCell className="py-4 text-center">
                <span className="font-mono text-sm text-white">{rule.runCount.toLocaleString()}</span>
              </TableCell>
              <TableCell className="py-4">
                <div className="flex justify-center">
                  <Switch
                    checked={rule.isEnabled}
                    onCheckedChange={(checked) => toggleRule({ id: rule.id, isEnabled: checked })}
                    data-testid={`toggle-rule-${rule.id}`}
                  />
                </div>
              </TableCell>
              <TableCell className="text-right pr-6 py-4">
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-white" data-testid={`button-rule-actions-${rule.id}`}>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

// ─── Template grid ────────────────────────────────────────────────────────────
function TemplateGrid({ templates, onAdd }: { templates: RuleTemplate[]; onAdd: (t: RuleTemplate) => void }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {templates.map((t) => (
        <Card key={t.title} className="bg-card border-border hover:border-primary/40 transition-colors group">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={`h-9 w-9 rounded-md ${t.iconBg} flex items-center justify-center shrink-0`}>
                  <t.icon className={`h-4 w-4 ${t.iconColor}`} />
                </div>
                <CardTitle className="text-sm text-white leading-snug">{t.title}</CardTitle>
              </div>
              <Badge variant="outline" className={`text-[10px] shrink-0 ${t.tagColor}`}>{t.tag}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <CardDescription className="text-xs leading-relaxed">{t.description}</CardDescription>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground uppercase tracking-wider font-semibold w-12">When</span>
                <Badge variant="outline" className="bg-muted/30 border-border font-normal text-[10px]">{t.when.replace(/\./g, " › ")}</Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground uppercase tracking-wider font-semibold w-12">Then</span>
                <div className="flex items-center gap-1.5">
                  <ArrowRight className="h-3 w-3 text-primary shrink-0" />
                  <span className="text-white text-[10px] font-mono">{t.then}</span>
                </div>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="w-full border-border text-muted-foreground hover:text-white hover:border-primary/50 text-xs h-8 rounded-sm"
              onClick={() => onAdd(t)}
              data-testid={`button-add-template-${t.title.replace(/\s+/g, "-").toLowerCase()}`}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add Rule
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function AutomationPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");

  const { data: rules = [], isLoading } = useQuery<AutomationRule[]>({
    queryKey: ["/api/automation"],
    queryFn: () => apiRequest("GET", "/api/automation").then(r => r.json()),
  });

  const toggleRule = useMutation({
    mutationFn: ({ id, isEnabled }: { id: string; isEnabled: boolean }) =>
      apiRequest("PATCH", `/api/automation/${id}`, { isEnabled }).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/automation"] }),
  });

  const filtered = rules.filter(r =>
    !search || r.name.toLowerCase().includes(search.toLowerCase())
  );

  const communicationRules = filtered.filter(r => COMMUNICATION_TRIGGERS.includes(r.trigger));
  const pipelineRules      = filtered.filter(r => PIPELINE_TRIGGERS.includes(r.trigger));

  const activeCount = rules.filter(r => r.isEnabled).length;
  const totalExecs  = rules.reduce((acc, r) => acc + r.runCount, 0);

  function handleAddTemplate(t: RuleTemplate) {
    toast({
      title: "Rule Added",
      description: `"${t.title}" has been added as a draft rule. Enable it when ready.`,
    });
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-white tracking-tight">Rules & Automation</h1>
            <p className="text-muted-foreground mt-1">Automate repetitive tasks and streamline your hiring pipeline.</p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" className="border-border" data-testid="button-test-workflows">
              <PlayCircle className="mr-2 h-4 w-4" />
              Test Workflows
            </Button>
            <Button className="h-11 bg-primary text-primary-foreground font-bold uppercase tracking-wide text-xs" data-testid="button-create-rule">
              <Plus className="mr-2 h-4 w-4" />
              Create Rule
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="bg-card border-border shadow-sm border-l-4 border-l-primary">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Active Rules</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-white" data-testid="stat-active-rules">
                {isLoading ? "—" : activeCount}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Out of {rules.length} total</p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Executions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-white" data-testid="stat-total-executions">
                {isLoading ? "—" : totalExecs.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Across all rules</p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border shadow-sm bg-gradient-to-br from-card to-primary/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Hours Saved</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-white">~{Math.round(totalExecs * 0.05)}h</div>
              <p className="text-xs text-muted-foreground mt-1">Estimated time saved</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="all" className="mt-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <TabsList className="bg-muted/20">
              <TabsTrigger value="all">All Workflows</TabsTrigger>
              <TabsTrigger value="communication">Communication</TabsTrigger>
              <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
            </TabsList>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search rules..."
                className="pl-9 bg-muted/30 border-border focus-visible:ring-primary/20 h-9 rounded-sm w-full"
                value={search}
                onChange={e => setSearch(e.target.value)}
                data-testid="input-search-rules"
              />
            </div>
          </div>

          {/* ── All ── */}
          <TabsContent value="all" className="space-y-4 m-0">
            <Card className="bg-card border-border">
              <CardContent className="p-0">
                <RulesTable
                  rules={filtered}
                  isLoading={isLoading}
                  emptyLabel="No automation rules found"
                  toggleRule={({ id, isEnabled }) => toggleRule.mutate({ id, isEnabled })}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Communication ── */}
          <TabsContent value="communication" className="space-y-6 m-0">
            {/* Active communication rules */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-white">Active Communication Rules</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Rules that send SMS or email notifications to candidates and staff.</p>
                </div>
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-xs">
                  {communicationRules.length} rule{communicationRules.length !== 1 ? "s" : ""}
                </Badge>
              </div>
              <Card className="bg-card border-border">
                <CardContent className="p-0">
                  <RulesTable
                    rules={communicationRules}
                    isLoading={isLoading}
                    emptyLabel="No communication rules configured. Add one from the templates below."
                    toggleRule={({ id, isEnabled }) => toggleRule.mutate({ id, isEnabled })}
                  />
                </CardContent>
              </Card>
            </div>

            {/* Templates */}
            <div className="space-y-3">
              <div className="w-full h-px bg-border" />
              <div>
                <h2 className="text-base font-semibold text-white">Quick-Add Templates</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Pre-built communication workflows — click Add Rule to enable.</p>
              </div>
              <TemplateGrid templates={COMMUNICATION_TEMPLATES} onAdd={handleAddTemplate} />
            </div>
          </TabsContent>

          {/* ── Pipeline ── */}
          <TabsContent value="pipeline" className="space-y-6 m-0">
            {/* Active pipeline rules */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-white">Active Pipeline Rules</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Rules that manage candidate progression, flags, and workforce health checks.</p>
                </div>
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-xs">
                  {pipelineRules.length} rule{pipelineRules.length !== 1 ? "s" : ""}
                </Badge>
              </div>
              <Card className="bg-card border-border">
                <CardContent className="p-0">
                  <RulesTable
                    rules={pipelineRules}
                    isLoading={isLoading}
                    emptyLabel="No pipeline rules configured. Add one from the templates below."
                    toggleRule={({ id, isEnabled }) => toggleRule.mutate({ id, isEnabled })}
                  />
                </CardContent>
              </Card>
            </div>

            {/* Templates */}
            <div className="space-y-3">
              <div className="w-full h-px bg-border" />
              <div>
                <h2 className="text-base font-semibold text-white">Quick-Add Templates</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Pre-built pipeline and operations automation — click Add Rule to enable.</p>
              </div>
              <TemplateGrid templates={PIPELINE_TEMPLATES} onAdd={handleAddTemplate} />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
