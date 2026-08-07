/**
 * REGISTER-1 guard — an invariant's declared guard must actually RUN, or say why it doesn't.
 *
 * THE DEFECT THIS EXISTS FOR. `npm run verify:invariants` checks that each invariant's `verify:` script
 * EXISTS. Its own README calls that "detection only", and it is: a script can exist, pass, and never be
 * executed by CI — or be executed and test something else entirely. Two real cases found on 2026-08-06:
 *
 *   LEDGER-9  `verify:` pointed at `verify:reverse`, a 264-line REVERSAL-SEMANTICS proof with no
 *             reference to rounding, decimals or balance, whose only fractional literals are 0.5 and
 *             13.5. It could not have failed for the invariant it was named against.
 *   COST-1    severity: critical. Its guard is `tsx --env-file=.env`, i.e. it needs a database — so it
 *             ran in NO CI job, and its one pure check (`transferImbalance`) was a tautology returning
 *             0 for any input, including transfers taking 120% of a parent.
 *
 * Both were invisible because **a guard that cannot fail is indistinguishable from a passing one.** A
 * MISSING guard is visible; this class is not.
 *
 * WHAT THIS PROVES — precisely, and no more:
 *   ✅ every guarded invariant's declared `verify:` is REACHED by a CI job on a pull request,
 *   ✅ or it is on the manual-proof baseline WITH a written reason.
 *
 * WHAT IT DOES NOT PROVE — stated plainly, because overstating coverage is the very thing it exists to
 * stop:
 *   ❌ that the guard tests the invariant it is named against (the LEDGER-9 mode),
 *   ❌ that the guard's assertions can ever be false (the COST-1 tautology mode),
 *   ❌ that the guard's predicate has no blind spot (GLOBAL-1's read-name heuristic once skipped
 *      `getOrCreateX`).
 * Those three need a human asking "can this assertion fail?" — the practical form being an ABLATION:
 * break the code on purpose and confirm the guard screams. Do that for every new invariant.
 *
 * HOW REACHABILITY IS DECIDED. A guard counts as reached when:
 *   1. `npm run <script>` appears literally in a ci.yml job, OR
 *   2. the resolved command is a `vitest` invocation — CI's `check` job ends with a bare `npx vitest run`,
 *      which executes the WHOLE suite, so any vitest-backed guard genuinely runs, OR
 *   3. the resolved script path appears in ci.yml under some other invocation.
 *
 * Rule 2 is generous ON PURPOSE and it is still true: the file executes. It says nothing about whether the
 * assertions inside are meaningful — see the ❌ list.
 *
 *   npm run verify:invariant-coverage
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const INV_DIR = join(process.cwd(), "docs", "architecture", "invariants");
const BASELINE = join(INV_DIR, "manual-proof-baseline.json");
const CI = join(process.cwd(), ".github", "workflows", "ci.yml");

const RED = "\x1b[31m";
const GRN = "\x1b[32m";
const YEL = "\x1b[33m";
const DIM = "\x1b[2m";
const RST = "\x1b[0m";

type Note = { id: string; severity: string; status: string; verify: string | null; file: string };

function parseNotes(): Note[] {
  const out: Note[] = [];
  for (const name of readdirSync(INV_DIR)) {
    if (!name.endsWith(".md") || name === "README.md") continue;
    const text = readFileSync(join(INV_DIR, name), "utf8").split("\r\n").join("\n");
    const fm = /^---\n([\s\S]*?)\n---/.exec(text);
    if (!fm) continue;
    const field = (k: string): string | null => {
      const m = new RegExp(`^${k}:\\s*"?(.+?)"?\\s*$`, "m").exec(fm[1]);
      return m ? m[1].trim() : null;
    };
    const id = field("id");
    if (id === null) continue;
    out.push({
      id,
      severity: field("severity") ?? "?",
      status: field("status") ?? "?",
      verify: field("verify"),
      file: name,
    });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

const ciText = readFileSync(CI, "utf8");
const pkgScripts = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")).scripts as Record<
  string,
  string
>;

/** A suite that self-skips without an env var executes but asserts nothing. */
function isEnvGated(testFile: string): boolean {
  try {
    const t = readFileSync(join(process.cwd(), testFile), "utf8");
    return /skipIf|describe\.skip|process\.env\.[A-Z_]+\s*[!=]==/.test(t);
  } catch {
    return false;
  }
}

/** `npm run verify:x -- args` → the script name; a bare path stays itself. */
function scriptNameOf(verify: string): string | null {
  const m = /^npm run ([\w:-]+)/.exec(verify.trim());
  return m ? m[1] : null;
}

type Reach =
  | { reached: true; how: string }
  | { reached: false; why: string };

function reachability(verify: string): Reach {
  const name = scriptNameOf(verify);
  const body = name !== null ? (pkgScripts[name] ?? "") : verify;

  // 1. invoked by name in a CI job
  if (name !== null && new RegExp(`npm run ${name}(?![\\w:-])`).test(ciText)) {
    return { reached: true, how: "invoked directly by a CI job" };
  }
  // 2. a vitest invocation — the `check` job's bare `npx vitest run` executes the whole suite.
  //    EXCEPT an env-gated suite: `test/tenant-isolation.test.ts` and `test/developer-feedback-db.test.ts`
  //    self-skip unless their env var is set, so the plain run EXECUTES them and proves nothing. Crediting
  //    those would be precisely the over-claim this guard exists to prevent, so they only count when a CI
  //    job names the file (rule 3).
  if (/\bvitest\b/.test(body)) {
    const target = /(test\/[\w.-]+\.test\.tsx?)/.exec(body);
    const gated = target !== null && isEnvGated(target[1]);
    if (!gated) return { reached: true, how: "vitest — runs inside the check job's full `npx vitest run`" };
    if (ciText.includes(target![1])) return { reached: true, how: `\`${target![1]}\` is named by a CI job` };
    return { reached: false, why: `\`${target![1]}\` self-skips without its env var and no CI job sets it` };
  }
  // 3. the script file itself is invoked some other way in CI
  const path = /(scripts\/[\w.-]+\.ts)/.exec(body) ?? /(scripts\/[\w.-]+\.ts)/.exec(verify);
  if (path !== null && ciText.includes(path[1])) {
    return { reached: true, how: `\`${path[1]}\` is invoked by a CI job` };
  }

  const needsDb = /--env-file/.test(body);
  return {
    reached: false,
    why: needsDb ? "needs a database (--env-file); no CI job runs it" : "no CI job runs it",
  };
}

const baseline: Record<string, string> = (() => {
  try {
    return JSON.parse(readFileSync(BASELINE, "utf8")).manualProofs ?? {};
  } catch {
    return {};
  }
})();

const notes = parseNotes();
const guarded = notes.filter((n) => n.status === "guarded");

const missing: Note[] = []; // unreached AND not baselined → fail
const stale: string[] = []; // baselined but now reached, or no longer an invariant → fail
const manual: Note[] = []; // unreached, baselined with a reason → allowed
const reached: { note: Note; how: string }[] = [];

for (const n of guarded) {
  if (n.verify === null) continue; // verify:invariant-frontmatter already fails this
  const r = reachability(n.verify);
  if (r.reached) {
    reached.push({ note: n, how: r.how });
    if (baseline[n.id] !== undefined) {
      stale.push(`${n.id}  is on the manual-proof baseline but its guard IS reached (${r.how}) — remove the entry.`);
    }
  } else if (baseline[n.id] !== undefined) {
    manual.push(n);
  } else {
    missing.push(n);
  }
}
for (const id of Object.keys(baseline)) {
  if (!guarded.some((n) => n.id === id)) {
    stale.push(`${id}  is on the manual-proof baseline but is not a guarded invariant — remove the entry.`);
  }
}

// Not a failure, but worth surfacing: one script standing in for many invariants is where a guard is most
// likely to be a poor fit for at least one of them. LEDGER-9 was exactly this — 1 of 8 sharing verify:reverse.
const byGuard = new Map<string, string[]>();
for (const n of guarded) {
  if (n.verify === null) continue;
  const key = scriptNameOf(n.verify) ?? n.verify;
  byGuard.set(key, [...(byGuard.get(key) ?? []), n.id]);
}
const shared = [...byGuard.entries()].filter(([, ids]) => ids.length >= 4).sort((a, b) => b[1].length - a[1].length);

if (missing.length > 0 || stale.length > 0) {
  if (missing.length > 0) {
    console.error(
      `\n${RED}✗ REGISTER-1: ${missing.length} guarded invariant(s) declare a guard that NO CI job runs, ` +
        `and are not on the manual-proof baseline.${RST}\n`,
    );
    for (const n of missing) {
      console.error(`  ${n.id.padEnd(14)}${n.severity.padEnd(10)}${n.verify}`);
      console.error(`  ${" ".repeat(24)}${DIM}${reachability(n.verify!).reached ? "" : (reachability(n.verify!) as { why: string }).why}${RST}`);
    }
    console.error(
      `\n${DIM}  Either wire the guard into .github/workflows/ci.yml, point the note at a guard that DOES\n` +
        `  run, or add it to ${BASELINE.replace(process.cwd() + "/", "")} with a one-line reason.${RST}`,
    );
  }
  if (stale.length > 0) {
    console.error(`\n${RED}✗ REGISTER-1: ${stale.length} stale baseline entr(y/ies).${RST}\n`);
    for (const s of stale) console.error(`  ${s}`);
  }
  console.error("");
  process.exit(1);
}

console.log(
  `\n${GRN}✓ REGISTER-1: every guarded invariant's declared guard is reached by CI, or is a documented ` +
    `manual proof.${RST}`,
);
console.log(
  `  ${DIM}${reached.length} reached in CI · ${manual.length} documented manual/DB proofs · ` +
    `${guarded.length} guarded invariants total${RST}`,
);
if (shared.length > 0) {
  console.log(
    `\n${YEL}  ⚠ Guards standing in for many invariants — the shape LEDGER-9 hid in (1 of 8 sharing\n` +
      `    verify:reverse, and it tested none of them). Not a failure; worth an ablation each:${RST}`,
  );
  for (const [g, ids] of shared) console.log(`    ${DIM}${g.padEnd(30)} ${ids.length}: ${ids.join(", ")}${RST}`);
}
console.log("");
process.exit(0);
