import { describe, it, expect, beforeAll } from "vitest";
import { asChoice } from "@/lib/assistant/assistant-events";
import { resolveOneOrChoice } from "@/lib/assistant/tools/resolve";
import { signProposal, signResume, verifyProposal } from "@/lib/assistant/confirm";

// The clickable-disambiguation picker (2026-07-05 live-QA): text disambiguation dead-loops when candidate
// names collide, so an ambiguous resolve returns a CHOICE the client renders as buttons. Each tap carries
// a signed `resume` token that re-runs the tool pinned by id (DETERMINISTIC — no model round-trip).

describe("asChoice — tool-output guard", () => {
  it("accepts a well-formed choice (resume and/or send), keeps label/sublabel", () => {
    const out = asChoice({
      needsChoice: true,
      prompt: 'Which "KMBS"?',
      options: [
        { label: "KMBS A", sublabel: "SULFITE · ref abc123", resume: "tok-a" },
        { label: "KMBS B", send: "Add 30 g/hL #id-b to Tank T3" }, // legacy fallback still allowed
      ],
    });
    expect(out).not.toBeNull();
    expect(out!.prompt).toBe('Which "KMBS"?');
    expect(out!.options).toHaveLength(2);
    expect(out!.options[0].resume).toBe("tok-a");
    expect(out!.options[0].sublabel).toBe("SULFITE · ref abc123");
    expect(out!.options[1].send).toBe("Add 30 g/hL #id-b to Tank T3");
    expect(out!.options[1].sublabel).toBeUndefined();
  });

  it("rejects non-choice / malformed shapes", () => {
    expect(asChoice(null)).toBeNull();
    expect(asChoice({ needsConfirmation: true, preview: "x", token: "y" })).toBeNull(); // a proposal, not a choice
    expect(asChoice({ needsChoice: true, prompt: "", options: [{ label: "a", resume: "t" }] })).toBeNull(); // empty prompt
    expect(asChoice({ needsChoice: true, prompt: "p", options: [] })).toBeNull(); // no options
    expect(asChoice({ needsChoice: true, prompt: "p", options: [{ label: "a" }] })).toBeNull(); // option does nothing (no resume/send)
  });

  it("caps runaway option lists (a picker is not a data dump)", () => {
    const options = Array.from({ length: 40 }, (_, i) => ({ label: `m${i}`, resume: `t${i}` }));
    expect(asChoice({ needsChoice: true, prompt: "p", options })!.options).toHaveLength(25);
  });
});

describe("resolveOneOrChoice — resolver side", () => {
  const opts = {
    prompt: "Which one?",
    describe: (r: { id: string; name: string }) => r.name,
    detail: (r: { id: string; name: string }) => `ref ${r.id}`,
    resume: (r: { id: string; name: string }) => `tok-${r.id}`,
    noneMsg: "nothing matches",
  };

  it("throws on zero (nothing to pick)", () => {
    expect(() => resolveOneOrChoice([], opts)).toThrow("nothing matches");
  });

  it("returns the single row on exactly one", () => {
    const res = resolveOneOrChoice([{ id: "1", name: "A" }], opts);
    expect(res.kind).toBe("one");
    if (res.kind === "one") expect(res.row.id).toBe("1");
  });

  it("returns a choice on more than one — resume-pinned + distinguishing sublabel", () => {
    const res = resolveOneOrChoice([{ id: "1", name: "Dup" }, { id: "2", name: "Dup" }], opts);
    expect(res.kind).toBe("choice");
    if (res.kind === "choice") {
      expect(res.choice.options.map((o) => o.resume)).toEqual(["tok-1", "tok-2"]);
      expect(res.choice.options.map((o) => o.sublabel)).toEqual(["ref 1", "ref 2"]);
    }
  });
});

describe("resume vs commit token discriminator", () => {
  beforeAll(() => {
    process.env.BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET || "test-secret-for-choice-spec";
  });

  it("signResume stamps kind=resume; signProposal stamps kind=commit — so they can't cross paths", () => {
    expect(verifyProposal(signResume("add_addition", { vessel: "T3", material: "#abc" })).kind).toBe("resume");
    expect(verifyProposal(signProposal("add_addition", { vesselId: "x" })).kind).toBe("commit");
  });

  it("a resume token round-trips its pinned input", () => {
    const payload = verifyProposal(signResume("add_addition", { vessel: "T3", material: "#abc", amount: 30, unit: "g/hL" }));
    expect(payload.tool).toBe("add_addition");
    expect(payload.args).toMatchObject({ material: "#abc", amount: 30, unit: "g/hL" });
  });
});
