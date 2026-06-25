import { describe, it, expect, beforeAll } from "vitest";
import { signProposal, verifyProposal } from "@/lib/assistant/confirm";

beforeAll(() => {
  process.env.BETTER_AUTH_SECRET = "test-secret-aaaaaaaaaaaaaaaaaaaa";
});

describe("assistant confirm tokens", () => {
  it("round-trips a signed proposal", () => {
    const token = signProposal("log_brix", { blockId: "b1", brixValue: 22.4 });
    const payload = verifyProposal(token);
    expect(payload.tool).toBe("log_brix");
    expect(payload.args).toEqual({ blockId: "b1", brixValue: 22.4 });
    expect(typeof payload.nonce).toBe("string");
    expect(payload.nonce.length).toBeGreaterThan(0);
  });

  it("rejects an expired token", () => {
    const token = signProposal("log_brix", { blockId: "b1" }, -1000); // already expired
    expect(() => verifyProposal(token)).toThrow(/expired/i);
  });

  it("rejects a tampered payload", () => {
    const token = signProposal("adjust_inventory", { itemId: "w1", delta: -6 });
    const dot = token.lastIndexOf(".");
    const body = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    // Flip a character in the body so it no longer matches the signature.
    const flipped = (body[0] === "A" ? "B" : "A") + body.slice(1);
    expect(() => verifyProposal(`${flipped}.${sig}`)).toThrow(/invalid|corrupt/i);
  });

  it("rejects a token signed with a different secret", () => {
    const token = signProposal("log_brix", { blockId: "b1" });
    process.env.BETTER_AUTH_SECRET = "a-totally-different-secret-bbbbbbbb";
    try {
      expect(() => verifyProposal(token)).toThrow(/invalid/i);
    } finally {
      process.env.BETTER_AUTH_SECRET = "test-secret-aaaaaaaaaaaaaaaaaaaa";
    }
  });

  it("rejects a malformed token", () => {
    expect(() => verifyProposal("not-a-token")).toThrow();
  });
});
