import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  AlertTriangle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation, Trans } from "react-i18next";

interface AdminUser {
  id: string;
  username: string;
  email: string;
  fullName: string | null;
  phone: string | null;
  nationalId: string | null;
  role: string;
  roleId: string | null;
  isActive: boolean;
  lastLogin: string | null;
  createdAt: string;
}

interface Role {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
  isSystem: boolean;
}

const SYSTEM_ROLE_SLUGS = new Set(["super_admin", "candidate"]);

const PALETTE: Record<string, string> = {
  red: "bg-red-500/15 text-red-300 border-red-500/30",
  orange: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  amber: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  emerald: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  cyan: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  blue: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  violet: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  pink: "bg-pink-500/15 text-pink-300 border-pink-500/30",
  slate: "bg-muted text-muted-foreground border-border",
};
function colorClass(c?: string | null) {
  return PALETTE[c ?? "slate"] ?? PALETTE.slate;
}

interface FormState {
  fullName: string;
  nationalId: string;
  phone: string;
  email: string;
  username: string;
  password: string;
  roleId: string;
}
const EMPTY_FORM: FormState = {
  fullName: "",
  nationalId: "",
  phone: "",
  email: "",
  username: "",
  password: "",
  roleId: "",
};

export function AdminUsersContent() {
  const { t, i18n } = useTranslation(["adminUsers", "common"]);
  const dateLocale = i18n.language === "ar" ? "ar-SA" : "en-GB";
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AdminUser | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<AdminUser | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM);

  const { data: users, isLoading, error } = useQuery<AdminUser[]>({
    queryKey: ["/api/admin-users"],
  });

  const { data: roles = [] } = useQuery<Role[]>({
    queryKey: ["/api/roles"],
    queryFn: () => apiRequest("GET", "/api/roles").then((r) => r.json()),
  });

  const roleById = useMemo(() => Object.fromEntries(roles.map((r) => [r.id, r])), [roles]);
  const roleBySlug = useMemo(() => Object.fromEntries(roles.map((r) => [r.slug, r])), [roles]);
  const assignableRoles = roles.filter((r) => !SYSTEM_ROLE_SLUGS.has(r.slug));

  // Resolve a user's effective role row (prefer roleId, fall back to slug match
  // on the legacy role string for users who haven't been migrated yet).
  function userRole(u: AdminUser): Role | null {
    if (u.roleId && roleById[u.roleId]) return roleById[u.roleId];
    if (u.role && roleBySlug[u.role]) return roleBySlug[u.role];
    return null;
  }

  const filtered = useMemo(() => {
    if (!users) return [];
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== "all") {
        const r = userRole(u);
        if (!r || r.id !== roleFilter) return false;
      }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, search, roleFilter, statusFilter, roleById, roleBySlug]);

  const createMutation = useMutation({
    mutationFn: async (data: FormState) => {
      const res = await apiRequest("POST", "/api/admin-users", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin-users"] });
      toast({ title: t("adminUsers:toasts.created") });
      setCreateOpen(false);
      setForm(EMPTY_FORM);
    },
    onError: (err: any) => {
      toast({ title: t("adminUsers:toasts.createFailed"), description: err?.message || t("adminUsers:toasts.unknownError"), variant: "destructive" });
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
      toast({ title: t("adminUsers:toasts.updated") });
      setEditTarget(null);
    },
    onError: (err: any) => {
      toast({ title: t("adminUsers:toasts.updateFailed"), description: err?.message || t("adminUsers:toasts.unknownError"), variant: "destructive" });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await apiRequest("PATCH", `/api/admin-users/${id}`, { isActive });
      return res.json();
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin-users"] });
      toast({ title: vars.isActive ? t("adminUsers:toasts.reactivated") : t("adminUsers:toasts.deactivated") });
      setConfirmTarget(null);
    },
    onError: (err: any) => {
      toast({ title: t("adminUsers:toasts.toggleFailed"), description: err?.message || t("adminUsers:toasts.unknownError"), variant: "destructive" });
    },
  });

  const openEdit = (u: AdminUser) => {
    setEditTarget(u);
    const r = userRole(u);
    setEditForm({
      fullName: u.fullName ?? "",
      nationalId: u.nationalId ?? "",
      phone: u.phone ?? "",
      email: u.email,
      username: u.username,
      password: "",
      roleId: r && !SYSTEM_ROLE_SLUGS.has(r.slug) ? r.id : "",
    });
  };

  const formatDate = (d: string | null) => {
    if (!d) return t("adminUsers:never");
    try {
      return new Date(d).toLocaleString(dateLocale, { dateStyle: "medium", timeStyle: "short", numberingSystem: "latn" } as any);
    } catch {
      return "—";
    }
  };

  if (error) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="py-12 text-center">
          <ShieldCheck className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-white font-semibold mb-1">{t("adminUsers:accessRequired")}</p>
          <p className="text-sm text-muted-foreground">
            {t("adminUsers:accessRequiredHint")}
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
                <CardTitle className="text-xl text-white">{t("adminUsers:title")}</CardTitle>
              </div>
              <CardDescription>
                <Trans i18nKey="adminUsers:subtitle" components={[<strong className="text-white" />]} />
              </CardDescription>
            </div>
            <Button
              onClick={() => { setForm({ ...EMPTY_FORM }); setCreateOpen(true); }}
              className="h-10 bg-primary text-primary-foreground font-semibold"
              data-testid="button-add-admin-user"
              disabled={assignableRoles.length === 0}
            >
              <UserPlus className="me-2 h-4 w-4" />
              {t("adminUsers:addAdmin")}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {assignableRoles.length === 0 && (
            <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-sm px-3 py-2">
              <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-400">
                <Trans i18nKey="adminUsers:noRolesWarn" components={[<strong />]} />
              </p>
            </div>
          )}

          {/* Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="relative sm:col-span-2">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("adminUsers:filters.search")}
                className="ps-9 bg-muted/30 border-border"
                data-testid="input-search-admins"
              />
            </div>
            <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v)}>
              <SelectTrigger className="bg-muted/30 border-border" data-testid="select-role-filter">
                <SelectValue placeholder={t("adminUsers:filters.role")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("adminUsers:filters.allRoles")}</SelectItem>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
              <SelectTrigger className="bg-muted/30 border-border" data-testid="select-status-filter">
                <SelectValue placeholder={t("adminUsers:filters.status")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("adminUsers:filters.allStatuses")}</SelectItem>
                <SelectItem value="active">{t("adminUsers:filters.active")}</SelectItem>
                <SelectItem value="inactive">{t("adminUsers:filters.inactive")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <div className="border border-border rounded-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground">{t("adminUsers:table.name")}</TableHead>
                  <TableHead className="text-muted-foreground">{t("adminUsers:table.nationalId")}</TableHead>
                  <TableHead className="text-muted-foreground">{t("adminUsers:table.phone")}</TableHead>
                  <TableHead className="text-muted-foreground">{t("adminUsers:table.role")}</TableHead>
                  <TableHead className="text-muted-foreground">{t("adminUsers:table.status")}</TableHead>
                  <TableHead className="text-muted-foreground">{t("adminUsers:table.lastLogin")}</TableHead>
                  <TableHead className="text-muted-foreground text-end">{t("adminUsers:table.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin inline me-2" />{t("adminUsers:table.loading")}
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                      {t("adminUsers:table.empty")}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((u) => {
                    const r = userRole(u);
                    const isFounder = r?.slug === "super_admin";
                    return (
                      <TableRow key={u.id} className="border-border" data-testid={`row-admin-${u.id}`}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {isFounder && <Crown className="h-4 w-4 text-amber-400" />}
                            <div>
                              <div className="font-medium text-white" data-testid={`text-admin-name-${u.id}`}>
                                <bdi>{u.fullName ?? u.username}</bdi>
                              </div>
                              <div className="text-xs text-muted-foreground" dir="ltr">{u.email}</div>
                              {isFounder && (
                                <div className="text-[10px] text-amber-400/80 uppercase tracking-wider mt-0.5">
                                  {t("adminUsers:founder")}
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm text-white/90" dir="ltr">{u.nationalId ?? "—"}</TableCell>
                        <TableCell className="font-mono text-sm text-white/90" dir="ltr">{u.phone ?? "—"}</TableCell>
                        <TableCell>
                          {r ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge variant="outline" className={colorClass(r.color)} data-testid={`badge-role-${u.id}`}>
                                    {r.name}
                                  </Badge>
                                </TooltipTrigger>
                                {r.description && (
                                  <TooltipContent><p className="max-w-xs">{r.description}</p></TooltipContent>
                                )}
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/30 gap-1">
                              <Lock className="h-3 w-3" /> {t("adminUsers:noRoleBlocked")}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {u.isActive ? (
                            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                              {t("adminUsers:filters.active")}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-muted text-muted-foreground border-border">
                              {t("adminUsers:filters.inactive")}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground"><bdi dir="ltr">{formatDate(u.lastLogin)}</bdi></TableCell>
                        <TableCell className="text-end">
                          {isFounder ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex items-center justify-end gap-1.5 text-xs text-amber-400/70 select-none">
                                    <Lock className="h-3.5 w-3.5" /> {t("adminUsers:readOnly")}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent><p>{t("adminUsers:founderTooltip")}</p></TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            <div className="flex items-center justify-end gap-1 ltr:flex-row rtl:flex-row-reverse">
                              <Button
                                variant={r ? "ghost" : "outline"}
                                size="sm"
                                onClick={() => openEdit(u)}
                                className={r ? "" : "h-8 px-2 text-xs border-red-500/30 text-red-400 hover:bg-red-500/10"}
                                data-testid={`button-edit-${u.id}`}
                              >
                                {r ? <Pencil className="h-3.5 w-3.5" /> : t("adminUsers:setRole")}
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
            <DialogTitle>{t("adminUsers:create.title")}</DialogTitle>
            <DialogDescription>
              {t("adminUsers:create.desc")}
            </DialogDescription>
          </DialogHeader>
          <AdminUserForm value={form} onChange={setForm} mode="create" assignableRoles={assignableRoles} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>{t("adminUsers:create.cancel")}</Button>
            <Button
              onClick={() => createMutation.mutate(form)}
              disabled={createMutation.isPending || !form.roleId}
              data-testid="button-submit-create-admin"
            >
              {createMutation.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              {t("adminUsers:create.submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editTarget} onOpenChange={(o) => { if (!o) setEditTarget(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("adminUsers:edit.title")}</DialogTitle>
            <DialogDescription>
              {t("adminUsers:edit.desc")}
            </DialogDescription>
          </DialogHeader>
          <AdminUserForm value={editForm} onChange={setEditForm} mode="edit" assignableRoles={assignableRoles} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditTarget(null)}>{t("adminUsers:edit.cancel")}</Button>
            <Button
              onClick={() => editTarget && updateMutation.mutate({ id: editTarget.id, data: editForm })}
              disabled={updateMutation.isPending || !editForm.roleId}
              data-testid="button-submit-edit-admin"
            >
              {updateMutation.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              {t("adminUsers:edit.submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm activate / deactivate */}
      <AlertDialog open={!!confirmTarget} onOpenChange={(o) => { if (!o) setConfirmTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmTarget?.isActive ? t("adminUsers:confirm.deactivateTitle") : t("adminUsers:confirm.reactivateTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmTarget?.isActive
                ? t("adminUsers:confirm.deactivateBody", { name: confirmTarget?.fullName ?? confirmTarget?.username })
                : t("adminUsers:confirm.reactivateBody", { name: confirmTarget?.fullName ?? confirmTarget?.username })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("adminUsers:confirm.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmTarget && toggleActiveMutation.mutate({ id: confirmTarget.id, isActive: !confirmTarget.isActive })}
              data-testid="button-confirm-toggle"
            >
              {confirmTarget?.isActive ? t("adminUsers:confirm.deactivate") : t("adminUsers:confirm.reactivate")}
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
  assignableRoles,
}: {
  value: FormState;
  onChange: (v: FormState) => void;
  mode: "create" | "edit";
  assignableRoles: Role[];
}) {
  const { t } = useTranslation(["adminUsers"]);
  const set = (k: keyof FormState, v: string) => onChange({ ...value, [k]: v });
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="space-y-1.5 sm:col-span-2">
        <Label className="text-white">{t("adminUsers:form.fullName")}</Label>
        <Input value={value.fullName} onChange={(e) => set("fullName", e.target.value)} placeholder={t("adminUsers:form.fullNamePh")} data-testid="input-fullname" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-white">{t("adminUsers:form.nationalId")}</Label>
        <Input dir="ltr" value={value.nationalId} onChange={(e) => set("nationalId", e.target.value)} placeholder={t("adminUsers:form.nationalIdPh")} data-testid="input-nationalid" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-white">{t("adminUsers:form.phone")}</Label>
        <Input dir="ltr" value={value.phone} onChange={(e) => set("phone", e.target.value)} placeholder={t("adminUsers:form.phonePh")} data-testid="input-phone" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-white">{t("adminUsers:form.email")}</Label>
        <Input dir="ltr" type="email" value={value.email} onChange={(e) => set("email", e.target.value)} placeholder={t("adminUsers:form.emailPh")} data-testid="input-email" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-white">{t("adminUsers:form.username")}</Label>
        <Input dir="ltr" value={value.username} onChange={(e) => set("username", e.target.value)} placeholder={t("adminUsers:form.usernamePh")} data-testid="input-username" />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label className="text-white">{t("adminUsers:form.role")}</Label>
        <Select value={value.roleId} onValueChange={(v) => set("roleId", v)}>
          <SelectTrigger data-testid="select-role"><SelectValue placeholder={t("adminUsers:form.rolePh")} /></SelectTrigger>
          <SelectContent>
            {assignableRoles.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                <div>
                  <div className="font-medium">{r.name}</div>
                  {r.description && <div className="text-xs text-muted-foreground">{r.description}</div>}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label className="text-white">
          {mode === "create" ? t("adminUsers:form.passwordCreate") : t("adminUsers:form.passwordEdit")}
        </Label>
        <Input
          type="password"
          value={value.password}
          onChange={(e) => set("password", e.target.value)}
          placeholder={mode === "create" ? t("adminUsers:form.passwordPhCreate") : t("adminUsers:form.passwordPhEdit")}
          data-testid="input-password"
        />
        <p className="text-xs text-muted-foreground">
          {t("adminUsers:form.passwordHint")}
        </p>
      </div>
    </div>
  );
}
