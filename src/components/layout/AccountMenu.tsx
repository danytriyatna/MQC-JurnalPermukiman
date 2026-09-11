"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { initialsOf } from "@/lib/status";

interface AccountMenuProps {
  userName: string;
  userEmail: string;
}

const CLOSE_ANIMATION_MS = 150;

export default function AccountMenu({ userName, userEmail }: AccountMenuProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openMenu = () => {
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    setIsMounted(true);
    setIsOpen(true);
  };

  const closeMenu = () => {
    setIsOpen(false);
    closeTimeoutRef.current = setTimeout(() => setIsMounted(false), CLOSE_ANIMATION_MS);
  };

  useEffect(() => {
    if (!isMounted) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        closeMenu();
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isMounted]);

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => (isOpen ? closeMenu() : openMenu())}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700 transition-transform duration-150 active:scale-[0.94]"
        aria-label={`Akun: ${userName}`}
        aria-expanded={isOpen}
        title={userName}
      >
        {initialsOf(userName)}
      </button>

      {isMounted && (
        <div
          data-closing={!isOpen}
          className="popover-anim absolute right-0 z-20 mt-2 w-56 rounded-md border border-slate-200 bg-white py-1 shadow-lg"
        >
          <div className="border-b border-slate-100 px-3 py-2">
            <p className="truncate text-sm font-medium text-slate-900">{userName}</p>
            <p className="truncate text-xs text-slate-500">{userEmail}</p>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={isSigningOut}
            className="w-full px-3 py-2 text-left text-sm text-slate-700 transition-colors duration-150 hover:bg-slate-50 disabled:opacity-60"
          >
            {isSigningOut ? "Keluar..." : "Keluar"}
          </button>
        </div>
      )}
    </div>
  );
}
