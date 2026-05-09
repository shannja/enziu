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
function normalizeForMatch(text: string): string {
  return text
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
    .replace(/[\u2013\u2014\u2015]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ")
    .replace(/\u00AD/g, "")
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, "")
    .replace(/\uFB00/g, "ff")
    .replace(/\uFB01/g, "fi")
    .replace(/\uFB02/g, "fl")
    .replace(/\uFB03/g, "ffi")
    .replace(/\uFB04/g, "ffl")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function PDFViewer({ pdfData, currentPage: externalPage, highlightExcerpt, onPageChange }: PDFViewerProps) {
  const [numPages, setNumPages]     = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale]           = useState(1.0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  // Debounce timer ref for MutationObserver-triggered highlight attempts
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track which pages have been searched for excerpt
  const searchedPagesRef = useRef<Set<number>>(new Set());

  const onDocLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    const start = externalPage && externalPage <= numPages ? externalPage : 1;
    setPageNumber(start);
  }, [externalPage]);

  // Sync external page (only when no excerpt search is needed)
  useEffect(() => {
    if (!externalPage || externalPage > numPages || externalPage === pageNumber) return;
    if (highlightExcerpt) return; // Let excerpt search handle navigation
    setPageNumber(externalPage);
    onPageChange?.(externalPage);
  }, [externalPage, numPages, highlightExcerpt]);

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
  //
  // FIX: The original code used `normalized.join(" ")` and then tracked charCount
  // by adding `spanLen + 1` for every span — including empty/whitespace-only ones.
  // Empty normalized spans produce "" which still inserts a " " in the joined
  // string (e.g. ["a", "", "b"].join(" ") === "a  b"), but the needle is
  // normalized with collapsed whitespace so it will never contain double spaces.
  // This caused the character offsets to drift, making the match fail or highlight
  // the wrong spans.
  //
  // Fix: Filter out empty-normalized spans before building the joined string and
  // the offset index. We work only with non-empty spans, so the joined string
  // exactly mirrors how the needle was normalized (single spaces between tokens).
  //
  // Secondary fix: debounce the MutationObserver callback so we don't attempt
  // highlighting mid-render when the text layer is only partially populated.

  const applyHighlight = useCallback(() => {
    if (!highlightExcerpt) return;

    const needle = normalizeForMatch(highlightExcerpt);
    if (!needle || needle.length < 5) return;

    const containers = document.querySelectorAll(".react-pdf__Page__textContent");
    containers.forEach((container) => {
      // Clear previous highlights
      container.querySelectorAll<HTMLElement>("[data-enziu-hl]").forEach((el) => {
        el.style.backgroundColor = "";
        el.style.borderRadius = "";
        el.removeAttribute("data-enziu-hl");
      });

      const allSpans = Array.from(container.querySelectorAll<HTMLElement>("span"));
      if (!allSpans.length) return;

      // --- KEY FIX ---
      // Build a filtered list that excludes spans whose normalized text is empty.
      // This ensures the joined string and char-offset tracking stay in sync with
      // the needle (which also has collapsed whitespace, no empty tokens).
      const spans: HTMLElement[] = [];
      const normalized: string[] = [];
      for (const span of allSpans) {
        const n = normalizeForMatch(span.textContent ?? "");
        if (n.length > 0) {
          spans.push(span);
          normalized.push(n);
        }
      }

      if (!spans.length) return;

      // Join with single space — matches how normalizeForMatch collapses whitespace
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
    // charCount tracks position in the joined string.
    // Each span contributes normalized[i].length chars, plus 1 for the joining
    // space (except after the last span). Since we filtered empty spans above,
    // every entry here has length > 0 so the math is consistent.
    let charCount = 0;
    let firstHighlighted: HTMLElement | null = null;

    for (let i = 0; i < spans.length; i++) {
      const spanLen = normalized[i].length;
      const spanStart = charCount;
      const spanEnd   = charCount + spanLen;
      // Advance by spanLen + 1 (the joining space), except for the last span
      charCount += spanLen + (i < spans.length - 1 ? 1 : 0);

      if (spanEnd > start && spanStart < end) {
        spans[i].style.backgroundColor = "rgba(252, 211, 77, 0.40)";
        spans[i].style.borderRadius = "2px";
        spans[i].setAttribute("data-enziu-hl", "true");
        if (!firstHighlighted) firstHighlighted = spans[i];
      }
    }

    firstHighlighted?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // ─── Cross-page excerpt search ──────────────────────────────────────────────
  // When an excerpt is provided, search for it across ALL pages to find the
  // correct page (handles cover pages, TOC, etc. that cause page offset issues).
  useEffect(() => {
    if (!highlightExcerpt || numPages === 0) return;

    const needle = normalizeForMatch(highlightExcerpt);
    if (!needle || needle.length < 5) {
      // If excerpt is too short, just navigate to the external page as fallback
      if (externalPage && externalPage <= numPages) {
        setPageNumber(externalPage);
        onPageChange?.(externalPage);
      }
      return;
    }

    // Reset searched pages tracking
    searchedPagesRef.current = new Set();
    setIsSearching(true);

    let cancelled = false;
    let foundPage = false;

    // Try to find excerpt on current page first
    const tryHighlightCurrentPage = () => {
      const containers = document.querySelectorAll(".react-pdf__Page__textContent");
      for (const container of containers) {
        const allSpans = Array.from(container.querySelectorAll<HTMLElement>("span"));
        if (!allSpans.length) continue;

        const spans: HTMLElement[] = [];
        const normalized: string[] = [];
        for (const span of allSpans) {
          const n = normalizeForMatch(span.textContent ?? "");
          if (n.length > 0) {
            spans.push(span);
            normalized.push(n);
          }
        }

        if (!spans.length) continue;
        const joined = normalized.join(" ");

        if (joined.includes(needle)) {
          foundPage = true;
          setIsSearching(false);
          // Highlight will be applied by the existing highlight effect
          return true;
        }

        // Try shorter prefix as fallback
        const shortNeedle = needle.slice(0, Math.min(60, needle.length));
        if (shortNeedle.length >= 10 && joined.includes(shortNeedle)) {
          foundPage = true;
          setIsSearching(false);
          return true;
        }
      }
      return false;
    };

    // Check current page first
    const checkAndSearch = async () => {
      // Give the page a moment to render
      await new Promise(resolve => setTimeout(resolve, 100));

      if (cancelled) return;

      // Try current page
      if (tryHighlightCurrentPage()) {
        return;
      }

      // Search other pages sequentially
      for (let page = 1; page <= numPages; page++) {
        if (cancelled || foundPage) break;
        if (page === pageNumber) continue; // Already checked current page

        searchedPagesRef.current.add(page);
        setPageNumber(page);

        // Wait for page to render
        await new Promise(resolve => setTimeout(resolve, 200));

        if (cancelled) return;

        if (tryHighlightCurrentPage()) {
          break;
        }
      }

      // If not found, go back to external page or page 1
      if (!foundPage && !cancelled) {
        const fallbackPage = externalPage && externalPage <= numPages ? externalPage : 1;
        setPageNumber(fallbackPage);
        onPageChange?.(fallbackPage);
      }

      setIsSearching(false);
    };

    checkAndSearch();

    return () => {
      cancelled = true;
    };
  }, [highlightExcerpt, numPages]);

  // Apply highlight on excerpt/page change; re-apply when text layer renders.
  // FIX: Debounce the MutationObserver callback so we don't try to highlight
  // a partially-rendered text layer (which would find 0 spans and give up).
  useEffect(() => {
    if (!highlightExcerpt) return;

    // Attempt immediately — text layer may already be present (e.g. cached page)
    applyHighlight();

    const scheduleHighlight = () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = setTimeout(() => {
        applyHighlight();
      }, 80); // 80 ms debounce — enough for react-pdf to finish appending spans
    };

    const observer = new MutationObserver(scheduleHighlight);
    if (containerRef.current) {
      observer.observe(containerRef.current, { childList: true, subtree: true });
    }
    return () => {
      observer.disconnect();
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    };
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
          <Button variant="ghost" size="sm" onClick={() => goToPage(pageNumber - 1)} disabled={pageNumber <= 1 || isSearching}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground min-w-[80px] text-center">
            {isSearching ? (
              <span className="flex items-center justify-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                Searching...
              </span>
            ) : (
              `Page ${pageNumber} of ${numPages || "…"}`
            )}
          </span>
          <Button variant="ghost" size="sm" onClick={() => goToPage(pageNumber + 1)} disabled={pageNumber >= numPages || isSearching}>
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