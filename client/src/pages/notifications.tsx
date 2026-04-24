import DashboardLayout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  Bell,
  CheckCircle2,
  AlertTriangle,
  Mail,
  Eye,
  EyeOff,
  Lock,
  Server,
  AtSign,
  User,
  Puzzle,
  Upload,
  Download,
  Zap,
  Trash2,
  ChevronRight,
  PlugZap,
  ShieldCheck,
  Info,
  Send,
  RotateCcw,
  Plus,
} from "lucide-react";
import { useState, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { SmsPlugin, SmsPluginConfig, SmsCredentialDef } from "@shared/schema";
import { useTranslation, Trans } from "react-i18next";

// ─── Example plugins users can download ──────────────────────────────────────
const EXAMPLE_PLUGINS: Record<string, SmsPluginConfig> = {
  goinfinito: {
    name: "GoInfinito SMS",
    description: "CITC-compliant SMS gateway for Saudi Arabia via GoInfinito (ValueFirst)",
    version: "1.1.0",
    author: "Workforce Platform",
    credentials: [
      { key: "clientId", label: "Client ID", type: "text", required: true, placeholder: "Your GoInfinito Client ID", hint: "Found in your GoInfinito dashboard." },
      { key: "clientPassword", label: "Client Password", type: "secret", required: true, placeholder: "Your GoInfinito Client Password", hint: "Found in your GoInfinito dashboard." },
      { key: "senderId", label: "Sender ID", type: "text", required: true, placeholder: "e.g. WORKFORCE", hint: "Case-sensitive — must match your approved Sender ID exactly as shown in the GoInfinito portal (e.g. TANAQOL not Tanaqol). Must be pre-registered with CITC (CST). Promotional IDs must end with -AD." },
    ],
    send: {
      endpoint: "https://api.goinfinito.me/unified/v2/send",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-client-id": "{{clientId}}",
        "x-client-password": "{{clientPassword}}",
      },
      body: {
        sms: {
          ver: "2.0",
          dlr: { url: "" },
          messages: [
            {
              udh: "0",
              text: "{{message}}",
              property: 0,
              id: "{{timestamp}}",
              addresses: [
                {
                  from: "{{senderId}}",
                  to: "{{to}}",
                  seq: "1",
                  tag: "",
                },
              ],
            },
          ],
        },
      },
      successStatusCodes: [200],
      responseSuccessField: "status",
      responseSuccessValue: "Success",
      responsePartialErrorPath: "messageack.guids.0.errors",
      responseMessageIdPath: "messageack.guids.0.guid",
      responseErrorPath: "statustext",
    },
    compliance: { region: "Saudi Arabia", notes: "Sender ID must be pre-registered with CITC (CST). Promotional messages restricted to 9:00 AM – 8:00 PM KSA time." },
  },
  unifonic: {
    name: "Unifonic SMS",
    description: "Saudi-headquartered SMS gateway with strong regional coverage across KSA and Middle East",
    version: "1.0.0",
    author: "Workforce Platform",
    credentials: [
      { key: "appSid", label: "App SID", type: "secret", required: true, placeholder: "Your Unifonic AppSid", hint: "Found in the Unifonic developer portal." },
      { key: "senderId", label: "Sender ID", type: "text", required: true, placeholder: "e.g. WORKFORCE", hint: "Must be pre-approved by Unifonic and local carriers." },
    ],
    send: {
      endpoint: "https://api.unifonic.com/rest/SMS/messages",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: { AppSid: "{{appSid}}", SenderID: "{{senderId}}", Body: "{{message}}", Recipient: "{{to}}" },
      successStatusCodes: [200],
      responseMessageIdPath: "data.MessageID",
      responseErrorPath: "error.message",
    },
    compliance: { region: "Saudi Arabia / Middle East", notes: "CITC-compliant. Strong coverage across KSA, UAE, Egypt." },
  },
  twilio: {
    name: "Twilio SMS",
    description: "Global SMS provider with high deliverability — ideal as an international backup",
    version: "1.0.0",
    author: "Workforce Platform",
    credentials: [
      { key: "accountSid", label: "Account SID", type: "text", required: true, placeholder: "ACxxxxxxxxxxxxxxxx", hint: "Found on your Twilio Console dashboard." },
      { key: "authToken", label: "Auth Token", type: "secret", required: true, placeholder: "Your Twilio auth token", hint: "Found on your Twilio Console dashboard." },
      { key: "fromNumber", label: "From Number", type: "text", required: true, placeholder: "+1415XXXXXXX", hint: "A Twilio phone number in E.164 format." },
    ],
    send: {
      endpoint: "https://api.twilio.com/2010-04-01/Accounts/{{accountSid}}/Messages.json",
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Authorization": "Basic {{accountSid}}:{{authToken}}" },
      body: { To: "{{to}}", From: "{{fromNumber}}", Body: "{{message}}" },
      successStatusCodes: [200, 201],
      responseMessageIdPath: "sid",
      responseErrorPath: "message",
    },
    compliance: { region: "Global", notes: "International backup provider. Additional fees may apply for KSA routes." },
  },
};

function downloadPlugin(key: string) {
  const config = EXAMPLE_PLUGINS[key];
  const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${key}-sms-plugin.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── SMTP Email Section (unchanged) ──────────────────────────────────────────
function SmtpSection() {
  const { t } = useTranslation(["notifications"]);
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [config, setConfig] = useState({ host: "", port: "587", encryption: "tls", username: "", password: "", fromName: "", fromEmail: "", enabled: false });

  const handleSave = () => {
    if (!config.host || !config.username || !config.fromEmail) {
      toast({ title: t("notifications:smtp.toasts.missingTitle"), description: t("notifications:smtp.toasts.missingDesc"), variant: "destructive" });
      return;
    }
    toast({ title: t("notifications:smtp.toasts.savedTitle"), description: t("notifications:smtp.toasts.savedDesc") });
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-md bg-blue-500 flex items-center justify-center text-white shrink-0">
              <Mail className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base text-white">{t("notifications:smtp.title")}</CardTitle>
              <CardDescription className="text-xs">{t("notifications:smtp.subtitle")}</CardDescription>
            </div>
          </div>
          <Switch checked={config.enabled} onCheckedChange={(c) => setConfig({ ...config, enabled: c })} />
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold flex items-center gap-1.5"><Server className="h-3.5 w-3.5" /> {t("notifications:smtp.server")}</p>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="smtpHost" className="text-white">{t("notifications:smtp.host")}</Label>
              <Input id="smtpHost" dir="ltr" placeholder="smtp.gmail.com" value={config.host} onChange={(e) => setConfig({ ...config, host: e.target.value })} className="bg-muted/30 border-border font-mono" />
            </div>
            <div className="space-y-2">
              <Label className="text-white">{t("notifications:smtp.port")}</Label>
              <Select value={config.port} onValueChange={(v) => setConfig({ ...config, port: v })}>
                <SelectTrigger className="bg-muted/30 border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">{t("notifications:smtp.ports.25")}</SelectItem>
                  <SelectItem value="465">{t("notifications:smtp.ports.465")}</SelectItem>
                  <SelectItem value="587">{t("notifications:smtp.ports.587")}</SelectItem>
                  <SelectItem value="2525">{t("notifications:smtp.ports.2525")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Select value={config.encryption} onValueChange={(v) => setConfig({ ...config, encryption: v })}>
            <SelectTrigger className="bg-muted/30 border-border"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("notifications:smtp.encryption.none")}</SelectItem>
              <SelectItem value="tls">{t("notifications:smtp.encryption.tls")}</SelectItem>
              <SelectItem value="ssl">{t("notifications:smtp.encryption.ssl")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Separator className="bg-border" />
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" /> {t("notifications:smtp.auth")}</p>
          <Input dir="ltr" placeholder={t("notifications:smtp.usernamePh")} value={config.username} onChange={(e) => setConfig({ ...config, username: e.target.value })} className="bg-muted/30 border-border" />
          <div className="relative">
            <Input dir="ltr" type={showPassword ? "text" : "password"} placeholder={t("notifications:smtp.passwordPh")} value={config.password} onChange={(e) => setConfig({ ...config, password: e.target.value })} className="bg-muted/30 border-border pe-10" />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white">
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <Separator className="bg-border" />
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold flex items-center gap-1.5"><AtSign className="h-3.5 w-3.5" /> {t("notifications:smtp.sender")}</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-white flex items-center gap-1.5"><User className="h-3.5 w-3.5" /> {t("notifications:smtp.fromName")}</Label>
              <Input placeholder={t("notifications:smtp.fromNamePh")} value={config.fromName} onChange={(e) => setConfig({ ...config, fromName: e.target.value })} className="bg-muted/30 border-border" />
            </div>
            <div className="space-y-2">
              <Label className="text-white flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> {t("notifications:smtp.fromEmail")}</Label>
              <Input dir="ltr" type="email" placeholder="noreply@company.sa" value={config.fromEmail} onChange={(e) => setConfig({ ...config, fromEmail: e.target.value })} className="bg-muted/30 border-border" />
            </div>
          </div>
        </div>
        <div className="flex justify-end pt-2 border-t border-border">
          <Button onClick={handleSave} className="bg-primary text-primary-foreground font-bold">{t("notifications:smtp.save")}</Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── SMS Plugin Manager ───────────────────────────────────────────────────────
type PanelMode = "list" | "install" | "configure";

function SmsPluginManager() {
  const { t } = useTranslation(["notifications"]);
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<PanelMode>("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [jsonInput, setJsonInput] = useState("");
  const [parsedConfig, setParsedConfig] = useState<SmsPluginConfig | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [credValues, setCredValues] = useState<Record<string, string>>({});
  const [showSecret, setShowSecret] = useState<Record<string, boolean>>({});
  const [testTo, setTestTo] = useState("");
  const [testMsg, setTestMsg] = useState("Workforce SA: test message / رسالة اختبار.");
  const [testResult, setTestResult] = useState<{ success: boolean; messageId?: string; error?: string; statusCode?: number; rawResponse?: unknown } | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: plugins = [] } = useQuery<SmsPlugin[]>({
    queryKey: ["/api/sms-plugins"],
    queryFn: () => apiRequest("GET", "/api/sms-plugins").then((r) => r.json()),
  });

  const selectedPlugin = plugins.find((p) => p.id === selectedId) ?? null;

  const installMutation = useMutation({
    mutationFn: (body: object) => apiRequest("POST", "/api/sms-plugins", body).then((r) => r.json()),
    onSuccess: () => {
      toast({ title: t("notifications:sms.toasts.installed"), description: t("notifications:sms.toasts.installedDesc", { name: parsedConfig?.name ?? "" }) });
      qc.invalidateQueries({ queryKey: ["/api/sms-plugins"] });
      resetInstall();
      setMode("list");
    },
    onError: (e: Error) => toast({ title: t("notifications:sms.toasts.installFailed"), description: e.message, variant: "destructive" }),
  });

  const credMutation = useMutation({
    mutationFn: ({ id, creds }: { id: string; creds: Record<string, string> }) =>
      apiRequest("PATCH", `/api/sms-plugins/${id}/credentials`, creds).then((r) => r.json()),
    onSuccess: () => {
      toast({ title: t("notifications:sms.toasts.credsSaved") });
      qc.invalidateQueries({ queryKey: ["/api/sms-plugins"] });
    },
    onError: (e: Error) => toast({ title: t("notifications:sms.toasts.saveFailed"), description: e.message, variant: "destructive" }),
  });

  const activateMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/sms-plugins/${id}/activate`).then((r) => r.json()),
    onSuccess: (_, id) => {
      const name = plugins.find((p) => p.id === id)?.name ?? "";
      toast({ title: t("notifications:sms.toasts.activated"), description: t("notifications:sms.toasts.activatedDesc", { name }) });
      qc.invalidateQueries({ queryKey: ["/api/sms-plugins"] });
    },
    onError: (e: Error) => toast({ title: t("notifications:sms.toasts.activationFailed"), description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/sms-plugins/${id}`),
    onSuccess: () => {
      toast({ title: t("notifications:sms.toasts.removed") });
      qc.invalidateQueries({ queryKey: ["/api/sms-plugins"] });
      if (selectedId === deleteId) { setSelectedId(null); setMode("list"); }
      setDeleteId(null);
    },
    onError: (e: Error) => toast({ title: t("notifications:sms.toasts.deleteFailed"), description: e.message, variant: "destructive" }),
  });

  const testMutation = useMutation({
    mutationFn: ({ id, to, message }: { id: string; to: string; message: string }) =>
      apiRequest("POST", `/api/sms-plugins/${id}/test`, { to, message }).then((r) => r.json()),
    onSuccess: (data) => setTestResult(data),
    onError: (e: Error) => setTestResult({ success: false, error: e.message }),
  });

  function parseJson(raw: string) {
    setParseError(null);
    setParsedConfig(null);
    // Strip UTF-8 BOM and normalize whitespace
    const cleaned = raw.replace(/^\uFEFF/, "").trim();
    if (!cleaned) return;
    try {
      const obj = JSON.parse(cleaned);
      const missingFields = [];
      if (!obj.name) missingFields.push("name");
      if (!obj.version) missingFields.push("version");
      if (!Array.isArray(obj.credentials)) missingFields.push("credentials");
      if (!obj.send?.endpoint) missingFields.push("send.endpoint");
      if (!obj.send?.method) missingFields.push("send.method");
      if (!Array.isArray(obj.send?.successStatusCodes)) missingFields.push("send.successStatusCodes");
      if (missingFields.length > 0) {
        setParseError(t("notifications:sms.installPanel.missingFields", { fields: missingFields.join(", ") }));
        return;
      }
      setParsedConfig(obj as SmsPluginConfig);
      const initCreds: Record<string, string> = {};
      (obj.credentials as SmsCredentialDef[]).forEach((c) => { initCreds[c.key] = ""; });
      setCredValues(initCreds);
    } catch (e) {
      const msg = e instanceof SyntaxError ? e.message : String(e);
      setParseError(t("notifications:sms.installPanel.invalidJson", { msg }));
    }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setJsonInput(text);
      parseJson(text);
    };
    reader.readAsText(file, "utf-8");
    // Reset input value so the same file can be re-uploaded
    e.target.value = "";
  }

  function resetInstall() {
    setJsonInput("");
    setParsedConfig(null);
    setParseError(null);
    setCredValues({});
    if (fileRef.current) fileRef.current.value = "";
  }

  function openConfigure(plugin: SmsPlugin) {
    setSelectedId(plugin.id);
    const savedCreds = (plugin.credentials ?? {}) as Record<string, string>;
    setCredValues(savedCreds);
    setTestResult(null);
    setMode("configure");
  }

  const config = selectedPlugin ? (selectedPlugin.pluginConfig as SmsPluginConfig) : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <PlugZap className="h-4 w-4 text-primary" />
            {t("notifications:sms.title")}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">{t("notifications:sms.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="border-border text-muted-foreground hover:text-white gap-1.5">
                <Download className="h-3.5 w-3.5" />
                {t("notifications:sms.examples")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => downloadPlugin("goinfinito")}>{t("notifications:sms.examplesMenu.goinfinito")}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => downloadPlugin("unifonic")}>{t("notifications:sms.examplesMenu.unifonic")}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => downloadPlugin("twilio")}>{t("notifications:sms.examplesMenu.twilio")}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" className="bg-primary text-primary-foreground gap-1.5" onClick={() => { resetInstall(); setMode("install"); setSelectedId(null); }}>
            <Plus className="h-3.5 w-3.5" />
            {t("notifications:sms.install")}
          </Button>
        </div>
      </div>

      {/* Plugin list + side panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: installed plugin list */}
        <div className="space-y-2">
          {plugins.length === 0 && mode !== "install" && (
            <div className="p-6 text-center border border-dashed border-border rounded-md bg-muted/10 space-y-3">
              <Puzzle className="h-8 w-8 mx-auto text-muted-foreground opacity-40" />
              <p className="text-sm text-muted-foreground">{t("notifications:sms.empty")}</p>
              <Button size="sm" variant="outline" className="border-border" onClick={() => setMode("install")}>{t("notifications:sms.installFirst")}</Button>
            </div>
          )}
          {plugins.map((p) => (
            <button
              key={p.id}
              onClick={() => openConfigure(p)}
              className={cn(
                "w-full text-start p-3 rounded-md border transition-all group",
                selectedId === p.id && mode === "configure"
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card hover:border-primary/40"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-white truncate"><bdi>{p.name}</bdi></span>
                    <span className="text-xs text-muted-foreground" dir="ltr">v{p.version}</span>
                  </div>
                  {p.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{p.description}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {p.isActive
                    ? <Badge className="bg-primary/15 text-primary border-primary/20 text-xs">{t("notifications:sms.active")}</Badge>
                    : <Badge variant="outline" className="text-xs text-muted-foreground">{t("notifications:sms.inactive")}</Badge>}
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-white transition-colors rtl:rotate-180" />
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Right: install or configure panel */}
        <div className="lg:col-span-2">
          {/* ── Install panel ── */}
          {mode === "install" && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-white flex items-center gap-2"><Upload className="h-4 w-4 text-primary" /> {t("notifications:sms.installPanel.title")}</CardTitle>
                <CardDescription>{t("notifications:sms.installPanel.subtitle")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Upload / paste */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label className="text-white">{t("notifications:sms.installPanel.json")}</Label>
                    <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={handleFileUpload} />
                    <Button variant="outline" size="sm" className="h-6 text-xs border-border gap-1" onClick={() => fileRef.current?.click()}>
                      <Upload className="h-3 w-3" /> {t("notifications:sms.installPanel.upload")}
                    </Button>
                  </div>
                  <Textarea
                    rows={10}
                    dir="ltr"
                    placeholder={'{\n  "name": "My SMS Gateway",\n  "version": "1.0.0",\n  "credentials": [...],\n  "send": { "endpoint": "...", ... }\n}'}
                    value={jsonInput}
                    onChange={(e) => { setJsonInput(e.target.value); parseJson(e.target.value); }}
                    className="bg-muted/30 border-border font-mono text-xs"
                  />
                  {parseError && (
                    <div className="flex items-start gap-2 text-destructive text-xs p-2 bg-destructive/10 rounded-md border border-destructive/20">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      {parseError}
                    </div>
                  )}

                  {/* Built-in template variables reference */}
                  <div className="rounded-md border border-border bg-muted/10 p-3 space-y-2">
                    <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground/60">{t("notifications:sms.installPanel.varsTitle")}</p>
                    <div className="grid grid-cols-1 gap-1">
                      {[
                        { v: "{{to}}",       descKey: "to" },
                        { v: "{{message}}",  descKey: "message" },
                        { v: "{{timestamp}}",descKey: "timestamp" },
                        { v: "{{uuid}}",     descKey: "uuid" },
                        { v: "{{coding}}",   descKey: "coding",   highlight: true },
                        { v: "{{unicode}}",  descKey: "unicode",  highlight: true },
                        { v: "{{encoding}}", descKey: "encoding", highlight: true },
                        { v: "{{charset}}",  descKey: "charset",  highlight: true },
                      ].map(({ v, descKey, highlight }) => (
                        <div key={v} className="flex items-start gap-2">
                          <code className={`text-[11px] font-mono px-1.5 py-0.5 rounded shrink-0 ${highlight ? "bg-primary/15 text-primary border border-primary/30" : "bg-muted/40 text-muted-foreground border border-border"}`} dir="ltr">{v}</code>
                          <span className="text-xs text-muted-foreground leading-5">{t(`notifications:sms.vars.${descKey}`)}</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground/50">
                      <Trans i18nKey="notifications:sms.installPanel.varsCredHint" components={[<code className="font-mono" dir="ltr" />]} />
                    </p>
                  </div>
                </div>

                {/* Parsed preview + credential form */}
                {parsedConfig && (
                  <div className="space-y-4 animate-in fade-in duration-300">
                    <div className="p-3 rounded-md bg-primary/5 border border-primary/20 space-y-1">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-primary" />
                        <span className="text-sm font-semibold text-white"><bdi>{parsedConfig.name}</bdi> <span className="text-xs font-normal text-muted-foreground" dir="ltr">v{parsedConfig.version}</span></span>
                      </div>
                      {parsedConfig.description && <p className="text-xs text-muted-foreground ps-6">{parsedConfig.description}</p>}
                      {parsedConfig.compliance?.notes && (
                        <div className="flex items-start gap-1.5 ps-6 text-xs text-yellow-500/80">
                          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                          {parsedConfig.compliance.notes}
                        </div>
                      )}
                    </div>

                    {parsedConfig.credentials.length > 0 && (
                      <div className="space-y-3">
                        <Label className="text-white text-xs uppercase tracking-wider">{t("notifications:sms.installPanel.configureCreds")}</Label>
                        {parsedConfig.credentials.map((cred) => (
                          <div key={cred.key} className="space-y-1.5">
                            <Label htmlFor={`inst-${cred.key}`} className="text-sm text-white">
                              {cred.label} {cred.required && <span className="text-destructive">*</span>}
                            </Label>
                            <div className="relative">
                              <Input
                                id={`inst-${cred.key}`}
                                dir="ltr"
                                type={cred.type === "secret" && !showSecret[cred.key] ? "password" : "text"}
                                placeholder={cred.placeholder}
                                value={credValues[cred.key] ?? ""}
                                onChange={(e) => setCredValues({ ...credValues, [cred.key]: e.target.value })}
                                className={cn("bg-muted/30 border-border", cred.type === "secret" && "font-mono pe-10")}
                              />
                              {cred.type === "secret" && (
                                <button type="button" onClick={() => setShowSecret({ ...showSecret, [cred.key]: !showSecret[cred.key] })} className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white">
                                  {showSecret[cred.key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                              )}
                            </div>
                            {cred.hint && <p className="text-xs text-muted-foreground">{cred.hint}</p>}
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-2 border-t border-border">
                      <Button
                        onClick={() => installMutation.mutate({ pluginConfig: parsedConfig, credentials: credValues })}
                        disabled={installMutation.isPending}
                        className="bg-primary text-primary-foreground font-bold"
                      >
                        <PlugZap className="me-2 h-4 w-4" />
                        {installMutation.isPending ? t("notifications:sms.installPanel.installing") : t("notifications:sms.installPanel.installBtn")}
                      </Button>
                      <Button variant="ghost" onClick={() => { resetInstall(); setMode("list"); }} className="text-muted-foreground">{t("notifications:sms.installPanel.cancel")}</Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── Configure panel ── */}
          {mode === "configure" && selectedPlugin && config && (
            <Card className="bg-card border-border animate-in fade-in duration-200">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base text-white flex items-center gap-2">
                      <Zap className="h-4 w-4 text-primary" />
                      <bdi>{selectedPlugin.name}</bdi>
                      <span className="text-xs font-normal text-muted-foreground" dir="ltr">v{selectedPlugin.version}</span>
                    </CardTitle>
                    {selectedPlugin.description && <CardDescription className="mt-1">{selectedPlugin.description}</CardDescription>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {selectedPlugin.isActive ? (
                      <Badge className="bg-primary/15 text-primary border-primary/20">{t("notifications:sms.active")}</Badge>
                    ) : (
                      <Button size="sm" variant="outline" className="h-7 text-xs border-border gap-1" onClick={() => activateMutation.mutate(selectedPlugin.id)} disabled={activateMutation.isPending}>
                        <CheckCircle2 className="h-3 w-3" /> {t("notifications:sms.configurePanel.activate")}
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10" onClick={() => setDeleteId(selectedPlugin.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-5">
                {/* Credentials */}
                {config.credentials.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">{t("notifications:sms.configurePanel.credentials")}</p>
                    {config.credentials.map((cred) => (
                      <div key={cred.key} className="space-y-1.5">
                        <Label htmlFor={`cfg-${cred.key}`} className="text-sm text-white">
                          {cred.label} {cred.required && <span className="text-destructive">*</span>}
                        </Label>
                        <div className="relative">
                          <Input
                            id={`cfg-${cred.key}`}
                            dir="ltr"
                            type={cred.type === "secret" && !showSecret[`cfg-${cred.key}`] ? "password" : "text"}
                            placeholder={cred.placeholder ?? ""}
                            value={credValues[cred.key] ?? ""}
                            onChange={(e) => setCredValues({ ...credValues, [cred.key]: e.target.value })}
                            className={cn("bg-muted/30 border-border", cred.type === "secret" && "font-mono pe-10")}
                          />
                          {cred.type === "secret" && (
                            <button type="button" onClick={() => setShowSecret({ ...showSecret, [`cfg-${cred.key}`]: !showSecret[`cfg-${cred.key}`] })} className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white">
                              {showSecret[`cfg-${cred.key}`] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          )}
                        </div>
                        {cred.hint && <p className="text-xs text-muted-foreground">{cred.hint}</p>}
                      </div>
                    ))}
                    <Button onClick={() => credMutation.mutate({ id: selectedPlugin.id, creds: credValues })} disabled={credMutation.isPending} size="sm" className="bg-primary text-primary-foreground font-bold">
                      {credMutation.isPending ? t("notifications:sms.configurePanel.saving") : t("notifications:sms.configurePanel.save")}
                    </Button>
                  </div>
                )}

                {/* Compliance note */}
                {config.compliance?.notes && (
                  <div className="rounded-md bg-yellow-500/10 border border-yellow-500/20 p-3 flex gap-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-medium text-yellow-500">{config.compliance.region ?? t("notifications:sms.configurePanel.compliance")}</p>
                      <p className="text-xs text-muted-foreground">{config.compliance.notes}</p>
                    </div>
                  </div>
                )}

                <Separator className="bg-border" />

                {/* Test send */}
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold flex items-center gap-1.5"><Send className="h-3.5 w-3.5" /> {t("notifications:sms.configurePanel.testSms")}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-sm text-white">{t("notifications:sms.configurePanel.recipient")}</Label>
                      <Input dir="ltr" placeholder="+9665XXXXXXXX" value={testTo} onChange={(e) => setTestTo(e.target.value)} className="bg-muted/30 border-border font-mono" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm text-white">{t("notifications:sms.configurePanel.message")}</Label>
                      <Input value={testMsg} onChange={(e) => setTestMsg(e.target.value)} className="bg-muted/30 border-border" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setTestResult(null); testMutation.mutate({ id: selectedPlugin.id, to: testTo, message: testMsg }); }}
                      disabled={testMutation.isPending || !testTo}
                      className="border-border gap-1.5"
                    >
                      <Send className="h-3.5 w-3.5" />
                      {testMutation.isPending ? t("notifications:sms.configurePanel.sending") : t("notifications:sms.configurePanel.send")}
                    </Button>
                    {testResult && (
                      <button onClick={() => setTestResult(null)} className="text-muted-foreground hover:text-white">
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  {testResult && (
                    <div className={cn("text-xs p-3 rounded-md border space-y-2", testResult.success ? "bg-primary/5 border-primary/20" : "bg-destructive/10 border-destructive/20")}>
                      <div className={cn("flex items-start gap-2", testResult.success ? "text-primary" : "text-destructive")}>
                        {testResult.success ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" /> : <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />}
                        <div className="space-y-1">
                          {testResult.success ? (
                            <>
                              <p className="font-medium">{t("notifications:sms.configurePanel.successTitle")}</p>
                              {testResult.messageId && (
                                <p className="text-muted-foreground font-mono" dir="ltr">{t("notifications:sms.configurePanel.messageId", { id: testResult.messageId })}</p>
                              )}
                              <p className="text-yellow-500/80">{t("notifications:sms.configurePanel.warnDelivery")}</p>
                            </>
                          ) : (
                            <>
                              <p className="font-medium">{t("notifications:sms.configurePanel.failed", { error: testResult.error })}</p>
                              {testResult.statusCode && <p className="text-muted-foreground" dir="ltr">{t("notifications:sms.configurePanel.httpStatus", { code: testResult.statusCode })}</p>}
                            </>
                          )}
                        </div>
                      </div>
                      {Boolean(testResult.rawResponse) && (
                        <details className="text-muted-foreground">
                          <summary className="cursor-pointer hover:text-white select-none">{t("notifications:sms.configurePanel.rawResponse")}</summary>
                          <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all font-mono text-[10px] bg-muted/20 p-2 rounded">
                            {JSON.stringify(testResult.rawResponse, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Default state */}
          {mode === "list" && plugins.length > 0 && !selectedId && (
            <div className="h-full flex items-center justify-center p-8 border border-dashed border-border rounded-md bg-muted/5 text-center">
              <div className="space-y-2">
                <Puzzle className="h-8 w-8 mx-auto text-muted-foreground opacity-30" />
                <p className="text-sm text-muted-foreground">{t("notifications:sms.selectPrompt")}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("notifications:sms.delete.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("notifications:sms.delete.body")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("notifications:sms.delete.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{t("notifications:sms.delete.confirm")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Notification Settings Content (exported for use in Settings page) ────────
export function NotificationSettingsContent() {
  const { t } = useTranslation(["notifications"]);
  return (
    <div className="space-y-6">
      <Tabs defaultValue="integrations" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 max-w-[400px] bg-muted/20">
          <TabsTrigger value="notifications">{t("notifications:tabs.alerts")}</TabsTrigger>
          <TabsTrigger value="integrations">{t("notifications:tabs.integrations")}</TabsTrigger>
        </TabsList>

        <TabsContent value="notifications" className="space-y-4">
          <Card className="bg-card border-border">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-display text-white">{t("notifications:alerts.title")}</CardTitle>
                <Button variant="outline" size="sm">{t("notifications:alerts.markAll")}</Button>
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
                        <h4 className="font-medium text-white text-sm">{t("notifications:alerts.sample.title")}</h4>
                        <span className="text-xs text-muted-foreground">{t("notifications:alerts.sample.ago")}</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{t("notifications:alerts.sample.body")}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="integrations" className="space-y-6">
          <SmsPluginManager />
          <SmtpSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function NotificationsPage() {
  const { t } = useTranslation(["notifications"]);
  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-5xl mx-auto">
        <div>
          <h1 className="text-3xl font-display font-bold text-white tracking-tight">{t("notifications:page.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("notifications:page.subtitle")}</p>
        </div>
        <NotificationSettingsContent />
      </div>
    </DashboardLayout>
  );
}
