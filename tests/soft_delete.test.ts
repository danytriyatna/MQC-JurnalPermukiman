import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { db, manuscripts, users, client } from "../src/db";
import { eq, isNull, inArray, and } from "drizzle-orm";
import { NextRequest } from "next/server";
import { DELETE as deleteSingleRoute } from "../src/app/api/manuscripts/[id]/route";
import { POST as deleteBatchRoute } from "../src/app/api/manuscripts/delete-batch/route";

describe("Soft Delete Feature Verification Suite (Single & Batch)", () => {
  after(async () => {
    await client.end();
  });

  it("soft-deletes a single manuscript via DELETE /api/manuscripts/[id]", async () => {
    // 1. Ambil 1 user seed
    const userRows = await db.select().from(users).limit(1);
    const userId = userRows[0]?.id;

    // 2. Buat naskah dummy pending
    const [inserted] = await db
      .insert(manuscripts)
      .values({
        title: "Naskah Uji Coba Soft Delete Satuan",
        originalFileName: "uji-coba-satuan.docx",
        uploadedBy: userId,
        status: "pending",
        versionNumber: 1,
      })
      .returning();

    assert.ok(inserted.id, "Naskah dummy harus berhasil di-insert");
    assert.equal(inserted.deletedAt, null, "deletedAt awal harus null");

    // 3. Panggil endpoint DELETE satuan
    const dummyReq = new NextRequest(`http://localhost:3000/api/manuscripts/${inserted.id}`, {
      method: "DELETE",
    });

    const res = await deleteSingleRoute(dummyReq, {
      params: Promise.resolve({ id: inserted.id }),
    });

    assert.equal(res.status, 200, "Respon harus HTTP 200");
    const json = (await res.json()) as { success: boolean; id: string; affectedLocal: number };
    assert.equal(json.success, true, "Respon JSON harus success: true");
    assert.equal(json.affectedLocal, 1, "Harus mengupdate 1 baris naskah di DB lokal");

    // 4. Verifikasi di DB: kolom deleted_at tidak null
    const [updatedRow] = await db
      .select()
      .from(manuscripts)
      .where(eq(manuscripts.id, inserted.id));

    assert.ok(updatedRow.deletedAt !== null, "deleted_at harus terisi timestamp");

    // 5. Verifikasi di query aktif dasbor (.where(isNull(deletedAt)))
    const activeRows = await db
      .select()
      .from(manuscripts)
      .where(and(eq(manuscripts.id, inserted.id), isNull(manuscripts.deletedAt)));

    assert.equal(activeRows.length, 0, "Naskah yang di-soft-delete tidak boleh muncul di query dasbor aktif");

    // Bersihkan data uji
    await db.delete(manuscripts).where(eq(manuscripts.id, inserted.id));
  });

  it("soft-deletes multiple manuscripts via POST /api/manuscripts/delete-batch", async () => {
    const userRows = await db.select().from(users).limit(1);
    const userId = userRows[0]?.id;

    // 1. Buat 3 naskah dummy pending
    const insertedList = await db
      .insert(manuscripts)
      .values([
        {
          title: "Naskah Batch Soft Delete 1",
          originalFileName: "batch-1.docx",
          uploadedBy: userId,
          status: "pending",
        },
        {
          title: "Naskah Batch Soft Delete 2",
          originalFileName: "batch-2.docx",
          uploadedBy: userId,
          status: "pending",
        },
        {
          title: "Naskah Batch Soft Delete 3",
          originalFileName: "batch-3.docx",
          uploadedBy: userId,
          status: "pending",
        },
      ])
      .returning();

    const ids = insertedList.map((m) => m.id);
    assert.equal(ids.length, 3, "Harus membuat 3 naskah uji");

    // 2. Panggil endpoint batch delete
    const batchReq = new NextRequest("http://localhost:3000/api/manuscripts/delete-batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ manuscriptIds: ids }),
    });

    const res = await deleteBatchRoute(batchReq);
    assert.equal(res.status, 200, "Batch delete harus mengembalikan HTTP 200");
    const json = (await res.json()) as { success: boolean; deletedCount: number };
    assert.equal(json.success, true, "Batch delete harus success: true");
    assert.equal(json.deletedCount, 3, "Harus melaporkan 3 naskah terhapus");

    // 3. Verifikasi di DB: ketiga naskah memiliki deleted_at !== null
    const checkRows = await db
      .select()
      .from(manuscripts)
      .where(inArray(manuscripts.id, ids));

    assert.equal(checkRows.length, 3);
    for (const row of checkRows) {
      assert.ok(row.deletedAt !== null, `Naskah ${row.id} harus memiliki timestamp deleted_at`);
    }

    // 4. Verifikasi query aktif (isNull(deletedAt)) tidak menemukan naskah ini
    const activeCheck = await db
      .select()
      .from(manuscripts)
      .where(and(inArray(manuscripts.id, ids), isNull(manuscripts.deletedAt)));

    assert.equal(activeCheck.length, 0, "Tidak ada naskah soft-deleted yang muncul di daftar aktif");

    // Bersihkan data uji
    await db.delete(manuscripts).where(inArray(manuscripts.id, ids));
  });

  it("handles batch delete edge cases: empty array and invalid payload gracefully", async () => {
    // 1. Array kosong
    const emptyReq = new NextRequest("http://localhost:3000/api/manuscripts/delete-batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ manuscriptIds: [] }),
    });
    const emptyRes = await deleteBatchRoute(emptyReq);
    assert.equal(emptyRes.status, 200);
    const emptyJson = (await emptyRes.json()) as { success: boolean; deletedCount: number };
    assert.equal(emptyJson.deletedCount, 0);

    // 2. Payload bukan array
    const invalidReq = new NextRequest("http://localhost:3000/api/manuscripts/delete-batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ manuscriptIds: "bukan-array" }),
    });
    const invalidRes = await deleteBatchRoute(invalidReq);
    assert.equal(invalidRes.status, 400);
  });
});
