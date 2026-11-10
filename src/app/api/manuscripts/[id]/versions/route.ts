import { NextResponse } from "next/server";
import { db, manuscriptVersions, users } from "@/db";
import { eq, desc } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { id: manuscriptId } = await params;

  try {
    const rows = await db
      .select({
        id: manuscriptVersions.id,
        version_number: manuscriptVersions.versionNumber,
        original_file_name: manuscriptVersions.originalFileName,
        uploaded_at: manuscriptVersions.uploadedAt,
        parse_status: manuscriptVersions.parseStatus,
        parse_error_message: manuscriptVersions.parseErrorMessage,
        uploader_name: users.fullName,
      })
      .from(manuscriptVersions)
      .leftJoin(users, eq(users.id, manuscriptVersions.uploadedBy))
      .where(eq(manuscriptVersions.manuscriptId, manuscriptId))
      .orderBy(desc(manuscriptVersions.versionNumber));

    const data = rows.map((r) => ({
      id: r.id,
      version_number: r.version_number,
      original_file_name: r.original_file_name,
      uploaded_at: r.uploaded_at.toISOString(),
      parse_status: r.parse_status,
      parse_error_message: r.parse_error_message,
      uploaded_by_profile: r.uploader_name ? { full_name: r.uploader_name } : null,
    }));

    return NextResponse.json({ data });
  } catch (err) {
    console.error("Gagal memuat riwayat versi dari PostgreSQL lokal:", err);
  }

  // Fallback ke Supabase jika lokal gagal
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("manuscript_versions")
      .select(
        "id, version_number, original_file_name, uploaded_at, parse_status, parse_error_message, uploaded_by_profile:profiles!uploaded_by(full_name)",
      )
      .eq("manuscript_id", manuscriptId)
      .order("version_number", { ascending: false });

    if (!error && data) {
      return NextResponse.json({ data });
    }
  } catch {
    // Abaikan jika Supabase offline
  }

  return NextResponse.json({ error: "Gagal memuat riwayat versi." }, { status: 500 });
}
