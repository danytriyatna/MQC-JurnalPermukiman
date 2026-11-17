import { NextRequest, NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/guard";
import { db, manuscripts as manuscriptsTable } from "@/db";
import { eq } from "drizzle-orm";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const authResult = await requireStaffSession(request);
  if (authResult.errorResponse) {
    return authResult.errorResponse;
  }

  const { id } = await params;

  if (!id || !UUID_REGEX.test(id)) {
    return NextResponse.json({ error: "Format ID naskah tidak valid (harus berupa UUID)." }, { status: 400 });
  }

  const now = new Date();
  let affectedLocal = 0;

  // Eksekusi soft-delete di basis data lokal PostgreSQL (mqc_db) via Drizzle ORM
  try {
    const updated = await db
      .update(manuscriptsTable)
      .set({
        deletedAt: now,
        updatedAt: now,
      })
      .where(eq(manuscriptsTable.id, id))
      .returning({ id: manuscriptsTable.id });

    affectedLocal = updated.length;
  } catch (err) {
    console.error("Gagal melakukan soft-delete naskah di database lokal:", err);
  }

  return NextResponse.json({
    success: true,
    id,
    deletedAt: now.toISOString(),
    affectedLocal,
  });
}
