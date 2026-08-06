/**
 * MONEY-1 guard — a currency conversion is currency-checked, and the money module does its own arithmetic.
 *
 * TWO RULES, because the FX stage fixed two different defects.
 *
 * RULE 1 — no currency-blind conversion outside the money module.
 *   `convertToBase(amount: number, rate: number, grain)` takes bare numbers, so it cannot tell what
 *   currency the amount is in. Nothing stops converting an already-base figure a second time, or applying
 *   a NZD→USD rate to a EUR one, and the result of either is a PLAUSIBLE NUMBER — the class of bug that
 *   never announces itself. `FxQuote.convert` refuses an Amount whose currency isn't the quote's foreign
 *   side, so every conversion outside `src/lib/money/` must go through it.
 *   Shrink-only allow-list, currently EMPTY: the one historical call site (`ingest-invoice-core.ts`) was
 *   migrated in the same change. Adding an entry is a deliberate, reviewable act.
 *
 * RULE 2 — `src/lib/money/**` may not compute money with float rounding.
 *   No `Math.round`, no `Math.floor`/`Math.ceil` on a money value, no `parseFloat`, and no importing the
 *   VOLUME rounding helpers (`round2` from `@/lib/bottling/draw`, `round8` from `@/lib/cost/rollup`).
 *   That last one is not hypothetical tidiness: `fx/convert.ts` really did `import { round2 } from
 *   "@/lib/bottling/draw"` — money and litres were sharing a rounding function, and the money grain
 *   inherited a helper written for centilitres.
 *
 * WHAT THIS DOES NOT PROVE. It is a tripwire on the FX boundary, not a proof that all money math is
 * decimal. The cost roll-up (`src/lib/cost/`, `src/lib/accounting/`) is still float throughout and is
 * deliberately OUT of scope here — that is the next stage, and pretending otherwise by widening this
 * guard's scope with a large allow-list would make it read as covered when it isn't.
 *
 * Pure static scan. No DB, no typechecker.
 *
 *   npm run verify:money-fx
 */
import ts from "typescript";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const MONEY_DIR = "src/lib/money";

/**
 * Files outside `src/lib/money/` that may still call the currency-blind `convertToBase`.
 * SHRINK-ONLY. Empty is the goal state and the current state — do not add to it without a reason written
 * down in the PR.
 */
const CONVERT_TO_BASE_ALLOWED: readonly string[] = [];

/** Float rounding that must not appear in the money module. */
const FLOAT_ROUNDERS = new Set(["parseFloat"]);
const MATH_ROUNDERS = new Set(["round", "floor", "ceil", "trunc"]);

/**
 * Files inside `src/lib/money/` that are NOT doing money arithmetic, so rule 2 does not apply.
 *
 * Exactly one, named rather than pattern-matched, so a new file cannot join it by accident:
 * `frankfurter.ts` is the HTTP client for the ECB feed. Its `Math.floor` computes a retry backoff in
 * MILLISECONDS with full jitter — a duration, not an amount. The rate it parses is a `number` because
 * that is what JSON gives it; `rate-service` carries the exact string forward from there.
 */
const NOT_MONEY_ARITHMETIC: readonly string[] = ["src/lib/money/fx/frankfurter.ts"];

/** Volume/legacy rounding helpers the money module must not borrow. */
const FORBIDDEN_IMPORTS: Record<string, string> = {
  "@/lib/bottling/draw": "the VOLUME rounding helpers (round2 is centilitre math, not cents)",
  "@/lib/cost/rollup": "the float cost helpers (round8 there is Math.round(n * 1e8))",
};

const GRN = "\x1b[32m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const RST = "\x1b[0m";

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

const rel = (p: string): string => relative(process.cwd(), p).split("\\").join("/");

const parse = (file: string, text: string): ts.SourceFile =>
  ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

const violations: string[] = [];
let convertCalls = 0;
let moneyFiles = 0;

for (const file of walk("src")) {
  const path = rel(file);
  const text = readFileSync(file, "utf8");
  const inMoney = path.startsWith(`${MONEY_DIR}/`);
  const doesMoneyMath = inMoney && !NOT_MONEY_ARITHMETIC.includes(path);
  const sf = parse(file, text);
  const lineOf = (n: ts.Node): number => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;

  if (inMoney) moneyFiles++;

  const visit = (node: ts.Node): void => {
    // ── RULE 1 ──
    if (!inMoney && ts.isCallExpression(node)) {
      const callee = ts.isIdentifier(node.expression)
        ? node.expression.text
        : ts.isPropertyAccessExpression(node.expression)
          ? node.expression.name.text
          : null;
      if (callee === "convertToBase") {
        convertCalls++;
        if (!CONVERT_TO_BASE_ALLOWED.includes(path)) {
          violations.push(
            `${path}:${lineOf(node)}  calls convertToBase — a bare-number conversion cannot check the ` +
              `currency. Resolve an FxQuote (getQuote / FxQuote.of) and call quote.convert(Amount).`,
          );
        }
      }
    }

    // ── RULE 2 ──
    if (doesMoneyMath) {
      if (ts.isCallExpression(node)) {
        if (ts.isIdentifier(node.expression) && FLOAT_ROUNDERS.has(node.expression.text)) {
          violations.push(
            `${path}:${lineOf(node)}  uses ${node.expression.text}() — the money module must stay on ` +
              `Prisma.Decimal. Parse with new Prisma.Decimal(String(v)).`,
          );
        }
        if (
          ts.isPropertyAccessExpression(node.expression) &&
          ts.isIdentifier(node.expression.expression) &&
          node.expression.expression.text === "Math" &&
          MATH_ROUNDERS.has(node.expression.name.text)
        ) {
          violations.push(
            `${path}:${lineOf(node)}  uses Math.${node.expression.name.text}() — float rounding is the ` +
              `defect this module replaces (round2(1.005) was 1, and 11 × 1.085 came out a cent light). ` +
              `Use Decimal.toDecimalPlaces(scale, mode).`,
          );
        }
      }
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const why = FORBIDDEN_IMPORTS[node.moduleSpecifier.text];
        if (why !== undefined) {
          violations.push(`${path}:${lineOf(node)}  imports ${node.moduleSpecifier.text} — ${why}.`);
        }
      }
    }

    ts.forEachChild(node, visit);
  };
  visit(sf);
}

// A stale allow-list entry is a violation too: it says "this file still needs the escape hatch" when it
// does not, and the ratchet must only ever tighten.
for (const allowed of CONVERT_TO_BASE_ALLOWED) {
  const text = (() => {
    try {
      return readFileSync(join(process.cwd(), allowed), "utf8");
    } catch {
      return null;
    }
  })();
  if (text === null || !text.includes("convertToBase")) {
    violations.push(`${allowed}  is on the convertToBase allow-list but no longer calls it — remove the entry.`);
  }
}

if (violations.length > 0) {
  console.error(`\n${RED}✗ MONEY-1: ${violations.length} violation(s).${RST}\n`);
  for (const v of violations) console.error(`  ${v}`);
  console.error(
    `\n${DIM}MONEY-1: a currency conversion is currency-checked, and the money module does its own\n` +
      `arithmetic. See docs/architecture/invariants/MONEY-1-a-conversion-is-currency-checked.md${RST}\n`,
  );
  process.exit(1);
}

console.log(
  `\n${GRN}✓ MONEY-1: every FX conversion outside src/lib/money is currency-checked, and the money ` +
    `module carries no float rounding.${RST}\n` +
    `  ${DIM}${moneyFiles} money files scanned · ${convertCalls} legacy convertToBase call(s) outside the ` +
    `module · allow-list holds ${CONVERT_TO_BASE_ALLOWED.length}${RST}\n`,
);
process.exit(0);
