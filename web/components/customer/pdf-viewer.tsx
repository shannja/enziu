"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize, Minimize, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;

interface PDFViewerProps {
  pdfData?: string;
  currentPage?: number;
  highlightExcerpt?: string;
  onPageChange?: (page: number) => void;
}

// ─── Normalize text for matching ─────────────────────────────────────────────
// PDFs often contain ligatures, smart quotes, non-breaking spaces, and soft
// hyphens that don't match the plain ASCII the auditor returns as an excerpt.
// We normalize both sides of the comparison identically so matching works.
function normalizeForMatch(text: string): string {
  return text
    // Smart quotes → straight
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
    // En/em dashes → hyphen
    .replace(/[\u2013\u2014\u2015]/g, "-")
    // Ellipsis → three dots
    .replace(/\u2026/g, "...")
    // Non-breaking space, soft hyphen, zero-width chars → regular space / nothing
    .replace(/\u00A0/g, " ")
    .replace(/\u00AD/g, "")
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, "")
    // Ligatures: fi, fl, ff, ffi, ffl
    .replace(/\uFB00/g, "ff")
    .replace(/\uFB01/g, "fi")
    .replace(/\uFB02/g, "fl")
    .replace(/\uFB03/g, "ffi")
    .replace(/\uFB04/g, "ffl")
    // Collapse whitespace
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function PDFViewer({ pdfData, currentPage: externalPage, highlightExcerpt, onPageChange }: PDFViewerProps) {
  const [numPages, setNumPages]     = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale]           = useState(1.0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const onDocLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    const start = externalPage && externalPage <= numPages ? externalPage : 1;
    setPageNumber(start);
  }, [externalPage]);

  // Sync external page
  useEffect(() => {
    if (!externalPage || externalPage > numPages || externalPage === pageNumber) return;
    setPageNumber(externalPage);
    onPageChange?.(externalPage);
  }, [externalPage, numPages]);

  const goToPage = useCallback((page: number) => {
    if (page < 1 || page > numPages) return;
    setPageNumber(page);
    onPageChange?.(page);
  }, [numPages, onPageChange]);

  // Keyboard nav
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft"  || e.key === "PageUp")   goToPage(pageNumber - 1);
      if (e.key === "ArrowRight" || e.key === "PageDown")  goToPage(pageNumber + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pageNumber, goToPage]);

  // Fullscreen
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) containerRef.current?.requestFullscreen();
    else document.exitFullscreen();
  };
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // ─── Highlight logic ────────────────────────────────────────────────────────
  // Strategy: collect all text spans, normalize both the joined page text and
  // the excerpt the same way, find the match range, then mark the corresponding
  // spans. We re-run whenever the excerpt or page changes, and also watch DOM
  // mutations so we catch the text layer rendering after the page loads.

  const applyHighlight = useCallback(() => {
    if (!highlightExcerpt) return;

    const needle = normalizeForMatch(highlightExcerpt);
    if (!needle) return;

    const containers = document.querySelectorAll(".react-pdf__Page__textContent");
    containers.forEach((container) => {
      // Clear previous highlights
      container.querySelectorAll<HTMLElement>("[data-enziu-hl]").forEach((el) => {
        el.style.backgroundColor = "";
        el.style.borderRadius = "";
        el.removeAttribute("data-enziu-hl");
      });

      const spans = Array.from(container.querySelectorAll<HTMLElement>("span"));
      if (!spans.length) return;

      // Build a parallel array of normalized span texts and their char offsets
      // into the joined string. We join with a single space to match how we
      // collapse whitespace in normalizeForMatch.
      const normalized: string[] = spans.map((s) => normalizeForMatch(s.textContent ?? ""));
      const joined = normalized.join(" ");

      const matchStart = joined.indexOf(needle);
      if (matchStart === -1) {
        // Fallback: try a shorter prefix (first 60 chars) in case the excerpt
        // is truncated or contains a page-break artefact mid-sentence.
        const shortNeedle = needle.slice(0, Math.min(60, needle.length));
        if (shortNeedle.length < 10) return;
        const shortMatch = joined.indexOf(shortNeedle);
        if (shortMatch === -1) return;
        highlightRange(spans, normalized, shortMatch, shortMatch + shortNeedle.length);
        return;
      }

      highlightRange(spans, normalized, matchStart, matchStart + needle.length);
    });
  }, [highlightExcerpt]);

  function highlightRange(
    spans: HTMLElement[],
    normalized: string[],
    start: number,
    end: number,
  ) {
    let charCount = 0;
    for (let i = 0; i < spans.length; i++) {
      const spanLen = normalized[i].length;
      const spanStart = charCount;
      const spanEnd   = charCount + spanLen;
      // +1 for the joining space between spans
      charCount += spanLen + 1;

      if (spanEnd > start && spanStart < end) {
        spans[i].style.backgroundColor = "rgba(252, 211, 77, 0.40)";
        spans[i].style.borderRadius = "2px";
        spans[i].setAttribute("data-enziu-hl", "true");
      }
    }

    // Scroll the first highlighted span into view
    const first = document.querySelector<HTMLElement>("[data-enziu-hl]");
    first?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // Apply highlight on excerpt/page change; re-apply when text layer mutates in
  useEffect(() => {
    if (!highlightExcerpt) return;

    // Attempt immediately (text layer may already exist)
    applyHighlight();

    const observer = new MutationObserver(applyHighlight);
    if (containerRef.current) {
      observer.observe(containerRef.current, { childList: true, subtree: true });
    }
    return () => observer.disconnect();
  }, [highlightExcerpt, pageNumber, applyHighlight]);

  if (!pdfData) {
    return (
      <div className="flex items-center justify-center h-full bg-secondary/30 rounded-lg">
        <p className="text-muted-foreground text-sm">No PDF loaded.</p>
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
          <Button variant="ghost" size="sm" onClick={() => goToPage(pageNumber - 1)} disabled={pageNumber <= 1}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground min-w-[80px] text-center">
            Page {pageNumber} of {numPages || "…"}
          </span>
          <Button variant="ghost" size="sm" onClick={() => goToPage(pageNumber + 1)} disabled={pageNumber >= numPages}>
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

      {/* PDF Content */}
      <div className="flex-1 overflow-auto flex items-start justify-center p-4">
        <Document
          file={pdfData}
          onLoadSuccess={onDocLoadSuccess}
          loading={
            <div className="flex flex-col items-center gap-4 mt-16">
              <Loader2 className="w-8 h-8 animate-spin text-brand-amber" />
              <p className="text-sm text-muted-foreground">Loading PDF…</p>
            </div>
          }
          error={
            <div className="text-center p-8">
              <p className="text-muted-foreground mb-2">Failed to load PDF.</p>
              <p className="text-xs text-muted-foreground">Ensure you uploaded a valid digital PDF (not scanned).</p>
            </div>
          }
        >
          <Page
            pageNumber={pageNumber}
            scale={scale}
            renderTextLayer={true}
            renderAnnotationLayer={true}
            className="shadow-lg rounded"
            loading={
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-brand-amber" />
              </div>
            }
          />
        </Document>
      </div>

      {/* Page jump */}
      <div className="flex items-center justify-center px-4 py-2 bg-background border-t border-border shrink-0">
        <input
          type="number"
          min={1}
          max={numPages}
          value={pageNumber}
          onChange={e => { const p = parseInt(e.target.value); if (!isNaN(p)) goToPage(p); }}
          aria-label="Page number"
          className="w-20 px-2 py-1 text-sm text-center bg-secondary rounded border border-border"
        />
        <span className="text-xs text-muted-foreground ml-2">of {numPages} pages</span>
      </div>
    </div>
  );
}