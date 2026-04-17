import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  ShieldCheck,
  UserPlus,
  Lock,
  Search,
  Pencil,
  Power,
  PowerOff,
  Loader2,
  Crown,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Mirror of shared/schema.ts assignable admin roles (must match server enum).
type AssignableAdminRole =
  | "admin"
  | "hr_manager"
  | "hr_specialist"
  | "hr_attendance_reviewer"
  | "auditor"
  | "recruiter";

type AdminRoleAll = AssignableAdminRole | "super_admin";

interface AdminUser {
  id: string;
  username: string;
  email: string;
  fullName: string | null;
  phone: string | null;
  nationalId: string | null;
  role: AdminRoleAll;
  isActive: boolean;
  lastLogin: string | null;
  createdAt: string;
}

const ROLE_META: Record<AdminRoleAll, { label: string; color: string; description: string }> = {
  super_admin: {
    label: "Super Admin",
    color: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    description: "Founding owner — full system control. Cannot be edited.",
  },
  admin: {
    label: "Admin",
    color: "bg-primary/15 text-primary border-primary/30",
    description: "Full back-office access except super-admin actions.",
  },
  hr_manager: {
    label: "HR Manager",
    color: "bg-blue-500/15 text-blue-300 border-blue-500/30",
    description: "Manages HR operations, candidates, and workforce.",
  },
  hr_specialist: {
    label: "HR Specialist",
    color: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
    description: "Day-to-day HR tasks and candidate processing.",
  },
  hr_attendance_reviewer: {
    label: "HR Attendance Reviewer",
    color: "bg-violet-500/15 text-violet-300 border-violet-500/30",
    description: "Reviews and approves attendance and excuse requests.",
  },
  auditor: {
    label: "Auditor",
    color: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    description: "Read-only access for compliance and audit reviews.",
  },
  recruiter: {
    label: "Recruiter",
    color: "bg-sky-500/15 text-sky-300 border-sky-500/30",
    description: "Manages job postings, applications, and interviews.",
  },
};

const ASSIGNABLE_ROLES: AssignableAdminRole[] = [
  "admin",
  "hr_manager",
  "hr_specialist",
  "hr_attendance_reviewer",
  "auditor",
  "recruiter",
];

interface FormState {
  fullName: string;
  nationalId: string;
  phone: string;
  email: string;
  username: string;
  password: string;
  role: AssignableAdminRole;
}

const EMPTY_FORM: FormState = {
  fullName: "",
  nationalId: "",
  phone: "",
  email: "",
  username: "",
  password: "",
  role: "admin",
};

export function AdminUsersContent() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | AdminRoleAll>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AdminUser | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<AdminUser | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM);

  const { data: users, isLoading, error } = useQuery<AdminUser[]>({
    queryKey: ["/api/admin-users"],
  });

  const filtered = useMemo(() => {
    if (!users) return [];
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (statusFilter === "active" && !u.isActive) return false;
      if (statusFilter === "inactive" && u.isActive) return false;
      if (!q) return true;
      return (
        (u.fullName ?? "").toLowerCase().includes(q) ||
        (u.nationalId ?? "").toLowerCase().includes(q) ||
        (u.phone ?? "").toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q)
      );
    });
  }, [users, search, roleFilter, statusFilter]);

  const createMutation = useMutation({
    mutationFn: async (data: FormState) => {
      const res = await apiRequest("POST", "/api/admin-users", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin-users"] });
      toast({ title: "Admin user created" });
      setCreateOpen(false);
      setForm(EMPTY_FORM);
    },
    onError: (err: any) => {
      toast({ title: "Failed to create", description: err?.message || "Unknown error", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<FormState> }) => {
      const payload: Record<string, unknown> = { ...data };
      if (!payload.password) delete payload.password;
      const res = await apiRequest("PATCH", `/api/admin-users/${id}`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin-users"] });
      toast({ title: "Admin user updated" });
      setEditTarget(null);
    },
    onError: (err: any) => {
      toast({ title: "Failed to update", description: err?.message || "Unknown error", variant: "destructive" });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await apiRequest("PATCH", `/api/admin-users/${id}`, { isActive });
      return res.json();
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin-users"] });
      toast({ title: vars.isActive ? "User reactivated" : "User deactivated" });
      setConfirmTarget(null);
    },
    onError: (err: any) => {
      toast({ title: "Failed", description: err?.message || "Unknown error", variant: "destructive" });
    },
  });

  const openEdit = (u: AdminUser) => {
    setEditTarget(u);
    setEditForm({
      fullName: u.fullName ?? "",
      nationalId: u.nationalId ?? "",
      phone: u.phone ?? "",
      email: u.email,
      username: u.username,
      password: "",
      role: (u.role === "super_admin" ? "admin" : u.role) as AssignableAdminRole,
    });
  };

  const formatDate = (d: string | null) => {
    if (!d) return "Never";
    try {
      return new Date(d).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
    } catch {
      return "—";
    }
  };

  if (error) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="py-12 text-center">
          <ShieldCheck className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-white font-semibold mb-1">Super Admin access required</p>
          <p className="text-sm text-muted-foreground">
            Only the Super Admin can manage admin users.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                <CardTitle className="text-xl text-white">Admin Users</CardTitle>
              </div>
              <CardDescription>
                Internal back-office staff — admins, HR specialists, attendance reviewers, auditors, and recruiters. These are NOT workforce employees or candidates.
              </CardDescription>
            </div>
            <Button
              onClick={() => { setForm(EMPTY_FORM); setCreateOpen(true); }}
              className="h-10 bg-primary text-primary-foreground font-semibold"
              data-testid="button-add-admin-user"
            >
              <UserPlus className="mr-2 h-4 w-4" />
              Add Admin User
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="relative sm:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, ID, phone, email…"
                className="pl-9 bg-muted/30 border-border"
                data-testid="input-search-admins"
              />
            </div>
            <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as any)}>
              <SelectTrigger className="bg-muted/30 border-border" data-testid="select-role-filter">
                <SelectValue placeholder="Filter by role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                <SelectItem value="super_admin">Super Admin</SelectItem>
                {ASSIGNABLE_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>{ROLE_META[r].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
              <SelectTrigger className="bg-muted/30 border-border" data-testid="select-status-filter">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <div className="border border-border rounded-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground">Name</TableHead>
                  <TableHead className="text-muted-foreground">National ID</TableHead>
                  <TableHead className="text-muted-foreground">Phone</TableHead>
                  <TableHead className="text-muted-foreground">Role</TableHead>
                  <TableHead className="text-muted-foreground">Status</TableHead>
                  <TableHead className="text-muted-foreground">Last Login</TableHead>
                  <TableHead className="text-muted-foreground text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin inline mr-2" />Loading admin users…
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                      No admin users found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((u) => {
                    const meta = ROLE_META[u.role];
                    const isFounder = u.role === "super_admin";
                    return (
                      <TableRow key={u.id} className="border-border" data-testid={`row-admin-${u.id}`}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {isFounder && <Crown className="h-4 w-4 text-amber-400" />}
                            <div>
                              <div className="font-medium text-white" data-testid={`text-admin-name-${u.id}`}>
                                {u.fullName ?? u.username}
                              </div>
                              <div className="text-xs text-muted-foreground">{u.email}</div>
                              {isFounder && (
                                <div className="text-[10px] text-amber-400/80 uppercase tracking-wider mt-0.5">
                                  Founding Super Admin
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm text-white/90">{u.nationalId ?? "—"}</TableCell>
                        <TableCell className="font-mono text-sm text-white/90">{u.phone ?? "—"}</TableCell>
                        <TableCell>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge variant="outline" className={meta.color} data-testid={`badge-role-${u.id}`}>
                                  {meta.label}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent><p className="max-w-xs">{meta.description}</p></TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                        <TableCell>
                          {u.isActive ? (
                            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-muted text-muted-foreground border-border">
                              Inactive
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{formatDate(u.lastLogin)}</TableCell>
                        <TableCell className="text-right">
                          {isFounder ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex items-center justify-end gap-1.5 text-xs text-amber-400/70 select-none">
                                    <Lock className="h-3.5 w-3.5" /> Read-only
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent><p>The Founding Super Admin cannot be modified from the UI.</p></TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEdit(u)}
                                data-testid={`button-edit-${u.id}`}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setConfirmTarget(u)}
                                className={u.isActive ? "text-red-400 hover:text-red-300" : "text-emerald-400 hover:text-emerald-300"}
                                data-testid={`button-toggle-${u.id}`}
                              >
                                {u.isActive ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Admin User</DialogTitle>
            <DialogDescription>
              Create a new internal back-office user. They'll log in with their National ID or phone, plus the password you set here.
            </DialogDescription>
          </DialogHeader>
          <AdminUserForm value={form} onChange={setForm} mode="create" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createMutation.mutate(form)}
              disabled={createMutation.isPending}
              data-testid="button-submit-create-admin"
            >
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Admin User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editTarget} onOpenChange={(o) => { if (!o) setEditTarget(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Admin User</DialogTitle>
            <DialogDescription>
              Update profile, role, or set a new password. Leave the password field empty to keep it unchanged.
            </DialogDescription>
          </DialogHeader>
          <AdminUserForm value={editForm} onChange={setEditForm} mode="edit" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button
              onClick={() => editTarget && updateMutation.mutate({ id: editTarget.id, data: editForm })}
              disabled={updateMutation.isPending}
              data-testid="button-submit-edit-admin"
            >
              {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm activate / deactivate */}
      <AlertDialog open={!!confirmTarget} onOpenChange={(o) => { if (!o) setConfirmTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmTarget?.isActive ? "Deactivate this admin user?" : "Reactivate this admin user?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmTarget?.isActive
                ? `${confirmTarget?.fullName ?? confirmTarget?.username} will be unable to sign in until reactivated.`
                : `${confirmTarget?.fullName ?? confirmTarget?.username} will regain access immediately.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmTarget && toggleActiveMutation.mutate({ id: confirmTarget.id, isActive: !confirmTarget.isActive })}
              data-testid="button-confirm-toggle"
            >
              {confirmTarget?.isActive ? "Deactivate" : "Reactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AdminUserForm({
  value,
  onChange,
  mode,
}: {
  value: FormState;
  onChange: (v: FormState) => void;
  mode: "create" | "edit";
}) {
  const set = (k: keyof FormState, v: string) => onChange({ ...value, [k]: v });
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="space-y-1.5 sm:col-span-2">
        <Label className="text-white">Full Name</Label>
        <Input value={value.fullName} onChange={(e) => set("fullName", e.target.value)} placeholder="Faisal Alamri" data-testid="input-fullname" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-white">National ID</Label>
        <Input value={value.nationalId} onChange={(e) => set("nationalId", e.target.value)} placeholder="1071793531" data-testid="input-nationalid" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-white">Phone</Label>
        <Input value={value.phone} onChange={(e) => set("phone", e.target.value)} placeholder="0581766080" data-testid="input-phone" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-white">Email</Label>
        <Input type="email" value={value.email} onChange={(e) => set("email", e.target.value)} placeholder="user@workforce.sa" data-testid="input-email" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-white">Username</Label>
        <Input value={value.username} onChange={(e) => set("username", e.target.value)} placeholder="firstname.lastname" data-testid="input-username" />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label className="text-white">Role</Label>
        <Select value={value.role} onValueChange={(v) => set("role", v)}>
          <SelectTrigger data-testid="select-role"><SelectValue /></SelectTrigger>
          <SelectContent>
            {ASSIGNABLE_ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                <div>
                  <div className="font-medium">{ROLE_META[r].label}</div>
                  <div className="text-xs text-muted-foreground">{ROLE_META[r].description}</div>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label className="text-white">
          {mode === "create" ? "Password" : "New Password (leave empty to keep current)"}
        </Label>
        <Input
          type="password"
          value={value.password}
          onChange={(e) => set("password", e.target.value)}
          placeholder={mode === "create" ? "Min 8 chars, with upper, lower, number, special" : "Leave empty to keep current"}
          data-testid="input-password"
        />
        <p className="text-xs text-muted-foreground">
          Must contain at least 8 characters, one uppercase, one lowercase, one number, one special character.
        </p>
      </div>
    </div>
  );
}
