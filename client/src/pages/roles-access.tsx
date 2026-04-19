import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import DashboardLayout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Form, FormField, FormItem, FormLabel, FormControl, FormMessage,
} from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Shield, Building2, Users, Plus, Pencil, Loader2, Lock, Globe, UserCheck,
  Info, Trash2, Copy, Search,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatNumber } from "@/lib/format";

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
  const { t } = useTranslation(["rolesAccess"]);
  const [visible, setVisible] = useState(false);
  return (
    <span className="relative inline-flex items-center ms-1.5 normal-case">
      <button
        type="button"
        className="inline-flex items-center justify-center text-muted-foreground/50 hover:text-primary transition-colors"
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        aria-label={t("rolesAccess:common.moreInfo")}
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {visible && (
        <span className="absolute end-0 top-full mt-1.5 z-50 w-60 rounded-sm bg-popover border border-border px-3 py-2 text-xs text-muted-foreground shadow-lg leading-relaxed pointer-events-none normal-case tracking-normal font-normal">
          <span className="absolute end-1.5 bottom-full h-0 w-0 border-x-4 border-x-transparent border-b-4 border-b-border" />
          <bdi>{text}</bdi>
        </span>
      )}
    </span>
  );
}

function useBuSchema() {
  const { t } = useTranslation(["rolesAccess"]);
  return z.object({
    name: z.string().min(2, t("rolesAccess:bu.dialog.errName")),
    code: z.string().min(2, t("rolesAccess:bu.dialog.errCode")).max(20).toUpperCase(),
    description: z.string().optional(),
    contactEmail: z.string().email(t("rolesAccess:bu.dialog.errEmail")).optional().or(z.literal("")),
    isActive: z.boolean().default(true),
  });
}
type BUForm = {
  name: string;
  code: string;
  description?: string;
  contactEmail?: string;
  isActive: boolean;
};

function BUDialog({
  open,
  onOpenChange,
  existing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  existing?: BusinessUnit | null;
}) {
  const { t } = useTranslation(["rolesAccess"]);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const buSchema = useBuSchema();

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
      toast({ title: existing ? t("rolesAccess:bu.toast.updated") : t("rolesAccess:bu.toast.created") });
      queryClient.invalidateQueries({ queryKey: ["/api/business-units"] });
      form.reset();
      onOpenChange(false);
    },
    onError: () => toast({ title: t("rolesAccess:bu.toast.saveFail"), variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-bold text-white flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            {existing ? t("rolesAccess:bu.dialog.titleEdit") : t("rolesAccess:bu.dialog.titleNew")}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            {t("rolesAccess:bu.dialog.desc")}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit((d) => save.mutate(d))} className="space-y-4 pt-1">
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">{t("rolesAccess:bu.dialog.lblName")}</FormLabel>
                  <FormControl>
                    <Input placeholder={t("rolesAccess:bu.dialog.phName")} className="bg-muted/30 border-border" {...field} data-testid="input-bu-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="code" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">{t("rolesAccess:bu.dialog.lblCode")}</FormLabel>
                  <FormControl>
                    <Input placeholder={t("rolesAccess:bu.dialog.phCode")} dir="ltr" className="bg-muted/30 border-border font-mono uppercase" {...field} onChange={(e) => field.onChange(e.target.value.toUpperCase())} data-testid="input-bu-code" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="contactEmail" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">{t("rolesAccess:bu.dialog.lblEmail")}</FormLabel>
                  <FormControl>
                    <Input type="email" dir="ltr" placeholder={t("rolesAccess:bu.dialog.phEmail")} className="bg-muted/30 border-border" {...field} data-testid="input-bu-email" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">{t("rolesAccess:bu.dialog.lblDesc")}</FormLabel>
                <FormControl>
                  <Input placeholder={t("rolesAccess:bu.dialog.phDesc")} className="bg-muted/30 border-border" {...field} data-testid="input-bu-description" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" className="border-border" onClick={() => onOpenChange(false)}>{t("rolesAccess:common.cancel")}</Button>
              <Button type="submit" className="bg-primary text-primary-foreground font-bold min-w-[120px]" disabled={save.isPending} data-testid="button-save-bu">
                {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : existing ? t("rolesAccess:common.saveChanges") : t("rolesAccess:bu.dialog.btnCreate")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

const SLUG_REGEX = /^[a-z0-9_-]+$/;

function useRoleCreateSchema() {
  const { t } = useTranslation(["rolesAccess"]);
  return z.object({
    name: z.string().min(2, t("rolesAccess:roles.dialog.errName")).max(100),
    slug: z.string()
      .min(2, t("rolesAccess:roles.dialog.errSlugLen"))
      .max(64, t("rolesAccess:roles.dialog.errSlugLen"))
      .regex(SLUG_REGEX, t("rolesAccess:roles.dialog.errSlugChars")),
    description: z.string().max(500).optional(),
    color: z.string().optional(),
  });
}
function useRoleEditSchema() {
  const { t } = useTranslation(["rolesAccess"]);
  return z.object({
    name: z.string().min(2, t("rolesAccess:roles.dialog.errName")).max(100),
    description: z.string().max(500).optional(),
    color: z.string().optional(),
  });
}
type RoleCreateForm = {
  name: string;
  slug: string;
  description?: string;
  color?: string;
};
type RoleEditForm = {
  name: string;
  description?: string;
  color?: string;
};

// Canonical slug generator. Keeps underscore as the join character to remain
// consistent with the existing system slugs (super_admin, candidate, …) that
// are already persisted in the database. Output is guaranteed to satisfy
// SLUG_REGEX or be the empty string (when the input has no Latin
// alphanumerics, e.g. pure Arabic names).
function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64)
    .replace(/_+$/g, "");
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
  const { t } = useTranslation(["rolesAccess"]);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createSchema = useRoleCreateSchema();
  const editSchema = useRoleEditSchema();
  const isEdit = !!existing;
  const form = useForm<RoleCreateForm>({
    resolver: zodResolver(isEdit ? (editSchema as unknown as typeof createSchema) : createSchema),
    defaultValues: existing
      ? { name: existing.name, slug: existing.slug, description: existing.description ?? "", color: existing.color ?? "slate" }
      : { name: "", slug: "", description: "", color: "blue" },
  });
  // Tracks the slug value most recently auto-generated from the name field.
  // Auto-sync re-engages whenever the slug input is empty OR still matches the
  // last value we wrote (so the user can clear the slug to resume sync).
  const lastAutoSlug = useRef<string>("");

  const save = useMutation({
    mutationFn: async (data: RoleCreateForm | RoleEditForm) => {
      if (existing) {
        const { name, description, color } = data as RoleEditForm;
        return apiRequest("PATCH", `/api/roles/${existing.id}`, { name, description, color }).then((r) => r.json());
      }
      return apiRequest("POST", "/api/roles", data).then((r) => r.json());
    },
    onSuccess: () => {
      toast({ title: existing ? t("rolesAccess:roles.toast.updated") : t("rolesAccess:roles.toast.created") });
      queryClient.invalidateQueries({ queryKey: ["/api/roles"] });
      form.reset();
      onOpenChange(false);
    },
    onError: (e: { message?: string }) => toast({ title: e?.message ?? t("rolesAccess:roles.toast.saveFail"), variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-bold text-white flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            {existing ? t("rolesAccess:roles.dialog.titleEdit") : t("rolesAccess:roles.dialog.titleNew")}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            {existing ? t("rolesAccess:roles.dialog.descEdit") : t("rolesAccess:roles.dialog.descNew")}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((d) => save.mutate(d))} className="space-y-4 pt-1">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">{t("rolesAccess:roles.dialog.lblName")}</FormLabel>
                <FormControl>
                  <Input
                    placeholder={t("rolesAccess:roles.dialog.phName")}
                    className="bg-muted/30 border-border"
                    {...field}
                    onChange={(e) => {
                      field.onChange(e);
                      if (!existing) {
                        const currentSlug = form.getValues("slug") ?? "";
                        const userOwnsSlug =
                          currentSlug.length > 0 && currentSlug !== lastAutoSlug.current;
                        if (!userOwnsSlug) {
                          const next = slugify(e.target.value);
                          // Don't overwrite an empty slug field with another
                          // empty value (happens for pure non-Latin input);
                          // leave the field blank so the user enters one.
                          if (next.length > 0 || currentSlug.length > 0) {
                            form.setValue("slug", next, { shouldValidate: false, shouldDirty: false });
                            lastAutoSlug.current = next;
                          }
                        }
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
                  <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">{t("rolesAccess:roles.dialog.lblSlug")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("rolesAccess:roles.dialog.phSlug")}
                      dir="ltr"
                      className="bg-muted/30 border-border font-mono lowercase"
                      {...field}
                      onChange={(e) => {
                        // Once the user edits the slug to anything other than
                        // the last auto value, treat it as user-owned so name
                        // changes stop overwriting it. Clearing the field
                        // re-engages auto-sync on the next name keystroke.
                        field.onChange(e);
                      }}
                      data-testid="input-role-slug"
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground" data-testid="text-role-slug-hint">
                    {t("rolesAccess:roles.dialog.slugHint")}
                  </p>
                  <FormMessage />
                </FormItem>
              )} />
            )}
            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">{t("rolesAccess:roles.dialog.lblDesc")}</FormLabel>
                <FormControl>
                  <Input placeholder={t("rolesAccess:roles.dialog.phDesc")} className="bg-muted/30 border-border" {...field} data-testid="input-role-description" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="color" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">{t("rolesAccess:roles.dialog.lblColor")}</FormLabel>
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
              <Button type="button" variant="outline" className="border-border" onClick={() => onOpenChange(false)}>{t("rolesAccess:common.cancel")}</Button>
              <Button type="submit" className="bg-primary text-primary-foreground font-bold min-w-[110px]" disabled={save.isPending} data-testid="button-save-role">
                {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : existing ? t("rolesAccess:common.save") : t("rolesAccess:roles.dialog.btnCreate")}
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
  const { t } = useTranslation(["rolesAccess"]);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");

  const clone = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/roles/${source!.id}/clone`, { name, slug }).then((r) => r.json()),
    onSuccess: () => {
      toast({ title: t("rolesAccess:roles.toast.cloned") });
      queryClient.invalidateQueries({ queryKey: ["/api/roles"] });
      onOpenChange(false);
      setName("");
      setSlug("");
    },
    onError: (e: { message?: string }) => toast({ title: e?.message ?? t("rolesAccess:roles.toast.cloneFail"), variant: "destructive" }),
  });

  if (!source) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-display text-lg font-bold text-white"><bdi>{t("rolesAccess:roles.clone.title", { name: source.name })}</bdi></DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            {t("rolesAccess:roles.clone.desc")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div>
            <label className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">{t("rolesAccess:roles.clone.lblName")}</label>
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSlug(slugify(e.target.value));
              }}
              placeholder={t("rolesAccess:roles.clone.phName", { name: source.name })}
              className="bg-muted/30 border-border mt-1"
              data-testid="input-clone-name"
            />
          </div>
          <div>
            <label className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">{t("rolesAccess:roles.clone.lblSlug")}</label>
            <Input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder={t("rolesAccess:roles.clone.phSlug", { slug: source.slug })}
              dir="ltr"
              className="bg-muted/30 border-border font-mono mt-1"
              data-testid="input-clone-slug"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="border-border" onClick={() => onOpenChange(false)}>{t("rolesAccess:common.cancel")}</Button>
          <Button
            className="bg-primary text-primary-foreground font-bold min-w-[110px]"
            disabled={!name || !slug || clone.isPending}
            onClick={() => clone.mutate()}
            data-testid="button-confirm-clone"
          >
            {clone.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("rolesAccess:roles.clone.btn")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
  const { t, i18n } = useTranslation(["rolesAccess"]);
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
      toast({ title: t("rolesAccess:perms.toast.saved", { n: formatNumber(selectedCount, i18n.language), name: role!.name }) });
      queryClient.invalidateQueries({ queryKey: ["/api/roles", role?.id, "permissions"] });
      onOpenChange(false);
    },
    onError: (e: { message?: string }) => toast({ title: e?.message ?? t("rolesAccess:perms.toast.saveFail"), variant: "destructive" }),
  });

  function toggle(k: string) {
    if (isSystem) return;
    const next = new Set(selected);
    if (next.has(k)) next.delete(k); else next.add(k);
    setSelected(next);
  }
  function toggleCategory(_cat: string, perms: Permission[]) {
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
            <bdi>{t("rolesAccess:perms.title", { name: role.name })}</bdi>
            {isSystem && (
              <Badge variant="outline" className="ms-2 border-amber-500/30 text-amber-400 bg-amber-500/10 gap-1">
                <Lock className="h-3 w-3" /> {t("rolesAccess:perms.systemBadge")}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            {isSuperAdmin
              ? t("rolesAccess:perms.descSuper")
              : isSystem
                ? t("rolesAccess:perms.descSystem")
                : t("rolesAccess:perms.descNormal", { selected: formatNumber(selectedCount, i18n.language), total: formatNumber(totalCount, i18n.language) })}
          </DialogDescription>
        </DialogHeader>

        <div className="relative my-3">
          <Search className="h-4 w-4 absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("rolesAccess:common.filterPh")}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="ps-9 bg-muted/30 border-border"
            data-testid="input-permission-filter"
          />
        </div>

        <div className="flex-1 overflow-y-auto pe-2 space-y-4">
          {loadingRolePerms ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : grouped.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">{t("rolesAccess:perms.noMatches")}</p>
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
                      <span className="text-sm font-semibold text-white uppercase tracking-wider"><bdi>{cat}</bdi></span>
                      <Badge variant="outline" className="border-border text-xs text-muted-foreground" dir="ltr">
                        {formatNumber(catSelected, i18n.language)}/{formatNumber(perms.length, i18n.language)}
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
                          <p className="text-sm text-white truncate"><bdi>{p.description}</bdi></p>
                          <p className="text-xs text-muted-foreground font-mono mt-0.5" dir="ltr">{p.key}</p>
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
            {isSystem ? t("rolesAccess:common.close") : t("rolesAccess:common.cancel")}
          </Button>
          {!isSystem && (
            <Button
              className="bg-primary text-primary-foreground font-bold min-w-[140px]"
              onClick={() => save.mutate()}
              disabled={save.isPending}
              data-testid="button-save-permissions"
            >
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("rolesAccess:perms.btnSave", { n: formatNumber(selectedCount, i18n.language) })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteRoleDialog({
  open,
  onOpenChange,
  role,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  role: Role | null;
}) {
  const { t } = useTranslation(["rolesAccess"]);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const del = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/roles/${role!.id}`).then((r) => r.json()),
    onSuccess: () => {
      toast({ title: t("rolesAccess:roles.toast.deleted") });
      queryClient.invalidateQueries({ queryKey: ["/api/roles"] });
      onOpenChange(false);
    },
    onError: (e: { message?: string }) => toast({ title: e?.message ?? t("rolesAccess:roles.toast.deleteFail"), variant: "destructive" }),
  });
  if (!role) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-display text-lg font-bold text-white"><bdi>{t("rolesAccess:roles.delete.title", { name: role.name })}</bdi></DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            {t("rolesAccess:roles.delete.desc")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" className="border-border" onClick={() => onOpenChange(false)}>{t("rolesAccess:common.cancel")}</Button>
          <Button
            className="bg-red-500/90 text-white hover:bg-red-500"
            onClick={() => del.mutate()}
            disabled={del.isPending}
            data-testid="button-confirm-delete-role"
          >
            {del.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("rolesAccess:common.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function useInviteSchema() {
  const { t } = useTranslation(["rolesAccess"]);
  return z.object({
    fullName: z.string().min(2, t("rolesAccess:users.invite.err.name")),
    email: z.string().email(t("rolesAccess:users.invite.err.email")),
    username: z.string().min(3, t("rolesAccess:users.invite.err.id")),
    roleId: z.string().min(1, t("rolesAccess:users.invite.err.role")),
    businessUnitId: z.string().optional(),
    password: z.string()
      .min(8, t("rolesAccess:users.invite.err.pwMin"))
      .regex(/[A-Z]/, t("rolesAccess:users.invite.err.pwUpper"))
      .regex(/[a-z]/, t("rolesAccess:users.invite.err.pwLower"))
      .regex(/[0-9]/, t("rolesAccess:users.invite.err.pwNum"))
      .regex(/[^A-Za-z0-9]/, t("rolesAccess:users.invite.err.pwSym")),
  });
}
type InviteForm = {
  fullName: string;
  email: string;
  username: string;
  roleId: string;
  businessUnitId?: string;
  password: string;
};

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
  const { t } = useTranslation(["rolesAccess"]);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const inviteSchema = useInviteSchema();

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
      toast({ title: t("rolesAccess:users.toast.created"), description: t("rolesAccess:users.toast.createdDesc") });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      form.reset();
      onOpenChange(false);
    },
    onError: () => toast({ title: t("rolesAccess:users.toast.createFail"), variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-bold text-white flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-primary" />
            {t("rolesAccess:users.invite.title")}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            {t("rolesAccess:users.invite.desc")}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit((d) => create.mutate(d))} className="space-y-4 pt-1">
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="fullName" render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">{t("rolesAccess:users.invite.lblName")}</FormLabel>
                  <FormControl><Input placeholder={t("rolesAccess:users.invite.phName")} className="bg-muted/30 border-border" {...field} data-testid="input-invite-name" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">{t("rolesAccess:users.invite.lblEmail")}</FormLabel>
                  <FormControl><Input type="email" dir="ltr" placeholder={t("rolesAccess:users.invite.phEmail")} className="bg-muted/30 border-border" {...field} data-testid="input-invite-email" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="username" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">{t("rolesAccess:users.invite.lblId")}</FormLabel>
                  <FormControl><Input dir="ltr" placeholder={t("rolesAccess:users.invite.phId")} className="bg-muted/30 border-border" {...field} data-testid="input-invite-username" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="roleId" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">{t("rolesAccess:users.invite.lblRole")}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="bg-muted/30 border-border" data-testid="select-invite-role">
                        <SelectValue placeholder={t("rolesAccess:users.invite.phRole")} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {assignableRoles.map((r) => (
                        <SelectItem key={r.id} value={r.id}><bdi>{r.name}</bdi></SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="businessUnitId" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold flex items-center">
                    {t("rolesAccess:users.invite.lblBu")}
                    <InfoTooltip text={t("rolesAccess:users.invite.buHint")} />
                  </FormLabel>
                  <Select onValueChange={(v) => field.onChange(v === "none" ? "" : v)} value={field.value || "none"}>
                    <FormControl>
                      <SelectTrigger className="bg-muted/30 border-border" data-testid="select-invite-bu">
                        <SelectValue placeholder={t("rolesAccess:users.invite.phBu")} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">{t("rolesAccess:common.noUnit")}</SelectItem>
                      {businessUnits.filter((b) => b.isActive).map((bu) => (
                        <SelectItem key={bu.id} value={bu.id}><bdi>{bu.name}</bdi></SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="password" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">{t("rolesAccess:users.invite.lblPassword")}</FormLabel>
                <FormControl><Input type="password" placeholder={t("rolesAccess:users.invite.phPassword")} className="bg-muted/30 border-border" {...field} data-testid="input-invite-password" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" className="border-border" onClick={() => onOpenChange(false)}>{t("rolesAccess:common.cancel")}</Button>
              <Button type="submit" className="bg-primary text-primary-foreground font-bold min-w-[120px]" disabled={create.isPending} data-testid="button-submit-invite">
                {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("rolesAccess:users.invite.btnCreate")}
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
  const { t } = useTranslation(["rolesAccess"]);
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
      toast({ title: t("rolesAccess:users.toast.updated") });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      onOpenChange(false);
    },
    onError: () => toast({ title: t("rolesAccess:users.toast.updateFail"), variant: "destructive" }),
  });

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-display text-lg font-bold text-white">{t("rolesAccess:users.edit.title")}</DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm"><bdi>{user.fullName ?? user.email}</bdi></DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit((d) => save.mutate(d))} className="space-y-4 pt-1">
            <FormField control={form.control} name="roleId" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">{t("rolesAccess:users.invite.lblRole")}</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="bg-muted/30 border-border" data-testid="select-edit-role">
                      <SelectValue placeholder={t("rolesAccess:users.invite.phRole")} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {assignableRoles.map((r) => (
                      <SelectItem key={r.id} value={r.id}><bdi>{r.name}</bdi></SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormItem>
            )} />

            <FormField control={form.control} name="businessUnitId" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">{t("rolesAccess:users.invite.lblBu")}</FormLabel>
                <Select onValueChange={(v) => field.onChange(v === "none" ? "" : v)} value={field.value || "none"}>
                  <FormControl>
                    <SelectTrigger className="bg-muted/30 border-border" data-testid="select-edit-bu">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="none">{t("rolesAccess:common.noUnit")}</SelectItem>
                    {businessUnits.filter((b) => b.isActive).map((bu) => (
                      <SelectItem key={bu.id} value={bu.id}><bdi>{bu.name}</bdi></SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormItem>
            )} />

            <FormField control={form.control} name="isActive" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">{t("rolesAccess:users.h.status")}</FormLabel>
                <Select onValueChange={(v) => field.onChange(v === "true")} value={String(field.value)}>
                  <FormControl>
                    <SelectTrigger className="bg-muted/30 border-border" data-testid="select-edit-status">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="true">{t("rolesAccess:common.active")}</SelectItem>
                    <SelectItem value="false">{t("rolesAccess:common.deactivated")}</SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            )} />

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" className="border-border" onClick={() => onOpenChange(false)}>{t("rolesAccess:common.cancel")}</Button>
              <Button type="submit" className="bg-primary text-primary-foreground font-bold min-w-[110px]" disabled={save.isPending} data-testid="button-save-user">
                {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("rolesAccess:common.save")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export function RolesAccessContent() {
  const { t, i18n } = useTranslation(["rolesAccess"]);
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
              <Building2 className="h-4 w-4" /> {t("rolesAccess:tabs.businessUnits")}
            </TabsTrigger>
            <TabsTrigger value="roles" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary h-10 gap-2">
              <Shield className="h-4 w-4" /> {t("rolesAccess:tabs.roles")}
            </TabsTrigger>
            <TabsTrigger value="users" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary h-10 gap-2">
              <Users className="h-4 w-4" /> {t("rolesAccess:tabs.users")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="business-units" className="mt-4">
            <Card className="bg-card border-border">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg font-display text-white">{t("rolesAccess:bu.headerTitle")}</CardTitle>
                  <p className="text-muted-foreground text-sm mt-0.5">{t("rolesAccess:bu.headerSubtitle")}</p>
                </div>
                <Button
                  className="bg-primary text-primary-foreground font-bold uppercase tracking-wide text-xs h-9 gap-1.5"
                  onClick={() => { setEditingBu(null); setBuDialogOpen(true); }}
                  data-testid="button-add-bu"
                >
                  <Plus className="h-4 w-4" /> {t("rolesAccess:bu.btnAdd")}
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {loadingBUs ? (
                  <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                ) : businessUnits.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                    <Building2 className="h-12 w-12 text-muted-foreground/30 mb-4" />
                    <p className="text-muted-foreground font-medium">{t("rolesAccess:bu.empty")}</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border hover:bg-transparent">
                        <TableHead className="text-muted-foreground">{t("rolesAccess:bu.h.unit")}</TableHead>
                        <TableHead className="text-muted-foreground hidden md:table-cell">{t("rolesAccess:bu.h.code")}</TableHead>
                        <TableHead className="text-muted-foreground hidden md:table-cell">{t("rolesAccess:bu.h.contact")}</TableHead>
                        <TableHead className="text-muted-foreground">{t("rolesAccess:bu.h.users")}</TableHead>
                        <TableHead className="text-muted-foreground">{t("rolesAccess:bu.h.status")}</TableHead>
                        <TableHead className="text-end text-muted-foreground">{t("rolesAccess:bu.h.action")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {businessUnits.map((bu) => {
                        const userCount = staffUsers.filter((u) => u.businessUnitId === bu.id).length;
                        return (
                          <TableRow key={bu.id} className="border-border hover:bg-muted/20" data-testid={`row-bu-${bu.id}`}>
                            <TableCell>
                              <p className="text-white font-medium text-sm"><bdi>{bu.name}</bdi></p>
                              {bu.description && <p className="text-muted-foreground text-xs mt-0.5 truncate max-w-[200px]"><bdi>{bu.description}</bdi></p>}
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                              <code className="font-mono text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded" dir="ltr">{bu.code}</code>
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                              <span className="text-sm text-muted-foreground" dir="ltr">{bu.contactEmail ?? "—"}</span>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm text-white font-medium" dir="ltr">{formatNumber(userCount, i18n.language)}</span>
                              <span className="text-xs text-muted-foreground ms-1">{t("rolesAccess:common.staff")}</span>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={bu.isActive ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10" : "border-border text-muted-foreground"}>
                                {bu.isActive ? t("rolesAccess:common.active") : t("rolesAccess:common.inactive")}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-end">
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

          <TabsContent value="roles" className="mt-4">
            <Card className="bg-card border-border">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg font-display text-white">{t("rolesAccess:roles.headerTitle")}</CardTitle>
                  <p className="text-muted-foreground text-sm mt-0.5">
                    {t("rolesAccess:roles.headerSubtitle")}
                  </p>
                </div>
                <Button
                  className="bg-primary text-primary-foreground font-bold uppercase tracking-wide text-xs h-9 gap-1.5"
                  onClick={() => { setEditingRole(null); setRoleDialogOpen(true); }}
                  data-testid="button-add-role"
                >
                  <Plus className="h-4 w-4" /> {t("rolesAccess:roles.btnAdd")}
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {loadingRoles ? (
                  <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                ) : roles.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <Shield className="h-12 w-12 text-muted-foreground/30 mb-4" />
                    <p className="text-muted-foreground font-medium">{t("rolesAccess:roles.empty")}</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border hover:bg-transparent">
                        <TableHead className="text-muted-foreground">{t("rolesAccess:roles.h.role")}</TableHead>
                        <TableHead className="text-muted-foreground hidden md:table-cell">{t("rolesAccess:roles.h.slug")}</TableHead>
                        <TableHead className="text-muted-foreground">{t("rolesAccess:roles.h.users")}</TableHead>
                        <TableHead className="text-muted-foreground">{t("rolesAccess:roles.h.type")}</TableHead>
                        <TableHead className="text-end text-muted-foreground">{t("rolesAccess:roles.h.actions")}</TableHead>
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
                                <Badge variant="outline" className={`border ${roleBadgeClass(r.color)}`}><bdi>{r.name}</bdi></Badge>
                                {isSys && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
                              </div>
                              {r.description && <p className="text-muted-foreground text-xs mt-1 truncate max-w-[300px]"><bdi>{r.description}</bdi></p>}
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                              <code className="font-mono text-xs bg-muted/40 text-muted-foreground px-1.5 py-0.5 rounded" dir="ltr">{r.slug}</code>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm text-white font-medium" dir="ltr">{formatNumber(count, i18n.language)}</span>
                            </TableCell>
                            <TableCell>
                              {isSys ? (
                                <Badge variant="outline" className="border-amber-500/30 text-amber-400 bg-amber-500/10 gap-1">
                                  <Lock className="h-3 w-3" /> {t("rolesAccess:common.system")}
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="border-border text-muted-foreground">{t("rolesAccess:common.custom")}</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-end">
                              <div className="flex justify-end gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 px-2 text-xs text-muted-foreground hover:text-white gap-1"
                                  onClick={() => { setPermEditorRole(r); setPermEditorOpen(true); }}
                                  data-testid={`button-perms-${r.id}`}
                                >
                                  <Shield className="h-3.5 w-3.5" /> {t("rolesAccess:roles.btnPermissions")}
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

          <TabsContent value="users" className="mt-4">
            <Card className="bg-card border-border">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg font-display text-white">{t("rolesAccess:users.headerTitle")}</CardTitle>
                  <p className="text-muted-foreground text-sm mt-0.5">{t("rolesAccess:users.headerSubtitle")}</p>
                </div>
                <Button
                  className="bg-primary text-primary-foreground font-bold uppercase tracking-wide text-xs h-9 gap-1.5"
                  onClick={() => setInviteOpen(true)}
                  data-testid="button-invite-user"
                >
                  <Plus className="h-4 w-4" /> {t("rolesAccess:users.btnInvite")}
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {loadingUsers ? (
                  <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                ) : staffUsers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <Users className="h-12 w-12 text-muted-foreground/30 mb-4" />
                    <p className="text-muted-foreground font-medium">{t("rolesAccess:users.empty")}</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border hover:bg-transparent">
                        <TableHead className="text-muted-foreground">{t("rolesAccess:users.h.user")}</TableHead>
                        <TableHead className="text-muted-foreground">{t("rolesAccess:users.h.role")}</TableHead>
                        <TableHead className="text-muted-foreground hidden md:table-cell">{t("rolesAccess:users.h.bu")}</TableHead>
                        <TableHead className="text-muted-foreground">{t("rolesAccess:users.h.status")}</TableHead>
                        <TableHead className="text-end text-muted-foreground">{t("rolesAccess:users.h.edit")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {staffUsers.map((u) => {
                        const r = u.roleId ? roleMap[u.roleId] : null;
                        const bu = u.businessUnitId ? buMap[u.businessUnitId] : null;
                        return (
                          <TableRow key={u.id} className="border-border hover:bg-muted/20" data-testid={`row-user-${u.id}`}>
                            <TableCell>
                              <p className="text-white font-medium text-sm"><bdi>{u.fullName ?? u.username}</bdi></p>
                              <p className="text-muted-foreground text-xs" dir="ltr">{u.email}</p>
                            </TableCell>
                            <TableCell>
                              {r ? (
                                <Badge variant="outline" className={`border text-xs font-medium ${roleBadgeClass(r.color)}`}>
                                  <bdi>{r.name}</bdi>
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="border-red-500/30 text-red-400 bg-red-500/10 text-xs gap-1">
                                  <Lock className="h-3 w-3" /> {t("rolesAccess:users.noRole")}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                              {bu ? (
                                <span className="text-sm text-white"><bdi>{bu.name}</bdi></span>
                              ) : (
                                <span className="text-sm text-muted-foreground/50 flex items-center gap-1">
                                  <Globe className="h-3.5 w-3.5" /> {t("rolesAccess:common.allUnits")}
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={u.isActive ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10" : "border-border text-muted-foreground"}>
                                {u.isActive ? t("rolesAccess:common.active") : t("rolesAccess:common.inactive")}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-end">
                              <Button
                                size="sm"
                                variant={r ? "ghost" : "outline"}
                                className={r ? "h-8 w-8 p-0 text-muted-foreground hover:text-white" : "h-8 px-2 text-xs border-red-500/30 text-red-400 hover:bg-red-500/10"}
                                onClick={() => setEditingUser(u)}
                                data-testid={`button-edit-user-${u.id}`}
                              >
                                {r ? <Pencil className="h-3.5 w-3.5" /> : t("rolesAccess:users.btnSetRole")}
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
  const { t } = useTranslation(["rolesAccess"]);
  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-display font-bold text-white tracking-tight flex items-center gap-3">
            <Shield className="h-8 w-8 text-primary" />
            {t("rolesAccess:page.title")}
          </h1>
          <p className="text-muted-foreground mt-1">{t("rolesAccess:page.subtitle")}</p>
        </div>
        <RolesAccessContent />
      </div>
    </DashboardLayout>
  );
}
