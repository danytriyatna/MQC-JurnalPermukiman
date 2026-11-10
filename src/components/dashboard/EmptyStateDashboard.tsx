import Link from "next/link";
interface EmptyStateProps {
  variant: "no-manuscripts" | "no-results";
  onResetFilters?: () => void;
}

export default function EmptyStateDashboard({ variant, onResetFilters }: EmptyStateProps) {
  if (variant === "no-results") {
    return (
      <div className="fresh-card flex flex-col items-center justify-center rounded-2xl px-6 py-16 text-center">
        <p className="text-sm font-semibold text-stone-900">Tidak ada naskah yang cocok</p>
        <p className="mt-1 text-sm text-stone-500">
          Coba ubah kata kunci pencarian atau filter status.
        </p>
        {onResetFilters && (
          <button
            type="button"
            onClick={onResetFilters}
            className="mt-4 rounded-lg border border-[#F4D4C9] bg-[#FDF4F0] px-3.5 py-1.5 text-sm font-semibold text-[#A0320A] transition-colors duration-150 hover:bg-[#C13D0D] hover:text-white active:scale-[0.97]"
          >
            Reset filter
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="fresh-card flex flex-col items-center justify-center rounded-2xl px-6 py-20 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#FDF4F0] ring-1 ring-[#F4D4C9]">
        <svg
          className="h-6 w-6 text-[#C13D0D]"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2Z"
          />
        </svg>
      </div>
      <p className="mt-4 text-sm font-semibold text-stone-900">Belum ada naskah diunggah</p>
      <p className="mt-1 max-w-sm text-sm text-stone-500">
        Unggah naskah pertama untuk mulai memeriksa kesesuaiannya dengan template Jurnal
        Permukiman secara otomatis.
      </p>
      <Link
        href="/manuscripts/upload"
        className="mt-4 rounded-lg bg-gradient-to-r from-[#D14715] to-[#A0320A] px-4 py-2 text-sm font-bold text-white shadow-xs transition-all duration-150 hover:brightness-105 active:scale-[0.97]"
      >
        Unggah Naskah Pertama
      </Link>
    </div>
  );
}
