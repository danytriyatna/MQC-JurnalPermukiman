import { NextRequest, NextResponse } from "next/server";
import { readManuscriptFile } from "@/lib/storage/localStorage";
import { db, manuscriptVersions } from "@/db";
import { eq, and } from "drizzle-orm";

interface RouteParams {
  params: Promise<{ id: string; versionId: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id: manuscriptId, versionId } = await params;

  try {
    const rows = await db
      .select({
        originalFileName: manuscriptVersions.originalFileName,
        fileStoragePath: manuscriptVersions.fileStoragePath,
      })
      .from(manuscriptVersions)
      .where(
        and(
          eq(manuscriptVersions.id, versionId),
          eq(manuscriptVersions.manuscriptId, manuscriptId),
        ),
      )
      .limit(1);

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "Versi berkas naskah tidak ditemukan." },
        { status: 404 },
      );
    }

    const version = rows[0];
    const buffer = await readManuscriptFile(version.fileStoragePath);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(version.originalFileName)}"`,
      },
    });
  } catch (err) {
    console.error("Gagal mengunduh berkas versi naskah:", err);
    return NextResponse.json(
      { error: "Gagal membaca berkas naskah dari penyimpanan." },
      { status: 500 },
    );
  }
}
