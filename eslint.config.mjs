import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored, gitignored design-system skill export (not app source).
    "design-system/**",
    // Temporary agent git worktrees (sibling branch checkouts) — not this branch's source.
    ".claude/worktrees/**",
  ]),
]);

export default eslintConfig;
