import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { NextRequest } from "next/server";
import { Document, Packer, Paragraph, TextRun } from "docx";
import JSZip from "jszip";
import { POST as ingestPOST } from "../src/app/api/check-submission/route";
import { GET as getReportDocx } from "../src/app/api/manuscripts/[id]/report/route";
import { createInspectionToken } from "../src/lib/auth/token";
import {
  enqueueScreeningJob,
  claimNextScreeningJob,
  executeClaimedScreeningJob,
  drainScreeningQueue,
} from "../src/lib/queue/screeningQueue";
import {
  resolveReviewedByForManuscript,
  getAssignedEditorFromOjs,
  resetOjsCircuitBreaker,
} from "../src/lib/ojs/ojsClient";
import { db, manuscripts, manuscriptVersions, screeningJobs, client } from "../src/db";
import { eq, inArray } from "drizzle-orm";
import { getStorageDir } from "../src/lib/storage/localStorage";

describe("Fase 1: PostgreSQL SKIP LOCKED Queue, Dry-Run OJS Sync, Lease Recovery, & Opsi B 'Diperiksa oleh'", () => {
  const SECRET_KEY = "test_phase1_mqc_api_secret_32_bytes_minimum_key";
  const TEST_SUB_IDS = [9999801, 9999802, 9999803];
  let sampleDocxBuffer: Buffer;
  const createdMsIds: string[] = [];

  before(async () => {
    process.env.MQC_API_SECRET = SECRET_KEY;
    process.env.JWT_SECRET = "test_jwt_secret_at_least_32_characters_long_for_mqc_2026";
    process.env.CORS_ALLOWED_ORIGIN = "http://localhost:8000";
    process.env.OJS_SYNC_ENABLED = "true";
    process.env.OJS_SYNC_DRY_RUN = "true";
    process.env.AUTO_DRAIN_ON_INGEST = "false";
    process.env.MANUSCRIPT_STORAGE_DIR = "storage/test_queue_manuscripts";
    resetOjsCircuitBreaker();

    await db.delete(manuscripts).where(inArray(manuscripts.ojsSubmissionId, TEST_SUB_IDS));

    const doc = new Document({
      sections: [
        {
          properties: {},
          children: [
            new Paragraph({
              children: [new TextRun("Dokumen Uji Antrean Pemeriksaan MQC Fase 1")],
            }),
          ],
        },
      ],
    });
    sampleDocxBuffer = await Packer.toBuffer(doc);
  });

  after(async () => {
    if (createdMsIds.length > 0) {
      await db.delete(manuscripts).where(inArray(manuscripts.id, createdMsIds));
    }
    await db.delete(manuscripts).where(inArray(manuscripts.ojsSubmissionId, TEST_SUB_IDS));
    try {
      await fs.rm(getStorageDir(), { recursive: true, force: true });
    } catch {
      // Abaikan
    }
    await client.end();
  });

  it("idempotently enqueues screening job on POST /api/check-submission without creating duplicate jobs", async () => {
    const formData = new FormData();
    formData.append(
      "file",
      new File([new Uint8Array(sampleDocxBuffer)], "queue_test_1.docx", {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    );
    formData.append("ojs_submission_id", String(TEST_SUB_IDS[0]));
    formData.append("author_name", "Penulis Jangan Muncul Sebagai Pemeriksa");

    const req = new NextRequest("http://localhost:3000/api/check-submission", {
      method: "POST",
      headers: { "x-mqc-api-key": SECRET_KEY },
      body: formData,
    });

    const res = await ingestPOST(req);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.jobId);
    createdMsIds.push(body.manuscriptId);

    // Panggil enqueueScreeningJob ulang dengan idempotencyKey yang sama (versi 1)
    const verRows = await db
      .select()
      .from(manuscriptVersions)
      .where(eq(manuscriptVersions.manuscriptId, body.manuscriptId));

    const dup = await enqueueScreeningJob({
      manuscriptId: body.manuscriptId,
      manuscriptVersionId: verRows[0].id,
      ojsSubmissionId: TEST_SUB_IDS[0],
      versionNumber: 1,
    });

    assert.equal(dup.jobId, body.jobId, "Idempotent enqueue must return the exact same job ID");

    const jobs = await db
      .select()
      .from(screeningJobs)
      .where(eq(screeningJobs.manuscriptId, body.manuscriptId));
    assert.equal(jobs.length, 1, "Must only have 1 job row in screening_jobs");
    assert.equal(jobs[0].status, "pending");
  });

  it("recovers automatically when a worker crashes mid-job after lease expires (visibility timeout)", async () => {
    // 1. Worker A mengklaim job dengan lease pendek (1 detik) lalu simulasi crash
    const claimedByA = await claimNextScreeningJob("worker-A", 1000);
    assert.ok(claimedByA, "Worker A should claim the pending job");
    assert.equal(claimedByA.status, "processing");
    assert.equal(claimedByA.attempts, 1);

    // Worker B mencoba mengklaim saat lease Worker A masih aktif -> harus null (SKIP LOCKED / locked_until > now())
    const claimedByBWhileLocked = await claimNextScreeningJob("worker-B", 5000);
    assert.equal(
      claimedByBWhileLocked,
      null,
      "Worker B must not claim a job whose lease is still active",
    );

    // Simulasikan Worker A crash sebelum menyelesaikan job
    const crashRes = await executeClaimedScreeningJob(claimedByA, {
      simulateCrashBeforeComplete: true,
    });
    assert.equal(crashRes.status, "failed");

    // Paksa locked_until ke masa lalu agar simulasi lease expired berjalan instan
    await client`
      UPDATE screening_jobs
      SET locked_until = now() - interval '2 seconds'
      WHERE id = ${claimedByA.id}
    `;

    // 2. Worker B kini mengambil alih job yang lease-nya sudah habis dan menyelesaikannya
    const reclaimedByB = await claimNextScreeningJob("worker-B", 30_000);
    assert.ok(reclaimedByB, "Worker B must reclaim the job after lease expiration");
    assert.equal(reclaimedByB.id, claimedByA.id);
    assert.equal(reclaimedByB.attempts, 2);

    const completeRes = await executeClaimedScreeningJob(reclaimedByB);
    assert.equal(completeRes.status, "completed");
    assert.equal(completeRes.syncMode, "dry_run");

    // Verifikasi status akhir di DB
    const [updatedMs] = await db
      .select()
      .from(manuscripts)
      .where(eq(manuscripts.id, claimedByA.manuscript_id));
    assert.equal(updatedMs.ojsSyncStatus, "dry_run");
    assert.ok(updatedMs.ojsLastSyncedAt);

    const [updatedJob] = await db
      .select()
      .from(screeningJobs)
      .where(eq(screeningJobs.id, claimedByA.id));
    assert.equal(updatedJob.status, "completed");
    const payload = updatedJob.syncPayload as Record<string, any>;
    assert.equal(payload.mode, "dry_run");
    assert.equal(payload.method, "POST");
    assert.equal(payload.fileStage, 2);
    assert.ok(payload.byteLength > 0);
  });

  it("enforces Opsi B for 'Diperiksa oleh': never prints author_name, uses fallback '-' or assignedEditorName snapshot", async () => {
    const msId = createdMsIds[0];
    const token = await createInspectionToken(msId, TEST_SUB_IDS[0]);

    // 1. Saat belum ada editor ditugaskan di OJS, harus mengembalikan '-'
    process.env.TEST_SIMULATE_UNASSIGNED = "true";
    try {
      const fallbackReviewer = await resolveReviewedByForManuscript({
        id: msId,
        ojsSubmissionId: TEST_SUB_IDS[0],
        assignedEditorName: null,
      });
      assert.equal(fallbackReviewer, "-");

      // 2. Verifikasi dokumen Word hasil GET /api/manuscripts/[id]/report memuat '-' dan BUKAN nama penulis
      const reportReq1 = new NextRequest(
        `http://localhost:3000/api/manuscripts/${msId}/report?token=${token}`,
      );
      const reportRes1 = await getReportDocx(reportReq1, {
        params: Promise.resolve({ id: msId }),
      });
      assert.equal(reportRes1.status, 200);
      const zip1 = await JSZip.loadAsync(Buffer.from(await reportRes1.arrayBuffer()));
      const xml1 = await zip1.file("word/document.xml")!.async("text");
      assert.ok(
        !xml1.includes("Penulis Jangan Muncul Sebagai Pemeriksa"),
        "Report must NEVER print author_name in 'Diperiksa oleh'",
      );
    } finally {
      delete process.env.TEST_SIMULATE_UNASSIGNED;
    }

    // 3. Saat snapshot assignedEditorName diisi (Opsi B), laporan wajib mencetak nama Editor tersebut
    await db
      .update(manuscripts)
      .set({
        assignedEditorName: "Dr. Ir. Editor Permukiman, M.T.",
        assignedEditorFetchedAt: new Date(),
      })
      .where(eq(manuscripts.id, msId));

    const reportReq2 = new NextRequest(
      `http://localhost:3000/api/manuscripts/${msId}/report?token=${token}`,
    );
    const reportRes2 = await getReportDocx(reportReq2, {
      params: Promise.resolve({ id: msId }),
    });
    assert.equal(reportRes2.status, 200);
    const zip2 = await JSZip.loadAsync(Buffer.from(await reportRes2.arrayBuffer()));
    const xml2 = await zip2.file("word/document.xml")!.async("text");
    assert.ok(
      xml2.includes("Dr. Ir. Editor Permukiman, M.T."),
      "Report must print the assigned OJS Editor name (Opsi B)",
    );
  });

  it("transitions failing job with exponential backoff to 'dead' (Dead-Letter Queue) after maxAttempts", async () => {
    // Buat naskah uji ke-2
    const formData = new FormData();
    formData.append(
      "file",
      new File([new Uint8Array(sampleDocxBuffer)], "queue_test_dlq.docx", {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    );
    formData.append("ojs_submission_id", String(TEST_SUB_IDS[1]));

    const req = new NextRequest("http://localhost:3000/api/check-submission", {
      method: "POST",
      headers: { "x-mqc-api-key": SECRET_KEY },
      body: formData,
    });
    const res = await ingestPOST(req);
    const body = await res.json();
    createdMsIds.push(body.manuscriptId);

    // Set max_attempts = 2 dan matikan dry_run tanpa OJS_API_KEY untuk memicu kegagalan sinkronisasi OJS
    await client`
      UPDATE screening_jobs
      SET max_attempts = 2
      WHERE id = ${body.jobId}
    `;

    process.env.OJS_SYNC_DRY_RUN = "false";
    process.env.OJS_API_KEY = "";

    try {
      // Percobaan 1 -> gagal, status = 'failed'
      const claim1 = await claimNextScreeningJob("worker-dlq");
      assert.ok(claim1);
      const exec1 = await executeClaimedScreeningJob(claim1, { customBackoffBaseMs: 1 });
      assert.equal(exec1.status, "failed");

      // Majukan available_at agar siap diambil untuk percobaan ke-2
      await client`
        UPDATE screening_jobs
        SET available_at = now() - interval '1 second'
        WHERE id = ${body.jobId}
      `;

      // Percobaan 2 (mencapai max_attempts = 2) -> gagal dan berpindah ke 'dead'
      const claim2 = await claimNextScreeningJob("worker-dlq");
      assert.ok(claim2);
      const exec2 = await executeClaimedScreeningJob(claim2, { customBackoffBaseMs: 1 });
      assert.equal(exec2.status, "dead");

      const [deadJob] = await db
        .select()
        .from(screeningJobs)
        .where(eq(screeningJobs.id, body.jobId));
      assert.equal(deadJob.status, "dead");

      const [deadMs] = await db
        .select()
        .from(manuscripts)
        .where(eq(manuscripts.id, body.manuscriptId));
      assert.equal(deadMs.ojsSyncStatus, "dead");
    } finally {
      process.env.OJS_SYNC_DRY_RUN = "true";
      resetOjsCircuitBreaker();
    }
  });

  it("drains multiple queued jobs concurrently via drainScreeningQueue without race conditions", async () => {
    const formData = new FormData();
    formData.append(
      "file",
      new File([new Uint8Array(sampleDocxBuffer)], "queue_test_drain.docx", {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    );
    formData.append("ojs_submission_id", String(TEST_SUB_IDS[2]));

    const req = new NextRequest("http://localhost:3000/api/check-submission", {
      method: "POST",
      headers: { "x-mqc-api-key": SECRET_KEY },
      body: formData,
    });
    const res = await ingestPOST(req);
    const body = await res.json();
    createdMsIds.push(body.manuscriptId);

    const stats = await drainScreeningQueue({
      workerId: "drain-test",
      concurrency: 2,
      maxJobs: 10,
    });

    assert.ok(stats.processed >= 1);
    assert.ok(stats.completed >= 1);
  });
});
