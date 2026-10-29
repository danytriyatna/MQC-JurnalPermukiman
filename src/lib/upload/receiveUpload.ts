import type { createClient } from "@/lib/supabase/server";
import { isOwnManuscriptStoragePath } from "@/lib/upload/storagePath";
import { validateDocxFileName, validateDocxSize } from "@/lib/upload/validateFile";
import { MANUSCRIPT_BUCKET } from "@/lib/upload/constants";

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

export type ReceivedUpload =
  | { ok: true; storagePath: string; originalFileName: string; buffer: Buffer }
  | { ok: false; error: string; status: number };

/**
 * Reads the small JSON envelope the browser sends once it has already put the
 * .docx into Storage itself, then pulls those bytes back down for screening.
 *
 * The file deliberately never travels through this route's own request body.
 * Vercel caps a serverless function's request body at roughly 4.5MB, which a
 * manuscript carrying embedded figures passes easily — a 13MB submission is
 * ordinary here. That cap is enforced at the platform edge, before any of this
 * code runs, and the rejection comes back as a non-JSON body, so the browser
 * could only ever report it as a failed connection. Uploading to Storage
 * first keeps the request body a few hundred bytes regardless of file size,
 * which is what makes the advertised 50MB limit real.
 */
export async function receiveUploadedManuscript(
  request: Request,
  supabase: ServerSupabase,
  userId: string,
): Promise<ReceivedUpload> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return { ok: false, error: "Permintaan tidak valid.", status: 400 };
  }

  const { storagePath, originalFileName } = (payload ?? {}) as Record<string, unknown>;

  if (typeof storagePath !== "string" || typeof originalFileName !== "string") {
    return { ok: false, error: "Data unggahan tidak lengkap.", status: 400 };
  }

  if (!isOwnManuscriptStoragePath(storagePath, userId)) {
    return { ok: false, error: "Lokasi file unggahan tidak valid.", status: 400 };
  }

  const nameError = validateDocxFileName(originalFileName);
  if (nameError) {
    return { ok: false, error: nameError, status: 400 };
  }

  const { data: blob, error: downloadError } = await supabase.storage
    .from(MANUSCRIPT_BUCKET)
    .download(storagePath);

  if (downloadError || !blob) {
    return {
      ok: false,
      error: "File unggahan tidak ditemukan di penyimpanan. Silakan unggah ulang.",
      status: 400,
    };
  }

  const sizeError = validateDocxSize(blob.size);
  if (sizeError) {
    return { ok: false, error: sizeError, status: 400 };
  }

  return {
    ok: true,
    storagePath,
    originalFileName,
    buffer: Buffer.from(await blob.arrayBuffer()),
  };
}
