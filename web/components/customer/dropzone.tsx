"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, FileText, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface CustomerDropzoneProps {
  onFileUploaded: (file: File) => void;
}

export function CustomerDropzone({ onFileUploaded }: CustomerDropzoneProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        const file = acceptedFiles[0];
        setSelectedFile(file);
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

        {selectedFile ? (
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