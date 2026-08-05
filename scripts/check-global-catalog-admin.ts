/**
 * GLOBAL-1 guard — a tenant-GLOBAL catalog write is admin-only.
 *
 * `src/lib/assistant/entities.ts` splits its entities in two, and both generic write tools branch on it
 * (`src/lib/assistant/tools/db-update.ts`, `db-create.ts`):
 *
 *     if (entity.vineyardScoped) { …vineyard membership (VINEYARD-1)… }
 *     else if (!isTenantAdminLike(user)) throw "Only an admin or developer can change global records."
 *
 * The six entities marked `vineyardScoped: false` — Variety, Location, FinishedGoodCategory, Vessel,
 * WineSku, FinishedGood — are therefore ADMIN-ONLY to create or edit. The GUI paths that mutate those
 * same rows used a bare `action(…)`/`safeAction(…)`, so any authenticated user could rename the tenant's
 * varieties, add locations, deactivate a tank, or create finished goods that the assistant refused them.
 * VINEYARD-1 closed the first branch of that rule; this guard closes the second.
 *
 * The line that matters is CATALOG vs OPERATIONAL. Editing the vessel catalog is admin; racking wine
 * between vessels is not. Creating a finished good is admin; moving stock is not. The assistant draws the
 * same line — its dedicated operational tools (`adjust-inventory`, `adjust-consumable`) are NOT adminOnly,
 * and neither are its dedicated creators for entities OUTSIDE the six (`create-grower`,
 * `create-custom-unit`, `create-vendor`, `create-material`), which is why those modules are not listed
 * here: for them, non-admin creation is a deliberate product decision, not an oversight.
 *
 * Pure static scan over the TypeScript AST; no DB.
 *
 * Known limitations (tripwire, not a proof):
 *   - MODULES is explicit. A new module that mutates one of the six is not covered until added.
 *   - It proves an admin gate is REACHED, not that the right entity was checked. `reference/actions.ts`
 *     is the interesting case: `RefKind` is polymorphic, so its gate resolves per kind
 *     (variety → admin, vineyard → membership) and is unit-tested rather than pattern-matched.
 *
 *   npm run verify:global-catalog-admin   (or: npx tsx scripts/check-global-catalog-admin.ts)
 */
import ts from "typescript";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Modules whose exported writes touch one of the six `vineyardScoped: false` catalog entities. */
const MODULES = [
  "src/lib/reference/actions.ts", // Variety (+ Vineyard, via VINEYARD-1's per-kind gate)
  "src/lib/locations/actions.ts", // Location
  "src/lib/vessels/actions.ts", // Vessel (catalog only)
  "src/lib/inventory/actions.ts", // FinishedGood / FinishedGoodCategory (catalog-creating paths only)
];

/** Wrappers that are themselves an admin gate. */
const ADMIN_WRAPPERS = new Set(["adminAction", "safeAdminAction"]);
/** Wrappers that are NOT a gate — an export using one must reach an admin check in its body. */
const OPEN_WRAPPERS = new Set(["action", "safeAction"]);
/** In-body calls that establish admin (or a stricter per-kind) reach. */
const ADMIN_CALLS = new Set(["isTenantAdminLike", "isDeveloper", "requireRefWriteAccess", "requireTenantAdmin"]);

/**
 * OPERATIONAL exports in the listed modules — stock and vessel work, not catalog editing. Each carries
 * the reason it is intentionally reachable by a non-admin.
 */
const ALLOWED = new Map<string, string>([
  ["src/lib/inventory/actions.ts:moveStock", "Stock MOVEMENT between locations — operational, mirrors the non-adminOnly adjust-inventory tool."],
  ["src/lib/inventory/actions.ts:setOnHand", "Sets an on-hand LEVEL, not a catalog row. Operational count correction."],
  ["src/lib/inventory/actions.ts:updateOnHand", "Same — an on-hand level, not a catalog row."],
  ["src/lib/inventory/actions.ts:deleteOnHand", "Removes an on-hand ROW for an item+location, not the item itself."],
  ["src/lib/inventory/actions.ts:receivePurchasedFinishedGoodAction", "A RECEIPT against an existing finished good — operational, creates no catalog row."],
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

/** Module-local wrappers that themselves reach an admin check count as admin checks (one level). */
function localAdminNames(sf: ts.SourceFile): Set<string> {
  const local = new Set<string>();
  const consider = (name: string | undefined, body: ts.Node | undefined) => {
    if (name === undefined || body === undefined) return;
    if (callsAnyOf(body, ADMIN_CALLS)) local.add(name);
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

/**
 * Reads are not catalog writes. Heuristic on the export name — but a read PREFIX is not enough on its
 * own: `getOrCreateVariety` / `findOrCreateSku` / `checkAndCreate` all start with a read verb and all
 * write. A name that begins with a read verb AND also contains a write verb is treated as a write, so
 * the guard fails closed on exactly the shape that would otherwise slip through silently.
 */
const READ_PREFIX = /^(load|list|get|find|check|describe|search)/;
const WRITE_VERB = /(create|update|delete|remove|set|upsert|save|import|add|assign|record|submit|sync|apply)/i;
const isReadOnlyName = (name: string): boolean => READ_PREFIX.test(name) && !WRITE_VERB.test(name);

const violations: string[] = [];
const unusedAllowances = new Set(ALLOWED.keys());
let checked = 0;

for (const rel of MODULES) {
  const text = readFileSync(join(process.cwd(), rel), "utf8");
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const adminCalls = new Set([...ADMIN_CALLS, ...localAdminNames(sf)]);

  const check = (name: string, wrapper: string | null, subtree: ts.Node, pos: number) => {
    const key = `${rel}:${name}`;
    if (ALLOWED.has(key)) {
      unusedAllowances.delete(key);
      return;
    }
    if (isReadOnlyName(name)) return;
    checked++;
    if (wrapper !== null && ADMIN_WRAPPERS.has(wrapper)) return;
    if (callsAnyOf(subtree, adminCalls)) return;
    const { line } = sf.getLineAndCharacterOfPosition(pos);
    violations.push(`${rel}:${line + 1}  ${name}`);
  };

  for (const stmt of sf.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.body && isExported(stmt)) {
      check(stmt.name?.text ?? "(anonymous)", null, stmt.body, stmt.getStart(sf));
      continue;
    }
    if (ts.isVariableStatement(stmt) && isExported(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
        if (!ts.isCallExpression(decl.initializer)) continue;
        const wrapper = calleeName(decl.initializer);
        if (wrapper === null) continue;
        if (!ADMIN_WRAPPERS.has(wrapper) && !OPEN_WRAPPERS.has(wrapper)) continue;
        check(decl.name.text, wrapper, decl.initializer, decl.getStart(sf));
      }
    }
  }
}

if (unusedAllowances.size > 0) {
  console.error("✗ GLOBAL-1: stale ALLOWED entries (the export is gone or renamed) — remove them:");
  for (const k of unusedAllowances) console.error("  " + k);
  process.exit(1);
}

if (violations.length > 0) {
  console.error(
    "✗ GLOBAL-1: a tenant-GLOBAL catalog write is reachable by a non-admin. `entities.ts` marks these " +
      "entities `vineyardScoped: false`, and the assistant's db_create/db_update already refuse them " +
      '("Only an admin or developer can change global records.") — so the GUI must too. Use ' +
      "`adminAction`/`safeAdminAction`, or add an ALLOWED entry stating why the export is OPERATIONAL " +
      "rather than catalog editing:",
  );
  for (const v of violations) console.error("  " + v);
  process.exit(1);
}
console.log(`✓ All ${checked} tenant-global catalog writes in ${MODULES.length} modules are admin-gated (GLOBAL-1).`);
process.exit(0);
