import { describe, it, expect } from "vitest";
import {
  isSafeInternalPath,
  parseEvent,
  asProposal,
  isDraftProposal,
  asNavigation,
  splitNdjsonLines,
  ASSISTANT_EVENT_TYPES,
} from "@/lib/assistant/assistant-events";

// Plan 081 U2: a line is only complete once its "\n" arrives. Both stream consumers used to
// `break` on stream-end and discard whatever the buffer still held, so a truncated final chunk
// silently dropped its event — and that event can be a `proposal`, i.e. a card the user never sees.
describe("splitNdjsonLines (NDJSON framing)", () => {
  it("returns complete lines and holds the unterminated remainder", () => {
    expect(splitNdjsonLines('{"type":"text"}\n{"type":"done"}\n')).toEqual({
      lines: ['{"type":"text"}', '{"type":"done"}'],
      rest: "",
    });
  });

  it("keeps a partial trailing line in rest rather than emitting it", () => {
    const { lines, rest } = splitNdjsonLines('{"type":"text"}\n{"type":"propo');
    expect(lines).toEqual(['{"type":"text"}']);
    expect(rest).toBe('{"type":"propo');
  });

  it("survives a chunk boundary mid-line across successive calls", () => {
    let buffer = "";
    const seen: string[] = [];
    for (const chunk of ['{"type":"pro', 'posal","token":"t"}\n{"type":"do', 'ne"}\n']) {
      buffer += chunk;
      const { lines, rest } = splitNdjsonLines(buffer);
      buffer = rest;
      seen.push(...lines);
    }
    expect(seen).toEqual(['{"type":"proposal","token":"t"}', '{"type":"done"}']);
    expect(buffer).toBe("");
  });

  it("leaves a final newline-less line recoverable by the caller's end-of-stream flush", () => {
    const { lines, rest } = splitNdjsonLines('{"type":"proposal","token":"t"}');
    expect(lines).toEqual([]);
    expect(rest).toBe('{"type":"proposal","token":"t"}'); // caller MUST dispatch this on `done`
    expect(parseEvent(rest)).toMatchObject({ type: "proposal" }); // ...and it parses fine
  });

  it("does not emit an empty line for a trailing newline", () => {
    const { lines, rest } = splitNdjsonLines('{"type":"done"}\n');
    expect(lines).toEqual(['{"type":"done"}']);
    expect(rest).toBe("");
  });
});

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

  // Plan 081 U8 (council S1): parseEvent used to cast ANY object with a string `type`, so an event
  // neither consumer handled reached them, matched no branch, and vanished. Reject at the parser.
  it("rejects an unknown event type instead of casting it through", () => {
    expect(parseEvent('{"type":"decline","reason":"x"}')).toBeNull();
    expect(parseEvent('{"type":"","text":"x"}')).toBeNull();
    expect(parseEvent('{"type":123}')).toBeNull();
  });

  it("accepts every declared event type", () => {
    for (const type of ASSISTANT_EVENT_TYPES) {
      expect(parseEvent(JSON.stringify({ type })), type).not.toBeNull();
    }
  });

  it("accepts a DRAFT proposal line (no token on the wire)", () => {
    expect(parseEvent('{"type":"proposal","tool":"propose_work_order","preview":"p","draft":true}')).toMatchObject({
      type: "proposal",
      draft: true,
    });
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

  // ── Plan 081 U4: the Draft proposal ──────────────────────────────────────────────────────────
  it("accepts a DRAFT proposal that has no token", () => {
    const p = asProposal({ needsConfirmation: true, draft: true, preview: "Draft work order", details: { a: 1 } });
    expect(p).not.toBeNull();
    expect(p!.preview).toBe("Draft work order");
    expect(p!.details).toEqual({ a: 1 });
  });

  it("still REQUIRES a token when the proposal is not a draft", () => {
    expect(asProposal({ needsConfirmation: true, preview: "p" })).toBeNull();
    expect(asProposal({ needsConfirmation: true, preview: "p", token: "" })).toBeNull();
    expect(asProposal({ needsConfirmation: true, draft: false, preview: "p" })).toBeNull();
  });

  it("rejects a proposal with no preview, draft or not", () => {
    expect(asProposal({ needsConfirmation: true, draft: true })).toBeNull();
    expect(asProposal({ needsConfirmation: true, draft: true, preview: "" })).toBeNull();
  });

  // THE security invariant of plan 081. A draft is not committable BY CONSTRUCTION, not by UI politeness:
  // asProposal rebuilds the object, so a crafted `{draft:true, token:"…"}` cannot smuggle a token past it.
  it("STRIPS a token from a draft — a draft can never carry a commit token", () => {
    const p = asProposal({ needsConfirmation: true, draft: true, preview: "p", token: "forged-token" });
    expect(p).not.toBeNull();
    expect(isDraftProposal(p!)).toBe(true);
    expect((p as { token?: unknown }).token).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(p!, "token")).toBe(false);
    expect(JSON.stringify(p)).not.toContain("forged-token");
  });

  it("does not let extra tool-returned keys ride along into the emitted proposal", () => {
    const p = asProposal({ needsConfirmation: true, preview: "p", token: "t", sneaky: "x" }) as Record<string, unknown>;
    expect(Object.keys(p).sort()).toEqual(["needsConfirmation", "preview", "token"]);
  });
});

describe("isDraftProposal", () => {
  it("is the single discriminator between committable and not", () => {
    const ready = asProposal({ needsConfirmation: true, preview: "p", token: "t" })!;
    const draft = asProposal({ needsConfirmation: true, draft: true, preview: "p" })!;
    expect(isDraftProposal(ready)).toBe(false);
    expect(isDraftProposal(draft)).toBe(true);
    // The type narrowing is what callers rely on: only the ready branch has a token to mint against.
    if (!isDraftProposal(ready)) expect(typeof ready.token).toBe("string");
  });
});
