/**
 * TENANT-3 guard — the lazy-PrismaPromise tenant-scope trap.
 *
 * A Prisma model method returns a LAZY thenable: calling it only BUILDS the query. Nothing runs —
 * and the tenant extension's `$allOperations` hook (src/lib/prisma.ts) never fires — until something
 * calls `.then()`. `runAsTenant` / `runWithTenantContext` hand their callback to
 * `AsyncLocalStorage.run`, which exits the scope the instant the callback RETURNS. So:
 *
 *     runAsTenant(t, () => prisma.lot.findMany())     // ⚠️ query runs AFTER the ALS scope exits
 *     runAsTenant(t, async () => await prisma.lot.findMany())   // ✓ forced inside the scope
 *
 * With no ambient context the bad form throws "Tenant context required for …". With an ambient OUTER
 * `runAsTenant` still live it silently runs under the OUTER tenant instead of the one explicitly
 * passed — a cross-tenant read/write.
 *
 * `src/lib/tenant/context.ts` now wraps every callback in `async () => await fn()`, so the shape is
 * structurally harmless (pinned by `test/tenant-context-lazy.test.ts`). This scan is the SECOND
 * fence: it keeps call sites written in the form that is correct on its own merits, so the code
 * does not silently depend on the wrapper — and so a reader can never mistake the bad shape for
 * an idiom worth copying.
 *
 * Pure static scan (no DB, no typechecker) over the TypeScript AST — a call split across lines,
 * wrapped in `as`/parens, or written as a block body with a bare `return` is all caught.
 *
 * Known limitation (tripwire, not a proof): a callback aliased to a variable
 * (`const f = () => prisma.x.op(); runAsTenant(t, f)`) is not resolved. That shape is exotic, and
 * the context.ts wrapper covers it at runtime regardless.
 *
 *   npm run verify:tenant-callbacks   (or: npx tsx scripts/check-tenant-callback-shape.ts)
 */
import ts from "typescript";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["src", "scripts", "test", "prisma"];

/** ONLY these two return `store.run(...)` from a NON-async function, so the ALS scope has already
 *  exited by the time the caller awaits the result. `runAsSystem` is `async` and hands back an
 *  UN-extended client (no ALS read); `runInTenantTx` / `runLedgerWrite` pass their callback into an
 *  `async` `$transaction` callback, which forces the thenable inside the scope. Neither can hit
 *  this trap — deliberately not scanned, so the guard stays high-signal. */
const HELPERS = new Set(["runAsTenant", "runWithTenantContext"]);

/** Receiver names that denote a Prisma client whose delegate methods return lazy PrismaPromises. */
const CLIENTS = new Set(["prisma", "prismaBase", "tx", "db", "client"]);

/** Tails that force evaluation (or schedule it) INSIDE the scope — safe to return bare.
 *  `.then/.catch/.finally` run the thenable immediately; `$transaction` is an eager async method. */
const SAFE_TAILS = new Set(["then", "catch", "finally", "$transaction", "$connect", "$disconnect"]);

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
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx|mts)$/.test(p)) out.push(p);
  }
  return out;
}

/** Root identifier of a property-access / call chain: `prisma.a.b()` -> "prisma". */
function rootIdent(node: ts.Node): string | null {
  let n: ts.Node = node;
  for (;;) {
    if (ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n) || ts.isNonNullExpression(n)) n = n.expression;
    else if (ts.isCallExpression(n)) n = n.expression;
    else break;
  }
  return ts.isIdentifier(n) ? n.text : null;
}

function unwrap(expr: ts.Expression): ts.Expression {
  let e = expr;
  while (ts.isAsExpression(e) || ts.isParenthesizedExpression(e) || ts.isNonNullExpression(e) || ts.isSatisfiesExpression(e)) {
    e = e.expression;
  }
  return e;
}

/** A BARE lazy PrismaPromise: a delegate call on a client, not forced by an awaiting/chaining tail. */
function isLazyPrismaCall(expr: ts.Expression): boolean {
  const e = unwrap(expr);
  if (!ts.isCallExpression(e)) return false;
  if (!ts.isPropertyAccessExpression(e.expression)) return false;
  if (SAFE_TAILS.has(e.expression.name.text)) return false;
  const root = rootIdent(e.expression);
  return root !== null && CLIENTS.has(root);
}

/** The expression a non-async callback hands back, if it is a single bare return. */
function returnedExpression(fn: ts.ArrowFunction | ts.FunctionExpression): ts.Expression | null {
  if (ts.isArrowFunction(fn) && !ts.isBlock(fn.body)) return fn.body;
  const body = fn.body;
  if (!body || !ts.isBlock(body)) return null;
  const stmts = body.statements;
  if (stmts.length !== 1) return null;
  const only = stmts[0];
  return ts.isReturnStatement(only) && only.expression ? only.expression : null;
}

const violations: string[] = [];

for (const root of ROOTS) {
  for (const file of walk(root)) {
    const rel = file.split(/[\\/]/).join("/");
    const text = readFileSync(file, "utf8");
    const sf = ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );

    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const callee = ts.isIdentifier(node.expression)
          ? node.expression.text
          : ts.isPropertyAccessExpression(node.expression)
            ? node.expression.name.text
            : null;
        if (callee !== null && HELPERS.has(callee)) {
          for (const arg of node.arguments) {
            if (!ts.isArrowFunction(arg) && !ts.isFunctionExpression(arg)) continue;
            if ((ts.getCombinedModifierFlags(arg) & ts.ModifierFlags.Async) !== 0) continue; // async frame: safe
            const returned = returnedExpression(arg);
            if (returned === null || !isLazyPrismaCall(returned)) continue;
            const { line } = sf.getLineAndCharacterOfPosition(arg.getStart(sf));
            const snippet = returned.getText(sf).replace(/\s+/g, " ").slice(0, 80);
            violations.push(`${rel}:${line + 1}  ${callee}(…, () => ${snippet}…)`);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
}

if (violations.length > 0) {
  console.error(
    "✗ TENANT-3: a non-async callback returns a BARE lazy PrismaPromise to runAsTenant/" +
      "runWithTenantContext. The query would be built inside the ALS scope but RUN after it exits " +
      "(with an ambient outer context live, under the WRONG tenant). Write `async () => await …`:",
  );
  for (const v of violations) console.error("  " + v);
  process.exit(1);
}
console.log(`✓ No bare lazy-PrismaPromise tenant-scope callbacks (TENANT-3 guard, ${ROOTS.join("/")}).`);
process.exit(0);
