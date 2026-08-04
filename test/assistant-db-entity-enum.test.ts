import { describe, it, expect } from "vitest";
import {
  allowedEntityNames,
  creatableEntityNames,
  editableEntityNames,
  deletableEntityNames,
  findableEntityNames,
  getEntity,
  isCreatable,
  isEditable,
} from "@/lib/assistant/entities";
import { dbFindTool } from "@/lib/assistant/tools/db-find";
import { dbCreateTool } from "@/lib/assistant/tools/db-create";
import { dbUpdateTool } from "@/lib/assistant/tools/db-update";
import { dbDeleteTool } from "@/lib/assistant/tools/db-delete";
import type { AssistantTool } from "@/lib/assistant/registry";

/**
 * Plan 107 Unit 4 — the `db_*` tools advertise a JSON-Schema `enum` for `entity` instead of a bare
 * string, so a wrong entity is UNREACHABLE rather than recoverable-after-a-failed-call.
 *
 * The assertion that matters is AGREEMENT IN BOTH DIRECTIONS between the advertised enum and the
 * predicate the tool's runtime guard actually applies. A test that only checked "an enum exists"
 * would be tautological: the enum could advertise an entity the guard rejects (the model commits to
 * a call that always fails) or omit one the guard accepts (a real capability made unreachable).
 * Both are silent failures, so both are asserted here over EVERY registered entity.
 */

function enumOf(tool: AssistantTool): string[] {
  const s = tool.inputSchema as { properties?: { entity?: { enum?: string[] } } };
  return s.properties?.entity?.enum ?? [];
}

const CASES: Array<{ tool: AssistantTool; names: () => string[]; label: string }> = [
  { tool: dbFindTool, names: findableEntityNames, label: "db_find" },
  { tool: dbCreateTool, names: creatableEntityNames, label: "db_create" },
  { tool: dbUpdateTool, names: editableEntityNames, label: "db_update" },
  { tool: dbDeleteTool, names: deletableEntityNames, label: "db_delete" },
];

describe("db_* entity enum", () => {
  it.each(CASES)("$label advertises an enum equal to its capability list", ({ tool, names }) => {
    const advertised = enumOf(tool);
    expect(advertised.length, `${tool.name} has no entity enum`).toBeGreaterThan(0);
    expect([...advertised].sort()).toEqual([...names()].sort());
  });

  it.each(CASES)("$label's enum has no duplicates", ({ tool }) => {
    const advertised = enumOf(tool);
    expect(new Set(advertised).size).toBe(advertised.length);
  });

  it.each(CASES)("$label's enum is a subset of the registry", ({ tool }) => {
    const all = new Set(allowedEntityNames());
    expect(enumOf(tool).filter((n) => !all.has(n))).toEqual([]);
  });

  // The both-directions check, entity by entity. This is what makes the test non-tautological.
  it("db_create's enum admits EXACTLY the entities isCreatable() accepts", () => {
    const advertised = new Set(enumOf(dbCreateTool));
    for (const name of allowedEntityNames()) {
      const entity = getEntity(name)!;
      expect(advertised.has(name), `isCreatable(${name})=${isCreatable(entity)} but enum has it=${advertised.has(name)}`).toBe(
        isCreatable(entity),
      );
    }
  });

  it("db_update's enum admits EXACTLY the entities isEditable() accepts", () => {
    const advertised = new Set(enumOf(dbUpdateTool));
    for (const name of allowedEntityNames()) {
      const entity = getEntity(name)!;
      expect(advertised.has(name), `isEditable(${name})=${isEditable(entity)} but enum has it=${advertised.has(name)}`).toBe(
        isEditable(entity),
      );
    }
  });

  // Codex DQ-6: `getEntity` is case-insensitive, a JSON-Schema enum is not. That asymmetry is
  // DELIBERATE — the enum carries canonical spellings so the model is steered to them, while the
  // runtime fallback keeps an out-of-enum lowercase guess working instead of dead-ending. Pin both
  // halves, so neither is "tidied" away later.
  it("enum values are canonical, and the runtime resolver still accepts other casings", () => {
    for (const name of findableEntityNames()) {
      expect(getEntity(name)?.name).toBe(name);
      expect(getEntity(name.toLowerCase())?.name).toBe(name);
      expect(getEntity(name.toUpperCase())?.name).toBe(name);
    }
  });

  // ── The predicates themselves ──────────────────────────────────────────────
  // TODAY every registered entity satisfies every capability, so the four enums are IDENTICAL and
  // the agreement tests above cannot fail no matter how the predicates are written. That makes them
  // necessary but not sufficient. These exercise the predicate logic directly over synthetic configs,
  // so a mis-written predicate fails HERE even while the registry stays uniform. (The alternative —
  // asserting against a real non-creatable entity — silently no-ops until one exists, which is the
  // "green CI proved nothing" failure this repo has been bitten by before.)
  const base = { create: () => {}, buildCreate: () => {}, creatable: [], update: () => {}, current: () => {}, editable: [] };
  it.each([
    ["missing create", { ...base, create: undefined }],
    ["missing buildCreate", { ...base, buildCreate: undefined }],
    ["missing creatable spec", { ...base, creatable: undefined }],
  ])("isCreatable() rejects an entity %s", (_label, cfg) => {
    expect(isCreatable(cfg as never)).toBe(false);
  });
  it("isCreatable() accepts a fully-equipped entity", () => {
    expect(isCreatable(base as never)).toBe(true);
  });

  it.each([
    ["missing update", { ...base, update: undefined }],
    ["missing current", { ...base, current: undefined }],
    ["missing editable spec", { ...base, editable: undefined }],
  ])("isEditable() rejects an entity %s", (_label, cfg) => {
    expect(isEditable(cfg as never)).toBe(false);
  });
  it("isEditable() accepts a fully-equipped entity", () => {
    expect(isEditable(base as never)).toBe(true);
  });

  // A tripwire, not an assertion about correctness. The moment the registry stops being uniform,
  // the both-directions tests above start doing real work and the error-message wording starts
  // mattering — this test failing is the signal to go re-read them.
  it("TRIPWIRE: every registered entity currently satisfies every capability", () => {
    const n = allowedEntityNames().length;
    expect(
      { creatable: creatableEntityNames().length, editable: editableEntityNames().length, deletable: deletableEntityNames().length },
      "registry is no longer uniform — the db_* enums now genuinely differ; re-read the agreement tests and the guard error wording",
    ).toEqual({ creatable: n, editable: n, deletable: n });
  });

  // Codex S-5: the guard messages used to interpolate allowedEntityNames(). That is correct ONLY
  // while the registry is uniform — a latent wrong-advice bug, not a live one. Pin that each message
  // is now derived from its own capability list so it stays right when uniformity ends.
  it("guard messages are derived from the capability list, not the full registry", async () => {
    const ctx = { user: { role: "admin", vineyardIds: [] } } as never;
    await expect(dbCreateTool.run(ctx, { entity: "NoSuchEntity", values: {} })).rejects.toThrow(
      `Creatable entities: ${creatableEntityNames().join(", ")}.`,
    );
    await expect(dbUpdateTool.run(ctx, { entity: "NoSuchEntity", values: { x: 1 } })).rejects.toThrow(
      `Editable entities: ${editableEntityNames().join(", ")}.`,
    );
  });
});
