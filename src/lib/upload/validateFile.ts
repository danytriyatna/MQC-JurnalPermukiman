export const MAX_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024;

export function validateDocxFile(file: File): string | null {
  if (!file.name.toLowerCase().endsWith(".docx")) {
    return "Hanya file .docx yang didukung.";
  }
  if (file.size === 0 || file.size > MAX_UPLOAD_SIZE_BYTES) {
    return "Ukuran file tidak valid (kosong atau lebih dari 50MB).";
  }
  return null;
}
