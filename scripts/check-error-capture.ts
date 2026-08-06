/**
 * ERRCAP-1 guard — a caught error's message may not be RETURNED without being CAPTURED.
 *
 * THE DEFECT. 40 sites caught an error and returned `e.message` as data, and none of them told Sentry.
 * There were 5 `captureException` calls in the whole of `src/`. NOW.md records the consequence twice in
 * one week — *"an error path that logs nothing is itself the P0"* — once for the assistant, where a turn
 * that died server-side left only an ABSENCE as evidence, and once for the OAuth/Sentry tunnel. Both were
 * this exact shape: `catch (e) { return { error: e.message } }`.
 *
 * WHY THE RULE IS "CAPTURE", NOT "REDACT". Redaction is a judgement per surface, and a blanket rule would
 * be wrong in both directions:
 *   - a CRON route is called by Vercel's scheduler with a bearer secret, and its response body lands in
 *     cron logs. The message there is operator-facing and genuinely useful — redacting it would remove
 *     the only diagnostic an on-call human gets.
 *   - a BROWSER-facing route must not leak it: a Prisma error names tables, columns and constraints.
 * What is invariant across both is that the error must reach Sentry. So that is what this enforces, and
 * redaction stays a call the author makes (`settleWithCapture` chooses to redact; the cron helper does not).
 *
 * WHAT COUNTS AS CAPTURED. `Sentry.captureException` / `captureException` in the same catch block, OR a
 * call to a helper that captures on the author's behalf (`settleWithCapture`, `routeError`, `cronError`) —
 * resolved one level deep through module-local functions, same as the other guards here.
 *
 * Pure static scan over the TypeScript AST. No DB, no typechecker.
 *
 * Known limitations (tripwire, not a proof):
 *   - It proves a capture is REACHED in the catch, not that the right error object was passed to it.
 *   - It only sees a message returned from the catch that caught it. Stashing the error in a variable and
 *     returning it two functions later is invisible.
 *
 *   npm run verify:error-capture   (or: npx tsx scripts/check-error-capture.ts)
 */
import ts from "typescript";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOTS = ["src"];

/** Calls that capture the error, directly or on the caller's behalf. */
const CAPTURES = new Set(["captureException", "settleWithCapture", "routeError", "cronError", "captureMessage"]);

const BASELINE_PATH = join(process.cwd(), "prisma", "error-capture-baseline.json");
/**
 * Baseline anchors on FILE -> COUNT, deliberately not on file:line.
 *
 * Line anchors churn: editing anything above a baselined catch shifts its line and the guard reports a
 * stale entry, so every unrelated change drags a baseline edit along and people stop reading the diff.
 * Counting per file is stable under edits and still ratchets — adding a site raises the count and fails.
 *
 * The tradeoff, stated plainly: fixing one site in a file while adding another leaves the count equal and
 * slips through. That is a narrow hole and review catches it; line churn is the failure that actually
 * erodes a guard's credibility.
 */
const baseline: Map<string, number> = new Map(
  Object.entries(
    (() => {
      try {
        return (JSON.parse(readFileSync(BASELINE_PATH, "utf8")).uncapturedByFile ?? {}) as Record<string, number>;
      } catch {
        return {} as Record<string, number>;
      }
    })(),
  ),
);

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

const calleeName = (n: ts.CallExpression): string | null =>
  ts.isIdentifier(n.expression)
    ? n.expression.text
    : ts.isPropertyAccessExpression(n.expression)
      ? n.expression.name.text
      : null;

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

/** Module-local helpers that themselves capture count as capturing (one level). */
function localCapturers(sf: ts.SourceFile): Set<string> {
  const local = new Set<string>();
  const consider = (name: string | undefined, body: ts.Node | undefined) => {
    if (name === undefined || body === undefined) return;
    if (callsAnyOf(body, CAPTURES)) local.add(name);
  };
  for (const stmt of sf.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.body) consider(stmt.name?.text, stmt.body);
    if (ts.isVariableStatement(stmt)) {
      for (const d of stmt.declarationList.declarations) {
        if (!ts.isIdentifier(d.name) || !d.initializer) continue;
        if (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer)) {
          consider(d.name.text, d.initializer.body);
        }
      }
    }
  }
  return local;
}

/** Does this subtree reference `binding` in a way that reads its message? */
function readsErrorMessage(root: ts.Node, binding: string): boolean {
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found) return;
    // e.message  /  (e as Error).message
    if (ts.isPropertyAccessExpression(n) && n.name.text === "message") {
      let target: ts.Node = n.expression;
      while (ts.isAsExpression(target) || ts.isParenthesizedExpression(target)) target = target.expression;
      if (ts.isIdentifier(target) && target.text === binding) {
        found = true;
        return;
      }
    }
    // String(e)  /  `${e}`
    if (ts.isCallExpression(n) && calleeName(n) === "String") {
      for (const a of n.arguments) if (ts.isIdentifier(a) && a.text === binding) found = true;
    }
    ts.forEachChild(n, visit);
  };
  visit(root);
  return found;
}

/** A returned object literal with an `error`/`message` property built from the caught binding. */
function returnsErrorMessage(catchBlock: ts.Block, binding: string): boolean {
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (ts.isReturnStatement(n) && n.expression) {
      const scan = (node: ts.Node): void => {
        if (found) return;
        if (ts.isPropertyAssignment(node)) {
          const key = ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) ? node.name.text : "";
          if ((key === "error" || key === "message") && readsErrorMessage(node.initializer, binding)) {
            found = true;
            return;
          }
        }
        ts.forEachChild(node, scan);
      };
      scan(n.expression);
    }
    ts.forEachChild(n, visit);
  };
  visit(catchBlock);
  return found;
}

/** file -> how many uncaptured sites it actually has right now. */
const foundByFile = new Map<string, number>();
let checked = 0;

for (const root of ROOTS) {
  for (const file of walk(root)) {
    const text = readFileSync(file, "utf8");
    if (!/catch\s*\(/.test(text)) continue;
    const rel = relative(process.cwd(), file).split("\\").join("/");
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const capturers = new Set([...CAPTURES, ...localCapturers(sf)]);

    const visit = (node: ts.Node): void => {
      if (ts.isCatchClause(node) && node.variableDeclaration && ts.isIdentifier(node.variableDeclaration.name)) {
        const binding = node.variableDeclaration.name.text;
        if (returnsErrorMessage(node.block, binding)) {
          checked++;
          if (!callsAnyOf(node.block, capturers)) {
            foundByFile.set(rel, (foundByFile.get(rel) ?? 0) + 1);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
}

const regressions: string[] = [];
const improvements: string[] = [];
let baselined = 0;

for (const [file, found] of foundByFile) {
  const allowed = baseline.get(file) ?? 0;
  baselined += Math.min(found, allowed);
  if (found > allowed) regressions.push(`${file}  ${found} uncaptured, baseline allows ${allowed}`);
}
for (const [file, allowed] of baseline) {
  const found = foundByFile.get(file) ?? 0;
  if (found < allowed) improvements.push(`${file}  now ${found}, baseline still says ${allowed}`);
}

if (process.argv.includes("--write")) {
  const obj: Record<string, number> = {};
  for (const f of [...foundByFile.keys()].sort()) obj[f] = foundByFile.get(f)!;
  writeFileSync(
    BASELINE_PATH,
    JSON.stringify(
      {
        $comment:
          "SHRINK-ONLY baseline for verify:error-capture (ERRCAP-1). Per FILE, how many catch blocks " +
          "return the caught error's message without capturing it to Sentry. Fix by routing through " +
          "settleWithCapture / routeError / cronError. Anchored on file+count, not line, so ordinary " +
          "edits do not churn it. Lower a number when you fix one; NEVER raise one.",
        total: [...foundByFile.values()].reduce((a, b) => a + b, 0),
        uncapturedByFile: obj,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`✓ ERRCAP-1 baseline written: ${[...foundByFile.values()].reduce((a, b) => a + b, 0)} sites across ${foundByFile.size} files.`);
  process.exit(0);
}

if (improvements.length > 0) {
  console.error(
    `✗ ERRCAP-1: ${improvements.length} file(s) have FEWER uncaptured sites than the baseline allows — ` +
      "good news, but lower the numbers so the ratchet cannot loosen again (npm run verify:error-capture -- --write):",
  );
  for (const i of improvements) console.error(`  ${i}`);
  process.exit(1);
}

if (regressions.length > 0) {
  console.error(
    `✗ ERRCAP-1: ${regressions.length} file(s) RETURN a caught error's message without capturing it. ` +
      "That is the shape that made two P0s invisible — the caller sees a string and no engineer ever " +
      "learns it happened. Route it through `settleWithCapture` (server actions), `routeError` " +
      "(browser-facing routes) or `cronError` (cron), or call Sentry.captureException explicitly:",
  );
  for (const r of regressions) console.error(`  ${r}`);
  process.exit(1);
}

console.log(
  `✓ ERRCAP-1: every catch that returns an error message also captures it ` +
    `(${checked - baselined} compliant, ${baselined} on the shrink-only baseline across ${baseline.size} files).`,
);
process.exit(0);
