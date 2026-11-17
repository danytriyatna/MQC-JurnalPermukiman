import { z } from "zod";
import { MAX_UPLOAD_SIZE_BYTES } from "@/lib/upload/validateFile";

/**
 * Zod schema for client-side manuscript file validation.
 */
export const manuscriptFileSchema = z.object({
  file: z
    .custom<File>((val) => typeof window !== "undefined" && val instanceof File, {
      message: "File naskah wajib dipilih.",
    })
    .refine((file) => file.name.toLowerCase().endsWith(".docx"), {
      message: "Hanya file .docx yang didukung. Silakan konversi naskah ke format Word terlebih dahulu.",
    })
    .refine((file) => file.size > 0, {
      message: "File kosong. Pilih file naskah yang valid.",
    })
    .refine((file) => file.size <= MAX_UPLOAD_SIZE_BYTES, {
      message: "Ukuran file terlalu besar (maksimum 50MB).",
    }),
});

/**
 * Zod schema for server-side manuscript envelope submission.
 */
export const manuscriptEnvelopeSchema = z.object({
  storagePath: z.string().min(1, "Storage path wajib disertakan."),
  originalFileName: z
    .string()
    .min(1, "Nama file wajib disertakan.")
    .refine((name) => name.toLowerCase().endsWith(".docx"), {
      message: "Hanya file .docx yang didukung.",
    }),
});

export type ManuscriptFileInput = z.infer<typeof manuscriptFileSchema>;
export type ManuscriptEnvelopeInput = z.infer<typeof manuscriptEnvelopeSchema>;
