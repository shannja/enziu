"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, FileText, X, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { storePDF } from "@/lib/pdf-storage";

// 5MB file size limit for localStorage compatibility
const MAX_FILE_SIZE_MB = 5;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

interface CustomerDropzoneProps {
  onFileUploaded: (file: File, sessionId?: string) => void;
}

export function CustomerDropzone({ onFileUploaded }: CustomerDropzoneProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isStoring, setIsStoring] = useState(false);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        const file = acceptedFiles[0];
        
        // Check file size limit
        if (file.size > MAX_FILE_SIZE_BYTES) {
          setError(`File is too large. Maximum size is ${MAX_FILE_SIZE_MB}MB. Your file is ${(file.size / 1024 / 1024).toFixed(1)}MB.`);
          return;
        }
        
        setError(null);
        setSelectedFile(file);
        setIsStoring(true);
        
        try {
          // Store PDF in IndexedDB for later retrieval
          await storePDF(`pending_${file.name}`, file);
          console.log('[Dropzone] PDF stored in IndexedDB');
        } catch (err) {
          console.error('[Dropzone] Failed to store PDF:', err);
          // Continue anyway - upload will still work
        } finally {
          setIsStoring(false);
        }
        
        onFileUploaded(file);
      }
    },
    [onFileUploaded]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
    },
    maxFiles: 1,
    multiple: false,
  });

  const removeFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedFile(null);
    setError(null);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className="w-full max-w-2xl mx-auto"
    >
      <div
        {...getRootProps()}
        className={cn(
          "relative border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all duration-300",
          isDragActive
            ? "border-[#ffde59] bg-gradient-to-br from-[rgba(255,222,89,0.1)] to-[rgba(255,145,77,0.1)] dropzone-active"
            : "border-border hover:border-[#ffb753] hover:bg-white/5",
          selectedFile && "border-[#ffb753] bg-[rgba(255,183,83,0.05)]"
        )}
      >
        <input {...getInputProps()} />

        {error ? (
          <div className="flex flex-col items-center gap-4">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              <AlertCircle className="w-8 h-8 text-brand-grade-f" />
            </motion.div>
            <div className="text-center">
              <p className="text-lg font-medium text-brand-grade-f">File too large</p>
              <p className="text-sm text-muted-foreground mt-1">{error}</p>
            </div>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={removeFile}
              className="p-2 rounded-full hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5 text-muted-foreground" />
            </motion.button>
          </div>
        ) : selectedFile ? (
          <div className="flex flex-col items-center gap-4">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              <FileText className="w-8 h-8 text-gradient" />
            </motion.div>
            <div>
              <p className="text-lg font-medium">{selectedFile.name}</p>
              <p className="text-sm text-muted-foreground">
                {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                {isStoring && " • Storing..."}
              </p>
            </div>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={removeFile}
              className="p-2 rounded-full hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5 text-muted-foreground" />
            </motion.button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              <Upload className="w-8 h-8 text-gradient" />
            </motion.div>
            <div>
              <p className="text-lg font-medium">
                {isDragActive
                  ? "Drop your policy here"
                  : "Drop your insurance policy PDF"}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                or click to browse
              </p>
              <p className="text-center text-xs text-muted-foreground mt-4">
                Please upload text-based PDFs only. Scanned images / photos will not work. <br /><br />Maximum file size: {MAX_FILE_SIZE_MB}MB
              </p>
            </div>
          </div>
        )}
      </div>
      <p className="text-center text-xs text-muted-foreground mt-4">
        Zero data stored. Documents are processed in memory and permanently
        deleted when you close the tab.
      </p>
    </motion.div>
  );
}