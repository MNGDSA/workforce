function escapeHTML(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export const CR80_WIDTH_MM = 85.6;
export const CR80_HEIGHT_MM = 54;
export const CR80_ASPECT = CR80_WIDTH_MM / CR80_HEIGHT_MM;

export const CANVAS_W = 324;
export const CANVAS_H = 204;

export const AVAILABLE_FIELDS = [
  { key: "fullName", label: "Full Name" },
  { key: "photo", label: "Photo" },
  { key: "employeeNumber", label: "Employee Number" },
  { key: "nationalId", label: "National ID" },
  { key: "position", label: "Position / Job Title" },
  { key: "eventName", label: "Event Name" },
  { key: "phone", label: "Phone" },
] as const;

export type FieldKey = (typeof AVAILABLE_FIELDS)[number]["key"];

export type CardLayout = "horizontal" | "vertical" | "compact";

export const CARD_LAYOUTS: { key: CardLayout; label: string; description: string }[] = [
  { key: "horizontal", label: "Horizontal", description: "Landscape CR-80" },
  { key: "vertical", label: "Vertical", description: "Portrait CR-80" },
];

export interface FieldPlacement {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fontSize: number;
  fontColor: string;
  fontWeight: number;
  textAlign?: "left" | "center" | "right";
  visible: boolean;
}

export function defaultFieldPlacements(layout: CardLayout): FieldPlacement[] {
  const isVert = layout === "vertical";
  const cw = isVert ? CANVAS_H : CANVAS_W;

  if (isVert) {
    return [
      { key: "photo", x: (cw - 60) / 2, y: 10, w: 60, h: 72, fontSize: 0, fontColor: "#000000", fontWeight: 400, visible: true },
      { key: "fullName", x: 10, y: 88, w: cw - 20, h: 22, fontSize: 13, fontColor: "#000000", fontWeight: 700, visible: true },
      { key: "employeeNumber", x: 10, y: 112, w: cw - 20, h: 18, fontSize: 11, fontColor: "#000000", fontWeight: 600, visible: true },
      { key: "nationalId", x: 10, y: 132, w: cw - 20, h: 18, fontSize: 10, fontColor: "#000000", fontWeight: 400, visible: true },
      { key: "position", x: 10, y: 152, w: cw - 20, h: 18, fontSize: 10, fontColor: "#000000", fontWeight: 400, visible: true },
      { key: "eventName", x: 10, y: 172, w: cw - 20, h: 18, fontSize: 9, fontColor: "#000000", fontWeight: 400, visible: false },
      { key: "phone", x: 10, y: 192, w: cw - 20, h: 18, fontSize: 9, fontColor: "#000000", fontWeight: 400, visible: false },
    ];
  }

  return [
    { key: "photo", x: 12, y: 18, w: 60, h: 72, fontSize: 0, fontColor: "#000000", fontWeight: 400, visible: true },
    { key: "fullName", x: 82, y: 18, w: 230, h: 22, fontSize: 14, fontColor: "#000000", fontWeight: 700, visible: true },
    { key: "employeeNumber", x: 82, y: 44, w: 230, h: 18, fontSize: 11, fontColor: "#000000", fontWeight: 600, visible: true },
    { key: "nationalId", x: 82, y: 66, w: 230, h: 18, fontSize: 10, fontColor: "#000000", fontWeight: 400, visible: true },
    { key: "position", x: 82, y: 88, w: 230, h: 18, fontSize: 10, fontColor: "#000000", fontWeight: 400, visible: true },
    { key: "eventName", x: 82, y: 110, w: 230, h: 18, fontSize: 9, fontColor: "#000000", fontWeight: 400, visible: false },
    { key: "phone", x: 82, y: 132, w: 230, h: 18, fontSize: 9, fontColor: "#000000", fontWeight: 400, visible: false },
  ];
}

export interface IdCardTemplateConfig {
  name: string;
  logoUrl?: string | null;
  backgroundImageUrl?: string | null;
  fields: string[];
  fieldPlacements?: FieldPlacement[];
  backgroundColor: string;
  textColor: string;
  accentColor: string;
  layout?: CardLayout;
  nameFontSize?: number;
  showBorder?: boolean;
  layoutConfig?: Record<string, unknown>;
}

export interface EmployeeCardData {
  fullName: string;
  photoUrl?: string | null;
  employeeNumber: string;
  nationalId?: string | null;
  position?: string | null;
  eventName?: string | null;
  phone?: string | null;
}

export const SAMPLE_EMPLOYEE: EmployeeCardData = {
  fullName: "Ahmed Al-Rashidi",
  photoUrl: null,
  employeeNumber: "EMP-001",
  nationalId: "1234567890",
  position: "Operations Specialist",
  eventName: "Ramadan 1447",
  phone: "+966 50 123 4567",
};

export interface PrinterPluginConfig {
  id: string;
  name: string;
  type: string;
  config: Record<string, unknown>;
  isActive: boolean;
}

export type PrintJobStatus = "success" | "failed" | "pending";

export interface PrintJobResult {
  employeeId: string;
  status: PrintJobStatus;
  error?: string;
  pluginUsed: string | null;
}

function getFieldValue(emp: EmployeeCardData, key: string): string {
  const map: Record<string, string | null | undefined> = {
    fullName: emp.fullName,
    employeeNumber: emp.employeeNumber,
    nationalId: emp.nationalId,
    position: emp.position,
    eventName: emp.eventName,
    phone: emp.phone,
  };
  return map[key] ?? "";
}

function renderPhotoPlacementHTML(
  fp: FieldPlacement,
  emp: EmployeeCardData,
  scale: number,
): string {
  const x = fp.x * scale;
  const y = fp.y * scale;
  const w = fp.w * scale;
  const h = fp.h * scale;
  const initials = emp.fullName
    .split(" ")
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  if (emp.photoUrl) {
    return `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;border-radius:${4 * scale}px;overflow:hidden;">
      <img src="${escapeHTML(emp.photoUrl)}" style="width:100%;height:100%;object-fit:cover;" crossorigin="anonymous" />
    </div>`;
  }
  return `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;border-radius:${4 * scale}px;background:rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;font-size:${14 * scale}px;font-weight:700;color:rgba(255,255,255,0.6);">${escapeHTML(initials)}</div>`;
}

function renderTextPlacementHTML(
  fp: FieldPlacement,
  value: string,
  scale: number,
): string {
  const x = fp.x * scale;
  const y = fp.y * scale;
  const w = fp.w * scale;
  const h = fp.h * scale;
  const fs = fp.fontSize * scale;
  const color = escapeHTML(fp.fontColor);

  const align = fp.textAlign || "left";
  const justifyMap = { left: "flex-start", center: "center", right: "flex-end" };
  const justify = justifyMap[align];

  return `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;font-size:${fs}px;font-weight:${fp.fontWeight};color:${color};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:flex;align-items:center;justify-content:${justify};text-align:${align};line-height:1.2;">${escapeHTML(value)}</div>`;
}

function getCanvasDimensions(layout: CardLayout): { w: number; h: number } {
  if (layout === "vertical") return { w: CANVAS_H, h: CANVAS_W };
  return { w: CANVAS_W, h: CANVAS_H };
}

export function renderIdCardHTML(
  template: IdCardTemplateConfig,
  employee: EmployeeCardData,
  scale: number = 1,
): string {
  const layout = template.layout ?? "horizontal";
  const dims = getCanvasDimensions(layout);
  const w = Math.round(dims.w * scale);
  const h = Math.round(dims.h * scale);
  const bgColor = escapeHTML(template.backgroundColor || "#1a1a2e");
  const bgImage = template.backgroundImageUrl;

  let placements = template.fieldPlacements && template.fieldPlacements.length > 0
    ? template.fieldPlacements
    : defaultFieldPlacements(layout);

  if (template.fields && template.fields.length > 0) {
    placements = placements.map((fp) => ({
      ...fp,
      visible: template.fields.includes(fp.key),
    }));
  }

  const visiblePlacements = placements.filter((fp) => fp.visible);

  const fieldElements = visiblePlacements
    .map((fp) => {
      if (fp.key === "photo") {
        return renderPhotoPlacementHTML(fp, employee, scale);
      }
      const value = getFieldValue(employee, fp.key);
      if (!value) return "";
      return renderTextPlacementHTML(fp, value, scale);
    })
    .join("");

  const bgStyle = bgImage
    ? `background-image:url('${escapeHTML(bgImage)}');background-size:cover;background-position:center;`
    : `background:${bgColor};`;

  return `<div style="width:${w}px;height:${h}px;${bgStyle}border-radius:${6 * scale}px;overflow:hidden;position:relative;font-family:'Cairo','Inter',system-ui,sans-serif;font-variant-numeric:tabular-nums;box-sizing:border-box;">
    ${fieldElements}
  </div>`;
}

export function printIdCardFallback(
  template: IdCardTemplateConfig,
  employees: EmployeeCardData[],
): boolean {
  const printWin = window.open("", "_blank", "width=400,height=600");
  if (!printWin) return false;

  const cardsHTML = employees
    .map((emp) => renderIdCardHTML(template, emp, 1))
    .join(`<div style="page-break-after:always;margin-bottom:10mm;"></div>`);

  const layout = template.layout ?? "horizontal";
  const pageW = layout === "vertical" ? "54mm" : "85.6mm";
  const pageH = layout === "vertical" ? "85.6mm" : "54mm";

  printWin.document.write(`<!DOCTYPE html><html><head><title>ID Cards</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap');
      @page { size: ${pageW} ${pageH}; margin: 0; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { background: #fff; font-family: 'Cairo', 'Inter', system-ui, sans-serif; font-feature-settings: "tnum"; }
      /* Force Western (tabular) digits everywhere on printed cards. */
      body, body * { font-variant-numeric: tabular-nums; }
      @media print { body { background: #fff; } }
    </style>
  </head><body>${cardsHTML}</body></html>`);
  printWin.document.close();

  setTimeout(() => {
    printWin.focus();
    printWin.print();
  }, 500);

  return true;
}

export const PLUGIN_TYPES = [
  {
    value: "zebra_browser_print",
    label: "Zebra Browser Print SDK",
    description: "Direct printing via Zebra Browser Print local service (ZC100, ZC300, ZXP Series)",
    defaultConfig: { endpoint: "http://localhost:9100", deviceName: "" },
    configFields: [
      { key: "endpoint", label: "SDK Endpoint", placeholder: "http://localhost:9100", type: "text" as const },
      { key: "deviceName", label: "Device Name (optional)", placeholder: "Auto-detect", type: "text" as const },
    ],
  },
  {
    value: "evolis_premium_suite",
    label: "Evolis Premium Suite",
    description: "Direct printing via Evolis Premium Suite REST API (Primacy 2, Avansia, Zenius)",
    defaultConfig: { endpoint: "http://localhost:18000", printerName: "" },
    configFields: [
      { key: "endpoint", label: "API Endpoint", placeholder: "http://localhost:18000", type: "text" as const },
      { key: "printerName", label: "Printer Name (optional)", placeholder: "Auto-detect first printer", type: "text" as const },
    ],
  },
  {
    value: "browser_fallback",
    label: "Browser Print (Fallback)",
    description: "Uses the browser's native print dialog — works with any printer",
    defaultConfig: {},
    configFields: [],
  },
] as const;

export async function sendPrintJob(
  template: IdCardTemplateConfig,
  employees: EmployeeCardData[],
  activePlugin: PrinterPluginConfig | null,
): Promise<PrintJobResult[]> {
  if (activePlugin) {
    if (activePlugin.type === "zebra_browser_print") {
      return sendViaZebraBrowserPrint(template, employees, activePlugin);
    }
    if (activePlugin.type === "evolis_premium_suite") {
      return sendViaEvolisPremiumSuite(template, employees, activePlugin);
    }
  }

  const opened = printIdCardFallback(template, employees);
  return employees.map((emp) => ({
    employeeId: emp.employeeNumber,
    status: opened ? ("pending" as PrintJobStatus) : ("failed" as PrintJobStatus),
    error: opened ? undefined : "Popup blocked — could not open print window",
    pluginUsed: null,
  }));
}

async function sendViaZebraBrowserPrint(
  template: IdCardTemplateConfig,
  employees: EmployeeCardData[],
  plugin: PrinterPluginConfig,
): Promise<PrintJobResult[]> {
  const config = plugin.config as { endpoint?: string; deviceName?: string };
  const endpoint = config.endpoint || "http://localhost:9100";

  const results: PrintJobResult[] = [];

  for (const emp of employees) {
    try {
      const cardHTML = renderIdCardHTML(template, emp, 1);
      const response = await fetch(`${endpoint}/write`, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: cardHTML,
      });

      if (response.ok) {
        results.push({ employeeId: emp.employeeNumber, status: "success", pluginUsed: plugin.id });
      } else {
        results.push({
          employeeId: emp.employeeNumber,
          status: "failed",
          error: `Zebra SDK returned ${response.status}`,
          pluginUsed: plugin.id,
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      results.push({
        employeeId: emp.employeeNumber,
        status: "failed",
        error: `Zebra SDK error: ${message}`,
        pluginUsed: plugin.id,
      });
    }
  }

  if (results.every((r) => r.status === "failed")) {
    const fallbackOpened = printIdCardFallback(template, employees);
    return employees.map((emp) => ({
      employeeId: emp.employeeNumber,
      status: fallbackOpened ? ("pending" as PrintJobStatus) : ("failed" as PrintJobStatus),
      error: fallbackOpened ? "Plugin failed — fell back to browser print" : "Plugin failed and popup blocked",
      pluginUsed: null,
    }));
  }

  return results;
}

async function sendViaEvolisPremiumSuite(
  template: IdCardTemplateConfig,
  employees: EmployeeCardData[],
  plugin: PrinterPluginConfig,
): Promise<PrintJobResult[]> {
  const config = plugin.config as { endpoint?: string; printerName?: string };
  const endpoint = config.endpoint || "http://localhost:18000";
  const printerName = config.printerName || "";
  const results: PrintJobResult[] = [];

  for (const emp of employees) {
    try {
      const frontHTML = renderIdCardHTML(template, emp, 1);

      const printPayload: Record<string, unknown> = {
        action: "print",
        printer: printerName || undefined,
        duplex: "SIMPLEX",
        frontPage: {
          type: "html",
          data: frontHTML,
        },
      };

      const response = await fetch(`${endpoint}/api/print`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(printPayload),
      });

      if (response.ok) {
        const result = await response.json().catch(() => ({}));
        results.push({
          employeeId: emp.employeeNumber,
          status: "success",
          pluginUsed: plugin.id,
          error: result.jobId ? `Job ID: ${result.jobId}` : undefined,
        });
      } else {
        const errText = await response.text().catch(() => "");
        results.push({
          employeeId: emp.employeeNumber,
          status: "failed",
          error: `Evolis API returned ${response.status}: ${errText}`.slice(0, 200),
          pluginUsed: plugin.id,
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      results.push({
        employeeId: emp.employeeNumber,
        status: "failed",
        error: `Evolis SDK error: ${message}`,
        pluginUsed: plugin.id,
      });
    }
  }

  if (results.every((r) => r.status === "failed")) {
    const fallbackOpened = printIdCardFallback(template, employees);
    return employees.map((emp) => ({
      employeeId: emp.employeeNumber,
      status: fallbackOpened ? ("pending" as PrintJobStatus) : ("failed" as PrintJobStatus),
      error: fallbackOpened ? "Evolis plugin failed — fell back to browser print" : "Plugin failed and popup blocked",
      pluginUsed: null,
    }));
  }

  return results;
}
