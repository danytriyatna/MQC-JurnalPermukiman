"use client";

import { useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { validateDocxUpload } from "@/lib/upload/validateFile";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Phase = "idle" | "uploading" | "screening";

export default function UploadForm({ manuscriptId }: { manuscriptId?: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const isUploading = phase !== "idle";

  const validateAndUpload = async (file: File) => {
    setError(null);

    const validationError = validateDocxUpload(file.name, file.size);
    if (validationError) {
      setError(validationError);
      return;
    }

    setFileName(file.name);
    setPhase("uploading");

    const fail = (message: string) => {
      setError(message);
      setPhase("idle");
    };

    try {
      const formData = new FormData();
      formData.append("file", file);

      setPhase("screening");

      const endpoint = manuscriptId
        ? `/api/manuscripts/${manuscriptId}/revisions`
        : "/api/manuscripts";

      const res = await fetch(endpoint, {
        method: "POST",
        body: formData,
      });

      const body = await res.json().catch(() => null);

      if (!res.ok) {
        fail(body?.error ?? `Gagal memproses naskah (HTTP ${res.status}). Coba lagi.`);
        return;
      }

      if (manuscriptId) {
        router.refresh();
        setPhase("idle");
        setFileName(null);
      } else {
        router.push(`/manuscripts/${body.manuscriptId}`);
      }
    } catch {
      fail("Gagal terhubung ke server. Periksa koneksi internet Anda dan coba lagi.");
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void validateAndUpload(file);
  };

  return (
    <div className="flex flex-col gap-3">
      <Card
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => !isUploading && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        className={`cursor-pointer border-2 border-dashed transition-colors shadow-none ${
          isDragging
            ? "border-primary bg-primary/5"
            : "border-slate-300 bg-white hover:border-slate-400 hover:bg-slate-50"
        } ${isUploading ? "pointer-events-none opacity-70" : ""}`}
      >
        <CardContent className="flex flex-col items-center justify-center px-6 py-14 text-center">
          <input
            ref={inputRef}
            type="file"
            accept=".docx"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void validateAndUpload(file);
            }}
          />

          {isUploading ? (
            <>
              <svg
                className="h-9 w-9 animate-spin text-primary"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                />
              </svg>
              <p className="mt-4 text-sm font-semibold text-slate-900">
                {phase === "uploading" ? "Mengunggah" : "Memeriksa"} {fileName}…
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {phase === "uploading"
                  ? "Mengirim file ke penyimpanan, mohon tunggu sebentar."
                  : "Mengevaluasi kesesuaian naskah dengan gaya selingkung Jurnal Permukiman."}
              </p>
            </>
          ) : (
            <>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <svg
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.75}
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z"
                  />
                </svg>
              </div>
              <p className="mt-3.5 text-sm font-semibold text-slate-900">
                Tarik file .docx ke sini, atau klik untuk memilih
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Maksimum 50MB · Dokumen Microsoft Word (.docx)
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-4 pointer-events-none rounded-xl text-xs font-semibold"
              >
                Pilih Berkas Dokumen
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {error && (
        <div
          role="alert"
          className="alert-anim rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700"
        >
          {error}
        </div>
      )}
    </div>
  );
}
