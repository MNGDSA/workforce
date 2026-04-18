import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { formatNumber } from "@/lib/format";
import DashboardLayout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  MapPin,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Navigation,
  Circle,
  ToggleLeft,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useRef } from "react";

type GeofenceZone = {
  id: string;
  name: string;
  centerLat: string;
  centerLng: string;
  radiusMeters: number;
  polygon: unknown;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

function ZoneMap({ zones, selectedId, onSelect }: { zones: GeofenceZone[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const layersRef = useRef<any[]>([]);

  useEffect(() => {
    if (!mapRef.current) return;

    let L: any;
    let cancelled = false;
    const init = async () => {
      L = await import("leaflet");
      await import("leaflet/dist/leaflet.css");

      if (cancelled || !mapRef.current || !mapRef.current.isConnected) return;

      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }

      const center = zones.length > 0
        ? [Number(zones[0].centerLat), Number(zones[0].centerLng)]
        : [21.4225, 39.8262];

      const map = L.map(mapRef.current, {
        center,
        zoom: 14,
        scrollWheelZoom: true,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);

      mapInstanceRef.current = map;

      layersRef.current = [];
      zones.forEach(zone => {
        const lat = Number(zone.centerLat);
        const lng = Number(zone.centerLng);
        const isSelected = zone.id === selectedId;

        const circle = L.circle([lat, lng], {
          radius: zone.radiusMeters,
          color: zone.isActive ? (isSelected ? "#16a34a" : "#22c55e") : "#6b7280",
          fillColor: zone.isActive ? (isSelected ? "#16a34a" : "#22c55e") : "#6b7280",
          fillOpacity: isSelected ? 0.25 : 0.12,
          weight: isSelected ? 3 : 1.5,
        }).addTo(map);

        circle.on("click", () => onSelect(zone.id));

        const marker = L.circleMarker([lat, lng], {
          radius: 6,
          color: "#fff",
          fillColor: zone.isActive ? "#16a34a" : "#6b7280",
          fillOpacity: 1,
          weight: 2,
        }).addTo(map);

        marker.bindTooltip(zone.name, { permanent: false, direction: "top", offset: [0, -10] });
        marker.on("click", () => onSelect(zone.id));

        layersRef.current.push(circle, marker);
      });

      if (zones.length > 0) {
        const group = L.featureGroup(layersRef.current);
        map.fitBounds(group.getBounds().pad(0.2));
      }
    };

    init();

    return () => {
      cancelled = true;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [zones, selectedId, onSelect]);

  return (
    <div
      ref={mapRef}
      className="w-full h-[400px] rounded-lg border border-border overflow-hidden [&_.leaflet-pane]:!z-[1] [&_.leaflet-control]:!z-[2]"
      data-testid="geofence-map"
    />
  );
}

function ZoneFormDialog({
  open,
  onOpenChange,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: GeofenceZone | null;
  onSaved: () => void;
}) {
  const { t } = useTranslation(["geofences", "common"]);
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    centerLat: initial?.centerLat ?? "21.4225",
    centerLng: initial?.centerLng ?? "39.8262",
    radiusMeters: initial?.radiusMeters ?? 500,
    isActive: initial?.isActive ?? true,
  });

  useEffect(() => {
    setForm({
      name: initial?.name ?? "",
      centerLat: initial?.centerLat ?? "21.4225",
      centerLng: initial?.centerLng ?? "39.8262",
      radiusMeters: initial?.radiusMeters ?? 500,
      isActive: initial?.isActive ?? true,
    });
  }, [initial, open]);

  const mutation = useMutation({
    mutationFn: (data: typeof form) => {
      if (initial) return apiRequest("PATCH", `/api/geofence-zones/${initial.id}`, data).then(r => r.json());
      return apiRequest("POST", "/api/geofence-zones", data).then(r => r.json());
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/geofence-zones"] });
      toast({ title: initial ? t("geofences:toasts.updated") : t("geofences:toasts.created") });
      onSaved();
      onOpenChange(false);
    },
    onError: (e: Error) => toast({ title: t("geofences:toasts.errorTitle"), description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border text-foreground max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? t("geofences:form.editTitle") : t("geofences:form.newTitle")}</DialogTitle>
          <DialogDescription className="sr-only">{t("geofences:form.description")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-zinc-400 text-xs uppercase tracking-wider">{t("geofences:form.zoneName")}</Label>
            <Input
              data-testid="input-zone-name"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder={t("geofences:form.namePlaceholder")}
              className="bg-background border-input text-foreground"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs uppercase tracking-wider">{t("geofences:form.centerLat")}</Label>
              <Input
                data-testid="input-zone-lat"
                type="number"
                step="0.0000001"
                value={form.centerLat}
                onChange={e => setForm(f => ({ ...f, centerLat: e.target.value }))}
                className="bg-background border-input text-foreground font-mono"
                dir="ltr"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs uppercase tracking-wider">{t("geofences:form.centerLng")}</Label>
              <Input
                data-testid="input-zone-lng"
                type="number"
                step="0.0000001"
                value={form.centerLng}
                onChange={e => setForm(f => ({ ...f, centerLng: e.target.value }))}
                className="bg-background border-input text-foreground font-mono"
                dir="ltr"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-zinc-400 text-xs uppercase tracking-wider">{t("geofences:form.radius")}</Label>
            <Input
              data-testid="input-zone-radius"
              type="number"
              min={50}
              max={10000}
              value={form.radiusMeters}
              onChange={e => setForm(f => ({ ...f, radiusMeters: Number(e.target.value) }))}
              className="bg-background border-input text-foreground"
              dir="ltr"
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-zinc-400 text-xs uppercase tracking-wider">{t("geofences:form.active")}</Label>
            <Switch
              data-testid="switch-zone-active"
              checked={form.isActive}
              onCheckedChange={v => setForm(f => ({ ...f, isActive: v }))}
            />
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" className="border-zinc-700" onClick={() => onOpenChange(false)}>{t("geofences:form.cancel")}</Button>
            <Button
              data-testid="button-save-zone"
              className="bg-[hsl(155,45%,45%)] hover:bg-[hsl(155,45%,38%)] text-white"
              disabled={mutation.isPending || !form.name}
              onClick={() => mutation.mutate(form)}
            >
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin me-1" /> : null}
              {initial ? t("geofences:form.save") : t("geofences:form.create")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function GeofencesPage() {
  const { t, i18n } = useTranslation(["geofences", "common"]);
  const { toast } = useToast();
  const qc = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editZone, setEditZone] = useState<GeofenceZone | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: zones = [], isLoading } = useQuery<GeofenceZone[]>({
    queryKey: ["/api/geofence-zones"],
    queryFn: () => apiRequest("GET", "/api/geofence-zones?includeInactive=true").then(r => r.json()),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/geofence-zones/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/geofence-zones"] });
      toast({ title: t("geofences:toasts.deleted") });
    },
    onError: (e: Error) => toast({ title: t("geofences:toasts.errorTitle"), description: e.message, variant: "destructive" }),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiRequest("PATCH", `/api/geofence-zones/${id}`, { isActive }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/geofence-zones"] });
      toast({ title: t("geofences:toasts.statusUpdated") });
    },
    onError: (e: Error) => toast({ title: t("geofences:toasts.errorTitle"), description: e.message, variant: "destructive" }),
  });

  const selectedZone = zones.find(z => z.id === selectedId) ?? null;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground" data-testid="text-geofences-title">
              {t("geofences:title")}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t("geofences:subtitle")}
            </p>
          </div>
          <Button
            data-testid="button-add-zone"
            className="bg-[hsl(155,45%,45%)] hover:bg-[hsl(155,45%,38%)] text-white"
            onClick={() => { setEditZone(null); setFormOpen(true); }}
          >
            <Plus className="h-4 w-4 me-1" /> {t("geofences:addZone")}
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2">
              <Card className="bg-card border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Navigation className="h-4 w-4 text-primary" /> {t("geofences:mapView")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ZoneMap zones={zones} selectedId={selectedId} onSelect={setSelectedId} />
                </CardContent>
              </Card>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" />
                <bdi>{t("geofences:zones", { count: zones.length })}</bdi>
              </h3>

              {zones.length === 0 ? (
                <Card className="bg-card border-border">
                  <CardContent className="py-8 text-center">
                    <MapPin className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">{t("geofences:noZones")}</p>
                  </CardContent>
                </Card>
              ) : (
                zones.map(zone => (
                  <Card
                    key={zone.id}
                    data-testid={`card-zone-${zone.id}`}
                    className={`bg-card border-border cursor-pointer transition-all hover:border-primary/30 ${selectedId === zone.id ? "ring-1 ring-primary/40" : ""}`}
                    onClick={() => setSelectedId(zone.id === selectedId ? null : zone.id)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-semibold text-foreground truncate"><bdi>{zone.name}</bdi></span>
                            <Badge
                              variant="outline"
                              className={`text-[10px] shrink-0 ${zone.isActive ? "text-emerald-400 border-emerald-500/30" : "text-zinc-500 border-zinc-600"}`}
                            >
                              {zone.isActive ? t("geofences:active") : t("geofences:inactive")}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                            <span className="font-mono" dir="ltr">{Number(zone.centerLat).toFixed(4)}°, {Number(zone.centerLng).toFixed(4)}°</span>
                            <span>·</span>
                            <span className="flex items-center gap-0.5">
                              <Circle className="h-2.5 w-2.5" /> <bdi>{t("geofences:metersShort", { count: zone.radiusMeters })}</bdi>
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 ms-2">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            onClick={e => { e.stopPropagation(); toggleMut.mutate({ id: zone.id, isActive: !zone.isActive }); }}
                            data-testid={`button-toggle-zone-${zone.id}`}
                          >
                            <ToggleLeft className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            onClick={e => { e.stopPropagation(); setEditZone(zone); setFormOpen(true); }}
                            data-testid={`button-edit-zone-${zone.id}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-red-400 hover:text-red-300"
                            onClick={e => { e.stopPropagation(); deleteMut.mutate(zone.id); }}
                            data-testid={`button-delete-zone-${zone.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}

              {selectedZone && (
                <Card className="bg-card border-primary/20 mt-4">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-primary">{t("geofences:zoneDetails")}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("geofences:fields.name")}</span>
                      <span className="text-foreground font-medium"><bdi>{selectedZone.name}</bdi></span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("geofences:fields.center")}</span>
                      <span className="text-foreground font-mono" dir="ltr">{Number(selectedZone.centerLat).toFixed(7)}, {Number(selectedZone.centerLng).toFixed(7)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("geofences:fields.radius")}</span>
                      <span className="text-foreground"><bdi>{t("geofences:metersUnit", { count: selectedZone.radiusMeters })}</bdi></span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("geofences:fields.status")}</span>
                      <span className={selectedZone.isActive ? "text-emerald-400" : "text-zinc-500"}>{selectedZone.isActive ? t("geofences:active") : t("geofences:inactive")}</span>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}
      </div>

      {formOpen && (
        <ZoneFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          initial={editZone}
          onSaved={() => setEditZone(null)}
        />
      )}
    </DashboardLayout>
  );
}
