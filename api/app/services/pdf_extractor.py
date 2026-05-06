"""
ENZIU PDF Extractor Service
In-memory PDF text extraction using PyMuPDF (fitz).

ZERO DISK WRITE: All processing happens in memory using io.BytesIO.
No document content is ever written to disk.
"""

from __future__ import annotations

import io
import logging
import time
from typing import Any

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


class PDFExtractor:
    """
    Memory-safe PDF text extraction service.
    
    All operations use io.BytesIO buffers - no files are written to disk.
    """
    
    def __init__(self, max_pages: int = 100) -> None:
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
                    char_count = len(text)
                    total_chars += char_count
                    text_parts.append(f"[Page {page_num + 1}]\n{text}")
                    logger.debug(f"Page {page_num + 1} extracted - {char_count} chars in {page_time:.3f}s")
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
                    result[page_num + 1] = text
                    total_chars += len(text)
            
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
