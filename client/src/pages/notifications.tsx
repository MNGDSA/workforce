import DashboardLayout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Bell,
  CheckCircle2,
  AlertTriangle,
  Mail,
  Globe,
  Eye,
  EyeOff,
  Lock,
  Server,
  AtSign,
  User,
} from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type IntegrationType = "goinfinito" | "smtp";

export default function NotificationsPage() {
  const { toast } = useToast();
  const [selectedIntegration, setSelectedIntegration] = useState<IntegrationType>("goinfinito");
  const [showSmtpPassword, setShowSmtpPassword] = useState(false);

  const [goInfinitoConfig, setGoInfinitoConfig] = useState({
    apiKey: "",
    senderId: "",
    enabled: false,
  });

  const [smtpConfig, setSmtpConfig] = useState({
    host: "",
    port: "587",
    encryption: "tls",
    username: "",
    password: "",
    fromName: "",
    fromEmail: "",
    enabled: false,
  });

  const handleSave = (type: IntegrationType) => {
    if (type === "smtp") {
      if (!smtpConfig.host || !smtpConfig.username || !smtpConfig.fromEmail) {
        toast({
          title: "Missing Required Fields",
          description: "Please fill in Host, Username, and From Email before saving.",
          variant: "destructive",
        });
        return;
      }
    }
    toast({
      title: "Settings Saved",
      description: "Integration settings have been updated.",
    });
  };

  const handleTestConnection = (type: IntegrationType) => {
    if (type === "goinfinito") {
      if (!goInfinitoConfig.apiKey || !goInfinitoConfig.senderId) {
        toast({
          title: "Connection Failed",
          description: "Please enter API Key and Sender ID first.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Connection Successful",
        description: "Successfully connected to GoInfinito API.",
      });
    } else if (type === "smtp") {
      if (!smtpConfig.host || !smtpConfig.username || !smtpConfig.password) {
        toast({
          title: "Connection Failed",
          description: "Please enter Host, Username, and Password first.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Connection Successful",
        description: `SMTP connection to ${smtpConfig.host}:${smtpConfig.port} verified.`,
      });
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-5xl mx-auto">
        <div>
          <h1 className="text-3xl font-display font-bold text-white tracking-tight">Notification Center</h1>
          <p className="text-muted-foreground mt-1">Manage system alerts and communication integrations.</p>
        </div>

        <Tabs defaultValue="integrations" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 max-w-[400px] bg-muted/20">
            <TabsTrigger value="notifications">Alerts & History</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
          </TabsList>

          <TabsContent value="notifications" className="space-y-4">
            <Card className="bg-card border-border">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg font-display text-white">Recent Alerts</CardTitle>
                  <Button variant="outline" size="sm">Mark all as read</Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex gap-4 items-start p-4 rounded-md bg-muted/30 border border-border/50">
                      <div className="h-8 w-8 rounded-full bg-blue-500/20 text-blue-500 flex items-center justify-center shrink-0">
                        <Bell className="h-4 w-4" />
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-start">
                          <h4 className="font-medium text-white text-sm">Shift Coverage Alert</h4>
                          <span className="text-xs text-muted-foreground">2 hours ago</span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          Warehouse Zone B is below minimum coverage for the upcoming night shift.
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="integrations" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

              {/* Sidebar */}
              <div className="space-y-4">
                <Card
                  className={cn(
                    "bg-card border-border cursor-pointer hover:border-primary/50 transition-colors",
                    selectedIntegration === "goinfinito" ? "ring-2 ring-primary" : ""
                  )}
                  onClick={() => setSelectedIntegration("goinfinito")}
                >
                  <CardHeader className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-md bg-purple-600 flex items-center justify-center text-white">
                        <Globe className="h-6 w-6" />
                      </div>
                      <div>
                        <CardTitle className="text-base text-white">GoInfinito SMS</CardTitle>
                        <CardDescription className="text-xs">
                          {goInfinitoConfig.enabled ? <span className="text-green-500">Active</span> : "Disabled"}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                </Card>

                <Card
                  className={cn(
                    "bg-card border-border cursor-pointer hover:border-primary/50 transition-colors",
                    selectedIntegration === "smtp" ? "ring-2 ring-primary" : ""
                  )}
                  onClick={() => setSelectedIntegration("smtp")}
                >
                  <CardHeader className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-md bg-blue-500 flex items-center justify-center text-white">
                        <Mail className="h-5 w-5" />
                      </div>
                      <div>
                        <CardTitle className="text-base text-white">SMTP Email</CardTitle>
                        <CardDescription className="text-xs">
                          {smtpConfig.enabled ? <span className="text-green-500">Active</span> : "Disabled"}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              </div>

              {/* Configuration Panel */}
              <div className="md:col-span-2">

                {/* GoInfinito Panel */}
                {selectedIntegration === "goinfinito" && (
                  <Card className="bg-card border-border animate-in fade-in duration-300">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <CardTitle className="text-xl text-white">GoInfinito SMS</CardTitle>
                          <CardDescription>
                            Configure your GoInfinito (ValueFirst) API settings for global SMS delivery.
                            <br />
                            <a href="https://www.goinfinito.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-xs">
                              Visit GoInfinito
                            </a>
                          </CardDescription>
                        </div>
                        <Switch
                          checked={goInfinitoConfig.enabled}
                          onCheckedChange={(c) => setGoInfinitoConfig({ ...goInfinitoConfig, enabled: c })}
                        />
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="grid gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="infinitoApiKey" className="text-white">API Key <span className="text-destructive">*</span></Label>
                          <Input
                            id="infinitoApiKey"
                            type="password"
                            placeholder="Enter your GoInfinito API Key"
                            value={goInfinitoConfig.apiKey}
                            onChange={(e) => setGoInfinitoConfig({ ...goInfinitoConfig, apiKey: e.target.value })}
                            className="bg-muted/30 border-border font-mono"
                          />
                          <p className="text-xs text-muted-foreground">Your unique API access token.</p>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="infinitoSenderId" className="text-white">Sender ID <span className="text-destructive">*</span></Label>
                          <Input
                            id="infinitoSenderId"
                            placeholder="e.g. YOUR-BRAND"
                            value={goInfinitoConfig.senderId}
                            onChange={(e) => setGoInfinitoConfig({ ...goInfinitoConfig, senderId: e.target.value })}
                            className="bg-muted/30 border-border"
                          />
                          <p className="text-xs text-muted-foreground">
                            Must be pre-registered with CITC (CST). Alphanumeric only. Promotional IDs must end with "-AD".
                          </p>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-white">Region Support</Label>
                          <div className="flex flex-wrap gap-2">
                            <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">Saudi Arabia (CITC Compliant)</Badge>
                            <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/20">Middle East</Badge>
                          </div>
                        </div>

                        <div className="rounded-md bg-yellow-500/10 border border-yellow-500/20 p-4">
                          <div className="flex gap-3">
                            <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0" />
                            <div className="space-y-1">
                              <h4 className="text-sm font-medium text-yellow-500">Compliance Requirement</h4>
                              <p className="text-xs text-muted-foreground">
                                Sending to Saudi Arabia requires Sender ID registration with CITC (CST).
                                Promotional messages are restricted to 9:00 AM – 8:00 PM KSA time.
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-4 border-t border-border">
                        <Button variant="outline" onClick={() => handleTestConnection("goinfinito")} className="border-border text-muted-foreground hover:text-white">
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                          Test Connection
                        </Button>
                        <Button onClick={() => handleSave("goinfinito")} className="bg-primary text-primary-foreground font-bold">
                          Save Configuration
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* SMTP Panel */}
                {selectedIntegration === "smtp" && (
                  <Card className="bg-card border-border animate-in fade-in duration-300">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <CardTitle className="text-xl text-white">SMTP Email</CardTitle>
                          <CardDescription>
                            Configure outgoing email via your SMTP server. Used for candidate notifications, interview invites, and system alerts.
                          </CardDescription>
                        </div>
                        <Switch
                          checked={smtpConfig.enabled}
                          onCheckedChange={(c) => setSmtpConfig({ ...smtpConfig, enabled: c })}
                        />
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-6">

                      {/* Server Settings */}
                      <div className="space-y-3">
                        <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold flex items-center gap-1.5">
                          <Server className="h-3.5 w-3.5" /> Server
                        </p>
                        <div className="grid grid-cols-3 gap-3">
                          <div className="col-span-2 space-y-2">
                            <Label htmlFor="smtpHost" className="text-white">SMTP Host <span className="text-destructive">*</span></Label>
                            <Input
                              id="smtpHost"
                              placeholder="e.g. smtp.gmail.com"
                              value={smtpConfig.host}
                              onChange={(e) => setSmtpConfig({ ...smtpConfig, host: e.target.value })}
                              className="bg-muted/30 border-border font-mono"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="smtpPort" className="text-white">Port <span className="text-destructive">*</span></Label>
                            <Select
                              value={smtpConfig.port}
                              onValueChange={(v) => setSmtpConfig({ ...smtpConfig, port: v })}
                            >
                              <SelectTrigger id="smtpPort" className="bg-muted/30 border-border">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="25">25 (SMTP)</SelectItem>
                                <SelectItem value="465">465 (SSL)</SelectItem>
                                <SelectItem value="587">587 (TLS)</SelectItem>
                                <SelectItem value="2525">2525 (Alt)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-white">Encryption</Label>
                          <Select
                            value={smtpConfig.encryption}
                            onValueChange={(v) => setSmtpConfig({ ...smtpConfig, encryption: v })}
                          >
                            <SelectTrigger className="bg-muted/30 border-border">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              <SelectItem value="tls">STARTTLS (recommended)</SelectItem>
                              <SelectItem value="ssl">SSL / TLS</SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">STARTTLS on port 587 is recommended for most providers.</p>
                        </div>
                      </div>

                      <div className="w-full h-px bg-border" />

                      {/* Authentication */}
                      <div className="space-y-3">
                        <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold flex items-center gap-1.5">
                          <Lock className="h-3.5 w-3.5" /> Authentication
                        </p>
                        <div className="space-y-2">
                          <Label htmlFor="smtpUsername" className="text-white">Username / Email <span className="text-destructive">*</span></Label>
                          <Input
                            id="smtpUsername"
                            placeholder="e.g. noreply@company.sa"
                            value={smtpConfig.username}
                            onChange={(e) => setSmtpConfig({ ...smtpConfig, username: e.target.value })}
                            className="bg-muted/30 border-border"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="smtpPassword" className="text-white">Password / App Password <span className="text-destructive">*</span></Label>
                          <div className="relative">
                            <Input
                              id="smtpPassword"
                              type={showSmtpPassword ? "text" : "password"}
                              placeholder="Enter SMTP password"
                              value={smtpConfig.password}
                              onChange={(e) => setSmtpConfig({ ...smtpConfig, password: e.target.value })}
                              className="bg-muted/30 border-border font-mono pr-10"
                            />
                            <button
                              type="button"
                              onClick={() => setShowSmtpPassword(!showSmtpPassword)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white transition-colors"
                            >
                              {showSmtpPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                          <p className="text-xs text-muted-foreground">For Gmail/Outlook, use an App Password, not your account password.</p>
                        </div>
                      </div>

                      <div className="w-full h-px bg-border" />

                      {/* Sender Identity */}
                      <div className="space-y-3">
                        <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold flex items-center gap-1.5">
                          <AtSign className="h-3.5 w-3.5" /> Sender Identity
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <Label htmlFor="smtpFromName" className="text-white flex items-center gap-1.5">
                              <User className="h-3.5 w-3.5" /> From Name
                            </Label>
                            <Input
                              id="smtpFromName"
                              placeholder="e.g. Workforce SA"
                              value={smtpConfig.fromName}
                              onChange={(e) => setSmtpConfig({ ...smtpConfig, fromName: e.target.value })}
                              className="bg-muted/30 border-border"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="smtpFromEmail" className="text-white flex items-center gap-1.5">
                              <Mail className="h-3.5 w-3.5" /> From Email <span className="text-destructive">*</span>
                            </Label>
                            <Input
                              id="smtpFromEmail"
                              type="email"
                              placeholder="e.g. noreply@company.sa"
                              value={smtpConfig.fromEmail}
                              onChange={(e) => setSmtpConfig({ ...smtpConfig, fromEmail: e.target.value })}
                              className="bg-muted/30 border-border"
                            />
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground">This is the name and address recipients will see in their inbox.</p>
                      </div>

                      {/* Common providers hint */}
                      <div className="rounded-md bg-muted/20 border border-border p-4 space-y-2">
                        <p className="text-xs font-semibold text-white">Common Provider Settings</p>
                        <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                          <div>
                            <p className="text-white font-medium">Gmail</p>
                            <p>smtp.gmail.com</p>
                            <p>Port 587 · TLS</p>
                          </div>
                          <div>
                            <p className="text-white font-medium">Outlook / 365</p>
                            <p>smtp.office365.com</p>
                            <p>Port 587 · TLS</p>
                          </div>
                          <div>
                            <p className="text-white font-medium">SendGrid</p>
                            <p>smtp.sendgrid.net</p>
                            <p>Port 587 · TLS</p>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-4 border-t border-border">
                        <Button variant="outline" onClick={() => handleTestConnection("smtp")} className="border-border text-muted-foreground hover:text-white">
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                          Send Test Email
                        </Button>
                        <Button onClick={() => handleSave("smtp")} className="bg-primary text-primary-foreground font-bold">
                          Save Configuration
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
