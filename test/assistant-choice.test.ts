import { describe, it, expect } from "vitest";
import { asChoice } from "@/lib/assistant/assistant-events";
import { resolveOneOrChoice } from "@/lib/assistant/tools/resolve";

// The clickable-disambiguation picker (2026-07-05 live-QA): text disambiguation dead-loops when candidate
// names collide, so an ambiguous resolve returns a CHOICE the client renders as buttons; each tap pins the
// record by id via `send`. asChoice() is the run-loop guard; resolveOneOrChoice() is the resolver side.

describe("asChoice — tool-output guard", () => {
  it("accepts a well-formed choice and keeps label/sublabel/send", () => {
    const out = asChoice({
      needsChoice: true,
      prompt: 'Which "KMBS"?',
      options: [
        { label: "KMBS A", sublabel: "SULFITE · ref abc123", send: "Add 30 g/hL #id-a to Tank T3" },
        { label: "KMBS B", send: "Add 30 g/hL #id-b to Tank T3" },
      ],
    });
    expect(out).not.toBeNull();
    expect(out!.prompt).toBe('Which "KMBS"?');
    expect(out!.options).toHaveLength(2);
    expect(out!.options[0].sublabel).toBe("SULFITE · ref abc123");
    expect(out!.options[1].sublabel).toBeUndefined();
  });

  it("rejects non-choice / malformed shapes", () => {
    expect(asChoice(null)).toBeNull();
    expect(asChoice({ needsConfirmation: true, preview: "x", token: "y" })).toBeNull(); // a proposal, not a choice
    expect(asChoice({ needsChoice: true, prompt: "", options: [{ label: "a", send: "b" }] })).toBeNull(); // empty prompt
    expect(asChoice({ needsChoice: true, prompt: "p", options: [] })).toBeNull(); // no options
    expect(asChoice({ needsChoice: true, prompt: "p", options: [{ label: "a" }] })).toBeNull(); // option missing send
  });

  it("caps runaway option lists (a picker is not a data dump)", () => {
    const options = Array.from({ length: 40 }, (_, i) => ({ label: `m${i}`, send: `s${i}` }));
    expect(asChoice({ needsChoice: true, prompt: "p", options })!.options).toHaveLength(25);
  });
});

describe("resolveOneOrChoice — resolver side", () => {
  const opts = {
    prompt: "Which one?",
    describe: (r: { id: string; name: string }) => r.name,
    detail: (r: { id: string; name: string }) => `ref ${r.id}`,
    send: (r: { id: string; name: string }) => `use #${r.id}`,
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

  it("returns a choice on more than one, id-pinned in send + distinguishing sublabel", () => {
    const res = resolveOneOrChoice([{ id: "1", name: "Dup" }, { id: "2", name: "Dup" }], opts);
    expect(res.kind).toBe("choice");
    if (res.kind === "choice") {
      expect(res.choice.options.map((o) => o.send)).toEqual(["use #1", "use #2"]);
      expect(res.choice.options.map((o) => o.sublabel)).toEqual(["ref 1", "ref 2"]);
    }
  });
});
