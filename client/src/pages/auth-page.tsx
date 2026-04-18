import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useLocation, Link } from "wouter";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { ArrowRight, Lock, CreditCard, Phone, AlertCircle, Loader2, CheckCircle2, RefreshCw, ShieldCheck } from "lucide-react";
import meccaBg from "@assets/Destination_Mecca_14_1776015335379.jpg";
import { useState, useRef, useEffect, useMemo } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useTranslation } from "react-i18next";
import { formatNumber } from "@/lib/format";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";

type RegStep = "phone" | "otp" | "details";

export default function AuthPage() {
  const { t, i18n } = useTranslation(["auth", "common"]);
  const isRtl = i18n.language?.startsWith("ar");
  const [, setLocation] = useLocation();
  const [loginError, setLoginError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [supportEmail, setSupportEmail] = useState<string | null>(null);

  const urlParams = new URLSearchParams(window.location.search);
  const initialTab = urlParams.get("tab") === "signup" ? "register" : null;
  const returnTo = urlParams.get("returnTo");

  // Locale-aware Zod schemas — re-derived when language changes.
  const { loginSchema, registerSchema } = useMemo(() => {
    const ls = z.object({
      identifier: z
        .string()
        .min(8, t("common:errors.invalidNationalId"))
        .refine((v) => /^[0-9]+$/.test(v.trim()), t("common:errors.invalidNationalId")),
      password: z.string().min(8, t("auth:register.passwordHint")),
    });
    const passwordComplexity = z
      .string()
      .min(8, t("auth:register.passwordHint"))
      .refine((v) => /[A-Z]/.test(v), t("auth:register.passwordHint"))
      .refine((v) => /[a-z]/.test(v), t("auth:register.passwordHint"))
      .refine((v) => /[0-9]/.test(v), t("auth:register.passwordHint"))
      .refine((v) => /[^A-Za-z0-9]/.test(v), t("auth:register.passwordHint"));
    const rs = z.object({
      fullName: z.string().min(2, t("common:errors.required")),
      nationalId: z
        .string()
        .min(8, t("common:errors.invalidNationalId"))
        .refine((v) => /^[0-9]+$/.test(v.trim()), t("common:errors.invalidNationalId")),
      password: passwordComplexity,
    });
    return { loginSchema: ls, registerSchema: rs };
  }, [t, i18n.language]);

  useEffect(() => {
    fetch("/api/settings/public", { credentials: "include" })
      .then(r => r.json())
      .then(d => setSupportEmail(d.supportEmail ?? null))
      .catch(() => {});
  }, []);

  // OTP registration flow state
  const [regStep, setRegStep] = useState<RegStep>("phone");
  const [regPhone, setRegPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpId, setOtpId] = useState("");
  const [otpExpiresAt, setOtpExpiresAt] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [registerError, setRegisterError] = useState("");
  const otpInputRef = useRef<HTMLInputElement>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Forgot password flow state
  type ResetStep = "id" | "otp" | "newpass" | "done";
  const [resetStep, setResetStep] = useState<ResetStep | null>(null);
  const [resetNationalId, setResetNationalId] = useState("");
  const [resetPhone, setResetPhone] = useState("");
  const [resetMaskedPhone, setResetMaskedPhone] = useState("");
  const [resetOtpCode, setResetOtpCode] = useState("");
  const [resetOtpId, setResetOtpId] = useState("");
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [resetError, setResetError] = useState("");
  const [resetCountdown, setResetCountdown] = useState(0);
  const [showSignUpFromReset, setShowSignUpFromReset] = useState(false);
  const resetOtpRef = useRef<HTMLInputElement>(null);
  const resetCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loginForm = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: "", password: "" },
  });

  const registerForm = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: { fullName: "", nationalId: "", password: "" },
  });

  async function onLogin(values: z.infer<typeof loginSchema>) {
    setLoginError("");
    setIsLoading(true);
    try {
      const res = await apiRequest("POST", "/api/auth/login", {
        identifier: values.identifier.trim(),
        password: values.password,
      });
      const data = await res.json();
      if (data.user?.role === "candidate") {
        if (data.candidate) {
          localStorage.setItem("workforce_candidate", JSON.stringify(data.candidate));
        }
        setLocation(returnTo || "/candidate-portal");
      } else {
        setLocation("/dashboard");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("common:errors.generic");
      setLoginError(msg.replace(/^\d+:\s*/, "").replace(/^.*"message":"/, "").replace(/".*$/, ""));
    } finally {
      setIsLoading(false);
    }
  }

  function startCountdown(expiresAt: Date) {
    if (countdownRef.current) clearInterval(countdownRef.current);
    const tick = () => {
      const secs = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
      setCountdown(secs);
      if (secs === 0 && countdownRef.current) clearInterval(countdownRef.current);
    };
    tick();
    countdownRef.current = setInterval(tick, 1000);
  }

  async function sendOtp(phone: string) {
    setRegisterError("");
    setIsLoading(true);
    try {
      const res = await apiRequest("POST", "/api/auth/otp/request", { phone: phone.trim() });
      const data = await res.json();
      const expiresAt = new Date(data.expiresAt);
      setOtpExpiresAt(expiresAt);
      setRegPhone(phone.trim());
      setOtpCode("");
      setRegStep("otp");
      startCountdown(expiresAt);
      setTimeout(() => otpInputRef.current?.focus(), 100);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("common:errors.generic");
      setRegisterError(msg.replace(/^\d+:\s*/, "").replace(/^.*"message":"/, "").replace(/".*$/, ""));
    } finally {
      setIsLoading(false);
    }
  }

  async function verifyOtp() {
    setRegisterError("");
    setIsLoading(true);
    try {
      const res = await apiRequest("POST", "/api/auth/otp/verify", { phone: regPhone, code: otpCode.trim() });
      const data = await res.json();
      setOtpId(data.otpId);
      if (countdownRef.current) clearInterval(countdownRef.current);
      setRegStep("details");
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("common:errors.generic");
      setRegisterError(msg.replace(/^\d+:\s*/, "").replace(/^.*"message":"/, "").replace(/".*$/, ""));
    } finally {
      setIsLoading(false);
    }
  }

  async function onRegister(values: z.infer<typeof registerSchema>) {
    setRegisterError("");
    setIsLoading(true);
    try {
      const res = await apiRequest("POST", "/api/auth/register", {
        fullName: values.fullName.trim(),
        phone: regPhone,
        nationalId: values.nationalId.trim(),
        password: values.password,
        otpId,
      });
      const data = await res.json();
      if (data.candidate) {
        localStorage.setItem("workforce_candidate", JSON.stringify(data.candidate));
      }
      setLocation(returnTo || "/candidate-portal");
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("common:errors.generic");
      setRegisterError(msg.replace(/^\d+:\s*/, "").replace(/^.*"message":"/, "").replace(/".*$/, ""));
    } finally {
      setIsLoading(false);
    }
  }

  function startResetCountdown(expiresAt: Date) {
    if (resetCountdownRef.current) clearInterval(resetCountdownRef.current);
    const tick = () => {
      const secs = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
      setResetCountdown(secs);
      if (secs === 0 && resetCountdownRef.current) clearInterval(resetCountdownRef.current);
    };
    tick();
    resetCountdownRef.current = setInterval(tick, 1000);
  }

  async function requestResetOtp(nationalId: string) {
    setResetError("");
    setIsLoading(true);
    try {
      const res = await apiRequest("POST", "/api/auth/reset-password/request", { nationalId: nationalId.trim() });
      const data = await res.json();
      const expiresAt = new Date(data.expiresAt);
      setResetNationalId(nationalId.trim());
      setResetPhone(data.phone);
      setResetMaskedPhone(data.maskedPhone);
      setResetOtpCode("");
      setResetStep("otp");
      startResetCountdown(expiresAt);
      setTimeout(() => resetOtpRef.current?.focus(), 100);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("common:errors.generic");
      setResetError(msg.replace(/^\d+:\s*/, "").replace(/^.*"message":"/, "").replace(/".*$/, ""));
    } finally {
      setIsLoading(false);
    }
  }

  async function verifyResetOtp() {
    setResetError("");
    setIsLoading(true);
    try {
      const res = await apiRequest("POST", "/api/auth/otp/verify", { phone: resetPhone, code: resetOtpCode.trim() });
      const data = await res.json();
      setResetOtpId(data.otpId);
      if (resetCountdownRef.current) clearInterval(resetCountdownRef.current);
      setResetStep("newpass");
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("common:errors.generic");
      setResetError(msg.replace(/^\d+:\s*/, "").replace(/^.*"message":"/, "").replace(/".*$/, ""));
    } finally {
      setIsLoading(false);
    }
  }

  async function submitNewPassword() {
    setResetError("");
    const pwOk =
      resetNewPassword.length >= 8 &&
      /[A-Z]/.test(resetNewPassword) &&
      /[a-z]/.test(resetNewPassword) &&
      /[0-9]/.test(resetNewPassword) &&
      /[^A-Za-z0-9]/.test(resetNewPassword);
    if (!pwOk) {
      setResetError(t("auth:register.passwordHint"));
      return;
    }
    setIsLoading(true);
    try {
      await apiRequest("POST", "/api/auth/reset-password", {
        nationalId: resetNationalId,
        otpId: resetOtpId,
        newPassword: resetNewPassword,
      });
      setResetStep("done");
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("common:errors.generic");
      setResetError(msg.replace(/^\d+:\s*/, "").replace(/^.*"message":"/, "").replace(/".*$/, ""));
    } finally {
      setIsLoading(false);
    }
  }

  function closeResetFlow() {
    setResetStep(null);
    setResetNationalId("");
    setResetPhone("");
    setResetMaskedPhone("");
    setResetOtpCode("");
    setResetOtpId("");
    setResetNewPassword("");
    setResetError("");
    setResetCountdown(0);
    setShowSignUpFromReset(false);
    if (resetCountdownRef.current) clearInterval(resetCountdownRef.current);
  }

  const pwRules = [
    { ok: resetNewPassword.length >= 8, label: t("auth:register.passwordHint") },
  ];

  // Helper: position absolute icons using logical-property classes so they
  // flip correctly under RTL. We use `start-3` (Tailwind v4 logical) to
  // mean "left in LTR, right in RTL".
  const iconStartClass = `absolute ${isRtl ? "right-3" : "left-3"} top-3 h-4 w-4 text-muted-foreground group-hover:text-primary group-focus-within:text-primary transition-colors`;
  const inputPaddedStartClass = `${isRtl ? "pr-10 text-right" : "pl-10 text-left"} h-11 bg-muted/30 border-border focus-visible:border-primary/50 focus-visible:ring-primary/20 transition-all rounded-sm`;
  const labelStartClass = `block ${isRtl ? "text-right" : "text-left"} text-muted-foreground uppercase text-xs tracking-wider font-semibold`;

  return (
    <div className="min-h-screen w-full max-w-full grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[40%_60%] bg-background font-sans text-foreground overflow-x-clip">
      {/* ── Left Column: Form ─────────────────────────────────── */}
      <div className="min-w-0 flex flex-col justify-center items-center px-4 py-6 sm:p-8 lg:p-12 relative z-10">
        <div className="w-full min-w-0 max-w-md space-y-8 animate-in slide-in-from-start-8 duration-700 fade-in">

          {/* Header row: logo + language switcher */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 mb-6">
              <div className="flex items-center gap-3">
                <img src="/workforce-logo.svg" alt="Workforce" className="h-10 w-10" />
                <span className="font-display font-bold text-2xl tracking-tight text-white">
                  {t("common:app.name")}
                </span>
              </div>
              <LanguageSwitcher />
            </div>
            <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-white">
              {resetStep ? t("auth:reset.title") : t("auth:login.title")}
            </h1>
          </div>

          {resetStep ? (
            <div className="space-y-5">
              {resetStep === "id" && (
                <div className="space-y-4">
                  <p className="text-muted-foreground text-sm">{t("auth:reset.idStepSubtitle")}</p>
                  <div className="relative group">
                    <CreditCard className={iconStartClass} />
                    <Input
                      placeholder="1012345678"
                      value={resetNationalId}
                      onChange={(e) => setResetNationalId(e.target.value.replace(/\D/g, ""))}
                      className={`${inputPaddedStartClass} tabular-nums tracking-wide`}
                      inputMode="numeric"
                      dir={isRtl ? "rtl" : "ltr"}
                      data-testid="input-reset-national-id"
                    />
                  </div>
                  {resetError && (
                    <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-sm text-sm text-destructive" data-testid="reset-error">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <bdi>{resetError}</bdi>
                    </div>
                  )}
                  <Button
                    onClick={() => requestResetOtp(resetNationalId)}
                    disabled={isLoading || resetNationalId.trim().length < 8}
                    className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-bold tracking-wide uppercase text-sm rounded-sm"
                    data-testid="button-send-reset-otp"
                  >
                    {isLoading ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <>{t("auth:reset.sendCode")} <ArrowRight className={`ms-2 h-4 w-4 ${isRtl ? "rotate-180" : ""}`} /></>}
                  </Button>
                  <button type="button" onClick={closeResetFlow} className="w-full text-center text-xs text-muted-foreground hover:text-primary transition-colors" data-testid="link-back-to-login">
                    {t("auth:reset.backToLogin")}
                  </button>
                </div>
              )}

              {resetStep === "otp" && (
                <div className="space-y-4">
                  <p className="text-muted-foreground text-sm">
                    {t("auth:reset.otpStepSubtitle", { phone: resetMaskedPhone })}
                  </p>
                  <div className="relative group">
                    <ShieldCheck className={iconStartClass} />
                    <Input
                      ref={resetOtpRef}
                      placeholder="••••••"
                      value={resetOtpCode}
                      onChange={(e) => setResetOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      className={`${inputPaddedStartClass} tabular-nums tracking-[0.5em] text-center text-lg`}
                      inputMode="numeric"
                      maxLength={6}
                      dir={isRtl ? "rtl" : "ltr"}
                      data-testid="input-reset-otp"
                    />
                  </div>
                  {resetCountdown > 0 && (
                    <p className="text-xs text-muted-foreground text-center">
                      <bdi className="text-white tabular-nums">{Math.floor(resetCountdown / 60)}:{String(resetCountdown % 60).padStart(2, "0")}</bdi>
                    </p>
                  )}
                  {resetCountdown === 0 && (
                    <button type="button" onClick={() => requestResetOtp(resetNationalId)} className="w-full text-center text-xs text-primary hover:text-primary/80 flex items-center justify-center gap-1">
                      <RefreshCw className="h-3 w-3" /> {t("auth:register.resendOtp")}
                    </button>
                  )}
                  {resetError && (
                    <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-sm text-sm text-destructive" data-testid="reset-error">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <bdi>{resetError}</bdi>
                    </div>
                  )}
                  <Button
                    onClick={verifyResetOtp}
                    disabled={isLoading || resetOtpCode.length !== 6}
                    className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-bold tracking-wide uppercase text-sm rounded-sm"
                    data-testid="button-verify-reset-otp"
                  >
                    {isLoading ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <>{t("auth:register.verifyOtp")} <ArrowRight className={`ms-2 h-4 w-4 ${isRtl ? "rotate-180" : ""}`} /></>}
                  </Button>
                  <button type="button" onClick={closeResetFlow} className="w-full text-center text-xs text-muted-foreground hover:text-primary transition-colors">
                    {t("auth:reset.backToLogin")}
                  </button>
                </div>
              )}

              {resetStep === "newpass" && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-sm text-sm text-emerald-400">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    {t("auth:reset.newPasswordStepTitle")}
                  </div>
                  <div className="relative group">
                    <Lock className={iconStartClass} />
                    <Input
                      type="password"
                      placeholder={t("auth:reset.newPasswordLabel")}
                      value={resetNewPassword}
                      onChange={(e) => setResetNewPassword(e.target.value)}
                      className={inputPaddedStartClass}
                      dir={isRtl ? "rtl" : "ltr"}
                      data-testid="input-reset-new-password"
                    />
                  </div>
                  {resetNewPassword.length > 0 && (
                    <p className="text-xs text-muted-foreground" data-testid="reset-password-strength-rules">
                      {t("auth:register.passwordHint")}
                    </p>
                  )}
                  {resetError && (
                    <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-sm text-sm text-destructive" data-testid="reset-error">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <bdi>{resetError}</bdi>
                    </div>
                  )}
                  <Button
                    onClick={submitNewPassword}
                    disabled={isLoading || !resetNewPassword.length}
                    className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-bold tracking-wide uppercase text-sm rounded-sm"
                    data-testid="button-submit-new-password"
                  >
                    {isLoading ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <>{t("auth:reset.submit")} <ArrowRight className={`ms-2 h-4 w-4 ${isRtl ? "rotate-180" : ""}`} /></>}
                  </Button>
                </div>
              )}

              {resetStep === "done" && (
                <div className="space-y-5">
                  <div className="flex items-center gap-2 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-sm text-emerald-400">
                    <CheckCircle2 className="h-5 w-5 shrink-0" />
                    <div>
                      <p className="font-semibold text-sm">{t("auth:reset.doneTitle")}</p>
                      <p className="text-xs text-emerald-400/80 mt-0.5">{t("auth:reset.doneSubtitle")}</p>
                    </div>
                  </div>
                  <Button
                    onClick={closeResetFlow}
                    className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-bold tracking-wide uppercase text-sm rounded-sm"
                    data-testid="button-back-to-login"
                  >
                    {t("auth:reset.backToLogin")} <ArrowRight className={`ms-2 h-4 w-4 ${isRtl ? "rotate-180" : ""}`} />
                  </Button>
                </div>
              )}
            </div>
          ) : (

          <Tabs defaultValue={showSignUpFromReset || initialTab === "register" ? "register" : "login"} key={`${showSignUpFromReset}-${initialTab}`} className="w-full">
            <TabsList
              className="grid w-full min-w-0 grid-cols-2 mb-8 bg-muted/50 p-1 rounded-sm"
              style={isRtl ? { direction: "rtl" } : undefined}
            >
              <TabsTrigger value="login" className="rounded-sm data-[state=active]:bg-background data-[state=active]:text-foreground font-medium text-xs sm:text-sm truncate">
                {t("auth:tabs.login")}
              </TabsTrigger>
              <TabsTrigger value="register" className="rounded-sm data-[state=active]:bg-background data-[state=active]:text-foreground font-medium text-xs sm:text-sm truncate">
                {t("auth:tabs.register")}
              </TabsTrigger>
            </TabsList>

            {/* ── LOGIN TAB ── */}
            <TabsContent value="login" className="space-y-4">
              <Form {...loginForm}>
                <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-5">
                  <FormField
                    control={loginForm.control}
                    name="identifier"
                    render={({ field }) => (
                      <FormItem>
                        <Label className={labelStartClass}>
                          {t("auth:login.identifierLabel")}
                        </Label>
                        <FormControl>
                          <div className="relative group">
                            <CreditCard className={iconStartClass} />
                            <Input
                              placeholder={t("auth:login.identifierPlaceholder")}
                              className={`${inputPaddedStartClass} tabular-nums tracking-wide`}
                              inputMode="numeric"
                              dir={isRtl ? "rtl" : "ltr"}
                              data-testid="input-identifier"
                              {...field}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={loginForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <div className={`flex items-center justify-between gap-2 ${isRtl ? "flex-row-reverse" : ""}`}>
                          <Label className={labelStartClass}>{t("auth:login.passwordLabel")}</Label>
                          <button type="button" onClick={() => setResetStep("id")} className={`text-xs text-muted-foreground hover:text-primary transition-colors ${isRtl ? "text-left" : "text-right"}`} data-testid="link-forgot-password">{t("auth:login.forgotPassword")}</button>
                        </div>
                        <FormControl>
                          <div className="relative group">
                            <Lock className={iconStartClass} />
                            <Input
                              type="password"
                              placeholder="••••••••"
                              className={inputPaddedStartClass}
                              dir={isRtl ? "rtl" : "ltr"}
                              data-testid="input-password"
                              {...field}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Error banner */}
                  {loginError && (
                    <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-sm text-sm text-destructive" data-testid="login-error">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <bdi>{loginError}</bdi>
                    </div>
                  )}

                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-bold tracking-wide uppercase text-sm rounded-sm shadow-[0_0_20px_rgba(25,90,55,0.3)] hover:shadow-[0_0_30px_rgba(25,90,55,0.5)] transition-all duration-300 group"
                    data-testid="button-sign-in"
                  >
                    {isLoading ? (
                      <Loader2 className="me-2 h-4 w-4 animate-spin" />
                    ) : isRtl ? (
                      <>
                        <ArrowRight className="me-2 h-4 w-4 rotate-180 group-hover:-translate-x-1 transition-transform" />
                        {t("auth:login.submit")}
                      </>
                    ) : (
                      <>
                        {t("auth:login.submit")}
                        <ArrowRight className="ms-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                      </>
                    )}
                  </Button>
                </form>
              </Form>

              {/* ── Trusted-by marquee ── */}
              {(() => {
                const GH = "https://raw.githubusercontent.com/TanStack/tanstack.com/main/public/logos/";
                const logos = [
                  { name: "Google",    url: "/logos/google-g.svg",  nudge: 0, scale: 1.5 },
                  { name: "Apple",     url: `${GH}apple.svg`,                      nudge: 0 },
                  { name: "Microsoft", url: "/logos/microsoft.svg",                nudge: 0, scale: 1.4 },
                  { name: "Amazon",    url: `${GH}amazon.svg`,                     nudge: 5 },
                  { name: "Walmart",   url: `${GH}walmart.svg`,                    nudge: 0 },
                  { name: "Cisco",     url: `${GH}cisco.svg`,                      nudge: 0 },
                  { name: "HP",        url: "/logos/hp-flat.svg",                  nudge: 0 },
                  { name: "DocuSign",  url: `${GH}docusign.svg`,                   nudge: 0 },
                  { name: "Yahoo",     url: "/logos/yahoo-flat.svg",               nudge: 0 },
                  { name: "Honeywell", url: "/logos/honeywell-flat.svg", nudge: 0 },
                ];
                const renderLogos = (keyPrefix: string) =>
                  logos.map((logo, i) => (
                    <div key={`${keyPrefix}-${i}`} className="group flex items-center justify-center opacity-50 hover:opacity-100 transition-all duration-200 select-none shrink-0 w-28 h-12 mx-8">
                      <img
                        src={logo.url}
                        alt={logo.name}
                        title={logo.name}
                        loading="lazy"
                        decoding="async"
                        style={{
                          transform: [
                            (logo as any).scale ? `scale(${(logo as any).scale})` : "",
                            logo.nudge ? `translateY(${logo.nudge}px)` : "",
                          ].filter(Boolean).join(" ") || undefined,
                        }}
                        className="max-w-full max-h-full w-auto h-auto object-contain grayscale group-hover:grayscale-0 transition-all duration-200"
                      />
                    </div>
                  ));
                return (
                  <div className="mt-6 space-y-2">
                    <p className={`text-muted-foreground/70 uppercase tracking-widest font-semibold text-center ${isRtl ? "text-sm" : "text-xs"}`}>
                      {isRtl ? "يستخدم نظام وورك فورس تقنيات يستعملها كل من" : "Workforce Utilizes Technologies used by"}
                    </p>
                    <div
                      className="overflow-hidden"
                      style={{ maskImage: "linear-gradient(to right, transparent 0%, black 12%, black 88%, transparent 100%)" }}
                    >
                      <div className="flex items-center animate-marquee w-max py-3 hover:[animation-play-state:paused]">
                        <div className="flex items-center gap-10 shrink-0 pe-10">
                          {renderLogos("a")}
                        </div>
                        <div className="flex items-center gap-10 shrink-0 pe-10" aria-hidden="true">
                          {renderLogos("b")}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </TabsContent>

            {/* ── REGISTER TAB ── */}
            <TabsContent value="register" className="space-y-4">

              {/* Step indicator */}
              <div className={`flex items-center gap-2 mb-2 ${isRtl ? "flex-row-reverse justify-start" : ""}`}>
                {(["phone", "otp", "details"] as RegStep[]).map((step, i) => (
                  <div key={step} className={`flex items-center gap-2 ${isRtl ? "flex-row-reverse" : ""}`}>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${regStep === step ? "bg-primary text-primary-foreground" : i < ["phone","otp","details"].indexOf(regStep) ? "bg-primary/20 text-primary" : "bg-muted/40 text-muted-foreground"}`}>
                      {i < ["phone","otp","details"].indexOf(regStep) ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
                    </div>
                    <span className={`text-xs font-medium hidden sm:inline ${regStep === step ? "text-white" : "text-muted-foreground"}`}>
                      {step === "phone" ? t("auth:register.phoneLabel") : step === "otp" ? t("auth:register.verifyOtp") : t("auth:register.detailsStepTitle")}
                    </span>
                    {i < 2 && <div className="flex-1 h-px bg-border w-4 mx-1" />}
                  </div>
                ))}
              </div>

              {/* ── Step 1: Phone ── */}
              {regStep === "phone" && (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className={labelStartClass}>{t("auth:register.phoneLabel")}</Label>
                    <div className="relative group">
                      <Phone className={iconStartClass} />
                      <Input
                        placeholder="05xxxxxxxx"
                        value={regPhone}
                        onChange={(e) => { setRegPhone(e.target.value.replace(/\D/g, "").slice(0, 10)); setRegisterError(""); }}
                        className={`${inputPaddedStartClass} tabular-nums tracking-wide`}
                        inputMode="tel"
                        maxLength={10}
                        dir={isRtl ? "rtl" : "ltr"}
                        data-testid="input-phone"
                        onKeyDown={(e) => e.key === "Enter" && /^05\d{8}$/.test(regPhone) && sendOtp(regPhone)}
                      />
                    </div>
                    <p className={`text-xs text-muted-foreground ${isRtl ? "text-right" : "text-left"}`}>{t("auth:register.phoneStepSubtitle")}</p>
                  </div>
                  {registerError && (
                    <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-sm text-sm text-destructive">
                      <AlertCircle className="h-4 w-4 shrink-0" /><bdi>{registerError}</bdi>
                    </div>
                  )}
                  <Button
                    onClick={() => sendOtp(regPhone)}
                    disabled={isLoading || !/^05\d{8}$/.test(regPhone)}
                    className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-bold tracking-wide uppercase text-sm rounded-sm shadow-[0_0_20px_rgba(25,90,55,0.3)] transition-all duration-300"
                    data-testid="button-send-otp"
                  >
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Phone className="me-2 h-4 w-4" />{t("auth:register.sendOtp")}</>}
                  </Button>
                </div>
              )}

              {/* ── Step 2: OTP ── */}
              {regStep === "otp" && (
                <div className="space-y-4">
                  <div className={`p-3 bg-primary/5 border border-primary/20 rounded-sm flex items-start gap-2 ${isRtl ? "flex-row-reverse" : ""}`}>
                    <ShieldCheck className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <div className={`text-sm ${isRtl ? "text-right" : "text-left"}`}>
                      <p className="text-white font-medium"><bdi>{t("auth:register.otpStepSubtitle", { phone: regPhone })}</bdi></p>
                      <p className="text-muted-foreground text-xs mt-0.5">
                        <bdi>{Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, "0")}</bdi>
                      </p>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className={labelStartClass}>{t("auth:register.otpLabel")}</Label>
                    <Input
                      ref={otpInputRef}
                      placeholder="• • • • • •"
                      value={otpCode}
                      onChange={(e) => { setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setRegisterError(""); }}
                      className="h-14 text-center text-2xl tabular-nums tracking-[0.5em] bg-muted/30 border-border focus-visible:border-primary/50 focus-visible:ring-primary/20 rounded-sm"
                      inputMode="numeric"
                      maxLength={6}
                      dir={isRtl ? "rtl" : "ltr"}
                      data-testid="input-otp-code"
                      onKeyDown={(e) => e.key === "Enter" && otpCode.length === 6 && verifyOtp()}
                    />
                  </div>
                  {registerError && (
                    <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-sm text-sm text-destructive">
                      <AlertCircle className="h-4 w-4 shrink-0" /><bdi>{registerError}</bdi>
                    </div>
                  )}
                  <Button
                    onClick={verifyOtp}
                    disabled={isLoading || otpCode.length !== 6}
                    className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-bold tracking-wide uppercase text-sm rounded-sm shadow-[0_0_20px_rgba(25,90,55,0.3)] transition-all duration-300"
                    data-testid="button-verify-otp"
                  >
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="me-2 h-4 w-4" />{t("auth:register.verifyOtp")}</>}
                  </Button>
                  <div className={`flex items-center justify-between text-xs text-muted-foreground ${isRtl ? "flex-row-reverse" : ""}`}>
                    <button onClick={() => { setRegStep("phone"); setRegisterError(""); }} className="hover:text-white transition-colors">{t("auth:register.changePhone")}</button>
                    <button
                      onClick={() => countdown === 0 && sendOtp(regPhone)}
                      disabled={countdown > 0}
                      className={`flex items-center gap-1 transition-colors ${countdown > 0 ? "opacity-40 cursor-not-allowed" : "hover:text-white cursor-pointer"}`}
                    >
                      <RefreshCw className="h-3 w-3" />
                      {countdown > 0 ? t("auth:register.resendIn", { seconds: countdown }) : t("auth:register.resendOtp")}
                    </button>
                  </div>
                </div>
              )}

              {/* ── Step 3: Details ── */}
              {regStep === "details" && (
                <div className="space-y-4">
                  <div className="p-3 bg-primary/5 border border-primary/20 rounded-sm flex items-center gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-primary font-medium"><bdi>{regPhone}</bdi></span>
                  </div>
                  <Form {...registerForm}>
                    <form onSubmit={registerForm.handleSubmit(onRegister)} className="space-y-4">
                      <FormField control={registerForm.control} name="fullName" render={({ field }) => (
                        <FormItem>
                          <Label className={labelStartClass}>{t("auth:register.fullNameLabel")}</Label>
                          <FormControl>
                            <Input placeholder={t("auth:register.fullNamePlaceholder")} className="h-11 bg-muted/30 border-border focus-visible:border-primary/50 focus-visible:ring-primary/20 rounded-sm" dir={isRtl ? "rtl" : "ltr"} data-testid="input-full-name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={registerForm.control} name="nationalId" render={({ field }) => (
                        <FormItem>
                          <Label className={labelStartClass}>{t("auth:register.nationalIdLabel")}</Label>
                          <FormControl>
                            <div className="relative group">
                              <CreditCard className={iconStartClass} />
                              <Input placeholder={t("auth:register.nationalIdPlaceholder")} className={`${inputPaddedStartClass} tabular-nums tracking-wide`} inputMode="numeric" dir={isRtl ? "rtl" : "ltr"} data-testid="input-national-id" {...field} />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={registerForm.control} name="password" render={({ field }) => (
                        <FormItem>
                          <Label className={labelStartClass}>{t("auth:register.passwordLabel")}</Label>
                          <FormControl>
                            <div className="relative group">
                              <Lock className={iconStartClass} />
                              <Input type="password" placeholder={t("auth:register.passwordLabel")} className={inputPaddedStartClass} dir={isRtl ? "rtl" : "ltr"} data-testid="input-register-password" {...field} />
                            </div>
                          </FormControl>
                          {field.value?.length > 0 && (
                            <p className="text-xs text-muted-foreground mt-2" data-testid="register-password-strength-rules">
                              {t("auth:register.passwordHint")}
                            </p>
                          )}
                          <FormMessage />
                        </FormItem>
                      )} />
                      {registerError && (
                        <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-sm text-sm text-destructive" data-testid="register-error">
                          <AlertCircle className="h-4 w-4 shrink-0" /><bdi>{registerError}</bdi>
                        </div>
                      )}
                      <Button type="submit" disabled={isLoading} className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-bold tracking-wide uppercase text-sm rounded-sm shadow-[0_0_20px_rgba(25,90,55,0.3)] hover:shadow-[0_0_30px_rgba(25,90,55,0.5)] transition-all duration-300 group" data-testid="button-register">
                        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>{t("auth:register.submit")}<ArrowRight className={`ms-2 h-4 w-4 group-hover:translate-x-1 transition-transform ${isRtl ? "rotate-180" : ""}`} /></>}
                      </Button>
                    </form>
                  </Form>
                </div>
              )}

              <div className="mt-2">
                <p className="text-sm text-muted-foreground text-center" dir={isRtl ? "rtl" : "ltr"}>
                  <bdi>{t("auth:legal.agree", { terms: t("auth:legal.terms"), privacy: t("auth:legal.privacy") })}</bdi>
                </p>
              </div>
            </TabsContent>
          </Tabs>
          )}

          <div className="pt-8 border-t border-border/50 text-xs text-muted-foreground space-y-3">
            <div className="flex items-center justify-center gap-4 flex-wrap">
              <Link href="/privacy-policy" className="hover:text-foreground transition-colors">{t("auth:legal.privacy")}</Link>
              <span className="text-border">·</span>
              <Link href="/terms-conditions" className="hover:text-foreground transition-colors">{t("auth:legal.terms")}</Link>
              <span className="text-border">·</span>
              <a
                href={supportEmail ? `mailto:${supportEmail}` : "#"}
                className="hover:text-foreground transition-colors"
                data-testid="link-contact-support"
                {...(supportEmail ? {} : { onClick: (e: React.MouseEvent) => e.preventDefault() })}
              >{t("auth:support.needHelp")}</a>
            </div>
            <p className="text-center">
              {isRtl ? (
                <span dir="rtl">
                  <bdi>شركة العربة الفاخرة</bdi>
                  {" "}
                  <bdi>© {formatNumber(new Date().getFullYear(), { useGrouping: false })}</bdi>
                </span>
              ) : (
                <bdi>© {new Date().getFullYear()} Luxury Carts Company Ltd.</bdi>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* ── Right Column: Mecca image ────────────────────────── */}
      <div className="hidden lg:block relative overflow-hidden border-s border-white/5">
        <img
          src={meccaBg}
          alt="Masjid Al-Haram, Mecca"
          className="absolute inset-0 w-full h-full object-cover object-center"
        />
      </div>
    </div>
  );
}
