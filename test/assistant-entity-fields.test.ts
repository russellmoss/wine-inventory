import { describe, it, expect } from "vitest";
import { getEntity, allowedEntityNames } from "@/lib/assistant/entities";
import { withFields, type EntityField, type FieldSpec } from "@/lib/assistant/fields";

/**
 * Plan 082 Unit 2 — guards for the single field table.
 *
 * Before this, every entity carried two hand-written `FieldSpec[]` arrays and nothing stopped them
 * drifting apart. The block's did, in both directions at once: `variety` was create-only (so a
 * mis-set variety was permanently unfixable by the assistant) while `numRows`/`clone`/`rootstock`/
 * `irrigated` were update-only. These tests are the thing that stops that recurring.
 */

/** Compact spec serializer — catches a changed bound or type, not just a changed field name. */
const sig = (s: FieldSpec) =>
  `${s.name}:${s.type}${s.required ? "!" : ""}` +
  (s.min != null || s.max != null ? `:${s.min ?? ""}..${s.max ?? ""}` : "");

const sigs = (specs: FieldSpec[] | undefined) => (specs ?? []).map(sig).sort();

describe("splitFields / withFields", () => {
  it("defaults to symmetry — an unflagged field lands on both paths", () => {
    const { creatable, editable } = withFields([{ name: "name", type: "string", min: 2 }]);
    expect(sigs(creatable)).toEqual(["name:string:2.."]);
    expect(sigs(editable)).toEqual(["name:string:2.."]);
  });

  it("honors create-only and update-only", () => {
    const table: EntityField[] = [
      { name: "parent", type: "string", mode: "create-only", why: "parent FK" },
      { name: "isActive", type: "boolean", mode: "update-only", why: "born active" },
    ];
    const { creatable, editable } = withFields(table);
    expect(sigs(creatable)).toEqual(["parent:string"]);
    expect(sigs(editable)).toEqual(["isActive:boolean"]);
  });

  it("strips `required` from the editable list — it is a create-time concept", () => {
    const { creatable, editable } = withFields([{ name: "name", type: "string", required: true }]);
    expect(creatable[0].required).toBe(true);
    expect(editable[0].required).toBeUndefined();
  });

  it("keeps enum values on both derived lists", () => {
    const { creatable, editable } = withFields([{ name: "k", type: "enum", enumValues: ["A", "B"] }]);
    expect(creatable[0].enumValues).toEqual(["A", "B"]);
    expect(editable[0].enumValues).toEqual(["A", "B"]);
  });

  it("does not leak `mode` / `why` into the derived specs", () => {
    const { creatable, editable } = withFields([
      { name: "a", type: "string" },
      { name: "b", type: "string", mode: "update-only", why: "because" },
    ]);
    for (const spec of [...creatable, ...editable]) {
      expect(spec).not.toHaveProperty("mode");
      expect(spec).not.toHaveProperty("why");
    }
  });
});

describe("entity registry — create/update symmetry is declared, never accidental", () => {
  const writable = allowedEntityNames()
    .map((n) => getEntity(n)!)
    .filter((e) => e.creatable && e.editable);

  it("covers every writable entity", () => {
    expect(writable.length).toBe(8);
  });

  it("derives both lists from a field table (no hand-written arrays)", () => {
    for (const entity of writable) {
      expect(entity.fields, `${entity.name} must install fields via withFields()`).toBeDefined();
      // Spread-then-override would silently reintroduce the drift this whole unit exists to prevent.
      const derived = withFields(entity.fields!);
      expect(sigs(entity.creatable), `${entity.name}.creatable`).toEqual(sigs(derived.creatable));
      expect(sigs(entity.editable), `${entity.name}.editable`).toEqual(sigs(derived.editable));
    }
  });

  it("requires a stated reason for every one-sided field", () => {
    for (const entity of writable) {
      const inCreate = new Set(entity.creatable!.map((f) => f.name));
      const inUpdate = new Set(entity.editable!.map((f) => f.name));
      for (const field of entity.fields!) {
        const oneSided = inCreate.has(field.name) !== inUpdate.has(field.name);
        const declared = field.mode === "create-only" || field.mode === "update-only";
        expect(oneSided, `${entity.name}.${field.name}: mode=${field.mode ?? "both"} but sides disagree`).toBe(declared);
        if (declared) {
          expect(
            (field as { why?: string }).why?.trim(),
            `${entity.name}.${field.name} is ${field.mode} and must say why`,
          ).toBeTruthy();
        }
      }
    }
  });

  it("never marks a field required on the update path", () => {
    for (const entity of writable) {
      for (const spec of entity.editable!) {
        expect(spec.required, `${entity.name}.${spec.name}`).toBeUndefined();
      }
    }
  });
});

/**
 * Behavior lock. Unit 2 is a pure refactor: the derived arrays must equal what the hand-written
 * ones produced before it. Unit 3 deliberately changes the VineyardBlock rows (variety becomes
 * editable; the planting fields become creatable) — update them here when it does, and only them.
 */
describe("entity registry — field lists unchanged by the Unit 2 refactor", () => {
  const GOLDEN: Record<string, { creatable: string[]; editable: string[] }> = {
    // Unit 3 made variety + the four planting fields symmetric. `vineyard` stays create-only
    // (re-parenting a block is a different operation), so this entity still exercises the guard.
    VineyardBlock: {
      creatable: ["blockLabel:string:1..80", "clone:string:..80", "irrigated:boolean", "numRows:int:0..", "rootstock:string:..80", "rowSpacing:float:0..", "spacingUnit:enum", "variety:string", "vineCount:int:0..", "vineSpacing:float:0..", "vineyard:string!", "yearPlanted:int:1900..2100"],
      editable: ["blockLabel:string:1..80", "clone:string:..80", "irrigated:boolean", "numRows:int:0..", "rootstock:string:..80", "rowSpacing:float:0..", "spacingUnit:enum", "variety:string", "vineCount:int:0..", "vineSpacing:float:0..", "yearPlanted:int:1900..2100"],
    },
    // Unit 5 added `abbreviation` (the lot-code token) on both paths; Unit 6 flattened the
    // VineyardDetail columns on as update-only — see DETAIL_UPDATE_ONLY for why they are not
    // symmetric yet.
    Vineyard: {
      creatable: ["abbreviation:string:2..4", "name:string!:2..80"],
      editable: ["abbreviation:string:2..4", "defaultUnit:enum", "elevation:float", "elevationUnit:enum", "gpsLat:float:-90..90", "gpsLng:float:-180..180", "isActive:boolean", "manager:string:..120", "name:string:2..80", "soilType:string:..120"],
    },
    Variety: {
      creatable: ["color:string:..9", "name:string!:1..80"],
      editable: ["color:string:..9", "isActive:boolean", "name:string:1..80"],
    },
    Location: {
      creatable: ["name:string!:2..80"],
      editable: ["isActive:boolean", "name:string:2..80"],
    },
    FinishedGoodCategory: {
      creatable: ["name:string!:2..80"],
      editable: ["isActive:boolean", "name:string:2..80"],
    },
    Vessel: {
      creatable: ["capacityL:decimal!:0..", "code:string!:1..40", "type:enum!"],
      editable: ["blendName:string:..80", "capacityL:decimal:0..", "code:string:1..40", "cooperage:string:..80", "cooperageYear:int:1900..2100", "isActive:boolean", "oakOrigin:string:..40", "toastLevel:string:..40"],
    },
    WineSku: {
      creatable: ["name:string!:2..80", "vintage:int!:1900..2100"],
      editable: ["isActive:boolean", "name:string:2..80", "vintage:int:1900..2100"],
    },
    FinishedGood: {
      creatable: ["category:string!", "name:string!:2..80"],
      editable: ["isActive:boolean", "name:string:2..80"],
    },
  };

  for (const [name, expected] of Object.entries(GOLDEN)) {
    it(`${name} create/update lists match pre-refactor`, () => {
      const entity = getEntity(name)!;
      expect(sigs(entity.creatable)).toEqual(expected.creatable);
      expect(sigs(entity.editable)).toEqual(expected.editable);
    });
  }
});
