import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import DashboardLayout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Shield,
  Building2,
  Users,
  Plus,
  Pencil,
  Check,
  X,
  Loader2,
  Eye,
  Lock,
  Globe,
  UserCheck,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type BusinessUnit = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  contactEmail: string | null;
  isActive: boolean;
  createdAt: string;
};

type AppUser = {
  id: string;
  username: string;
  email: string;
  fullName: string | null;
  role: string;
  businessUnitId: string | null;
  isActive: boolean;
};

// ─── Role meta ────────────────────────────────────────────────────────────────
const ROLE_OPTIONS = [
  { value: "super_admin", label: "Super Admin", color: "bg-red-500/10 text-red-400 border-red-500/20" },
  { value: "admin",       label: "Admin",       color: "bg-orange-500/10 text-orange-400 border-orange-500/20" },
  { value: "hr_manager",  label: "HR Manager",  color: "bg-violet-500/10 text-violet-400 border-violet-500/20" },
  { value: "recruiter",   label: "Recruiter",   color: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  { value: "interviewer", label: "Interviewer", color: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" },
  { value: "viewer",      label: "Viewer",      color: "bg-muted text-muted-foreground border-border" },
];

function roleMeta(role: string) {
  return ROLE_OPTIONS.find((r) => r.value === role) ?? { label: role, color: "bg-muted text-muted-foreground border-border" };
}

const GLOBAL_ROLES = ["super_admin", "admin"];

// ─── Permissions matrix data ──────────────────────────────────────────────────
const PERMISSIONS = [
  { label: "View all business units' jobs",    super_admin: true,  admin: true,  hr_manager: false, recruiter: false, interviewer: false, viewer: false },
  { label: "View own business unit's jobs",     super_admin: true,  admin: true,  hr_manager: true,  recruiter: true,  interviewer: true,  viewer: true  },
  { label: "Post & manage jobs",               super_admin: true,  admin: true,  hr_manager: true,  recruiter: true,  interviewer: false, viewer: false },
  { label: "Review & shortlist candidates",    super_admin: true,  admin: true,  hr_manager: true,  recruiter: true,  interviewer: false, viewer: false },
  { label: "Schedule & conduct interviews",    super_admin: true,  admin: true,  hr_manager: true,  recruiter: true,  interviewer: true,  viewer: false },
  { label: "Access Talent Pool",               super_admin: true,  admin: true,  hr_manager: true,  recruiter: true,  interviewer: false, viewer: true  },
  { label: "Manage workforce records",         super_admin: true,  admin: true,  hr_manager: true,  recruiter: false, interviewer: false, viewer: false },
  { label: "Manage seasons & SMP contracts",   super_admin: true,  admin: true,  hr_manager: true,  recruiter: false, interviewer: false, viewer: false },
  { label: "Send notifications",               super_admin: true,  admin: true,  hr_manager: true,  recruiter: true,  interviewer: false, viewer: false },
  { label: "View reports & analytics",         super_admin: true,  admin: true,  hr_manager: true,  recruiter: false, interviewer: false, viewer: true  },
  { label: "Manage users & roles",             super_admin: true,  admin: false, hr_manager: false, recruiter: false, interviewer: false, viewer: false },
  { label: "Manage business units",            super_admin: true,  admin: false, hr_manager: false, recruiter: false, interviewer: false, viewer: false },
  { label: "System & settings",                super_admin: true,  admin: false, hr_manager: false, recruiter: false, interviewer: false, viewer: false },
];

const MATRIX_COLS: { key: keyof (typeof PERMISSIONS)[0]; label: string }[] = [
  { key: "super_admin",  label: "Super Admin" },
  { key: "admin",        label: "Admin" },
  { key: "hr_manager",   label: "HR Manager" },
  { key: "recruiter",    label: "Recruiter" },
  { key: "interviewer",  label: "Interviewer" },
  { key: "viewer",       label: "Viewer" },
];

// ─── Business Unit form ───────────────────────────────────────────────────────
const buSchema = z.object({
  name:         z.string().min(2, "Name is required"),
  code:         z.string().min(2, "Code is required").max(20).toUpperCase(),
  description:  z.string().optional(),
  contactEmail: z.string().email("Invalid email").optional().or(z.literal("")),
  isActive:     z.boolean().default(true),
});
type BUForm = z.infer<typeof buSchema>;

function BUDialog({
  open,
  onOpenChange,
  existing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  existing?: BusinessUnit | null;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<BUForm>({
    resolver: zodResolver(buSchema),
    defaultValues: existing
      ? { name: existing.name, code: existing.code, description: existing.description ?? "", contactEmail: existing.contactEmail ?? "", isActive: existing.isActive }
      : { name: "", code: "", description: "", contactEmail: "", isActive: true },
  });

  const save = useMutation({
    mutationFn: async (data: BUForm) => {
      if (existing) {
        return apiRequest("PATCH", `/api/business-units/${existing.id}`, data).then((r) => r.json());
      }
      return apiRequest("POST", "/api/business-units", data).then((r) => r.json());
    },
    onSuccess: () => {
      toast({ title: existing ? "Business unit updated" : "Business unit created" });
      queryClient.invalidateQueries({ queryKey: ["/api/business-units"] });
      form.reset();
      onOpenChange(false);
    },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-bold text-white flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            {existing ? "Edit Business Unit" : "New Business Unit"}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            Each business unit has its own isolated view of job applications.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit((d) => save.mutate(d))} className="space-y-4 pt-1">
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Unit Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Makkah Operations" className="bg-muted/30 border-border" {...field} data-testid="input-bu-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="code" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Code</FormLabel>
                  <FormControl>
                    <Input placeholder="MKH-OPS" className="bg-muted/30 border-border font-mono uppercase" {...field} onChange={(e) => field.onChange(e.target.value.toUpperCase())} data-testid="input-bu-code" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="contactEmail" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Contact Email</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="hr@unit.sa" className="bg-muted/30 border-border" {...field} data-testid="input-bu-email" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Description</FormLabel>
                <FormControl>
                  <Input placeholder="Optional description" className="bg-muted/30 border-border" {...field} data-testid="input-bu-description" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" className="border-border" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" className="bg-primary text-primary-foreground font-bold min-w-[120px]" disabled={save.isPending} data-testid="button-save-bu">
                {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : existing ? "Save Changes" : "Create Unit"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ─── User role/BU edit dialog ─────────────────────────────────────────────────
const userEditSchema = z.object({
  role:           z.string().min(1),
  businessUnitId: z.string().optional(),
  isActive:       z.boolean(),
});
type UserEditForm = z.infer<typeof userEditSchema>;

// ─── Invite user dialog ────────────────────────────────────────────────────────
const inviteSchema = z.object({
  fullName:       z.string().min(2, "Full name required"),
  email:          z.string().email("Invalid email"),
  username:       z.string().min(3, "ID number required"),
  role:           z.string().min(1, "Role required"),
  businessUnitId: z.string().optional(),
  password:       z.string().min(8, "Min 8 characters"),
});
type InviteForm = z.infer<typeof inviteSchema>;

function InviteUserDialog({
  open,
  onOpenChange,
  businessUnits,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  businessUnits: BusinessUnit[];
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<InviteForm>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { fullName: "", email: "", username: "", role: "recruiter", businessUnitId: "", password: "" },
  });

  const watchRole = form.watch("role");

  const create = useMutation({
    mutationFn: (data: InviteForm) =>
      apiRequest("POST", "/api/users", {
        ...data,
        businessUnitId: data.businessUnitId || null,
      }).then((r) => r.json()),
    onSuccess: () => {
      toast({ title: "User created", description: "The user can now log in with their credentials." });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      form.reset();
      onOpenChange(false);
    },
    onError: () => toast({ title: "Failed to create user", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-bold text-white flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-primary" />
            Invite User
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            Add a staff member and assign their role and business unit.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit((d) => create.mutate(d))} className="space-y-4 pt-1">
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="fullName" render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Full Name</FormLabel>
                  <FormControl><Input placeholder="e.g. Mohammed Al-Qahtani" className="bg-muted/30 border-border" {...field} data-testid="input-invite-name" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Email</FormLabel>
                  <FormControl><Input type="email" placeholder="user@org.sa" className="bg-muted/30 border-border" {...field} data-testid="input-invite-email" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="username" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">ID Number</FormLabel>
                  <FormControl><Input placeholder="1234567890" className="bg-muted/30 border-border" {...field} data-testid="input-invite-username" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="role" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Role</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="bg-muted/30 border-border" data-testid="select-invite-role">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {ROLE_OPTIONS.filter((r) => r.value !== "candidate").map((r) => (
                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="businessUnitId" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Business Unit</FormLabel>
                  <Select
                    onValueChange={(v) => field.onChange(v === "none" ? "" : v)}
                    value={field.value || "none"}
                    disabled={GLOBAL_ROLES.includes(watchRole)}
                  >
                    <FormControl>
                      <SelectTrigger className="bg-muted/30 border-border" data-testid="select-invite-bu">
                        <SelectValue placeholder={GLOBAL_ROLES.includes(watchRole) ? "All units" : "Select unit"} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">{GLOBAL_ROLES.includes(watchRole) ? "All units (global)" : "No unit"}</SelectItem>
                      {businessUnits.filter((b) => b.isActive).map((bu) => (
                        <SelectItem key={bu.id} value={bu.id}>{bu.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="password" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Temporary Password</FormLabel>
                <FormControl><Input type="password" placeholder="Min 8 characters" className="bg-muted/30 border-border" {...field} data-testid="input-invite-password" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            {GLOBAL_ROLES.includes(watchRole) && (
              <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-sm px-3 py-2">
                <Globe className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-400">
                  <strong>Super Admin</strong> and <strong>Admin</strong> roles have global access — they can view job applications across all business units.
                </p>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" className="border-border" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" className="bg-primary text-primary-foreground font-bold min-w-[120px]" disabled={create.isPending} data-testid="button-submit-invite">
                {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create User"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit user dialog ──────────────────────────────────────────────────────────
function EditUserDialog({
  open,
  onOpenChange,
  user,
  businessUnits,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  user: AppUser | null;
  businessUnits: BusinessUnit[];
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<UserEditForm>({
    resolver: zodResolver(userEditSchema),
    defaultValues: {
      role: user?.role ?? "recruiter",
      businessUnitId: user?.businessUnitId ?? "",
      isActive: user?.isActive ?? true,
    },
  });

  const watchRole = form.watch("role");

  const save = useMutation({
    mutationFn: (data: UserEditForm) =>
      apiRequest("PATCH", `/api/users/${user!.id}`, {
        ...data,
        businessUnitId: data.businessUnitId || null,
      }).then((r) => r.json()),
    onSuccess: () => {
      toast({ title: "User updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      onOpenChange(false);
    },
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-display text-lg font-bold text-white">Edit User</DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">{user.fullName ?? user.email}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit((d) => save.mutate(d))} className="space-y-4 pt-1">
            <FormField control={form.control} name="role" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Role</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="bg-muted/30 border-border" data-testid="select-edit-role">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {ROLE_OPTIONS.filter((r) => r.value !== "candidate").map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormItem>
            )} />

            <FormField control={form.control} name="businessUnitId" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Business Unit</FormLabel>
                <Select
                  onValueChange={(v) => field.onChange(v === "none" ? "" : v)}
                  value={field.value || "none"}
                  disabled={GLOBAL_ROLES.includes(watchRole)}
                >
                  <FormControl>
                    <SelectTrigger className="bg-muted/30 border-border" data-testid="select-edit-bu">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="none">{GLOBAL_ROLES.includes(watchRole) ? "All units (global)" : "No unit"}</SelectItem>
                    {businessUnits.filter((b) => b.isActive).map((bu) => (
                      <SelectItem key={bu.id} value={bu.id}>{bu.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormItem>
            )} />

            <FormField control={form.control} name="isActive" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Status</FormLabel>
                <Select onValueChange={(v) => field.onChange(v === "true")} value={String(field.value)}>
                  <FormControl>
                    <SelectTrigger className="bg-muted/30 border-border" data-testid="select-edit-status">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="true">Active</SelectItem>
                    <SelectItem value="false">Deactivated</SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            )} />

            {GLOBAL_ROLES.includes(watchRole) && (
              <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-sm px-3 py-2">
                <Globe className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-400">This role has global access to all business units.</p>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" className="border-border" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" className="bg-primary text-primary-foreground font-bold min-w-[110px]" disabled={save.isPending} data-testid="button-save-user">
                {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function RolesAccessPage() {
  const [buDialogOpen, setBuDialogOpen] = useState(false);
  const [editingBu, setEditingBu] = useState<BusinessUnit | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);

  const { data: businessUnits = [], isLoading: loadingBUs } = useQuery<BusinessUnit[]>({
    queryKey: ["/api/business-units"],
    queryFn: () => apiRequest("GET", "/api/business-units").then((r) => r.json()),
  });

  const { data: userList = [], isLoading: loadingUsers } = useQuery<AppUser[]>({
    queryKey: ["/api/users"],
    queryFn: () => apiRequest("GET", "/api/users").then((r) => r.json()),
  });

  const buMap = Object.fromEntries(businessUnits.map((b) => [b.id, b]));

  const staffUsers = userList.filter((u) => u.role !== "candidate");

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-6xl mx-auto">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-display font-bold text-white tracking-tight flex items-center gap-3">
            <Shield className="h-8 w-8 text-primary" />
            Roles & Access
          </h1>
          <p className="text-muted-foreground mt-1">
            Define business units, assign roles, and control who sees which job applications.
          </p>
        </div>

        {/* Access model callout */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-start gap-3 bg-primary/5 border border-primary/20 rounded-sm p-4">
            <Globe className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-white">Super Admin &amp; Admin — Global Access</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Can view and manage job applications across <strong className="text-white">all</strong> business units with no restrictions.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 bg-muted/20 border border-border rounded-sm p-4">
            <Lock className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-white">All Other Roles — Business Unit Scoped</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                HR Managers, Recruiters, Interviewers, and Viewers can only see jobs and applications belonging to their assigned business unit.
              </p>
            </div>
          </div>
        </div>

        <Tabs defaultValue="business-units" className="w-full">
          <TabsList className="bg-card border border-border h-auto p-1 gap-1 w-full grid grid-cols-3">
            <TabsTrigger value="business-units" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary h-10 gap-2">
              <Building2 className="h-4 w-4" /> Business Units
            </TabsTrigger>
            <TabsTrigger value="users" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary h-10 gap-2">
              <Users className="h-4 w-4" /> Users &amp; Roles
            </TabsTrigger>
            <TabsTrigger value="permissions" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary h-10 gap-2">
              <Eye className="h-4 w-4" /> Permissions Matrix
            </TabsTrigger>
          </TabsList>

          {/* ── Business Units ─────────────────────────────────────────────── */}
          <TabsContent value="business-units" className="mt-4">
            <Card className="bg-card border-border">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg font-display text-white">Business Units</CardTitle>
                  <p className="text-muted-foreground text-sm mt-0.5">Each unit has an isolated view of its own job applications.</p>
                </div>
                <Button
                  className="bg-primary text-primary-foreground font-bold uppercase tracking-wide text-xs h-9 gap-1.5"
                  onClick={() => { setEditingBu(null); setBuDialogOpen(true); }}
                  data-testid="button-add-bu"
                >
                  <Plus className="h-4 w-4" /> Add Unit
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {loadingBUs ? (
                  <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                ) : businessUnits.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                    <Building2 className="h-12 w-12 text-muted-foreground/30 mb-4" />
                    <p className="text-muted-foreground font-medium">No business units yet</p>
                    <p className="text-muted-foreground/60 text-sm mt-1">Create your first unit to start scoping access.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border hover:bg-transparent">
                        <TableHead className="text-muted-foreground">Unit</TableHead>
                        <TableHead className="text-muted-foreground hidden md:table-cell">Code</TableHead>
                        <TableHead className="text-muted-foreground hidden md:table-cell">Contact</TableHead>
                        <TableHead className="text-muted-foreground">Users</TableHead>
                        <TableHead className="text-muted-foreground">Status</TableHead>
                        <TableHead className="text-right text-muted-foreground">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {businessUnits.map((bu) => {
                        const userCount = staffUsers.filter((u) => u.businessUnitId === bu.id).length;
                        return (
                          <TableRow key={bu.id} className="border-border hover:bg-muted/20" data-testid={`row-bu-${bu.id}`}>
                            <TableCell>
                              <p className="text-white font-medium text-sm">{bu.name}</p>
                              {bu.description && <p className="text-muted-foreground text-xs mt-0.5 truncate max-w-[200px]">{bu.description}</p>}
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                              <code className="font-mono text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">{bu.code}</code>
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                              <span className="text-sm text-muted-foreground">{bu.contactEmail ?? "—"}</span>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm text-white font-medium">{userCount}</span>
                              <span className="text-xs text-muted-foreground ml-1">staff</span>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={bu.isActive ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10" : "border-border text-muted-foreground"}>
                                {bu.isActive ? "Active" : "Inactive"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 text-muted-foreground hover:text-white"
                                onClick={() => { setEditingBu(bu); setBuDialogOpen(true); }}
                                data-testid={`button-edit-bu-${bu.id}`}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Users & Roles ──────────────────────────────────────────────── */}
          <TabsContent value="users" className="mt-4">
            <Card className="bg-card border-border">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg font-display text-white">Users &amp; Roles</CardTitle>
                  <p className="text-muted-foreground text-sm mt-0.5">Assign roles and business units to staff members.</p>
                </div>
                <Button
                  className="bg-primary text-primary-foreground font-bold uppercase tracking-wide text-xs h-9 gap-1.5"
                  onClick={() => setInviteOpen(true)}
                  data-testid="button-invite-user"
                >
                  <Plus className="h-4 w-4" /> Invite User
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {loadingUsers ? (
                  <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                ) : staffUsers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <Users className="h-12 w-12 text-muted-foreground/30 mb-4" />
                    <p className="text-muted-foreground font-medium">No users found</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border hover:bg-transparent">
                        <TableHead className="text-muted-foreground">User</TableHead>
                        <TableHead className="text-muted-foreground">Role</TableHead>
                        <TableHead className="text-muted-foreground hidden md:table-cell">Business Unit</TableHead>
                        <TableHead className="text-muted-foreground hidden md:table-cell">Access Scope</TableHead>
                        <TableHead className="text-muted-foreground">Status</TableHead>
                        <TableHead className="text-right text-muted-foreground">Edit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {staffUsers.map((u) => {
                        const meta = roleMeta(u.role);
                        const isGlobal = GLOBAL_ROLES.includes(u.role);
                        const bu = u.businessUnitId ? buMap[u.businessUnitId] : null;
                        return (
                          <TableRow key={u.id} className="border-border hover:bg-muted/20" data-testid={`row-user-${u.id}`}>
                            <TableCell>
                              <p className="text-white font-medium text-sm">{u.fullName ?? u.username}</p>
                              <p className="text-muted-foreground text-xs">{u.email}</p>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={`border text-xs font-medium ${meta.color}`}>
                                {meta.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                              {isGlobal ? (
                                <span className="flex items-center gap-1 text-xs text-amber-400">
                                  <Globe className="h-3.5 w-3.5" /> All units
                                </span>
                              ) : bu ? (
                                <span className="text-sm text-white">{bu.name}</span>
                              ) : (
                                <span className="text-sm text-muted-foreground/50">—</span>
                              )}
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                              <span className={`text-xs ${isGlobal ? "text-amber-400" : "text-muted-foreground"}`}>
                                {isGlobal ? "Global — all BUs" : bu ? `Scoped to ${bu.code ?? bu.name}` : "No BU assigned"}
                              </span>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={u.isActive ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10" : "border-border text-muted-foreground"}>
                                {u.isActive ? "Active" : "Inactive"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 text-muted-foreground hover:text-white"
                                onClick={() => setEditingUser(u)}
                                data-testid={`button-edit-user-${u.id}`}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Permissions Matrix ─────────────────────────────────────────── */}
          <TabsContent value="permissions" className="mt-4">
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-lg font-display text-white">Permissions Matrix</CardTitle>
                <p className="text-muted-foreground text-sm mt-0.5">What each role can do across the platform.</p>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground w-64">Permission</th>
                      {MATRIX_COLS.map((col) => (
                        <th key={col.key} className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          <Badge variant="outline" className={`border text-xs ${roleMeta(col.key).color}`}>
                            {col.label}
                          </Badge>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {PERMISSIONS.map((perm, idx) => (
                      <tr key={idx} className="hover:bg-muted/10">
                        <td className="px-6 py-3 text-sm text-white">{perm.label}</td>
                        {MATRIX_COLS.map((col) => (
                          <td key={col.key} className="px-4 py-3 text-center">
                            {(perm as Record<string, unknown>)[col.key] ? (
                              <Check className="h-4 w-4 text-emerald-400 mx-auto" />
                            ) : (
                              <X className="h-4 w-4 text-muted-foreground/30 mx-auto" />
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Dialogs */}
      <BUDialog
        open={buDialogOpen}
        onOpenChange={(v) => { setBuDialogOpen(v); if (!v) setEditingBu(null); }}
        existing={editingBu}
      />
      <InviteUserDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        businessUnits={businessUnits}
      />
      <EditUserDialog
        open={!!editingUser}
        onOpenChange={(v) => { if (!v) setEditingUser(null); }}
        user={editingUser}
        businessUnits={businessUnits}
      />
    </DashboardLayout>
  );
}
