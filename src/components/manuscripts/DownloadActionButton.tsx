"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";

interface DownloadActionButtonProps {
  href: string;
  defaultFilename: string;
  label: string;
  loadingLabel?: string;
  iconType: "original" | "report";
  className?: string;
}

export default function DownloadActionButton({
  href,
  defaultFilename,
  label,
  loadingLabel = "Mengunduh…",
  iconType,
  className,
}: DownloadActionButtonProps) {
  const [isLoading, setIsLoading] = React.useState(false);

  const handleDownload = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (isLoading) return;

    setIsLoading(true);

    try {
      const response = await fetch(href);
      if (!response.ok) {
        let errorMsg = `Gagal mengunduh berkas (${response.status})`;
        try {
          const json = await response.json();
          if (json.error) errorMsg = json.error;
        } catch {
          // fallback ke pesan error default jika bukan JSON
        }
        throw new Error(errorMsg);
      }

      // Ambil nama berkas dari header Content-Disposition jika tersedia
      const disposition = response.headers.get("Content-Disposition");
      let resolvedFilename = defaultFilename;
      if (disposition && disposition.includes("filename=")) {
        const match = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (match && match[1]) {
          resolvedFilename = decodeURIComponent(match[1].replace(/['"]/g, ""));
        }
      }

      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const tempLink = document.createElement("a");
      tempLink.style.display = "none";
      tempLink.href = blobUrl;
      tempLink.download = resolvedFilename;
      document.body.appendChild(tempLink);
      tempLink.click();

      // Beri sedikit jeda sebelum membersihkan DOM dan URL object
      setTimeout(() => {
        window.URL.revokeObjectURL(blobUrl);
        tempLink.remove();
        setIsLoading(false);
      }, 600);
    } catch (err: any) {
      window.alert(err?.message || "Terjadi kesalahan saat mengunduh berkas.");
      setIsLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleDownload}
      disabled={isLoading}
      aria-busy={isLoading}
      className={className}
      title={isLoading ? loadingLabel : label}
    >
      {isLoading ? (
        <svg
          className="h-4 w-4 animate-spin text-slate-500"
          xmlns="http://www.w3.org/2000/svg"
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
            strokeWidth="3"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v8H4z"
          />
        </svg>
      ) : iconType === "original" ? (
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.75}
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19.5 14.25v4.5a1.5 1.5 0 0 1-1.5 1.5h-12a1.5 1.5 0 0 1-1.5-1.5v-4.5M7.5 10.5 12 15m0 0 4.5-4.5M12 15V3"
          />
        </svg>
      ) : (
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.75}
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 3v13.5m0 0-4.5-4.5M12 16.5l4.5-4.5M4.5 19.5h15"
          />
        </svg>
      )}
      <span>{isLoading ? loadingLabel : label}</span>
    </Button>
  );
}
