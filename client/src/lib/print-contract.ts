export function printContract(title: string) {
  const el = document.querySelector('.contract-print-area');
  if (!el) return;
  const printWin = window.open('', '_blank', 'width=800,height=1000');
  if (!printWin) return;
  const styles = `
    @page { size: A4; margin: 20mm 15mm 30mm 15mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Times New Roman', Georgia, serif; color: #000; background: #fff; margin: 0; padding: 0; font-size: 14px; line-height: 1.6; }
    .contract-print-area { padding: 0; background: #fff; color: #000; }
    .contract-print-area > * + * { margin-top: 1.5rem; }
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
    .italic { font-style: italic; }
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
    .text-gray-500 { color: #6b7280; }
    .text-gray-400 { color: #9ca3af; }
    .border-gray-300 { border-color: #d1d5db; }
    .border-gray-200 { border-color: #e5e7eb; }
    .text-emerald-700 { color: #047857; }
    .no-print { display: none !important; }
    .contract-page-footer { display: block; position: fixed; bottom: 0; left: 0; right: 0; text-align: center; font-size: 8px; color: #999; padding: 3mm 15mm; border-top: 0.5px solid #ddd; }
    .page-number-footer { position: fixed; bottom: 0; right: 15mm; font-size: 9px; color: #999; font-family: 'Times New Roman', Georgia, serif; }
    .page-number-footer::after { content: "Page " counter(page) " of " counter(pages); }
  `;
  printWin.document.write(
    `<!DOCTYPE html><html><head><title>${title}</title><style>${styles}</style></head><body>${el.innerHTML}<div class="page-number-footer"></div></body></html>`
  );
  printWin.document.close();
  printWin.onload = () => { printWin.focus(); printWin.print(); printWin.close(); };
}
