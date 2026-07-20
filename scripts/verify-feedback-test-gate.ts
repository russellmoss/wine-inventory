/**
 * Regression-test gate for feedback automation PRs.
 * Pass changed paths as args, or set CHANGED_PATHS as newline-separated paths.
 *
 * FAILS when an agent fix changes in-fence code but ships no `test/` change. A fix without
 * a test is a claim that the bug is gone, not a proof — and the whole point of the feedback
 * loop is that the design partner's reports accumulate into an eval suite instead of
 * evaporating into one-off patches.
 *
 * Escape hatch: a HUMAN labels the PR `no-regression-test` (exported as
 * TEST_GATE_OVERRIDE_LABEL), which the CI job passes in as PR_LABELS. Deliberately a human
 * label and not an agent-settable flag — the exception has to stay visible on the PR.
 *
 * Classification lives in ./feedback-fence-rules.ts, the same module the agent and the
 * mechanical fence import, so the three can never drift apart.
 */
import { evaluateTestGate, TEST_GATE_OVERRIDE_LABEL } from "./feedback-fence-rules";

const paths = (process.argv.slice(2).length ? process.argv.slice(2) : (process.env.CHANGED_PATHS ?? "").split(/\r?\n/))
  .map((p) => p.trim())
  .filter(Boolean);

const labels = (process.env.PR_LABELS ?? "")
  .split(",")
  .map((l) => l.trim())
  .filter(Boolean);

const { codePaths, testPaths, missingTest } = evaluateTestGate(paths);

if (!missingTest) {
  if (!codePaths.length) {
    console.log("✓ no in-fence code changes; regression-test gate not applicable");
  } else {
    console.log(`✓ ${codePaths.length} code file(s) ship ${testPaths.length} test change(s): ${testPaths.join(", ")}`);
  }
  process.exit(0);
}

if (labels.includes(TEST_GATE_OVERRIDE_LABEL)) {
  console.log(`⚠ regression-test gate OVERRIDDEN by the \`${TEST_GATE_OVERRIDE_LABEL}\` label.`);
  console.log(`  Changed with no test: ${codePaths.join(", ")}`);
  console.log("  A human took responsibility for shipping this untested. Re-verify by hand before merging.");
  process.exit(0);
}

console.error("✗ FAIL regression-test gate: this fix changes code but adds no test.");
console.error(`  Changed: ${codePaths.join(", ")}`);
console.error("");
console.error("  A fix without a test is a claim, not a proof. Add a case to an EXISTING file");
console.error("  under test/ that fails before this change and passes after it.");
console.error("");
console.error(`  If a test genuinely cannot express this fix (pure visual/copy change), label the`);
console.error(`  PR \`${TEST_GATE_OVERRIDE_LABEL}\` to record that decision and re-run CI.`);
process.exit(1);
