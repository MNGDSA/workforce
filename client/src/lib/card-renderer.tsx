import type { IdCardTemplate } from "@shared/schema";

export interface CardEmployeeData {
  employeeNumber: string;
  fullNameEn: string;
  fullNameAr?: string;
  nationalId?: string;
  photoUrl?: string;
  jobTitle?: string;
  eventName?: string;
  phone?: string;
  department?: string;
}

export const DEFAULT_FIELDS = [
  { key: "photo", label: "Employee Photo", enabled: true },
  { key: "fullNameEn", label: "Full Name (English)", enabled: true },
  { key: "fullNameAr", label: "Full Name (Arabic)", enabled: false },
  { key: "employeeNumber", label: "Employee Number", enabled: true },
  { key: "nationalId", label: "National ID", enabled: true },
  { key: "jobTitle", label: "Job Title / Position", enabled: true },
  { key: "eventName", label: "Event Name", enabled: false },
  { key: "phone", label: "Phone Number", enabled: false },
  { key: "department", label: "Department", enabled: false },
];

export const SAMPLE_EMPLOYEE: CardEmployeeData = {
  employeeNumber: "EMP-1001",
  fullNameEn: "Mohammed Al-Farsi",
  fullNameAr: "محمد الفارسي",
  nationalId: "1098765432",
  photoUrl: "",
  jobTitle: "Golf Cart Operator",
  eventName: "Ramadan 1447",
  phone: "0551234567",
  department: "Operations",
};

export function getTemplateFields(template: IdCardTemplate): typeof DEFAULT_FIELDS {
  const fields = template.fields as any[];
  if (Array.isArray(fields) && fields.length > 0) return fields;
  return DEFAULT_FIELDS;
}

interface IdCardPreviewProps {
  template: Partial<IdCardTemplate>;
  employee: CardEmployeeData;
  scale?: number;
}

export function IdCardPreview({ template, employee, scale = 1 }: IdCardPreviewProps) {
  const bgColor = template.backgroundColor || "#0f5a3a";
  const txtColor = template.textColor || "#ffffff";
  const fields = Array.isArray(template.fields) && (template.fields as any[]).length > 0
    ? (template.fields as any[])
    : DEFAULT_FIELDS;
  const enabledFields = fields.filter((f: any) => f.enabled);
  const showPhoto = enabledFields.some((f: any) => f.key === "photo");
  const dataFields = enabledFields.filter((f: any) => f.key !== "photo");
  const logoUrl = template.logoUrl;

  const cardW = 325;
  const cardH = 204;

  return (
    <div
      data-testid="id-card-preview"
      style={{
        width: cardW * scale,
        height: cardH * scale,
        backgroundColor: bgColor,
        color: txtColor,
        borderRadius: 8 * scale,
        overflow: "hidden",
        fontFamily: "'Cairo', 'Inter', sans-serif",
        fontVariantNumeric: "tabular-nums",
        position: "relative",
        boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
        transform: `scale(1)`,
        transformOrigin: "top left",
      }}
    >
      <div style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: 48 * scale,
        background: "rgba(0,0,0,0.2)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8 * scale,
        padding: `0 ${12 * scale}px`,
      }}>
        {logoUrl && (
          <img
            src={logoUrl}
            alt="Logo"
            style={{ height: 28 * scale, width: "auto", objectFit: "contain" }}
          />
        )}
        <span style={{
          fontSize: 11 * scale,
          fontWeight: 700,
          letterSpacing: 1,
          textTransform: "uppercase",
          opacity: 0.9,
        }}>
          Luxury Carts Company
        </span>
      </div>

      <div style={{
        display: "flex",
        paddingTop: 56 * scale,
        paddingLeft: 14 * scale,
        paddingRight: 14 * scale,
        paddingBottom: 10 * scale,
        height: `calc(100% - ${48 * scale}px)`,
        gap: 14 * scale,
      }}>
        {showPhoto && (
          <div style={{
            width: 72 * scale,
            height: 90 * scale,
            borderRadius: 6 * scale,
            overflow: "hidden",
            border: `2px solid rgba(255,255,255,0.3)`,
            flexShrink: 0,
            background: "rgba(255,255,255,0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
            {employee.photoUrl ? (
              <img
                src={employee.photoUrl}
                alt={employee.fullNameEn}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <svg width={32 * scale} height={32 * scale} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5">
                <circle cx="12" cy="8" r="4" />
                <path d="M6 21v-2a4 4 0 014-4h4a4 4 0 014 4v2" />
              </svg>
            )}
          </div>
        )}

        <div style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 3 * scale,
          minWidth: 0,
        }}>
          {dataFields.map((f: any) => {
            const val = (employee as any)[f.key] || "—";
            const isName = f.key === "fullNameEn" || f.key === "fullNameAr";
            return (
              <div key={f.key} style={{ lineHeight: 1.3 }}>
                <div style={{
                  fontSize: 7 * scale,
                  opacity: 0.6,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                }}>
                  {f.label}
                </div>
                <div style={{
                  fontSize: isName ? 11 * scale : 9.5 * scale,
                  fontWeight: isName ? 700 : 500,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  direction: f.key === "fullNameAr" ? "rtl" : "ltr",
                }}>
                  {val}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: 3 * scale,
        background: "rgba(255,255,255,0.15)",
      }} />
    </div>
  );
}

function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderCardBodyHtml(template: Partial<IdCardTemplate>, employee: CardEmployeeData): string {
  const fields = Array.isArray(template.fields) && (template.fields as any[]).length > 0
    ? (template.fields as any[])
    : DEFAULT_FIELDS;
  const enabledFields = fields.filter((f: any) => f.enabled);
  const showPhoto = enabledFields.some((f: any) => f.key === "photo");
  const dataFields = enabledFields.filter((f: any) => f.key !== "photo");
  const logoUrl = template.logoUrl;

  const photoHtml = showPhoto
    ? `<div style="width:72px;height:90px;border-radius:6px;overflow:hidden;border:2px solid rgba(255,255,255,0.3);flex-shrink:0;background:rgba(255,255,255,0.1);display:flex;align-items:center;justify-content:center;">
        ${employee.photoUrl
          ? `<img src="${esc(employee.photoUrl)}" style="width:100%;height:100%;object-fit:cover;" />`
          : `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="1.5"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/></svg>`
        }
       </div>`
    : "";

  const fieldsHtml = dataFields.map((f: any) => {
    const val = esc((employee as any)[f.key] || "—");
    const label = esc(f.label);
    const isName = f.key === "fullNameEn" || f.key === "fullNameAr";
    return `<div style="line-height:1.3;">
      <div style="font-size:7px;opacity:0.6;text-transform:uppercase;letter-spacing:0.5px;">${label}</div>
      <div style="font-size:${isName ? 11 : 9.5}px;font-weight:${isName ? 700 : 500};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;direction:${f.key === 'fullNameAr' ? 'rtl' : 'ltr'};">${val}</div>
    </div>`;
  }).join("");

  return `<div class="card">
  <div style="position:absolute;top:0;left:0;right:0;height:48px;background:rgba(0,0,0,0.2);display:flex;align-items:center;justify-content:center;gap:8px;padding:0 12px;">
    ${logoUrl ? `<img src="${esc(logoUrl)}" style="height:28px;width:auto;object-fit:contain;" />` : ""}
    <span style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;opacity:0.9;">Luxury Carts Company</span>
  </div>
  <div style="display:flex;padding:56px 14px 10px;height:calc(100% - 48px);gap:14px;">
    ${photoHtml}
    <div style="flex:1;display:flex;flex-direction:column;justify-content:center;gap:3px;min-width:0;">
      ${fieldsHtml}
    </div>
  </div>
  <div style="position:absolute;bottom:0;left:0;right:0;height:3px;background:rgba(255,255,255,0.15);"></div>
</div>`;
}

export function renderCardToHtml(template: Partial<IdCardTemplate>, employee: CardEmployeeData): string {
  const bgColor = esc(template.backgroundColor || "#0f5a3a");
  const txtColor = esc(template.textColor || "#ffffff");
  const body = renderCardBodyHtml(template, employee);

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;700&family=Inter:wght@400;500;700&display=swap');
@page { size: 85.6mm 54mm; margin: 0; }
body { margin: 0; font-family: 'Cairo', 'Inter', sans-serif; font-variant-numeric: tabular-nums; }
body, body * { font-variant-numeric: tabular-nums; }
.card { width: 85.6mm; height: 54mm; background: ${bgColor}; color: ${txtColor}; position: relative; overflow: hidden; page-break-after: always; }
</style></head><body>
${body}
</body></html>`;
}

export function printCards(template: Partial<IdCardTemplate>, employees: CardEmployeeData[]) {
  const bgColor = esc(template.backgroundColor || "#0f5a3a");
  const txtColor = esc(template.textColor || "#ffffff");

  const pages = employees.map(emp => renderCardBodyHtml(template, emp)).join("\n");

  const fullHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;700&family=Inter:wght@400;500;700&display=swap');
@page { size: 85.6mm 54mm; margin: 0; }
body { margin: 0; font-family: 'Cairo', 'Inter', sans-serif; font-variant-numeric: tabular-nums; }
body, body * { font-variant-numeric: tabular-nums; }
.card { width: 85.6mm; height: 54mm; background: ${bgColor}; color: ${txtColor}; position: relative; overflow: hidden; page-break-after: always; }
@media print { body { margin: 0; } }
</style></head><body>${pages}</body></html>`;

  const win = window.open("", "_blank");
  if (win) {
    win.document.write(fullHtml);
    win.document.close();
    setTimeout(() => { win.print(); }, 500);
  }
}
