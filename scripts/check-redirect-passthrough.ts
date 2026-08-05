/**
 * REDIRECT-1 guard — the swallowed-`redirect()` trap in server actions.
 *
 * The `require*` gates in `src/lib/dal.ts` do NOT return a decision: they call Next's `redirect()`,
 * which signals by THROWING an internal `NEXT_REDIRECT` error that the framework is meant to catch.
 * `getCurrentUser()` also reads `headers()`, whose request-time bailout throws the same way. So a
 * catch-all around a gate turns framework control flow into an app error:
 *
 *     try {
 *       await requireReadyUser();                      // throws NEXT_REDIRECT on an expired session
 *       …
 *     } catch (e) {
 *       return { ok: false, error: e.message };         // ⚠️ "NEXT_REDIRECT;replace;/login;307;"
 *     }
 *
 * The user is never bounced to /login — the raw digest string is rendered in the UI as the error
 * message. This shipped on the weather, spray, and planned-harvest surfaces (21 actions).
 *
 * The fix is `unstable_rethrow(e)` as the FIRST statement of the catch: it re-throws exactly the
 * framework-controlled errors (redirect / permanentRedirect / notFound / dynamic-API bailouts) and
 * falls through for genuine app errors, so a `{ ok: false }` contract is unchanged.
 * Ref: node_modules/next/dist/docs/01-app/03-api-reference/04-functions/unstable_rethrow.md
 *
 * This scan flags any `try` whose block reaches a redirect-throwing gate and whose `catch` SWALLOWS
 * (does not rethrow and does not lead with `unstable_rethrow`). A catch that already ends in `throw`
 * is fine — it never converted the signal.
 *
 * Pure static scan (no DB, no typechecker) over the TypeScript AST.
 *
 * Known limitations (tripwire, not a proof):
 *   - Gate resolution is ONE level deep: a module-local function whose own body calls a known gate
 *     counts as a gate (this is how `weather/actions.ts`'s `requireTenant()` is caught). A gate
 *     reached through a second hop, another module, or a variable alias is not resolved.
 *   - Only `"use server"` files are scanned — that is where a swallowed redirect is user-visible.
 *
 *   npm run verify:redirect-passthrough   (or: npx tsx scripts/check-redirect-passthrough.ts)
 */
import ts from "typescript";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOTS = ["src"];

/** The `src/lib/dal.ts` gates that signal by calling `redirect()`. Each THROWS, never returns a flag. */
const GATES = new Set([
  "requireReadyUser",
  "requireAdmin",
  "requireSession",
  "requireDeveloper",
  "requireActiveTenant",
]);

/** The Next helper that re-throws framework-controlled errors and falls through for app errors. */
const RETHROW = "unstable_rethrow";

function walk(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === "node_modules" || name === ".next") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

/** The callee name of a call expression, for both `f()` and `o.f()`. */
function calleeName(node: ts.CallExpression): string | null {
  if (ts.isIdentifier(node.expression)) return node.expression.text;
  if (ts.isPropertyAccessExpression(node.expression)) return node.expression.name.text;
  return null;
}

/** Does this subtree call any of `names`? */
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

/**
 * Module-local functions whose body reaches a known gate — these are gates too (one level deep).
 * Covers the `async function requireTenant() { await requireReadyUser(); … }` wrapper shape.
 */
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

/** Does this catch clause hand control back to the framework? */
function catchIsSafe(clause: ts.CatchClause): boolean {
  const stmts = clause.block.statements;
  if (stmts.length === 0) return false;
  // Leads with `unstable_rethrow(e)` — the prescribed fix.
  const first = stmts[0];
  if (
    ts.isExpressionStatement(first) &&
    ts.isCallExpression(first.expression) &&
    calleeName(first.expression) === RETHROW
  ) {
    return true;
  }
  // Or it never converts the signal at all: every path rethrows.
  return stmts.every((s) => ts.isThrowStatement(s));
}

const violations: string[] = [];

for (const root of ROOTS) {
  for (const file of walk(root)) {
    const text = readFileSync(file, "utf8");
    if (!/^\s*["']use server["']/m.test(text)) continue;
    const rel = relative(process.cwd(), file).split("\\").join("/");
    const sf = ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );

    const gates = new Set([...GATES, ...localGateNames(sf)]);

    const visit = (node: ts.Node): void => {
      if (ts.isTryStatement(node) && node.catchClause) {
        if (callsAnyOf(node.tryBlock, gates) && !catchIsSafe(node.catchClause)) {
          const { line } = sf.getLineAndCharacterOfPosition(node.catchClause.getStart(sf));
          violations.push(`${rel}:${line + 1}`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
}

if (violations.length > 0) {
  console.error(
    `✗ REDIRECT-1: a catch-all wraps a redirect-throwing gate without \`${RETHROW}(e)\` first. ` +
      "Next's `redirect()` signals by THROWING NEXT_REDIRECT; swallowing it renders " +
      '"NEXT_REDIRECT;replace;/login;307;" as the error message instead of bouncing to /login. ' +
      `Add \`${RETHROW}(e);\` as the first statement of the catch (import from "next/navigation"), ` +
      "or hoist the gate above the try:",
  );
  for (const v of violations) console.error("  " + v);
  process.exit(1);
}
console.log(`✓ No swallowed redirect() signals in "use server" files (REDIRECT-1 guard, ${ROOTS.join("/")}).`);
process.exit(0);
