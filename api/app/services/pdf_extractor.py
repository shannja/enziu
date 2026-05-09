"""
ENZIU PDF Extractor Service
In-memory PDF text extraction using PyMuPDF (fitz).

ZERO DISK WRITE: All processing happens in memory using io.BytesIO.
No document content is ever written to disk.

Supports:
- Large documents (up to 500 pages / 50MB+)
- Chunked processing with progress callbacks
- Scanned document detection
- Metadata extraction (page count, file size)
"""

from __future__ import annotations

import gc
import io
import json
import logging
import re
import time
from typing import Any, Callable, Optional

try:
    import fitz  # PyMuPDF
except ImportError:
    raise ImportError(
        "PyMuPDF (fitz) is required. Install with: pip install pymupdf"
    )

from ..config import settings

# Configure logging for PDF extraction
logger = logging.getLogger("pdf_extractor")
logger.setLevel(logging.DEBUG if settings.debug else logging.INFO)

# ── Printed page number stripping ────────────────────────────────────────
# Insurance policy PDFs often have a printed page number (e.g., "8") that
# differs from the physical PDF page index.  This regex strips standalone
# leading numbers, "Page X of Y", and bare "X / Y" footers so the LLM sees
# only the JSON page_number field — never a conflicting in-text number.
_PRINTED_PAGE_RE = re.compile(
    r"^\s*\d{1,4}\s*\n",  # "8\n" — bare printed page number at top
)

_PAGE_HEADER_RE = re.compile(
    r"^\s*Page\s+\d{1,4}\s+of\s+\d{1,4}\s*\n",  # "Page 8 of 24\n"
    re.IGNORECASE,
)

_PAGE_FOOTER_RE = re.compile(
    r"\n\s*\d{1,4}\s*\/\s*\d{1,4}\s*$",  # trailing "8 / 24"
)

def _strip_printed_page_number(text: str) -> str:
    """Remove printed page numbers and headers from extracted page text."""
    if not text:
        return text
    cleaned = _PRINTED_PAGE_RE.sub("", text)
    cleaned = _PAGE_HEADER_RE.sub("", cleaned)
    cleaned = _PAGE_FOOTER_RE.sub("", cleaned)
    return cleaned


class PDFMetadata:
    """Metadata about a PDF document."""
    
    def __init__(
        self,
        page_count: int,
        file_size: int,
        is_scanned: bool = False,
        text_density: float = 0.0,
        empty_pages: int = 0,
    ):
        self.page_count = page_count
        self.file_size = file_size
        self.is_scanned = is_scanned
        self.text_density = text_density
        self.empty_pages = empty_pages
    
    def to_dict(self) -> dict[str, Any]:
        return {
            "page_count": self.page_count,
            "file_size": self.file_size,
            "file_size_mb": round(self.file_size / (1024 * 1024), 2),
            "is_scanned": self.is_scanned,
            "text_density": self.text_density,
            "empty_pages": self.empty_pages,
        }


class PDFExtractor:
    """
    Memory-safe PDF text extraction service.
    
    All operations use io.BytesIO buffers - no files are written to disk.
    Supports large documents with chunked processing and progress callbacks.
    """
    
    def __init__(self, max_pages: int = 500) -> None:
        """
        Initialize the PDF extractor.
        
        Args:
            max_pages: Maximum number of pages to extract (safety limit)
        """
        self.max_pages = max_pages
    
    def extract_text(self, buffer: io.BytesIO) -> str:
        """
        Extract all text from a PDF buffer.
        
        Args:
            buffer: io.BytesIO buffer containing PDF data
            
        Returns:
            Extracted text as a single string
        """
        start_time = time.time()
        buffer_size = buffer.tell()
        buffer.seek(0, 2)
        buffer_size = buffer.tell()
        buffer.seek(0)
        
        logger.debug(f"Starting PDF text extraction - buffer size: {buffer_size} bytes")
        
        # Open PDF from memory buffer
        doc = fitz.open(stream=buffer, filetype="pdf")
        total_pages = len(doc)
        logger.debug(f"PDF opened successfully - total pages: {total_pages}, extracting up to {self.max_pages} pages")
        
        try:
            # Limit pages for safety
            pages_to_extract = min(len(doc), self.max_pages)
            logger.debug(f"Pages to extract: {pages_to_extract}/{total_pages}")
            
            text_parts: list[str] = []
            total_chars = 0
            
            for page_num in range(pages_to_extract):
                page_start = time.time()
                page = doc[page_num]
                text = page.get_text("text")
                page_time = time.time() - page_start
                
                if text.strip():
                    cleaned = _strip_printed_page_number(text)
                    char_count = len(cleaned)
                    total_chars += char_count
                    text_parts.append(f"[Page {page_num + 1}]\n{cleaned}")
                    logger.debug(f"Page {page_num + 1} extracted - {char_count} chars (stripped) in {page_time:.3f}s")
                else:
                    logger.debug(f"Page {page_num + 1} - no text content")
            
            elapsed = time.time() - start_time
            logger.info(f"PDF text extraction completed - {pages_to_extract} pages, {total_chars} total chars, {elapsed:.3f}s")
            
            return "\n\n".join(text_parts)
        
        finally:
            # Close document - no files left open
            doc.close()
            logger.debug("PDF document closed")
    
    def extract_text_by_page(self, buffer: io.BytesIO) -> dict[int, str]:
        """
        Extract text organized by page number.
        
        Args:
            buffer: io.BytesIO buffer containing PDF data
            
        Returns:
            Dictionary mapping page numbers (1-indexed) to text content
        """
        start_time = time.time()
        logger.debug("Starting page-by-page PDF extraction")
        
        doc = fitz.open(stream=buffer, filetype="pdf")
        total_pages = len(doc)
        logger.debug(f"PDF opened - {total_pages} pages")
        
        try:
            pages_to_extract = min(len(doc), self.max_pages)
            result: dict[int, str] = {}
            total_chars = 0
            
            for page_num in range(pages_to_extract):
                page = doc[page_num]
                text = page.get_text("text")
                if text.strip():
                    cleaned = _strip_printed_page_number(text)
                    result[page_num + 1] = cleaned
                    total_chars += len(cleaned)
            
            elapsed = time.time() - start_time
            logger.info(f"Page-by-page extraction completed - {len(result)} pages with text, {total_chars} chars, {elapsed:.3f}s")
            
            return result
        
        finally:
            doc.close()
            logger.debug("PDF document closed")
    
    def extract_with_positions(
        self, buffer: io.BytesIO
    ) -> list[dict[str, Any]]:
        """
        Extract text with position information for highlighting.
        
        Args:
            buffer: io.BytesIO buffer containing PDF data
            
        Returns:
            List of dicts with text, page, and bounding box positions
        """
        start_time = time.time()
        logger.debug("Starting PDF extraction with positions")
        
        doc = fitz.open(stream=buffer, filetype="pdf")
        total_pages = len(doc)
        logger.debug(f"PDF opened - {total_pages} pages")
        
        try:
            pages_to_extract = min(len(doc), self.max_pages)
            result: list[dict[str, Any]] = []
            total_blocks = 0
            
            for page_num in range(pages_to_extract):
                page = doc[page_num]
                
                # Extract text blocks with positions
                blocks = page.get_text("dict")["blocks"]
                page_blocks = sum(1 for b in blocks if b["type"] == 0)
                total_blocks += page_blocks
                
                for block in blocks:
                    if block["type"] == 0:  # Text block
                        for line in block["lines"]:
                            for span in line["spans"]:
                                text = span["text"].strip()
                                if text:
                                    result.append({
                                        "text": text,
                                        "page": page_num + 1,
                                        "bbox": span["bbox"],
                                        "font": span["font"],
                                        "size": span["size"],
                                    })
            
            elapsed = time.time() - start_time
            logger.info(f"Position extraction completed - {len(result)} text spans, {total_blocks} blocks, {elapsed:.3f}s")
            
            return result
        
        finally:
            doc.close()
            logger.debug("PDF document closed")
    
    def get_metadata(self, buffer: io.BytesIO) -> PDFMetadata:
        """
        Get PDF metadata including page count, file size, and scan detection.
        
        This is a fast operation that doesn't extract full text.
        
        Args:
            buffer: io.BytesIO buffer containing PDF data
            
        Returns:
            PDFMetadata object with document information
        """
        start_time = time.time()
        buffer.seek(0, 2)
        file_size = buffer.tell()
        buffer.seek(0)
        
        logger.debug(f"Getting PDF metadata - buffer size: {file_size} bytes")
        
        doc = fitz.open(stream=buffer, filetype="pdf")
        page_count = len(doc)
        
        try:
            # Check text density on first few pages for scan detection
            pages_to_check = min(5, page_count)
            total_text_chars = 0
            empty_pages = 0
            
            for page_num in range(pages_to_check):
                page = doc[page_num]
                text = page.get_text("text")
                if text.strip():
                    total_text_chars += len(text)
                else:
                    empty_pages += 1
            
            # Calculate text density (chars per page average)
            text_density = total_text_chars / pages_to_check if pages_to_check > 0 else 0
            
            # Consider it scanned if very low text density
            is_scanned = text_density < 100 or empty_pages == pages_to_check
            
            if is_scanned:
                logger.warning(
                    f"PDF appears to be scanned - text_density={text_density:.1f}, "
                    f"empty_pages={empty_pages}/{pages_to_check}"
                )
            
            elapsed = time.time() - start_time
            logger.info(
                f"PDF metadata extracted - pages={page_count}, "
                f"size={file_size} bytes, is_scanned={is_scanned}"
            )
            
            return PDFMetadata(
                page_count=page_count,
                file_size=file_size,
                is_scanned=is_scanned,
                text_density=text_density,
                empty_pages=empty_pages,
            )
        
        finally:
            doc.close()
            gc.collect()
    
    def extract_text_chunked(
        self,
        buffer: io.BytesIO,
        progress_callback: Optional[Callable[[int, int], None]] = None,
        chunk_size: int = 50,
    ) -> str:
        """
        Extract text in chunks with progress callback for large documents.
        
        Args:
            buffer: io.BytesIO buffer containing PDF data
            progress_callback: Optional callback(current_page, total_pages)
            chunk_size: Number of pages to process before calling back
            
        Returns:
            Extracted text as a single string
        """
        start_time = time.time()
        buffer.seek(0, 2)
        buffer_size = buffer.tell()
        buffer.seek(0)
        
        logger.info(f"Starting chunked PDF extraction - size: {buffer_size} bytes")
        
        doc = fitz.open(stream=buffer, filetype="pdf")
        total_pages = len(doc)
        pages_to_extract = min(total_pages, self.max_pages)
        
        try:
            text_parts: list[str] = []
            total_chars = 0
            pages_with_text = 0
            empty_pages = 0
            
            for page_num in range(pages_to_extract):
                page = doc[page_num]
                text = page.get_text("text")
                
                if text.strip():
                    cleaned = _strip_printed_page_number(text)
                    char_count = len(cleaned)
                    total_chars += char_count
                    pages_with_text += 1
                    text_parts.append(f"[Page {page_num + 1}]\n{cleaned}")
                else:
                    empty_pages += 1
                
                # Call progress callback every chunk_size pages
                if progress_callback and (page_num + 1) % chunk_size == 0:
                    progress_callback(page_num + 1, pages_to_extract)
            
            # Final progress update
            if progress_callback:
                progress_callback(pages_to_extract, pages_to_extract)
            
            elapsed = time.time() - start_time
            logger.info(
                f"Chunked extraction completed - {pages_to_extract} pages, "
                f"{total_chars} chars, {elapsed:.3f}s"
            )
            
            return "\n\n".join(text_parts)
        
        finally:
            doc.close()
            gc.collect()
    
    def extract_text_json(self, buffer: io.BytesIO) -> str:
        """
        Extract text as a JSON array of pages for LLM consumption.
        Each page is a dict with page_number and text, giving the LLM
        explicit page boundaries for accurate citations.
        
        Args:
            buffer: io.BytesIO buffer containing PDF data
            
        Returns:
            JSON string: [{"page_number": 1, "text": "..."}, ...]
        """
        start_time = time.time()
        logger.debug("Starting JSON page extraction")
        
        pages = self.extract_text_by_page(buffer)
        result = [
            {"page_number": page, "text": text}
            for page, text in sorted(pages.items())
        ]
        
        logger.info(
            f"JSON extraction completed — {len(result)} pages, "
            f"{sum(len(p['text']) for p in result)} total chars, "
            f"{time.time() - start_time:.3f}s"
        )
        
        return json.dumps(result, ensure_ascii=False)


    def get_page_count(self, buffer: io.BytesIO) -> int:
        """
        Get the total number of pages in the PDF.
        
        Args:
            buffer: io.BytesIO buffer containing PDF data
            
        Returns:
            Number of pages
        """
        logger.debug("Getting PDF page count")
        doc = fitz.open(stream=buffer, filetype="pdf")
        
        try:
            page_count = len(doc)
            logger.debug(f"PDF page count: {page_count}")
            return page_count
        finally:
            doc.close()
    
    def search_text(
        self, buffer: io.BytesIO, search_term: str
    ) -> list[dict[str, Any]]:
        """
        Search for text within the PDF and return positions.
        
        Args:
            buffer: io.BytesIO buffer containing PDF data
            search_term: Text to search for
            
        Returns:
            List of matches with page numbers and positions
        """
        start_time = time.time()
        logger.debug(f"Searching PDF for term: '{search_term}'")
        
        doc = fitz.open(stream=buffer, filetype="pdf")
        total_pages = len(doc)
        
        try:
            pages_to_extract = min(len(doc), self.max_pages)
            matches: list[dict[str, Any]] = []
            
            for page_num in range(pages_to_extract):
                page = doc[page_num]
                
                # Search for text
                text_instances = page.search_for(search_term)
                
                if text_instances:
                    logger.debug(f"Found {len(text_instances)} matches on page {page_num + 1}")
                
                for inst in text_instances:
                    matches.append({
                        "page": page_num + 1,
                        "bbox": {
                            "x0": inst.x0,
                            "y0": inst.y0,
                            "x1": inst.x1,
                            "y1": inst.y1,
                        },
                        "text": search_term,
                    })
            
            elapsed = time.time() - start_time
            logger.info(f"Text search completed - found {len(matches)} matches in {elapsed:.3f}s")
            
            return matches
        
        finally:
            doc.close()
            logger.debug("PDF document closed")
