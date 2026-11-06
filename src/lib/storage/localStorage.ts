import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

/**
 * Mendapatkan direktori penyimpanan naskah fisik dari variabel lingkungan MANUSCRIPT_STORAGE_DIR.
 * Jika berupa path relatif, diresolusikan terhadap root aplikasi (process.cwd()).
 * Default fallback: [process.cwd()]/storage/manuscripts
 */
export function getStorageDir(): string {
  const envPath = process.env.MANUSCRIPT_STORAGE_DIR?.trim();
  if (envPath) {
    return path.isAbsolute(envPath) ? envPath : path.resolve(/*turbopackIgnore: true*/ process.cwd(), envPath);
  }
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), "storage", "manuscripts");
}

export interface SaveFileResult {
  storagePath: string; // Path relatif di dalam storage dir (untuk disimpan di DB)
  fullPath: string;    // Path absolut di sistem berkas
  fileName: string;    // Nama berkas UUID
}

/**
 * Menyimpan buffer dokumen naskah ke disk fisik lokal.
 * Folder induk akan dibuat secara otomatis bila belum ada.
 */
export async function saveManuscriptFile(
  buffer: Buffer,
  originalFileName: string,
  subfolder?: string,
): Promise<SaveFileResult> {
  const baseDir = getStorageDir();
  const fileId = crypto.randomUUID();
  const ext = path.extname(originalFileName).toLowerCase() || ".docx";
  const fileName = `${fileId}${ext}`;

  const relativePath = subfolder ? path.join(/*turbopackIgnore: true*/ subfolder, fileName) : fileName;
  const targetDir = subfolder ? path.join(/*turbopackIgnore: true*/ baseDir, subfolder) : baseDir;

  await fs.mkdir(targetDir, { recursive: true });
  const fullPath = path.join(/*turbopackIgnore: true*/ baseDir, relativePath);
  await fs.writeFile(fullPath, buffer);

  return {
    storagePath: relativePath,
    fullPath,
    fileName,
  };
}

/**
 * Membaca berkas dokumen dari disk fisik lokal berdasarkan relative storagePath.
 * Dilengkapi proteksi ketat pencegahan path traversal (..).
 */
export async function readManuscriptFile(storagePath: string): Promise<Buffer> {
  const baseDir = getStorageDir();
  const resolvedPath = path.resolve(/*turbopackIgnore: true*/ baseDir, storagePath);

  // Guard: pastikan path hasil resolusi tetap berada di dalam baseDir
  const normalizedBase = path.resolve(/*turbopackIgnore: true*/ baseDir);
  if (!resolvedPath.startsWith(normalizedBase + path.sep) && resolvedPath !== normalizedBase) {
    throw new Error("Akses path penyimpanan tidak sah (potensi path traversal terdeteksi).");
  }

  return await fs.readFile(/*turbopackIgnore: true*/ resolvedPath);
}

/**
 * Menghapus berkas dokumen dari disk fisik lokal bila diperlukan.
 */
export async function deleteManuscriptFile(storagePath: string): Promise<boolean> {
  const baseDir = getStorageDir();
  const resolvedPath = path.resolve(/*turbopackIgnore: true*/ baseDir, storagePath);

  const normalizedBase = path.resolve(/*turbopackIgnore: true*/ baseDir);
  if (!resolvedPath.startsWith(normalizedBase + path.sep) && resolvedPath !== normalizedBase) {
    throw new Error("Akses path penyimpanan tidak sah.");
  }

  try {
    await fs.unlink(/*turbopackIgnore: true*/ resolvedPath);
    return true;
  } catch {
    return false;
  }
}
