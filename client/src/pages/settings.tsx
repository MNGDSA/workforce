import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import DashboardLayout from "@/components/layout";
import { RolesAccessContent } from "@/pages/roles-access";
import { NotificationSettingsContent } from "@/pages/notifications";
import { AdminUsersContent } from "@/pages/admin-users";
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
  XCircle,
  RotateCw,
  RefreshCw,
  IdCard,
  Plus
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation, Trans } from "react-i18next";
import { formatNumber } from "@/lib/format";

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
  const { t } = useTranslation(["settings"]);
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
      {status === "checking" && <><Loader2 className="h-4 w-4 animate-spin text-yellow-500" /><span className="text-sm text-yellow-500">{t("settings:ntp.health.checking")}</span></>}
      {status === "reachable" && <><CheckCircle2 className="h-4 w-4 text-green-500" /><span className="text-sm text-green-500">{t("settings:ntp.health.reachable")}</span></>}
      {status === "unreachable" && <><XCircle className="h-4 w-4 text-red-500" /><span className="text-sm text-red-500">{t("settings:ntp.health.unreachable")}</span></>}
      {status === "unknown" && <><AlertCircle className="h-4 w-4 text-muted-foreground" /><span className="text-sm text-muted-foreground">{t("settings:ntp.health.unknown")}</span></>}
      <Button variant="ghost" size="sm" onClick={checkHealth} className="h-6 px-2 text-xs" data-testid="button-refresh-ntp">
        {t("settings:ntp.health.refresh")}
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
  attendance_early_buffer_minutes: number;
  attendance_late_buffer_minutes: number;
  attendance_min_shift_duration_minutes: number;
  attendance_max_daily_submissions: number;
}

interface IdCardPickupSmsSettings {
  template_ar: string;
  template_en: string;
  venue: string;
  location_url: string;
}

const ID_CARD_PICKUP_VARS: { key: string; placeholder: string }[] = [
  { key: "employeeName", placeholder: "{{employeeName}}" },
  { key: "employeeNumber", placeholder: "{{employeeNumber}}" },
  { key: "venue", placeholder: "{{venue}}" },
  { key: "location", placeholder: "{{location}}" },
  { key: "date", placeholder: "{{date}}" },
  { key: "time", placeholder: "{{time}}" },
];

function resolveIdCardPickupPreview(
  template: string,
  venue: string,
  locationUrl: string,
): string {
  const sample = {
    employeeName: "Mohammed Al-Saud",
    employeeNumber: "C000123",
    date: "2026-04-26",
    time: "14:32",
    venue,
    location: locationUrl,
  };
  return template.replace(/\{\{(\w+)\}\}/g, (_m, k) =>
    (sample as Record<string, string>)[k] ?? `{{${k}}}`,
  );
}

export default function SettingsPage() {
  const { t, i18n } = useTranslation(["settings", "common"]);
  const lng = i18n.language;
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
  const [attEarlyBuffer, setAttEarlyBuffer] = useState(30);
  const [attLateBuffer, setAttLateBuffer] = useState(60);
  const [attMinDuration, setAttMinDuration] = useState(30);
  const [attMaxSubmissions, setAttMaxSubmissions] = useState(2);

  // Task #207 — ID card pickup SMS settings
  const [pickupTplAr, setPickupTplAr] = useState("");
  const [pickupTplEn, setPickupTplEn] = useState("");
  const [pickupVenue, setPickupVenue] = useState("");
  const [pickupLocationUrl, setPickupLocationUrl] = useState("");
  const pickupTplArRef = useRef<HTMLTextAreaElement | null>(null);
  const pickupTplEnRef = useRef<HTMLTextAreaElement | null>(null);
  const [pickupActiveField, setPickupActiveField] = useState<"ar" | "en">("ar");

  const { data: systemSettings } = useQuery<SystemSettings>({
    queryKey: ["/api/settings/system"],
    queryFn: () => apiRequest("GET", "/api/settings/system").then(r => r.json()),
  });

  const { data: pickupSmsSettings } = useQuery<IdCardPickupSmsSettings>({
    queryKey: ["/api/settings/id-card-pickup-sms"],
    queryFn: () => apiRequest("GET", "/api/settings/id-card-pickup-sms").then(r => r.json()),
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
      setAttEarlyBuffer(systemSettings.attendance_early_buffer_minutes ?? 30);
      setAttLateBuffer(systemSettings.attendance_late_buffer_minutes ?? 60);
      setAttMinDuration(systemSettings.attendance_min_shift_duration_minutes ?? 30);
      setAttMaxSubmissions(systemSettings.attendance_max_daily_submissions ?? 2);
    }
  }, [systemSettings]);

  useEffect(() => {
    if (pickupSmsSettings) {
      setPickupTplAr(pickupSmsSettings.template_ar ?? "");
      setPickupTplEn(pickupSmsSettings.template_en ?? "");
      setPickupVenue(pickupSmsSettings.venue ?? "");
      setPickupLocationUrl(pickupSmsSettings.location_url ?? "");
    }
  }, [pickupSmsSettings]);

  const saveSettings = useMutation({
    mutationFn: (data: Record<string, string>) =>
      apiRequest("PATCH", "/api/settings/system", data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/system"] });
      toast({ title: t("settings:toasts.saved"), description: t("settings:toasts.savedDesc") });
    },
    onError: () => toast({ title: t("settings:toasts.saveFailed"), variant: "destructive" }),
  });

  const savePickupSms = useMutation({
    mutationFn: (data: IdCardPickupSmsSettings) =>
      apiRequest("PUT", "/api/settings/id-card-pickup-sms", data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/id-card-pickup-sms"] });
      toast({ title: t("settings:idCardPickup.savedToast") });
    },
    onError: () => toast({ title: t("settings:idCardPickup.saveFailedToast"), variant: "destructive" }),
  });

  const handleSave = () => {
    const effectiveNtpServer = useCustomNtp ? customNtpServer : ntpServerUrl;
    saveSettings.mutate({
      support_email: supportEmail,
      privacy_policy: privacyPolicy,
      terms_conditions: termsConditions,
      ntp_server_url: effectiveNtpServer,
      organization_timezone: organizationTimezone,
      attendance_early_buffer_minutes: String(attEarlyBuffer),
      attendance_late_buffer_minutes: String(attLateBuffer),
      attendance_min_shift_duration_minutes: String(attMinDuration),
      attendance_max_daily_submissions: String(attMaxSubmissions),
    });
    savePickupSms.mutate({
      template_ar: pickupTplAr,
      template_en: pickupTplEn,
      venue: pickupVenue,
      location_url: pickupLocationUrl,
    });
  };

  const insertPickupPlaceholder = (placeholder: string) => {
    const ref = pickupActiveField === "ar" ? pickupTplArRef : pickupTplEnRef;
    const setter = pickupActiveField === "ar" ? setPickupTplAr : setPickupTplEn;
    const current = pickupActiveField === "ar" ? pickupTplAr : pickupTplEn;
    const ta = ref.current;
    if (!ta) {
      setter(current + placeholder);
      return;
    }
    const start = ta.selectionStart ?? current.length;
    const end = ta.selectionEnd ?? current.length;
    const next = current.slice(0, start) + placeholder + current.slice(end);
    setter(next);
    requestAnimationFrame(() => {
      ta.focus();
      const cursor = start + placeholder.length;
      ta.setSelectionRange(cursor, cursor);
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
            <h1 className="text-3xl font-display font-bold text-white tracking-tight">{t("settings:title")}</h1>
            <p className="text-muted-foreground mt-1">{t("settings:subtitle")}</p>
          </div>
          <Button onClick={handleSave} disabled={saveSettings.isPending} className="h-11 bg-primary text-primary-foreground font-bold uppercase tracking-wide text-xs">
            {saveSettings.isPending ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Save className="me-2 h-4 w-4" />}
            {t("settings:save")}
          </Button>
        </div>

        <Tabs defaultValue="general" className="w-full">
          <TabsList className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-9 w-full h-auto gap-2 bg-transparent p-0 mb-6">
            <TabsTrigger 
              value="general" 
              className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary border border-transparent data-[state=active]:border-primary/20 bg-card rounded-md h-12"
            >
              {t("settings:tabs.general")}
            </TabsTrigger>
            <TabsTrigger 
              value="attendance" 
              className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary border border-transparent data-[state=active]:border-primary/20 bg-card rounded-md h-12"
            >
              {t("settings:tabs.attendance")}
            </TabsTrigger>
            <TabsTrigger 
              value="id-cards" 
              className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary border border-transparent data-[state=active]:border-primary/20 bg-card rounded-md h-12"
              data-testid="tab-id-cards"
            >
              {t("settings:tabs.idCardPickup")}
            </TabsTrigger>
            <TabsTrigger 
              value="security" 
              className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary border border-transparent data-[state=active]:border-primary/20 bg-card rounded-md h-12"
            >
              {t("settings:tabs.security")}
            </TabsTrigger>
            <TabsTrigger 
              value="admin-users" 
              className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary border border-transparent data-[state=active]:border-primary/20 bg-card rounded-md h-12"
              data-testid="tab-admin-users"
            >
              {t("settings:tabs.adminUsers")}
            </TabsTrigger>
            <TabsTrigger 
              value="roles" 
              className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary border border-transparent data-[state=active]:border-primary/20 bg-card rounded-md h-12"
            >
              {t("settings:tabs.roles")}
            </TabsTrigger>
            <TabsTrigger 
              value="notifications" 
              className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary border border-transparent data-[state=active]:border-primary/20 bg-card rounded-md h-12"
            >
              {t("settings:tabs.notifications")}
            </TabsTrigger>
            <TabsTrigger 
              value="integrations" 
              className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary border border-transparent data-[state=active]:border-primary/20 bg-card rounded-md h-12"
            >
              {t("settings:tabs.integrations")}
            </TabsTrigger>
            <TabsTrigger 
              value="advanced" 
              className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary border border-transparent data-[state=active]:border-primary/20 bg-card rounded-md h-12"
            >
              {t("settings:tabs.advanced")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-6 m-0 animate-in fade-in-50 duration-500">
            <Card className="bg-card border-border">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-primary" />
                  <CardTitle className="text-xl text-white">{t("settings:org.title")}</CardTitle>
                </div>
                <CardDescription>{t("settings:org.desc")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="orgName" className="text-white">{t("settings:org.name")}</Label>
                    <Input id="orgName" defaultValue={t("settings:org.nameDefault")} className="bg-muted/30 border-border" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="industry" className="text-white">{t("settings:org.industry")}</Label>
                    <Input id="industry" defaultValue={t("settings:org.industryDefault")} className="bg-muted/30 border-border" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="supportEmail" className="text-white">{t("settings:org.supportEmail")}</Label>
                    <Input
                      id="supportEmail"
                      type="email"
                      dir="ltr"
                      placeholder={t("settings:org.supportEmailPh")}
                      value={supportEmail}
                      onChange={(e) => setSupportEmail(e.target.value)}
                      className="bg-muted/30 border-border"
                      data-testid="input-support-email"
                    />
                    <p className="text-xs text-muted-foreground">{t("settings:org.supportEmailHint")}</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-white">{t("settings:org.phone")}</Label>
                    <Input id="phone" dir="ltr" defaultValue={t("settings:org.phoneDefault")} className="bg-muted/30 border-border" />
                  </div>
                </div>

                <Separator className="bg-border" />

                <div>
                  <h3 className="text-base font-medium text-white mb-4">{t("settings:localization.title")}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="text-white">{t("settings:localization.timezone")}</Label>
                      <Input dir="ltr" defaultValue={t("settings:localization.timezoneDefault")} className="bg-muted/30 border-border" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-white">{t("settings:localization.dateFormat")}</Label>
                      <Input dir="ltr" defaultValue={t("settings:localization.dateFormatDefault")} className="bg-muted/30 border-border" />
                    </div>
                  </div>
                </div>

                <Separator className="bg-border" />

                <div>
                  <h3 className="text-base font-medium text-white mb-4">{t("settings:legal.title")}</h3>
                  <p className="text-sm text-muted-foreground mb-4">{t("settings:legal.intro")}</p>
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <Label htmlFor="privacyPolicy" className="text-white">{t("settings:legal.privacy")}</Label>
                      <textarea
                        id="privacyPolicy"
                        rows={8}
                        placeholder={t("settings:legal.privacyPh")}
                        value={privacyPolicy}
                        onChange={(e) => setPrivacyPolicy(e.target.value)}
                        className="flex w-full rounded-sm border border-border bg-muted/30 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary resize-y"
                        data-testid="textarea-privacy-policy"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="termsConditions" className="text-white">{t("settings:legal.terms")}</Label>
                      <textarea
                        id="termsConditions"
                        rows={8}
                        placeholder={t("settings:legal.termsPh")}
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

          <TabsContent value="attendance" className="space-y-6 m-0 animate-in fade-in-50 duration-500">
            <Card className="bg-card border-border">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-primary" />
                  <CardTitle className="text-white">{t("settings:attendance.title")}</CardTitle>
                </div>
                <CardDescription>{t("settings:attendance.desc")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="att-early-buffer" className="text-white">{t("settings:attendance.early")}</Label>
                    <p className="text-xs text-muted-foreground">{t("settings:attendance.earlyHint")}</p>
                    <Input
                      id="att-early-buffer"
                      data-testid="input-att-early-buffer"
                      dir="ltr"
                      type="number"
                      min={0}
                      max={120}
                      value={attEarlyBuffer}
                      onChange={(e) => setAttEarlyBuffer(Math.max(0, Math.min(120, parseInt(e.target.value) || 0)))}
                      className="bg-background border-border text-white max-w-[200px]"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="att-late-buffer" className="text-white">{t("settings:attendance.late")}</Label>
                    <p className="text-xs text-muted-foreground">{t("settings:attendance.lateHint")}</p>
                    <Input
                      id="att-late-buffer"
                      data-testid="input-att-late-buffer"
                      dir="ltr"
                      type="number"
                      min={0}
                      max={240}
                      value={attLateBuffer}
                      onChange={(e) => setAttLateBuffer(Math.max(0, Math.min(240, parseInt(e.target.value) || 0)))}
                      className="bg-background border-border text-white max-w-[200px]"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="att-min-duration" className="text-white">{t("settings:attendance.min")}</Label>
                    <p className="text-xs text-muted-foreground">{t("settings:attendance.minHint")}</p>
                    <Input
                      id="att-min-duration"
                      data-testid="input-att-min-duration"
                      dir="ltr"
                      type="number"
                      min={0}
                      max={480}
                      value={attMinDuration}
                      onChange={(e) => setAttMinDuration(Math.max(0, Math.min(480, parseInt(e.target.value) || 0)))}
                      className="bg-background border-border text-white max-w-[200px]"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="att-max-subs" className="text-white">{t("settings:attendance.max")}</Label>
                    <p className="text-xs text-muted-foreground">{t("settings:attendance.maxHint")}</p>
                    <Input
                      id="att-max-subs"
                      data-testid="input-att-max-submissions"
                      dir="ltr"
                      type="number"
                      min={1}
                      max={10}
                      value={attMaxSubmissions}
                      onChange={(e) => setAttMaxSubmissions(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                      className="bg-background border-border text-white max-w-[200px]"
                    />
                  </div>
                </div>
                <Separator className="bg-border" />
                <div className="bg-muted/30 rounded-md p-4 border border-border">
                  <h4 className="text-sm font-semibold text-white mb-2">{t("settings:attendance.howTitle")}</h4>
                  <ul className="text-xs text-muted-foreground space-y-1.5 list-disc list-inside">
                    <li><Trans i18nKey="settings:attendance.how.early" values={{ n: formatNumber(attEarlyBuffer, lng) }} components={[<strong className="text-white" />]} /></li>
                    <li><Trans i18nKey="settings:attendance.how.late" values={{ n: formatNumber(attLateBuffer, lng) }} components={[<strong className="text-white" />]} /></li>
                    <li><Trans i18nKey="settings:attendance.how.min" values={{ n: formatNumber(attMinDuration, lng) }} components={[<strong className="text-white" />]} /></li>
                    <li><Trans i18nKey="settings:attendance.how.max" values={{ n: formatNumber(attMaxSubmissions, lng) }} components={[<strong className="text-white" />]} /></li>
                    <li>{t("settings:attendance.how.noShift")}</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="id-cards" className="space-y-6 m-0 animate-in fade-in-50 duration-500">
            <Card className="bg-card border-border">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <IdCard className="h-5 w-5 text-primary" />
                  <CardTitle className="text-xl text-white">{t("settings:idCardPickup.title")}</CardTitle>
                </div>
                <CardDescription>{t("settings:idCardPickup.desc")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="pickup-venue" className="text-white">{t("settings:idCardPickup.venue")}</Label>
                    <Input
                      id="pickup-venue"
                      value={pickupVenue}
                      onChange={(e) => setPickupVenue(e.target.value)}
                      placeholder={t("settings:idCardPickup.venuePh")}
                      data-testid="input-pickup-venue"
                    />
                    <p className="text-xs text-muted-foreground">{t("settings:idCardPickup.venueHint")}</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pickup-location-url" className="text-white">{t("settings:idCardPickup.locationUrl")}</Label>
                    <Input
                      id="pickup-location-url"
                      value={pickupLocationUrl}
                      onChange={(e) => setPickupLocationUrl(e.target.value)}
                      placeholder={t("settings:idCardPickup.locationUrlPh")}
                      dir="ltr"
                      data-testid="input-pickup-location-url"
                    />
                    <p className="text-xs text-muted-foreground">{t("settings:idCardPickup.locationUrlHint")}</p>
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <Label className="text-white">{t("settings:idCardPickup.templateHint")}</Label>
                  <div className="flex flex-wrap gap-2">
                    {ID_CARD_PICKUP_VARS.map((v) => (
                      <button
                        key={v.key}
                        type="button"
                        onClick={() => insertPickupPlaceholder(v.placeholder)}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono bg-primary/15 text-primary hover-elevate active-elevate-2 border border-primary/20"
                        data-testid={`chip-pickup-var-${v.key}`}
                        title={t(`settings:idCardPickup.vars.${v.key}`)}
                      >
                        <Plus className="h-3 w-3" />
                        {v.placeholder}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="pickup-tpl-ar" className="text-white">{t("settings:idCardPickup.templateAr")}</Label>
                    <textarea
                      id="pickup-tpl-ar"
                      ref={pickupTplArRef}
                      value={pickupTplAr}
                      onChange={(e) => setPickupTplAr(e.target.value)}
                      onFocus={() => setPickupActiveField("ar")}
                      dir="rtl"
                      rows={5}
                      className="w-full rounded-md bg-background border border-input px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/40"
                      data-testid="textarea-pickup-tpl-ar"
                    />
                    <div className="rounded-md border border-border bg-muted/30 px-3 py-2" dir="rtl">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">{t("settings:idCardPickup.previewLabel")}</p>
                      <p className="text-sm text-white whitespace-pre-wrap" data-testid="text-pickup-preview-ar">
                        {resolveIdCardPickupPreview(pickupTplAr, pickupVenue, pickupLocationUrl)}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pickup-tpl-en" className="text-white">{t("settings:idCardPickup.templateEn")}</Label>
                    <textarea
                      id="pickup-tpl-en"
                      ref={pickupTplEnRef}
                      value={pickupTplEn}
                      onChange={(e) => setPickupTplEn(e.target.value)}
                      onFocus={() => setPickupActiveField("en")}
                      dir="ltr"
                      rows={5}
                      className="w-full rounded-md bg-background border border-input px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/40"
                      data-testid="textarea-pickup-tpl-en"
                    />
                    <div className="rounded-md border border-border bg-muted/30 px-3 py-2" dir="ltr">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">{t("settings:idCardPickup.previewLabel")}</p>
                      <p className="text-sm text-white whitespace-pre-wrap" data-testid="text-pickup-preview-en">
                        {resolveIdCardPickupPreview(pickupTplEn, pickupVenue, pickupLocationUrl)}
                      </p>
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
                  <CardTitle className="text-xl text-white">{t("settings:security.policiesTitle")}</CardTitle>
                </div>
                <CardDescription>{t("settings:security.policiesDesc")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-muted/20 border border-border rounded-md">
                    <div className="space-y-0.5">
                      <Label className="text-base text-white">{t("settings:security.twoFa")}</Label>
                      <p className="text-sm text-muted-foreground">{t("settings:security.twoFaHint")}</p>
                    </div>
                    <Switch defaultChecked />
                  </div>

                  <div className="flex items-center justify-between p-4 bg-muted/20 border border-border rounded-md">
                    <div className="space-y-0.5">
                      <Label className="text-base text-white">{t("settings:security.strict")}</Label>
                      <p className="text-sm text-muted-foreground">{t("settings:security.strictHint")}</p>
                    </div>
                    <Switch defaultChecked />
                  </div>

                  <div className="flex items-center justify-between p-4 bg-muted/20 border border-border rounded-md">
                    <div className="space-y-0.5">
                      <Label className="text-base text-white">{t("settings:security.session")}</Label>
                      <p className="text-sm text-muted-foreground">{t("settings:security.sessionHint")}</p>
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
                  <CardTitle className="text-xl text-white">{t("settings:ntp.title")}</CardTitle>
                </div>
                <CardDescription>{t("settings:ntp.desc")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="text-white">{t("settings:ntp.server")}</Label>
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
                        <SelectValue placeholder={t("settings:ntp.serverPh")} />
                      </SelectTrigger>
                      <SelectContent>
                        {NTP_SERVERS.map(group => (
                          <SelectGroup key={group.group}>
                            <SelectLabel>{t(`settings:ntp.groups.${group.group}`, group.group)}</SelectLabel>
                            {group.servers.map(s => (
                              <SelectItem key={s.value} value={s.value} dir="ltr">{s.label}</SelectItem>
                            ))}
                          </SelectGroup>
                        ))}
                        <SelectGroup>
                          <SelectLabel>{t("settings:ntp.groups.Other")}</SelectLabel>
                          <SelectItem value="custom">{t("settings:ntp.custom")}</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    {useCustomNtp && (
                      <Input
                        dir="ltr"
                        placeholder={t("settings:ntp.customPh")}
                        value={customNtpServer}
                        onChange={(e) => setCustomNtpServer(e.target.value)}
                        className="bg-muted/30 border-border mt-2"
                        data-testid="input-custom-ntp"
                      />
                    )}
                    <NtpHealthIndicator serverUrl={effectiveNtpUrl} />
                    <p className="text-xs text-muted-foreground">{t("settings:ntp.serverHint")}</p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-white">{t("settings:ntp.tz")}</Label>
                    <Select value={organizationTimezone} onValueChange={setOrganizationTimezone}>
                      <SelectTrigger className="bg-muted/30 border-border" data-testid="select-timezone">
                        <SelectValue placeholder={t("settings:ntp.tzPh")} />
                      </SelectTrigger>
                      <SelectContent>
                        <div className="p-2">
                          <Input
                            placeholder={t("settings:ntp.tzSearch")}
                            value={timezoneSearch}
                            onChange={(e) => setTimezoneSearch(e.target.value)}
                            className="h-8 bg-muted/30 border-border"
                            data-testid="input-timezone-search"
                          />
                        </div>
                        {filteredTimezones.map(tz => (
                          <SelectItem key={tz} value={tz} dir="ltr">
                            {tz} ({getUtcOffset(tz)})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {t("settings:ntp.tzHint")}
                    </p>
                  </div>
                </div>
                {systemSettings?.config_version && (
                  <p className="text-xs text-muted-foreground">
                    {t("settings:ntp.configVer", { v: formatNumber(systemSettings.config_version, lng) })}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Task #166 — admin-visible counter for the rotation rescue
                that runs on every photo upload. Lets SRE notice if a
                deploy disables it (rate→0), an iOS update spikes it
                (cost), or persistence starts failing (rate→0% with
                attempts climbing). */}
            <PhotoRotationTelemetryCard />
          </TabsContent>

          <TabsContent value="admin-users" className="m-0 animate-in fade-in-50 duration-500">
            <AdminUsersContent />
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
               <h3 className="text-lg font-medium text-white mb-2">{t("settings:integrations.title")}</h3>
               <p>{t("settings:integrations.desc")}</p>
               <Button variant="outline" className="mt-4 border-border text-white">{t("settings:integrations.manage")}</Button>
            </div>
          </TabsContent>
          
          <TabsContent value="advanced" className="m-0 animate-in fade-in-50 duration-500">
            <div className="p-8 text-center text-muted-foreground bg-card border border-destructive/20 border-dashed rounded-md bg-destructive/5">
               <Shield className="h-10 w-10 mx-auto text-destructive mb-4 opacity-70" />
               <h3 className="text-lg font-medium text-white mb-2">{t("settings:danger.title")}</h3>
               <p className="mb-4">{t("settings:danger.desc")}</p>
               <Button variant="destructive" className="font-bold">{t("settings:danger.delete")}</Button>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

// Task #166 — small SRE-facing card backed by the
// `/api/admin/telemetry/rotation-rescue` endpoint. Polls every 30s so
// it doubles as a live "is the rescue still firing?" indicator
// without needing a refresh. Renders the success rate prominently
// (success = persisted / persisted+failed); the per-bucket counts
// underneath let an admin spot a one-sided regression (e.g. only
// `+90°` rescues, suggesting a phone-OS-specific orientation bug).
type PhotoRotationTelemetry = {
  windowHours: number;
  total: number;
  persisted90: number;
  persistedNeg90: number;
  persistFailed: number;
  attempts: number;
  successRate: number | null;
  oldestAt: string | null;
  mostRecentAt: string | null;
};

function PhotoRotationTelemetryCard() {
  const { t, i18n } = useTranslation(["settings", "common"]);
  const lng = i18n.language;
  const queryClient = useQueryClient();
  const { data, isLoading, isFetching } = useQuery<PhotoRotationTelemetry>({
    queryKey: ["/api/admin/telemetry/rotation-rescue"],
    refetchInterval: 30_000,
  });

  const successPct =
    data && data.successRate != null
      ? `${formatNumber(Math.round(data.successRate * 1000) / 10, lng)}%`
      : "—";
  const lastEvent = data?.mostRecentAt
    ? new Date(data.mostRecentAt).toLocaleString(lng)
    : null;

  return (
    <Card className="bg-card border-border" data-testid="card-photo-rotation-telemetry">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RotateCw className="h-5 w-5 text-primary" />
            <CardTitle className="text-xl text-white">{t("settings:photoTelemetry.title")}</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/admin/telemetry/rotation-rescue"] })}
            disabled={isFetching}
            data-testid="button-refresh-photo-telemetry"
          >
            {isFetching ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <RefreshCw className="me-2 h-4 w-4" />}
            {t("settings:photoTelemetry.refresh")}
          </Button>
        </div>
        <CardDescription>{t("settings:photoTelemetry.desc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>{t("common:loading", "Loading...")}</span>
          </div>
        ) : !data || data.attempts === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="text-photo-telemetry-empty">
            {t("settings:photoTelemetry.noData")}
          </p>
        ) : (
          <>
            <div className="flex items-baseline gap-3">
              <span
                className="text-4xl font-bold font-display text-white"
                data-testid="stat-photo-rotation-success-rate"
              >
                <bdi>{successPct}</bdi>
              </span>
              <span className="text-sm text-muted-foreground">
                {t("settings:photoTelemetry.successRate")}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <TelemetryStat
                label={t("settings:photoTelemetry.attempts")}
                value={formatNumber(data.attempts, lng)}
                testId="stat-photo-rotation-attempts"
              />
              <TelemetryStat
                label={t("settings:photoTelemetry.rotatedCw")}
                value={formatNumber(data.persisted90, lng)}
                testId="stat-photo-rotation-cw"
              />
              <TelemetryStat
                label={t("settings:photoTelemetry.rotatedCcw")}
                value={formatNumber(data.persistedNeg90, lng)}
                testId="stat-photo-rotation-ccw"
              />
              <TelemetryStat
                label={t("settings:photoTelemetry.failed")}
                value={formatNumber(data.persistFailed, lng)}
                tone={data.persistFailed > 0 ? "warn" : "default"}
                testId="stat-photo-rotation-failed"
              />
            </div>
            {lastEvent && (
              <p className="text-xs text-muted-foreground" data-testid="text-photo-telemetry-last-event">
                {t("settings:photoTelemetry.lastEventAt")} <bdi>{lastEvent}</bdi>
              </p>
            )}
          </>
        )}
        <p className="text-xs text-muted-foreground">{t("settings:photoTelemetry.windowHint")}</p>
      </CardContent>
    </Card>
  );
}

function TelemetryStat({
  label,
  value,
  tone = "default",
  testId,
}: {
  label: string;
  value: string;
  tone?: "default" | "warn";
  testId?: string;
}) {
  return (
    <div className="p-3 bg-muted/20 border border-border rounded-md">
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <p
        className={`text-2xl font-bold font-display mt-1 ${tone === "warn" ? "text-amber-400" : "text-white"}`}
        data-testid={testId}
      >
        <bdi>{value}</bdi>
      </p>
    </div>
  );
}
