import fs from "fs/promises";
import { NextResponse } from "next/server";
import { findOjsSubmission } from "@/lib/ojs/localStore";
import { createClient } from "@/lib/supabase/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;

  if (id.startsWith("ojs-")) {
    const ojsItem = await findOjsSubmission(id);
    if (!ojsItem?.filePath) {
      return NextResponse.json({ error: "Berkas asli naskah OJS tidak tersedia." }, { status: 404 });
    }
    try {
      const buffer = await fs.readFile(ojsItem.filePath);
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="${ojsItem.originalFileName}"`,
        },
      });
    } catch {
      return NextResponse.json({ error: "Gagal membaca berkas naskah OJS." }, { status: 500 });
    }
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Anda harus login." }, { status: 401 });
  }

  const { data: manuscript, error: manuscriptError } = await supabase
    .from("manuscripts")
    .select("current_version_id")
    .eq("id", id)
    .single();

  if (manuscriptError || !manuscript?.current_version_id) {
    return NextResponse.json({ error: "Naskah tidak ditemukan." }, { status: 404 });
  }

  const { data: version, error: versionError } = await supabase
    .from("manuscript_versions")
    .select("original_file_name, file_storage_path")
    .eq("id", manuscript.current_version_id)
    .single();

  if (versionError || !version) {
    return NextResponse.json({ error: "Versi naskah tidak ditemukan." }, { status: 404 });
  }

  const { data: fileBlob, error: downloadError } = await supabase.storage
    .from("manuscripts")
    .download(version.file_storage_path);

  if (downloadError || !fileBlob) {
    return NextResponse.json({ error: "Gagal mengambil file naskah." }, { status: 500 });
  }

  const buffer = Buffer.from(await fileBlob.arrayBuffer());

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${version.original_file_name}"`,
    },
  });
}
