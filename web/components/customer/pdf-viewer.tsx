"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize, Minimize } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PDFViewerProps {
  pdfData?: string;
  currentPage?: number;
  highlightExcerpt?: string;
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
  getTextContent: () => Promise<{ items: Array<{ str: string; transform: number[]; width: number; height: number }> }>;
}
interface PDFViewport { width: number; height: number; }
interface RenderContext { canvasContext: CanvasRenderingContext2D; viewport: PDFViewport; }
interface RenderTask { promise: Promise<void>; }

const PDFJS_VERSION = "3.11.174";
const PDFJS_CDN = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}`;

export function PDFViewer({ pdfData, currentPage: externalPage, highlightExcerpt, onPageChange }: PDFViewerProps) {
  const [libReady, setLibReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
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

    // Measure the scroll wrapper to get a stable container width.
    // p-4 on both sides = 32px subtracted so the page doesn't cause a horizontal scrollbar at 100%.
    let containerWidth = (scrollRef.current?.clientWidth ?? 0) - 32;
    
    // First-page retry: if container hasn't laid out yet, wait 50ms and try once more
    if (containerWidth <= 0) {
      await new Promise(r => setTimeout(r, 50));
      containerWidth = (scrollRef.current?.clientWidth ?? 800) - 32;
    }
    if (containerWidth <= 0) containerWidth = 800 - 32; // fallback

    const baseViewport = page.getViewport({ scale: 1 });
    const fitScale = containerWidth / baseViewport.width; // fills width at userScale=1.0
    const finalScale = fitScale * userScale;              // user zoom multiplies on top

    const viewport = page.getViewport({ scale: finalScale });
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    // Resize overlay canvas to match
    if (overlayCanvasRef.current) {
      overlayCanvasRef.current.height = canvas.height;
      overlayCanvasRef.current.width = canvas.width;
    }

    const task = page.render({ canvasContext: ctx, viewport });
    renderTaskRef.current = task;
    await task.promise;
    renderTaskRef.current = null;

    // Draw highlights on overlay if excerpt is set
    if (highlightExcerpt && overlayCanvasRef.current) {
      await drawHighlights(page, finalScale, highlightExcerpt);
    }
  }, [highlightExcerpt]);

  // ── Highlight drawing ────────────────────────────────────────────────────
  const drawHighlights = useCallback(async (page: PDFPage, finalScale: number, excerpt: string) => {
    const overlay = overlayCanvasRef.current;
    if (!overlay) return;
    
    const octx = overlay.getContext("2d");
    if (!octx) return;
    
    // Clear previous highlights
    octx.clearRect(0, 0, overlay.width, overlay.height);
    
    try {
      const textContent = await page.getTextContent();
      const searchStr = excerpt.toLowerCase().replace(/\s+/g, " ").trim();
      if (!searchStr) return;
      
      // Build full text string and map characters to items/positions
      const items = textContent.items;
      let fullText = "";
      const charMap: Array<{ itemIdx: number; charIdx: number }> = [];
      
      for (let i = 0; i < items.length; i++) {
        const str = items[i].str;
        for (let j = 0; j < str.length; j++) {
          fullText += str[j];
          charMap.push({ itemIdx: i, charIdx: j });
        }
        // Add space between items except when already has trailing space
        if (i < items.length - 1) {
          const next = items[i + 1];
          if (next.str && next.str.length > 0 && next.str[0] !== " ") {
            fullText += " ";
            charMap.push({ itemIdx: i, charIdx: -1 }); // space marker
          }
        }
      }
      
      // Normalize full text for matching
      const normalizedFull = fullText.toLowerCase().replace(/\s+/g, " ").trim();
      const startIdx = normalizedFull.indexOf(searchStr);
      if (startIdx === -1) return;

      const endIdx = startIdx + searchStr.length;
      
      // Map back to item positions and draw rectangles
      octx.fillStyle = "rgba(255, 222, 89, 0.35)";
      octx.strokeStyle = "rgba(255, 145, 77, 0.7)";
      octx.lineWidth = 1;
      
      let currentItemIdx = -1;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      
      const flushRect = () => {
        if (currentItemIdx === -1 || minX === Infinity) return;
        const item = items[currentItemIdx];
        const tx = item.transform;
        // Adjust for viewport scale
        const x = minX * finalScale;
        const y = minY * finalScale;
        const w = (maxX - minX) * finalScale;
        const h = (maxY - minY) * finalScale;
        octx.fillRect(x, y, Math.max(w, 2), h + 2);
        octx.strokeRect(x, y, Math.max(w, 2), h + 2);
      };
      
      for (let i = startIdx; i < endIdx && i < charMap.length; i++) {
        const { itemIdx, charIdx } = charMap[i];
        if (charIdx === -1) {
          flushRect();
          currentItemIdx = -1;
          minX = Infinity; maxX = -Infinity;
          continue;
        }
        
        if (itemIdx !== currentItemIdx) {
          flushRect();
          currentItemIdx = itemIdx;
          minX = Infinity; maxX = -Infinity;
        }
        
        const item = items[itemIdx];
        if (item.width && charIdx < item.str.length) {
          const charWidth = item.width / item.str.length;
          const charX = item.transform[4] + charIdx * charWidth;
          const charY = item.transform[5];
          minX = Math.min(minX, charX);
          minY = Math.min(minY, charY);
          maxX = Math.max(maxX, charX + charWidth);
          maxY = Math.max(maxY, charY + (item.height || 12));
        }
      }
      flushRect();
    } catch (e) {
      console.warn("Highlight drawing failed:", e);
    }
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

  // ── 6. Re-render when loading completes (fixes first-page after async load) ──
  useEffect(() => {
    if (!isLoading && pdfDocRef.current) {
      requestAnimationFrame(() => {
        renderPage(currentPage, pdfDocRef.current!, scale).catch(console.error);
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

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
    } else {
      document.exitFullscreen();
    }
  };

  // ── Fullscreen change handler: re-render at new container size ───────────
  useEffect(() => {
    const onFullscreenChange = () => {
      const nowFullscreen = !!document.fullscreenElement;
      setIsFullscreen(nowFullscreen);
      // Wait for layout to settle after fullscreen transition, then re-render
      if (pdfDocRef.current) {
        setTimeout(() => {
          renderPage(currentPage, pdfDocRef.current!, scale).catch(console.error);
        }, 150);
      }
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, [currentPage, scale, renderPage]);

  // ── ResizeObserver: re-render when container width changes ───────────────
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const observer = new ResizeObserver(() => {
      if (pdfDocRef.current) {
        renderPage(currentPage, pdfDocRef.current, scale).catch(console.error);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [currentPage, scale, renderPage]);

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