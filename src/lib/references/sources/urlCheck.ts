import { lookup } from "node:dns/promises";

/**
 * Liveness check for a URL cited in a manuscript.
 *
 * Two things make this harder than it looks.
 *
 * First, security. The URL is attacker-controlled in the ordinary case: anyone
 * who can submit a manuscript chooses it, and the request is issued by the
 * server, from inside the deployment's own network. Left unguarded that is a
 * server-side request forgery primitive pointed at cloud metadata endpoints
 * and internal services. So the scheme is restricted to HTTP(S), the hostname
 * is resolved and every resulting address checked against the private and
 * link-local ranges before anything is sent, and redirects are followed
 * manually so each hop is validated too rather than trusted because the first
 * one was fine.
 *
 * Second, honesty. A great many sites answer an automated request with 403 or
 * 405 while serving browsers perfectly well. Reporting those as dead links
 * would fill a reviewer's screen with false accusations, so only an explicit
 * 404/410 or a failure to resolve counts as dead; anything else is returned as
 * indeterminate and shown as such.
 */

export type UrlStatus =
  /** Responded in a way that shows the resource is served. */
  | "alive"
  /** The server or DNS says this resource is not there. */
  | "dead"
  /** Reachable but refused to say — bot blocking, auth wall, timeout. */
  | "indeterminate"
  /** Refused locally: not HTTP(S), or resolves to a non-public address. */
  | "blocked";

export interface UrlCheckResult {
  status: UrlStatus;
  httpStatus: number | null;
  reason: string;
}

const REQUEST_TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 3;

function ipv4IsPublic(address: string): boolean {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((o) => !Number.isInteger(o) || o < 0 || o > 255)) {
    return false;
  }
  const [a, b] = octets;

  if (a === 0 || a === 127) return false; // this host, loopback
  if (a === 10) return false; // private
  if (a === 172 && b >= 16 && b <= 31) return false; // private
  if (a === 192 && b === 168) return false; // private
  if (a === 169 && b === 254) return false; // link-local, cloud metadata
  if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
  if (a === 192 && b === 0) return false; // protocol assignments
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a >= 224) return false; // multicast and reserved
  return true;
}

function ipv6IsPublic(address: string): boolean {
  const value = address.toLowerCase().split("%")[0];

  if (value === "::" || value === "::1") return false;
  // IPv4-mapped (::ffff:10.0.0.1) and IPv4-compatible forms are judged as IPv4.
  const mapped = value.match(/^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return ipv4IsPublic(mapped[1]);

  if (/^f[cd]/.test(value)) return false; // unique-local fc00::/7
  if (/^fe[89ab]/.test(value)) return false; // link-local fe80::/10
  if (/^ff/.test(value)) return false; // multicast
  return true;
}

/**
 * Resolves the hostname and requires every address it answers with to be
 * public. Checking all of them, not just the first, denies a host that mixes
 * one routable address with an internal one.
 *
 * The hostname is resolved again by the network stack when the request is
 * made, so a server that changes its answer in between could still slip
 * through (DNS rebinding). Closing that completely needs connection-level
 * pinning, which fetch does not expose; what is left exposed is a single
 * unauthenticated GET whose body is never returned to the caller, only its
 * status code.
 */
async function hostIsPublic(hostname: string): Promise<boolean> {
  const bare = hostname.replace(/^\[|\]$/g, "");

  if (/^\d+\.\d+\.\d+\.\d+$/.test(bare)) return ipv4IsPublic(bare);
  if (bare.includes(":")) return ipv6IsPublic(bare);

  const lowered = bare.toLowerCase();
  if (
    lowered === "localhost" ||
    lowered.endsWith(".localhost") ||
    lowered.endsWith(".local") ||
    lowered.endsWith(".internal") ||
    lowered.endsWith(".test")
  ) {
    return false;
  }

  try {
    const addresses = await lookup(bare, { all: true, verbatim: true });
    if (addresses.length === 0) return false;
    return addresses.every(({ address, family }) =>
      family === 4 ? ipv4IsPublic(address) : ipv6IsPublic(address),
    );
  } catch {
    // Does not resolve. Treated as not-public so nothing is sent; the caller
    // reports it as a dead link, which is what an unresolvable host is.
    return false;
  }
}

function requestOnce(url: string, method: "HEAD" | "GET"): Promise<Response> {
  return fetch(url, {
    method,
    redirect: "manual",
    headers: {
      // Identifies the checker honestly. No attempt is made to impersonate a
      // browser to get around bot blocking — a block is reported as unknown.
      "User-Agent": "MQCAssistant/1.0 (reference link check)",
      Accept: "*/*",
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

export async function checkUrl(rawUrl: string): Promise<UrlCheckResult> {
  let current: URL;
  try {
    current = new URL(rawUrl);
  } catch {
    return { status: "blocked", httpStatus: null, reason: "URL tidak dapat dibaca." };
  }

  if (current.protocol !== "http:" && current.protocol !== "https:") {
    return {
      status: "blocked",
      httpStatus: null,
      reason: `Skema ${current.protocol} tidak diperiksa.`,
    };
  }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!(await hostIsPublic(current.hostname))) {
      // A public hostname that will not resolve and a deliberately internal
      // address are both refused here, but they mean different things.
      const isNamedHost = !/^[\d.]+$/.test(current.hostname) && !current.hostname.includes(":");
      return isNamedHost
        ? {
            status: "dead",
            httpStatus: null,
            reason: `Nama domain ${current.hostname} tidak dapat diresolusi.`,
          }
        : {
            status: "blocked",
            httpStatus: null,
            reason: "Alamat bukan alamat publik, tidak diperiksa.",
          };
    }

    let response: Response;
    try {
      response = await requestOnce(current.toString(), hop === 0 ? "HEAD" : "GET");
    } catch (err) {
      const message = err instanceof Error ? err.message : "gagal";
      return {
        status: "indeterminate",
        httpStatus: null,
        reason: `Tidak dapat dihubungi (${message}).`,
      };
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        return {
          status: "indeterminate",
          httpStatus: response.status,
          reason: `Pengalihan ${response.status} tanpa alamat tujuan.`,
        };
      }
      try {
        current = new URL(location, current);
      } catch {
        return {
          status: "indeterminate",
          httpStatus: response.status,
          reason: "Alamat pengalihan tidak dapat dibaca.",
        };
      }
      if (current.protocol !== "http:" && current.protocol !== "https:") {
        return {
          status: "blocked",
          httpStatus: response.status,
          reason: "Pengalihan menuju skema yang tidak diperiksa.",
        };
      }
      continue;
    }

    if (response.status === 404 || response.status === 410) {
      return {
        status: "dead",
        httpStatus: response.status,
        reason: `Server menjawab ${response.status}.`,
      };
    }

    if (response.ok) {
      return {
        status: "alive",
        httpStatus: response.status,
        reason: `Dapat diakses (${response.status}).`,
      };
    }

    // 401/403/405/429/5xx and friends: the server is there but will not say
    // whether the document is. A HEAD-hostile server gets one more try as GET.
    if (hop === 0 && (response.status === 403 || response.status === 405 || response.status === 501)) {
      continue;
    }

    return {
      status: "indeterminate",
      httpStatus: response.status,
      reason: `Server menjawab ${response.status}, status tautan tidak dapat dipastikan.`,
    };
  }

  return {
    status: "indeterminate",
    httpStatus: null,
    reason: `Lebih dari ${MAX_REDIRECTS} pengalihan.`,
  };
}
