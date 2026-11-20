"use client";

import { useEffect } from "react";
import Script from "next/script";
import { usePathname } from "next/navigation";

export function WidgetLoader() {
  const pathname = usePathname();
  const isLogin = Boolean(pathname?.startsWith("/login"));

  useEffect(() => {
    const fab = document.querySelector<HTMLElement>(".jp-widget-fab");
    const win = document.querySelector<HTMLElement>(".jp-widget-window");
    const callout = document.querySelector<HTMLElement>(".jp-widget-callout");
    if (fab) fab.style.display = isLogin ? "none" : "";
    if (win) win.style.display = isLogin ? "none" : "";
    if (callout) callout.style.display = isLogin ? "none" : "";
  }, [isLogin]);

  if (isLogin) {
    return null;
  }

  return (
    <Script
      src="/jp-chat-widget.js?v=20261118_callout2"
      data-endpoint="/api/widget-chat"
      strategy="afterInteractive"
    />
  );
}
