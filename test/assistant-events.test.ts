import { describe, it, expect } from "vitest";
import { isSafeInternalPath, parseEvent, asProposal, asNavigation } from "@/lib/assistant/assistant-events";

describe("isSafeInternalPath", () => {
  it("accepts same-origin relative paths (incl. query strings)", () => {
    for (const p of ["/", "/lots/abc", "/work-orders/templates/t1", "/vineyards/harvest?vineyard=v9"]) {
      expect(isSafeInternalPath(p), p).toBe(true);
    }
  });

  it("rejects the classic injection / off-site abuse cases", () => {
    for (const p of [
      "//evil.com", // protocol-relative
      "http://evil.com", // scheme
      "https://evil.com",
      "javascript:alert(1)", // scheme, no leading slash
      "/a\\b", // backslash trick
      "data:text/html,x",
      "mailto:x@y.z",
      "relative/path", // no leading slash
      "",
      42 as unknown as string,
      null as unknown as string,
      "/" + String.fromCharCode(9) + "/evil.com", // tab -> URL parser strips it into protocol-relative
      "/a" + String.fromCharCode(10) + "b", // newline
      "/a" + String.fromCharCode(13) + "b", // CR
    ]) {
      expect(isSafeInternalPath(p), JSON.stringify(p)).toBe(false);
    }
  });
});

describe("parseEvent", () => {
  it("parses a valid event line", () => {
    expect(parseEvent('{"type":"text","text":"hi"}')).toEqual({ type: "text", text: "hi" });
  });
  it("returns null for blank/garbled/typeless lines", () => {
    expect(parseEvent("")).toBeNull();
    expect(parseEvent("{not json")).toBeNull();
    expect(parseEvent('{"foo":1}')).toBeNull();
  });
});

describe("asNavigation", () => {
  it("accepts a navigate payload with a safe path", () => {
    expect(asNavigation({ navigate: { path: "/lots/x", label: "Lot X", auto: true } })).toEqual({
      path: "/lots/x",
      label: "Lot X",
      auto: true,
    });
  });
  it("defaults auto to false", () => {
    expect(asNavigation({ navigate: { path: "/lots/x", label: "Lot X" } })?.auto).toBe(false);
  });
  it("REFUSES an unsafe path (server-side gate)", () => {
    expect(asNavigation({ navigate: { path: "//evil.com", label: "x", auto: true } })).toBeNull();
    expect(asNavigation({ navigate: { path: "https://evil.com", label: "x" } })).toBeNull();
  });
  it("ignores non-navigation shapes", () => {
    expect(asNavigation({ message: "hi" })).toBeNull();
    expect(asNavigation(null)).toBeNull();
  });
});

describe("asProposal", () => {
  it("detects a write proposal shape", () => {
    expect(asProposal({ needsConfirmation: true, preview: "p", token: "t" })).not.toBeNull();
    expect(asProposal({ needsConfirmation: false, preview: "p", token: "t" })).toBeNull();
    expect(asProposal({ preview: "p" })).toBeNull();
  });
});
