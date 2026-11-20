import { NextResponse } from "next/server";
import { getJpInsightServerWidgetTargets } from "@/lib/public-urls";

export const MAX_WIDGET_PROXY_BODY_BYTES = 16_384;
const UPSTREAM_TIMEOUT_MS = 55_000;

export interface SameOriginCheckResult {
  allowed: boolean;
  error?: string;
}

function toOrigin(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.toLowerCase() === "null") return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function addLoopbackSibling(origin: string, target: Set<string>): void {
  try {
    const parsed = new URL(origin);
    if (parsed.hostname === "localhost") {
      parsed.hostname = "127.0.0.1";
      target.add(parsed.origin);
    } else if (parsed.hostname === "127.0.0.1") {
      parsed.hostname = "localhost";
      target.add(parsed.origin);
    }
  } catch {
    // Abaikan URL tidak valid
  }
}

function resolveSelfOrigin(request: Request): string | null {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host")?.trim();
  if (host) {
    const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    let proto = forwardedProto;
    if (!proto) {
      try {
        proto = new URL(request.url).protocol.replace(":", "");
      } catch {
        proto = "http";
      }
    }
    return toOrigin(`${proto || "http"}://${host}`);
  }
  return toOrigin(request.url);
}

/**
 * Memastikan permintaan ke proxy widget /api/widget-chat hanya datang
 * dari origin MQC sendiri dan bukan request lintas situs dari domain asing.
 */
export function evaluateSameOriginProxyRequest(
  request: Request,
  env: Record<string, string | undefined> = process.env,
): SameOriginCheckResult {
  const fetchSite = request.headers.get("sec-fetch-site")?.trim().toLowerCase();
  if (fetchSite === "cross-site") {
    return {
      allowed: false,
      error: "Permintaan lintas situs tidak diizinkan.",
    };
  }

  const rawOrigin = request.headers.get("origin")?.trim() ?? "";
  if (!rawOrigin) {
    return { allowed: true };
  }

  const normalizedOrigin = toOrigin(rawOrigin);
  if (!normalizedOrigin) {
    return {
      allowed: false,
      error: "Header Origin tidak valid.",
    };
  }

  const isDev = env.NODE_ENV !== "production";
  const allowedOrigins = new Set<string>();
  const addCandidate = (candidate: string | null) => {
    if (!candidate) return;
    allowedOrigins.add(candidate);
    if (isDev) {
      addLoopbackSibling(candidate, allowedOrigins);
    }
  };

  addCandidate(resolveSelfOrigin(request));
  addCandidate(toOrigin(env.AUTH_URL));
  addCandidate(toOrigin(env.MQC_PUBLIC_URL));
  addCandidate(toOrigin(env.NEXT_PUBLIC_APP_URL));

  if (!allowedOrigins.has(normalizedOrigin)) {
    return {
      allowed: false,
      error: "Origin tidak diizinkan mengakses proxy widget.",
    };
  }

  return { allowed: true };
}

/** Mengekstrak IP pengunjung asli untuk diteruskan ke rate-limiter JP-Insight. */
export function resolveProxyClientIp(request: Request): string | null {
  const cfIp = request.headers.get("cf-connecting-ip")?.trim();
  const xff = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  const candidate = (cfIp || xff || realIp || "").replace(/^::ffff:/i, "").trim();
  return candidate || null;
}

type ParsedProxyPayload =
  | { ok: true; question: string }
  | { ok: false; status: 400 | 413; error: string };

function parseWidgetProxyPayload(rawBody: string): ParsedProxyPayload {
  if (Buffer.byteLength(rawBody, "utf8") > MAX_WIDGET_PROXY_BODY_BYTES) {
    return { ok: false, status: 413, error: "Ukuran permintaan terlalu besar." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { ok: false, status: 400, error: "Format permintaan harus berupa JSON yang valid." };
  }

  const rawQuestion =
    parsed && typeof parsed === "object" && "question" in parsed
      ? (parsed as { question?: unknown }).question
      : undefined;
  const question = typeof rawQuestion === "string" ? rawQuestion.trim() : "";

  if (!question) {
    return { ok: false, status: 400, error: "Pertanyaan tidak boleh kosong" };
  }

  return { ok: true, question };
}

export interface ForwardWidgetOptions {
  fetchImpl?: typeof fetch;
  env?: Record<string, string | undefined>;
  targets?: string[];
}

/**
 * Meneruskan payload pertanyaan widget secara same-origin dari server MQC ke
 * endpoint JP-Insight (/api/widget/chat), sambil mempertahankan status & Retry-After.
 */
export async function forwardWidgetChatRequest(
  request: Request,
  options: ForwardWidgetOptions = {},
): Promise<Response> {
  const env = options.env ?? process.env;
  const originCheck = evaluateSameOriginProxyRequest(request, env);
  if (!originCheck.allowed) {
    return NextResponse.json(
      { error: originCheck.error || "Origin tidak diizinkan." },
      { status: 403, headers: { Vary: "Origin", "Cache-Control": "no-store" } },
    );
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_WIDGET_PROXY_BODY_BYTES) {
    return NextResponse.json(
      { error: "Ukuran permintaan terlalu besar." },
      { status: 413, headers: { "Cache-Control": "no-store" } },
    );
  }

  const rawBody = await request.text().catch(() => "");
  const payload = parseWidgetProxyPayload(rawBody);
  if (!payload.ok) {
    return NextResponse.json(
      { error: payload.error },
      { status: payload.status, headers: { "Cache-Control": "no-store" } },
    );
  }

  const targets = options.targets ?? getJpInsightServerWidgetTargets(env);
  if (targets.length === 0) {
    return NextResponse.json(
      { error: "Alamat server JP-Insight belum terkonfigurasi." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const forwardHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const clientIp = resolveProxyClientIp(request);
  if (clientIp) {
    forwardHeaders["X-Forwarded-For"] = clientIp;
  }

  for (const target of targets) {
    try {
      const upstream = await fetchImpl(target, {
        method: "POST",
        headers: forwardHeaders,
        body: JSON.stringify({ question: payload.question }),
        cache: "no-store",
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });

      const responseBody = await upstream.text();
      const responseHeaders = new Headers({
        "Content-Type": upstream.headers.get("content-type") || "application/json",
        "Cache-Control": "no-store",
        Vary: "Origin",
      });
      const retryAfter = upstream.headers.get("retry-after");
      if (retryAfter) {
        responseHeaders.set("Retry-After", retryAfter);
      }

      return new NextResponse(responseBody, {
        status: upstream.status,
        headers: responseHeaders,
      });
    } catch {
      // Coba kandidat upstream berikutnya bila target internal gagal dihubungi
      continue;
    }
  }

  return NextResponse.json(
    { error: "Server asisten JP-Insight sedang tidak dapat dijangkau." },
    { status: 502, headers: { "Cache-Control": "no-store" } },
  );
}
