"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize, Minimize } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PDFViewerProps {
  pdfData?: string;
  currentPage?: number;
  onPageChange?: (page: number) => void;
}

declare global {
  interface Window {
    pdfjsLib?: {
      GlobalWorkerOptions: { workerSrc: string };
      getDocument: (src: string | Uint8Array) => { promise: Promise<PDFDocument> };
    };
  }
}

interface PDFDocument {
  numPages: number;
  getPage: (pageNum: number) => Promise<PDFPage>;
  cleanup: () => boolean;
}
interface PDFPage {
  getViewport: (options: { scale: number }) => PDFViewport;
  render: (ctx: RenderContext) => RenderTask;
}
interface PDFViewport { width: number; height: number; }
interface RenderContext { canvasContext: CanvasRenderingContext2D; viewport: PDFViewport; }
interface RenderTask { promise: Promise<void>; }

const PDFJS_VERSION = "3.11.174";
const PDFJS_CDN = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}`;

export function PDFViewer({ pdfData, currentPage: externalPage, onPageChange }: PDFViewerProps) {
  const [libReady, setLibReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  // scrollRef wraps the canvas — its width is the stable reference for fitScale
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<PDFDocument | null>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);

  // ── 1. Load PDF.js ───────────────────────────────────────────────────────
  useEffect(() => {
    if (window.pdfjsLib) { setLibReady(true); return; }

    let cancelled = false;
    const script = document.createElement("script");
    script.src = `${PDFJS_CDN}/pdf.min.js`;
    script.async = true;
    script.onload = () => {
      if (cancelled || !window.pdfjsLib) return;
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS_CDN}/pdf.worker.min.js`;
      setLibReady(true);
    };
    script.onerror = () => { if (!cancelled) setError("Failed to load PDF renderer."); };
    document.body.appendChild(script);
    return () => { cancelled = true; };
  }, []);

  // ── 2. Render a page ─────────────────────────────────────────────────────
  const renderPage = useCallback(async (pageNum: number, doc: PDFDocument, userScale: number) => {
    if (!canvasRef.current) return;

    if (renderTaskRef.current) {
      try { await renderTaskRef.current.promise; } catch (_) {}
      renderTaskRef.current = null;
    }

    const page = await doc.getPage(pageNum);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Measure the scroll wrapper (not the canvas) to get a stable container width.
    // p-4 on both sides = 32px subtracted so the page doesn't cause a horizontal scrollbar at 100%.
    const containerWidth = (scrollRef.current?.clientWidth ?? 800) - 32;
    const baseViewport = page.getViewport({ scale: 1 });
    const fitScale = containerWidth / baseViewport.width; // fills width at userScale=1.0
    const finalScale = fitScale * userScale;              // user zoom multiplies on top

    const viewport = page.getViewport({ scale: finalScale });
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    const task = page.render({ canvasContext: ctx, viewport });
    renderTaskRef.current = task;
    await task.promise;
    renderTaskRef.current = null;
  }, []);

  // ── 3. Load PDF document ─────────────────────────────────────────────────
  useEffect(() => {
    if (!libReady || !pdfData || !window.pdfjsLib) return;

    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      setError(null);
      if (pdfDocRef.current) { pdfDocRef.current.cleanup(); pdfDocRef.current = null; }

      try {
        const base64 = pdfData.includes(",") ? pdfData.split(",")[1] : pdfData;
        const binary = atob(base64);
        const uint8 = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) uint8[i] = binary.charCodeAt(i);

        const pdfDoc = await window.pdfjsLib!.getDocument(uint8).promise;
        if (cancelled) return;

        pdfDocRef.current = pdfDoc;
        setNumPages(pdfDoc.numPages);
        const startPage = externalPage && externalPage <= pdfDoc.numPages ? externalPage : 1;
        setCurrentPage(startPage);
        // Defer first render until DOM has laid out (fixes first-page blank issue)
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        await renderPage(startPage, pdfDoc, scale);
        if (!cancelled) setIsLoading(false);
      } catch (err) {
        if (!cancelled) {
          console.error("PDF load error:", err);
          setError("Failed to load PDF.");
          setIsLoading(false);
        }
      }
    };

    load();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libReady, pdfData]);

  // ── 4. Re-render on scale change ─────────────────────────────────────────
  useEffect(() => {
    if (!pdfDocRef.current) return;
    renderPage(currentPage, pdfDocRef.current, scale).catch(console.error);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale]);

  // ── 5. Sync external page prop ───────────────────────────────────────────
  useEffect(() => {
    if (!pdfDocRef.current || !externalPage) return;
    if (externalPage === currentPage || externalPage > numPages) return;
    setCurrentPage(externalPage);
    renderPage(externalPage, pdfDocRef.current, scale).catch(console.error);
    onPageChange?.(externalPage);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalPage]);

  // ── Navigation ───────────────────────────────────────────────────────────
  const goToPage = useCallback((page: number) => {
    if (!pdfDocRef.current || page < 1 || page > numPages) return;
    setCurrentPage(page);
    renderPage(page, pdfDocRef.current, scale).catch(console.error);
    onPageChange?.(page);
  }, [numPages, renderPage, scale, onPageChange]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft"  || e.key === "PageUp")   goToPage(currentPage - 1);
      if (e.key === "ArrowRight" || e.key === "PageDown") goToPage(currentPage + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [currentPage, goToPage]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-secondary/30 rounded-lg">
        <div className="text-center p-8">
          <p className="text-muted-foreground mb-2">{error}</p>
          <p className="text-xs text-muted-foreground">Ensure you uploaded a valid digital PDF (not scanned).</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative flex flex-col h-full bg-secondary/30 rounded-lg overflow-hidden border border-border"
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-background border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground min-w-[80px] text-center">
            Page {currentPage} of {numPages || "…"}
          </span>
          <Button variant="ghost" size="sm" onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= numPages}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setScale(s => Math.max(+(s - 0.25).toFixed(2), 0.25))} disabled={scale <= 0.25}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground min-w-[44px] text-center">
            {Math.round(scale * 100)}%
          </span>
          <Button variant="ghost" size="sm" onClick={() => setScale(s => Math.min(+(s + 0.25).toFixed(2), 4))} disabled={scale >= 4}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setScale(1)} title="Reset zoom">
            <Minimize className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={toggleFullscreen} title="Fullscreen">
            <Maximize className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/*
        Scroll container — overflow-auto so the canvas can overflow when zoomed in.
        items-start (not items-center) so tall pages don't get clipped at top.
      */}
      <div ref={scrollRef} className="flex-1 overflow-auto flex items-start justify-center p-4">
        {isLoading ? (
          <div className="flex flex-col items-center gap-4 mt-16">
            <div className="w-8 h-8 border-4 border-brand-amber border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">
              {libReady ? "Rendering PDF…" : "Loading PDF renderer…"}
            </p>
          </div>
        ) : (
          // No max-w / max-h constraints — scroll container handles overflow at all zoom levels
          <canvas ref={canvasRef} className="shadow-lg rounded block" />
        )}
      </div>

      {/* Page jump */}
      <div className="flex items-center justify-center px-4 py-2 bg-background border-t border-border shrink-0">
        <input
          type="number"
          min={1}
          max={numPages}
          value={currentPage}
          onChange={e => { const p = parseInt(e.target.value); if (!isNaN(p)) goToPage(p); }}
          aria-label="Page number"
          className="w-20 px-2 py-1 text-sm text-center bg-secondary rounded border border-border"
        />
        <span className="text-xs text-muted-foreground ml-2">of {numPages} pages</span>
      </div>
    </div>
  );
}