/**
 * Mechanical write-fence for feedback automation PRs.
 * Pass changed paths as args, or set CHANGED_PATHS as newline-separated paths.
 */
const deniedPrefixes = [
  ".env",
  ".github/workflows/",
  "prisma/migrations/",
  "src/lib/auth",
  "src/lib/dal",
  "src/lib/tenant/",
  "src/lib/prisma",
];

const allowedPrefixes = [
  "src/lib/assistant/",
  "src/app/(app)/assistant/",
  "src/components/",
  "src/app/(app)/help/",
  "src/app/api/feedback/",
];

function norm(path: string): string {
  return path.replace(/\\/g, "/").replace(/^"\s*|\s*"$/g, "");
}

function denied(path: string): boolean {
  return deniedPrefixes.some((prefix) => path === prefix || path.startsWith(prefix));
}

function allowed(path: string): boolean {
  return allowedPrefixes.some((prefix) => path.startsWith(prefix));
}

const paths = (process.argv.slice(2).length ? process.argv.slice(2) : (process.env.CHANGED_PATHS ?? "").split(/\r?\n/))
  .map(norm)
  .filter(Boolean);

let failures = 0;
for (const path of paths) {
  if (denied(path)) {
    console.error(`✗ FAIL denied path touched: ${path}`);
    failures++;
  } else if (!allowed(path)) {
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
