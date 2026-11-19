"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import { usePathname } from "next/navigation";

export function WidgetLoader() {
  const pathname = usePathname();
  const isLogin = Boolean(pathname?.startsWith("/login"));
  const [widgetEndpoint, setWidgetEndpoint] = useState<string | null>(null);

  useEffect(() => {
    const fab = document.querySelector<HTMLElement>(".jp-widget-fab");
    const win = document.querySelector<HTMLElement>(".jp-widget-window");
    const callout = document.querySelector<HTMLElement>(".jp-widget-callout");
    if (fab) fab.style.display = isLogin ? "none" : "";
    if (win) win.style.display = isLogin ? "none" : "";
    if (callout) callout.style.display = isLogin ? "none" : "";
  }, [isLogin]);

  useEffect(() => {
    if (isLogin || widgetEndpoint) {
      return;
    }

    let cancelled = false;
    const fallbackUrl =
      typeof window !== "undefined"
        ? `${window.location.protocol}//${window.location.hostname}:3001/api/widget/chat`
        : "http://localhost:3001/api/widget/chat";

    fetch("/api/public-config", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { jpInsightWidgetUrl?: string } | null) => {
        if (!cancelled) {
          setWidgetEndpoint(data?.jpInsightWidgetUrl?.trim() || fallbackUrl);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setWidgetEndpoint(fallbackUrl);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isLogin, widgetEndpoint]);

  if (isLogin || !widgetEndpoint) {
    return null;
  }

  return (
    <Script
      src="/jp-chat-widget.js?v=20261118_callout2"
      data-endpoint={widgetEndpoint}
      strategy="afterInteractive"
    />
  );
}
