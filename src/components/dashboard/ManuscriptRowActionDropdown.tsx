"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { Manuscript } from "@/lib/types";

interface ManuscriptRowActionDropdownProps {
  manuscript: Manuscript;
  isProcessing: boolean;
  isDeleting: boolean;
  onScreen: () => void;
  onDelete: () => void;
}

export default function ManuscriptRowActionDropdown({
  manuscript,
  isProcessing,
  isDeleting,
  onScreen,
  onDelete,
}: ManuscriptRowActionDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      // Dropdown width is 192px (w-48), gap 6px
      const left = Math.max(8, rect.right - 192);
      const top = rect.bottom + 6;
      setCoords({ top, left });
    }
  };

  const toggleOpen = () => {
    if (isProcessing || isDeleting) return;
    if (!isOpen) {
      updatePosition();
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    const handleScrollOrResize = () => {
      updatePosition();
    };

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        menuRef.current &&
        !menuRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="relative inline-block text-right">
      <button
        ref={triggerRef}
        type="button"
        disabled={isProcessing || isDeleting}
        onClick={toggleOpen}
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-label={`Aksi untuk naskah ${manuscript.title}`}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition-all duration-150 hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/20 active:scale-[0.98] disabled:opacity-60"
      >
        {isProcessing ? (
          <>
            <svg className="h-3.5 w-3.5 animate-spin text-primary" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <span className="font-medium text-primary">Memeriksa...</span>
          </>
        ) : isDeleting ? (
          <>
            <svg className="h-3.5 w-3.5 animate-spin text-rose-600" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <span className="font-medium text-rose-600">Menghapus...</span>
          </>
        ) : (
          <>
            <span>Aksi</span>
            <svg
              className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.25a.75.75 0 01-1.06 0L5.21 8.27a.75.75 0 01.02-1.06z"
                clipRule="evenodd"
              />
            </svg>
          </>
        )}
      </button>

      {isOpen &&
        mounted &&
        coords &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: "fixed",
              top: coords.top,
              left: coords.left,
              zIndex: 9999,
            }}
            className="w-48 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 text-slate-800 shadow-xl ring-1 ring-black/5 animate-in fade-in-0 zoom-in-95 duration-100"
          >
            {/* 1. Periksa Sekarang */}
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onScreen();
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-primary/10 hover:text-primary"
            >
              <svg className="h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
              <span>Periksa Sekarang</span>
            </button>

            {/* 2. Lihat Detail */}
            <Link
              href={`/manuscripts/${manuscript.id}`}
              onClick={() => setIsOpen(false)}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              <svg className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m5.23 4.29-4.73 4.73a1.5 1.5 0 0 0-.44 1.06v2.17h2.17a1.5 1.5 0 0 0 1.06-.44l4.73-4.73a1.5 1.5 0 0 0 0-2.12l-1.06-1.06a1.5 1.5 0 0 0-2.12 0Z"
                />
              </svg>
              <span>Lihat Detail</span>
            </Link>

            <div className="my-1 border-t border-slate-100" />

            {/* 3. Soft Delete */}
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onDelete();
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-50 hover:text-rose-700"
            >
              <svg className="h-4 w-4 text-rose-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m14.74 9-.346 9m-4.788 0L9.26 9M19.5 5.5h-15m2 0-.001-1.6a2 2 0 0 1 2-2h3.002a2 2 0 0 1 2 2V5.5m-8 0v13a2 2 0 0 0 2 2h6.002a2 2 0 0 0 2-2v-13"
                />
              </svg>
              <span>Hapus Naskah</span>
            </button>
          </div>,
          document.body
        )}
    </div>
  );
}
