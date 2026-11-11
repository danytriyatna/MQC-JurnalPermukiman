import { db, manuscripts } from "@/db";
import { eq } from "drizzle-orm";

export interface OjsAssignedEditorResult {
  editorName: string | null;
  fetchedAt: Date;
  source: "ojs_api" | "dry_run" | "fallback";
  reason?: string;
}

export interface UploadReportToOjsInput {
  ojsSubmissionId: number;
  manuscriptId: string;
  versionNumber: number;
  reportBuffer: Buffer;
  fileName: string;
  existingOjsSubmissionFileId?: number | null;
}

export interface UploadReportToOjsResult {
  mode: "dry_run" | "live" | "skipped";
  submissionFileId: number | null;
  endpoint: string;
  method: "POST" | "PUT" | "NONE";
  fileStage: number;
  genreId: number;
  byteLength: number;
  fileName: string;
  syncedAt: string;
  reason?: string;
}

// Konstanta OJS 3.3 (PKPSubmissionFile.inc.php: SUBMISSION_FILE_SUBMISSION = 2)
export const OJS_FILE_STAGE_SUBMISSION = 2;

/**
 * Membentuk nama berkas laporan berdasarkan nama berkas asli di Submission Files.
 * Contoh: "Jurnal+Permukiman_Zidan_r_2.docx" -> "Laporan-review-Jurnal+Permukiman_Zidan_r_2.docx"
 */
export function buildOjsReportFileName(originalFileName?: string | null): string {
  const raw = (originalFileName || "naskah.docx").trim();
  const ensuredDocx = raw.toLowerCase().endsWith(".docx") ? raw : `${raw}.docx`;
  return `Laporan-review-${ensuredDocx}`;
}

// Circuit breaker sederhana di memori untuk melindungi proses worker jika OJS sedang mati
let consecutiveFailures = 0;
let circuitOpenUntil = 0;
const CIRCUIT_FAILURE_THRESHOLD = 3;
const CIRCUIT_COOLDOWN_MS = 30_000;

export function resetOjsCircuitBreaker(): void {
  consecutiveFailures = 0;
  circuitOpenUntil = 0;
}

function isCircuitOpen(): boolean {
  if (circuitOpenUntil > Date.now()) {
    return true;
  }
  return false;
}

function recordOjsSuccess(): void {
  consecutiveFailures = 0;
  circuitOpenUntil = 0;
}

function recordOjsFailure(): void {
  consecutiveFailures += 1;
  if (consecutiveFailures >= CIRCUIT_FAILURE_THRESHOLD) {
    circuitOpenUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
  }
}

export function getOjsConfig() {
  if (process.env.OJS_SYNC_DRY_RUN === undefined) {
    try {
      process.loadEnvFile?.(".env.local");
    } catch {
      // Abaikan bila berkas .env.local tidak ditemukan
    }
  }
  const syncEnabled = process.env.OJS_SYNC_ENABLED !== "false";
  // Default dryRun = true selama Fase 1 kecuali disetel eksplisit "false"
  const dryRun = process.env.OJS_SYNC_DRY_RUN !== "false";
  const baseUrl = (
    process.env.OJS_API_BASE_URL || "http://localhost:8000/index.php/JP/api/v1"
  ).replace(/\/+$/, "");
  const apiKey = process.env.OJS_API_KEY?.trim() || "";
  const genreId = Number(process.env.OJS_REPORT_GENRE_ID || "14") || 14;
  const timeoutMs = Number(process.env.OJS_API_TIMEOUT_MS || "3000") || 3000;

  return {
    syncEnabled,
    dryRun,
    baseUrl,
    apiKey,
    genreId,
    timeoutMs,
  };
}

/**
 * Mengambil nama Editor yang ditugaskan pada naskah di OJS 3.3 (Opsi B).
 * Menerapkan degradasi halus (graceful degradation): kegagalan jaringan atau ketiadaan API key
 * tidak pernah melempar exception yang menggagalkan pembuatan laporan.
 */
export async function getAssignedEditorFromOjs(
  ojsSubmissionId: number | null | undefined,
): Promise<OjsAssignedEditorResult> {
  const fetchedAt = new Date();

  if (!ojsSubmissionId || ojsSubmissionId <= 0) {
    return {
      editorName: null,
      fetchedAt,
      source: "fallback",
      reason: "Naskah tidak memiliki ojs_submission_id",
    };
  }

  const config = getOjsConfig();

  if (config.dryRun) {
    if (process.env.TEST_SIMULATE_UNASSIGNED === "true" || ojsSubmissionId === 9999755) {
      return {
        editorName: null,
        fetchedAt,
        source: "dry_run",
        reason: "Simulasi naskah belum ditugaskan editor pada tahap Submission di OJS (dry run)",
      };
    }
    return {
      editorName: "Editor Simulasi (Dry Run)",
      fetchedAt,
      source: "dry_run",
      reason: "Mode OJS_SYNC_DRY_RUN aktif; menggunakan nama editor simulasi",
    };
  }

  if (!config.apiKey) {
    return {
      editorName: null,
      fetchedAt,
      source: "fallback",
      reason: "OJS_API_KEY belum dikonfigurasi",
    };
  }

  if (isCircuitOpen()) {
    return {
      editorName: null,
      fetchedAt,
      source: "fallback",
      reason: "Circuit breaker OJS sedang terbuka akibat kegagalan beruntun sebelumnya",
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    // Filter khusus peran Editor (ROLE_ID_MANAGER = 16, ROLE_ID_SUB_EDITOR = 17) pada tahap Submission (stage 1)
    // sehingga tidak pernah mengembalikan Penulis (ROLE_ID_AUTHOR = 65536).
    const url = `${config.baseUrl}/users?assignedToSubmission=${ojsSubmissionId}&assignedToSubmissionStage=1&roleIds=16,17&apiToken=${encodeURIComponent(config.apiKey)}`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      recordOjsFailure();
      return {
        editorName: null,
        fetchedAt,
        source: "fallback",
        reason: `HTTP ${res.status} dari endpoint users OJS`,
      };
    }

    const data = await res.json();
    recordOjsSuccess();

    const participants = Array.isArray(data?.items)
      ? data.items
      : Array.isArray(data)
        ? data
        : [];

    // Ambil Editor pertama yang bukan akun layanan sistem MQC
    for (const p of participants) {
      const userName = typeof p?.userName === "string" ? p.userName.trim() : "";
      const fullName =
        typeof p?.fullName === "string"
          ? p.fullName.trim()
          : userName;

      if (
        fullName &&
        userName !== "mqc_service" &&
        !fullName.toLowerCase().includes("sistem mqc")
      ) {
        return {
          editorName: fullName,
          fetchedAt,
          source: "ojs_api",
        };
      }
    }

    return {
      editorName: null,
      fetchedAt,
      source: "ojs_api",
      reason: "Belum ada editor yang ditugaskan pada tahap Submission di OJS",
    };
  } catch (err: any) {
    recordOjsFailure();
    return {
      editorName: null,
      fetchedAt,
      source: "fallback",
      reason: err?.message || "Gagal menghubungi REST API OJS",
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Menentukan teks kolom "Diperiksa oleh" sesuai Opsi B:
 * 1. Gunakan snapshot assignedEditorName di database jika sudah ada.
 * 2. Jika belum ada dan ojsSubmissionId tersedia, ambil dari OJS dan simpan snapshot-nya ke mqc_db.
 * 3. Jika belum ada editor ditugaskan / OJS tidak terjangkau, kembalikan "Belum ada editor ditugaskan".
 * Tidak pernah menggunakan author_name penulis naskah.
 */
export async function resolveReviewedByForManuscript(manuscript: {
  id: string;
  ojsSubmissionId?: number | null;
  assignedEditorName?: string | null;
  assignedEditorFetchedAt?: Date | string | null;
}): Promise<string> {
  if (manuscript.assignedEditorName && manuscript.assignedEditorName.trim().length > 0) {
    return manuscript.assignedEditorName.trim();
  }

  if (manuscript.ojsSubmissionId) {
    const lookup = await getAssignedEditorFromOjs(manuscript.ojsSubmissionId);
    if (lookup.editorName) {
      try {
        await db
          .update(manuscripts)
          .set({
            assignedEditorName: lookup.editorName,
            assignedEditorFetchedAt: lookup.fetchedAt,
          })
          .where(eq(manuscripts.id, manuscript.id));
      } catch {
        // Kegagalan menyimpan cache snapshot tidak boleh menggagalkan pembuatan laporan
      }
      return lookup.editorName;
    }
  }

  return "Belum ada editor ditugaskan";
}

/**
 * Mengunggah atau memperbarui berkas laporan MQC (.docx) ke OJS 3.3 pada fileStage = 2
 * (SUBMISSION_FILE_SUBMISSION) agar muncul di modal "Select Files" pada Pre-Review Discussions.
 * Mendukung Feature Flag (OJS_SYNC_ENABLED) dan Dry-Run Mode (OJS_SYNC_DRY_RUN).
 */
export async function uploadOrUpdateReportToOjs(
  input: UploadReportToOjsInput,
): Promise<UploadReportToOjsResult> {
  const config = getOjsConfig();
  const syncedAt = new Date().toISOString();
  const isUpdate =
    typeof input.existingOjsSubmissionFileId === "number" &&
    input.existingOjsSubmissionFileId > 0;
  const method = isUpdate ? "PUT" : "POST";
  const endpoint = isUpdate
    ? `${config.baseUrl}/submissions/${input.ojsSubmissionId}/files/${input.existingOjsSubmissionFileId}`
    : `${config.baseUrl}/submissions/${input.ojsSubmissionId}/files`;

  if (!config.syncEnabled) {
    return {
      mode: "skipped",
      submissionFileId: input.existingOjsSubmissionFileId ?? null,
      endpoint,
      method: "NONE",
      fileStage: OJS_FILE_STAGE_SUBMISSION,
      genreId: config.genreId,
      byteLength: input.reportBuffer.length,
      fileName: input.fileName,
      syncedAt,
      reason: "OJS_SYNC_ENABLED=false (kill switch aktif)",
    };
  }

  if (config.dryRun) {
    return {
      mode: "dry_run",
      submissionFileId: input.existingOjsSubmissionFileId ?? null,
      endpoint,
      method,
      fileStage: OJS_FILE_STAGE_SUBMISSION,
      genreId: config.genreId,
      byteLength: input.reportBuffer.length,
      fileName: input.fileName,
      syncedAt,
      reason: "OJS_SYNC_DRY_RUN=true: payload siap diunggah tanpa menyentuh server OJS",
    };
  }

  if (!config.apiKey) {
    throw new Error("OJS_API_KEY belum dikonfigurasi untuk mode sinkronisasi live.");
  }

  if (isCircuitOpen()) {
    throw new Error("Circuit breaker OJS sedang terbuka; tunda unggahan hingga cooldown selesai.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(config.timeoutMs, 10_000));

  try {
    const postEndpoint = `${config.baseUrl}/submissions/${input.ojsSubmissionId}/files`;
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(input.reportBuffer)], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    formData.append("file", blob, input.fileName);
    formData.append("fileStage", String(OJS_FILE_STAGE_SUBMISSION));
    formData.append("genreId", String(config.genreId));
    formData.append("name[en_US]", input.fileName);
    formData.append("name[id_ID]", input.fileName);

    const urlWithToken = `${postEndpoint}?apiToken=${encodeURIComponent(config.apiKey)}`;
    const res = await fetch(urlWithToken, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: formData,
      signal: controller.signal,
    });

    if (!res.ok) {
      recordOjsFailure();
      const errText = await res.text().catch(() => "");
      throw new Error(
        `Gagal POST laporan ke OJS (HTTP ${res.status}): ${errText.slice(0, 300)}`,
      );
    }

    const body = await res.json();
    recordOjsSuccess();

    const returnedFileId =
      typeof body?.id === "number"
        ? body.id
        : input.existingOjsSubmissionFileId ?? null;

    // Jika sebelumnya sudah ada file laporan MQC (re-sync versi baru), hapus entri file lama via DELETE (?stageId=1)
    // agar tidak terjadi duplikasi berkas laporan di modal Select Files.
    if (
      isUpdate &&
      returnedFileId &&
      input.existingOjsSubmissionFileId &&
      returnedFileId !== input.existingOjsSubmissionFileId
    ) {
      try {
        const deleteUrl = `${config.baseUrl}/submissions/${input.ojsSubmissionId}/files/${input.existingOjsSubmissionFileId}?stageId=1&apiToken=${encodeURIComponent(config.apiKey)}`;
        await fetch(deleteUrl, {
          method: "DELETE",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${config.apiKey}`,
          },
        });
      } catch {
        // Kegagalan pembersihan file versi lama tidak menggagalkan unggahan versi baru
      }
    }

    return {
      mode: "live",
      submissionFileId: returnedFileId,
      endpoint: postEndpoint,
      method: "POST",
      fileStage: OJS_FILE_STAGE_SUBMISSION,
      genreId: config.genreId,
      byteLength: input.reportBuffer.length,
      fileName: input.fileName,
      syncedAt,
    };
  } catch (err) {
    recordOjsFailure();
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
