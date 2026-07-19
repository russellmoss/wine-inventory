import { describe, it, expect, beforeAll, vi } from "vitest";
import { signProposal, verifyProposal } from "@/lib/assistant/confirm";

// The confirm route reads the session through the DAL (which needs a request scope). Stub it with a
// fully-authorized user so the assertions below exercise the TOKEN guard, not the auth guard.
vi.mock("@/lib/dal", () => ({
  getCurrentUser: async () => ({ id: "u1", email: "demo@demo.com", banned: false, mustChangePassword: false }),
}));

beforeAll(() => {
  process.env.BETTER_AUTH_SECRET = "test-secret-aaaaaaaaaaaaaaaaaaaa";
});

// Loaded at module scope, not inside the test: the confirm route pulls in every committer (and Prisma
// through them), which is slow enough under a full parallel suite run to blow a per-test timeout.
const { POST } = await import("@/app/api/assistant/confirm/route");

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

// Plan 081 U4 — the Draft-cannot-commit invariant, proven at the COMMIT boundary rather than in the UI.
describe("the confirm route refuses a tokenless (draft) commit", () => {
  it("rejects the exact payloads a Draft card could produce", async () => {
    const post = (body: unknown) =>
      POST(new Request("http://localhost/api/assistant/confirm", { method: "POST", body: JSON.stringify(body) }));

    // A Draft has no `token` key at all; a naive client would post undefined/null/"".
    for (const body of [{}, { token: undefined }, { token: null }, { token: "" }]) {
      const res = await post(body);
      expect(res.status).toBe(400);
      const json = (await res.json()) as { ok?: boolean; error?: string };
      expect(json.ok).not.toBe(true);
      expect(json.error).toMatch(/confirmation token/i);
    }
  });

  it("has no way to mint a token for a draft: signProposal is the only minter and it always signs a commit", () => {
    // `signProposal` is reached ONLY on the ready branch of a write tool. There is no draft overload —
    // if a future edit calls it for a draft, that draft becomes committable, which is the one genuinely
    // security-relevant failure mode of this plan. Pinning the shape here makes such a change visible.
    const payload = verifyProposal(signProposal("propose_work_order", { taskBuilds: [] }));
    expect(payload.kind).toBe("commit");
  });
});
