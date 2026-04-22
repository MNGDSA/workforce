export function printContract(title: string) {
  const el = document.querySelector('.contract-print-area');
  if (!el) return;
  const printWin = window.open('', '_blank', 'width=800,height=1000');
  if (!printWin) return;

  // Inherit document/element direction so an Arabic preview prints RTL.
  const dir = (getComputedStyle(el).direction === 'rtl' || document.documentElement.dir === 'rtl') ? 'rtl' : 'ltr';
  const lang = document.documentElement.lang || (dir === 'rtl' ? 'ar' : 'en');

  const A4_WIDTH_MM = 210;
  const A4_HEIGHT_MM = 297;
  const MARGIN_TOP_MM = 20;
  const MARGIN_BOTTOM_MM = 30;
  const MARGIN_SIDE_MM = 15;
  const CONTENT_HEIGHT_MM = A4_HEIGHT_MM - MARGIN_TOP_MM - MARGIN_BOTTOM_MM;
  const MM_TO_PX = 3.7795;
  const CONTENT_HEIGHT_PX = Math.floor(CONTENT_HEIGHT_MM * MM_TO_PX);
  const FOOTER_RESERVE_PX = 40;
  const USABLE_HEIGHT_PX = CONTENT_HEIGHT_PX - FOOTER_RESERVE_PX;

  const styles = `
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700&display=swap');
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Cairo', system-ui, -apple-system, Segoe UI, sans-serif; }
    body { font-family: 'Cairo', system-ui, -apple-system, Segoe UI, sans-serif; color: #000; background: #fff; margin: 0; padding: 0; font-size: 14px; line-height: 1.6; }
    .print-page { width: ${A4_WIDTH_MM}mm; min-height: ${A4_HEIGHT_MM}mm; padding: ${MARGIN_TOP_MM}mm ${MARGIN_SIDE_MM}mm ${MARGIN_BOTTOM_MM}mm ${MARGIN_SIDE_MM}mm; position: relative; page-break-after: always; overflow: hidden; }
    .print-page:last-child { page-break-after: auto; }
    .print-page-number { position: absolute; bottom: 10mm; ${dir === 'rtl' ? 'left' : 'right'}: ${MARGIN_SIDE_MM}mm; font-size: 9px; color: #888; }
    .print-doc-footer { position: absolute; bottom: 5mm; left: ${MARGIN_SIDE_MM}mm; right: ${MARGIN_SIDE_MM}mm; font-size: 8px; color: #999; text-align: center; white-space: pre-wrap; line-height: 1.4; }
    .page-content > * + * { margin-top: 1.5rem; }
    .flex { display: flex; }
    .justify-start { justify-content: flex-start; }
    .justify-center { justify-content: center; }
    .justify-end { justify-content: flex-end; }
    .grid { display: grid; }
    .grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .gap-8 { gap: 2rem; }
    .text-center { text-align: center; }
    .text-xl { font-size: 1.25rem; }
    .text-lg { font-size: 1.125rem; }
    .text-sm { font-size: 0.875rem; }
    .text-xs { font-size: 0.75rem; }
    .font-bold { font-weight: 700; }
    .italic { font-style: normal; }
    * { font-style: normal !important; }
    .whitespace-pre-wrap { white-space: pre-wrap; }
    .leading-relaxed { line-height: 1.625; }
    .border-b { border-bottom: 1px solid #d1d5db; }
    .border-t { border-top: 1px solid #d1d5db; }
    .pb-4 { padding-bottom: 1rem; }
    .pt-4 { padding-top: 1rem; }
    .pt-3 { padding-top: 0.75rem; }
    .mt-6 { margin-top: 1.5rem; }
    .mt-10 { margin-top: 2.5rem; }
    .mb-1 { margin-bottom: 0.25rem; }
    .mb-8 { margin-bottom: 2rem; }
    img { max-height: 64px; object-fit: contain; }
    h3 { font-size: 0.875rem; font-weight: 700; margin-bottom: 0.25rem; }
    h4 { font-size: 0.875rem; font-weight: 700; margin-bottom: 0.125rem; }
    .ml-6 { margin-left: 1.5rem; }
    .mt-2 { margin-top: 0.5rem; }
    .mb-0\\.5 { margin-bottom: 0.125rem; }
    .text-gray-500 { color: #6b7280; }
    .text-gray-400 { color: #9ca3af; }
    .border-gray-300 { border-color: #d1d5db; }
    .border-gray-200 { border-color: #e5e7eb; }
    .text-emerald-700 { color: #047857; }
    .no-print, .contract-page-footer { display: none !important; }
  `;

  const measureHtml = `<!DOCTYPE html><html lang="${lang}" dir="${dir}"><head><style>${styles}
    .measure-container { width: ${A4_WIDTH_MM - MARGIN_SIDE_MM * 2}mm; padding: 0; position: absolute; left: -9999px; top: 0; }
    .measure-container > * + * { margin-top: 1.5rem; }
  </style></head><body dir="${dir}"><div class="measure-container" dir="${dir}">${el.innerHTML}</div></body></html>`;

  printWin.document.write(measureHtml);
  printWin.document.close();

  printWin.onload = () => {
    const container = printWin.document.querySelector('.measure-container');
    if (!container) { printWin.close(); return; }

    const children = Array.from(container.children) as HTMLElement[];
    const pages: HTMLElement[][] = [];
    let currentPage: HTMLElement[] = [];
    let currentHeight = 0;

    children.forEach((child) => {
      const rect = child.getBoundingClientRect();
      const childH = rect.height + 24;

      if (currentHeight + childH > USABLE_HEIGHT_PX && currentPage.length > 0) {
        pages.push(currentPage);
        currentPage = [];
        currentHeight = 0;
      }
      currentPage.push(child);
      currentHeight += childH;
    });
    if (currentPage.length > 0) pages.push(currentPage);

    const totalPages = pages.length;
    let docFooterHtml = '';
    const footerEl = container.querySelector('.contract-page-footer');
    if (footerEl) docFooterHtml = footerEl.innerHTML || '';

    let bodyHtml = '';
    pages.forEach((pageChildren, pageIdx) => {
      let contentHtml = '';
      pageChildren.forEach(child => { contentHtml += child.outerHTML; });
      bodyHtml += `<div class="print-page">
        <div class="page-content">${contentHtml}</div>
        ${docFooterHtml ? `<div class="print-doc-footer">${docFooterHtml}</div>` : ''}
        <div class="print-page-number">Page ${pageIdx + 1} of ${totalPages}</div>
      </div>`;
    });

    printWin.document.open();
    printWin.document.write(`<!DOCTYPE html><html lang="${lang}" dir="${dir}"><head><title>${title}</title><style>${styles}</style></head><body dir="${dir}">${bodyHtml}</body></html>`);
    printWin.document.close();

    setTimeout(() => { printWin.focus(); printWin.print(); printWin.close(); }, 300);
  };
}
