"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, FileText, X, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface DualDropzoneProps {
  onFileUploaded: (file: File, policy: "A" | "B") => void;
}

export function BrokerDropzone({ onFileUploaded }: DualDropzoneProps) {
  const [policyAFile, setPolicyAFile] = useState<File | null>(null);
  const [policyBFile, setPolicyBFile] = useState<File | null>(null);
  const [isUploadingA, setIsUploadingA] = useState(false);
  const [isUploadingB, setIsUploadingB] = useState(false);

  const onDropA = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0 && !policyAFile) {
        const file = acceptedFiles[0];
        setPolicyAFile(file);
        setIsUploadingA(true);
        onFileUploaded(file, "A");
      }
    },
    [onFileUploaded, policyAFile]
  );

  const onDropB = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0 && !policyBFile) {
        const file = acceptedFiles[0];
        setPolicyBFile(file);
        setIsUploadingB(true);
        onFileUploaded(file, "B");
      }
    },
    [onFileUploaded, policyBFile]
  );

  const { getRootProps: getRootPropsA, getInputProps: getInputPropsA, isDragActive: isDragActiveA } = useDropzone({
    onDrop: onDropA,
    accept: { "application/pdf": [".pdf"] },
    maxFiles: 1,
    multiple: false,
    disabled: !!policyAFile,
  });

  const { getRootProps: getRootPropsB, getInputProps: getInputPropsB, isDragActive: isDragActiveB } = useDropzone({
    onDrop: onDropB,
    accept: { "application/pdf": [".pdf"] },
    maxFiles: 1,
    multiple: false,
    disabled: !!policyBFile,
  });

  const removeFile = (policy: "A" | "B") => {
    if (policy === "A") {
      setPolicyAFile(null);
    } else {
      setPolicyBFile(null);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Policy A Dropzone */}
        <DropzoneCard
          label="Policy A"
          file={policyAFile}
          isUploading={isUploadingA}
          isDragActive={isDragActiveA}
          getRootProps={getRootPropsA}
          getInputProps={getInputPropsA}
          onRemove={() => removeFile("A")}
          disabled={!!policyAFile}
        />

        {/* Policy B Dropzone */}
        <DropzoneCard
          label="Policy B"
          file={policyBFile}
          isUploading={isUploadingB}
          isDragActive={isDragActiveB}
          getRootProps={getRootPropsB}
          getInputProps={getInputPropsB}
          onRemove={() => removeFile("B")}
          disabled={!!policyBFile}
        />
      </div>

      <p className="text-center text-xs text-muted-foreground mt-6">
        Zero data stored. Documents are processed in memory and permanently
        deleted when you close the tab.
      </p>
    </div>
  );
}

interface DropzoneCardProps {
  label: string;
  file: File | null;
  isUploading: boolean;
  isDragActive: boolean;
  getRootProps: () => Record<string, unknown>;
  getInputProps: () => Record<string, unknown>;
  onRemove: () => void;
  disabled: boolean;
}

function DropzoneCard({
  label,
  file,
  isUploading,
  isDragActive,
  getRootProps,
  getInputProps,
  onRemove,
  disabled,
}: DropzoneCardProps) {
  return (
    <div
      {...getRootProps()}
      className={cn(
        "relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-300 min-h-[200px] flex flex-col items-center justify-center",
        isDragActive
          ? "border-brand-amber bg-brand-amber/10"
          : "border-border hover:border-brand-amber/50 hover:bg-white/5",
        file && "border-brand-amber bg-brand-amber/5 border-dashed-0",
        disabled && "cursor-default opacity-70"
      )}
    >
      <input {...getInputProps()} />

      {file ? (
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-brand-amber/20 flex items-center justify-center">
            <Check className="w-6 h-6 text-brand-amber" />
          </div>
          <div>
            <p className="text-base font-medium text-white">{label}</p>
            <p className="text-sm text-muted-foreground truncate max-w-[150px]">
              {file.name}
            </p>
            <p className="text-xs text-muted-foreground">
              {(file.size / 1024 / 1024).toFixed(2)} MB
            </p>
          </div>
          {!isUploading && (
            <button
              onClick={onRemove}
              className="p-1 rounded-full hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
        </div>
      ) : isUploading ? (
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-brand-amber border-t-transparent rounded-full animate-spin" />
          </div>
          <p className="text-sm text-muted-foreground">Uploading...</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
            <Upload className="w-6 h-6 text-brand-amber" />
          </div>
          <div>
            <p className="text-base font-medium text-white">{label}</p>
            <p className="text-sm text-muted-foreground">
              {isDragActive ? "Drop here" : "Drop PDF or click to browse"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}