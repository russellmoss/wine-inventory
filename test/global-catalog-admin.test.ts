import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isTenantAdminLike } from "@/lib/access";

/**
 * GLOBAL-1 — a tenant-GLOBAL catalog write is admin-only.
 *
 * The rule comes from the assistant, which branches on `entities.ts`'s `vineyardScoped` flag:
 * vineyard-scoped rows get D9 membership (VINEYARD-1), everything else is admin-only. The GUI paths
 * mutating those same rows used a bare `action(…)`, so any authenticated user could edit the tenant
 * catalog the assistant refused them.
 *
 * `npm run verify:global-catalog-admin` proves every catalog write REACHES an admin gate. These tests
 * pin the two things a static scan cannot: that the six entities really are the global set, and that
 * `reference/actions.ts`'s gate is POLYMORPHIC (its `RefKind` spans a global entity and a
 * vineyard-scoped one, so one blanket `adminAction` would have been wrong).
 */

const ROOT = join(__dirname, "..");
const entitiesSrc = readFileSync(join(ROOT, "src/lib/assistant/entities.ts"), "utf8");
const referenceSrc = readFileSync(join(ROOT, "src/lib/reference/actions.ts"), "utf8");

/** Pair each `name: "X"` with the `vineyardScoped: <bool>` declared in the same entity literal. */
function entityScopes(): Map<string, boolean> {
  const out = new Map<string, boolean>();
  const re = /vineyardScoped:\s*(true|false)/g;
  const flags: { index: number; value: boolean }[] = [];
  for (let m = re.exec(entitiesSrc); m !== null; m = re.exec(entitiesSrc)) {
    flags.push({ index: m.index, value: m[1] === "true" });
  }
  const nameRe = /name:\s*"([A-Z][A-Za-z]*)"/g;
  const names: { index: number; name: string }[] = [];
  for (let m = nameRe.exec(entitiesSrc); m !== null; m = nameRe.exec(entitiesSrc)) {
    names.push({ index: m.index, name: m[1] });
  }
  // Each flag belongs to the nearest entity `name:` that follows it within the same literal.
  for (const f of flags) {
    const after = names.filter((n) => n.index > f.index).sort((a, b) => a.index - b.index)[0];
    const before = names.filter((n) => n.index < f.index).sort((a, b) => b.index - a.index)[0];
    // `vineyardScoped` sits above `name` in some literals and below it in others; pick the closer one.
    const pick =
      after && before ? (after.index - f.index < f.index - before.index ? after : before) : (after ?? before);
    if (pick) out.set(pick.name, f.value);
  }
  return out;
}

describe("the global/vineyard-scoped entity split (the source of the rule)", () => {
  const scopes = entityScopes();

  it("marks exactly Vineyard and VineyardBlock as vineyard-scoped", () => {
    const scoped = [...scopes.entries()].filter(([, v]) => v).map(([k]) => k).sort();
    expect(scoped).toEqual(["Vineyard", "VineyardBlock"]);
  });

  it("treats the six catalog entities as tenant-global", () => {
    for (const name of ["Variety", "Location", "FinishedGoodCategory", "Vessel", "WineSku", "FinishedGood"]) {
      expect(scopes.get(name), `${name} should be vineyardScoped: false`).toBe(false);
    }
  });

  it("both generic write tools enforce admin for the global branch", () => {
    for (const tool of ["db-update.ts", "db-create.ts"]) {
      const src = readFileSync(join(ROOT, "src/lib/assistant/tools", tool), "utf8");
      // The else-branch of assertScoped: not vineyard-scoped => must be admin-like.
      expect(src, `${tool} keeps the global-record admin branch`).toMatch(
        /else if \(!isTenantAdminLike\(user\)\)/,
      );
    }
  });
});

describe("reference/actions.ts gates PER KIND, not with one blanket admin wrapper", () => {
  it("routes the vineyard kind to the D9 membership gate", () => {
    // A blanket adminAction here would have locked managers out of editing their OWN vineyard, which
    // the assistant explicitly permits (vineyardScoped: true => membership, not admin).
    expect(referenceSrc).toMatch(/kind === "vineyard" && id !== null/);
    expect(referenceSrc).toMatch(/await requireVineyardAccess\(id\)/);
  });

  it("routes the global kind (and every create) to the admin gate", () => {
    expect(referenceSrc).toMatch(/isTenantAdminLike\(user\)/);
    expect(referenceSrc).toMatch(/Only an admin or developer can change global records\./);
  });

  it("still uses the open `action` wrapper, because the gate is inside the body", () => {
    // If someone "simplifies" this to adminAction, the per-kind behaviour is silently lost — the
    // vineyard branch would become admin-only. This assertion is the tripwire for that refactor.
    expect(referenceSrc).toMatch(/export const setRefActive = action\(/);
    expect(referenceSrc).not.toMatch(/export const setRefActive = adminAction\(/);
  });

  it("gates all five exported writes", () => {
    const gated = referenceSrc.match(/await requireRefWriteAccess\(/g) ?? [];
    expect(gated.length).toBe(5);
  });
});

describe("isTenantAdminLike is the shared predicate both paths use", () => {
  it("admits admin and developer, refuses a plain user", () => {
    expect(isTenantAdminLike({ role: "admin" })).toBe(true);
    expect(isTenantAdminLike({ role: "developer" })).toBe(true);
    expect(isTenantAdminLike({ role: "user" })).toBe(false);
    expect(isTenantAdminLike({ role: null })).toBe(false);
    expect(isTenantAdminLike(null)).toBe(false);
  });
});
