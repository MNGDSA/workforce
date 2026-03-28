import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useLocation } from "wouter";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { ArrowRight, Lock, CreditCard, Phone, AlertCircle, Loader2, CheckCircle2, RefreshCw, ShieldCheck } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { apiRequest } from "@/lib/queryClient";

const loginSchema = z.object({
  identifier: z
    .string()
    .min(8, "Enter your ID Number or Phone Number")
    .refine(
      (v) => /^[0-9]+$/.test(v.trim()),
      "Must contain numbers only (ID Number or Phone Number)"
    ),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const registerSchema = z.object({
  fullName: z.string().min(2, "Full name is required"),
  nationalId: z
    .string()
    .min(8, "Enter a valid National ID or Iqama number")
    .refine((v) => /^[0-9]+$/.test(v.trim()), "Numbers only — no letters or spaces"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type RegStep = "phone" | "otp" | "details";

export default function AuthPage() {
  const [, setLocation] = useLocation();
  const [loginError, setLoginError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [supportEmail, setSupportEmail] = useState<string | null>(null);

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
        setLocation("/candidate-portal");
      } else {
        setLocation("/dashboard");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Login failed";
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
      const msg = err instanceof Error ? err.message : "Failed to send OTP";
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
      const msg = err instanceof Error ? err.message : "Verification failed";
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
      setLocation("/candidate-portal");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Registration failed";
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
      const msg = err instanceof Error ? err.message : "Failed to send OTP";
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
      const msg = err instanceof Error ? err.message : "Verification failed";
      setResetError(msg.replace(/^\d+:\s*/, "").replace(/^.*"message":"/, "").replace(/".*$/, ""));
    } finally {
      setIsLoading(false);
    }
  }

  async function submitNewPassword() {
    setResetError("");
    if (resetNewPassword.length < 6) {
      setResetError("Password must be at least 6 characters");
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
      const msg = err instanceof Error ? err.message : "Reset failed";
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

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background font-sans text-foreground overflow-hidden">
      {/* ── Left Column: Form ─────────────────────────────────── */}
      <div className="flex flex-col justify-center items-center p-8 lg:p-12 relative z-10">
        <div className="w-full max-w-md space-y-8 animate-in slide-in-from-left-8 duration-700 fade-in">

          {/* Logo */}
          <div className="space-y-2">
            <div className="flex items-center gap-3 mb-6">
              <img src="/workforce-logo.svg" alt="Workforce" className="h-10 w-10" />
              <span className="font-display font-bold text-2xl tracking-tight text-white">
                WORKFORCE
              </span>
            </div>
            <h1 className="font-display text-4xl font-bold tracking-tight text-white">
              {resetStep ? "Reset Password" : "Welcome back"}
            </h1>
          </div>

          {resetStep ? (
            <div className="space-y-5">
              {resetStep === "id" && (
                <div className="space-y-4">
                  <p className="text-muted-foreground text-sm">Enter your National ID or Iqama number to receive a verification code on your registered phone.</p>
                  <div className="relative group">
                    <CreditCard className="absolute left-3 top-3 h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    <Input
                      placeholder="e.g. 1012345678"
                      value={resetNationalId}
                      onChange={(e) => setResetNationalId(e.target.value.replace(/\D/g, ""))}
                      className="pl-10 h-11 bg-muted/30 border-border focus-visible:border-primary/50 focus-visible:ring-primary/20 transition-all rounded-sm font-mono tracking-wide"
                      inputMode="numeric"
                      data-testid="input-reset-national-id"
                    />
                  </div>
                  {resetError && (
                    <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-sm text-sm text-destructive" data-testid="reset-error">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      {resetError}
                    </div>
                  )}
                  <Button
                    onClick={() => requestResetOtp(resetNationalId)}
                    disabled={isLoading || resetNationalId.trim().length < 8}
                    className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-bold tracking-wide uppercase text-sm rounded-sm"
                    data-testid="button-send-reset-otp"
                  >
                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <>Send Verification Code <ArrowRight className="ml-2 h-4 w-4" /></>}
                  </Button>
                  <button type="button" onClick={closeResetFlow} className="w-full text-center text-xs text-muted-foreground hover:text-primary transition-colors" data-testid="link-back-to-login">
                    Back to login
                  </button>
                </div>
              )}

              {resetStep === "otp" && (
                <div className="space-y-4">
                  <p className="text-muted-foreground text-sm">
                    Enter the code sent to <span className="text-white font-mono">{resetMaskedPhone}</span>
                  </p>
                  <div className="relative group">
                    <ShieldCheck className="absolute left-3 top-3 h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    <Input
                      ref={resetOtpRef}
                      placeholder="Enter 6-digit code"
                      value={resetOtpCode}
                      onChange={(e) => setResetOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      className="pl-10 h-11 bg-muted/30 border-border focus-visible:border-primary/50 focus-visible:ring-primary/20 transition-all rounded-sm font-mono tracking-[0.5em] text-center text-lg"
                      inputMode="numeric"
                      maxLength={6}
                      data-testid="input-reset-otp"
                    />
                  </div>
                  {resetCountdown > 0 && (
                    <p className="text-xs text-muted-foreground text-center">
                      Code expires in <span className="text-white font-mono">{Math.floor(resetCountdown / 60)}:{String(resetCountdown % 60).padStart(2, "0")}</span>
                    </p>
                  )}
                  {resetCountdown === 0 && (
                    <button type="button" onClick={() => requestResetOtp(resetNationalId)} className="w-full text-center text-xs text-primary hover:text-primary/80 flex items-center justify-center gap-1">
                      <RefreshCw className="h-3 w-3" /> Resend code
                    </button>
                  )}
                  {resetError && (
                    <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-sm text-sm text-destructive" data-testid="reset-error">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      {resetError}
                    </div>
                  )}
                  <Button
                    onClick={verifyResetOtp}
                    disabled={isLoading || resetOtpCode.length !== 6}
                    className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-bold tracking-wide uppercase text-sm rounded-sm"
                    data-testid="button-verify-reset-otp"
                  >
                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <>Verify Code <ArrowRight className="ml-2 h-4 w-4" /></>}
                  </Button>
                  <div className="text-center pt-1">
                    <button type="button" onClick={() => { closeResetFlow(); setShowSignUpFromReset(true); }} className="text-xs text-amber-400 hover:text-amber-300 transition-colors" data-testid="link-not-your-phone">
                      Not your phone number? Sign up with a new one
                    </button>
                  </div>
                  <button type="button" onClick={closeResetFlow} className="w-full text-center text-xs text-muted-foreground hover:text-primary transition-colors">
                    Back to login
                  </button>
                </div>
              )}

              {resetStep === "newpass" && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-sm text-sm text-emerald-400">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    Phone verified. Set your new password.
                  </div>
                  <div className="relative group">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    <Input
                      type="password"
                      placeholder="New password (min 6 characters)"
                      value={resetNewPassword}
                      onChange={(e) => setResetNewPassword(e.target.value)}
                      className="pl-10 h-11 bg-muted/30 border-border focus-visible:border-primary/50 focus-visible:ring-primary/20 transition-all rounded-sm"
                      data-testid="input-reset-new-password"
                    />
                  </div>
                  {resetError && (
                    <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-sm text-sm text-destructive" data-testid="reset-error">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      {resetError}
                    </div>
                  )}
                  <Button
                    onClick={submitNewPassword}
                    disabled={isLoading || resetNewPassword.length < 6}
                    className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-bold tracking-wide uppercase text-sm rounded-sm"
                    data-testid="button-submit-new-password"
                  >
                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <>Reset Password <ArrowRight className="ml-2 h-4 w-4" /></>}
                  </Button>
                </div>
              )}

              {resetStep === "done" && (
                <div className="space-y-5">
                  <div className="flex items-center gap-2 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-sm text-emerald-400">
                    <CheckCircle2 className="h-5 w-5 shrink-0" />
                    <div>
                      <p className="font-semibold text-sm">Password reset successfully</p>
                      <p className="text-xs text-emerald-400/80 mt-0.5">You can now log in with your new password.</p>
                    </div>
                  </div>
                  <Button
                    onClick={closeResetFlow}
                    className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-bold tracking-wide uppercase text-sm rounded-sm"
                    data-testid="button-back-to-login"
                  >
                    Back to Login <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          ) : (

          <Tabs defaultValue={showSignUpFromReset ? "register" : "login"} key={showSignUpFromReset ? "reg" : "login"} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-8 bg-muted/50 p-1 rounded-sm">
              <TabsTrigger value="login" className="rounded-sm data-[state=active]:bg-background data-[state=active]:text-foreground font-medium">
                Login
              </TabsTrigger>
              <TabsTrigger value="register" className="rounded-sm data-[state=active]:bg-background data-[state=active]:text-foreground font-medium">
                Sign Up
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
                        <Label className="text-muted-foreground uppercase text-xs tracking-wider font-semibold">
                          ID Number or Phone Number
                        </Label>
                        <FormControl>
                          <div className="relative group">
                            <CreditCard className="absolute left-3 top-3 h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                            <Input
                              placeholder="e.g. 1012345678 or 0501234567"
                              className="pl-10 h-11 bg-muted/30 border-border focus-visible:border-primary/50 focus-visible:ring-primary/20 transition-all rounded-sm font-mono tracking-wide"
                              inputMode="numeric"
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
                        <div className="flex items-center justify-between">
                          <Label className="text-muted-foreground uppercase text-xs tracking-wider font-semibold">Password</Label>
                          <button type="button" onClick={() => setResetStep("id")} className="text-xs text-muted-foreground hover:text-primary transition-colors" data-testid="link-forgot-password">Forgot password?</button>
                        </div>
                        <FormControl>
                          <div className="relative group">
                            <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                            <Input
                              type="password"
                              placeholder="••••••••"
                              className="pl-10 h-11 bg-muted/30 border-border focus-visible:border-primary/50 focus-visible:ring-primary/20 transition-all rounded-sm"
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
                      {loginError}
                    </div>
                  )}

                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-bold tracking-wide uppercase text-sm rounded-sm shadow-[0_0_20px_rgba(25,90,55,0.3)] hover:shadow-[0_0_30px_rgba(25,90,55,0.5)] transition-all duration-300 group"
                    data-testid="button-sign-in"
                  >
                    {isLoading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        Sign In
                        <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                      </>
                    )}
                  </Button>
                </form>
              </Form>

              {/* Demo credentials box */}
              <div className="mt-4 p-4 bg-muted/30 border border-primary/20 rounded-sm space-y-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Demo Credentials</p>
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div className="space-y-1">
                    <p className="font-semibold text-white">Admin</p>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <CreditCard className="h-3 w-3" />
                      <span className="font-mono">1000000001</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Phone className="h-3 w-3" />
                      <span className="font-mono">0500000001</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Lock className="h-3 w-3" />
                      <span className="font-mono">password123</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="font-semibold text-white">Recruiter</p>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <CreditCard className="h-3 w-3" />
                      <span className="font-mono">1000000003</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Phone className="h-3 w-3" />
                      <span className="font-mono">0500000003</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Lock className="h-3 w-3" />
                      <span className="font-mono">password123</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="font-semibold text-white">Candidate</p>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <CreditCard className="h-3 w-3" />
                      <span className="font-mono">2000000002</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Phone className="h-3 w-3" />
                      <span className="font-mono">0500000002</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Lock className="h-3 w-3" />
                      <span className="font-mono">password123</span>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* ── REGISTER TAB ── */}
            <TabsContent value="register" className="space-y-4">

              {/* Step indicator */}
              <div className="flex items-center gap-2 mb-2">
                {(["phone", "otp", "details"] as RegStep[]).map((step, i) => (
                  <div key={step} className="flex items-center gap-2">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${regStep === step ? "bg-primary text-primary-foreground" : i < ["phone","otp","details"].indexOf(regStep) ? "bg-primary/20 text-primary" : "bg-muted/40 text-muted-foreground"}`}>
                      {i < ["phone","otp","details"].indexOf(regStep) ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
                    </div>
                    <span className={`text-xs font-medium hidden sm:inline ${regStep === step ? "text-white" : "text-muted-foreground"}`}>
                      {step === "phone" ? "Phone" : step === "otp" ? "Verify" : "Details"}
                    </span>
                    {i < 2 && <div className="flex-1 h-px bg-border w-4 mx-1" />}
                  </div>
                ))}
              </div>

              {/* ── Step 1: Phone ── */}
              {regStep === "phone" && (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-muted-foreground uppercase text-xs tracking-wider font-semibold">Phone Number</Label>
                    <div className="relative group">
                      <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                      <Input
                        placeholder="0501234567"
                        value={regPhone}
                        onChange={(e) => { setRegPhone(e.target.value); setRegisterError(""); }}
                        className="pl-10 h-11 bg-muted/30 border-border focus-visible:border-primary/50 focus-visible:ring-primary/20 rounded-sm font-mono tracking-wide"
                        inputMode="tel"
                        data-testid="input-phone"
                        onKeyDown={(e) => e.key === "Enter" && regPhone.length >= 9 && sendOtp(regPhone)}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">A 6-digit verification code will be sent to this number.</p>
                  </div>
                  {registerError && (
                    <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-sm text-sm text-destructive">
                      <AlertCircle className="h-4 w-4 shrink-0" />{registerError}
                    </div>
                  )}
                  <Button
                    onClick={() => sendOtp(regPhone)}
                    disabled={isLoading || regPhone.length < 9}
                    className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-bold tracking-wide uppercase text-sm rounded-sm shadow-[0_0_20px_rgba(25,90,55,0.3)] transition-all duration-300"
                    data-testid="button-send-otp"
                  >
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Phone className="mr-2 h-4 w-4" />Send Verification Code</>}
                  </Button>
                </div>
              )}

              {/* ── Step 2: OTP ── */}
              {regStep === "otp" && (
                <div className="space-y-4">
                  <div className="p-3 bg-primary/5 border border-primary/20 rounded-sm flex items-start gap-2">
                    <ShieldCheck className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <div className="text-sm">
                      <p className="text-white font-medium">Code sent to {regPhone}</p>
                      <p className="text-muted-foreground text-xs mt-0.5">Check your SMS messages. The code expires in {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, "0")}.</p>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-muted-foreground uppercase text-xs tracking-wider font-semibold">6-Digit Code</Label>
                    <Input
                      ref={otpInputRef}
                      placeholder="• • • • • •"
                      value={otpCode}
                      onChange={(e) => { setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setRegisterError(""); }}
                      className="h-14 text-center text-2xl font-mono tracking-[0.5em] bg-muted/30 border-border focus-visible:border-primary/50 focus-visible:ring-primary/20 rounded-sm"
                      inputMode="numeric"
                      maxLength={6}
                      data-testid="input-otp-code"
                      onKeyDown={(e) => e.key === "Enter" && otpCode.length === 6 && verifyOtp()}
                    />
                  </div>
                  {registerError && (
                    <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-sm text-sm text-destructive">
                      <AlertCircle className="h-4 w-4 shrink-0" />{registerError}
                    </div>
                  )}
                  <Button
                    onClick={verifyOtp}
                    disabled={isLoading || otpCode.length !== 6}
                    className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-bold tracking-wide uppercase text-sm rounded-sm shadow-[0_0_20px_rgba(25,90,55,0.3)] transition-all duration-300"
                    data-testid="button-verify-otp"
                  >
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="mr-2 h-4 w-4" />Verify Code</>}
                  </Button>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <button onClick={() => { setRegStep("phone"); setRegisterError(""); }} className="hover:text-white transition-colors">← Change number</button>
                    <button
                      onClick={() => countdown === 0 && sendOtp(regPhone)}
                      disabled={countdown > 0}
                      className={`flex items-center gap-1 transition-colors ${countdown > 0 ? "opacity-40 cursor-not-allowed" : "hover:text-white cursor-pointer"}`}
                    >
                      <RefreshCw className="h-3 w-3" />
                      {countdown > 0 ? `Resend in ${countdown}s` : "Resend code"}
                    </button>
                  </div>
                </div>
              )}

              {/* ── Step 3: Details ── */}
              {regStep === "details" && (
                <div className="space-y-4">
                  <div className="p-3 bg-primary/5 border border-primary/20 rounded-sm flex items-center gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-primary font-medium">Phone verified: {regPhone}</span>
                  </div>
                  <Form {...registerForm}>
                    <form onSubmit={registerForm.handleSubmit(onRegister)} className="space-y-4">
                      <FormField control={registerForm.control} name="fullName" render={({ field }) => (
                        <FormItem>
                          <Label className="text-muted-foreground uppercase text-xs tracking-wider font-semibold">Full Name</Label>
                          <FormControl>
                            <Input placeholder="Ahmed Al-Mansouri" className="h-11 bg-muted/30 border-border focus-visible:border-primary/50 focus-visible:ring-primary/20 rounded-sm" data-testid="input-full-name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={registerForm.control} name="nationalId" render={({ field }) => (
                        <FormItem>
                          <Label className="text-muted-foreground uppercase text-xs tracking-wider font-semibold">National ID or Iqama Number</Label>
                          <FormControl>
                            <div className="relative group">
                              <CreditCard className="absolute left-3 top-3 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                              <Input placeholder="National ID (1xxxxxxxxx) or Iqama (2xxxxxxxxx)" className="pl-10 h-11 bg-muted/30 border-border focus-visible:border-primary/50 focus-visible:ring-primary/20 rounded-sm font-mono tracking-wide" inputMode="numeric" data-testid="input-national-id" {...field} />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={registerForm.control} name="password" render={({ field }) => (
                        <FormItem>
                          <Label className="text-muted-foreground uppercase text-xs tracking-wider font-semibold">Password</Label>
                          <FormControl>
                            <div className="relative group">
                              <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                              <Input type="password" placeholder="Minimum 8 characters" className="pl-10 h-11 bg-muted/30 border-border focus-visible:border-primary/50 focus-visible:ring-primary/20 rounded-sm" data-testid="input-register-password" {...field} />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      {registerError && (
                        <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-sm text-sm text-destructive" data-testid="register-error">
                          <AlertCircle className="h-4 w-4 shrink-0" />{registerError}
                        </div>
                      )}
                      <Button type="submit" disabled={isLoading} className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-bold tracking-wide uppercase text-sm rounded-sm shadow-[0_0_20px_rgba(25,90,55,0.3)] hover:shadow-[0_0_30px_rgba(25,90,55,0.5)] transition-all duration-300 group" data-testid="button-register">
                        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Create Account<ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" /></>}
                      </Button>
                    </form>
                  </Form>
                </div>
              )}

              <div className="text-center mt-2">
                <p className="text-sm text-muted-foreground">
                  By registering, you agree to our{" "}
                  <a href="#" className="hover:text-primary transition-colors underline underline-offset-4">Terms of Service</a>
                </p>
              </div>
            </TabsContent>
          </Tabs>
          )}

          <div className="flex items-center justify-between pt-8 border-t border-border/50 text-xs text-muted-foreground">
            <span>© {new Date().getFullYear()} Luxury Carts Company Ltd.</span>
            <span className="flex gap-4">
              <a href="#" className="hover:text-foreground transition-colors">Privacy</a>
              <a href="#" className="hover:text-foreground transition-colors">Terms & Conditions</a>
              <a
                href={supportEmail ? `mailto:${supportEmail}` : "#"}
                className="hover:text-foreground transition-colors"
                data-testid="link-contact-support"
                {...(supportEmail ? {} : { onClick: (e: React.MouseEvent) => e.preventDefault() })}
              >Contact Support</a>
            </span>
          </div>
        </div>
      </div>

      {/* ── Right Column: Visual ──────────────────────────────── */}
      <div className="hidden lg:flex relative bg-muted items-center justify-center overflow-hidden border-l border-border/50">
        <div className="absolute inset-0 bg-gradient-to-br from-background/80 via-background/40 to-transparent z-10" />
        <div className="absolute inset-0 bg-[url('/login-bg.png')] bg-cover bg-center" />

        <div className="relative z-20 max-w-lg p-12 backdrop-blur-md bg-background/30 border border-white/10 rounded-sm shadow-2xl animate-in slide-in-from-right-8 duration-1000 fade-in delay-200">
          <div className="w-12 h-1 bg-primary mb-6" />
          <h2 className="font-display text-3xl font-bold text-white mb-4 leading-tight">
            Seamlessly Manage Your Temporary Workforce
          </h2>
          <p className="text-white/80 text-lg leading-relaxed">
            Advanced scheduling, automated onboarding, and real-time performance tracking for high-volume hiring events.
          </p>

          <div className="grid grid-cols-2 gap-4 mt-8 pt-8 border-t border-white/10">
            <div>
              <div className="text-3xl font-display font-bold text-white">70K+</div>
              <div className="text-sm text-white/60 uppercase tracking-wider font-medium mt-1">Candidate Scale</div>
            </div>
            <div>
              <div className="text-3xl font-display font-bold text-white">24/7</div>
              <div className="text-sm text-white/60 uppercase tracking-wider font-medium mt-1">System Uptime</div>
            </div>
            <div>
              <div className="text-3xl font-display font-bold text-white">98%</div>
              <div className="text-sm text-white/60 uppercase tracking-wider font-medium mt-1">Efficiency Rate</div>
            </div>
            <div>
              <div className="text-3xl font-display font-bold text-white">SA</div>
              <div className="text-sm text-white/60 uppercase tracking-wider font-medium mt-1">Saudi Compliant</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
