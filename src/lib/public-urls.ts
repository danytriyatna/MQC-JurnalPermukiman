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
