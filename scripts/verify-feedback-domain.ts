/**
 * Domain-verify backstop for feedback automation PRs (plan 052, Unit 3).
 *
 * Given the PR's changed paths (args, or newline-separated CHANGED_PATHS), resolve which domain
 * `verify:*` proofs must pass before an auto-merge into that domain is safe, and run them.
 *
 *   • A MAPPED domain (e.g. src/lib/work-orders/) runs its runtime proof; a failure exits non-zero
 *     and blocks the merge (the required `check` job never runs these DB proofs).
 *   • An UNMAPPED widened domain has no runtime proof — this script WARNS and exits 0 (so a human
 *     can still review + merge), but the auto-merge gate (bug-triage) must treat it as needs-human.
 *
 * Set FEEDBACK_DOMAIN_DRY=1 to print the resolution without running anything.
 *
 * Uses the SAME resolver the auto-merge gate reads (scripts/feedback-fence-rules.ts) so the CI
 * proof and the merge policy can't drift.
 */
import { execSync } from "node:child_process";
import { resolveDomainVerifies } from "./feedback-fence-rules";

const paths = (process.argv.slice(2).length
  ? process.argv.slice(2)
  : (process.env.CHANGED_PATHS ?? "").split(/\r?\n/)
).filter(Boolean);

const { scripts, provenDomains, unmappedDomains } = resolveDomainVerifies(paths);

if (unmappedDomains.length) {
  console.warn(
    `⚠ NO DOMAIN PROOF for: ${unmappedDomains.join(", ")}\n` +
      `  These widened domains have no runtime verify gate. A fix here can OPEN a PR, but the\n` +
      `  auto-merge gate must route it to human review — do NOT auto-merge without one.`,
  );
}

if (provenDomains.length) {
  console.log(`Domains with a proof entry: ${provenDomains.join(", ")}`);
}

if (scripts.length === 0) {
  console.log(
    unmappedDomains.length
      ? "No runnable domain proofs (only unmapped/pure-logic domains touched)."
      : "No widened server domains touched; nothing to prove.",
  );
  process.exit(0);
}

const DRY = process.env.FEEDBACK_DOMAIN_DRY === "1";
if (DRY) {
  console.log(`[dry] would run: ${scripts.map((s) => `npm run ${s}`).join(" && ")}`);
  process.exit(0);
}

let failed = 0;
for (const script of scripts) {
  console.log(`\n=== npm run ${script} ===`);
  try {
    execSync(`npm run ${script}`, { stdio: "inherit" });
  } catch {
    console.error(`✗ domain proof failed: ${script}`);
    failed++;
  }
}

if (failed) {
  console.error(`\n✗ ${failed}/${scripts.length} domain proof(s) failed — not merge-safe.`);
  process.exit(1);
}
console.log(`\n✓ ${scripts.length} domain proof(s) passed.`);
process.exit(0);
