import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useLocation } from "wouter";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Building2, ArrowRight, Lock, CreditCard, Phone, AlertCircle, Loader2 } from "lucide-react";
import { useState } from "react";
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
  phone: z
    .string()
    .min(10, "Enter a valid phone number")
    .refine((v) => /^[0-9]+$/.test(v.trim()), "Numbers only"),
  nationalId: z
    .string()
    .min(8, "Enter a valid National ID or Iqama number")
    .refine((v) => /^[0-9]+$/.test(v.trim()), "Numbers only — no letters or spaces"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export default function AuthPage() {
  const [, setLocation] = useLocation();
  const [loginError, setLoginError] = useState("");
  const [registerError, setRegisterError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const loginForm = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: "", password: "" },
  });

  const registerForm = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: { fullName: "", phone: "", nationalId: "", password: "" },
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

  async function onRegister(values: z.infer<typeof registerSchema>) {
    setRegisterError("");
    setIsLoading(true);
    try {
      const res = await apiRequest("POST", "/api/auth/register", {
        fullName: values.fullName.trim(),
        phone: values.phone.trim(),
        nationalId: values.nationalId.trim(),
        password: values.password,
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

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background font-sans text-foreground overflow-hidden">
      {/* ── Left Column: Form ─────────────────────────────────── */}
      <div className="flex flex-col justify-center items-center p-8 lg:p-12 relative z-10">
        <div className="w-full max-w-md space-y-8 animate-in slide-in-from-left-8 duration-700 fade-in">

          {/* Logo */}
          <div className="space-y-2">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-10 w-10 bg-primary rounded-sm flex items-center justify-center text-primary-foreground">
                <Building2 className="h-6 w-6" />
              </div>
              <span className="font-display font-bold text-2xl tracking-tight text-white">
                WORKFORCE<span className="text-primary">.IO</span>
              </span>
            </div>
            <h1 className="font-display text-4xl font-bold tracking-tight text-white">Welcome back</h1>
            <p className="text-muted-foreground text-lg">Sign in using your ID Number or Phone Number.</p>
          </div>

          <Tabs defaultValue="login" className="w-full">
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
                          <a href="#" className="text-xs text-muted-foreground hover:text-primary transition-colors">Forgot password?</a>
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
                        Sign In to Dashboard
                        <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                      </>
                    )}
                  </Button>
                </form>
              </Form>

              {/* Demo credentials box */}
              <div className="mt-4 p-4 bg-muted/30 border border-primary/20 rounded-sm space-y-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Demo Credentials</p>
                <div className="grid grid-cols-2 gap-3 text-xs">
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
              <Form {...registerForm}>
                <form onSubmit={registerForm.handleSubmit(onRegister)} className="space-y-5">

                  <FormField
                    control={registerForm.control}
                    name="fullName"
                    render={({ field }) => (
                      <FormItem>
                        <Label className="text-muted-foreground uppercase text-xs tracking-wider font-semibold">Full Name</Label>
                        <FormControl>
                          <Input
                            placeholder="Ahmed Al-Mansouri"
                            className="h-11 bg-muted/30 border-border focus-visible:border-primary/50 focus-visible:ring-primary/20 rounded-sm"
                            data-testid="input-full-name"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={registerForm.control}
                    name="nationalId"
                    render={({ field }) => (
                      <FormItem>
                        <Label className="text-muted-foreground uppercase text-xs tracking-wider font-semibold">
                          National ID or Iqama Number
                        </Label>
                        <FormControl>
                          <div className="relative group">
                            <CreditCard className="absolute left-3 top-3 h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                            <Input
                              placeholder="National ID (1xxxxxxxxx) or Iqama (2xxxxxxxxx)"
                              className="pl-10 h-11 bg-muted/30 border-border focus-visible:border-primary/50 focus-visible:ring-primary/20 rounded-sm font-mono tracking-wide"
                              inputMode="numeric"
                              data-testid="input-national-id"
                              {...field}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={registerForm.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <Label className="text-muted-foreground uppercase text-xs tracking-wider font-semibold">
                          Phone Number
                        </Label>
                        <FormControl>
                          <div className="relative group">
                            <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                            <Input
                              placeholder="0501234567"
                              className="pl-10 h-11 bg-muted/30 border-border focus-visible:border-primary/50 focus-visible:ring-primary/20 rounded-sm font-mono tracking-wide"
                              inputMode="tel"
                              data-testid="input-phone"
                              {...field}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={registerForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <Label className="text-muted-foreground uppercase text-xs tracking-wider font-semibold">Password</Label>
                        <FormControl>
                          <div className="relative group">
                            <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                            <Input
                              type="password"
                              placeholder="Minimum 8 characters"
                              className="pl-10 h-11 bg-muted/30 border-border focus-visible:border-primary/50 focus-visible:ring-primary/20 rounded-sm"
                              data-testid="input-register-password"
                              {...field}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Register error banner */}
                  {registerError && (
                    <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-sm text-sm text-destructive" data-testid="register-error">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      {registerError}
                    </div>
                  )}

                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-bold tracking-wide uppercase text-sm rounded-sm shadow-[0_0_20px_rgba(25,90,55,0.3)] hover:shadow-[0_0_30px_rgba(25,90,55,0.5)] transition-all duration-300 group"
                    data-testid="button-register"
                  >
                    {isLoading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        Create Account
                        <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                      </>
                    )}
                  </Button>
                </form>
              </Form>

              <div className="text-center mt-4">
                <p className="text-sm text-muted-foreground">
                  By registering, you agree to our{" "}
                  <a href="#" className="hover:text-primary transition-colors underline underline-offset-4">Terms of Service</a>
                </p>
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex items-center justify-between pt-8 border-t border-border/50 text-xs text-muted-foreground">
            <span>© 2026 Workforce Systems Inc.</span>
            <span className="flex gap-4">
              <a href="#" className="hover:text-foreground transition-colors">Privacy</a>
              <a href="#" className="hover:text-foreground transition-colors">Terms</a>
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
            Seamlessly Manage Your Seasonal Workforce
          </h2>
          <p className="text-white/80 text-lg leading-relaxed">
            Advanced scheduling, automated onboarding, and real-time performance tracking for high-volume hiring seasons.
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
