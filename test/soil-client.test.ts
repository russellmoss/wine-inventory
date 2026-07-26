import { describe, it, expect } from "vitest";
import { createSdaClient, type SdaFetch } from "@/lib/soil/sda-client";
import { isAllowedSdaUrl, SDA_URL } from "@/lib/soil/sda-config";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });

describe("sda-client — recorded fixtures only, fail-soft on every error", () => {
  it("parses a JSON Table into a typed table (happy path)", async () => {
    const fetchImpl: SdaFetch = async () => jsonResponse({ Table: [["mukey", "muname"], ["1407835", "Mardin"]] });
    const r = await createSdaClient({ fetchImpl }).post("SELECT 1");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.table.cols).toEqual(["mukey", "muname"]);
      expect(r.table.rows[0]).toEqual(["1407835", "Mardin"]);
    }
  });

  it("timeout -> fault 'timeout' (last snapshot preserved by the caller)", async () => {
    const fetchImpl: SdaFetch = async () => {
      const e = new Error("timed out");
      e.name = "TimeoutError";
      throw e;
    };
    const r = await createSdaClient({ fetchImpl }).post("SELECT 1");
    expect(r).toEqual({ ok: false, fault: "timeout" });
  });

  it("network throw -> fault 'unreachable'", async () => {
    const fetchImpl: SdaFetch = async () => {
      throw new Error("ECONNRESET");
    };
    const r = await createSdaClient({ fetchImpl }).post("SELECT 1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fault).toBe("unreachable");
  });

  it("[C7] a 503 HTML/XML body degrades to 'bad_body', never a JSON.parse crash", async () => {
    const xml = `<?xml version='1.0'?><ServiceExceptionReport><ServiceException>Invalid query</ServiceException></ServiceExceptionReport>`;
    const fetchImpl: SdaFetch = async () => new Response(xml, { status: 400, headers: { "content-type": "text/xml" } });
    const r = await createSdaClient({ fetchImpl }).post("SELECT bad");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fault).toBe("bad_body");
  });

  it("even a 200 with a non-JSON content-type is 'bad_body' (gate before .json())", async () => {
    const fetchImpl: SdaFetch = async () => new Response("<html>oops</html>", { status: 200, headers: { "content-type": "text/html" } });
    const r = await createSdaClient({ fetchImpl }).post("SELECT 1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fault).toBe("bad_body");
  });

  it("[allowlist] only the exact SDA https host is allowed", () => {
    expect(isAllowedSdaUrl(SDA_URL)).toBe(true);
    expect(isAllowedSdaUrl("https://evil.example.com/Tabular/post.rest")).toBe(false);
    expect(isAllowedSdaUrl("http://sdmdataaccess.nrcs.usda.gov/Tabular/post.rest")).toBe(false); // not https
  });
});
