import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type ValidateState =
  | { status: "loading" }
  | { status: "valid"; candidateName: string | null; phoneSuffix: string | null }
  | { status: "invalid"; code: "INVALID" | "EXPIRED" | "CONSUMED" };

export default function ActivatePage() {
  const { t } = useTranslation(["auth", "common"]);
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [token, setToken] = useState<string>("");
  const [validate, setValidate] = useState<ValidateState>({ status: "loading" });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    const tk = url.searchParams.get("token") ?? "";
    setToken(tk);
    if (!tk) {
      setValidate({ status: "invalid", code: "INVALID" });
      return;
    }
    fetch(`/api/auth/activate?token=${encodeURIComponent(tk)}`)
      .then(async (r) => {
        if (r.ok) {
          const j = await r.json();
          setValidate({
            status: "valid",
            candidateName: j.candidateName ?? null,
            phoneSuffix: j.phoneSuffix ?? null,
          });
        } else {
          const j = await r.json().catch(() => ({}));
          setValidate({ status: "invalid", code: (j.code as any) ?? "INVALID" });
        }
      })
      .catch(() => setValidate({ status: "invalid", code: "INVALID" }));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast({ title: t("auth:activation.passwordTooShort"), variant: "destructive" });
      return;
    }
    if (password !== confirm) {
      toast({ title: t("auth:activation.passwordMismatch"), variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: j.message ?? t("auth:activation.invalid"), variant: "destructive" });
        setSubmitting(false);
        return;
      }
      setDone(true);
      toast({ title: t("auth:activation.success") });
      setTimeout(() => navigate("/auth"), 1500);
    } catch {
      toast({ title: t("auth:activation.unexpectedError"), variant: "destructive" });
      setSubmitting(false);
    }
  }

  if (validate.status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (validate.status === "invalid") {
    const messageKey =
      validate.code === "EXPIRED" ? "auth:activation.expired" :
      validate.code === "CONSUMED" ? "auth:activation.consumed" :
      "auth:activation.invalid";
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md" data-testid="card-activation-invalid">
          <CardHeader className="text-center">
            <div className="mx-auto rounded-full bg-destructive/10 p-3 w-fit mb-3">
              <XCircle className="h-8 w-8 text-destructive" />
            </div>
            <CardTitle data-testid="text-activation-error">{t(messageKey)}</CardTitle>
            <CardDescription>{t("auth:activation.invalidHelper")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="w-full"
              variant="outline"
              onClick={() => navigate("/auth")}
              data-testid="button-go-login"
            >
              {t("auth:activation.goToLogin")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md" data-testid="card-activation-success">
          <CardHeader className="text-center">
            <div className="mx-auto rounded-full bg-green-500/10 p-3 w-fit mb-3">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>
            <CardTitle>{t("auth:activation.success")}</CardTitle>
            <CardDescription>{t("auth:activation.successHelper")}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md" data-testid="card-activation-form">
        <CardHeader>
          <CardTitle>{t("auth:activation.title")}</CardTitle>
          <CardDescription>
            <span data-testid="text-candidate-name">
              {validate.candidateName ? validate.candidateName : t("auth:activation.welcome")}
            </span>
            {validate.phoneSuffix && (
              <span
                className="block mt-1 text-xs text-muted-foreground"
                data-testid="text-phone-suffix"
              >
                {t("auth:activation.phoneSuffix", { suffix: validate.phoneSuffix })}
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <Label htmlFor="password">{t("auth:activation.passwordLabel")}</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
                autoFocus
                data-testid="input-password"
              />
            </div>
            <div>
              <Label htmlFor="confirm">{t("auth:activation.confirmLabel")}</Label>
              <Input
                id="confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                minLength={8}
                required
                data-testid="input-confirm-password"
              />
            </div>
            <Alert>
              <AlertDescription className="text-xs">
                {t("auth:activation.passwordHelper")}
              </AlertDescription>
            </Alert>
            <Button
              type="submit"
              className="w-full"
              disabled={submitting}
              data-testid="button-activate"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : t("auth:activation.submit")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
