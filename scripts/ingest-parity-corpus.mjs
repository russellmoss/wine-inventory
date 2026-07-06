#!/usr/bin/env node
// -----------------------------------------------------------------------------
// ingest-parity-corpus — generate the Capability-Parity register from the
// competitor corpus indexes (vintrace-docs/INDEX.md + innovint-docs/INDEX.md).
//
// One note per incumbent help-center article, defaulting to `status: gap`, so
// docs/architecture/parity/ is CORPUS-COMPLETE and the dashboard shows an honest
// coverage ratio (a real, small numerator against the full ~1000-article universe)
// instead of a hand-picked subset that looks done. (council C4.)
//
// IDEMPOTENT: re-running preserves hand-enrichment. Precedence for the mutable
// fields (status / ourApproach / aiNativeEdge / evidence):
//     existing hand-edited note  >  the ENRICHMENT map below  >  gap default
// The immutable stubs (id / incumbent / capability / group / corpus source) are
// always regenerated from the index, so re-scraping the corpus keeps them fresh.
//
// Pure Node, no deps. Run: node scripts/ingest-parity-corpus.mjs
// -----------------------------------------------------------------------------
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseFrontmatter, readNote } from "./lib/vault-notes.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const PARITY_DIR = join(REPO, "docs", "architecture", "parity");

const SOURCES = [
  { incumbent: "vintrace", abbr: "VT", dir: "vintrace-docs" },
  { incumbent: "innovint", abbr: "IV", dir: "innovint-docs" },
];

// Hand-enrichment, keyed by corpus path (relative to the incumbent's dir). Only
// list capabilities we can back with a resolving code path. Everything else is a
// gap by default. This map is the version-controlled, auditable "we cover this".
// `evidence` for a covered entry MUST resolve to a real file inside the repo.
const ENRICHMENT = {
  "vintrace-docs/vintrace-web/barrel-management/rack-and-return-of-barrels.md": {
    status: "covered",
    ourApproach: "RACK op / transferWineCore (rack out to barrels, then back)",
    aiNativeEdge: "rack tank 1 into barrel 14",
    evidence: "src/lib/vessels/rack-core.ts",
  },
  "vintrace-docs/vintrace-web/barrel-management/transferring-wine-to-barrel.md": {
    status: "covered",
    ourApproach: "RACK op / transferWineCore (vessel-to-barrel transfer)",
    aiNativeEdge: "transfer 200 L from tank 3 to barrel 8",
    evidence: "src/lib/vessels/rack-core.ts",
  },
  // Known gaps called out in the incumbent teardown (SYNTHESIS.md §B.2) — keep
  // them visible as PARTIAL so the register captures gaps, not just wins.
  "vintrace-docs/vintrace-web/barrel-management/setting-up-a-barrel-group.md": {
    status: "partial",
    ourApproach: "barrel fills exist in the cost DAG; no first-class barrel-GROUP CRUD affordance yet",
    aiNativeEdge: "parity only",
  },
  "vintrace-docs/vintrace-web/barrel-management/combining-barrels-or-barrel-groups.md": {
    status: "partial",
    ourApproach: "no first-class barrel-group combine/break; tracked as a Phase-3-family gap",
    aiNativeEdge: "parity only",
  },
};

const STATUSES = new Set(["covered", "partial", "gap", "deliberately-omitted"]);

// djb2 → 8 hex chars. Deterministic short id so filenames stay well under the
// Windows path limit (the parity dir is already deep). Human label lives in
// `capability`; the base dashboard groups on `capability`, not the filename.
function hash8(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0");
}

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// (frontmatter parsing for existing notes reuses the shared scripts/lib/vault-notes.mjs
// parseFrontmatter — one parser, so read/write quote-escaping can't drift.)

// Parse an INDEX.md: track the current `## Category` and collect every
// `- [Title](relpath.md)` bullet (first markdown link only).
function parseIndex(text) {
  const out = [];
  let group = "misc";
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const cat = raw.match(/^##\s+(.+?)\s*(\(\d+[^)]*\))?\s*$/);
    if (cat) { group = slug(cat[1]); continue; }
    const bullet = raw.match(/^-\s+\[(.+?)\]\(([^)]+?\.md)\)/);
    if (bullet) out.push({ title: bullet[1].trim(), rel: bullet[2].trim(), group });
  }
  return out;
}

function esc(v) {
  // Quote scalars that could confuse the minimal frontmatter reader.
  if (v === "" || /[:#"']/.test(v) || /^\s|\s$/.test(v)) return JSON.stringify(v);
  return v;
}

function noteBody(fm, corpusPath) {
  const stance =
    fm.status === "covered" ? "we cover this"
    : fm.status === "partial" ? "partial — see below"
    : fm.status === "deliberately-omitted" ? "deliberately omitted"
    : "gap — not yet built";
  return `---
id: ${fm.id}
group: ${esc(fm.group)}
incumbent: ${fm.incumbent}
capability: ${esc(fm.capability)}
status: ${fm.status}
ourApproach: ${esc(fm.ourApproach)}
aiNativeEdge: ${esc(fm.aiNativeEdge)}
evidence: ${esc(fm.evidence)}
tags:
  - parity
---

# ${fm.id} — ${fm.capability}

> [!info] Parity (${fm.incumbent}) — ${stance}.

- **Incumbent:** ${fm.incumbent}
- **Our approach:** ${fm.ourApproach || "—"}
- **AI-native edge:** ${fm.aiNativeEdge || "—"}
- **Evidence:** \`${fm.evidence}\`
- **Source:** \`${corpusPath}\` — see [[assistant-coverage]] / [[system-map]]
`;
}

if (!existsSync(PARITY_DIR)) mkdirSync(PARITY_DIR, { recursive: true });

// Index existing notes by id so we can preserve hand-enrichment on re-run.
const existingById = {};
for (const f of readdirSync(PARITY_DIR)) {
  if (!f.endsWith(".md") || f === "README.md") continue;
  const fm = parseFrontmatter(readNote(join(PARITY_DIR, f)));
  if (fm.id) existingById[fm.id] = { file: f, fm };
}

let created = 0, updated = 0, preserved = 0;
const byStatus = { covered: 0, partial: 0, gap: 0, "deliberately-omitted": 0 };
const seenIds = new Set();

for (const src of SOURCES) {
  const indexPath = join(REPO, src.dir, "INDEX.md");
  if (!existsSync(indexPath)) {
    console.error(`\x1b[31mMissing corpus index: ${src.dir}/INDEX.md\x1b[0m`);
    process.exit(1);
  }
  for (const art of parseIndex(readFileSync(indexPath, "utf8"))) {
    const corpusPath = `${src.dir}/${art.rel}`; // repo-relative
    // Deterministic id; on the rare djb2 collision, disambiguate (don't wedge the
    // gate with a hard exit). Same corpus order → same suffix on every run.
    let id = `PARITY-${src.abbr}-${hash8(art.rel)}`;
    if (seenIds.has(id)) { let n = 2; while (seenIds.has(`${id}-${n}`)) n++; id = `${id}-${n}`; }
    seenIds.add(id);

    // Precedence: existing hand-edit > ENRICHMENT map > gap default.
    // KNOWN LIMITATION: an existing note with status !== "gap" is treated as
    // hand-enriched and wins; deliberately downgrading a MAPPED article back to
    // `gap` on disk will be re-applied by ENRICHMENT on the next run. The ENRICHMENT
    // map is the curated source of truth for those few entries — edit the map, not
    // the generated note, to change a mapped article's status.
    const enr = ENRICHMENT[corpusPath] || {};
    const prev = existingById[id]?.fm || {};
    const prevEnriched = prev.status && prev.status !== "gap";
    const pick = (field, dflt) =>
      (prevEnriched && prev[field] != null ? prev[field] : enr[field] != null ? enr[field] : dflt);

    const fm = {
      id,
      group: art.group,
      incumbent: src.incumbent,
      capability: art.title,
      status: pick("status", "gap"),
      ourApproach: pick("ourApproach", ""),
      aiNativeEdge: pick("aiNativeEdge", ""),
      // gap/partial/omitted → corpus link (warn-only); covered → code path.
      evidence: pick("evidence", corpusPath),
    };
    if (!STATUSES.has(fm.status)) fm.status = "gap";
    byStatus[fm.status]++;

    const file = `${id}.md`;
    const body = noteBody(fm, corpusPath);
    const abs = join(PARITY_DIR, file);
    const before = existsSync(abs) ? readFileSync(abs, "utf8").replace(/\r\n?/g, "\n") : null;
    if (before === body) { preserved++; continue; }
    writeFileSync(abs, body, "utf8");
    if (before == null) created++; else updated++;
  }
}

console.log(
  `parity ingest: ${created} created, ${updated} updated, ${preserved} unchanged, ${seenIds.size} total\n` +
    `  covered ${byStatus.covered} · partial ${byStatus.partial} · gap ${byStatus.gap} · omitted ${byStatus["deliberately-omitted"]}` +
    `  (${((byStatus.covered / seenIds.size) * 100).toFixed(1)}% covered)`
);
