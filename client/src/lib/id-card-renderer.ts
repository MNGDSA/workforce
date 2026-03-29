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
  { key: "horizontal", label: "Horizontal", description: "Photo left, info right (default)" },
  { key: "vertical", label: "Vertical", description: "Photo top, info bottom" },
  { key: "compact", label: "Compact", description: "No photo area, text-dense" },
];

export interface IdCardTemplateConfig {
  name: string;
  logoUrl?: string | null;
  fields: string[];
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
  eventName: "Riyadh Season 2026",
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

function buildInfoLines(
  template: IdCardTemplateConfig,
  employee: EmployeeCardData,
  scale: number,
  safeAccent: string,
  safeText: string,
): string[] {
  const lines: string[] = [];
  const fields = template.fields || ["fullName", "photo", "employeeNumber"];
  const nameFontSize = template.nameFontSize ?? 14;

  if (fields.includes("employeeNumber")) {
    lines.push(
      `<div style="font-size:${10 * scale}px;font-family:monospace;color:${safeAccent};font-weight:700;letter-spacing:1px;">${escapeHTML(employee.employeeNumber)}</div>`
    );
  }
  if (fields.includes("fullName")) {
    lines.push(
      `<div style="font-size:${nameFontSize * scale}px;font-weight:700;margin:${2 * scale}px 0;color:${safeText};">${escapeHTML(employee.fullName)}</div>`
    );
  }
  if (fields.includes("position") && employee.position) {
    lines.push(
      `<div style="font-size:${10 * scale}px;color:${safeText};opacity:0.85;">${escapeHTML(employee.position)}</div>`
    );
  }
  if (fields.includes("eventName") && employee.eventName) {
    lines.push(
      `<div style="font-size:${9 * scale}px;color:${safeAccent};margin-top:${2 * scale}px;">${escapeHTML(employee.eventName)}</div>`
    );
  }
  if (fields.includes("nationalId") && employee.nationalId) {
    lines.push(
      `<div style="font-size:${9 * scale}px;color:${safeText};opacity:0.7;margin-top:${2 * scale}px;">ID: ${escapeHTML(employee.nationalId)}</div>`
    );
  }
  if (fields.includes("phone") && employee.phone) {
    lines.push(
      `<div style="font-size:${9 * scale}px;color:${safeText};opacity:0.7;">Tel: ${escapeHTML(employee.phone)}</div>`
    );
  }
  return lines;
}

function buildPhotoHTML(
  template: IdCardTemplateConfig,
  employee: EmployeeCardData,
  scale: number,
  safeAccent: string,
  safeBg: string,
): string {
  const fields = template.fields || ["fullName", "photo", "employeeNumber"];
  if (!fields.includes("photo")) return "";
  const photoSize = Math.round(38 * scale);
  const initials = employee.fullName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  if (employee.photoUrl) {
    const safeUrl = escapeHTML(employee.photoUrl);
    return `<img src="${safeUrl}" style="width:${photoSize}px;height:${photoSize}px;border-radius:${4 * scale}px;object-fit:cover;border:2px solid ${safeAccent};" crossorigin="anonymous" />`;
  }
  return `<div style="width:${photoSize}px;height:${photoSize}px;border-radius:${4 * scale}px;background:${safeAccent};display:flex;align-items:center;justify-content:center;font-size:${14 * scale}px;font-weight:700;color:${safeBg};">${escapeHTML(initials)}</div>`;
}

function renderHorizontalLayout(
  template: IdCardTemplateConfig,
  employee: EmployeeCardData,
  scale: number,
  widthPx: number,
  heightPx: number,
): string {
  const safeAccent = escapeHTML(template.accentColor);
  const safeText = escapeHTML(template.textColor);
  const safeBg = escapeHTML(template.backgroundColor);
  const hasPhoto = (template.fields || []).includes("photo");
  const photoHTML = buildPhotoHTML(template, employee, scale, safeAccent, safeBg);
  const infoLines = buildInfoLines(template, employee, scale, safeAccent, safeText);
  const safeLogoUrl = template.logoUrl ? escapeHTML(template.logoUrl) : "";
  const logoHTML = template.logoUrl
    ? `<img src="${safeLogoUrl}" style="max-height:${20 * scale}px;max-width:${80 * scale}px;object-fit:contain;" crossorigin="anonymous" />`
    : "";
  const borderStyle = template.showBorder ? `border:1px solid ${safeAccent};` : "";

  return `<div style="width:${widthPx}px;height:${heightPx}px;background:${safeBg};border-radius:${6 * scale}px;overflow:hidden;position:relative;font-family:'Inter',system-ui,sans-serif;box-sizing:border-box;display:flex;flex-direction:column;${borderStyle}">
    <div style="background:${safeAccent};height:${4 * scale}px;width:100%;"></div>
    <div style="padding:${8 * scale}px ${12 * scale}px ${6 * scale}px;display:flex;align-items:flex-start;gap:${10 * scale}px;flex:1;">
      ${hasPhoto ? `<div style="flex-shrink:0;">${photoHTML}</div>` : ""}
      <div style="flex:1;min-width:0;">
        ${logoHTML ? `<div style="margin-bottom:${4 * scale}px;">${logoHTML}</div>` : ""}
        ${infoLines.join("")}
      </div>
    </div>
    <div style="background:${safeAccent}22;padding:${3 * scale}px ${12 * scale}px;text-align:center;">
      <div style="font-size:${7 * scale}px;color:${safeText};opacity:0.5;">EMPLOYEE IDENTIFICATION CARD</div>
    </div>
  </div>`;
}

function renderVerticalLayout(
  template: IdCardTemplateConfig,
  employee: EmployeeCardData,
  scale: number,
  widthPx: number,
  heightPx: number,
): string {
  const safeAccent = escapeHTML(template.accentColor);
  const safeText = escapeHTML(template.textColor);
  const safeBg = escapeHTML(template.backgroundColor);
  const photoHTML = buildPhotoHTML(template, employee, scale, safeAccent, safeBg);
  const infoLines = buildInfoLines(template, employee, scale, safeAccent, safeText);
  const safeLogoUrl = template.logoUrl ? escapeHTML(template.logoUrl) : "";
  const logoHTML = template.logoUrl
    ? `<img src="${safeLogoUrl}" style="max-height:${16 * scale}px;max-width:${60 * scale}px;object-fit:contain;" crossorigin="anonymous" />`
    : "";
  const borderStyle = template.showBorder ? `border:1px solid ${safeAccent};` : "";

  return `<div style="width:${widthPx}px;height:${heightPx}px;background:${safeBg};border-radius:${6 * scale}px;overflow:hidden;position:relative;font-family:'Inter',system-ui,sans-serif;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;${borderStyle}">
    <div style="background:${safeAccent};height:${4 * scale}px;width:100%;"></div>
    ${logoHTML ? `<div style="margin-top:${4 * scale}px;">${logoHTML}</div>` : ""}
    <div style="margin:${4 * scale}px 0;">${photoHTML}</div>
    <div style="text-align:center;padding:0 ${8 * scale}px;flex:1;overflow:hidden;">
      ${infoLines.join("")}
    </div>
    <div style="background:${safeAccent}22;padding:${3 * scale}px ${12 * scale}px;text-align:center;width:100%;">
      <div style="font-size:${7 * scale}px;color:${safeText};opacity:0.5;">EMPLOYEE IDENTIFICATION CARD</div>
    </div>
  </div>`;
}

function renderCompactLayout(
  template: IdCardTemplateConfig,
  employee: EmployeeCardData,
  scale: number,
  widthPx: number,
  heightPx: number,
): string {
  const safeAccent = escapeHTML(template.accentColor);
  const safeText = escapeHTML(template.textColor);
  const safeBg = escapeHTML(template.backgroundColor);
  const infoLines = buildInfoLines(template, employee, scale, safeAccent, safeText);
  const safeLogoUrl = template.logoUrl ? escapeHTML(template.logoUrl) : "";
  const logoHTML = template.logoUrl
    ? `<img src="${safeLogoUrl}" style="max-height:${18 * scale}px;max-width:${70 * scale}px;object-fit:contain;" crossorigin="anonymous" />`
    : "";
  const borderStyle = template.showBorder ? `border:1px solid ${safeAccent};` : "";

  return `<div style="width:${widthPx}px;height:${heightPx}px;background:${safeBg};border-radius:${6 * scale}px;overflow:hidden;position:relative;font-family:'Inter',system-ui,sans-serif;box-sizing:border-box;display:flex;flex-direction:column;${borderStyle}">
    <div style="background:${safeAccent};height:${4 * scale}px;width:100%;"></div>
    <div style="padding:${10 * scale}px ${14 * scale}px;flex:1;display:flex;flex-direction:column;justify-content:center;">
      ${logoHTML ? `<div style="margin-bottom:${6 * scale}px;">${logoHTML}</div>` : ""}
      ${infoLines.join("")}
    </div>
    <div style="background:${safeAccent}22;padding:${3 * scale}px ${12 * scale}px;text-align:center;">
      <div style="font-size:${7 * scale}px;color:${safeText};opacity:0.5;">EMPLOYEE IDENTIFICATION CARD</div>
    </div>
  </div>`;
}

export function renderIdCardHTML(
  template: IdCardTemplateConfig,
  employee: EmployeeCardData,
  scale: number = 1
): string {
  const layout = template.layout ?? "horizontal";
  const isVertical = layout === "vertical";
  const widthPx = Math.round((isVertical ? CR80_HEIGHT_MM : CR80_WIDTH_MM) * 3.7795 * scale);
  const heightPx = Math.round((isVertical ? CR80_WIDTH_MM : CR80_HEIGHT_MM) * 3.7795 * scale);

  switch (layout) {
    case "vertical":
      return renderVerticalLayout(template, employee, scale, widthPx, heightPx);
    case "compact":
      return renderCompactLayout(template, employee, scale, widthPx, heightPx);
    default:
      return renderHorizontalLayout(template, employee, scale, widthPx, heightPx);
  }
}

export function printIdCardFallback(
  template: IdCardTemplateConfig,
  employees: EmployeeCardData[]
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
      @page { size: ${pageW} ${pageH}; margin: 0; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { background: #fff; }
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

export async function sendPrintJob(
  template: IdCardTemplateConfig,
  employees: EmployeeCardData[],
  activePlugin: PrinterPluginConfig | null,
): Promise<PrintJobResult[]> {
  if (activePlugin && activePlugin.type === "zebra_browser_print") {
    return sendViaZebraBrowserPrint(template, employees, activePlugin);
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
