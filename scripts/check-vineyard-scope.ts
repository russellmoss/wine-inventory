/**
 * VINEYARD-1 guard — every exported action in a vineyard-scoped module must reach a D9 gate.
 *
 * `canAccessVineyard` (src/lib/access.ts) is the intra-tenant fence: an admin reaches every vineyard,
 * a manager (`role: "user"`) only the vineyards in their membership set. Postgres does NOT enforce it —
 * RLS scopes by TENANT — so it holds only where the action layer applies it. It was applied in 8 files
 * and skipped in the vineyard-scoped domains (weather, spray, soil, planting areas, NDVI, block CRUD),
 * so a manager assigned to vineyard A could read and mutate vineyard B.
 *
 * The clearest proof it was a bug and not a policy: `src/lib/assistant/tools/db-update.ts` already
 * refused exactly this for the two entities `entities.ts` marks `vineyardScoped: true` (`Vineyard`,
 * `VineyardBlock`), so the assistant path was STRICTER than the GUI path for the same rows.
 *
 * This scan asserts each exported action in MODULES below reaches one of the GATES — directly, or
 * through a module-local wrapper that itself reaches one (that is how weather's `requireTenant()`
 * counts). Pure static scan over the TypeScript AST; no DB.
 *
 * NOT a substitute for plan 092, which moves this fence into RESTRICTIVE RLS policies. Until that
 * lands, this is the fence that exists, and this guard keeps it from going partial again.
 *
 * Known limitations (tripwire, not a proof):
 *   - MODULES is an explicit list. A NEW vineyard-scoped module is not covered until added here —
 *     the alternative (guess which modules are vineyard-scoped) is unreliable in both directions.
 *   - It proves a gate is REACHED, not that the gate resolves the right vineyard. Correct FK paths
 *     are the reviewed part; `test/vineyard-scope.test.ts` pins the fail-closed decision logic.
 *   - ALLOWED names are exports with no vineyard dimension at all; each carries its reason.
 *
 *   npm run verify:vineyard-scope   (or: npx tsx scripts/check-vineyard-scope.ts)
 */
import ts from "typescript";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** The vineyard-scoped action modules. Keep in sync when a new one appears (see limitations). */
const MODULES = [
  "src/lib/vineyard/actions.ts",
  "src/lib/plantingArea/actions.ts",
  "src/lib/soil/actions.ts",
  "src/lib/spatial/actions.ts",
  "src/lib/spatial/style-actions.ts",
  "src/lib/weather/actions.ts",
  "src/lib/spray/actions.ts",
  "src/lib/harvest/planned-harvest-actions.ts",
  // `RefKind` spans "variety" (tenant-global) AND "vineyard" (vineyard-scoped), so this module mutates
  // Vineyard rows too — a gap the first VINEYARD-1 sweep missed because the module name gives no hint.
  "src/lib/reference/actions.ts",
  // Already gated before this guard existed — listed so a regression there is caught too.
  "src/lib/harvest/actions.ts",
  "src/lib/fieldnotes/actions.ts",
];

/** Calls that establish D9 reach for the row(s) an action touches. */
const GATES = new Set([
  "requireVineyardAccess",
  "requireBlockAccess",
  "requireBlocksAccess",
  "requireSubblockAccess",
  "requirePlantingAreaAccess",
  "requireSprayApplicationAccess",
  "requireSprayBlockLineAccess",
  "requireSpatialStyleAccess",
  "currentVineyardScope",
  "vineyardScopeOf",
  // The pre-existing local helpers in harvest/fieldnotes, and the predicate itself.
  "canAccessVineyard",
  "canManagerAccessVineyard",
  // A tenant-wide job has no vineyard to scope by, so admin-only IS the fail-closed answer.
  "isTenantAdminLike",
]);

/**
 * Exports with no vineyard dimension — gating them would be meaningless, not safer.
 * `<module>:<exportName>` → why it is exempt.
 */
const ALLOWED = new Map<string, string>([
  [
    "src/lib/spray/actions.ts:listTenantProductFacts",
    "TenantProductFacts is TENANT-wide reference data (grower-supplied label overrides); it has no vineyardId.",
  ],
  [
    "src/lib/spray/actions.ts:upsertTenantProductFacts",
    "Same table — tenant-wide, no vineyard dimension. Who may edit tenant reference data is a capability question (plan 092), not a D9 one.",
  ],
]);

function calleeName(node: ts.CallExpression): string | null {
  if (ts.isIdentifier(node.expression)) return node.expression.text;
  if (ts.isPropertyAccessExpression(node.expression)) return node.expression.name.text;
  return null;
}

function callsAnyOf(root: ts.Node, names: ReadonlySet<string>): boolean {
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (ts.isCallExpression(n)) {
      const name = calleeName(n);
      if (name !== null && names.has(name)) {
        found = true;
        return;
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(root);
  return found;
}

/** Module-local functions that themselves reach a gate count as gates (one level, like weather's requireTenant). */
function localGateNames(sf: ts.SourceFile): Set<string> {
  const local = new Set<string>();
  const consider = (name: string | undefined, body: ts.Node | undefined) => {
    if (name === undefined || body === undefined) return;
    if (callsAnyOf(body, GATES)) local.add(name);
  };
  for (const stmt of sf.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.body) consider(stmt.name?.text, stmt.body);
    if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
        const init = decl.initializer;
        if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) consider(decl.name.text, init.body);
      }
    }
  }
  return local;
}

const isExported = (node: ts.Node): boolean =>
  (ts.getCombinedModifierFlags(node as ts.Declaration) & ts.ModifierFlags.Export) !== 0;

const violations: string[] = [];
const unusedAllowances = new Set(ALLOWED.keys());
let checked = 0;

for (const rel of MODULES) {
  const text = readFileSync(join(process.cwd(), rel), "utf8");
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const gates = new Set([...GATES, ...localGateNames(sf)]);

  for (const stmt of sf.statements) {
    // `export async function foo() {}`
    if (ts.isFunctionDeclaration(stmt) && stmt.body && isExported(stmt)) {
      const name = stmt.name?.text ?? "(anonymous)";
      const key = `${rel}:${name}`;
      if (ALLOWED.has(key)) {
        unusedAllowances.delete(key);
        continue;
      }
      checked++;
      if (!callsAnyOf(stmt.body, gates)) {
        const { line } = sf.getLineAndCharacterOfPosition(stmt.getStart(sf));
        violations.push(`${rel}:${line + 1}  ${name}`);
      }
      continue;
    }
    // `export const foo = action(async (ctx, …) => {…})`
    if (ts.isVariableStatement(stmt) && isExported(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
        // Only wrapped actions, not exported plain data/types.
        if (!ts.isCallExpression(decl.initializer)) continue;
        const wrapper = calleeName(decl.initializer);
        if (wrapper === null || !/^(action|safeAction|adminAction|safeAdminAction)$/.test(wrapper)) continue;
        const name = decl.name.text;
        const key = `${rel}:${name}`;
        if (ALLOWED.has(key)) {
          unusedAllowances.delete(key);
          continue;
        }
        checked++;
        // adminAction/safeAdminAction are already admin-only, which is stricter than D9.
        if (wrapper === "adminAction" || wrapper === "safeAdminAction") continue;
        if (!callsAnyOf(decl.initializer, gates)) {
          const { line } = sf.getLineAndCharacterOfPosition(decl.getStart(sf));
          violations.push(`${rel}:${line + 1}  ${name}`);
        }
      }
    }
  }
}

if (unusedAllowances.size > 0) {
  console.error("✗ VINEYARD-1: stale ALLOWED entries (the export is gone or renamed) — remove them:");
  for (const k of unusedAllowances) console.error("  " + k);
  process.exit(1);
}

if (violations.length > 0) {
  console.error(
    "✗ VINEYARD-1: an exported action in a vineyard-scoped module reaches NO D9 gate. RLS scopes by " +
      "TENANT only, so without one of " +
      [...GATES].slice(0, 8).join(" / ") +
      " a manager assigned to one vineyard can reach another's rows. Add the gate that resolves this " +
      "action's id back to its vineyard (src/lib/vineyard/scope.ts), or add an ALLOWED entry with the " +
      "reason it has no vineyard dimension:",
  );
  for (const v of violations) console.error("  " + v);
  process.exit(1);
}
console.log(`✓ All ${checked} exported actions in ${MODULES.length} vineyard-scoped modules reach a D9 gate (VINEYARD-1).`);
process.exit(0);
