import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import { Document, Packer, Paragraph, HeadingLevel, TextRun } from "docx";
import { POST as ingestPOST } from "../src/app/api/check-submission/route";
import { enqueueScreeningJob, drainScreeningQueue, triggerBackgroundDrain } from "../src/lib/queue/screeningQueue";
import { resetOjsCircuitBreaker } from "../src/lib/ojs/ojsClient";
import { db, manuscripts, manuscriptVersions, screeningJobs, screeningRuns, client } from "../src/db";
import { eq, inArray, and, gte, lte } from "drizzle-orm";
import { getStorageDir } from "../src/lib/storage/localStorage";

describe("Fase 3: Uji Beban 50 Naskah Serentak (Concurrent Ingest, SKIP LOCKED Worker Pool, Memory & Zero-Duplicate Verification, Auto-Cleanup)", () => {
  const SECRET_KEY = "load_test_phase3_secret_key_32_bytes_minimum_2026";
  const TOTAL_MANUSCRIPTS = 50;
  const BASE_SUB_ID = 9900001;
  const SUB_IDS = Array.from({ length: TOTAL_MANUSCRIPTS }, (_, i) => BASE_SUB_ID + i);
  const TEST_STORAGE_DIR = "storage/test_load_50_manuscripts";

  let syntheticDocxBuffer: Buffer;
  const createdManuscriptIds: string[] = [];

  async function cleanupAllLoadTestArtifacts() {
    // 1. Hapus seluruh baris uji di mqc_db (cascade ke manuscript_versions, screening_runs, findings, screening_jobs)
    await db
      .delete(manuscripts)
      .where(
        and(
          gte(manuscripts.ojsSubmissionId, BASE_SUB_ID),
          lte(manuscripts.ojsSubmissionId, BASE_SUB_ID + TOTAL_MANUSCRIPTS),
        ),
      );

    if (createdManuscriptIds.length > 0) {
      await db.delete(manuscripts).where(inArray(manuscripts.id, createdManuscriptIds));
    }

    // 2. Hapus direktori fisik sementara
    try {
      await fs.rm(path.resolve(process.cwd(), TEST_STORAGE_DIR), {
        recursive: true,
        force: true,
      });
    } catch {
      // Abaikan jika sudah terhapus
    }
  }

  before(async () => {
    process.env.MQC_API_SECRET = SECRET_KEY;
    process.env.JWT_SECRET = "test_jwt_secret_at_least_32_characters_long_for_mqc_2026";
    process.env.CORS_ALLOWED_ORIGIN = "http://localhost:8000";
    process.env.OJS_SYNC_ENABLED = "true";
    // WAJIB DRY_RUN selama uji beban 50 naskah agar 0 request/file menyentuh OJS
    process.env.OJS_SYNC_DRY_RUN = "true";
    process.env.AUTO_DRAIN_ON_INGEST = "false";
    process.env.MANUSCRIPT_STORAGE_DIR = TEST_STORAGE_DIR;
    resetOjsCircuitBreaker();

    await cleanupAllLoadTestArtifacts();

    // Buat dokumen .docx sintetis realistis di memori
    const doc = new Document({
      sections: [
        {
          properties: {},
          children: [
            new Paragraph({
              heading: HeadingLevel.HEADING_1,
              children: [
                new TextRun(
                  "Studi Eksperimental Beton Daur Ulang Ramah Lingkungan untuk Permukiman Perkotaan",
                ),
              ],
            }),
            new Paragraph({
              children: [new TextRun("ABSTRAK")],
            }),
            new Paragraph({
              children: [
                new TextRun(
                  "Penelitian ini mengevaluasi kinerja agregat beton daur ulang pada aplikasi infrastruktur permukiman dengan variasi campuran polimer.",
                ),
              ],
            }),
            new Paragraph({
              children: [new TextRun("Kata kunci: beton daur ulang; permukiman; agregat; limbah plastik")],
            }),
            new Paragraph({
              children: [new TextRun("PENDAHULUAN")],
            }),
            new Paragraph({
              children: [
                new TextRun(
                  "Pembangunan permukiman berkelanjutan membutuhkan inovasi material konstruksi yang mampu menekan limbah konstruksi secara terukur.",
                ),
              ],
            }),
            new Paragraph({
              children: [new TextRun("METODE")],
            }),
            new Paragraph({
              children: [
                new TextRun(
                  "Pengujian kuat tekan dan porositas dilakukan di laboratorium bahan bangunan sesuai standar SNI.",
                ),
              ],
            }),
            new Paragraph({
              children: [new TextRun("HASIL DAN PEMBAHASAN")],
            }),
            new Paragraph({
              children: [
                new TextRun(
                  "Hasil pengujian menunjukkan peningkatan daya tahan campuran sebesar 14,5 persen dibandingkan campuran kontrol.",
                ),
              ],
            }),
            new Paragraph({
              children: [new TextRun("KESIMPULAN")],
            }),
            new Paragraph({
              children: [
                new TextRun(
                  "Pemanfaatan limbah plastik sebagai pelapis agregat daur ulang layak diterapkan pada komponen non-struktural permukiman.",
                ),
              ],
            }),
            new Paragraph({
              children: [new TextRun("DAFTAR PUSTAKA")],
            }),
            new Paragraph({
              children: [
                new TextRun(
                  "1. Pratama, A., & Santoso, B. (2024). Inovasi Beton Daur Ulang untuk Perumahan Rakyat. Jurnal Permukiman, 19(1), 12-22.",
                ),
              ],
            }),
          ],
        },
      ],
    });
    syntheticDocxBuffer = await Packer.toBuffer(doc);
  });

  after(async () => {
    await cleanupAllLoadTestArtifacts();
    await client.end();
  });

  it("handles 50 simultaneous manuscript submissions, processes all 50 in worker pool with 0 errors and 0 duplicates, and cleans up 100% of test data/files", async () => {
    const rssBeforeMB = Math.round((process.memoryUsage().rss / 1024 / 1024) * 10) / 10;
    let peakRssMB = rssBeforeMB;
    let peakHeapUsedMB = Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 10) / 10;

    const sampleMemory = () => {
      const mem = process.memoryUsage();
      const rss = Math.round((mem.rss / 1024 / 1024) * 10) / 10;
      const heap = Math.round((mem.heapUsed / 1024 / 1024) * 10) / 10;
      if (rss > peakRssMB) peakRssMB = rss;
      if (heap > peakHeapUsedMB) peakHeapUsedMB = heap;
    };

    try {
      // =========================================================================
      // 1. UJI INGEST SERENTAK (50 PERMINTAAN PARALEL)
      // =========================================================================
      const ingestLatenciesMs: number[] = [];
      const ingestStartAll = performance.now();

      const ingestPromises = SUB_IDS.map(async (subId, idx) => {
        const t0 = performance.now();
        const formData = new FormData();
        const fileName = `Naskah_Sintetis_UjiBeban_${idx + 1}.docx`;
        formData.append(
          "file",
          new File([new Uint8Array(syntheticDocxBuffer)], fileName, {
            type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          }),
        );
        formData.append("ojs_submission_id", String(subId));
        formData.append("ojs_user_id", String(5000 + idx));
        formData.append("author_name", `Penulis Uji Beban ${idx + 1}`);
        formData.append("author_email", `penulis${idx + 1}@uji.local`);
        formData.append("title", `Naskah Sintetis Uji Beban #${idx + 1}`);

        const req = new NextRequest("http://localhost:3000/api/check-submission", {
          method: "POST",
          headers: { "x-mqc-api-key": SECRET_KEY },
          body: formData,
        });

        const res = await ingestPOST(req);
        const elapsed = performance.now() - t0;
        ingestLatenciesMs.push(elapsed);
        sampleMemory();

        const body = await res.json();
        return { status: res.status, body, subId, fileName };
      });

      const ingestResults = await Promise.all(ingestPromises);
      const ingestTotalMs = Math.round(performance.now() - ingestStartAll);

      // Pastikan 50/50 sukses HTTP 200 (0 error 5xx/4xx)
      const status200Count = ingestResults.filter((r) => r.status === 200 && r.body.success).length;
      assert.equal(status200Count, TOTAL_MANUSCRIPTS, "Seluruh 50 request serentak wajib HTTP 200");

      for (const r of ingestResults) {
        createdManuscriptIds.push(r.body.manuscriptId);
      }

      // Hitung persentil latensi ingest (p50, p95, max)
      const sortedLatencies = [...ingestLatenciesMs].sort((a, b) => a - b);
      const p50IngestMs = Math.round(sortedLatencies[Math.floor(TOTAL_MANUSCRIPTS * 0.5)]);
      const p95IngestMs = Math.round(sortedLatencies[Math.floor(TOTAL_MANUSCRIPTS * 0.95)]);
      const maxIngestMs = Math.round(sortedLatencies[TOTAL_MANUSCRIPTS - 1]);

      // =========================================================================
      // 2. UJI IDEMPOTENSI (REPLAY 10 JOB YANG SAMA -> 0 DUPLIKAT)
      // =========================================================================
      for (let i = 0; i < 10; i++) {
        const msId = createdManuscriptIds[i];
        const [ver] = await db
          .select()
          .from(manuscriptVersions)
          .where(eq(manuscriptVersions.manuscriptId, msId));
        await enqueueScreeningJob({
          manuscriptId: msId,
          manuscriptVersionId: ver.id,
          ojsSubmissionId: SUB_IDS[i],
          versionNumber: 1,
        });
      }

      const queuedJobs = await db
        .select()
        .from(screeningJobs)
        .where(inArray(screeningJobs.manuscriptId, createdManuscriptIds));
      assert.equal(
        queuedJobs.length,
        TOTAL_MANUSCRIPTS,
        "Tepat 50 job unik di screening_jobs (0 duplikat meski di-replay)",
      );

      // =========================================================================
      // 3. UJI PEMROSESAN WORKER POOL + SINGLE-FLIGHT COALESCING (50 TRIGGER SERENTAK)
      // =========================================================================
      const memInterval = setInterval(sampleMemory, 25);
      const drainStart = performance.now();
      let residualDrainStats;
      try {
        // Simulasikan 50 pemanggilan triggerBackgroundDrain() di milidetik yang sama (seperti AUTO_DRAIN_ON_INGEST=true)
        const coalescedPromises = Array.from({ length: TOTAL_MANUSCRIPTS }, () =>
          triggerBackgroundDrain({ concurrency: 4, batchMaxJobs: 100 }),
        );
        // Seluruh 50 promise harus mengacu pada instance promise single-flight yang sama
        const uniquePromises = new Set(coalescedPromises);
        assert.equal(
          uniquePromises.size,
          1,
          "Single-flight coalescing wajib menyatukan 50 pemicu paralel menjadi 1 pool worker tunggal",
        );
        await Promise.all(coalescedPromises);

        // Pastikan antrean sudah 0 tersisa
        residualDrainStats = await drainScreeningQueue({
          workerId: "load-test-verify-empty",
          concurrency: 4,
          maxJobs: 10,
        });
      } finally {
        clearInterval(memInterval);
        sampleMemory();
      }
      const drainTotalMs = Math.round(performance.now() - drainStart);
      const throughputPerSec =
        Math.round((TOTAL_MANUSCRIPTS / (drainTotalMs / 1000)) * 100) / 100;

      assert.equal(
        residualDrainStats.processed,
        0,
        "Seluruh 50 job sudah harus habis dikuras oleh single-flight background drain",
      );

      // Verifikasi di DB: 50 naskah selesai, 0 duplikat laporan, dan nama file sesuai pola Laporan-review-<nama_file>
      const completedJobs = await db
        .select()
        .from(screeningJobs)
        .where(inArray(screeningJobs.manuscriptId, createdManuscriptIds));

      assert.equal(completedJobs.length, TOTAL_MANUSCRIPTS);
      for (const job of completedJobs) {
        assert.equal(job.status, "completed");
        assert.equal(job.syncMode, "dry_run");
        const payload = job.syncPayload as Record<string, any>;
        assert.ok(
          String(payload.fileName).startsWith("Laporan-review-Naskah_Sintetis_UjiBeban_"),
          `Nama file laporan harus diawali Laporan-review-, dapat: ${payload.fileName}`,
        );
      }

      console.log("\n==============================================================");
      console.log("📊 HASIL UJI BEBAN 50 NASKAH SERENTAK (FASE 3 - TERUKUR)");
      console.log("==============================================================");
      console.log(`- Jumlah Naskah Serentak : ${TOTAL_MANUSCRIPTS} berkas .docx`);
      console.log(`- HTTP 200 Sukses Ingest : ${status200Count}/${TOTAL_MANUSCRIPTS} (0 error 5xx)`);
      console.log(`- Durasi Total Ingest 50 : ${ingestTotalMs} ms`);
      console.log(`- Latensi Ingest         : p50=${p50IngestMs} ms | p95=${p95IngestMs} ms | max=${maxIngestMs} ms`);
      console.log(`- Durasi Selesai Antrean : ${drainTotalMs} ms (${ (drainTotalMs / 1000).toFixed(2) } detik, concurrency=4)`);
      console.log(`- Throughput Worker      : ${throughputPerSec} naskah/detik`);
      console.log(`- Puncak Memori Worker   : RSS=${peakRssMB} MB | HeapUsed=${peakHeapUsedMB} MB`);
      console.log(`- Duplikasi Job/Laporan  : 0 duplikat`);
      console.log("==============================================================\n");
    } finally {
      // =========================================================================
      // 4. PEMBERSIHAN OTOMATIS & VERIFIKASI 0 SISA KOTORAN DI DB & DISK
      // =========================================================================
      await cleanupAllLoadTestArtifacts();
    }

    // Verifikasi 0 baris uji tersisa di mqc_db
    const remainingTestMs = await db
      .select({ id: manuscripts.id })
      .from(manuscripts)
      .where(
        and(
          gte(manuscripts.ojsSubmissionId, BASE_SUB_ID),
          lte(manuscripts.ojsSubmissionId, BASE_SUB_ID + TOTAL_MANUSCRIPTS),
        ),
      );
    assert.equal(remainingTestMs.length, 0, "Database MQC bersih: 0 baris naskah uji tersisa");

    const remainingTestJobs = await db
      .select({ id: screeningJobs.id })
      .from(screeningJobs)
      .where(
        and(
          gte(screeningJobs.ojsSubmissionId, BASE_SUB_ID),
          lte(screeningJobs.ojsSubmissionId, BASE_SUB_ID + TOTAL_MANUSCRIPTS),
        ),
      );
    assert.equal(remainingTestJobs.length, 0, "Tabel screening_jobs bersih: 0 baris uji tersisa");

    // Verifikasi folder fisik uji sudah terhapus
    let dirStillExists = true;
    try {
      await fs.access(path.resolve(process.cwd(), TEST_STORAGE_DIR));
    } catch {
      dirStillExists = false;
    }
    assert.equal(dirStillExists, false, "Folder storage uji beban sudah dihapus 100% dari disk");
  });
});
