"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, FileText, X } from "lucide-react";
import { cn } from "@/lib/utils";

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
    <div className="w-full max-w-2xl mx-auto">
      <div
        {...getRootProps()}
        className={cn(
          "relative border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all duration-300",
          isDragActive
            ? "border-brand-amber bg-brand-amber/10 dropzone-active"
            : "border-border hover:border-brand-amber/50 hover:bg-white/5",
          selectedFile && "border-brand-amber bg-brand-amber/5"
        )}
      >
        <input {...getInputProps()} />

        {selectedFile ? (
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-brand-amber/20 flex items-center justify-center">
              <FileText className="w-8 h-8 text-brand-amber" />
            </div>
            <div>
              <p className="text-lg font-medium text-white">
                {selectedFile.name}
              </p>
              <p className="text-sm text-muted-foreground">
                {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
            <button
              onClick={removeFile}
              className="p-2 rounded-full hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center">
              <Upload className="w-8 h-8 text-brand-amber" />
            </div>
            <div>
              <p className="text-lg font-medium text-white">
                {isDragActive
                  ? "Drop your policy here"
                  : "Drop your insurance policy PDF"}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                or click to browse • Any carrier, any format, any state
              </p>
            </div>
          </div>
        )}
      </div>

      <p className="text-center text-xs text-muted-foreground mt-4">
        Zero data stored. Documents are processed in memory and permanently
        deleted when you close the tab.
      </p>
    </div>
  );
}