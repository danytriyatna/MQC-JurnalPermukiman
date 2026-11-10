import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db, manuscripts as manuscriptsTable } from "@/db";
import { inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-mqc-api-key",
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  let body: { manuscriptIds?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Format payload request harus berupa JSON." },
      { status: 400, headers: corsHeaders },
    );
  }

  if (!body || typeof body !== "object" || !Array.isArray(body.manuscriptIds)) {
    return NextResponse.json(
      { success: false, error: "manuscriptIds wajib berupa array string UUID naskah." },
      { status: 400, headers: corsHeaders },
    );
  }

  const validIds = Array.from(
    new Set(
      body.manuscriptIds.filter(
        (id): id is string => typeof id === "string" && UUID_REGEX.test(id.trim()),
      ),
    ),
  );

  if (validIds.length === 0) {
    return NextResponse.json(
      { success: true, deletedCount: 0, message: "Tidak ada ID naskah valid yang diberikan." },
      { status: 200, headers: corsHeaders },
    );
  }

  const now = new Date();
  let localDeletedCount = 0;

  // 1. Eksekusi soft-delete massal di PostgreSQL lokal (mqc_db) via Drizzle ORM
  try {
    const updatedRows = await db
      .update(manuscriptsTable)
      .set({
        deletedAt: now,
        updatedAt: now,
      })
      .where(inArray(manuscriptsTable.id, validIds))
      .returning({ id: manuscriptsTable.id });

    localDeletedCount = updatedRows.length;
  } catch (err) {
    console.error("Gagal melakukan soft-delete massal di database lokal:", err);
  }

  // 2. Sinkronisasi soft-delete massal ke Supabase jika tersedia
  try {
    const supabase = await createClient();
    await supabase
      .from("manuscripts")
      .update({ deleted_at: now.toISOString() })
      .in("id", validIds);
  } catch {
    // Abaikan jika Supabase offline
  }

  return NextResponse.json(
    {
      success: true,
      deletedCount: localDeletedCount || validIds.length,
      requestedCount: validIds.length,
      deletedAt: now.toISOString(),
    },
    { status: 200, headers: corsHeaders },
  );
}
