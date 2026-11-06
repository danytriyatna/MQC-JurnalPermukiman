import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { readManuscriptFile } from "@/lib/storage/localStorage";
import { verifyInspectionToken } from "@/lib/auth/token";
import { db, manuscripts, manuscriptVersions } from "@/db";
import { eq } from "drizzle-orm";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  // 1. Verifikasi Otorisasi: Signed Token ATAU Sesi Pengguna
  const token = request.nextUrl.searchParams.get("token");
  let isAuthorized = false;

  if (token) {
    const verified = await verifyInspectionToken(token, id);
    if (verified) {
      isAuthorized = true;
    }
  }

  if (!isAuthorized) {
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        isAuthorized = true;
      }
    } catch {
      // Abaikan jika Supabase auth gagal/tidak dikonfigurasi
    }
  }

  if (!isAuthorized) {
    return NextResponse.json(
      { error: "Unauthorized: Anda harus login atau menyertakan token inspeksi yang sah." },
      { status: 401 },
    );
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

  // 3. Baca Berkas Dokumen Fisik (Disk Lokal dengan Fallback ke Supabase Storage)
  let buffer: Buffer;
  try {
    buffer = await readManuscriptFile(version.fileStoragePath);
  } catch {
    try {
      const supabase = await createClient();
      const { data: fileBlob, error: downloadError } = await supabase.storage
        .from("manuscripts")
        .download(version.fileStoragePath);

      if (downloadError || !fileBlob) {
        throw new Error("Berkas tidak ditemukan di storage.");
      }
      buffer = Buffer.from(await fileBlob.arrayBuffer());
    } catch {
      return NextResponse.json(
        { error: "Gagal mengambil berkas naskah dari penyimpanan lokal maupun cloud." },
        { status: 404 },
      );
    }
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
