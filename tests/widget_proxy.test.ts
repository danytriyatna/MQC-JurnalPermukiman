import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getJpInsightServerWidgetTargets } from "../src/lib/public-urls";
import {
  MAX_WIDGET_PROXY_BODY_BYTES,
  evaluateSameOriginProxyRequest,
  forwardWidgetChatRequest,
  resolveProxyClientIp,
} from "../src/lib/widget-proxy";

describe("MQC Same-Origin Widget Proxy (/api/widget-chat)", () => {
  it("resolves Docker internal target before public URL when DATABASE_URL uses jp-pgvector", () => {
    const targets = getJpInsightServerWidgetTargets({
      DATABASE_URL: "postgres://admin:secret@jp-pgvector:5432/mqc_db",
      JP_INSIGHT_PUBLIC_URL: "http://43.133.144.81:3001",
    });

    assert.deepEqual(targets, [
      "http://jp-insight:3000/api/widget/chat",
      "http://43.133.144.81:3001/api/widget/chat",
    ]);
  });

  it("allows same-origin MQC requests and rejects cross-site/foreign origins with 403", () => {
    const prodEnv = {
      NODE_ENV: "production",
      AUTH_URL: "http://43.133.144.81:3000",
      MQC_PUBLIC_URL: "http://43.133.144.81:3000",
    };

    const okReq = new Request("http://43.133.144.81:3000/api/widget-chat", {
      method: "POST",
      headers: {
        host: "43.133.144.81:3000",
        origin: "http://43.133.144.81:3000",
        "sec-fetch-site": "same-origin",
      },
    });
    assert.equal(evaluateSameOriginProxyRequest(okReq, prodEnv).allowed, true);

    const evilOriginReq = new Request("http://43.133.144.81:3000/api/widget-chat", {
      method: "POST",
      headers: {
        host: "43.133.144.81:3000",
        origin: "https://evil.example",
      },
    });
    assert.equal(evaluateSameOriginProxyRequest(evilOriginReq, prodEnv).allowed, false);

    const crossSiteReq = new Request("http://43.133.144.81:3000/api/widget-chat", {
      method: "POST",
      headers: {
        host: "43.133.144.81:3000",
        "sec-fetch-site": "cross-site",
      },
    });
    assert.equal(evaluateSameOriginProxyRequest(crossSiteReq, prodEnv).allowed, false);
  });

  it("extracts real client IP from x-forwarded-for", () => {
    const req = new Request("http://localhost:3000/api/widget-chat", {
      headers: { "x-forwarded-for": "::ffff:203.0.113.10, 10.0.0.2" },
    });
    assert.equal(resolveProxyClientIp(req), "203.0.113.10");
  });

  it("rejects oversized body and empty questions before hitting upstream", async () => {
    let called = false;
    const mockFetch: typeof fetch = async () => {
      called = true;
      return new Response("{}");
    };

    const tooLargeReq = new Request("http://43.133.144.81:3000/api/widget-chat", {
      method: "POST",
      headers: {
        origin: "http://43.133.144.81:3000",
        host: "43.133.144.81:3000",
        "content-type": "application/json",
      },
      body: JSON.stringify({ question: "a".repeat(MAX_WIDGET_PROXY_BODY_BYTES + 10) }),
    });
    const largeRes = await forwardWidgetChatRequest(tooLargeReq, {
      fetchImpl: mockFetch,
      targets: ["http://jp-insight:3000/api/widget/chat"],
    });
    assert.equal(largeRes.status, 413);
    assert.equal(called, false);

    const emptyReq = new Request("http://43.133.144.81:3000/api/widget-chat", {
      method: "POST",
      headers: {
        origin: "http://43.133.144.81:3000",
        host: "43.133.144.81:3000",
        "content-type": "application/json",
      },
      body: JSON.stringify({ question: "   " }),
    });
    const emptyRes = await forwardWidgetChatRequest(emptyReq, {
      fetchImpl: mockFetch,
      targets: ["http://jp-insight:3000/api/widget/chat"],
    });
    assert.equal(emptyRes.status, 400);
    assert.equal(called, false);
  });

  it("falls back cleanly across targets, forwards X-Forwarded-For, and preserves 429 Retry-After", async () => {
    const seenCalls: Array<{ url: string; xff: string | null; originHeader: string | null }> = [];
    const mockFetch: typeof fetch = async (input, init) => {
      const headers = new Headers(init?.headers);
      const url = typeof input === "string" ? input : input.toString();
      seenCalls.push({
        url,
        xff: headers.get("x-forwarded-for"),
        originHeader: headers.get("origin"),
      });

      if (url.includes("jp-insight:3000")) {
        throw new TypeError("fetch failed: ECONNREFUSED");
      }

      return new Response(
        JSON.stringify({ error: "Terlalu banyak pertanyaan." }),
        {
          status: 429,
          headers: {
            "content-type": "application/json",
            "retry-after": "42",
          },
        },
      );
    };

    const req = new Request("http://43.133.144.81:3000/api/widget-chat", {
      method: "POST",
      headers: {
        host: "43.133.144.81:3000",
        origin: "http://43.133.144.81:3000",
        "x-forwarded-for": "198.51.100.88",
        "content-type": "application/json",
      },
      body: JSON.stringify({ question: "Apa syarat naskah?" }),
    });

    const res = await forwardWidgetChatRequest(req, {
      fetchImpl: mockFetch,
      targets: [
        "http://jp-insight:3000/api/widget/chat",
        "http://43.133.144.81:3001/api/widget/chat",
      ],
    });

    assert.equal(res.status, 429);
    assert.equal(res.headers.get("retry-after"), "42");
    const json = (await res.json()) as { error?: string };
    assert.equal(json.error, "Terlalu banyak pertanyaan.");
    assert.equal(seenCalls.length, 2);
    assert.equal(seenCalls[1]?.xff, "198.51.100.88");
    assert.equal(seenCalls[1]?.originHeader, null);
  });

  it("returns 502 JSON when every upstream target is unreachable", async () => {
    const failingFetch: typeof fetch = async () => {
      throw new TypeError("network down");
    };

    const req = new Request("http://43.133.144.81:3000/api/widget-chat", {
      method: "POST",
      headers: {
        host: "43.133.144.81:3000",
        origin: "http://43.133.144.81:3000",
        "content-type": "application/json",
      },
      body: JSON.stringify({ question: "Tes koneksi" }),
    });

    const res = await forwardWidgetChatRequest(req, {
      fetchImpl: failingFetch,
      targets: ["http://jp-insight:3000/api/widget/chat"],
    });
    assert.equal(res.status, 502);
    const body = (await res.json()) as { error?: string };
    assert.ok(body.error?.includes("JP-Insight"));
  });
});
