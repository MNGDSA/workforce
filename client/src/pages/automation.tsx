import DashboardLayout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
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

export default function AutomationPage() {
  const queryClient = useQueryClient();
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

  const activeCount = rules.filter(r => r.isEnabled).length;
  const totalExecs = rules.reduce((acc, r) => acc + r.runCount, 0);

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

          <TabsContent value="all" className="space-y-4 m-0">
            <Card className="bg-card border-border">
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <Workflow className="h-12 w-12 text-muted-foreground/30 mb-4" />
                    <p className="text-muted-foreground">No automation rules found</p>
                  </div>
                ) : (
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
                      {filtered.map((rule) => {
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
                                  onCheckedChange={(checked) => toggleRule.mutate({ id: rule.id, isEnabled: checked })}
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
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="communication" className="m-0">
            <div className="p-8 text-center text-muted-foreground bg-card border border-border border-dashed rounded-md">
              Filter applied: Communication Rules — SMS & Email triggers
            </div>
          </TabsContent>

          <TabsContent value="pipeline" className="m-0">
            <div className="p-8 text-center text-muted-foreground bg-card border border-border border-dashed rounded-md">
              Filter applied: Pipeline Rules — Application & Workforce triggers
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
