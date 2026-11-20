import fs from "node:fs";

/**
 * URL publik antar-layanan dibaca saat runtime sehingga satu image Docker
 * tetap portabel di lokal (localhost) maupun di VPS (http://<IP>:<PORT> / HTTPS).
 */

export function getOjsPublicUrl(): string {
  return process.env.OJS_PUBLIC_URL?.trim() || "http://localhost:8000/index.php/JP";
}

export function getJpInsightPublicUrl(): string {
  return process.env.JP_INSIGHT_PUBLIC_URL?.trim() || "http://localhost:3001";
}

export function getJpInsightWidgetUrl(): string {
  const explicit = process.env.JP_INSIGHT_WIDGET_URL?.trim();
  if (explicit) return explicit;
  return `${getJpInsightPublicUrl().replace(/\/+$/, "")}/api/widget/chat`;
}

/**
 * Daftar endpoint upstream JP-Insight yang dipanggil oleh server proxy MQC
 * (/api/widget-chat) agar browser tetap memakai koneksi same-origin sesuai CSP.
 */
export function getJpInsightServerWidgetTargets(
  env: Record<string, string | undefined> = process.env,
): string[] {
  const targets: string[] = [];
  const pushUnique = (url: string | undefined) => {
    const clean = url?.trim();
    if (!clean || !/^https?:\/\//i.test(clean)) return;
    if (!targets.includes(clean)) {
      targets.push(clean);
    }
  };

  pushUnique(env.JP_INSIGHT_INTERNAL_WIDGET_URL);

  const explicitWidgetUrl = env.JP_INSIGHT_WIDGET_URL?.trim();
  if (explicitWidgetUrl && /^https?:\/\//i.test(explicitWidgetUrl)) {
    pushUnique(explicitWidgetUrl);
  }

  const runningInDockerContainer =
    Boolean(env.DATABASE_URL?.includes("jp-pgvector")) || fs.existsSync("/.dockerenv");
  if (runningInDockerContainer) {
    pushUnique("http://jp-insight:3000/api/widget/chat");
  }

  const publicBase = env.JP_INSIGHT_PUBLIC_URL?.trim() || "http://localhost:3001";
  pushUnique(`${publicBase.replace(/\/+$/, "")}/api/widget/chat`);

  return targets;
}
