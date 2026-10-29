/**
 * Builds a Supabase Storage object key from a UUID rather than the
 * uploaded file's own name. Real-world filenames can contain characters
 * Storage rejects as an invalid key (stray control characters copied in
 * from a title, unusual Unicode, etc.) — decoupling the key from user
 * input avoids that entirely. The human-readable original name is kept
 * separately in the `original_file_name` DB column for display/download.
 *
 * Uses the Web Crypto global instead of `node:crypto` because the key is now
 * minted in the browser: the .docx is uploaded straight to Storage from
 * there, so this module has to work on both sides.
 */
export function buildManuscriptStoragePath(userId: string): string {
  return `${userId}/${crypto.randomUUID()}.docx`;
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const MANUSCRIPT_KEY = new RegExp(`^${UUID}/${UUID}\.docx$`, "i");

/**
 * The browser chooses the key and hands it back to the API, so the server
 * cannot trust it. A key is only honoured when it has the exact shape
 * `buildManuscriptStoragePath` produces and sits in the caller's own folder,
 * which keeps one account from pointing the screener at another's object.
 */
export function isOwnManuscriptStoragePath(path: string, userId: string): boolean {
  return MANUSCRIPT_KEY.test(path) && path.startsWith(`${userId}/`);
}
