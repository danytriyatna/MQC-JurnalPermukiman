import { NextRequest, NextResponse } from "next/server";
import { readManuscriptFile } from "@/lib/storage/localStorage";
import { requireStaffOrInspectionToken } from "@/lib/auth/guard";
import { db, manuscripts, manuscriptVersions } from "@/db";
import { eq } from "drizzle-orm";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  const authResult = await requireStaffOrInspectionToken(request, id);
  if (authResult.errorResponse) {
    return authResult.errorResponse;
  }

  // 2. Ambil Informasi Naskah & Versi Aktif dari Basis Data
  const rows = await db
    .select({
      originalFileName: manuscriptVersions.originalFileName,
      fileStoragePath: manuscriptVersions.fileStoragePath,
    })
    .from(manuscripts)
    .innerJoin(manuscriptVersions, eq(manuscriptVersions.id, manuscripts.currentVersionId))
    .where(eq(manuscripts.id, id))
    .limit(1);

  if (rows.length === 0) {
    return NextResponse.json({ error: "Naskah atau versi naskah tidak ditemukan." }, { status: 404 });
  }

  const version = rows[0];

  // 3. Baca Berkas Dokumen Fisik dari Disk Lokal
  let buffer: Buffer;
  try {
    buffer = await readManuscriptFile(version.fileStoragePath);
  } catch {
    return NextResponse.json(
      { error: "Berkas naskah tidak ditemukan di penyimpanan lokal." },
      { status: 404 },
    );
  }

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(version.originalFileName)}"`,
    },
  });
}
