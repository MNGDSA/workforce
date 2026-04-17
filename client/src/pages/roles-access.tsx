import { useEffect, useMemo, useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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
  Loader2,
  Lock,
  Globe,
  UserCheck,
  Info,
  Trash2,
  Copy,
  Search,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// ─── Shared types ────────────────────────────────────────────────────────────
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
  roleId: string | null;
  businessUnitId: string | null;
  isActive: boolean;
};

type Role = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
  isSystem: boolean;
  createdAt: string;
};

type Permission = {
  key: string;
  resource: string;
  action: string;
  description: string;
  category: string;
};

type RolePermsResponse = {
  roleId: string;
  isSuperAdmin: boolean;
  permissions: string[];
};

const SYSTEM_ROLE_SLUGS = new Set(["super_admin", "candidate"]);

const PALETTE = [
  { value: "red",     cls: "bg-red-500/10 text-red-400 border-red-500/20" },
  { value: "orange",  cls: "bg-orange-500/10 text-orange-400 border-orange-500/20" },
  { value: "amber",   cls: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  { value: "emerald", cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  { value: "cyan",    cls: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" },
  { value: "blue",    cls: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  { value: "violet",  cls: "bg-violet-500/10 text-violet-400 border-violet-500/20" },
  { value: "pink",    cls: "bg-pink-500/10 text-pink-400 border-pink-500/20" },
  { value: "slate",   cls: "bg-muted text-muted-foreground border-border" },
];

function roleBadgeClass(color?: string | null) {
  return PALETTE.find((p) => p.value === color)?.cls ?? PALETTE[8].cls;
}

function InfoTooltip({ text }: { text: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="relative inline-flex items-center ml-1.5 normal-case">
      <button
        type="button"
        className="inline-flex items-center justify-center text-muted-foreground/50 hover:text-primary transition-colors"
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        aria-label="More information"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {visible && (
        <span className="absolute right-0 top-full mt-1.5 z-50 w-60 rounded-sm bg-popover border border-border px-3 py-2 text-xs text-muted-foreground shadow-lg leading-relaxed pointer-events-none normal-case tracking-normal font-normal">
          <span className="absolute right-1.5 bottom-full h-0 w-0 border-x-4 border-x-transparent border-b-4 border-b-border" />
          {text}
        </span>
      )}
    </span>
  );
}

// ─── Business Unit form ──────────────────────────────────────────────────────
const buSchema = z.object({
  name: z.string().min(2, "Name is required"),
  code: z.string().min(2, "Code is required").max(20).toUpperCase(),
  description: z.string().optional(),
  contactEmail: z.string().email("Invalid email").optional().or(z.literal("")),
  isActive: z.boolean().default(true),
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
      ? {
          name: existing.name,
          code: existing.code,
          description: existing.description ?? "",
          contactEmail: existing.contactEmail ?? "",
          isActive: existing.isActive,
        }
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

// ─── Role create / edit dialog ───────────────────────────────────────────────
const roleSchema = z.object({
  name: z.string().min(2, "Name is required").max(100),
  slug: z.string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9_-]+$/, "lowercase letters, numbers, _ or -"),
  description: z.string().max(500).optional(),
  color: z.string().optional(),
});
type RoleForm = z.infer<typeof roleSchema>;

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 64);
}

function RoleDialog({
  open,
  onOpenChange,
  existing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  existing?: Role | null;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const form = useForm<RoleForm>({
    resolver: zodResolver(roleSchema),
    defaultValues: existing
      ? { name: existing.name, slug: existing.slug, description: existing.description ?? "", color: existing.color ?? "slate" }
      : { name: "", slug: "", description: "", color: "blue" },
  });

  const save = useMutation({
    mutationFn: async (data: RoleForm) => {
      if (existing) {
        const { slug: _slug, ...patch } = data;
        return apiRequest("PATCH", `/api/roles/${existing.id}`, patch).then((r) => r.json());
      }
      return apiRequest("POST", "/api/roles", data).then((r) => r.json());
    },
    onSuccess: () => {
      toast({ title: existing ? "Role updated" : "Role created" });
      queryClient.invalidateQueries({ queryKey: ["/api/roles"] });
      form.reset();
      onOpenChange(false);
    },
    onError: (e: any) => toast({ title: e?.message ?? "Failed to save role", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-bold text-white flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            {existing ? "Edit Role" : "New Role"}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            {existing
              ? "Rename or recolor this role. Permissions are managed in the role row."
              : "Create a custom role. After saving, set its permissions from the role row."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((d) => save.mutate(d))} className="space-y-4 pt-1">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Name</FormLabel>
                <FormControl>
                  <Input
                    placeholder="e.g. Site Supervisor"
                    className="bg-muted/30 border-border"
                    {...field}
                    onChange={(e) => {
                      field.onChange(e);
                      if (!existing && !form.formState.dirtyFields.slug) {
                        form.setValue("slug", slugify(e.target.value));
                      }
                    }}
                    data-testid="input-role-name"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            {!existing && (
              <FormField control={form.control} name="slug" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Slug</FormLabel>
                  <FormControl>
                    <Input placeholder="site_supervisor" className="bg-muted/30 border-border font-mono lowercase" {...field} data-testid="input-role-slug" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            )}
            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Description</FormLabel>
                <FormControl>
                  <Input placeholder="What does this role do?" className="bg-muted/30 border-border" {...field} data-testid="input-role-description" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="color" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Color</FormLabel>
                <div className="flex flex-wrap gap-2 pt-1">
                  {PALETTE.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => field.onChange(p.value)}
                      className={`h-8 w-8 rounded-sm border ${p.cls} ${field.value === p.value ? "ring-2 ring-primary" : ""}`}
                      data-testid={`button-color-${p.value}`}
                      aria-label={p.value}
                    />
                  ))}
                </div>
              </FormItem>
            )} />
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" className="border-border" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" className="bg-primary text-primary-foreground font-bold min-w-[110px]" disabled={save.isPending} data-testid="button-save-role">
                {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : existing ? "Save" : "Create Role"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function CloneRoleDialog({
  open,
  onOpenChange,
  source,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  source: Role | null;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");

  const clone = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/roles/${source!.id}/clone`, { name, slug }).then((r) => r.json()),
    onSuccess: () => {
      toast({ title: "Role cloned" });
      queryClient.invalidateQueries({ queryKey: ["/api/roles"] });
      onOpenChange(false);
      setName("");
      setSlug("");
    },
    onError: (e: any) => toast({ title: e?.message ?? "Clone failed", variant: "destructive" }),
  });

  if (!source) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-display text-lg font-bold text-white">Clone "{source.name}"</DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            Creates a new role with the same permissions.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div>
            <label className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Name</label>
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSlug(slugify(e.target.value));
              }}
              placeholder={`${source.name} (Copy)`}
              className="bg-muted/30 border-border mt-1"
              data-testid="input-clone-name"
            />
          </div>
          <div>
            <label className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Slug</label>
            <Input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder={`${source.slug}_copy`}
              className="bg-muted/30 border-border font-mono mt-1"
              data-testid="input-clone-slug"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="border-border" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            className="bg-primary text-primary-foreground font-bold min-w-[110px]"
            disabled={!name || !slug || clone.isPending}
            onClick={() => clone.mutate()}
            data-testid="button-confirm-clone"
          >
            {clone.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Clone"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Permission editor (per-role) ────────────────────────────────────────────
function PermissionEditorDialog({
  open,
  onOpenChange,
  role,
  permissions,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  role: Role | null;
  permissions: Permission[];
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");

  const isSystem = role ? SYSTEM_ROLE_SLUGS.has(role.slug) : false;
  const isSuperAdmin = role?.slug === "super_admin";

  const { data: rolePerms, isLoading: loadingRolePerms } = useQuery<RolePermsResponse>({
    queryKey: ["/api/roles", role?.id, "permissions"],
    queryFn: () => apiRequest("GET", `/api/roles/${role!.id}/permissions`).then((r) => r.json()),
    enabled: open && !!role,
  });

  // Hydrate the selection set whenever the dialog opens for a (possibly new)
  // role and the server has returned its permission list. Reset on close so
  // the next open starts fresh.
  useEffect(() => {
    if (open && rolePerms && rolePerms.roleId === role?.id) {
      setSelected(new Set(rolePerms.permissions));
    }
  }, [open, rolePerms, role?.id]);

  useEffect(() => {
    if (!open) {
      setSelected(new Set());
      setFilter("");
    }
  }, [open]);

  const grouped = useMemo(() => {
    const groups: Record<string, Permission[]> = {};
    const f = filter.trim().toLowerCase();
    for (const p of permissions) {
      if (f && !(p.key.toLowerCase().includes(f) || p.description.toLowerCase().includes(f) || p.category.toLowerCase().includes(f))) {
        continue;
      }
      (groups[p.category] ??= []).push(p);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [permissions, filter]);

  const totalCount = permissions.length;
  const selectedCount = selected.size;

  const save = useMutation({
    mutationFn: () =>
      apiRequest("PUT", `/api/roles/${role!.id}/permissions`, {
        permissions: Array.from(selected),
      }).then((r) => r.json()),
    onSuccess: () => {
      toast({ title: `Saved ${selectedCount} permissions for ${role!.name}` });
      queryClient.invalidateQueries({ queryKey: ["/api/roles", role?.id, "permissions"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast({ title: e?.message ?? "Save failed", variant: "destructive" }),
  });

  function toggle(k: string) {
    if (isSystem) return;
    const next = new Set(selected);
    next.has(k) ? next.delete(k) : next.add(k);
    setSelected(next);
  }
  function toggleCategory(cat: string, perms: Permission[]) {
    if (isSystem) return;
    const allSelected = perms.every((p) => selected.has(p.key));
    const next = new Set(selected);
    for (const p of perms) {
      if (allSelected) next.delete(p.key);
      else next.add(p.key);
    }
    setSelected(next);
  }

  if (!role) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl bg-card border-border max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-bold text-white flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Permissions — {role.name}
            {isSystem && (
              <Badge variant="outline" className="ml-2 border-amber-500/30 text-amber-400 bg-amber-500/10 gap-1">
                <Lock className="h-3 w-3" /> System role (read-only)
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            {isSuperAdmin
              ? "Super Admin always has every permission. This list is informational only."
              : isSystem
                ? "The Candidate role is system-managed. Its permission set cannot be modified."
                : `Toggle permissions below. ${selectedCount}/${totalCount} selected.`}
          </DialogDescription>
        </DialogHeader>

        <div className="relative my-3">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Filter by name, description, or category…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="pl-9 bg-muted/30 border-border"
            data-testid="input-permission-filter"
          />
        </div>

        <div className="flex-1 overflow-y-auto pr-2 space-y-4">
          {loadingRolePerms ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : grouped.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">No permissions match.</p>
          ) : (
            grouped.map(([cat, perms]) => {
              const catSelected = perms.filter((p) => selected.has(p.key)).length;
              const allChecked = catSelected === perms.length;
              const someChecked = catSelected > 0 && !allChecked;
              return (
                <div key={cat} className="border border-border rounded-sm">
                  <div className="flex items-center justify-between px-3 py-2 bg-muted/20 border-b border-border">
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={allChecked || (someChecked ? "indeterminate" : false)}
                        onCheckedChange={() => toggleCategory(cat, perms)}
                        disabled={isSystem}
                        data-testid={`checkbox-cat-${cat}`}
                      />
                      <span className="text-sm font-semibold text-white uppercase tracking-wider">{cat}</span>
                      <Badge variant="outline" className="border-border text-xs text-muted-foreground">
                        {catSelected}/{perms.length}
                      </Badge>
                    </div>
                  </div>
                  <div className="divide-y divide-border">
                    {perms.map((p) => (
                      <label
                        key={p.key}
                        className={`flex items-start gap-3 px-3 py-2 hover-elevate ${isSystem ? "opacity-70 cursor-not-allowed" : "cursor-pointer"}`}
                      >
                        <Checkbox
                          checked={isSuperAdmin ? true : selected.has(p.key)}
                          onCheckedChange={() => toggle(p.key)}
                          disabled={isSystem}
                          data-testid={`checkbox-perm-${p.key}`}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white truncate">{p.description}</p>
                          <p className="text-xs text-muted-foreground font-mono mt-0.5">{p.key}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <DialogFooter className="pt-3 border-t border-border">
          <Button variant="outline" className="border-border" onClick={() => onOpenChange(false)}>
            {isSystem ? "Close" : "Cancel"}
          </Button>
          {!isSystem && (
            <Button
              className="bg-primary text-primary-foreground font-bold min-w-[140px]"
              onClick={() => save.mutate()}
              disabled={save.isPending}
              data-testid="button-save-permissions"
            >
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : `Save (${selectedCount})`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Delete-role confirm ─────────────────────────────────────────────────────
function DeleteRoleDialog({
  open,
  onOpenChange,
  role,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  role: Role | null;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const del = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/roles/${role!.id}`).then((r) => r.json()),
    onSuccess: () => {
      toast({ title: "Role deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/roles"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast({ title: e?.message ?? "Delete failed", variant: "destructive" }),
  });
  if (!role) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-display text-lg font-bold text-white">Delete "{role.name}"?</DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            This cannot be undone. If users are still assigned to this role, the deletion will be blocked.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" className="border-border" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            className="bg-red-500/90 text-white hover:bg-red-500"
            onClick={() => del.mutate()}
            disabled={del.isPending}
            data-testid="button-confirm-delete-role"
          >
            {del.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── User invite & edit (now use dynamic role list from /api/roles) ──────────
const inviteSchema = z.object({
  fullName: z.string().min(2, "Full name required"),
  email: z.string().email("Invalid email"),
  username: z.string().min(3, "ID number required"),
  roleId: z.string().min(1, "Role required"),
  businessUnitId: z.string().optional(),
  password: z.string()
    .min(8, "Min 8 characters")
    .regex(/[A-Z]/, "Must contain an uppercase letter")
    .regex(/[a-z]/, "Must contain a lowercase letter")
    .regex(/[0-9]/, "Must contain a number")
    .regex(/[^A-Za-z0-9]/, "Must contain a symbol"),
});
type InviteForm = z.infer<typeof inviteSchema>;

function InviteUserDialog({
  open,
  onOpenChange,
  businessUnits,
  assignableRoles,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  businessUnits: BusinessUnit[];
  assignableRoles: Role[];
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<InviteForm>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { fullName: "", email: "", username: "", roleId: "", businessUnitId: "", password: "" },
  });

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
                  <FormControl><Input type="email" placeholder="email@domain.com" className="bg-muted/30 border-border" {...field} data-testid="input-invite-email" /></FormControl>
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
              <FormField control={form.control} name="roleId" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Role</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="bg-muted/30 border-border" data-testid="select-invite-role">
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {assignableRoles.map((r) => (
                        <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="businessUnitId" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold flex items-center">
                    Business Unit
                    <InfoTooltip text="Not seeing the business unit? Create it first from Business Units." />
                  </FormLabel>
                  <Select onValueChange={(v) => field.onChange(v === "none" ? "" : v)} value={field.value || "none"}>
                    <FormControl>
                      <SelectTrigger className="bg-muted/30 border-border" data-testid="select-invite-bu">
                        <SelectValue placeholder="Select unit" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">No unit</SelectItem>
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

const userEditSchema = z.object({
  roleId: z.string().min(1),
  businessUnitId: z.string().optional(),
  isActive: z.boolean(),
});
type UserEditForm = z.infer<typeof userEditSchema>;

function EditUserDialog({
  open,
  onOpenChange,
  user,
  businessUnits,
  assignableRoles,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  user: AppUser | null;
  businessUnits: BusinessUnit[];
  assignableRoles: Role[];
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<UserEditForm>({
    resolver: zodResolver(userEditSchema),
    defaultValues: {
      roleId: user?.roleId ?? "",
      businessUnitId: user?.businessUnitId ?? "",
      isActive: user?.isActive ?? true,
    },
  });

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
            <FormField control={form.control} name="roleId" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Role</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="bg-muted/30 border-border" data-testid="select-edit-role">
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {assignableRoles.map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormItem>
            )} />

            <FormField control={form.control} name="businessUnitId" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Business Unit</FormLabel>
                <Select onValueChange={(v) => field.onChange(v === "none" ? "" : v)} value={field.value || "none"}>
                  <FormControl>
                    <SelectTrigger className="bg-muted/30 border-border" data-testid="select-edit-bu">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="none">No unit</SelectItem>
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

// ─── Embeddable content (used by Settings) ───────────────────────────────────
export function RolesAccessContent() {
  const [buDialogOpen, setBuDialogOpen] = useState(false);
  const [editingBu, setEditingBu] = useState<BusinessUnit | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [permEditorOpen, setPermEditorOpen] = useState(false);
  const [permEditorRole, setPermEditorRole] = useState<Role | null>(null);
  const [cloneSource, setCloneSource] = useState<Role | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null);

  const { data: businessUnits = [], isLoading: loadingBUs } = useQuery<BusinessUnit[]>({
    queryKey: ["/api/business-units"],
    queryFn: () => apiRequest("GET", "/api/business-units").then((r) => r.json()),
  });

  const { data: userList = [], isLoading: loadingUsers } = useQuery<AppUser[]>({
    queryKey: ["/api/users"],
    queryFn: () => apiRequest("GET", "/api/users").then((r) => r.json()),
  });

  const { data: roles = [], isLoading: loadingRoles } = useQuery<Role[]>({
    queryKey: ["/api/roles"],
    queryFn: () => apiRequest("GET", "/api/roles").then((r) => r.json()),
  });

  const { data: permissions = [] } = useQuery<Permission[]>({
    queryKey: ["/api/permissions"],
    queryFn: () => apiRequest("GET", "/api/permissions").then((r) => r.json()),
  });

  const buMap = Object.fromEntries(businessUnits.map((b) => [b.id, b]));
  const roleMap = Object.fromEntries(roles.map((r) => [r.id, r]));
  const assignableRoles = roles.filter((r) => !SYSTEM_ROLE_SLUGS.has(r.slug));
  const staffUsers = userList.filter((u) => {
    const r = u.roleId ? roleMap[u.roleId] : null;
    if (r) return r.slug !== "candidate";
    return u.role !== "candidate";
  });

  const userCountByRoleId = useMemo(() => {
    const m: Record<string, number> = {};
    for (const u of userList) {
      if (u.roleId) m[u.roleId] = (m[u.roleId] ?? 0) + 1;
    }
    return m;
  }, [userList]);

  return (
    <>
      <div className="space-y-6">
        <Tabs defaultValue="roles" className="w-full">
          <TabsList className="bg-card border border-border h-auto p-1 gap-1 w-full grid grid-cols-3">
            <TabsTrigger value="business-units" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary h-10 gap-2">
              <Building2 className="h-4 w-4" /> Business Units
            </TabsTrigger>
            <TabsTrigger value="roles" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary h-10 gap-2">
              <Shield className="h-4 w-4" /> Roles
            </TabsTrigger>
            <TabsTrigger value="users" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary h-10 gap-2">
              <Users className="h-4 w-4" /> Users &amp; Roles
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

          {/* ── Roles (NEW: editable) ──────────────────────────────────────── */}
          <TabsContent value="roles" className="mt-4">
            <Card className="bg-card border-border">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg font-display text-white">Roles</CardTitle>
                  <p className="text-muted-foreground text-sm mt-0.5">
                    Define custom roles and pick exactly what each one can do. System roles are locked.
                  </p>
                </div>
                <Button
                  className="bg-primary text-primary-foreground font-bold uppercase tracking-wide text-xs h-9 gap-1.5"
                  onClick={() => { setEditingRole(null); setRoleDialogOpen(true); }}
                  data-testid="button-add-role"
                >
                  <Plus className="h-4 w-4" /> New Role
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {loadingRoles ? (
                  <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                ) : roles.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <Shield className="h-12 w-12 text-muted-foreground/30 mb-4" />
                    <p className="text-muted-foreground font-medium">No roles defined</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border hover:bg-transparent">
                        <TableHead className="text-muted-foreground">Role</TableHead>
                        <TableHead className="text-muted-foreground hidden md:table-cell">Slug</TableHead>
                        <TableHead className="text-muted-foreground">Users</TableHead>
                        <TableHead className="text-muted-foreground">Type</TableHead>
                        <TableHead className="text-right text-muted-foreground">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {roles.map((r) => {
                        const isSys = SYSTEM_ROLE_SLUGS.has(r.slug);
                        const count = userCountByRoleId[r.id] ?? 0;
                        return (
                          <TableRow key={r.id} className="border-border hover:bg-muted/20" data-testid={`row-role-${r.id}`}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className={`border ${roleBadgeClass(r.color)}`}>{r.name}</Badge>
                                {isSys && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
                              </div>
                              {r.description && <p className="text-muted-foreground text-xs mt-1 truncate max-w-[300px]">{r.description}</p>}
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                              <code className="font-mono text-xs bg-muted/40 text-muted-foreground px-1.5 py-0.5 rounded">{r.slug}</code>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm text-white font-medium">{count}</span>
                            </TableCell>
                            <TableCell>
                              {isSys ? (
                                <Badge variant="outline" className="border-amber-500/30 text-amber-400 bg-amber-500/10 gap-1">
                                  <Lock className="h-3 w-3" /> System
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="border-border text-muted-foreground">Custom</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 px-2 text-xs text-muted-foreground hover:text-white gap-1"
                                  onClick={() => { setPermEditorRole(r); setPermEditorOpen(true); }}
                                  data-testid={`button-perms-${r.id}`}
                                >
                                  <Shield className="h-3.5 w-3.5" /> Permissions
                                </Button>
                                {!isSys && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 w-8 p-0 text-muted-foreground hover:text-white"
                                    onClick={() => { setEditingRole(r); setRoleDialogOpen(true); }}
                                    data-testid={`button-edit-role-${r.id}`}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 w-8 p-0 text-muted-foreground hover:text-white"
                                  onClick={() => setCloneSource(r)}
                                  data-testid={`button-clone-role-${r.id}`}
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </Button>
                                {!isSys && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 w-8 p-0 text-red-400/70 hover:text-red-400 hover:bg-red-500/10"
                                    onClick={() => setDeleteTarget(r)}
                                    data-testid={`button-delete-role-${r.id}`}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
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
                        <TableHead className="text-muted-foreground">Status</TableHead>
                        <TableHead className="text-right text-muted-foreground">Edit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {staffUsers.map((u) => {
                        const r = u.roleId ? roleMap[u.roleId] : null;
                        const bu = u.businessUnitId ? buMap[u.businessUnitId] : null;
                        return (
                          <TableRow key={u.id} className="border-border hover:bg-muted/20" data-testid={`row-user-${u.id}`}>
                            <TableCell>
                              <p className="text-white font-medium text-sm">{u.fullName ?? u.username}</p>
                              <p className="text-muted-foreground text-xs">{u.email}</p>
                            </TableCell>
                            <TableCell>
                              {r ? (
                                <Badge variant="outline" className={`border text-xs font-medium ${roleBadgeClass(r.color)}`}>
                                  {r.name}
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="border-red-500/30 text-red-400 bg-red-500/10 text-xs gap-1">
                                  <Lock className="h-3 w-3" /> No role — login blocked
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                              {bu ? (
                                <span className="text-sm text-white">{bu.name}</span>
                              ) : (
                                <span className="text-sm text-muted-foreground/50 flex items-center gap-1">
                                  <Globe className="h-3.5 w-3.5" /> All units
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={u.isActive ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10" : "border-border text-muted-foreground"}>
                                {u.isActive ? "Active" : "Inactive"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant={r ? "ghost" : "outline"}
                                className={r ? "h-8 w-8 p-0 text-muted-foreground hover:text-white" : "h-8 px-2 text-xs border-red-500/30 text-red-400 hover:bg-red-500/10"}
                                onClick={() => setEditingUser(u)}
                                data-testid={`button-edit-user-${u.id}`}
                              >
                                {r ? <Pencil className="h-3.5 w-3.5" /> : "Set role"}
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
        </Tabs>
      </div>

      {/* Dialogs */}
      <BUDialog
        open={buDialogOpen}
        onOpenChange={(v) => { setBuDialogOpen(v); if (!v) setEditingBu(null); }}
        existing={editingBu}
      />
      <RoleDialog
        open={roleDialogOpen}
        onOpenChange={(v) => { setRoleDialogOpen(v); if (!v) setEditingRole(null); }}
        existing={editingRole}
      />
      <PermissionEditorDialog
        open={permEditorOpen}
        onOpenChange={(v) => { setPermEditorOpen(v); if (!v) setPermEditorRole(null); }}
        role={permEditorRole}
        permissions={permissions}
      />
      <CloneRoleDialog
        open={!!cloneSource}
        onOpenChange={(v) => { if (!v) setCloneSource(null); }}
        source={cloneSource}
      />
      <DeleteRoleDialog
        open={!!deleteTarget}
        onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}
        role={deleteTarget}
      />
      <InviteUserDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        businessUnits={businessUnits}
        assignableRoles={assignableRoles}
      />
      <EditUserDialog
        open={!!editingUser}
        onOpenChange={(v) => { if (!v) setEditingUser(null); }}
        user={editingUser}
        businessUnits={businessUnits}
        assignableRoles={assignableRoles}
      />
    </>
  );
}

export default function RolesAccessPage() {
  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-display font-bold text-white tracking-tight flex items-center gap-3">
            <Shield className="h-8 w-8 text-primary" />
            Roles &amp; Access
          </h1>
          <p className="text-muted-foreground mt-1">Define business units, custom roles with exact permissions, and assign them to staff.</p>
        </div>
        <RolesAccessContent />
      </div>
    </DashboardLayout>
  );
}
