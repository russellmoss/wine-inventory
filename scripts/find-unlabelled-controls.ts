/**
 * Report JSX form controls in `src/` that expose no accessible name.
 *
 *   npx tsx scripts/find-unlabelled-controls.ts            # selects only (default)
 *   npx tsx scripts/find-unlabelled-controls.ts --all      # select + input + textarea
 *
 * The detection logic lives in ./lib/jsx-labels.ts and its correctness is pinned
 * by test/jsx-labels.test.ts. Use this rather than grep: a JSX opening tag does
 * NOT end at the next `>`, and three separate greps got this wrong before the
 * module existed.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { findUnlabelledControls, type ControlTag } from "./lib/jsx-labels";

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

const tags: ControlTag[] = process.argv.includes("--all")
  ? ["select", "input", "textarea"]
  : ["select"];

const findings = walk("src").flatMap((p) =>
  findUnlabelledControls(readFileSync(p, "utf8"), p.split(sep).join("/"), tags),
);

const files = new Set(findings.map((f) => f.file));
console.log(`Scanning for: ${tags.join(", ")}`);
console.log(`UNLABELLED: ${findings.length} across ${files.size} files\n`);

let current = "";
for (const f of findings) {
  if (f.file !== current) {
    console.log(`--- ${f.file}`);
    current = f.file;
  }
  console.log(`  ${f.line}  <${f.tagName}>  ${f.excerpt}`);
}

if (findings.length > 0) process.exitCode = 1;
