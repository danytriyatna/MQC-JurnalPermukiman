import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { toCsv } from "@/lib/csv";
import { statusMeta } from "@/lib/status";
import { ManuscriptStatus } from "@/lib/types";

function monthRange(month: string): { start: string; end: string } | null {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const [year, mon] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, mon - 1, 1));
  const end = new Date(Date.UTC(year, mon, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Anda harus login." }, { status: 401 });
  }

  const month = request.nextUrl.searchParams.get("month") ?? "";
  const range = month ? monthRange(month) : null;

  if (month && !range) {
    return NextResponse.json({ error: "Parameter bulan tidak valid." }, { status: 400 });
  }

  let query = supabase
    .from("manuscripts")
    .select(
      "title, original_file_name, status, version_number, total_rules_checked, total_rules_passed, error_findings, warning_findings, created_at, updated_at, uploaded_by_profile:profiles!uploaded_by(full_name)",
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (range) {
    query = query.gte("created_at", range.start).lt("created_at", range.end);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: "Gagal memuat data naskah." }, { status: 500 });
  }

  const headers = [
    "Judul",
    "Nama File",
    "Status",
    "Versi",
    "Aturan Terpenuhi",
    "Total Aturan",
    "Wajib Diperbaiki",
    "Disarankan",
    "Diunggah Oleh",
    "Tanggal Dibuat",
    "Tanggal Diperbarui",
  ];

  const rows = (data ?? []).map((m) => {
    const profile = Array.isArray(m.uploaded_by_profile) ? m.uploaded_by_profile[0] : m.uploaded_by_profile;
    return [
      m.title,
      m.original_file_name,
      statusMeta[m.status as ManuscriptStatus]?.label ?? m.status,
      String(m.version_number),
      String(m.total_rules_passed),
      String(m.total_rules_checked),
      String(m.error_findings),
      String(m.warning_findings),
      profile?.full_name ?? "—",
      new Date(m.created_at).toLocaleString("id-ID"),
      new Date(m.updated_at).toLocaleString("id-ID"),
    ];
  });

  const csv = toCsv(headers, rows);
  const filename = month ? `daftar-naskah-${month}.csv` : "daftar-naskah-semua.csv";

  return new NextResponse(`﻿${csv}`, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
