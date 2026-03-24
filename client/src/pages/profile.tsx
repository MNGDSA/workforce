import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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
    (sessionUser?.nationalId ? `ID ${sessionUser.nationalId}` : "Admin User");

  const rawRole = meUser?.role ?? sessionUser?.role ?? "";
  const displayRole: string =
    rawRole === "admin" || rawRole === "super_admin" ? "Administrator" :
    rawRole === "recruiter" ? "Recruiter" :
    rawRole === "manager" ? "Manager" :
    rawRole || "Staff";

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
      if (newPwd !== confirmPwd) throw new Error("New passwords do not match.");
      if (newPwd.length < 8) throw new Error("New password must be at least 8 characters.");
      await apiRequest("POST", "/api/auth/change-password", {
        currentPassword: currentPwd,
        newPassword: newPwd,
      });
    },
    onSuccess: () => {
      toast({ title: "Password updated", description: "Your password has been changed successfully." });
      setCurrentPwd(""); setNewPwd(""); setConfirmPwd("");
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update password", description: err.message, variant: "destructive" });
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
            My Profile
          </h1>
          <p className="text-muted-foreground mt-1">Your account information and security settings.</p>
        </div>

        {/* Identity card */}
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center gap-5">
              <div className="h-16 w-16 rounded-full bg-primary/20 border-2 border-primary/40 flex items-center justify-center shrink-0">
                <span className="text-2xl font-display font-bold text-primary">{initials}</span>
              </div>
              <div>
                <p className="text-xl font-display font-bold text-white">{displayName}</p>
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
              Account Details
            </CardTitle>
            <CardDescription>Your registered identity information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <User className="h-3 w-3" /> Full Name
                </Label>
                <p className="text-sm text-white font-medium bg-muted/20 border border-border rounded-md px-3 py-2">
                  {meUser?.fullName || meUser?.name || displayName}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Shield className="h-3 w-3" /> Role
                </Label>
                <p className="text-sm text-white font-medium bg-muted/20 border border-border rounded-md px-3 py-2 capitalize">
                  {meUser?.role ?? sessionUser?.role ?? "—"}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Mail className="h-3 w-3" /> Email
                </Label>
                <p className="text-sm text-white font-medium bg-muted/20 border border-border rounded-md px-3 py-2">
                  {meUser?.email || sessionUser?.email || "—"}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Phone className="h-3 w-3" /> Phone
                </Label>
                <p className="text-sm text-white font-medium bg-muted/20 border border-border rounded-md px-3 py-2">
                  {meUser?.phone || sessionUser?.phone || "—"}
                </p>
              </div>

              {(meUser?.nationalId || sessionUser?.nationalId) && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <IdCard className="h-3 w-3" /> National ID
                  </Label>
                  <p className="text-sm text-white font-mono bg-muted/20 border border-border rounded-md px-3 py-2">
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
              Change Password
            </CardTitle>
            <CardDescription>Choose a strong password of at least 8 characters</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="current-pwd" className="text-sm text-white">Current Password</Label>
              <div className="relative">
                <Input
                  id="current-pwd"
                  type={showCurrent ? "text" : "password"}
                  value={currentPwd}
                  onChange={(e) => setCurrentPwd(e.target.value)}
                  className="bg-muted/30 border-border pr-10"
                  placeholder="Enter current password"
                  data-testid="input-current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white"
                >
                  {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Separator className="bg-border/50" />

            <div className="space-y-1.5">
              <Label htmlFor="new-pwd" className="text-sm text-white">New Password</Label>
              <div className="relative">
                <Input
                  id="new-pwd"
                  type={showNew ? "text" : "password"}
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  className="bg-muted/30 border-border pr-10"
                  placeholder="At least 8 characters"
                  data-testid="input-new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white"
                >
                  {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirm-pwd" className="text-sm text-white">Confirm New Password</Label>
              <Input
                id="confirm-pwd"
                type="password"
                value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
                className={`bg-muted/30 border-border ${confirmPwd && confirmPwd !== newPwd ? "border-destructive focus-visible:ring-destructive" : ""}`}
                placeholder="Repeat new password"
                data-testid="input-confirm-password"
              />
              {confirmPwd && confirmPwd !== newPwd && (
                <p className="text-xs text-destructive">Passwords do not match</p>
              )}
            </div>

            <Button
              onClick={() => changePwdMutation.mutate()}
              disabled={!currentPwd || !newPwd || !confirmPwd || changePwdMutation.isPending}
              className="bg-primary text-primary-foreground font-bold w-full sm:w-auto"
              data-testid="button-change-password"
            >
              <Save className="mr-2 h-4 w-4" />
              {changePwdMutation.isPending ? "Updating…" : "Update Password"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
