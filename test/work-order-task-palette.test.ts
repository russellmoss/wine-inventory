import { describe, expect, it } from "vitest";
import { buildTaskPalette, categoryFor, splitEntriesAreExhaustive, PALETTE_SPLITS } from "@/lib/work-orders/task-palette";
import { TASK_VOCABULARY, type TaskTypeDef } from "@/lib/work-orders/template-vocabulary";

/**
 * Feedback cmsf3vmlw0000l704pnaiep22 — "press": *"I'm not sure why we would have press and [saignée] in
 * the same work order. I think there would be two separate functions, not picking one or the other."*
 *
 * He is describing his job, not the schema. A press splits a must into free-run and press cuts; a
 * saignée bleeds juice OFF a must to concentrate what stays behind. Same core, same opType, same ledger
 * shape — genuinely one operation underneath — but two different jobs to the person planning the day.
 * The ASSISTANT already agreed: `nl-resolve` titles the task "Press" or "Saignee" from `op`. Only the
 * manual builder made you add a generic task and then pick a mode.
 *
 * Fixed at the PALETTE, not the model: two buttons, one task type, presets. Nothing downstream moves.
 */
describe("task palette — one task type can be more than one button", () => {
  it("offers Press and Saignée as separate buttons that build the SAME task type", () => {
    const palette = buildTaskPalette(TASK_VOCABULARY as Record<string, TaskTypeDef>);
    const fruit = palette.find((c) => c.category === "Fruit & press");
    expect(fruit).toBeTruthy();

    const press = fruit!.items.find((i) => i.label === "Press");
    const saignee = fruit!.items.find((i) => i.label === "Saignée");
    expect(press).toBeTruthy();
    expect(saignee).toBeTruthy();

    // Two buttons, one task type — the domain model is untouched.
    expect(press!.taskType).toBe("PRESS");
    expect(saignee!.taskType).toBe("PRESS");
    expect(press!.presetValues).toEqual({ op: "PRESS" });
    expect(saignee!.presetValues).toEqual({ op: "SAIGNEE" });

    // The old single "Press / saignée" button is gone — that was the thing he objected to.
    expect(fruit!.items.some((i) => i.label === "Press / saignée")).toBe(false);
  });

  it("gives every button a unique id, so two entries sharing a task type can both render", () => {
    const palette = buildTaskPalette(TASK_VOCABULARY as Record<string, TaskTypeDef>);
    const ids = palette.flatMap((c) => c.items.map((i) => i.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("leaves every other task type as exactly one button, with its own label", () => {
    const palette = buildTaskPalette(TASK_VOCABULARY as Record<string, TaskTypeDef>);
    const items = palette.flatMap((c) => c.items);
    for (const [taskType, def] of Object.entries(TASK_VOCABULARY as Record<string, TaskTypeDef>)) {
      if (PALETTE_SPLITS[taskType]) continue;
      const mine = items.filter((i) => i.taskType === taskType);
      expect(mine, `${taskType} should be one button`).toHaveLength(1);
      expect(mine[0].label).toBe(def.label);
      expect(mine[0].presetValues).toBeUndefined();
    }
  });

  it("never leaves a mode unreachable — the presets cover the type's declared options", () => {
    // The failure this guards: adding a third `op` without adding its button would make that mode
    // impossible to author from the builder, which is precisely the bug being fixed here.
    expect(splitEntriesAreExhaustive(TASK_VOCABULARY as Record<string, TaskTypeDef>)).toBe(true);
  });

  it("detects a split that has stopped covering its options", () => {
    const narrowed = {
      PRESS: { ...(TASK_VOCABULARY as Record<string, TaskTypeDef>).PRESS, fieldOptions: { op: ["PRESS", "SAIGNEE", "RETURN"] } },
    } as unknown as Record<string, TaskTypeDef>;
    expect(splitEntriesAreExhaustive(narrowed)).toBe(false);
  });

  it("keeps the display grouping it always had", () => {
    const def = (over: Partial<TaskTypeDef>) => ({ kind: "OPERATION", label: "x", ...over }) as TaskTypeDef;
    expect(categoryFor(def({ opType: "PRESS" }))).toBe("Fruit & press");
    expect(categoryFor(def({ opType: "CRUSH" }))).toBe("Fruit & press");
    expect(categoryFor(def({ opType: "ADDITION" }))).toBe("Additions");
    expect(categoryFor(def({ kind: "OBSERVATION" }))).toBe("Sampling");
    expect(categoryFor(def({ kind: "MAINTENANCE" }))).toBe("Maintenance");
    expect(categoryFor(def({ kind: "NOTE" }))).toBe("Checklist & logs");
    expect(categoryFor(def({ opType: "RACK" }))).toBe("Cellar ops");
  });
});

/**
 * The second half of the same ticket: *"when you create an order to press, shouldn't there be an
 * optional vessel if you're talking about pressing wine off must?"*
 *
 * The whole contract already supported pinning a press source — `canonicalColumns` mirrors
 * `sourceVesselId` and `parentLotId` onto the task, the readiness engine drops its "entered on the
 * execute screen" note once they are set, the execute sub-form prefills from them, and the assistant
 * has always set them. The manual builder just declared no such fields, so it could never say so.
 */
describe("press task — the builder can pin a source and hint a destination", () => {
  const PRESS = (TASK_VOCABULARY as Record<string, TaskTypeDef>).PRESS;

  it("declares the optional source vessel, must lot and destination hint", () => {
    expect(PRESS.fields.sourceVesselId).toBe("vessel");
    expect(PRESS.fields.parentLotId).toBe("lot");
    expect(PRESS.fields.plannedDestVesselId).toBe("vessel");
  });

  it("keeps the fields the payload sanitiser and the mirror already understood", () => {
    // sanitizeTaskPayload keeps a key only when it is declared here, and canonicalColumns reads
    // `sourceVesselId` / `parentLotId` — so these exact names are what make the pin survive.
    expect(Object.keys(PRESS.fields)).toEqual(
      expect.arrayContaining(["op", "sourceVesselId", "parentLotId", "plannedDestVesselId", "pressCycle", "note"]),
    );
    expect(PRESS.fieldOptions?.op).toEqual(["PRESS", "SAIGNEE"]);
  });

  it("still says the cuts are a floor input — pinning a source does not pre-empt the fractions", () => {
    expect(PRESS.hint).toContain("fractions");
  });
});
