import { describe, it, expect } from "vitest";
import {
  createInteractionBuffer,
  describeElement,
  toSameOriginPath,
  MAX_INTERACTION_ENTRIES,
  MAX_NETWORK_ENTRIES,
  MAX_LABEL_CHARS,
} from "@/lib/observability/interaction-buffer";

/** Minimal element stand-in so these stay pure (no jsdom in this repo). */
const fakeEl = (tag: string, attrs: Record<string, string> = {}, text = "") => ({
  tagName: tag,
  getAttribute: (name: string) => attrs[name] ?? null,
  textContent: text,
});

describe("describeElement — masked mode must not leak customer text", () => {
  it("full fidelity keeps a short readable label", () => {
    const out = describeElement(fakeEl("BUTTON", {}, "  Transfer   stock  "), "full");
    expect(out.label).toBe("Transfer stock");
    expect(out.detail).toBe("button");
  });

  it("masked fidelity returns the ROLE ONLY — never the element text", () => {
    const out = describeElement(fakeEl("BUTTON", {}, "Delete Château Margaux 2019"), "masked");
    expect(out.label).toBeUndefined();
    expect(out.detail).toBe("button");
    expect(JSON.stringify(out)).not.toContain("Margaux");
  });

  it("prefers aria-label and includes role in detail", () => {
    const out = describeElement(fakeEl("DIV", { "aria-label": "Close dialog", role: "button" }), "full");
    expect(out.label).toBe("Close dialog");
    expect(out.detail).toBe("div[role=button]");
  });

  it("redacts secrets that end up in a label", () => {
    const out = describeElement(fakeEl("BUTTON", {}, "user demo@demowinery.test"), "full");
    expect(out.label).toContain("[redacted-email]");
    expect(out.label).not.toContain("demo@demowinery.test");
  });

  it("caps label length and tolerates a null element", () => {
    const out = describeElement(fakeEl("BUTTON", {}, "z".repeat(MAX_LABEL_CHARS + 50)), "full");
    expect(out.label!.length).toBe(MAX_LABEL_CHARS);
    expect(describeElement(null, "full")).toEqual({});
  });
});

describe("toSameOriginPath — drops query strings and cross-origin calls", () => {
  const origin = "https://app.example.com";

  it("keeps the path only, dropping the query string", () => {
    expect(toSameOriginPath(`${origin}/api/stock/move?lotId=abc&q=secret`, origin)).toBe("/api/stock/move");
  });

  it("resolves relative urls against the origin", () => {
    expect(toSameOriginPath("/api/feedback/tickets", origin)).toBe("/api/feedback/tickets");
  });

  it("returns undefined for cross-origin requests", () => {
    expect(toSameOriginPath("https://evil.example.com/collect", origin)).toBeUndefined();
  });

  it("returns undefined for an unparseable url", () => {
    expect(toSameOriginPath("::::", "")).toBeUndefined();
  });
});

describe("createInteractionBuffer — bounded ring", () => {
  const now = () => 42;

  it("records interactions and network metadata, and drains both", () => {
    const buf = createInteractionBuffer({ now });
    buf.recordInteraction("click", { label: "Transfer", detail: "button" });
    buf.recordNetwork({ method: "post", path: "/api/x", status: 500, durationMs: 12.7 });
    const out = buf.drain();
    expect(out.interactionTrail).toEqual([{ type: "click", ts: 42, label: "Transfer", detail: "button" }]);
    expect(out.networkTrail).toEqual([{ method: "post", path: "/api/x", ts: 42, status: 500, durationMs: 13 }]);
  });

  it("never stores a body field", () => {
    const buf = createInteractionBuffer({ now });
    buf.recordNetwork({ method: "POST", path: "/api/x", status: 200 });
    expect(JSON.stringify(buf.drain())).not.toMatch(/body|payload|requestBody/i);
  });

  it("bounds the interaction ring to the cap (keeps newest)", () => {
    const buf = createInteractionBuffer({ now });
    for (let i = 0; i < MAX_INTERACTION_ENTRIES + 25; i++) buf.recordInteraction("click", { label: `c${i}` });
    const out = buf.drain().interactionTrail;
    expect(out).toHaveLength(MAX_INTERACTION_ENTRIES);
    expect(out[out.length - 1].label).toBe(`c${MAX_INTERACTION_ENTRIES + 24}`);
  });

  it("bounds the network ring to the cap", () => {
    const buf = createInteractionBuffer({ now });
    for (let i = 0; i < MAX_NETWORK_ENTRIES + 10; i++) buf.recordNetwork({ method: "GET", path: `/api/${i}` });
    expect(buf.drain().networkTrail).toHaveLength(MAX_NETWORK_ENTRIES);
  });

  it("ignores malformed records", () => {
    const buf = createInteractionBuffer({ now });
    buf.recordInteraction("");
    buf.recordNetwork({ method: "", path: "/api/x" });
    buf.recordNetwork({ method: "GET", path: "" });
    expect(buf.size()).toBe(0);
  });

  it("drain is non-destructive; clear empties it", () => {
    const buf = createInteractionBuffer({ now });
    buf.recordInteraction("route", { label: "/inventory" });
    expect(buf.drain().interactionTrail).toHaveLength(1);
    expect(buf.drain().interactionTrail).toHaveLength(1);
    buf.clear();
    expect(buf.drain().interactionTrail).toHaveLength(0);
  });
});
