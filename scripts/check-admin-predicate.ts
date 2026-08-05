/**
 * ADMIN-PREDICATE guard — the UI decides "is this user an admin" the SAME way the server does.
 *
 * `isTenantAdminLike(user)` (src/lib/access.ts) is the one answer: `role === "admin"` OR
 * `role === "developer"`. Every server gate uses it — `adminAction`, `accessDecision({requireAdmin})`,
 * `requireRefWriteAccess`, the assistant's `db_create`/`db_update` global branch.
 *
 * Surfaces kept re-deriving it by hand and getting it WRONG in the same two ways:
 *
 *     isAdmin={user.role === "admin" || user.role === "owner"}   // inventory, task-types
 *     isAdmin={user.role === "admin"}                            // work-order templates
 *
 * Both drop `developer`, so a developer is shown a read-only UI the server would have let them use.
 * And "owner" is not a role this app assigns at all — `ASSIGNABLE_ROLES` is user/admin/developer — so
 * that arm never matched anything. `src/lib/search/actions.ts` carries a comment about a THIRD instance
 * of the same copy ("briefly a hand-rolled copy here … which is exactly how the palette and the sidebar
 * end up disagreeing about who sees what"). Four occurrences of one mistake is a class, not a slip.
 *
 * Two rules, both narrow enough to have no false positives today:
 *
 *   1. NO comparison against the role string "owner", anywhere in `src/`. It is not an assignable role,
 *      so any such branch is dead code that reads like a live permission.
 *   2. An `isAdmin` binding or JSX prop must not be computed from a raw `.role` comparison — it must
 *      come from `isTenantAdminLike` (or be passed through from a caller that used it).
 *
 * Rule 2 deliberately keys on the NAME `isAdmin`, not on role comparisons generally: plenty of code
 * legitimately tests a role for other reasons (`UsersClient` renders "make admin" against the ROW's
 * user; `layout.tsx` branches on `developer` for the tenant switcher). Those are not this bug.
 *
 * Pure static scan over the TypeScript AST; no DB.
 *
 *   npm run verify:admin-predicate   (or: npx tsx scripts/check-admin-predicate.ts)
 */
import ts from "typescript";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

/** `access.ts` DEFINES the predicate, so it is the one place a raw role comparison is the point. */
const DEFINITION_FILE = join("src", "lib", "access.ts");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const violations: string[] = [];
let filesScanned = 0;
let isAdminBindings = 0;

/** Does this expression compute admin-ness from a raw role comparison rather than the shared helper? */
function derivesFromRawRole(node: ts.Node): boolean {
  let sawRoleComparison = false;
  let sawHelper = false;
  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n)) {
      const fn = n.expression;
      const name = ts.isIdentifier(fn) ? fn.text : ts.isPropertyAccessExpression(fn) ? fn.name.text : "";
      if (name === "isTenantAdminLike" || name === "isDeveloper") sawHelper = true;
    }
    if (ts.isBinaryExpression(n) && (n.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken || n.operatorToken.kind === ts.SyntaxKind.EqualsEqualsToken)) {
      for (const side of [n.left, n.right]) {
        if (ts.isPropertyAccessExpression(side) && side.name.text === "role") sawRoleComparison = true;
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return sawRoleComparison && !sawHelper;
}

for (const file of walk(SRC)) {
  const rel = relative(ROOT, file);
  filesScanned++;
  const sf = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const isDefinition = rel === DEFINITION_FILE;

  const visit = (node: ts.Node): void => {
    const line = () => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

    // Rule 1 — a comparison against the dead "owner" role.
    if (
      !isDefinition &&
      ts.isBinaryExpression(node) &&
      (node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken || node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsToken)
    ) {
      const sides = [node.left, node.right];
      const comparesRole = sides.some((s) => ts.isPropertyAccessExpression(s) && s.name.text === "role");
      const comparesOwner = sides.some((s) => ts.isStringLiteralLike(s) && s.text === "owner");
      if (comparesRole && comparesOwner) {
        violations.push(`${rel}:${line()} — compares role against "owner", which this app never assigns (ASSIGNABLE_ROLES is user/admin/developer). Dead branch.`);
      }
    }

    // Rule 2a — `const isAdmin = <raw role comparison>`
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "isAdmin" && node.initializer) {
      isAdminBindings++;
      if (!isDefinition && derivesFromRawRole(node.initializer)) {
        violations.push(`${rel}:${line()} — \`isAdmin\` is computed from a raw \`.role\` comparison. Use \`isTenantAdminLike(user)\`.`);
      }
    }

    // Rule 2b — `isAdmin={<raw role comparison>}` as a JSX prop
    if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name) && node.name.text === "isAdmin") {
      const init = node.initializer;
      if (init && ts.isJsxExpression(init) && init.expression) {
        isAdminBindings++;
        if (!isDefinition && derivesFromRawRole(init.expression)) {
          violations.push(`${rel}:${line()} — \`isAdmin\` prop is computed from a raw \`.role\` comparison. Use \`isTenantAdminLike(user)\`.`);
        }
      }
    }

    ts.forEachChild(node, visit);
  };
  visit(sf);
}

if (violations.length > 0) {
  console.error(
    "✗ ADMIN-PREDICATE: the UI is deciding admin-ness differently from the server. `isTenantAdminLike` " +
      "is the single answer (admin OR developer); a hand-rolled copy drops `developer` and shows a " +
      "read-only UI to someone the server would have allowed:",
  );
  for (const v of violations) console.error("  " + v);
  process.exit(1);
}
console.log(
  `✓ ADMIN-PREDICATE: ${isAdminBindings} \`isAdmin\` bindings across ${filesScanned} files all derive from ` +
    "`isTenantAdminLike`, and no code compares a role against the unassignable \"owner\".",
);
process.exit(0);
