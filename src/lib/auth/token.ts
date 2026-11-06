import { SignJWT, jwtVerify } from "jose";

function getSecretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET || "pupr_default_jwt_secret_token_at_least_32_characters_long";
  return new TextEncoder().encode(secret);
}

export interface InspectionTokenPayload {
  manuscriptId: string;
  ojsSubmissionId?: number | null;
  scope: "inspection";
}

/**
 * Membuat token bertanda tangan (HMAC-SHA256) untuk akses langsung ke laporan naskah tanpa login.
 * Berlaku selama 48 jam.
 */
export async function createInspectionToken(
  manuscriptId: string,
  ojsSubmissionId?: number | null,
): Promise<string> {
  const secretKey = getSecretKey();

  return await new SignJWT({
    manuscriptId,
    ojsSubmissionId: ojsSubmissionId ?? null,
    scope: "inspection",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("48h")
    .sign(secretKey);
}

/**
 * Memverifikasi keabsahan token inspeksi naskah.
 */
export async function verifyInspectionToken(
  token: string,
  expectedManuscriptId?: string,
): Promise<InspectionTokenPayload | null> {
  try {
    const secretKey = getSecretKey();
    const { payload } = await jwtVerify(token, secretKey);

    if (payload.scope !== "inspection") {
      return null;
    }

    if (expectedManuscriptId && payload.manuscriptId !== expectedManuscriptId) {
      return null;
    }

    return {
      manuscriptId: String(payload.manuscriptId),
      ojsSubmissionId: payload.ojsSubmissionId ? Number(payload.ojsSubmissionId) : null,
      scope: "inspection",
    };
  } catch {
    return null;
  }
}
