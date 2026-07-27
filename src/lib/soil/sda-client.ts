/**
 * Vineyard Intelligence P4 — the SDA HTTP client. Server-side only by usage (only the orchestrator +
 * verify script import it); dependency-injected `fetchImpl` keeps it deterministic under recorded
 * fixtures (tests NEVER call live NRCS).
 *
 * Fail-soft (design §Operational): every failure returns a typed fault the orchestrator maps to
 * "keep the last snapshot, surface a refresh failure" — nothing here throws on a bad response.
 *  - timeout: `AbortSignal.timeout` fired (no SLA on SDA).
 *  - unreachable: the fetch itself threw (DNS/TLS/network/redirect).
 *  - bad_body: non-200, or a non-JSON body. Council C7: SDA errors return an XML/HTML body at 200/4xx/5xx,
 *    so we gate on content-type BEFORE `.json()` — a raw parse there would crash instead of failing soft.
 */
import { SDA_TIMEOUT_MS, SDA_URL, isAllowedSdaUrl } from "./sda-config";
import { parseSdaTable, type SdaTable } from "./parse-sda-core";

export type SdaFault = "timeout" | "unreachable" | "bad_body";
export type SdaResult = { ok: true; table: SdaTable } | { ok: false; fault: SdaFault; detail?: string };

export type SdaFetch = (url: string, init: RequestInit) => Promise<Response>;

export type SdaClient = { post(query: string): Promise<SdaResult> };

export function createSdaClient(deps?: { fetchImpl?: SdaFetch; timeoutMs?: number }): SdaClient {
  const fetchImpl = deps?.fetchImpl ?? ((url, init) => fetch(url, init));
  const timeoutMs = deps?.timeoutMs ?? SDA_TIMEOUT_MS;

  return {
    async post(query: string): Promise<SdaResult> {
      // Belt-and-suspenders: the URL is a constant, but assert it before egress anyway.
      if (!isAllowedSdaUrl(SDA_URL)) return { ok: false, fault: "unreachable", detail: "SDA_URL failed allowlist" };

      let res: Response;
      try {
        res = await fetchImpl(SDA_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ format: "JSON+COLUMNNAME", query }),
          redirect: "error", // never follow a redirect to another host (anti-SSRF)
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (e) {
        const name = (e as { name?: string })?.name;
        if (name === "TimeoutError" || name === "AbortError") return { ok: false, fault: "timeout" };
        return { ok: false, fault: "unreachable", detail: (e as Error)?.message };
      }

      const contentType = res.headers.get("content-type") ?? "";
      if (!res.ok || !contentType.includes("application/json")) {
        return { ok: false, fault: "bad_body", detail: `status=${res.status} content-type=${contentType.split(";")[0]}` };
      }

      try {
        const table = parseSdaTable(await res.json());
        return { ok: true, table };
      } catch (e) {
        return { ok: false, fault: "bad_body", detail: (e as Error)?.message };
      }
    },
  };
}
