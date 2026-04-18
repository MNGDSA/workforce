import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import DashboardLayout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  User,
  Phone,
  Mail,
  Shield,
  IdCard,
  KeyRound,
  Eye,
  EyeOff,
  Save,
} from "lucide-react";

type MeUser = {
  id: number;
  name?: string;
  fullName?: string;
  email: string;
  role: string;
  phone: string | null;
  nationalId: string | null;
};

export default function ProfilePage() {
  const { t } = useTranslation(["profile", "common"]);
  const { toast } = useToast();

  const sessionUser = useMemo(() => {
    try {
      const raw = localStorage.getItem("workforce_candidate");
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }, []);

  const { data: meUser } = useQuery<MeUser>({ queryKey: ["/api/me"] });

  const displayName: string =
    sessionUser?.fullNameEn ||
    meUser?.fullName ||
    meUser?.name ||
    (sessionUser?.nationalId ? `${t("profile:idPrefix")} ${sessionUser.nationalId}` : t("profile:defaultName"));

  const rawRole = meUser?.role ?? sessionUser?.role ?? "";
  const displayRole: string =
    rawRole === "admin" || rawRole === "super_admin" ? t("profile:roles.administrator") :
    rawRole === "recruiter" ? t("profile:roles.recruiter") :
    rawRole === "manager" ? t("profile:roles.manager") :
    rawRole || t("profile:roles.staff");

  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w: string) => w[0])
    .join("")
    .toUpperCase() || "AU";

  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const changePwdMutation = useMutation({
    mutationFn: async () => {
      if (newPwd !== confirmPwd) throw new Error(t("profile:passwordsDoNotMatchError"));
      if (newPwd.length < 8) throw new Error(t("profile:passwordTooShort"));
      await apiRequest("POST", "/api/auth/change-password", {
        currentPassword: currentPwd,
        newPassword: newPwd,
      });
    },
    onSuccess: () => {
      toast({ title: t("profile:passwordUpdated"), description: t("profile:passwordUpdatedDesc") });
      setCurrentPwd(""); setNewPwd(""); setConfirmPwd("");
    },
    onError: (err: Error) => {
      toast({ title: t("profile:passwordUpdateFailed"), description: err.message, variant: "destructive" });
    },
  });

  const roleBadgeColor =
    rawRole === "admin" || rawRole === "super_admin" ? "bg-primary/20 text-primary border-primary/30" :
    rawRole === "recruiter" ? "bg-blue-500/20 text-blue-400 border-blue-500/30" :
    "bg-muted/40 text-muted-foreground border-border";

  return (
    <DashboardLayout>
      <div className="max-w-2xl space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-display font-bold text-white tracking-tight flex items-center gap-3">
            <User className="h-7 w-7 text-primary" />
            {t("profile:title")}
          </h1>
          <p className="text-muted-foreground mt-1">{t("profile:subtitle")}</p>
        </div>

        {/* Identity card */}
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center gap-5">
              <div className="h-16 w-16 rounded-full bg-primary/20 border-2 border-primary/40 flex items-center justify-center shrink-0">
                <span className="text-2xl font-display font-bold text-primary">{initials}</span>
              </div>
              <div>
                <p className="text-xl font-display font-bold text-white"><bdi>{displayName}</bdi></p>
                <Badge className={`mt-1 text-xs border ${roleBadgeColor}`}>{displayRole}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Account details */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-white flex items-center gap-2">
              <IdCard className="h-4 w-4 text-primary" />
              {t("profile:accountDetails")}
            </CardTitle>
            <CardDescription>{t("profile:accountDetailsSub")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <User className="h-3 w-3" /> {t("profile:fields.fullName")}
                </Label>
                <p className="text-sm text-white font-medium bg-muted/20 border border-border rounded-md px-3 py-2">
                  <bdi>{meUser?.fullName || meUser?.name || displayName}</bdi>
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Shield className="h-3 w-3" /> {t("profile:fields.role")}
                </Label>
                <p className="text-sm text-white font-medium bg-muted/20 border border-border rounded-md px-3 py-2 capitalize">
                  {meUser?.role ?? sessionUser?.role ?? "—"}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Mail className="h-3 w-3" /> {t("profile:fields.email")}
                </Label>
                <p className="text-sm text-white font-medium bg-muted/20 border border-border rounded-md px-3 py-2" dir="ltr">
                  {meUser?.email || sessionUser?.email || "—"}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Phone className="h-3 w-3" /> {t("profile:fields.phone")}
                </Label>
                <p className="text-sm text-white font-medium bg-muted/20 border border-border rounded-md px-3 py-2" dir="ltr">
                  {meUser?.phone || sessionUser?.phone || "—"}
                </p>
              </div>

              {(meUser?.nationalId || sessionUser?.nationalId) && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <IdCard className="h-3 w-3" /> {t("profile:fields.nationalId")}
                  </Label>
                  <p className="text-sm text-white font-mono bg-muted/20 border border-border rounded-md px-3 py-2" dir="ltr">
                    {meUser?.nationalId ?? sessionUser?.nationalId}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Change password */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-white flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-primary" />
              {t("profile:changePassword")}
            </CardTitle>
            <CardDescription>{t("profile:changePasswordSub")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="current-pwd" className="text-sm text-white">{t("profile:currentPassword")}</Label>
              <div className="relative">
                <Input
                  id="current-pwd"
                  type={showCurrent ? "text" : "password"}
                  value={currentPwd}
                  onChange={(e) => setCurrentPwd(e.target.value)}
                  className="bg-muted/30 border-border pe-10"
                  placeholder={t("profile:currentPasswordPlaceholder")}
                  data-testid="input-current-password"
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white"
                >
                  {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Separator className="bg-border/50" />

            <div className="space-y-1.5">
              <Label htmlFor="new-pwd" className="text-sm text-white">{t("profile:newPassword")}</Label>
              <div className="relative">
                <Input
                  id="new-pwd"
                  type={showNew ? "text" : "password"}
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  className="bg-muted/30 border-border pe-10"
                  placeholder={t("profile:newPasswordPlaceholder")}
                  data-testid="input-new-password"
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white"
                >
                  {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirm-pwd" className="text-sm text-white">{t("profile:confirmPassword")}</Label>
              <Input
                id="confirm-pwd"
                type="password"
                value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
                className={`bg-muted/30 border-border ${confirmPwd && confirmPwd !== newPwd ? "border-destructive focus-visible:ring-destructive" : ""}`}
                placeholder={t("profile:confirmPasswordPlaceholder")}
                data-testid="input-confirm-password"
                dir="ltr"
              />
              {confirmPwd && confirmPwd !== newPwd && (
                <p className="text-xs text-destructive">{t("profile:passwordsDoNotMatch")}</p>
              )}
            </div>

            <Button
              onClick={() => changePwdMutation.mutate()}
              disabled={!currentPwd || !newPwd || !confirmPwd || changePwdMutation.isPending}
              className="bg-primary text-primary-foreground font-bold w-full sm:w-auto"
              data-testid="button-change-password"
            >
              <Save className="me-2 h-4 w-4" />
              {changePwdMutation.isPending ? t("profile:updating") : t("profile:updatePassword")}
            </Button>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
