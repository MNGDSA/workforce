import { useState, useEffect, useRef } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

interface PdfViewerProps {
  url: string;
  className?: string;
}

export function PdfViewer({ url, className }: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const loadTask = pdfjsLib.getDocument(url);
    loadTask.promise
      .then((doc) => {
        setPdf(doc);
        setTotalPages(doc.numPages);
        setPage(1);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load PDF");
        setLoading(false);
      });
    return () => { loadTask.destroy(); };
  }, [url]);

  useEffect(() => {
    if (!pdf || !canvasRef.current) return;
    let cancelled = false;
    pdf.getPage(page).then((p) => {
      if (cancelled) return;
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext("2d")!;
      const scale = Math.min(
        (canvas.parentElement?.clientWidth ?? 600) / p.getViewport({ scale: 1 }).width,
        2
      );
      const viewport = p.getViewport({ scale });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      p.render({ canvasContext: ctx, viewport });
    });
    return () => { cancelled = true; };
  }, [pdf, page]);

  if (loading) {
    return (
      <div className={`flex items-center justify-center ${className ?? ""}`}>
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex items-center justify-center ${className ?? ""}`}>
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center gap-3 w-full ${className ?? ""}`}>
      <div className="w-full overflow-auto flex justify-center bg-zinc-900/50 rounded-md p-2" style={{ maxHeight: "60vh" }}>
        <canvas ref={canvasRef} className="max-w-full" />
      </div>
      {totalPages > 1 && (
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" className="h-8 w-8 border-zinc-700" disabled={page <= 1} onClick={() => setPage(p => p - 1)} data-testid="button-pdf-prev">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-zinc-300 min-w-[80px] text-center">
            Page {page} of {totalPages}
          </span>
          <Button variant="outline" size="icon" className="h-8 w-8 border-zinc-700" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} data-testid="button-pdf-next">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
