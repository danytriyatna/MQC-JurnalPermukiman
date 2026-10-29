/**
 * Shared HTTP plumbing for the bibliographic lookups.
 *
 * Every source here is a free, keyless public API. None of them is sent
 * anything about the person running the check: the User-Agent identifies the
 * application only, and a contact address — which Crossref asks for in order
 * to place a caller in its faster "polite" pool — is read from an environment
 * variable the operator sets deliberately, never from the signed-in user's
 * account.
 */

const REQUEST_TIMEOUT_MS = 8000;

function userAgent(): string {
  const contact = process.env.REFERENCE_CHECK_CONTACT_EMAIL?.trim();
  return `MQCAssistant/1.0 (reference verification)${contact ? ` mailto:${contact}` : ""}`;
}

export class LookupError extends Error {}

/**
 * GETs JSON, returning null for "the registry does not have this" (404/410)
 * and throwing for everything else.
 *
 * The distinction is the whole point: a 404 from a DOI lookup is evidence
 * about the reference, while a timeout or a rate-limit is evidence only about
 * the network, and the two must not reach the verdict logic looking alike.
 */
export async function getJson<T>(url: string): Promise<T | null> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": userAgent() },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    throw new LookupError(err instanceof Error ? err.message : "permintaan gagal");
  }

  if (response.status === 404 || response.status === 410) return null;

  if (!response.ok) {
    throw new LookupError(`HTTP ${response.status}`);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new LookupError("balasan bukan JSON");
  }
}
