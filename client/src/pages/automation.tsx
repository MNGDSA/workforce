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
import { useTranslation } from "react-i18next";
import { formatNumber } from "@/lib/format";
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

const COMMUNICATION_TRIGGERS = ["candidate.created", "interview.scheduled", "application.submitted"];
const PIPELINE_TRIGGERS      = ["candidate.incomplete_profile", "workforce.contract_ending"];

interface RuleTemplate {
  key: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  when: string;
  then: string;
  tag: "Email" | "SMS" | "Flag" | "Stage" | "Alert";
  tagColor: string;
}

const COMMUNICATION_TEMPLATES: RuleTemplate[] = [
  { key: "rejection_email", icon: Mail, iconColor: "text-rose-400", iconBg: "bg-rose-500/10", when: "application.rejected", then: "email.send › rejection_template", tag: "Email", tagColor: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  { key: "offer_email", icon: CheckCheck, iconColor: "text-green-400", iconBg: "bg-green-500/10", when: "candidate.hired", then: "email.send › offer_letter_template", tag: "Email", tagColor: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  { key: "doc_request_sms", icon: FileText, iconColor: "text-amber-400", iconBg: "bg-amber-500/10", when: "candidate.documents_missing", then: "sms.send › document_request", tag: "SMS", tagColor: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
  { key: "reschedule_sms", icon: RefreshCw, iconColor: "text-sky-400", iconBg: "bg-sky-500/10", when: "interview.rescheduled", then: "sms.send › reschedule_alert", tag: "SMS", tagColor: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
  { key: "pre_interview_brief", icon: Send, iconColor: "text-teal-400", iconBg: "bg-teal-500/10", when: "interview.upcoming_2h", then: "email.send › interview_brief", tag: "Email", tagColor: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  { key: "no_show_sms", icon: PhoneCall, iconColor: "text-indigo-400", iconBg: "bg-indigo-500/10", when: "interview.no_show", then: "sms.send › no_show_followup", tag: "SMS", tagColor: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
];

const PIPELINE_TEMPLATES: RuleTemplate[] = [
  { key: "blacklist", icon: ShieldAlert, iconColor: "text-red-400", iconBg: "bg-red-500/10", when: "candidate.created", then: "flag.check_blacklist", tag: "Flag", tagColor: "bg-red-500/10 text-red-400 border-red-500/20" },
  { key: "duplicate", icon: Users, iconColor: "text-orange-400", iconBg: "bg-orange-500/10", when: "candidate.duplicate_detected", then: "flag.merge_review", tag: "Flag", tagColor: "bg-red-500/10 text-red-400 border-red-500/20" },
  { key: "auto_advance", icon: TrendingUp, iconColor: "text-emerald-400", iconBg: "bg-emerald-500/10", when: "candidate.score_threshold_met", then: "pipeline.advance_stage", tag: "Stage", tagColor: "bg-green-500/10 text-green-400 border-green-500/20" },
  { key: "coverage_alert", icon: Bell, iconColor: "text-yellow-400", iconBg: "bg-yellow-500/10", when: "workforce.below_threshold", then: "notify.operations_manager", tag: "Alert", tagColor: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  { key: "completeness_check", icon: ClipboardCheck, iconColor: "text-blue-400", iconBg: "bg-blue-500/10", when: "stage.pre_interview", then: "flag.incomplete_check", tag: "Flag", tagColor: "bg-red-500/10 text-red-400 border-red-500/20" },
  { key: "contract_renewal", icon: Zap, iconColor: "text-purple-400", iconBg: "bg-purple-500/10", when: "workforce.contract_expiry_14d", then: "notify.hr_manager", tag: "Alert", tagColor: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
];

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
  const { t, i18n } = useTranslation(["automation", "common"]);
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
          <TableHead className="text-muted-foreground ps-6">{t("automation:table.name")}</TableHead>
          <TableHead className="text-muted-foreground hidden md:table-cell">{t("automation:table.triggerAction")}</TableHead>
          <TableHead className="text-muted-foreground text-center">{t("automation:table.executions")}</TableHead>
          <TableHead className="text-muted-foreground text-center">{t("automation:table.status")}</TableHead>
          <TableHead className="text-end text-muted-foreground pe-6">{t("automation:table.manage")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rules.map((rule) => {
          const { color, bg } = getIconStyle(rule.trigger);
          const Icon = getIcon(rule.trigger);
          return (
            <TableRow key={rule.id} className="border-border hover:bg-muted/20" data-testid={`row-rule-${rule.id}`}>
              <TableCell className="ps-6 py-4">
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-md ${bg} flex items-center justify-center shrink-0`}>
                    <Icon className={`h-5 w-5 ${color}`} />
                  </div>
                  <div>
                    <div className="font-medium text-white"><bdi>{rule.name}</bdi></div>
                    {rule.description && (
                      <div className="text-xs text-muted-foreground mt-0.5 max-w-[200px] truncate"><bdi>{rule.description}</bdi></div>
                    )}
                  </div>
                </div>
              </TableCell>
              <TableCell className="hidden md:table-cell py-4">
                <div className="flex flex-col gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider w-16">{t("automation:table.when")}</span>
                    <Badge variant="outline" className="bg-muted/30 border-border font-normal text-xs" dir="ltr">
                      {rule.trigger.replace(/\./g, " › ")}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider w-16">{t("automation:table.then")}</span>
                    <div className="flex items-center gap-2">
                      <ArrowRight className="h-3 w-3 text-primary rtl:rotate-180" />
                      <span className="text-white text-xs" dir="ltr">{rule.action}</span>
                    </div>
                  </div>
                </div>
              </TableCell>
              <TableCell className="py-4 text-center">
                <span className="font-mono text-sm text-white"><bdi>{formatNumber(rule.runCount, i18n.language)}</bdi></span>
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
              <TableCell className="text-end pe-6 py-4">
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

function TemplateGrid({ templates, onAdd }: { templates: RuleTemplate[]; onAdd: (tpl: RuleTemplate) => void }) {
  const { t } = useTranslation(["automation", "common"]);
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {templates.map((tpl) => (
        <Card key={tpl.key} className="bg-card border-border hover:border-primary/40 transition-colors group">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={`h-9 w-9 rounded-md ${tpl.iconBg} flex items-center justify-center shrink-0`}>
                  <tpl.icon className={`h-4 w-4 ${tpl.iconColor}`} />
                </div>
                <CardTitle className="text-sm text-white leading-snug">{t(`automation:templates.${tpl.key}.title`)}</CardTitle>
              </div>
              <Badge variant="outline" className={`text-[10px] shrink-0 ${tpl.tagColor}`}>{t(`automation:tags.${tpl.tag}`)}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <CardDescription className="text-xs leading-relaxed">{t(`automation:templates.${tpl.key}.description`)}</CardDescription>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground uppercase tracking-wider font-semibold w-12">{t("automation:table.when")}</span>
                <Badge variant="outline" className="bg-muted/30 border-border font-normal text-[10px]" dir="ltr">{tpl.when.replace(/\./g, " › ")}</Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground uppercase tracking-wider font-semibold w-12">{t("automation:table.then")}</span>
                <div className="flex items-center gap-1.5">
                  <ArrowRight className="h-3 w-3 text-primary shrink-0 rtl:rotate-180" />
                  <span className="text-white text-[10px] font-mono" dir="ltr">{tpl.then}</span>
                </div>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="w-full border-border text-muted-foreground hover:text-white hover:border-primary/50 text-xs h-8 rounded-sm"
              onClick={() => onAdd(tpl)}
              data-testid={`button-add-template-${tpl.key}`}
            >
              <Plus className="me-1.5 h-3.5 w-3.5" />
              {t("automation:addRule")}
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function AutomationPage() {
  const { t, i18n } = useTranslation(["automation", "common"]);
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

  function handleAddTemplate(tpl: RuleTemplate) {
    toast({
      title: t("automation:toasts.addedTitle"),
      description: t("automation:toasts.addedDescription", { title: t(`automation:templates.${tpl.key}.title`) }),
    });
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-white tracking-tight">{t("automation:title")}</h1>
            <p className="text-muted-foreground mt-1">{t("automation:subtitle")}</p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" className="border-border" data-testid="button-test-workflows">
              <PlayCircle className="me-2 h-4 w-4" />
              {t("automation:testWorkflows")}
            </Button>
            <Button className="h-11 bg-primary text-primary-foreground font-bold uppercase tracking-wide text-xs" data-testid="button-create-rule">
              <Plus className="me-2 h-4 w-4" />
              {t("automation:createRule")}
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="bg-card border-border shadow-sm border-s-4 border-s-primary">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{t("automation:stats.active")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-white" data-testid="stat-active-rules">
                <bdi>{isLoading ? "—" : formatNumber(activeCount, i18n.language)}</bdi>
              </div>
              <p className="text-xs text-muted-foreground mt-1"><bdi>{t("automation:stats.activeSub", { count: rules.length })}</bdi></p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{t("automation:stats.totalExecutions")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-white" data-testid="stat-total-executions">
                <bdi>{isLoading ? "—" : formatNumber(totalExecs, i18n.language)}</bdi>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{t("automation:stats.totalExecutionsSub")}</p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border shadow-sm bg-gradient-to-br from-card to-primary/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{t("automation:stats.hoursSaved")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-white">
                <bdi>{t("automation:stats.hoursSavedValue", { count: formatNumber(Math.round(totalExecs * 0.05), i18n.language) })}</bdi>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{t("automation:stats.hoursSavedSub")}</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="all" className="mt-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <TabsList className="bg-muted/20">
              <TabsTrigger value="all">{t("automation:tabs.all")}</TabsTrigger>
              <TabsTrigger value="communication">{t("automation:tabs.communication")}</TabsTrigger>
              <TabsTrigger value="pipeline">{t("automation:tabs.pipeline")}</TabsTrigger>
            </TabsList>
            <div className="relative w-full sm:w-64">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t("automation:search")}
                className="ps-9 bg-muted/30 border-border focus-visible:ring-primary/20 h-9 rounded-sm w-full"
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
                  emptyLabel={t("automation:empty.all")}
                  toggleRule={({ id, isEnabled }) => toggleRule.mutate({ id, isEnabled })}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Communication ── */}
          <TabsContent value="communication" className="space-y-6 m-0">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-white">{t("automation:sections.activeCommunication")}</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">{t("automation:sections.activeCommunicationSub")}</p>
                </div>
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-xs">
                  <bdi>{t("automation:sections.ruleCount", { count: communicationRules.length })}</bdi>
                </Badge>
              </div>
              <Card className="bg-card border-border">
                <CardContent className="p-0">
                  <RulesTable
                    rules={communicationRules}
                    isLoading={isLoading}
                    emptyLabel={t("automation:empty.communication")}
                    toggleRule={({ id, isEnabled }) => toggleRule.mutate({ id, isEnabled })}
                  />
                </CardContent>
              </Card>
            </div>

            <div className="space-y-3">
              <div className="w-full h-px bg-border" />
              <div>
                <h2 className="text-base font-semibold text-white">{t("automation:sections.quickAdd")}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{t("automation:sections.quickAddCommunicationSub")}</p>
              </div>
              <TemplateGrid templates={COMMUNICATION_TEMPLATES} onAdd={handleAddTemplate} />
            </div>
          </TabsContent>

          {/* ── Pipeline ── */}
          <TabsContent value="pipeline" className="space-y-6 m-0">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-white">{t("automation:sections.activePipeline")}</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">{t("automation:sections.activePipelineSub")}</p>
                </div>
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-xs">
                  <bdi>{t("automation:sections.ruleCount", { count: pipelineRules.length })}</bdi>
                </Badge>
              </div>
              <Card className="bg-card border-border">
                <CardContent className="p-0">
                  <RulesTable
                    rules={pipelineRules}
                    isLoading={isLoading}
                    emptyLabel={t("automation:empty.pipeline")}
                    toggleRule={({ id, isEnabled }) => toggleRule.mutate({ id, isEnabled })}
                  />
                </CardContent>
              </Card>
            </div>

            <div className="space-y-3">
              <div className="w-full h-px bg-border" />
              <div>
                <h2 className="text-base font-semibold text-white">{t("automation:sections.quickAdd")}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{t("automation:sections.quickAddPipelineSub")}</p>
              </div>
              <TemplateGrid templates={PIPELINE_TEMPLATES} onAdd={handleAddTemplate} />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
