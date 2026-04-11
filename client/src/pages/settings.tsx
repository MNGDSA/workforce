import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import DashboardLayout from "@/components/layout";
import { RolesAccessContent } from "@/pages/roles-access";
import { NotificationSettingsContent } from "@/pages/notifications";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Building2, 
  Globe, 
  Shield, 
  Key, 
  Users, 
  Database, 
  Save,
  CreditCard,
  Bell,
  Loader2,
  Clock,
  Wifi,
  WifiOff,
  CheckCircle2,
  AlertCircle,
  XCircle
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const NTP_SERVERS = [
  { group: "Global (Anycast)", servers: [
    { value: "time.google.com", label: "time.google.com (Google)" },
    { value: "time.cloudflare.com", label: "time.cloudflare.com (Cloudflare)" },
    { value: "time.windows.com", label: "time.windows.com (Microsoft)" },
    { value: "time.apple.com", label: "time.apple.com (Apple)" },
    { value: "pool.ntp.org", label: "pool.ntp.org (NTP Pool)" },
  ]},
  { group: "Middle East", servers: [
    { value: "asia.pool.ntp.org", label: "asia.pool.ntp.org" },
    { value: "sa.pool.ntp.org", label: "sa.pool.ntp.org (Saudi Arabia)" },
  ]},
  { group: "Europe", servers: [
    { value: "europe.pool.ntp.org", label: "europe.pool.ntp.org" },
    { value: "time.euro.apple.com", label: "time.euro.apple.com" },
  ]},
  { group: "Asia", servers: [
    { value: "asia.pool.ntp.org", label: "asia.pool.ntp.org" },
    { value: "ntp.nict.jp", label: "ntp.nict.jp (Japan)" },
  ]},
  { group: "North America", servers: [
    { value: "north-america.pool.ntp.org", label: "north-america.pool.ntp.org" },
    { value: "time.nist.gov", label: "time.nist.gov (USA/NIST)" },
  ]},
  { group: "South America", servers: [
    { value: "south-america.pool.ntp.org", label: "south-america.pool.ntp.org" },
  ]},
  { group: "Oceania", servers: [
    { value: "oceania.pool.ntp.org", label: "oceania.pool.ntp.org" },
  ]},
];

const ALL_NTP_VALUES = NTP_SERVERS.flatMap(g => g.servers.map(s => s.value));

const ALL_TIMEZONES: string[] = (() => {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return [
      "UTC",
      "Asia/Riyadh", "Asia/Dubai", "Asia/Muscat", "Asia/Kuwait", "Asia/Bahrain", "Asia/Qatar",
      "Asia/Kolkata", "Asia/Karachi", "Asia/Dhaka", "Asia/Bangkok", "Asia/Singapore", "Asia/Tokyo",
      "Asia/Shanghai", "Asia/Hong_Kong", "Asia/Seoul", "Asia/Jakarta",
      "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Madrid", "Europe/Rome", "Europe/Istanbul",
      "Europe/Moscow", "Europe/Amsterdam", "Europe/Brussels", "Europe/Vienna",
      "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
      "America/Toronto", "America/Sao_Paulo", "America/Mexico_City", "America/Argentina/Buenos_Aires",
      "Africa/Cairo", "Africa/Johannesburg", "Africa/Lagos", "Africa/Nairobi",
      "Australia/Sydney", "Australia/Melbourne", "Pacific/Auckland",
    ];
  }
})();

function getUtcOffset(tz: string): string {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" });
    const parts = formatter.formatToParts(now);
    const offsetPart = parts.find(p => p.type === "timeZoneName");
    return offsetPart?.value ?? "";
  } catch { return ""; }
}

function NtpHealthIndicator({ serverUrl }: { serverUrl: string }) {
  const [status, setStatus] = useState<"checking" | "reachable" | "unreachable" | "unknown">("unknown");

  const checkHealth = useCallback(async () => {
    if (!serverUrl) { setStatus("unknown"); return; }
    setStatus("checking");
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`/api/ntp-health?server=${encodeURIComponent(serverUrl)}`, { signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok) {
        const data = await res.json();
        setStatus(data.reachable ? "reachable" : "unreachable");
      } else {
        setStatus("unknown");
      }
    } catch {
      setStatus("unknown");
    }
  }, [serverUrl]);

  useEffect(() => { checkHealth(); }, [checkHealth]);

  useEffect(() => {
    const interval = setInterval(checkHealth, 60000);
    return () => clearInterval(interval);
  }, [checkHealth]);

  return (
    <div className="flex items-center gap-2 mt-2" data-testid="ntp-health-indicator">
      {status === "checking" && <><Loader2 className="h-4 w-4 animate-spin text-yellow-500" /><span className="text-sm text-yellow-500">Checking NTP server...</span></>}
      {status === "reachable" && <><CheckCircle2 className="h-4 w-4 text-green-500" /><span className="text-sm text-green-500">NTP server reachable</span></>}
      {status === "unreachable" && <><XCircle className="h-4 w-4 text-red-500" /><span className="text-sm text-red-500">NTP server unreachable</span></>}
      {status === "unknown" && <><AlertCircle className="h-4 w-4 text-muted-foreground" /><span className="text-sm text-muted-foreground">NTP status unknown</span></>}
      <Button variant="ghost" size="sm" onClick={checkHealth} className="h-6 px-2 text-xs" data-testid="button-refresh-ntp">
        Refresh
      </Button>
    </div>
  );
}

interface SystemSettings {
  support_email: string;
  privacy_policy: string;
  terms_conditions: string;
  ntp_server_url: string;
  organization_timezone: string;
  config_version: number;
}

export default function SettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [supportEmail, setSupportEmail] = useState("");
  const [privacyPolicy, setPrivacyPolicy] = useState("");
  const [termsConditions, setTermsConditions] = useState("");
  const [ntpServerUrl, setNtpServerUrl] = useState("time.google.com");
  const [customNtpServer, setCustomNtpServer] = useState("");
  const [useCustomNtp, setUseCustomNtp] = useState(false);
  const [organizationTimezone, setOrganizationTimezone] = useState("Asia/Riyadh");
  const [timezoneSearch, setTimezoneSearch] = useState("");

  const { data: systemSettings } = useQuery<SystemSettings>({
    queryKey: ["/api/settings/system"],
    queryFn: () => apiRequest("GET", "/api/settings/system").then(r => r.json()),
  });

  useEffect(() => {
    if (systemSettings) {
      setSupportEmail(systemSettings.support_email ?? "");
      setPrivacyPolicy(systemSettings.privacy_policy ?? "");
      setTermsConditions(systemSettings.terms_conditions ?? "");
      const ntpUrl = systemSettings.ntp_server_url ?? "time.google.com";
      if (ALL_NTP_VALUES.includes(ntpUrl)) {
        setNtpServerUrl(ntpUrl);
        setUseCustomNtp(false);
      } else {
        setCustomNtpServer(ntpUrl);
        setUseCustomNtp(true);
        setNtpServerUrl("custom");
      }
      setOrganizationTimezone(systemSettings.organization_timezone ?? "Asia/Riyadh");
    }
  }, [systemSettings]);

  const saveSettings = useMutation({
    mutationFn: (data: Record<string, string>) =>
      apiRequest("PATCH", "/api/settings/system", data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/system"] });
      toast({ title: "Settings Saved", description: "Your settings have been updated successfully." });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const handleSave = () => {
    const effectiveNtpServer = useCustomNtp ? customNtpServer : ntpServerUrl;
    saveSettings.mutate({
      support_email: supportEmail,
      privacy_policy: privacyPolicy,
      terms_conditions: termsConditions,
      ntp_server_url: effectiveNtpServer,
      organization_timezone: organizationTimezone,
    });
  };

  const effectiveNtpUrl = useCustomNtp ? customNtpServer : ntpServerUrl;

  const filteredTimezones = timezoneSearch
    ? ALL_TIMEZONES.filter(tz => tz.toLowerCase().includes(timezoneSearch.toLowerCase()))
    : ALL_TIMEZONES;

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-white tracking-tight">System & Settings</h1>
            <p className="text-muted-foreground mt-1">Manage your organization profile, roles, and global preferences.</p>
          </div>
          <Button onClick={handleSave} disabled={saveSettings.isPending} className="h-11 bg-primary text-primary-foreground font-bold uppercase tracking-wide text-xs">
            {saveSettings.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Changes
          </Button>
        </div>

        <Tabs defaultValue="general" className="w-full">
          <TabsList className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 w-full h-auto gap-2 bg-transparent p-0 mb-6">
            <TabsTrigger 
              value="general" 
              className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary border border-transparent data-[state=active]:border-primary/20 bg-card rounded-md h-12"
            >
              General
            </TabsTrigger>
            <TabsTrigger 
              value="security" 
              className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary border border-transparent data-[state=active]:border-primary/20 bg-card rounded-md h-12"
            >
              Security
            </TabsTrigger>
            <TabsTrigger 
              value="roles" 
              className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary border border-transparent data-[state=active]:border-primary/20 bg-card rounded-md h-12"
            >
              Roles & Access
            </TabsTrigger>
            <TabsTrigger 
              value="notifications" 
              className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary border border-transparent data-[state=active]:border-primary/20 bg-card rounded-md h-12"
            >
              Notifications
            </TabsTrigger>
            <TabsTrigger 
              value="integrations" 
              className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary border border-transparent data-[state=active]:border-primary/20 bg-card rounded-md h-12"
            >
              APIs & Webhooks
            </TabsTrigger>
            <TabsTrigger 
              value="advanced" 
              className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary border border-transparent data-[state=active]:border-primary/20 bg-card rounded-md h-12"
            >
              Advanced
            </TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-6 m-0 animate-in fade-in-50 duration-500">
            <Card className="bg-card border-border">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-primary" />
                  <CardTitle className="text-xl text-white">Organization Profile</CardTitle>
                </div>
                <CardDescription>Update your company details and branding.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="orgName" className="text-white">Organization Name</Label>
                    <Input id="orgName" defaultValue="Luxury Carts Company Ltd." className="bg-muted/30 border-border" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="industry" className="text-white">Industry</Label>
                    <Input id="industry" defaultValue="Logistics & Warehousing" className="bg-muted/30 border-border" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="supportEmail" className="text-white">Support Email</Label>
                    <Input
                      id="supportEmail"
                      type="email"
                      placeholder="support@company.com"
                      value={supportEmail}
                      onChange={(e) => setSupportEmail(e.target.value)}
                      className="bg-muted/30 border-border"
                      data-testid="input-support-email"
                    />
                    <p className="text-xs text-muted-foreground">Shown on the login page as "Contact Support" link</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-white">Phone Number</Label>
                    <Input id="phone" defaultValue="+1 (555) 000-0000" className="bg-muted/30 border-border" />
                  </div>
                </div>

                <Separator className="bg-border" />

                <div>
                  <h3 className="text-base font-medium text-white mb-4">Localization</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="text-white">Default Timezone</Label>
                      <Input defaultValue="Asia/Riyadh (AST)" className="bg-muted/30 border-border" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-white">Date Format</Label>
                      <Input defaultValue="DD/MM/YYYY" className="bg-muted/30 border-border" />
                    </div>
                  </div>
                </div>

                <Separator className="bg-border" />

                <div>
                  <h3 className="text-base font-medium text-white mb-4">Legal Pages</h3>
                  <p className="text-sm text-muted-foreground mb-4">Content entered here is published on the login page links.</p>
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <Label htmlFor="privacyPolicy" className="text-white">Privacy Policy</Label>
                      <textarea
                        id="privacyPolicy"
                        rows={8}
                        placeholder="Enter your privacy policy text here..."
                        value={privacyPolicy}
                        onChange={(e) => setPrivacyPolicy(e.target.value)}
                        className="flex w-full rounded-sm border border-border bg-muted/30 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary resize-y"
                        data-testid="textarea-privacy-policy"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="termsConditions" className="text-white">Terms & Conditions</Label>
                      <textarea
                        id="termsConditions"
                        rows={8}
                        placeholder="Enter your terms and conditions text here..."
                        value={termsConditions}
                        onChange={(e) => setTermsConditions(e.target.value)}
                        className="flex w-full rounded-sm border border-border bg-muted/30 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary resize-y"
                        data-testid="textarea-terms-conditions"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="security" className="space-y-6 m-0 animate-in fade-in-50 duration-500">
            <Card className="bg-card border-border">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-primary" />
                  <CardTitle className="text-xl text-white">Security Policies</CardTitle>
                </div>
                <CardDescription>Manage password requirements and authentication methods.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-muted/20 border border-border rounded-md">
                    <div className="space-y-0.5">
                      <Label className="text-base text-white">Two-Factor Authentication (2FA)</Label>
                      <p className="text-sm text-muted-foreground">Require all admin users to use 2FA to log in.</p>
                    </div>
                    <Switch defaultChecked />
                  </div>

                  <div className="flex items-center justify-between p-4 bg-muted/20 border border-border rounded-md">
                    <div className="space-y-0.5">
                      <Label className="text-base text-white">Strict Password Policy</Label>
                      <p className="text-sm text-muted-foreground">Require uppercase, numbers, and special characters.</p>
                    </div>
                    <Switch defaultChecked />
                  </div>

                  <div className="flex items-center justify-between p-4 bg-muted/20 border border-border rounded-md">
                    <div className="space-y-0.5">
                      <Label className="text-base text-white">Session Timeout</Label>
                      <p className="text-sm text-muted-foreground">Automatically log users out after 30 minutes of inactivity.</p>
                    </div>
                    <Switch />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-primary" />
                  <CardTitle className="text-xl text-white">Time & Clock Security</CardTitle>
                </div>
                <CardDescription>Configure NTP server and organization timezone for clock tampering detection on mobile devices.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="text-white">NTP Server</Label>
                    <Select
                      value={useCustomNtp ? "custom" : ntpServerUrl}
                      onValueChange={(val) => {
                        if (val === "custom") {
                          setUseCustomNtp(true);
                          setNtpServerUrl("custom");
                        } else {
                          setUseCustomNtp(false);
                          setNtpServerUrl(val);
                        }
                      }}
                    >
                      <SelectTrigger className="bg-muted/30 border-border" data-testid="select-ntp-server">
                        <SelectValue placeholder="Select NTP server" />
                      </SelectTrigger>
                      <SelectContent>
                        {NTP_SERVERS.map(group => (
                          <SelectGroup key={group.group}>
                            <SelectLabel>{group.group}</SelectLabel>
                            {group.servers.map(s => (
                              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                            ))}
                          </SelectGroup>
                        ))}
                        <SelectGroup>
                          <SelectLabel>Other</SelectLabel>
                          <SelectItem value="custom">Custom URL...</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    {useCustomNtp && (
                      <Input
                        placeholder="e.g., ntp.mycompany.com"
                        value={customNtpServer}
                        onChange={(e) => setCustomNtpServer(e.target.value)}
                        className="bg-muted/30 border-border mt-2"
                        data-testid="input-custom-ntp"
                      />
                    )}
                    <NtpHealthIndicator serverUrl={effectiveNtpUrl} />
                    <p className="text-xs text-muted-foreground">Used by mobile devices to get trusted time independent of the device clock.</p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-white">Organization Timezone</Label>
                    <Select value={organizationTimezone} onValueChange={setOrganizationTimezone}>
                      <SelectTrigger className="bg-muted/30 border-border" data-testid="select-timezone">
                        <SelectValue placeholder="Select timezone" />
                      </SelectTrigger>
                      <SelectContent>
                        <div className="p-2">
                          <Input
                            placeholder="Search timezones..."
                            value={timezoneSearch}
                            onChange={(e) => setTimezoneSearch(e.target.value)}
                            className="h-8 bg-muted/30 border-border"
                            data-testid="input-timezone-search"
                          />
                        </div>
                        {filteredTimezones.map(tz => (
                          <SelectItem key={tz} value={tz}>
                            {tz} ({getUtcOffset(tz)})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      All attendance times are displayed in this timezone. Uses IANA timezone names (handles DST automatically).
                    </p>
                  </div>
                </div>
                {systemSettings?.config_version && (
                  <p className="text-xs text-muted-foreground">
                    Config version: {systemSettings.config_version} — Mobile devices automatically pick up changes on next sync.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="roles" className="m-0 animate-in fade-in-50 duration-500">
            <RolesAccessContent />
          </TabsContent>

          <TabsContent value="notifications" className="m-0 animate-in fade-in-50 duration-500">
            <NotificationSettingsContent />
          </TabsContent>

          <TabsContent value="integrations" className="m-0 animate-in fade-in-50 duration-500">
            <div className="p-8 text-center text-muted-foreground bg-card border border-border border-dashed rounded-md">
               <Database className="h-10 w-10 mx-auto text-muted-foreground mb-4 opacity-50" />
               <h3 className="text-lg font-medium text-white mb-2">API Keys & Webhooks</h3>
               <p>Generate API tokens and configure webhooks to integrate with external systems.</p>
               <Button variant="outline" className="mt-4 border-border text-white">Manage Keys</Button>
            </div>
          </TabsContent>
          
          <TabsContent value="advanced" className="m-0 animate-in fade-in-50 duration-500">
            <div className="p-8 text-center text-muted-foreground bg-card border border-destructive/20 border-dashed rounded-md bg-destructive/5">
               <Shield className="h-10 w-10 mx-auto text-destructive mb-4 opacity-70" />
               <h3 className="text-lg font-medium text-white mb-2">Danger Zone</h3>
               <p className="mb-4">Irreversible actions that affect your entire organization workspace.</p>
               <Button variant="destructive" className="font-bold">Delete Organization</Button>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
