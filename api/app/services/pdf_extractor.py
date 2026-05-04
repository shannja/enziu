"""
ENZIU PDF Extractor Service
In-memory PDF text extraction using PyMuPDF (fitz).

ZERO DISK WRITE: All processing happens in memory using io.BytesIO.
No document content is ever written to disk.
"""

from __future__ import annotations

import io
from typing import Any

try:
    import fitz  # PyMuPDF
except ImportError:
    raise ImportError(
        "PyMuPDF (fitz) is required. Install with: pip install pymupdf"
    )


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
        # Open PDF from memory buffer
        doc = fitz.open(stream=buffer, filetype="pdf")
        
        try:
            # Limit pages for safety
            pages_to_extract = min(len(doc), self.max_pages)
            
            text_parts: list[str] = []
            for page_num in range(pages_to_extract):
                page = doc[page_num]
                text = page.get_text("text")
                if text.strip():
                    text_parts.append(f"[Page {page_num + 1}]\n{text}")
            
            return "\n\n".join(text_parts)
        
        finally:
            # Close document - no files left open
            doc.close()
    
    def extract_text_by_page(self, buffer: io.BytesIO) -> dict[int, str]:
        """
        Extract text organized by page number.
        
        Args:
            buffer: io.BytesIO buffer containing PDF data
            
        Returns:
            Dictionary mapping page numbers (1-indexed) to text content
        """
        doc = fitz.open(stream=buffer, filetype="pdf")
        
        try:
            pages_to_extract = min(len(doc), self.max_pages)
            result: dict[int, str] = {}
            
            for page_num in range(pages_to_extract):
                page = doc[page_num]
                text = page.get_text("text")
                if text.strip():
                    result[page_num + 1] = text
            
            return result
        
        finally:
            doc.close()
    
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
        doc = fitz.open(stream=buffer, filetype="pdf")
        
        try:
            pages_to_extract = min(len(doc), self.max_pages)
            result: list[dict[str, Any]] = []
            
            for page_num in range(pages_to_extract):
                page = doc[page_num]
                
                # Extract text blocks with positions
                blocks = page.get_text("dict")["blocks"]
                
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
        
            return result
        
        finally:
            doc.close()
    
    def get_page_count(self, buffer: io.BytesIO) -> int:
        """
        Get the total number of pages in the PDF.
        
        Args:
            buffer: io.BytesIO buffer containing PDF data
            
        Returns:
            Number of pages
        """
        doc = fitz.open(stream=buffer, filetype="pdf")
        
        try:
            return len(doc)
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
        doc = fitz.open(stream=buffer, filetype="pdf")
        
        try:
            pages_to_extract = min(len(doc), self.max_pages)
            matches: list[dict[str, Any]] = []
            
            for page_num in range(pages_to_extract):
                page = doc[page_num]
                
                # Search for text
                text_instances = page.search_for(search_term)
                
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
            
            return matches
        
        finally:
            doc.close()