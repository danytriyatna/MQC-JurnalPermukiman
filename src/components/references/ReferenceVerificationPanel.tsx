"use client";

import { useState } from "react";
import { ReferenceKind, ReferenceVerdict } from "@/lib/references/types";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/**
 * Reference verification panel.
 *
 * Verification is driven from the browser in small batches: it starts a run
 * with POST, then repeats PATCH until nothing is pending, re-rendering after
 * each batch so a 30-entry bibliography shows progress instead of a spinner
 * that might be about to time out.
 *
 * The presentation is built around one rule — never let "we could not find it"
 * look like "it is fake". Only an unregistered DOI is coloured as a likely
 * fabrication; everything else that is unconfirmed is presented as needing a
 * human, and the panel says so in as many words.
 */

export interface ReferenceCheckRowData {
  id: string;
  entry_index: number;
  raw_text: string;
  kind: ReferenceKind;
  doi: string | null;
  url: string | null;
  verdict: ReferenceVerdict | "pending";
  confidence: "high" | "medium" | "low" | null;
  note: string | null;
  match_source: string | null;
  match_title: string | null;
  match_year: string | null;
  match_url: string | null;
  match_similarity: number | null;
}

export interface ReferenceRunData {
  id: string;
  source_set_version: string;
  total_references: number;
  started_at: string;
  completed_at: string | null;
}

type Verdict = ReferenceVerdict | "pending";

interface VerdictStyle {
  label: string;
  /** Grouping headline — what a reviewer should do about this group. */
  group: string;
  variant: "destructive" | "warning" | "secondary" | "success" | "outline";
}

const VERDICT_STYLES: Record<Verdict, VerdictStyle> = {
  doi_invalid: {
    label: "Indikasi fiktif",
    group: "Indikasi kuat tidak nyata",
    variant: "destructive",
  },
  metadata_mismatch: {
    label: "Data melenceng",
    group: "Ada, tetapi datanya tidak sesuai",
    variant: "warning",
  },
  regulation_inconsistent: {
    label: "Kutipan tidak konsisten",
    group: "Ada, tetapi datanya tidak sesuai",
    variant: "warning",
  },
  url_unreachable: {
    label: "Tautan mati",
    group: "Perlu diperiksa manual",
    variant: "secondary",
  },
  not_found: {
    label: "Tidak ditemukan",
    group: "Perlu diperiksa manual",
    variant: "secondary",
  },
  not_verifiable: {
    label: "Di luar jangkauan",
    group: "Perlu diperiksa manual",
    variant: "secondary",
  },
  check_failed: {
    label: "Gagal diperiksa",
    group: "Perlu diperiksa manual",
    variant: "secondary",
  },
  verified: {
    label: "Terkonfirmasi",
    group: "Terkonfirmasi ada",
    variant: "success",
  },
  pending: {
    label: "Menunggu",
    group: "Belum diperiksa",
    variant: "outline",
  },
};

const GROUP_ORDER = [
  "Indikasi kuat tidak nyata",
  "Ada, tetapi datanya tidak sesuai",
  "Perlu diperiksa manual",
  "Terkonfirmasi ada",
  "Belum diperiksa",
] as const;

const KIND_LABELS: Record<ReferenceKind, string> = {
  journal: "Artikel jurnal",
  book: "Buku",
  regulation: "Peraturan/standar",
  web: "Sumber web",
  unknown: "Tidak terklasifikasi",
};

const CONFIDENCE_LABELS: Record<"high" | "medium" | "low", string> = {
  high: "keyakinan tinggi",
  medium: "keyakinan sedang",
  low: "keyakinan rendah",
};

const SOURCE_LABELS: Record<string, string> = {
  crossref: "Crossref",
  openalex: "OpenAlex",
  openlibrary: "OpenLibrary",
  url: "Pemeriksaan tautan",
  structure: "Struktur kutipan",
};

function CheckRow({ row }: { row: ReferenceCheckRowData }) {
  const [isOpen, setIsOpen] = useState(false);
  const style = VERDICT_STYLES[row.verdict] ?? VERDICT_STYLES.pending;

  return (
    <div className="border-b border-slate-100 px-4 py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs tabular-nums text-slate-400">#{row.entry_index}</span>
        <Badge variant={style.variant}>
          {style.label}
        </Badge>
        <span className="text-xs text-slate-500">{KIND_LABELS[row.kind]}</span>
        {row.confidence && (
          <span className="text-xs text-slate-400">{CONFIDENCE_LABELS[row.confidence]}</span>
        )}
      </div>

      <p className="mt-1.5 text-sm text-slate-800">{row.raw_text}</p>

      {row.note && <p className="mt-1.5 text-sm text-slate-600">{row.note}</p>}

      {(row.match_title || row.match_url || row.doi) && (
        <button
          type="button"
          onClick={() => setIsOpen((v) => !v)}
          className="mt-1.5 text-xs font-medium text-slate-600 underline decoration-slate-300 underline-offset-2 transition-colors duration-150 hover:text-slate-900"
        >
          {isOpen ? "Sembunyikan dasar penilaian" : "Lihat dasar penilaian"}
        </button>
      )}

      {isOpen && (
        <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 rounded-md bg-slate-50 px-3 py-2 text-sm sm:grid-cols-2">
          {row.doi && (
            <div className="sm:col-span-2">
              <dt className="text-xs text-slate-500">DOI pada naskah</dt>
              <dd className="break-all text-slate-800">{row.doi}</dd>
            </div>
          )}
          {row.match_source && (
            <div>
              <dt className="text-xs text-slate-500">Sumber pemeriksaan</dt>
              <dd className="text-slate-800">
                {SOURCE_LABELS[row.match_source] ?? row.match_source}
              </dd>
            </div>
          )}
          {row.match_similarity !== null && row.match_similarity > 0 && (
            <div>
              <dt className="text-xs text-slate-500">Kemiripan judul</dt>
              <dd className="text-slate-800 tabular-nums">
                {Math.round(row.match_similarity * 100)}%
              </dd>
            </div>
          )}
          {row.match_title && (
            <div className="sm:col-span-2">
              <dt className="text-xs text-slate-500">Judul pada basis data</dt>
              <dd className="text-slate-800">
                {row.match_title}
                {row.match_year ? ` (${row.match_year})` : ""}
              </dd>
            </div>
          )}
          {row.match_url && (
            <div className="sm:col-span-2">
              <dt className="text-xs text-slate-500">Tautan rujukan</dt>
              <dd className="break-all">
                <a
                  href={row.match_url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-slate-700 underline decoration-slate-300 underline-offset-2 hover:text-slate-900"
                >
                  {row.match_url}
                </a>
              </dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}

export default function ReferenceVerificationPanel({
  manuscriptId,
  initialRun,
  initialChecks,
}: {
  manuscriptId: string;
  initialRun: ReferenceRunData | null;
  initialChecks: ReferenceCheckRowData[];
}) {
  const [run, setRun] = useState(initialRun);
  const [checks, setChecks] = useState(initialChecks);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const endpoint = `/api/manuscripts/${manuscriptId}/references`;

  const readBody = async (res: Response) => {
    // An error raised upstream of the route comes back as HTML, so parsing is
    // kept tolerant and the status code used as the fallback message.
    const body = (await res.json().catch(() => null)) as
      | { error?: string; run?: ReferenceRunData; remaining?: number; checks?: ReferenceCheckRowData[] }
      | null;
    if (!res.ok) {
      throw new Error(body?.error ?? `Permintaan gagal (HTTP ${res.status}).`);
    }
    return body;
  };

  const start = async () => {
    setError(null);
    setIsRunning(true);

    try {
      const started = await readBody(await fetch(endpoint, { method: "POST" }));
      const activeRun = started?.run ?? null;
      if (!activeRun) throw new Error("Verifikasi tidak dapat dimulai.");

      setRun(activeRun);
      setChecks([]);

      // Each PATCH looks up a handful of entries and returns the full list
      // again, so the panel fills in progressively. The loop is bounded by the
      // entry count so a server that stopped reducing `remaining` cannot spin
      // here forever.
      const maxBatches = Math.ceil(activeRun.total_references / 2) + 5;

      for (let batch = 0; batch < maxBatches; batch++) {
        const progress = await readBody(
          await fetch(endpoint, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ runId: activeRun.id }),
          }),
        );

        if (progress?.checks) setChecks(progress.checks);
        if ((progress?.remaining ?? 0) === 0) break;
      }

      setRun({ ...activeRun, completed_at: new Date().toISOString() });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Gagal menjalankan verifikasi referensi. Coba lagi.",
      );
    } finally {
      setIsRunning(false);
    }
  };

  const done = checks.filter((c) => c.verdict !== "pending").length;
  const total = run?.total_references ?? checks.length;

  const grouped = GROUP_ORDER.map((group) => ({
    group,
    rows: checks.filter(
      (c) => (VERDICT_STYLES[c.verdict] ?? VERDICT_STYLES.pending).group === group,
    ),
  })).filter((g) => g.rows.length > 0);

  const suspicious = checks.filter((c) => c.verdict === "doi_invalid").length;

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-4">
        <div>
          <CardTitle className="text-sm font-semibold text-slate-900">Verifikasi Referensi</CardTitle>
          <CardDescription className="mt-0.5 text-xs text-slate-500">
            Mencocokkan setiap entri daftar pustaka ke Crossref, OpenAlex, dan OpenLibrary,
            serta memeriksa tautan yang dicantumkan.
          </CardDescription>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={start}
          disabled={isRunning}
          className="inline-flex items-center gap-1.5 shadow-sm"
        >
          {isRunning && (
            <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
          )}
          {isRunning ? "Memeriksa…" : run ? "Periksa ulang" : "Mulai verifikasi"}
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {error && (
          <div role="alert" className="border-b border-rose-100 bg-rose-50 px-4 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}

        {isRunning && total > 0 && (
          <div className="border-b border-slate-100 px-4 py-2">
            <p className="text-xs text-slate-500 tabular-nums">
              {done} dari {total} referensi diperiksa
            </p>
            <div className="mt-1.5 h-1 w-full max-w-sm overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full w-full origin-left rounded-full bg-slate-400 transition-transform duration-300"
                style={{ transform: `scaleX(${total === 0 ? 0 : done / total})` }}
              />
            </div>
          </div>
        )}

        {!run && !isRunning && (
          <p className="px-4 py-4 text-sm text-slate-500">
            Belum ada verifikasi untuk versi naskah ini. Pemeriksaan memerlukan koneksi internet
            dan memanggil basis data pihak ketiga, sehingga dijalankan terpisah dari penyaringan
            gaya selingkung dan tidak memengaruhi status naskah.
          </p>
        )}

        {run && checks.length > 0 && (
          <>
            <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5">
              <p className="text-xs text-slate-600">
                {suspicious > 0 ? (
                  <>
                    <strong className="font-semibold text-rose-700">
                      {suspicious} referensi berindikasi kuat tidak nyata
                    </strong>{" "}
                    (DOI tidak terdaftar). Konfirmasi langsung ke penulis sebelum mengambil
                    kesimpulan.
                  </>
                ) : (
                  <>Tidak ada referensi dengan DOI yang tidak terdaftar.</>
                )}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Entri bertanda <em>Tidak ditemukan</em> atau <em>Di luar jangkauan</em> belum tentu
                fiktif — jurnal lokal Indonesia, terbitan kementerian, dan peraturan umumnya tidak
                terindeks di basis data yang dipakai di sini.
              </p>
            </div>

            {grouped.map(({ group, rows }) => (
              <div key={group}>
                <h3 className="bg-white px-4 pt-3 pb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  {group} · {rows.length}
                </h3>
                <div>
                  {rows.map((row) => (
                    <CheckRow key={row.id} row={row} />
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
}
