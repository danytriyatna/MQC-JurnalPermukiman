export const MAX_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024;

export function validateDocxFileName(fileName: string): string | null {
  if (!fileName.toLowerCase().endsWith(".docx")) {
    return "Hanya file .docx yang didukung. Silakan konversi naskah ke format Word terlebih dahulu.";
  }
  return null;
}

export function validateDocxSize(size: number): string | null {
  if (size === 0) {
    return "File kosong. Pilih file naskah yang valid.";
  }
  if (size > MAX_UPLOAD_SIZE_BYTES) {
    return "Ukuran file terlalu besar (maksimum 50MB).";
  }
  return null;
}

/**
 * Name and size are validated separately as well as together because the
 * server checks them at two different moments: the name arrives in the JSON
 * envelope, while the size is only known once the object has been pulled back
 * out of Storage. The browser, which still holds the real `File`, checks both
 * at once — and gets the same wording either way.
 */
export function validateDocxUpload(fileName: string, size: number): string | null {
  return validateDocxFileName(fileName) ?? validateDocxSize(size);
}
