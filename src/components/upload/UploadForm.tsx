"use client";

import { useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { buildManuscriptStoragePath } from "@/lib/upload/storagePath";
import { validateDocxUpload } from "@/lib/upload/validateFile";
import { DOCX_CONTENT_TYPE, MANUSCRIPT_BUCKET } from "@/lib/upload/constants";

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

    const supabase = createClient();
    let storagePath: string;

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        fail("Sesi Anda sudah berakhir. Silakan login ulang lalu coba lagi.");
        return;
      }

      storagePath = buildManuscriptStoragePath(user.id);

      // The .docx goes straight from the browser into Storage rather than
      // through /api/manuscripts. Posting it to the API would put the whole
      // file in a serverless function's request body, which Vercel caps at
      // about 4.5MB — far below the 50MB this form accepts, and rejected at
      // the edge with a response the browser cannot read as JSON.
      const { error: uploadError } = await supabase.storage
        .from(MANUSCRIPT_BUCKET)
        .upload(storagePath, file, {
          contentType: DOCX_CONTENT_TYPE,
          upsert: false,
        });

      if (uploadError) {
        fail(`Gagal mengunggah file ke penyimpanan: ${uploadError.message}`);
        return;
      }
    } catch {
      fail("Gagal mengunggah file. Periksa koneksi internet Anda dan coba lagi.");
      return;
    }

    setPhase("screening");

    try {
      const endpoint = manuscriptId
        ? `/api/manuscripts/${manuscriptId}/revisions`
        : "/api/manuscripts";

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storagePath, originalFileName: file.name }),
      });

      // An error produced upstream of the route — a gateway, a proxy, a
      // platform limit — comes back as HTML, not JSON. Parsing it outside the
      // catch kept those cases indistinguishable from a dropped connection.
      const body = await res.json().catch(() => null);

      if (!res.ok) {
        fail(body?.error ?? `Gagal memproses naskah (HTTP ${res.status}). Coba lagi.`);
        // Safe only on an explicit rejection: every path that answers with an
        // error leaves no manuscript_versions row pointing at this object. A
        // lost response is not the same thing — see the catch below.
        void supabase.storage.from(MANUSCRIPT_BUCKET).remove([storagePath]);
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
      // The object is deliberately left in place. Screening may well have
      // succeeded with only the response lost, in which case a row already
      // references this key and deleting it would break the original-file
      // download. An unreferenced object merely wastes storage.
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
      <div
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
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-16 text-center transition-colors duration-150 ${
          isDragging
            ? "border-[#C13D0D] bg-[#FDF4F0]"
            : "border-[#DFD9D2] bg-[#FAF8F5]/60 hover:border-[#C13D0D]/60 hover:bg-[#FDF4F0]/50"
        } ${isUploading ? "pointer-events-none opacity-70" : ""}`}
      >
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
              className="h-8 w-8 animate-spin text-[#C13D0D]"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            <p className="mt-3 text-sm font-semibold text-stone-900">
              {phase === "uploading" ? "Mengunggah" : "Memeriksa"} {fileName}…
            </p>
            <p className="mt-1 text-xs text-stone-500">
              {phase === "uploading"
                ? "Mengirim file ke penyimpanan, mohon tunggu."
                : "Memeriksa kesesuaian naskah dengan gaya selingkung, mohon tunggu."}
            </p>
          </>
        ) : (
          <>
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#FDF4F0] ring-1 ring-[#F4D4C9]">
              <svg className="h-6 w-6 text-[#C13D0D]" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z" />
              </svg>
            </div>
            <p className="mt-3 text-sm font-semibold text-stone-900">Tarik file .docx ke sini, atau klik untuk memilih</p>
            <p className="mt-1 text-xs text-stone-500">Maksimum 50MB, format Microsoft Word (.docx) saja</p>
          </>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="alert-anim rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
        >
          {error}
        </div>
      )}
    </div>
  );
}
