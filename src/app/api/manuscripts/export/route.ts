import { NextRequest, NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/guard";
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
  const authResult = await requireStaffSession(request);
  if (authResult.errorResponse) {
    return authResult.errorResponse;
  }

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

  // Ambil data dari basis data lokal PostgreSQL (mqc_db) via Drizzle ORM
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
