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

export const BACK_AVAILABLE_FIELDS = [
  { key: "companyName", label: "Company Name" },
  { key: "companyAddress", label: "Company Address" },
  { key: "companyPhone", label: "Company Phone" },
  { key: "emergencyContact", label: "Emergency Contact" },
  { key: "bloodType", label: "Blood Type" },
  { key: "qrCode", label: "QR Code Placeholder" },
  { key: "disclaimer", label: "Disclaimer Text" },
] as const;

export type BackFieldKey = (typeof BACK_AVAILABLE_FIELDS)[number]["key"];

export function defaultBackFieldPlacements(layout: CardLayout): FieldPlacement[] {
  const isVert = layout === "vertical";
  const cw = isVert ? CANVAS_H : CANVAS_W;
  const ch = isVert ? CANVAS_W : CANVAS_H;

  return [
    { key: "companyName", x: 10, y: 20, w: cw - 20, h: 22, fontSize: 13, fontColor: "#ffffff", fontWeight: 700, visible: true },
    { key: "companyAddress", x: 10, y: 46, w: cw - 20, h: 18, fontSize: 9, fontColor: "#ffffff", fontWeight: 400, visible: true },
    { key: "companyPhone", x: 10, y: 68, w: cw - 20, h: 18, fontSize: 9, fontColor: "#ffffff", fontWeight: 400, visible: false },
    { key: "emergencyContact", x: 10, y: 90, w: cw - 20, h: 18, fontSize: 9, fontColor: "#ffffff", fontWeight: 400, visible: false },
    { key: "bloodType", x: 10, y: 112, w: cw - 20, h: 18, fontSize: 10, fontColor: "#ffffff", fontWeight: 500, visible: false },
    { key: "qrCode", x: (cw - 60) / 2, y: ch - 80, w: 60, h: 60, fontSize: 0, fontColor: "#ffffff", fontWeight: 400, visible: false },
    { key: "disclaimer", x: 10, y: ch - 30, w: cw - 20, h: 20, fontSize: 7, fontColor: "#ffffff", fontWeight: 400, visible: true },
  ];
}

export const BACK_SAMPLE_DATA: Record<string, string> = {
  companyName: "Luxury Carts Company Ltd",
  companyAddress: "Makkah, Saudi Arabia",
  companyPhone: "+966 12 345 6789",
  emergencyContact: "Emergency: 911",
  bloodType: "O+",
  qrCode: "QR",
  disclaimer: "Property of Luxury Carts Co. Return if found.",
};

export interface IdCardTemplateConfig {
  name: string;
  logoUrl?: string | null;
  backgroundImageUrl?: string | null;
  backBackgroundImageUrl?: string | null;
  fields: string[];
  backFields?: string[];
  fieldPlacements?: FieldPlacement[];
  backFieldPlacements?: FieldPlacement[];
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

  return `<div style="width:${w}px;height:${h}px;${bgStyle}border-radius:${6 * scale}px;overflow:hidden;position:relative;font-family:'Inter',system-ui,sans-serif;box-sizing:border-box;">
    ${fieldElements}
  </div>`;
}

export function renderBackSideHTML(
  template: IdCardTemplateConfig,
  scale: number = 1,
): string {
  const layout = template.layout ?? "horizontal";
  const dims = getCanvasDimensions(layout);
  const w = Math.round(dims.w * scale);
  const h = Math.round(dims.h * scale);
  const bgColor = escapeHTML(template.backgroundColor || "#1a1a2e");
  const bgImage = template.backBackgroundImageUrl;

  let placements = template.backFieldPlacements && template.backFieldPlacements.length > 0
    ? template.backFieldPlacements
    : defaultBackFieldPlacements(layout);

  if (template.backFields !== undefined) {
    placements = placements.map((fp) => ({
      ...fp,
      visible: template.backFields!.includes(fp.key),
    }));
  }

  const visiblePlacements = placements.filter((fp) => fp.visible);

  const fieldElements = visiblePlacements
    .map((fp) => {
      if (fp.key === "qrCode") {
        const x = fp.x * scale;
        const y = fp.y * scale;
        const sz = fp.w * scale;
        return `<div style="position:absolute;left:${x}px;top:${y}px;width:${sz}px;height:${sz}px;border:2px dashed rgba(255,255,255,0.3);border-radius:${4 * scale}px;display:flex;align-items:center;justify-content:center;font-size:${10 * scale}px;color:rgba(255,255,255,0.5);font-weight:600;">QR</div>`;
      }
      const value = BACK_SAMPLE_DATA[fp.key] ?? "";
      if (!value) return "";
      return renderTextPlacementHTML(fp, value, scale);
    })
    .join("");

  const bgStyle = bgImage
    ? `background-image:url('${escapeHTML(bgImage)}');background-size:cover;background-position:center;`
    : `background:${bgColor};`;

  return `<div style="width:${w}px;height:${h}px;${bgStyle}border-radius:${6 * scale}px;overflow:hidden;position:relative;font-family:'Inter',system-ui,sans-serif;box-sizing:border-box;">
    ${fieldElements}
  </div>`;
}

export function printIdCardFallback(
  template: IdCardTemplateConfig,
  employees: EmployeeCardData[],
): boolean {
  const printWin = window.open("", "_blank", "width=520,height=700");
  if (!printWin) return false;

  const hasBack = (template.backFields && template.backFields.length > 0) || template.backBackgroundImageUrl;

  const frontsHTML = employees
    .map((emp) => `<div class="card-page">${renderIdCardHTML(template, emp, 1)}</div>`)
    .join("");

  const backsHTML = hasBack
    ? employees
        .map(() => `<div class="card-page">${renderBackSideHTML(template, 1)}</div>`)
        .join("")
    : "";

  const layout = template.layout ?? "horizontal";
  const pageW = layout === "vertical" ? "54mm" : "85.6mm";
  const pageH = layout === "vertical" ? "85.6mm" : "54mm";
  const cardCount = employees.length;

  printWin.document.write(`<!DOCTYPE html><html><head><title>ID Cards</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
      @page { size: ${pageW} ${pageH}; margin: 0; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { background: #fff; font-family: 'Inter', system-ui, sans-serif; }
      .card-page { page-break-after: always; }
      .card-page:last-child { page-break-after: auto; }
      #print-area-front, #print-area-back { display: none; }
      @media print {
        .print-ui { display: none !important; }
        .print-active { display: block !important; }
      }
    </style>
  </head><body>
    <div class="print-ui" style="padding:24px;font-family:'Inter',system-ui,sans-serif;max-width:480px;margin:0 auto;">
      <div style="text-align:center;margin-bottom:20px;">
        <div style="font-size:18px;font-weight:700;color:#1a1a2e;">ID Card Printing</div>
        <div style="font-size:13px;color:#6b7280;margin-top:4px;">${cardCount} card${cardCount > 1 ? "s" : ""}${hasBack ? " — double-sided" : " — front only"}</div>
      </div>
      ${hasBack ? `
      <div id="step-front" style="background:#f0fdf4;border:2px solid #86efac;border-radius:8px;padding:16px;margin-bottom:12px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <div style="width:28px;height:28px;border-radius:50%;background:#16a34a;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;">1</div>
          <div style="font-weight:600;font-size:15px;color:#14532d;">Print Front Side</div>
        </div>
        <p style="font-size:13px;color:#166534;margin:0 0 12px 36px;">Load blank cards into the hopper. This will print the front of ${cardCount > 1 ? "all " + cardCount + " cards" : "the card"}.</p>
        <div style="margin-left:36px;"><button onclick="printFront()" style="background:#16a34a;color:#fff;border:none;padding:8px 20px;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer;">Print Front Side</button></div>
      </div>
      <div id="step-back" style="background:#f5f3ff;border:2px solid #c4b5fd;border-radius:8px;padding:16px;margin-bottom:12px;opacity:0.5;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <div style="width:28px;height:28px;border-radius:50%;background:#7c3aed;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;">2</div>
          <div style="font-weight:600;font-size:15px;color:#4c1d95;">Print Back Side</div>
        </div>
        <p style="font-size:13px;color:#5b21b6;margin:0 0 4px 36px;" id="back-instructions">Complete step 1 first.</p>
        <div style="margin-left:36px;"><button id="btn-back" onclick="printBack()" disabled style="background:#7c3aed;color:#fff;border:none;padding:8px 20px;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer;opacity:0.5;">Print Back Side</button></div>
      </div>
      <div style="background:#fffbeb;border:1px solid #fde047;border-radius:8px;padding:12px;margin-top:16px;">
        <p style="font-size:12px;color:#854d0e;margin:0;line-height:1.5;">
          <b>Manual duplex:</b> After printing the front, collect the printed cards and reinsert them into the manual feed slot <b>face-down</b> (printed side facing away from you). Then click "Print Back Side".
        </p>
      </div>
      ` : `
      <div style="background:#f0fdf4;border:2px solid #86efac;border-radius:8px;padding:16px;text-align:center;">
        <button onclick="printFront()" style="background:#16a34a;color:#fff;border:none;padding:10px 24px;border-radius:6px;font-size:15px;font-weight:600;cursor:pointer;">Print Cards</button>
      </div>
      `}
    </div>
    <div id="print-area-front">${frontsHTML}</div>
    <div id="print-area-back">${backsHTML}</div>
    <script>
      function printFront() {
        document.getElementById('print-area-front').classList.add('print-active');
        document.getElementById('print-area-back').classList.remove('print-active');
        window.print();
        ${hasBack ? `
        setTimeout(function() {
          document.getElementById('print-area-front').classList.remove('print-active');
          var stepBack = document.getElementById('step-back');
          stepBack.style.opacity = '1';
          document.getElementById('btn-back').disabled = false;
          document.getElementById('btn-back').style.opacity = '1';
          document.getElementById('back-instructions').innerHTML = 'Reinsert the printed card${cardCount > 1 ? "s" : ""} <b>face-down</b> into the manual feed slot, then click below.';
          document.getElementById('step-front').style.opacity = '0.5';
          document.getElementById('step-front').querySelector('button').textContent = '✓ Front Printed';
          document.getElementById('step-front').querySelector('button').disabled = true;
          document.getElementById('step-front').querySelector('button').style.opacity = '0.6';
        }, 1000);
        ` : ""}
      }
      function printBack() {
        document.getElementById('print-area-back').classList.add('print-active');
        document.getElementById('print-area-front').classList.remove('print-active');
        window.print();
        setTimeout(function() {
          document.getElementById('print-area-back').classList.remove('print-active');
          document.getElementById('step-back').style.opacity = '0.5';
          document.getElementById('btn-back').textContent = '✓ Back Printed';
          document.getElementById('btn-back').disabled = true;
          document.getElementById('btn-back').style.opacity = '0.6';
        }, 1000);
      }
    </script>
  </body></html>`);
  printWin.document.close();

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
    defaultConfig: { endpoint: "http://localhost:18000", printerName: "", duplexMode: "DUPLEX_CC_CC" },
    configFields: [
      { key: "endpoint", label: "API Endpoint", placeholder: "http://localhost:18000", type: "text" as const },
      { key: "printerName", label: "Printer Name (optional)", placeholder: "Auto-detect first printer", type: "text" as const },
      { key: "duplexMode", label: "Duplex Mode", placeholder: "DUPLEX_CC_CC", type: "select" as const, options: [
        { value: "SIMPLEX", label: "Single Side" },
        { value: "DUPLEX_CC_CC", label: "Duplex (Both Sides)" },
      ]},
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

  const hasBack = !!(template.backFields?.length || template.backBackgroundImageUrl);

  for (const emp of employees) {
    try {
      const cardHTML = renderIdCardHTML(template, emp, 1);
      const response = await fetch(`${endpoint}/write`, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: cardHTML,
      });

      if (hasBack) {
        const backHTML = renderBackSideHTML(template, 1);
        await fetch(`${endpoint}/write`, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: backHTML,
        });
      }

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
  const config = plugin.config as { endpoint?: string; printerName?: string; duplexMode?: string };
  const endpoint = config.endpoint || "http://localhost:18000";
  const printerName = config.printerName || "";
  const duplexMode = config.duplexMode || "DUPLEX_CC_CC";
  const hasBack = !!(template.backFields?.length || template.backBackgroundImageUrl);

  const results: PrintJobResult[] = [];

  for (const emp of employees) {
    try {
      const frontHTML = renderIdCardHTML(template, emp, 1);
      const backHTML = hasBack ? renderBackSideHTML(template, 1) : null;

      const printPayload: Record<string, unknown> = {
        action: "print",
        printer: printerName || undefined,
        duplex: hasBack ? duplexMode : "SIMPLEX",
        frontPage: {
          type: "html",
          data: frontHTML,
        },
      };

      if (backHTML && hasBack) {
        printPayload.backPage = {
          type: "html",
          data: backHTML,
        };
      }

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
