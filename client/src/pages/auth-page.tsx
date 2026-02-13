import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useLocation } from "wouter";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Building2, ArrowRight, Lock, Mail } from "lucide-react";

const authSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export default function AuthPage() {
  const [, setLocation] = useLocation();

  const form = useForm<z.infer<typeof authSchema>>({
    resolver: zodResolver(authSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  function onSubmit(values: z.infer<typeof authSchema>) {
    console.log(values);
    
    // Mock login routing based on email
    if (values.email.includes("candidate")) {
      setLocation("/candidate-portal");
    } else {
      setLocation("/dashboard"); 
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background font-sans text-foreground overflow-hidden">
      {/* Left Column: Form */}
      <div className="flex flex-col justify-center items-center p-8 lg:p-12 relative z-10">
        
        <div className="w-full max-w-md space-y-8 animate-in slide-in-from-left-8 duration-700 fade-in">
          <div className="space-y-2">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-10 w-10 bg-primary rounded-sm flex items-center justify-center text-primary-foreground">
                <Building2 className="h-6 w-6" />
              </div>
              <span className="font-display font-bold text-2xl tracking-tight text-white">
                WORKFORCE<span className="text-primary">.IO</span>
              </span>
            </div>
            <h1 className="font-display text-4xl font-bold tracking-tight text-white">
              Welcome back
            </h1>
            <p className="text-muted-foreground text-lg">
              Enter your credentials to access the hiring portal.
            </p>
          </div>

          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-8 bg-muted/50 p-1 rounded-sm">
              <TabsTrigger value="login" className="rounded-sm data-[state=active]:bg-background data-[state=active]:text-foreground font-medium">Login</TabsTrigger>
              <TabsTrigger value="register" className="rounded-sm data-[state=active]:bg-background data-[state=active]:text-foreground font-medium">Sign Up</TabsTrigger>
            </TabsList>

            <TabsContent value="login" className="space-y-4">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <Label className="text-muted-foreground uppercase text-xs tracking-wider font-semibold">Email Address</Label>
                        <FormControl>
                          <div className="relative group">
                            <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                            <Input 
                              placeholder="email@email.com" 
                              className="pl-10 h-11 bg-muted/30 border-border focus-visible:border-primary/50 focus-visible:ring-primary/20 transition-all rounded-sm" 
                              {...field} 
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <Label className="text-muted-foreground uppercase text-xs tracking-wider font-semibold">Password</Label>
                        <FormControl>
                          <div className="relative group">
                            <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                            <Input 
                              type="password" 
                              placeholder="••••••••" 
                              className="pl-10 h-11 bg-muted/30 border-border focus-visible:border-primary/50 focus-visible:ring-primary/20 transition-all rounded-sm" 
                              {...field} 
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button 
                    type="submit" 
                    className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-bold tracking-wide uppercase text-sm rounded-sm shadow-[0_0_20px_rgba(25,90,55,0.3)] hover:shadow-[0_0_30px_rgba(25,90,55,0.5)] transition-all duration-300 group"
                  >
                    Sign In to Dashboard
                    <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </form>
              </Form>

              <div className="text-center mt-6">
                <a href="#" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                  Forgot your password?
                </a>
              </div>
            </TabsContent>

            <TabsContent value="register" className="space-y-4">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                       <Label className="text-muted-foreground uppercase text-xs tracking-wider font-semibold">First Name</Label>
                       <Input 
                          placeholder="John" 
                          className="h-11 bg-muted/30 border-border focus-visible:border-primary/50 focus-visible:ring-primary/20 transition-all rounded-sm" 
                       />
                    </div>
                    <div className="space-y-2">
                       <Label className="text-muted-foreground uppercase text-xs tracking-wider font-semibold">Last Name</Label>
                       <Input 
                          placeholder="Doe" 
                          className="h-11 bg-muted/30 border-border focus-visible:border-primary/50 focus-visible:ring-primary/20 transition-all rounded-sm" 
                       />
                    </div>
                  </div>

                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <Label className="text-muted-foreground uppercase text-xs tracking-wider font-semibold">Email</Label>
                        <FormControl>
                          <div className="relative group">
                            <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                            <Input 
                              placeholder="email@email.com" 
                              className="pl-10 h-11 bg-muted/30 border-border focus-visible:border-primary/50 focus-visible:ring-primary/20 transition-all rounded-sm" 
                              {...field} 
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <Label className="text-muted-foreground uppercase text-xs tracking-wider font-semibold">Choose Password</Label>
                        <FormControl>
                          <div className="relative group">
                            <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                            <Input 
                              type="password" 
                              placeholder="••••••••" 
                              className="pl-10 h-11 bg-muted/30 border-border focus-visible:border-primary/50 focus-visible:ring-primary/20 transition-all rounded-sm" 
                              {...field} 
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex items-center justify-between p-4 bg-muted/20 border border-border rounded-sm">
                    <div className="flex items-center space-x-3">
                      <Checkbox id="recaptcha" className="h-6 w-6 rounded-sm border-2" />
                      <Label htmlFor="recaptcha" className="font-normal text-sm">I'm not a robot</Label>
                    </div>
                    <div className="flex flex-col items-center">
                      <img src="https://www.gstatic.com/recaptcha/api2/logo_48.png" alt="reCAPTCHA" className="h-8 w-8 opacity-50" />
                      <span className="text-[10px] text-muted-foreground mt-1">reCAPTCHA</span>
                      <div className="text-[8px] text-muted-foreground -mt-1 space-x-1">
                        <span>Privacy</span>
                        <span>-</span>
                        <span>Terms</span>
                      </div>
                    </div>
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-bold tracking-wide uppercase text-sm rounded-sm shadow-[0_0_20px_rgba(25,90,55,0.3)] hover:shadow-[0_0_30px_rgba(25,90,55,0.5)] transition-all duration-300 group"
                  >
                    Create Account
                    <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </form>
              </Form>
              
              <div className="mt-6 p-4 bg-muted/30 border border-primary/20 rounded-sm text-center">
                 <p className="text-xs text-muted-foreground mb-2">FOR DEMO PURPOSES ONLY</p>
                 <p className="text-sm font-medium text-white">Log in as Candidate?</p>
                 <div className="text-xs text-muted-foreground mt-1">Use: candidate@demo.com / password</div>
              </div>

              <div className="text-center mt-6">
                <p className="text-sm text-muted-foreground">
                  By clicking continue, you agree to our <a href="#" className="hover:text-primary transition-colors underline underline-offset-4">Terms of Service</a>
                </p>
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex items-center justify-between pt-8 border-t border-border/50 text-xs text-muted-foreground">
            <span>© 2024 Workforce Systems Inc.</span>
            <span className="flex gap-4">
              <a href="#" className="hover:text-foreground transition-colors">Privacy</a>
              <a href="#" className="hover:text-foreground transition-colors">Terms</a>
            </span>
          </div>
        </div>
      </div>

      {/* Right Column: Visual */}
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
              <div className="text-3xl font-display font-bold text-white">98%</div>
              <div className="text-sm text-white/60 uppercase tracking-wider font-medium mt-1">Efficiency Rate</div>
            </div>
            <div>
              <div className="text-3xl font-display font-bold text-white">24/7</div>
              <div className="text-sm text-white/60 uppercase tracking-wider font-medium mt-1">System Uptime</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
