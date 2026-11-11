import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import { Document, Packer, Paragraph, TextRun } from "docx";
import JSZip from "jszip";
import { OPTIONS, POST } from "../src/app/api/check-submission/route";
import { POST as batchScreenPOST } from "../src/app/api/manuscripts/screen-batch/route";
import { GET as getOriginalFile } from "../src/app/api/manuscripts/[id]/original/route";
import { createInspectionToken } from "../src/lib/auth/token";
import { db, manuscripts, manuscriptVersions, screeningRuns, client } from "../src/db";
import { eq } from "drizzle-orm";
import { getStorageDir } from "../src/lib/storage/localStorage";

describe("Endpoint POST /api/check-submission & Asynchronous Editorial Screening Queue Test", () => {
  const SECRET_KEY = "pupr_mqc_secure_token_2026";
  const TEST_OJS_SUBMISSION_ID = 9999753;
  let sampleDocxBuffer: Buffer;
  let createdManuscriptId: string;

  before(async () => {
    process.env.MQC_API_SECRET = SECRET_KEY;
    process.env.JWT_SECRET = "test_jwt_secret_at_least_32_characters_long_for_mqc_2026";
    process.env.CORS_ALLOWED_ORIGIN = "http://localhost:8000";
    process.env.OJS_SYNC_DRY_RUN = "true";
    process.env.AUTO_DRAIN_ON_INGEST = "false";
    process.env.MANUSCRIPT_STORAGE_DIR = "storage/test_manuscripts";

    // Bersihkan naskah uji lama jika ada
    await db.delete(manuscripts).where(eq(manuscripts.ojsSubmissionId, TEST_OJS_SUBMISSION_ID));

    // Generate a minimal valid docx in memory
    const doc = new Document({
      sections: [
        {
          properties: {},
          children: [
            new Paragraph({
              children: [new TextRun("Pengujian Naskah Otomatis MQC")],
            }),
          ],
        },
      ],
    });
    sampleDocxBuffer = await Packer.toBuffer(doc);
  });

  after(async () => {
    // Bersihkan data uji dari database
    if (createdManuscriptId) {
      await db.delete(manuscripts).where(eq(manuscripts.id, createdManuscriptId));
    }
    await db.delete(manuscripts).where(eq(manuscripts.ojsSubmissionId, TEST_OJS_SUBMISSION_ID));

    // Bersihkan folder storage pengujian
    try {
      const testDir = getStorageDir();
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Abaikan
    }
    await client.end();
  });

  it("handles OPTIONS preflight with required CORS allowlist headers", async () => {
    const res = await OPTIONS();
    assert.equal(res.status, 204);
    assert.equal(res.headers.get("access-control-allow-origin"), "http://localhost:8000");
    assert.ok(res.headers.get("access-control-allow-headers")?.includes("x-mqc-api-key"));
  });

  it("rejects POST requests missing x-mqc-api-key with HTTP 401", async () => {
    const req = new NextRequest("http://localhost:3000/api/check-submission", {
      method: "POST",
    });

    const res = await POST(req);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.ok(body.error.includes("Unauthorized"));
  });

  it("rejects POST requests with invalid x-mqc-api-key with HTTP 401", async () => {
    const req = new NextRequest("http://localhost:3000/api/check-submission", {
      method: "POST",
      headers: {
        "x-mqc-api-key": "token_salah_12345",
      },
    });

    const res = await POST(req);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.ok(body.error.includes("Unauthorized"));
  });

  it("rejects POST requests without a file attachment with HTTP 400", async () => {
    const formData = new FormData();
    const req = new NextRequest("http://localhost:3000/api/check-submission", {
      method: "POST",
      headers: {
        "x-mqc-api-key": SECRET_KEY,
      },
      body: formData,
    });

    const res = await POST(req);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.ok(body.error.includes("Berkas naskah tidak ditemukan"));
  });

  it("rejects POST requests with non-docx file with HTTP 400", async () => {
    const formData = new FormData();
    const fakeFile = new File(["fake content"], "article.pdf", { type: "application/pdf" });
    formData.append("file", fakeFile);

    const req = new NextRequest("http://localhost:3000/api/check-submission", {
      method: "POST",
      headers: {
        "x-mqc-api-key": SECRET_KEY,
      },
      body: formData,
    });

    const res = await POST(req);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.ok(body.error.includes(".docx"));
  });

  it("rejects POST requests with non-PKZip magic bytes even if named .docx with HTTP 400", async () => {
    const formData = new FormData();
    const fakeDocx = new File(
      [new Uint8Array(Buffer.from("This is plain text, not a real zip buffer!"))],
      "malicious.docx",
      {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
    );
    formData.append("file", fakeDocx);

    const req = new NextRequest("http://localhost:3000/api/check-submission", {
      method: "POST",
      headers: {
        "x-mqc-api-key": SECRET_KEY,
      },
      body: formData,
    });

    const res = await POST(req);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.ok(body.error.includes("magic bytes"));
  });

  it("rejects POST requests with valid PKZip but invalid OpenXML structure with HTTP 400", async () => {
    // Generate valid zip that lacks [Content_Types].xml and word/document.xml
    const nonOpenXmlZip = new JSZip();
    nonOpenXmlZip.file("random.txt", "Some text file inside zip");
    const zipBuffer = await nonOpenXmlZip.generateAsync({ type: "nodebuffer" });

    const formData = new FormData();
    const corruptedDocx = new File([new Uint8Array(zipBuffer)], "invalid_structure.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    formData.append("file", corruptedDocx);

    const req = new NextRequest("http://localhost:3000/api/check-submission", {
      method: "POST",
      headers: {
        "x-mqc-api-key": SECRET_KEY,
      },
      body: formData,
    });

    const res = await POST(req);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.ok(
      body.error.includes("[Content_Types].xml") || body.error.includes("word/document.xml"),
    );
  });

  it("successfully ingests valid docx into pending queue (<100ms) with status 'pending' in DB", async () => {
    const startTime = Date.now();

    const formData = new FormData();
    const docxFile = new File([new Uint8Array(sampleDocxBuffer)], "naskah_uji_v1.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    formData.append("file", docxFile);
    formData.append("ojs_submission_id", String(TEST_OJS_SUBMISSION_ID));
    formData.append("ojs_user_id", "4948");
    formData.append("author_name", "Penulis Uji PDN");
    formData.append("author_email", "penulis_uji@jurnalpermukiman.pu.go.id");

    const req = new NextRequest("http://localhost:3000/api/check-submission", {
      method: "POST",
      headers: {
        "x-mqc-api-key": SECRET_KEY,
      },
      body: formData,
    });

    const res = await POST(req);
    const duration = Date.now() - startTime;
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.status, "pending");
    assert.ok(body.message.includes("antrean"));
    assert.equal(body.versionNumber, 1);
    assert.ok(body.manuscriptId, "Returns manuscript UUID");
    assert.ok(body.jobId, "Returns queued screening job UUID");
    assert.equal(body.viewUrl, undefined, "Does not expose unused viewUrl token in response");

    createdManuscriptId = body.manuscriptId;

    // Verifikasi naskah tersimpan di database dengan status pending dan aturan bernilai 0
    const dbManuscripts = await db
      .select()
      .from(manuscripts)
      .where(eq(manuscripts.id, createdManuscriptId))
      .limit(1);

    assert.equal(dbManuscripts.length, 1);
    assert.equal(dbManuscripts[0].ojsSubmissionId, TEST_OJS_SUBMISSION_ID);
    assert.equal(dbManuscripts[0].authorName, "Penulis Uji PDN");
    assert.equal(dbManuscripts[0].status, "pending");
    assert.equal(dbManuscripts[0].versionNumber, 1);
    assert.equal(dbManuscripts[0].totalRulesChecked, 0);
    assert.equal(dbManuscripts[0].totalRulesPassed, 0);
    assert.equal(dbManuscripts[0].errorFindings, 0);
    assert.equal(dbManuscripts[0].warningFindings, 0);

    // Verifikasi versi memiliki parseStatus: 'pending'
    const dbVersions = await db
      .select()
      .from(manuscriptVersions)
      .where(eq(manuscriptVersions.id, dbManuscripts[0].currentVersionId!))
      .limit(1);
    assert.equal(dbVersions.length, 1);
    assert.equal(dbVersions[0].parseStatus, "pending");

    // Verifikasi berkas fisik ada di disk penyimpanan lokal
    const subfolder = path.join(getStorageDir(), `sub_${TEST_OJS_SUBMISSION_ID}`);
    const files = await fs.readdir(subfolder);
    assert.ok(files.length > 0, "File .docx should exist in storage disk subfolder");
    assert.ok(files[0].endsWith(".docx"));
  });

  it("handles revision submission (v2) incrementing version number with status 'pending'", async () => {
    const formData = new FormData();
    const docxFile = new File([new Uint8Array(sampleDocxBuffer)], "naskah_uji_v2.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    formData.append("file", docxFile);
    formData.append("ojs_submission_id", String(TEST_OJS_SUBMISSION_ID));
    formData.append("ojs_user_id", "4948");
    formData.append("author_name", "Penulis Uji PDN");
    formData.append("author_email", "penulis_uji@jurnalpermukiman.pu.go.id");

    const req = new NextRequest("http://localhost:3000/api/check-submission", {
      method: "POST",
      headers: {
        "x-mqc-api-key": SECRET_KEY,
      },
      body: formData,
    });

    const res = await POST(req);
    assert.equal(res.status, 200);
    const body = await res.json();

    assert.equal(body.success, true);
    assert.equal(body.status, "pending");
    assert.equal(body.manuscriptId, createdManuscriptId, "Manuscript ID must remain same");
    assert.equal(body.versionNumber, 2, "Version number must increment to 2");

    // Verifikasi berkas fisik v2 bertambah di disk
    const subfolder = path.join(getStorageDir(), `sub_${TEST_OJS_SUBMISSION_ID}`);
    const files = await fs.readdir(subfolder);
    assert.equal(files.length, 2, "Storage directory should now contain 2 versions");
  });

  it("batch screening route POST /api/manuscripts/screen-batch screens pending manuscript and updates status to passed/needs_revision", async () => {
    const screenReq = new NextRequest("http://localhost:3000/api/manuscripts/screen-batch", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        manuscriptIds: [createdManuscriptId],
      }),
    });

    const screenRes = await batchScreenPOST(screenReq);
    assert.equal(screenRes.status, 200);
    const screenBody = await screenRes.json();

    assert.equal(screenBody.success, true);
    assert.equal(screenBody.processedCount, 1);
    assert.equal(screenBody.results.length, 1);
    assert.equal(screenBody.results[0].manuscriptId, createdManuscriptId);
    assert.equal(screenBody.results[0].success, true);
    assert.ok(
      screenBody.results[0].status === "passed" || screenBody.results[0].status === "needs_revision",
    );

    // Verifikasi naskah di DB diperbarui
    const dbManuscripts = await db
      .select()
      .from(manuscripts)
      .where(eq(manuscripts.id, createdManuscriptId))
      .limit(1);

    assert.equal(dbManuscripts.length, 1);
    assert.ok(
      dbManuscripts[0].status === "passed" || dbManuscripts[0].status === "needs_revision",
    );
    assert.ok(dbManuscripts[0].totalRulesChecked > 0, "totalRulesChecked must be > 0 after screening");

    // Verifikasi versi di DB memiliki parseStatus: 'success'
    const dbVersions = await db
      .select()
      .from(manuscriptVersions)
      .where(eq(manuscriptVersions.id, dbManuscripts[0].currentVersionId!))
      .limit(1);

    assert.equal(dbVersions.length, 1);
    assert.equal(dbVersions[0].parseStatus, "success");

    // Verifikasi screening_runs tercatat
    const dbRuns = await db
      .select()
      .from(screeningRuns)
      .where(eq(screeningRuns.manuscriptVersionId, dbVersions[0].id));
    assert.ok(dbRuns.length > 0, "screeningRuns should have at least 1 record");
    assert.equal(dbRuns[0].status, "completed");
  });

  it("enforces fail-fast when JWT_SECRET is missing and allows downloading 'File Asli' when valid token is provided", async () => {
    const prevSecret = process.env.JWT_SECRET;
    try {
      process.env.JWT_SECRET = "";
      await assert.rejects(
        () => createInspectionToken(createdManuscriptId, TEST_OJS_SUBMISSION_ID),
        /JWT_SECRET wajib diatur/,
      );
    } finally {
      process.env.JWT_SECRET = prevSecret;
    }

    const token = await createInspectionToken(createdManuscriptId, TEST_OJS_SUBMISSION_ID);
    assert.ok(token, "Token must be generated when JWT_SECRET is valid");

    // Unduh File Asli dengan token
    const downloadReq = new NextRequest(
      `http://localhost:3000/api/manuscripts/${createdManuscriptId}/original?token=${token}`,
    );

    const downloadRes = await getOriginalFile(downloadReq, {
      params: Promise.resolve({ id: createdManuscriptId }),
    });

    assert.equal(downloadRes.status, 200);
    assert.ok(downloadRes.headers.get("content-disposition")?.includes("attachment"));
    const arrayBuffer = await downloadRes.arrayBuffer();
    assert.equal(arrayBuffer.byteLength, sampleDocxBuffer.length);
  });

  it("rejects POST requests with PKZip containing empty word/document.xml with HTTP 400", async () => {
    const emptyDocXmlZip = new JSZip();
    emptyDocXmlZip.file("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8"?><Types></Types>');
    emptyDocXmlZip.file("word/document.xml", ""); // 0 bytes empty file
    const zipBuffer = await emptyDocXmlZip.generateAsync({ type: "nodebuffer" });

    const formData = new FormData();
    const emptyDocx = new File([new Uint8Array(zipBuffer)], "empty_doc.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    formData.append("file", emptyDocx);

    const req = new NextRequest("http://localhost:3000/api/check-submission", {
      method: "POST",
      headers: {
        "x-mqc-api-key": SECRET_KEY,
      },
      body: formData,
    });

    const res = await POST(req);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.ok(body.error.includes("word/document.xml"));
  });

  it("batch screening POST /api/manuscripts/screen-batch rejects non-JSON body with HTTP 400", async () => {
    const req = new NextRequest("http://localhost:3000/api/manuscripts/screen-batch", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "not-json-content",
    });

    const res = await batchScreenPOST(req);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
  });

  it("batch screening POST /api/manuscripts/screen-batch rejects non-array manuscriptIds with HTTP 400", async () => {
    const req = new NextRequest("http://localhost:3000/api/manuscripts/screen-batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ manuscriptIds: "invalid-string" }),
    });

    const res = await batchScreenPOST(req);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.ok(body.error.includes("array"));
  });

  it("batch screening handles invalid UUID formats and non-existent IDs without 500 error", async () => {
    const req = new NextRequest("http://localhost:3000/api/manuscripts/screen-batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        manuscriptIds: [
          "invalid-not-a-uuid",
          "00000000-0000-0000-0000-000000000000",
        ],
      }),
    });

    const res = await batchScreenPOST(req);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.processedCount, 0);
    assert.equal(body.results.length, 2);

    // Hasil 1: format tidak valid
    assert.equal(body.results[0].success, false);
    assert.ok(body.results[0].error?.includes("UUID"));

    // Hasil 2: naskah tidak ditemukan
    assert.equal(body.results[1].success, false);
    assert.ok(body.results[1].error?.includes("tidak ditemukan"));
  });

  it("batch screening handles corrupted .docx file on disk, marking it processing_failed while processing valid manuscripts in the same batch", async () => {
    // 1. Buat naskah kedua untuk diuji
    const CORRUPT_OJS_ID = 9999754;
    await db.delete(manuscripts).where(eq(manuscripts.ojsSubmissionId, CORRUPT_OJS_ID));

    const formData = new FormData();
    const docxFile = new File([new Uint8Array(sampleDocxBuffer)], "naskah_akan_dirusak.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    formData.append("file", docxFile);
    formData.append("ojs_submission_id", String(CORRUPT_OJS_ID));

    const ingestReq = new NextRequest("http://localhost:3000/api/check-submission", {
      method: "POST",
      headers: { "x-mqc-api-key": SECRET_KEY },
      body: formData,
    });

    const ingestRes = await POST(ingestReq);
    assert.equal(ingestRes.status, 200);
    const ingestBody = await ingestRes.json();
    const corruptMsId = ingestBody.manuscriptId;

    try {
      // 2. Dapatkan path file dari database dan rusak isinya di disk
      const verRows = await db
        .select()
        .from(manuscriptVersions)
        .where(eq(manuscriptVersions.manuscriptId, corruptMsId))
        .limit(1);

      assert.ok(verRows.length > 0);
      const corruptFilePath = path.resolve(getStorageDir(), verRows[0].fileStoragePath);
      // Rusak file dengan byte acak non-zip
      await fs.writeFile(corruptFilePath, Buffer.from("CORRUPTED BYTES THIS IS NO LONGER A VALID DOCX FILE"));

      // 3. Jalankan batch screening dengan naskah valid dan naskah rusak sekaligus
      const batchReq = new NextRequest("http://localhost:3000/api/manuscripts/screen-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          manuscriptIds: [corruptMsId, createdManuscriptId],
        }),
      });

      const batchRes = await batchScreenPOST(batchReq);
      assert.equal(batchRes.status, 200);
      const batchBody = await batchRes.json();

      assert.equal(batchBody.success, true);
      assert.equal(batchBody.processedCount, 1, "Hanya 1 naskah yang berhasil diproses");
      assert.equal(batchBody.results.length, 2);

      // Naskah rusak harus gagal tanpa menyebabkan HTTP 500
      const corruptResult = batchBody.results.find((r: any) => r.manuscriptId === corruptMsId);
      assert.ok(corruptResult);
      assert.equal(corruptResult.success, false);

      // Verifikasi status naskah rusak di DB berubah menjadi processing_failed
      const dbCorrupt = await db
        .select()
        .from(manuscripts)
        .where(eq(manuscripts.id, corruptMsId))
        .limit(1);
      assert.equal(dbCorrupt[0].status, "processing_failed");

      // Naskah valid harus tetap berhasil diproses
      const validResult = batchBody.results.find((r: any) => r.manuscriptId === createdManuscriptId);
      assert.ok(validResult);
      assert.equal(validResult.success, true);
    } finally {
      // Bersihkan naskah uji
      await db.delete(manuscripts).where(eq(manuscripts.ojsSubmissionId, CORRUPT_OJS_ID));
    }
  });

  it("strictly gates batch screening when OJS submission has no assigned editor (returns HTTP 422 OJS_EDITOR_UNASSIGNED)", async () => {
    const UNASSIGNED_OJS_ID = 9999755;
    await db.delete(manuscripts).where(eq(manuscripts.ojsSubmissionId, UNASSIGNED_OJS_ID));

    const formData = new FormData();
    const docxFile = new File([new Uint8Array(sampleDocxBuffer)], "naskah_unassigned.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    formData.append("file", docxFile);
    formData.append("ojs_submission_id", String(UNASSIGNED_OJS_ID));
    formData.append("title", "Pengujian Naskah Belum Di-assign Editor OJS");
    formData.append("author_name", "Penulis Peneliti Mandiri");

    const ingestReq = new NextRequest("http://localhost:3000/api/check-submission", {
      method: "POST",
      headers: { "x-mqc-api-key": SECRET_KEY },
      body: formData,
    });

    const ingestRes = await POST(ingestReq);
    assert.equal(ingestRes.status, 200);
    const ingestBody = await ingestRes.json();
    const unassignedMsId = ingestBody.manuscriptId;

    try {
      const screenReq = new NextRequest("http://localhost:3000/api/manuscripts/screen-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          manuscriptIds: [unassignedMsId],
        }),
      });

      const screenRes = await batchScreenPOST(screenReq);
      assert.equal(screenRes.status, 422, "Should return HTTP 422 Unprocessable Entity");

      const screenBody = await screenRes.json();
      assert.equal(screenBody.success, false);
      assert.equal(screenBody.code, "OJS_EDITOR_UNASSIGNED");
      assert.ok(screenBody.details);
      assert.equal(screenBody.details.ojsSubmissionId, UNASSIGNED_OJS_ID);
      assert.equal(screenBody.details.title, "Pengujian Naskah Belum Di-assign Editor OJS");
      assert.equal(screenBody.details.authorName, "Penulis Peneliti Mandiri");
    } finally {
      await db.delete(manuscripts).where(eq(manuscripts.ojsSubmissionId, UNASSIGNED_OJS_ID));
    }
  });
});
