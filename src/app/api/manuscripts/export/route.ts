import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { toCsv } from "@/lib/csv";
import { statusMeta } from "@/lib/status";
import { ManuscriptStatus } from "@/lib/types";
import { db, manuscripts as manuscriptsTable, users } from "@/db";
import { eq, isNull, desc, and, gte, lt } from "drizzle-orm";

export const dynamic = "force-dynamic";

function monthRange(month: string): { start: Date; end: Date } | null {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const [year, mon] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, mon - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, mon, 1, 0, 0, 0));
  return { start, end };
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Menunggu Pemeriksaan",
  processing: "Sedang Diproses",
  passed: "Sesuai Format Template",
  needs_revision: "Perlu Perbaikan Format",
  processing_failed: "Gagal Diproses",
};

export async function GET(request: NextRequest) {
  const month = request.nextUrl.searchParams.get("month") ?? "";
  const range = month ? monthRange(month) : null;

  if (month && !range) {
    return NextResponse.json({ error: "Parameter bulan tidak valid (format harus YYYY-MM)." }, { status: 400 });
  }

  const headers = [
    "Judul Naskah",
    "Nama Berkas",
    "Status Pemeriksaan",
    "Versi Naskah",
    "Aturan Terpenuhi",
    "Total Aturan Diperiksa",
    "Wajib Diperbaiki",
    "Disarankan",
    "Penulis / Pengunggah",
    "Tanggal Masuk",
    "Tanggal Terakhir Diperbarui",
  ];

  let rows: string[][] = [];
  let foundInLocal = false;

  // 1. Ambil data dari basis data lokal PostgreSQL (mqc_db) via Drizzle ORM
  try {
    const conditions = [isNull(manuscriptsTable.deletedAt)];
    if (range) {
      conditions.push(gte(manuscriptsTable.createdAt, range.start));
      conditions.push(lt(manuscriptsTable.createdAt, range.end));
    }

    const localRows = await db
      .select({
        title: manuscriptsTable.title,
        originalFileName: manuscriptsTable.originalFileName,
        status: manuscriptsTable.status,
        versionNumber: manuscriptsTable.versionNumber,
        totalRulesChecked: manuscriptsTable.totalRulesChecked,
        totalRulesPassed: manuscriptsTable.totalRulesPassed,
        errorFindings: manuscriptsTable.errorFindings,
        warningFindings: manuscriptsTable.warningFindings,
        authorName: manuscriptsTable.authorName,
        uploaderName: users.fullName,
        createdAt: manuscriptsTable.createdAt,
        updatedAt: manuscriptsTable.updatedAt,
      })
      .from(manuscriptsTable)
      .leftJoin(users, eq(users.id, manuscriptsTable.uploadedBy))
      .where(and(...conditions))
      .orderBy(desc(manuscriptsTable.createdAt));

    if (localRows.length > 0) {
      foundInLocal = true;
      rows = localRows.map((m) => {
        const uploader = m.authorName || m.uploaderName || "Penulis OJS";
        const statusLabel =
          STATUS_LABELS[m.status] ?? (statusMeta[m.status as ManuscriptStatus]?.label ?? m.status);

        return [
          m.title,
          m.originalFileName,
          statusLabel,
          `v${m.versionNumber}`,
          String(m.totalRulesPassed),
          String(m.totalRulesChecked),
          String(m.errorFindings),
          String(m.warningFindings),
          uploader,
          new Date(m.createdAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }),
          new Date(m.updatedAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }),
        ];
      });
    }
  } catch (err) {
    console.error("Gagal mengambil data ekspor dari PostgreSQL lokal:", err);
  }

  // 2. Fallback ke Supabase jika basis data lokal kosong dan kredensial Supabase tersedia
  if (!foundInLocal) {
    try {
      const supabase = await createClient();
      let query = supabase
        .from("manuscripts")
        .select(
          "title, original_file_name, status, version_number, total_rules_checked, total_rules_passed, error_findings, warning_findings, created_at, updated_at, author_name, uploaded_by_profile:profiles!uploaded_by(full_name)",
        )
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (range) {
        query = query
          .gte("created_at", range.start.toISOString())
          .lt("created_at", range.end.toISOString());
      }

      const { data } = await query;
      if (data && data.length > 0) {
        rows = data.map((m: any) => {
          const profile = Array.isArray(m.uploaded_by_profile)
            ? m.uploaded_by_profile[0]
            : m.uploaded_by_profile;
          const uploader = m.author_name || profile?.full_name || "Penulis OJS";
          const statusLabel =
            STATUS_LABELS[m.status] ?? (statusMeta[m.status as ManuscriptStatus]?.label ?? m.status);

          return [
            m.title,
            m.original_file_name,
            statusLabel,
            `v${m.version_number}`,
            String(m.total_rules_passed),
            String(m.total_rules_checked),
            String(m.error_findings),
            String(m.warning_findings),
            uploader,
            new Date(m.created_at).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }),
            new Date(m.updated_at).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }),
          ];
        });
      }
    } catch {
      // Abaikan jika Supabase offline/tidak dikonfigurasi
    }
  }

  const csv = toCsv(headers, rows);
  const filename = month ? `rekap-naskah-${month}.csv` : "rekap-naskah-semua.csv";

  // \uFEFF adalah UTF-8 BOM agar Microsoft Excel membuka aksen dan karakter khusus dengan benar
  return new NextResponse(`\uFEFF${csv}`, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
