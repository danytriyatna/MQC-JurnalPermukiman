import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { id: manuscriptId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Anda harus login." }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("manuscript_versions")
    .select(
      "id, version_number, original_file_name, uploaded_at, parse_status, parse_error_message, uploaded_by_profile:profiles!uploaded_by(full_name)",
    )
    .eq("manuscript_id", manuscriptId)
    .order("version_number", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Gagal memuat riwayat versi." }, { status: 500 });
  }

  return NextResponse.json({ data });
}
