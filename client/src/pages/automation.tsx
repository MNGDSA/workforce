import DashboardLayout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  ArrowRight
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useState } from "react";

const rules = [
  {
    id: "AUT-001",
    name: "Auto-Welcome SMS",
    trigger: "New Application Received",
    action: "Send SMS via Msegat",
    status: true,
    executions: 1245,
    icon: MessageSquare,
    color: "text-emerald-500",
    bg: "bg-emerald-500/10"
  },
  {
    id: "AUT-002",
    name: "Interview Reminder",
    trigger: "24h before Interview",
    action: "Send Email & SMS",
    status: true,
    executions: 856,
    icon: Calendar,
    color: "text-blue-500",
    bg: "bg-blue-500/10"
  },
  {
    id: "AUT-003",
    name: "Document Missing Alert",
    trigger: "Profile < 80% after 3 days",
    action: "Send Reminder Email",
    status: false,
    executions: 0,
    icon: AlertTriangle,
    color: "text-amber-500",
    bg: "bg-amber-500/10"
  },
  {
    id: "AUT-004",
    name: "Auto-Approve 90%+ Match",
    trigger: "Match Score >= 90%",
    action: "Move to 'Interview' Stage",
    status: true,
    executions: 142,
    icon: UserCheck,
    color: "text-purple-500",
    bg: "bg-purple-500/10"
  },
  {
    id: "AUT-005",
    name: "Offboarding Workflow",
    trigger: "Season End Date Reached",
    action: "Change Status to Offboarded",
    status: true,
    executions: 450,
    icon: Zap,
    color: "text-orange-500",
    bg: "bg-orange-500/10"
  }
];

export default function AutomationPage() {
  const [automationRules, setAutomationRules] = useState(rules);

  const toggleRule = (id: string) => {
    setAutomationRules(automationRules.map(rule => 
      rule.id === id ? { ...rule, status: !rule.status } : rule
    ));
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-white tracking-tight">Rules & Automation</h1>
            <p className="text-muted-foreground mt-1">Automate repetitive tasks and streamline your hiring pipeline.</p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" className="border-border">
              <PlayCircle className="mr-2 h-4 w-4" />
              Test Workflows
            </Button>
            <Button className="h-11 bg-primary text-primary-foreground font-bold uppercase tracking-wide text-xs">
              <Plus className="mr-2 h-4 w-4" />
              Create Rule
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="bg-card border-border shadow-sm border-l-4 border-l-primary">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Active Rules
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-white">
                {automationRules.filter(r => r.status).length}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Out of {automationRules.length} total
              </p>
            </CardContent>
          </Card>
          
          <Card className="bg-card border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Total Executions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-white">2,693</div>
              <p className="text-xs text-muted-foreground mt-1">
                <span className="text-green-500 font-medium">+420</span> this week
              </p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border shadow-sm bg-gradient-to-br from-card to-primary/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Hours Saved
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-white">~84h</div>
              <p className="text-xs text-muted-foreground mt-1">
                Estimated time saved this month
              </p>
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
              />
            </div>
          </div>

          <TabsContent value="all" className="space-y-4 m-0">
            <Card className="bg-card border-border">
              <CardContent className="p-0">
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
                    {automationRules.map((rule) => (
                      <TableRow key={rule.id} className="border-border hover:bg-muted/20">
                        <TableCell className="pl-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`h-10 w-10 rounded-md ${rule.bg} flex items-center justify-center shrink-0`}>
                              <rule.icon className={`h-5 w-5 ${rule.color}`} />
                            </div>
                            <div>
                              <div className="font-medium text-white">{rule.name}</div>
                              <div className="text-xs text-muted-foreground mt-1 font-mono">{rule.id}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell py-4">
                          <div className="flex flex-col gap-2 text-sm">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider w-16">When</span>
                              <Badge variant="outline" className="bg-muted/30 border-border font-normal">
                                {rule.trigger}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider w-16">Then</span>
                              <div className="flex items-center gap-2">
                                <ArrowRight className="h-3 w-3 text-primary" />
                                <span className="text-white">{rule.action}</span>
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-4 text-center">
                          <span className="font-mono text-sm text-white">{rule.executions.toLocaleString()}</span>
                        </TableCell>
                        <TableCell className="py-4">
                          <div className="flex justify-center">
                            <Switch 
                              checked={rule.status} 
                              onCheckedChange={() => toggleRule(rule.id)}
                            />
                          </div>
                        </TableCell>
                        <TableCell className="text-right pr-6 py-4">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-white">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="communication" className="m-0">
             <div className="p-8 text-center text-muted-foreground bg-card border border-border border-dashed rounded-md">
                Filter applied: Communication Rules
             </div>
          </TabsContent>
          
          <TabsContent value="pipeline" className="m-0">
             <div className="p-8 text-center text-muted-foreground bg-card border border-border border-dashed rounded-md">
                Filter applied: Pipeline Rules
             </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
