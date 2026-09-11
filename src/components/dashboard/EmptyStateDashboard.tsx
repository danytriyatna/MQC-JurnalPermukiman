interface EmptyStateProps {
  variant: "no-manuscripts" | "no-results";
  onResetFilters?: () => void;
}

export default function EmptyStateDashboard({ variant, onResetFilters }: EmptyStateProps) {
  if (variant === "no-results") {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
        <p className="text-sm font-medium text-slate-900">Tidak ada naskah yang cocok</p>
        <p className="mt-1 text-sm text-slate-500">
          Coba ubah kata kunci pencarian atau filter status.
        </p>
        {onResetFilters && (
          <button
            type="button"
            onClick={onResetFilters}
            className="mt-4 rounded-md bg-white px-3 py-1.5 text-sm font-medium text-slate-700 ring-1 ring-inset ring-slate-300 transition-[background-color,transform] duration-150 hover:bg-slate-50 active:scale-[0.97]"
          >
            Reset filter
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white px-6 py-20 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
        <svg
          className="h-6 w-6 text-slate-400"
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
      <p className="mt-4 text-sm font-medium text-slate-900">Belum ada naskah diunggah</p>
      <p className="mt-1 max-w-sm text-sm text-slate-500">
        Unggah naskah pertama untuk mulai memeriksa kesesuaiannya dengan template Jurnal
        Permukiman secara otomatis.
      </p>
      <a
        href="/manuscripts/upload"
        className="mt-4 rounded-md bg-slate-900 px-3.5 py-2 text-sm font-medium text-white transition-[background-color,transform] duration-150 hover:bg-slate-800 active:scale-[0.97]"
      >
        Unggah Naskah Pertama
      </a>
    </div>
  );
}
