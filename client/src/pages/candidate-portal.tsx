import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import SignatureCanvas from "react-signature-canvas";
import jsPDF from "jspdf";
import {
  Building2,
  LogOut,
  Briefcase,
  MapPin,
  Clock,
  CheckCircle2,
  UploadCloud,
  ChevronRight,
  User,
  Settings,
  Bell,
  Search,
  FileText,
  PenTool,
  Loader2,
  CalendarDays,
  Banknote,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type JobPosting = {
  id: string;
  title: string;
  type: string;
  location?: string;
  region?: string;
  salaryMin?: number;
  salaryMax?: number;
  deadline?: string;
  description?: string;
  status: string;
};

const applySchema = z.object({
  fullNameEn: z.string().min(2, "Full name is required"),
  phone: z.string().min(9, "Phone number is required"),
  nationalId: z.string().min(5, "National ID or Iqama number is required"),
});
type ApplyForm = z.infer<typeof applySchema>;

function ApplyDialog({
  job,
  open,
  onOpenChange,
  onSuccess,
}: {
  job: JobPosting | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: (jobId: string) => void;
}) {
  const { toast } = useToast();
  const form = useForm<ApplyForm>({
    resolver: zodResolver(applySchema),
    defaultValues: { fullNameEn: "", phone: "", nationalId: "" },
  });

  const apply = useMutation({
    mutationFn: async (data: ApplyForm) => {
      const code = "CND-" + Math.random().toString(36).substring(2, 8).toUpperCase();
      const candidate = await apiRequest("POST", "/api/candidates", {
        candidateCode: code,
        fullNameEn: data.fullNameEn,
        phone: data.phone,
        nationalId: data.nationalId,
      }).then((r) => r.json());

      await apiRequest("POST", "/api/applications", {
        candidateId: candidate.id,
        jobId: job!.id,
        status: "new",
      });

      return job!.id;
    },
    onSuccess: (jobId) => {
      toast({ title: "Application submitted!", description: `You applied for "${job?.title}".` });
      onSuccess(jobId);
      form.reset();
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Failed to submit", description: "Please check your details and try again.", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-bold text-white flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-primary" />
            Apply for Position
          </DialogTitle>
          {job && (
            <DialogDescription className="text-muted-foreground">
              {job.title} · {job.region ?? job.location ?? "KSA"}
            </DialogDescription>
          )}
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit((d) => apply.mutate(d))} className="space-y-4 pt-1">
            <FormField control={form.control} name="fullNameEn" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Full Name (English)</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. Mohammed Al-Harbi" className="bg-muted/30 border-border" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="nationalId" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">National ID / Iqama No.</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. 1012345678" className="bg-muted/30 border-border" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="phone" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Phone Number</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. 0512345678" className="bg-muted/30 border-border" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" className="border-border" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-primary text-primary-foreground font-bold min-w-[120px]" disabled={apply.isPending}>
                {apply.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit Application"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function salaryLabel(job: JobPosting) {
  if (job.salaryMin && job.salaryMax) return `${job.salaryMin.toLocaleString()} – ${job.salaryMax.toLocaleString()} SAR/mo`;
  if (job.salaryMin) return `From ${job.salaryMin.toLocaleString()} SAR/mo`;
  return null;
}

function typeLabel(type: string) {
  return type === "full_time" ? "Full Time" : type === "part_time" ? "Part Time" : type;
}

export default function CandidatePortal() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const sigCanvas = useRef<SignatureCanvas>(null);
  const [isSignModalOpen, setIsSignModalOpen] = useState(false);
  const [isSigned, setIsSigned] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<JobPosting | null>(null);
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());

  const { data: jobs = [], isLoading } = useQuery<JobPosting[]>({
    queryKey: ["/api/jobs", "active"],
    queryFn: () => apiRequest("GET", "/api/jobs?status=active").then((r) => r.json()),
  });

  const appliedJobs = jobs.filter((j) => appliedIds.has(j.id));

  const handleApply = (job: JobPosting) => {
    setSelectedJob(job);
    setApplyOpen(true);
  };

  const handleApplySuccess = (jobId: string) => {
    setAppliedIds((prev) => new Set([...prev, jobId]));
  };

  const clearSignature = () => sigCanvas.current?.clear();

  const saveAndDownloadPdf = () => {
    if (sigCanvas.current?.isEmpty()) return;
    const dataURL = sigCanvas.current?.getTrimmedCanvas().toDataURL("image/png");
    const pdf = new jsPDF();
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(20);
    pdf.text("Seasonal Employment Agreement", 20, 30);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(12);
    pdf.text("Employer: WORKFORCE", 20, 50);
    pdf.text("Start Date: " + new Date().toLocaleDateString(), 20, 60);
    pdf.text("I hereby accept the terms and conditions of this employment offer.", 20, 80);
    pdf.setFont("helvetica", "bold");
    pdf.text("Employee Signature:", 20, 110);
    if (dataURL) pdf.addImage(dataURL, "PNG", 20, 120, 80, 40);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.text("Date Signed: " + new Date().toLocaleDateString(), 20, 170);
    pdf.save("Signed_Agreement.pdf");
    setIsSigned(true);
    setIsSignModalOpen(false);
  };

  return (
    <div className="min-h-screen bg-background font-sans text-foreground flex flex-col">
      {/* Navbar */}
      <header className="h-16 border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-50 px-4 lg:px-8 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 bg-primary rounded-sm flex items-center justify-center text-primary-foreground">
            <Building2 className="h-5 w-5" />
          </div>
          <span className="font-display font-bold text-xl tracking-tight text-white hidden sm:inline-block">
            WORKFORCE
          </span>
        </div>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
          <a href="#" className="text-primary hover:text-primary transition-colors">Dashboard</a>
          <a href="#" className="text-muted-foreground hover:text-white transition-colors">My Jobs</a>
          <a href="#" className="text-muted-foreground hover:text-white transition-colors">Documents</a>
        </nav>

        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-white relative">
            <Bell className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-3 pl-4 border-l border-border/50">
            <Avatar className="h-9 w-9 border border-border">
              <AvatarFallback className="bg-primary/20 text-primary font-bold text-sm">CA</AvatarFallback>
            </Avatar>
            <Button variant="ghost" size="icon" onClick={() => setLocation("/auth")} className="text-muted-foreground hover:text-destructive">
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 p-4 lg:p-8 max-w-7xl mx-auto w-full space-y-8 animate-in fade-in duration-500">

        {/* Welcome */}
        <div className="flex flex-col md:flex-row gap-4 md:items-center justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold text-white tracking-tight">Candidate Portal</h1>
            <p className="text-muted-foreground mt-1">Browse open positions and manage your applications.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left: Profile stub */}
          <div className="space-y-6">
            <Card className="bg-card border-border overflow-hidden">
              <div className="h-20 bg-gradient-to-r from-primary/20 to-primary/5" />
              <CardContent className="pt-0 -mt-10 text-center relative z-10">
                <Avatar className="h-20 w-20 border-4 border-card mx-auto">
                  <AvatarFallback className="text-xl bg-muted text-muted-foreground">CA</AvatarFallback>
                </Avatar>
                <div className="mt-3">
                  <h3 className="font-bold text-lg text-white">Candidate</h3>
                  <p className="text-muted-foreground text-sm">Job Seeker</p>
                </div>
                <div className="mt-4 flex justify-center gap-2">
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Active</Badge>
                  <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20">Available</Badge>
                </div>
                <div className="mt-6 grid grid-cols-2 gap-4 border-t border-border pt-5">
                  <div>
                    <div className="text-2xl font-bold text-white">{appliedIds.size}</div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wider">Applied</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-white">0</div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wider">Interviews</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-base font-display text-white">Profile Completion</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-muted-foreground">Overall Strength</span>
                  <span className="text-primary font-bold">25%</span>
                </div>
                <Progress value={25} className="h-2" />
                <div className="space-y-2 mt-3">
                  {[
                    { label: "Upload Resume", done: false, active: true },
                    { label: "National / Resident ID", done: false, active: false },
                    { label: "Personal Photo", done: false, active: false },
                    { label: "IBAN Certificate", done: false, active: false },
                  ].map(({ label, done, active }) => (
                    <div key={label} className={`flex items-center justify-between text-sm p-2 rounded-md bg-muted/20 ${active ? "border border-primary/20" : "opacity-60"}`}>
                      <div className="flex items-center gap-3">
                        {done
                          ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          : <div className={`h-4 w-4 rounded-full border-2 ${active ? "border-primary" : "border-muted-foreground"}`} />}
                        <span className={done ? "text-muted-foreground line-through" : "text-white"}>{label}</span>
                      </div>
                      {active && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-base font-display text-white">My Documents</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-md bg-muted/20 border border-primary/30 relative overflow-hidden">
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
                  <div className="flex items-center gap-3">
                    <FileText className="h-8 w-8 text-primary" />
                    <div>
                      <div className="text-sm font-medium text-white flex items-center gap-2">
                        Seasonal_Agreement.pdf
                        {isSigned && <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-500 text-[10px] h-4 py-0 border-0">Signed</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground">{isSigned ? "Signed today" : "Requires your signature"}</div>
                    </div>
                  </div>
                  {!isSigned ? (
                    <Button size="sm" className="bg-primary text-primary-foreground text-xs font-bold" onClick={() => setIsSignModalOpen(true)}>
                      <PenTool className="h-3 w-3 mr-1.5" />
                      Sign Now
                    </Button>
                  ) : (
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  )}
                </div>
                <Button variant="outline" className="w-full border-dashed border-border text-muted-foreground hover:text-white hover:border-primary/50 hover:bg-primary/5">
                  <UploadCloud className="mr-2 h-4 w-4" />
                  Upload Document
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Right: Jobs */}
          <div className="lg:col-span-2 space-y-6">
            <Tabs defaultValue="open">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-display font-bold text-white">Job Opportunities</h3>
                <TabsList className="bg-muted/20">
                  <TabsTrigger value="open">Open Positions</TabsTrigger>
                  <TabsTrigger value="applied">
                    Applied {appliedIds.size > 0 && `(${appliedIds.size})`}
                  </TabsTrigger>
                </TabsList>
              </div>

              {/* ── Open Positions ── */}
              <TabsContent value="open" className="space-y-4">
                {isLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : jobs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border rounded-md">
                    <Briefcase className="h-12 w-12 text-muted-foreground/30 mb-4" />
                    <p className="text-muted-foreground font-medium">No open positions right now</p>
                    <p className="text-muted-foreground/60 text-sm mt-1">Check back soon — new roles are added regularly</p>
                  </div>
                ) : (
                  jobs.map((job) => {
                    const applied = appliedIds.has(job.id);
                    const salary = salaryLabel(job);
                    return (
                      <Card key={job.id} className="bg-card border-border hover:border-primary/40 transition-all group" data-testid={`card-job-${job.id}`}>
                        <CardContent className="p-5">
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                <h4 className="font-bold text-white text-base group-hover:text-primary transition-colors">{job.title}</h4>
                                <Badge variant="outline" className="border-border text-muted-foreground text-xs font-normal">
                                  {typeLabel(job.type)}
                                </Badge>
                              </div>
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
                                {(job.region ?? job.location) && (
                                  <span className="flex items-center gap-1">
                                    <MapPin className="h-3.5 w-3.5" />
                                    {job.region ?? job.location}
                                  </span>
                                )}
                                {salary && (
                                  <span className="flex items-center gap-1 text-white font-medium">
                                    <Banknote className="h-3.5 w-3.5 text-muted-foreground" />
                                    {salary}
                                  </span>
                                )}
                                {job.deadline && (
                                  <span className="flex items-center gap-1 text-xs">
                                    <CalendarDays className="h-3.5 w-3.5" />
                                    Deadline: {job.deadline}
                                  </span>
                                )}
                              </div>
                              {job.description && (
                                <p className="text-xs text-muted-foreground/70 mt-2 line-clamp-2">{job.description}</p>
                              )}
                            </div>
                            <div className="shrink-0">
                              {applied ? (
                                <Button variant="outline" className="border-emerald-500/40 text-emerald-500 bg-emerald-500/10 font-bold cursor-default" disabled data-testid={`button-applied-${job.id}`}>
                                  <CheckCircle2 className="mr-1.5 h-4 w-4" />
                                  Applied
                                </Button>
                              ) : (
                                <Button className="bg-primary text-primary-foreground font-bold hover:bg-primary/90" onClick={() => handleApply(job)} data-testid={`button-apply-${job.id}`}>
                                  Apply Now
                                </Button>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </TabsContent>

              {/* ── Applied ── */}
              <TabsContent value="applied" className="space-y-4">
                {appliedJobs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border rounded-md">
                    <AlertCircle className="h-12 w-12 text-muted-foreground/30 mb-4" />
                    <p className="text-muted-foreground font-medium">No applications yet</p>
                    <p className="text-muted-foreground/60 text-sm mt-1">Apply to a position and it will appear here</p>
                  </div>
                ) : (
                  appliedJobs.map((job) => (
                    <Card key={job.id} className="bg-card border-border" data-testid={`card-applied-${job.id}`}>
                      <CardContent className="p-5">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <div className="font-bold text-white text-base">{job.title}</div>
                            <div className="text-sm text-muted-foreground flex items-center gap-3 mt-1">
                              {(job.region ?? job.location) && (
                                <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{job.region ?? job.location}</span>
                              )}
                              <span className="flex items-center gap-1"><Briefcase className="h-3.5 w-3.5" />{typeLabel(job.type)}</span>
                            </div>
                          </div>
                          <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 border font-medium shrink-0">
                            Under Review
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>

      {/* Apply Dialog */}
      <ApplyDialog
        job={selectedJob}
        open={applyOpen}
        onOpenChange={setApplyOpen}
        onSuccess={handleApplySuccess}
      />

      {/* Sign Dialog */}
      <Dialog open={isSignModalOpen} onOpenChange={setIsSignModalOpen}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-white">Sign Document</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Draw your signature below to accept the Seasonal Employment Agreement.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <div className="border border-border rounded-md bg-white">
              <SignatureCanvas
                ref={sigCanvas}
                penColor="black"
                canvasProps={{ className: "w-full h-48 rounded-md cursor-crosshair" }}
              />
            </div>
            <div className="flex justify-end mt-2">
              <Button variant="ghost" size="sm" onClick={clearSignature} className="text-xs text-muted-foreground hover:text-white">
                Clear
              </Button>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setIsSignModalOpen(false)} className="border-border">Cancel</Button>
            <Button onClick={saveAndDownloadPdf} className="bg-primary text-primary-foreground font-bold">
              Sign & Download PDF
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
