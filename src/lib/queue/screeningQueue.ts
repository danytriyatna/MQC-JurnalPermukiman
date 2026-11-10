import { client, db, manuscripts, manuscriptVersions, screeningRuns, findings, screeningJobs } from "@/db";
import { eq, desc } from "drizzle-orm";
import { readManuscriptFile } from "@/lib/storage/localStorage";
import { screenManuscript, summarize } from "@/lib/docx/screenManuscript";
import { generateReportDocx, ReportFinding } from "@/lib/docx/generateReport";
import {
  resolveReviewedByForManuscript,
  uploadOrUpdateReportToOjs,
  buildOjsReportFileName,
  getOjsConfig,
} from "@/lib/ojs/ojsClient";
import { ManuscriptStatus } from "@/lib/types";

export interface EnqueueScreeningJobInput {
  manuscriptId: string;
  manuscriptVersionId: string;
  ojsSubmissionId?: number | null;
  versionNumber: number;
  maxAttempts?: number;
}

export interface ScreeningJobRow {
  id: string;
  manuscript_id: string;
  manuscript_version_id: string;
  ojs_submission_id: number | null;
  version_number: number;
  idempotency_key: string;
  status: string;
  attempts: number;
  max_attempts: number;
  locked_until: Date | null;
  locked_by: string | null;
  available_at: Date;
  last_error: string | null;
  sync_mode: string;
}

export function buildJobIdempotencyKey(
  manuscriptId: string,
  ojsSubmissionId: number | null | undefined,
  versionNumber: number,
): string {
  const prefix = ojsSubmissionId ? `ojs_${ojsSubmissionId}` : `ms_${manuscriptId}`;
  return `${prefix}_v${versionNumber}`;
}

export function computeBackoffDelayMs(attempt: number, baseDelayMs = 1000): number {
  const exp = Math.min(60_000, baseDelayMs * Math.pow(2, Math.max(0, attempt - 1)));
  const jitter = Math.floor(Math.random() * 250);
  return exp + jitter;
}

/**
 * Mendaftarkan job pemeriksaan & sinkronisasi ke tabel `screening_jobs` secara idempoten.
 * Jika idempotency_key yang sama dikirim ulang, baris diperbarui tanpa membuat duplikat.
 */
export async function enqueueScreeningJob(
  input: EnqueueScreeningJobInput,
): Promise<{ jobId: string; idempotencyKey: string }> {
  const idempotencyKey = buildJobIdempotencyKey(
    input.manuscriptId,
    input.ojsSubmissionId,
    input.versionNumber,
  );
  const maxAttempts = input.maxAttempts ?? 3;
  const ojsConfig = getOjsConfig();
  const initialSyncMode = !ojsConfig.syncEnabled
    ? "skipped"
    : ojsConfig.dryRun
      ? "dry_run"
      : "live";

  const rows = await client<{ id: string }[]>`
    WITH upserted_job AS (
      INSERT INTO screening_jobs (
        manuscript_id,
        manuscript_version_id,
        ojs_submission_id,
        version_number,
        idempotency_key,
        status,
        attempts,
        max_attempts,
        locked_until,
        locked_by,
        available_at,
        last_error,
        sync_mode,
        updated_at
      ) VALUES (
        ${input.manuscriptId},
        ${input.manuscriptVersionId},
        ${input.ojsSubmissionId ?? null},
        ${input.versionNumber},
        ${idempotencyKey},
        'pending',
        0,
        ${maxAttempts},
        NULL,
        NULL,
        now(),
        NULL,
        ${initialSyncMode},
        now()
      )
      ON CONFLICT (idempotency_key) DO UPDATE SET
        manuscript_version_id = EXCLUDED.manuscript_version_id,
        status = CASE
          WHEN screening_jobs.status = 'completed' THEN 'completed'
          ELSE 'pending'
        END,
        available_at = CASE
          WHEN screening_jobs.status = 'completed' THEN screening_jobs.available_at
          ELSE now()
        END,
        locked_until = CASE
          WHEN screening_jobs.status = 'completed' THEN screening_jobs.locked_until
          ELSE NULL
        END,
        locked_by = CASE
          WHEN screening_jobs.status = 'completed' THEN screening_jobs.locked_by
          ELSE NULL
        END,
        updated_at = now()
      RETURNING id, manuscript_id
    ),
    updated_ms AS (
      UPDATE manuscripts AS m
      SET
        ojs_sync_status = 'queued',
        ojs_sync_error = NULL
      FROM upserted_job
      WHERE m.id = upserted_job.manuscript_id
    )
    SELECT id FROM upserted_job;
  `;

  return {
    jobId: rows[0].id,
    idempotencyKey,
  };
}

/**
 * Mengambil dan mengunci 1 job berikutnya menggunakan PostgreSQL `FOR UPDATE SKIP LOCKED`
 * sekaligus memperbarui `manuscripts.ojs_sync_status` dalam 1 CTE atomik (1 round-trip DB).
 * Mendukung pengambilan ulang job yang mengalami crash worker (lease `locked_until` kedaluwarsa).
 */
export async function claimNextScreeningJob(
  workerId: string,
  leaseDurationMs = 60_000,
): Promise<ScreeningJobRow | null> {
  const leaseSeconds = Math.max(5, Math.ceil(leaseDurationMs / 1000));

  const claimed = await client<ScreeningJobRow[]>`
    WITH next_job AS (
      SELECT id
      FROM screening_jobs
      WHERE (
        status IN ('pending', 'failed')
        AND available_at <= now()
      ) OR (
        status = 'processing'
        AND locked_until IS NOT NULL
        AND locked_until < now()
      )
      ORDER BY available_at ASC, created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    ),
    claimed_job AS (
      UPDATE screening_jobs AS j
      SET
        status = CASE
          WHEN j.attempts + 1 > j.max_attempts THEN 'dead'
          ELSE 'processing'
        END,
        attempts = CASE
          WHEN j.attempts + 1 > j.max_attempts THEN j.attempts
          ELSE j.attempts + 1
        END,
        locked_by = CASE
          WHEN j.attempts + 1 > j.max_attempts THEN NULL
          ELSE ${workerId}
        END,
        locked_until = CASE
          WHEN j.attempts + 1 > j.max_attempts THEN NULL
          ELSE now() + (${leaseSeconds} * interval '1 second')
        END,
        updated_at = now()
      FROM next_job
      WHERE j.id = next_job.id
      RETURNING
        j.id,
        j.manuscript_id,
        j.manuscript_version_id,
        j.ojs_submission_id,
        j.version_number,
        j.idempotency_key,
        j.status,
        j.attempts,
        j.max_attempts,
        j.locked_until,
        j.locked_by,
        j.available_at,
        j.last_error,
        j.sync_mode
    ),
    updated_ms AS (
      UPDATE manuscripts AS m
      SET
        ojs_sync_status = CASE
          WHEN claimed_job.status = 'dead' THEN 'dead'
          ELSE 'processing'
        END,
        ojs_sync_error = CASE
          WHEN claimed_job.status = 'dead' THEN COALESCE(claimed_job.last_error, 'Melebihi batas maksimum percobaan (dead-letter)')
          ELSE m.ojs_sync_error
        END
      FROM claimed_job
      WHERE m.id = claimed_job.manuscript_id
    )
    SELECT * FROM claimed_job;
  `;

  if (claimed.length === 0) {
    return null;
  }

  const job = claimed[0];
  if (job.status === "dead") {
    return null;
  }

  return job;
}

/**
 * Mengeksekusi satu job yang telah diklaim:
 * 1. Baca berkas .docx & jalankan penapisan format (screenManuscript)
 * 2. Simpan hasil screening_runs & findings ke mqc_db
 * 3. Ambil nama Editor OJS (Opsi B, dengan degradasi halus)
 * 4. Buat berkas laporan .docx & unggah/catat ke OJS (dry_run atau live)
 */
export async function executeClaimedScreeningJob(
  job: ScreeningJobRow,
  options?: {
    customBackoffBaseMs?: number;
    simulateCrashBeforeComplete?: boolean;
  },
): Promise<{
  jobId: string;
  manuscriptId: string;
  status: "completed" | "failed" | "dead";
  manuscriptStatus?: ManuscriptStatus;
  syncMode?: string;
  error?: string;
}> {
  try {
    const msRows = await db
      .select()
      .from(manuscripts)
      .where(eq(manuscripts.id, job.manuscript_id))
      .limit(1);

    if (msRows.length === 0) {
      throw new Error("Data naskah induk tidak ditemukan di database.");
    }
    const manuscript = msRows[0];

    const verRows = await db
      .select()
      .from(manuscriptVersions)
      .where(eq(manuscriptVersions.id, job.manuscript_version_id))
      .limit(1);

    const versionRow =
      verRows[0] ??
      (
        await db
          .select()
          .from(manuscriptVersions)
          .where(eq(manuscriptVersions.manuscriptId, job.manuscript_id))
          .orderBy(desc(manuscriptVersions.versionNumber))
          .limit(1)
      )[0];

    if (!versionRow) {
      throw new Error("Versi berkas naskah tidak ditemukan di database.");
    }

    // 1. Baca berkas fisik .docx
    const docxBuffer = await readManuscriptFile(versionRow.fileStoragePath);

    // 2. Jalankan mesin pemeriksaan dokumen .docx
    let screening;
    try {
      screening = await screenManuscript(docxBuffer);
    } catch (parseErr: any) {
      // Dokumen rusak permanen -> langsung tandai processing_failed & dead (tidak perlu retry)
      const errMsg = parseErr?.message || "Gagal menguraikan struktur berkas .docx";
      await db
        .update(manuscriptVersions)
        .set({
          parseStatus: "failed",
          parseErrorMessage: errMsg,
        })
        .where(eq(manuscriptVersions.id, versionRow.id));

      await db
        .update(manuscripts)
        .set({
          status: "processing_failed",
          ojsSyncStatus: "dead",
          ojsSyncError: errMsg,
          updatedAt: new Date(),
        })
        .where(eq(manuscripts.id, manuscript.id));

      await db
        .update(screeningJobs)
        .set({
          status: "dead",
          lastError: errMsg,
          lockedBy: null,
          lockedUntil: null,
          updatedAt: new Date(),
        })
        .where(eq(screeningJobs.id, job.id));

      return {
        jobId: job.id,
        manuscriptId: manuscript.id,
        status: "dead",
        manuscriptStatus: "processing_failed",
        error: errMsg,
      };
    }

    if (options?.simulateCrashBeforeComplete) {
      // Simulasi worker mati mendadak (SIGKILL) di tengah job sebelum melepas lease
      return {
        jobId: job.id,
        manuscriptId: manuscript.id,
        status: "failed",
        error: "Simulated worker crash before completion",
      };
    }

    const summary = summarize(screening.findings);
    const score =
      screening.totalRulesChecked > 0
        ? Math.round((screening.totalRulesPassed / screening.totalRulesChecked) * 100)
        : 0;
    const passed = score >= 80 && summary.errorFindings === 0;
    const nextStatus: ManuscriptStatus = passed ? "passed" : "needs_revision";

    // 3. Simpan hasil pemeriksaan ke mqc_db secara transaksional (1 query delete cascade untuk screening_runs lama)
    await db.transaction(async (tx) => {
      await tx
        .delete(screeningRuns)
        .where(eq(screeningRuns.manuscriptVersionId, versionRow.id));

      const [newRun] = await tx
        .insert(screeningRuns)
        .values({
          manuscriptVersionId: versionRow.id,
          ruleSetVersion: "jurnal-permukiman-2026-v1",
          totalRulesChecked: screening.totalRulesChecked,
          totalRulesPassed: screening.totalRulesPassed,
          totalRulesFailed: Math.max(0, screening.totalRulesChecked - screening.totalRulesPassed),
          status: "completed",
          errorFindings: summary.errorFindings,
          warningFindings: summary.warningFindings,
          noticeFindings: 0,
        })
        .returning({ id: screeningRuns.id });

      if (screening.findings.length > 0) {
        await tx.insert(findings).values(
          screening.findings.map((f) => ({
            screeningRunId: newRun.id,
            section: f.section,
            ruleId: f.ruleId,
            severity: f.severity,
            checkType: f.checkType,
            location: f.location || "",
            currentValue: f.currentValue || "",
            expectedValue: f.expectedValue || "",
            suggestedFix: f.suggestedFix || "",
            ruleName: f.ruleId,
            message: f.suggestedFix || f.expectedValue || "",
          })),
        );
      }

      await tx
        .update(manuscriptVersions)
        .set({
          parseStatus: "success",
          parseErrorMessage: null,
        })
        .where(eq(manuscriptVersions.id, versionRow.id));

      await tx
        .update(manuscripts)
        .set({
          status: nextStatus,
          totalRulesChecked: screening.totalRulesChecked,
          totalRulesPassed: screening.totalRulesPassed,
          errorFindings: summary.errorFindings,
          warningFindings: summary.warningFindings,
          updatedAt: new Date(),
        })
        .where(eq(manuscripts.id, manuscript.id));
    });

    // 4. Resolusi nama Editor OJS (Opsi B dengan degradasi halus)
    const reviewedBy = await resolveReviewedByForManuscript({
      id: manuscript.id,
      ojsSubmissionId: manuscript.ojsSubmissionId,
      assignedEditorName: manuscript.assignedEditorName,
      assignedEditorFetchedAt: manuscript.assignedEditorFetchedAt,
    });

    // 5. Buat berkas Laporan Pemeriksaan Kualitas (.docx)
    const reportFindings: ReportFinding[] = screening.findings.map((f) => ({
      ruleId: f.ruleId,
      section: f.section as any,
      severity: f.severity as any,
      checkType: f.checkType as any,
      location: f.location || "",
      currentValue: f.currentValue || "",
      expectedValue: f.expectedValue || "",
      suggestedFix: f.suggestedFix || "",
    }));

    const reportBuffer = await generateReportDocx({
      manuscriptTitle: manuscript.title,
      originalFileName: versionRow.originalFileName,
      versionNumber: versionRow.versionNumber,
      reviewedBy,
      reviewedAt: new Date(),
      totalRulesChecked: screening.totalRulesChecked,
      totalRulesPassed: screening.totalRulesPassed,
      findings: reportFindings,
    });

    // 6. Sinkronkan Laporan ke OJS (dry_run secara default di Fase 1, atau live bila diaktifkan)
    let syncModeResult: "dry_run" | "live" | "skipped" = "skipped";
    let syncPayloadData: Record<string, unknown> | null = null;
    let nextOjsFileId = manuscript.ojsReportSubmissionFileId ?? null;

    if (manuscript.ojsSubmissionId) {
      const safeSubId = manuscript.ojsSubmissionId;
      const reportFileName = buildOjsReportFileName(
        versionRow.originalFileName || manuscript.originalFileName,
      );
      const uploadResult = await uploadOrUpdateReportToOjs({
        ojsSubmissionId: safeSubId,
        manuscriptId: manuscript.id,
        versionNumber: versionRow.versionNumber,
        reportBuffer,
        fileName: reportFileName,
        existingOjsSubmissionFileId: manuscript.ojsReportSubmissionFileId,
      });

      syncModeResult = uploadResult.mode;
      syncPayloadData = { ...uploadResult };
      if (uploadResult.submissionFileId) {
        nextOjsFileId = uploadResult.submissionFileId;
      }
    }

    const finalSyncStatus =
      syncModeResult === "live"
        ? "synced"
        : syncModeResult === "dry_run"
          ? "dry_run"
          : "idle";

    const syncPayloadJson = syncPayloadData ? JSON.stringify(syncPayloadData) : null;

    await client`
      WITH updated_ms AS (
        UPDATE manuscripts
        SET
          ojs_report_submission_file_id = ${nextOjsFileId},
          ojs_sync_status = ${finalSyncStatus},
          ojs_last_synced_at = now(),
          ojs_sync_error = NULL
        WHERE id = ${manuscript.id}
      )
      UPDATE screening_jobs
      SET
        status = 'completed',
        sync_mode = ${syncModeResult},
        sync_payload = ${syncPayloadJson}::jsonb,
        last_error = NULL,
        locked_by = NULL,
        locked_until = NULL,
        completed_at = now(),
        updated_at = now()
      WHERE id = ${job.id};
    `;

    return {
      jobId: job.id,
      manuscriptId: manuscript.id,
      status: "completed",
      manuscriptStatus: nextStatus,
      syncMode: syncModeResult,
    };
  } catch (err: any) {
    const errorMsg = err?.message || "Kesalahan tidak diketahui saat memproses job";
    const isDead = job.attempts >= job.max_attempts;
    const nextJobStatus = isDead ? "dead" : "failed";
    const delayMs = computeBackoffDelayMs(job.attempts, options?.customBackoffBaseMs ?? 1000);
    const nextAvailableAt = new Date(Date.now() + delayMs);

    await db
      .update(screeningJobs)
      .set({
        status: nextJobStatus,
        lastError: errorMsg,
        availableAt: nextAvailableAt,
        lockedBy: null,
        lockedUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(screeningJobs.id, job.id));

    await db
      .update(manuscripts)
      .set({
        ojsSyncStatus: nextJobStatus,
        ojsSyncError: errorMsg,
      })
      .where(eq(manuscripts.id, job.manuscript_id));

    return {
      jobId: job.id,
      manuscriptId: job.manuscript_id,
      status: nextJobStatus,
      error: errorMsg,
    };
  }
}

/**
 * Menguras antrean `screening_jobs` dengan batas konkurensi terkontrol (default 2 worker).
 */
export async function drainScreeningQueue(options?: {
  workerId?: string;
  concurrency?: number;
  maxJobs?: number;
  leaseDurationMs?: number;
  customBackoffBaseMs?: number;
}): Promise<{
  processed: number;
  completed: number;
  failed: number;
  dead: number;
}> {
  const baseWorkerId = options?.workerId || `worker-${process.pid}`;
  const concurrency = Math.max(1, Math.min(options?.concurrency ?? 2, 8));
  const maxJobs = Math.max(1, options?.maxJobs ?? 100);
  const leaseDurationMs = options?.leaseDurationMs ?? 60_000;

  let processed = 0;
  let completed = 0;
  let failed = 0;
  let dead = 0;

  async function workerLoop(slotIndex: number) {
    const slotWorkerId = `${baseWorkerId}-slot-${slotIndex}`;
    while (processed < maxJobs) {
      const job = await claimNextScreeningJob(slotWorkerId, leaseDurationMs);
      if (!job) {
        break;
      }
      processed += 1;
      const result = await executeClaimedScreeningJob(job, {
        customBackoffBaseMs: options?.customBackoffBaseMs,
      });
      if (result.status === "completed") {
        completed += 1;
      } else if (result.status === "dead") {
        dead += 1;
      } else {
        failed += 1;
      }
    }
  }

  const workers = Array.from({ length: concurrency }, (_, i) => workerLoop(i));
  await Promise.all(workers);

  return { processed, completed, failed, dead };
}

// Single-flight coalescing state untuk mencegah "thundering herd" saat banyak request ingest masuk serentak
let activeBackgroundDrainPromise: Promise<void> | null = null;
let backgroundDrainRerunRequested = false;

/**
 * Memicu pengurasan antrean di latar belakang dengan jaminan Single-Flight Coalescing:
 * Jika 50 request masuk serentak, hanya 1 pool `drainScreeningQueue` yang berjalan pada satu waktu,
 * dan ia akan terus menguras sampai seluruh job yang baru masuk habis.
 */
export function triggerBackgroundDrain(options?: {
  concurrency?: number;
  batchMaxJobs?: number;
}): Promise<void> {
  if (activeBackgroundDrainPromise) {
    backgroundDrainRerunRequested = true;
    return activeBackgroundDrainPromise;
  }

  const concurrency = options?.concurrency ?? 4;
  const batchMaxJobs = options?.batchMaxJobs ?? 100;

  activeBackgroundDrainPromise = (async () => {
    try {
      do {
        backgroundDrainRerunRequested = false;
        const result = await drainScreeningQueue({
          workerId: `bg-drain-${process.pid}`,
          concurrency,
          maxJobs: batchMaxJobs,
        });
        // Jika batch penuh, mungkin masih ada sisa job di antrean
        if (result.processed >= batchMaxJobs) {
          backgroundDrainRerunRequested = true;
        }
      } while (backgroundDrainRerunRequested);
    } catch (err) {
      console.error("[MQC Background Drain Error]:", err);
    } finally {
      activeBackgroundDrainPromise = null;
    }
  })();

  return activeBackgroundDrainPromise;
}
