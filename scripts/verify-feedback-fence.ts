/**
 * Mechanical write-fence for feedback automation PRs.
 * Pass changed paths as args, or set CHANGED_PATHS as newline-separated paths.
 *
 * Allow/deny rules live in ./feedback-fence-rules.ts — the SAME module the bug-fix agent
 * uses to restrict itself, so the agent and this CI gate can never disagree.
 */
import { normPath, isDenied, isAllowed } from "./feedback-fence-rules";

const paths = (process.argv.slice(2).length ? process.argv.slice(2) : (process.env.CHANGED_PATHS ?? "").split(/\r?\n/))
  .map(normPath)
  .filter(Boolean);

let failures = 0;
for (const path of paths) {
  if (isDenied(path)) {
    console.error(`✗ FAIL denied path touched: ${path}`);
    failures++;
  } else if (!isAllowed(path)) {
    console.error(`✗ FAIL outside feedback automation allowlist: ${path}`);
    failures++;
  }
}

if (!paths.length) {
  console.log("✓ no changed paths supplied; fence self-check passed");
} else if (!failures) {
  console.log(`✓ ${paths.length} changed path(s) passed feedback automation fence`);
}
process.exit(failures === 0 ? 0 : 1);
