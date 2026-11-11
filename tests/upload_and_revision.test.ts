import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import { Document, Packer, Paragraph, TextRun } from "docx";
import { POST as createManuscriptPOST } from "../src/app/api/manuscripts/route";
import { POST as createRevisionPOST } from "../src/app/api/manuscripts/[id]/revisions/route";
import { GET as getVersionsGET } from "../src/app/api/manuscripts/[id]/versions/route";
import { GET as getVersionDetailGET } from "../src/app/api/manuscripts/[id]/versions/[versionId]/route";
import { GET as downloadVersionGET } from "../src/app/api/manuscripts/[id]/versions/[versionId]/download/route";
import { GET as reportVersionGET } from "../src/app/api/manuscripts/[id]/versions/[versionId]/report/route";
import { db, manuscripts, manuscriptVersions, screeningRuns, findings, client } from "../src/db";
import { eq } from "drizzle-orm";
import { getStorageDir } from "../src/lib/storage/localStorage";

describe("Point 2: Modernized Local Storage & PostgreSQL Upload and Revision Test Suite", () => {
  let sampleDocxBuffer: Buffer;
  let createdManuscriptId: string;

  before(async () => {
    process.env.MANUSCRIPT_STORAGE_DIR = "storage/test_manuscripts_upload";

    // Buat dummy berkas DOCX valid
    const doc = new Document({
      sections: [
        {
          properties: {},
          children: [
            new Paragraph({
              children: [new TextRun("Naskah Uji Unggah Langsung Local Storage")],
            }),
          ],
        },
      ],
    });
    sampleDocxBuffer = await Packer.toBuffer(doc);
  });

  after(async () => {
    // Bersihkan manuskrip uji
    if (createdManuscriptId) {
      await db.delete(manuscripts).where(eq(manuscripts.id, createdManuscriptId));
    }

    // Bersihkan storage pengujian
    try {
      const testDir = getStorageDir();
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Abaikan bila sudah dibersihkan
    }

    await client.end();
  });

  it("POST /api/manuscripts successfully creates new manuscript from FormData and saves to local disk", async () => {
    const formData = new FormData();
    const file = new File([new Uint8Array(sampleDocxBuffer)], "test_naskah_pertama.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    formData.append("file", file);

    const req = new NextRequest("http://localhost:3000/api/manuscripts", {
      method: "POST",
      body: formData,
    });

    const res = await createManuscriptPOST(req);
    assert.equal(res.status, 201, "Harus mengembalikan HTTP 201 Created");

    const body = await res.json();
    assert.ok(body.manuscriptId, "Response harus menyertakan manuscriptId");
    createdManuscriptId = body.manuscriptId;

    // Verifikasi data tersimpan di PostgreSQL
    const msRows = await db
      .select()
      .from(manuscripts)
      .where(eq(manuscripts.id, createdManuscriptId));
    assert.equal(msRows.length, 1);
    assert.equal(msRows[0].title, "test_naskah_pertama");
    assert.equal(msRows[0].versionNumber, 1);
    assert.ok(msRows[0].currentVersionId, "currentVersionId harus terisi");

    // Verifikasi baris versi 1
    const vRows = await db
      .select()
      .from(manuscriptVersions)
      .where(eq(manuscriptVersions.id, msRows[0].currentVersionId!));
    assert.equal(vRows.length, 1);
    assert.equal(vRows[0].versionNumber, 1);
    assert.equal(vRows[0].originalFileName, "test_naskah_pertama.docx");
    assert.equal(vRows[0].parseStatus, "success");

    // Verifikasi berkas fisik ada di folder storage lokal
    const fullPath = path.join(getStorageDir(), vRows[0].fileStoragePath);
    const fileStat = await fs.stat(fullPath);
    assert.ok(fileStat.size > 0, "Berkas fisik harus ada di disk dan tidak kosong");
  });

  it("POST /api/manuscripts/[id]/revisions successfully increments version to 2 and saves revision to disk", async () => {
    assert.ok(createdManuscriptId, "Manuscript harus sudah dibuat di test sebelumnya");

    const formData = new FormData();
    const file = new File([new Uint8Array(sampleDocxBuffer)], "test_naskah_revisi.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    formData.append("file", file);

    const req = new NextRequest(
      `http://localhost:3000/api/manuscripts/${createdManuscriptId}/revisions`,
      {
        method: "POST",
        body: formData,
      },
    );

    const res = await createRevisionPOST(req, {
      params: Promise.resolve({ id: createdManuscriptId }),
    });
    assert.equal(res.status, 201, "Harus mengembalikan HTTP 201 Created");

    const body = await res.json();
    assert.equal(body.manuscriptId, createdManuscriptId);
    assert.ok(body.versionId, "Response harus menyertakan versionId");

    // Verifikasi status induk terupdate ke versionNumber = 2
    const msRows = await db
      .select()
      .from(manuscripts)
      .where(eq(manuscripts.id, createdManuscriptId));
    assert.equal(msRows[0].versionNumber, 2, "versionNumber induk harus 2");
    assert.equal(msRows[0].currentVersionId, body.versionId);

    // Verifikasi total ada 2 versi di manuscript_versions
    const allVersions = await db
      .select()
      .from(manuscriptVersions)
      .where(eq(manuscriptVersions.manuscriptId, createdManuscriptId));
    assert.equal(allVersions.length, 2, "Harus ada 2 versi tersimpan di DB");

    // Verifikasi berkas fisik revisi ada di disk
    const revVersion = allVersions.find((v) => v.versionNumber === 2)!;
    assert.ok(revVersion.fileStoragePath.includes("revisions"));
    const fullPath = path.join(getStorageDir(), revVersion.fileStoragePath);
    const fileStat = await fs.stat(fullPath);
    assert.ok(fileStat.size > 0, "Berkas fisik revisi harus tersimpan di disk");
  });

  it("GET /api/manuscripts/[id]/versions returns full version list from PostgreSQL", async () => {
    assert.ok(createdManuscriptId);

    const req = new NextRequest(
      `http://localhost:3000/api/manuscripts/${createdManuscriptId}/versions`,
    );
    const res = await getVersionsGET(req, {
      params: Promise.resolve({ id: createdManuscriptId }),
    });
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.ok(Array.isArray(body.data));
    assert.equal(body.data.length, 2);
    assert.equal(body.data[0].version_number, 2, "Versi terbaru (2) harus berada di urutan pertama");
    assert.equal(body.data[1].version_number, 1);
  });

  it("GET /api/manuscripts/[id]/versions/[versionId] returns specific version analysis detail", async () => {
    assert.ok(createdManuscriptId);

    // Ambil daftar versi untuk mendapatkan versionId v2
    const allVersions = await db
      .select()
      .from(manuscriptVersions)
      .where(eq(manuscriptVersions.manuscriptId, createdManuscriptId));
    const v2 = allVersions.find((v) => v.versionNumber === 2)!;
    assert.ok(v2);

    const req = new NextRequest(
      `http://localhost:3000/api/manuscripts/${createdManuscriptId}/versions/${v2.id}`,
    );
    const res = await getVersionDetailGET(req, {
      params: Promise.resolve({ id: createdManuscriptId, versionId: v2.id }),
    });
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.version.versionNumber, 2);
    assert.ok(Array.isArray(body.data.findings));
  });

  it("GET /api/manuscripts/[id]/versions/[versionId]/download downloads version physical docx file", async () => {
    assert.ok(createdManuscriptId);

    const allVersions = await db
      .select()
      .from(manuscriptVersions)
      .where(eq(manuscriptVersions.manuscriptId, createdManuscriptId));
    const v2 = allVersions.find((v) => v.versionNumber === 2)!;
    assert.ok(v2);

    const req = new NextRequest(
      `http://localhost:3000/api/manuscripts/${createdManuscriptId}/versions/${v2.id}/download`,
    );
    const res = await downloadVersionGET(req, {
      params: Promise.resolve({ id: createdManuscriptId, versionId: v2.id }),
    });
    assert.equal(res.status, 200);
    assert.ok(res.headers.get("content-disposition")?.includes("attachment"));
    assert.equal(
      res.headers.get("content-type"),
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
  });

  it("GET /api/manuscripts/[id]/versions/[versionId]/report generates and downloads version evaluation DOCX report", async () => {
    assert.ok(createdManuscriptId);

    const allVersions = await db
      .select()
      .from(manuscriptVersions)
      .where(eq(manuscriptVersions.manuscriptId, createdManuscriptId));
    const v2 = allVersions.find((v) => v.versionNumber === 2)!;
    assert.ok(v2);

    const req = new NextRequest(
      `http://localhost:3000/api/manuscripts/${createdManuscriptId}/versions/${v2.id}/report`,
    );
    const res = await reportVersionGET(req, {
      params: Promise.resolve({ id: createdManuscriptId, versionId: v2.id }),
    });
    assert.equal(res.status, 200);
    assert.ok(res.headers.get("content-disposition")?.includes("attachment"));
    assert.ok(res.headers.get("content-disposition")?.includes("Laporan-review-"));
    assert.equal(
      res.headers.get("content-type"),
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
  });

  it("handles validation edge cases: missing file, non-docx, and invalid manuscript ID", async () => {
    // 1. Missing file in POST /api/manuscripts
    const emptyForm = new FormData();
    const reqEmpty = new NextRequest("http://localhost:3000/api/manuscripts", {
      method: "POST",
      body: emptyForm,
    });
    const resEmpty = await createManuscriptPOST(reqEmpty);
    assert.equal(resEmpty.status, 400);

    // 2. Non-docx file in POST /api/manuscripts
    const txtForm = new FormData();
    txtForm.append("file", new File(["sample text"], "document.txt", { type: "text/plain" }));
    const reqTxt = new NextRequest("http://localhost:3000/api/manuscripts", {
      method: "POST",
      body: txtForm,
    });
    const resTxt = await createManuscriptPOST(reqTxt);
    assert.equal(resTxt.status, 400);

    // 3. Revisions for non-existent manuscript ID
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const dummyForm = new FormData();
    dummyForm.append("file", new File([new Uint8Array(sampleDocxBuffer)], "valid.docx"));
    const reqFake = new NextRequest(
      `http://localhost:3000/api/manuscripts/${fakeId}/revisions`,
      {
        method: "POST",
        body: dummyForm,
      },
    );
    const resFake = await createRevisionPOST(reqFake, {
      params: Promise.resolve({ id: fakeId }),
    });
    assert.equal(resFake.status, 404);
  });
});
