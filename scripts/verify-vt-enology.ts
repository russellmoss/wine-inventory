/**
 * Plan 083 Unit 6 — VT Enology Notes section-filter gate.
 *
 *   npm run verify:vt-enology
 *
 * Fetches a live sample spanning all THREE site templates, runs the real filter + the real extractor
 * over each, and reports what was kept and dropped with reasons. Deliberately DB-free so it runs
 * anywhere (no .env, no Neon) -- it proves the FEATURE. Proving the pipeline writes rows is a
 * separate command that does need .env, from the main checkout:
 *
 *   npm run crawl:source vt-enology-notes -- --max 12
 *
 * Guards the two failure modes that are otherwise INVISIBLE:
 *   1. a fourth template appears  -> 0 sections found on an issue that plainly has them
 *   2. the T1 fail-open regresses -> anchorless issues silently vanish from the corpus
 */
import { applySectionFilter } from "@/lib/knowledge/sections";
import { extractHtml } from "@/lib/knowledge/extract/html";
import { findSourceConfig } from "@/lib/knowledge/config";

const UA = "CellarhandKnowledgeBot (+plan-083 verify)";
const DELAY_MS = 1500; // politeness; the host has no robots.txt to give us a Crawl-delay

/** One issue per template family, plus the two the user named. */
const SAMPLE = [
  { n: 5, expect: "T1" },
  { n: 25, expect: "T1" },
  { n: 50, expect: "T2" },
  { n: 112, expect: "T2" },
  { n: 130, expect: "T2" },
  { n: 141, expect: "T2/T3 transition" },
  { n: 159, expect: "T3" },
  { n: 165, expect: "T3" },
  { n: 166, expect: "T3" },
] as const;

/** Content that MUST be gone after filtering (the user's three named sections). */
const MUST_BE_ABSENT: { n: number; needle: string; what: string }[] = [
  { n: 165, needle: "Keith Patterson", what: "165#6 obituary" },
  { n: 166, needle: "9 day technical study tour", what: "166#3 paid study tour" },
  { n: 166, needle: "Amanda Stewart", what: "166#5 staff announcement" },
];

/** Technical content that MUST survive. */
const MUST_BE_PRESENT: { n: number; needle: string; what: string }[] = [
  { n: 166, needle: "Summer rains are the norm", what: "166#1 rot-degraded fruit" },
  { n: 166, needle: "Polysaccharides", what: "166#2a polysaccharide instability" },
  { n: 112, needle: "Sauvignon blanc", what: "112#1 aroma/flavor" },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function templateOf(html: string, sections: number): string {
  if (sections === 0) return "T1 (anchorless)";
  return /<a\s+name="[0-9]+[a-z]*"\s+id=/i.test(html) ? "T3 (id= twins)" : "T2 (no id=)";
}

async function main() {
  const cfg = findSourceConfig("vt-enology-notes");
  if (!cfg) throw new Error("vt-enology-notes is not registered in KNOWLEDGE_SOURCES");
  if (cfg.sectionFilter !== "anchor-heading") throw new Error("source does not declare the section filter");
  if (cfg.autoCrawl === false) throw new Error("source is excluded from the monthly sweep (autoCrawl:false)");

  const failures: string[] = [];
  const markdownByIssue = new Map<number, string>();
  let failOpenCount = 0;
  let totalKept = 0;
  let totalDropped = 0;

  console.log("verify:vt-enology — live sample across all three templates\n");

  for (const { n, expect } of SAMPLE) {
    const url = `https://enology.fst.vt.edu/EN/${n}.html`;
    const res = await fetch(url, { headers: { "user-agent": UA } });
    if (!res.ok) {
      failures.push(`EN-${n}: HTTP ${res.status}`);
      continue;
    }
    const html = await res.text();
    const filtered = applySectionFilter(html);
    const found = filtered.keptAnchors.length + filtered.dropped.length;
    const tpl = templateOf(html, found);

    if (filtered.failedOpen) failOpenCount++;
    totalKept += filtered.keptAnchors.length;
    totalDropped += filtered.dropped.length;

    console.log(`EN-${n}  [${tpl}]  expected ${expect}`);
    if (filtered.failedOpen) {
      console.log(`  fail-open: no anchors, ingesting whole page`);
    } else {
      console.log(`  kept ${filtered.keptAnchors.length}: ${filtered.keptAnchors.join(", ") || "(none)"}`);
      for (const d of filtered.dropped) console.log(`  drop #${d.anchor}  ${d.reason}  — "${d.heading}"`);
    }

    // R4 tripwire: an issue that is NOT T1-era but yields no sections means a template we have
    // never seen. Silent data loss otherwise -- the crawl still reports success.
    if (found === 0 && n > 40) {
      failures.push(`EN-${n}: 0 sections but issue > 40 — probable UNKNOWN TEMPLATE`);
    }

    if (filtered.html === null) {
      failures.push(`EN-${n}: every section dropped — over-aggressive filter?`);
    } else {
      markdownByIssue.set(n, (await extractHtml(filtered.html, url)).markdown);
    }
    console.log("");
    await sleep(DELAY_MS);
  }

  for (const { n, needle, what } of MUST_BE_ABSENT) {
    const md = markdownByIssue.get(n);
    if (md === undefined) continue;
    if (md.includes(needle)) failures.push(`EN-${n}: ${what} SURVIVED the filter (found "${needle}")`);
  }
  for (const { n, needle, what } of MUST_BE_PRESENT) {
    const md = markdownByIssue.get(n);
    if (md === undefined) continue;
    if (!md.includes(needle)) failures.push(`EN-${n}: ${what} was LOST (missing "${needle}")`);
  }

  // The T1 population is bounded: issues #1-40, first anchor observed at #41. If anchorless pages
  // start appearing outside that range the template map is wrong.
  const t1InSample = SAMPLE.filter((s) => s.expect === "T1").length;
  if (failOpenCount !== t1InSample) {
    failures.push(`fail-open count ${failOpenCount} != expected ${t1InSample} — template boundary moved`);
  }

  console.log("─".repeat(72));
  console.log(`sections kept ${totalKept}, dropped ${totalDropped}` +
    (totalKept + totalDropped > 0
      ? ` (${Math.round((totalDropped / (totalKept + totalDropped)) * 100)}% dropped)`
      : ""));
  console.log(`T1 fail-open pages: ${failOpenCount}`);

  if (failures.length) {
    console.error(`\nFAIL (${failures.length}):`);
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log("\nPASS — the three user-named sections are gone, the chemistry survived.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
