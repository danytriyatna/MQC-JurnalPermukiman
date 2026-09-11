import { randomUUID } from "node:crypto";

/**
 * Builds a Supabase Storage object key from a UUID rather than the
 * uploaded file's own name. Real-world filenames can contain characters
 * Storage rejects as an invalid key (stray control characters copied in
 * from a title, unusual Unicode, etc.) — decoupling the key from user
 * input avoids that entirely. The human-readable original name is kept
 * separately in the `original_file_name` DB column for display/download.
 */
export function buildManuscriptStoragePath(userId: string): string {
  return `${userId}/${randomUUID()}.docx`;
}
