# Council Feedback — Plan 099: KB text integrity + PNW Handbooks

**Date:** 2026-07-26
**Plan:** `docs/plans/2026-07-26-099-fix-kb-text-integrity-and-pnw-handbooks-plan.md`
**Reviewers:** Codex `gpt-5.4` (correctness, types, data layer) · Gemini `gemini-3.1-pro-preview` (domain, data quality, retrieval)

Both reviewers found real defects. Nine findings change the plan materially, two of them change a
design decision, and **the reviewers directly contradict each other on one question** (§C1).

---

## Critical Issues

### C1. The two reviewers conflict: fix the loss, or fix the boundary rule too? — **SIDE WITH CODEX**

Unit 1 says "keep the existing sentence-boundary semantics — identical boundaries with total
coverage, not better sentence detection."

- **Gemini calls that a critical flaw.** The existing rule splits at `.` + whitespace, which shatters
  `approx. 24.5`, `var.`, `spp.`, `cv.`, `subsp.`, `Dr.`, `BBCH 12.`, and European decimal formatting
  (`1.500,00` in the Spanish/Catalan/French sources). It wants a domain-aware boundary detector with
  a negative-lookahead on digits and an abbreviation list.
- **Codex says explicitly: do not "improve" sentence detection in this change**, and narrows parity
  to inputs where the old matcher covered the full string.

**Verdict: Codex is right on sequencing, Gemini is right that the defect exists.** These are two
different bugs with two different severities. Character *deletion* silently changes a number's value
(`0.5` → `5`, a tenfold error). A boundary *in the wrong place* splits a sentence across two chunks
that already carry 75 tokens of deliberate overlap — degraded retrieval, not corrupted data. Bundling
a semantic rewrite into the integrity fix destroys the parity control that proves the fix is safe.

**Action:** keep Unit 1 as an integrity-only fix. File the abbreviation/decimal boundary quality
issue as its own item with Gemini's specific list. Note one thing Gemini got wrong: `"1. 5 gal"` is
already-corrupted input, not something the boundary rule produces.

### C2. Parity and total coverage are in direct tension — the success criterion is unsatisfiable as written

Codex: you cannot preserve old output for `"abc. 0.5 def"`, because the old output *omits bytes*.
"Chunk boundaries on ordinary prose unchanged" is therefore not a well-formed acceptance test.

**Fix:** narrow parity to inputs satisfying `oldParts.join("") === input`. On any input where the old
matcher had a dead zone, coverage wins and parity is explicitly waived. Rewrite that success
criterion.

### C3. Scoping the re-index to "confirmed damaged" documents is not defensible

Codex, and this is the finding that most changes the plan. Once the chunker version is bumped, every
document indexed by the old chunker is *semantically stale*. The heuristic cannot prove absence:
`1.10` → `10` and prose-swallowing drops leave no text-shape signature. Spot checks must not define
the write set.

**Complication neither reviewer knew about, and it makes this harder than Codex's fix implies:**
`knowledge_blob.blobUrl` is NULL corpus-wide, so we cannot re-read stored bytes — re-indexing means
**re-fetching**. And ~578 documents are robots-blocked from re-fetch despite already being in the
corpus. So "re-index everything stale" is partially *impossible*, not merely expensive.

**Fix:** compute the stale set deterministically (documents whose chunks could have hit the
force-split path — derivable from stored `tokenCount` per chunk without re-fetching), then partition
into re-fetchable and not. Re-index the first. For the second, the honest options are withdraw or
carry a known-unverifiable marker. Do not report a corpus as clean when part of it could not be
adjudicated.

### C4. The idempotency hash must be derived from RAW content, not filtered HTML

Codex, and this is the sharpest finding in either review. If Unit 8 moves filtering above the gate
and the hash is then computed from filtered HTML, **changes inside currently-dropped sections become
invisible**. The moment the filter rules change and previously-dropped content becomes admissible,
you are serving a stale snapshot with no way to know.

**Fix:** `contentHash` stays a fingerprint of the raw fetched bytes. Salt it with the resolved filter
strategy identity + version and the chunker version. Filtering affects indexed *output*, never the
source *fingerprint*.

### C5. Two independent destructive clear paths can diverge

The gate clears chunks and returns `skipped: "product-table"`; the section filter clears chunks and
returns `skipped: "empty"`. Codex: these can double-clear and leave `activeRevision` inconsistent
with `indexedContentHash` and with the actual chunk set.

**Fix:** one atomic `clearIndexedDocument(reason, hashState)` used by both. Make section filtering a
**pure prepass returning `{ candidateHtml, empty }`** that never touches the database itself.

### C6. Adopt Codex's cheaper alternative to Unit 8 — do not relocate the gate

Codex's design question, and it is better than what the plan proposes. Instead of moving a
safety-critical gate: resolve filtered candidate HTML first as a pure projection, pass *that* to
`assessProductTable`, and let one centralized decision point choose between `product-table`, `empty`,
or proceed. Same outcome, no destructive logic relocated, and it collapses C5 into the same change.

This also answers Gemini's design question about the gate being "async cleanup" — Gemini misread
that. The inline gate in `index-documents.ts` **is** a hard block at ingestion; `verify:kb-boundary`
is a separate auditor that proves the gate did not leak. No change needed there.

### C7. The cross-region test in Unit 11 is designed backwards

Gemini, and this is correct and important. Unit 11 proposes running "regionally-specific questions."
But MMR contamination surfaces on **generic** queries: a Bhutan tenant asks "how do I manage powdery
mildew", the dense retrieval returns Bhutan-relevant chunks, and `mmrSelect(..., 0.7)` then actively
*rewards dissimilarity* — pulling in an Oregon FRAC-11 resistance profile precisely because it is
different. The winemaker then rotates chemistry against Oregon's resistance data.

**Fix:** the test is generic disease queries run in a non-PNW tenant, measuring the rate at which PNW
chunks appear in the returned set. Gemini's "assert zero" is too strict as an acceptance bar for a
corpus with no region dimension at all; measure the rate, set the bar deliberately, and report it.
Building the actual regional filter stays SKB Unit 9's job.

### C8. The `Chemical control` cut line throws away the most valuable content — **change the design**

Gemini, and my own recon data supports it. The powdery mildew page's `Chemical control` section opens
with three paragraphs of application timing and fungicide **resistance management** — *"Resistance to
FRAC 3 and 11 has been documented in Oregon and Washington… alternate or tank-mix materials from
different groups… limit applications from any specific group to two or fewer sprays"* — and only then
gives ~30 product bullets. The prose is tier B and is arguably the single best content on the page.
The bullets are tier C. Stripping by section header discards both.

**Fix:** the cut is **block-level within a section**, not section-level. Keep `<p>` preambles, drop
`<ul>`/`<li>`/`<table>` blocks carrying the product→fact rows. This makes Unit 7 a block classifier
rather than a section classifier, which is a real increase in scope — but the section-level version
would have shipped a source stripped of its best material.

### C9. There is no ongoing detection for this class of corruption

Gemini. The plan fixes one bug retrospectively and leaves the pipeline blind to the next one. And a
corrupted rate is often *agronomically plausible*: 5 lb/A of sulfur is normal, 5 lb/A of a Group 3
DMI is catastrophic and illegal. Nobody catches it because the citation makes it look authoritative.

**Fix — add a unit.** An ingest-time numeric-integrity invariant: extract every `\d+[.,]\d+` from the
raw extracted text, assert every one of those exact strings survives into the finalized chunks, and
fail the document loudly if any vanishes. This is what "structurally impossible, not merely unlikely"
actually requires, and it generalizes past the one regex we happened to find.

---

## Should Fix

1. **Overlap needs a chunker-level invariant, not a splitter-level one** (Codex). `tailForOverlap`
   output is *prepended* to the next chunk. A lossless splitter with differently-segmented overlap
   can still duplicate or truncate across boundaries. Test end-to-end on `chunkMarkdown`: each chunk
   must equal `suffix(previousChunk) + nextSourceSpan`.
2. **`shouldApplySectionFilter` should return a resolved value, not a boolean** (Codex):
   `{ strategy, version } | null`. If `deriveIndexHash` keeps taking `sectionFilterApplies: boolean`,
   a source switching `anchor-heading` → `body-heading` **collides and wrongly short-circuits**.
3. **Per-strategy versions, not one global `SECTION_FILTER_VERSION`** (Codex) — otherwise any strategy
   bump re-indexes every filtered document in the corpus. And unfiltered documents must not inherit a
   filter-version salt at all.
4. **PR A is not as independent as claimed** (Codex). Unit 2 mutates `deriveIndexHash`, the same seam
   Unit 7 rewires. **Fix:** define the final hash payload shape in PR A — raw content hash + pdf bit +
   chunker version + resolved filter strategy/version — so PR C only adds a member.
5. **Verify `ignoreValidators` only bypasses HTTP cache validators** (Codex), not KB-1 or content
   gates. If it bypasses gating, a "repair" run re-admits exactly what we mean to exclude. Add an
   explicit test that boundary and section gating still run under forced re-index.
6. **Confirm the revision-allocation race is actually closed** (Codex). `newRevision = currentRev + 1`
   must be computed *under* the `FOR UPDATE` lock, not from the earlier `findUnique`. The read
   suggests it already is — verify rather than assume, and pause concurrent crawls for targeted
   documents during the repair campaign.
7. **`Biological control` and `Cultural control` sections carry product facts too** (Gemini) —
   *Bacillus subtilis*/Serenade, potassium bicarbonate, dormant horticultural oil rates. My own recon
   confirms this on the mealybug page. A header-based allowlist admits them unexamined. Reinforces
   C8: classify blocks, and let the gate assess what survives.
8. **Withdrawal needs retrieval-state validation** (Codex), not just a row update. Integration-test
   that a withdrawn document is genuinely non-retrievable and leaves no reachable active chunks.
9. **A restartable campaign manifest** (Codex) for the repair run: intended document IDs, pre-run
   hashes, per-document disposition. Without it an interrupted run leaves an unknowable state and
   "64 candidate docs" drifts as sources change.

---

## Design Questions — need Russell's answer

1. **Block-level classification (C8) is a real scope increase to Unit 7.** Accept it, or ship
   section-level first and refine? My recommendation: accept it. Section-level would ship a source
   stripped of its best content, which undermines the reason for adding it.
2. **How much of the corpus do we re-index (C3)?** Full stale set is correct but partly impossible
   (`blobUrl` NULL corpus-wide, ~578 documents robots-blocked from re-fetch). Options: (a) re-index
   every re-fetchable stale document and mark the rest unverifiable; (b) withdraw what cannot be
   verified; (c) accept the force-split-derived subset as the stale set. I lean (a).
3. **`publishedAt` when the true revision date is unknown.** Gemini argues fail-closed: refuse any
   document carrying pesticide data without a parseable revision year, on FIFRA grounds. **I think
   that is too strong** — only ~31% of the corpus is dated, so it would refuse a large fraction of
   working content. Middle ground: never display a date we know is wrong (suppress 2014 on a document
   linking the 2026 edition), show "revision date unknown", and let the existing staleness warning
   handle the rest. Your call — this is a liability judgment, not a technical one.
4. **Enforce-by-default for unknown source keys.** Codex wants an explicit `boundaryMode` on the
   config with no implicit enforce. SKB chose enforce-by-default deliberately, so nobody can add a
   source and forget to opt in. I would **keep** enforce-by-default and instead harden the untested
   path: exercise the enforcing delete transaction on a disposable Neon branch before
   `pnw-handbooks` becomes the first enforcing source in existence.
5. **Is there a user path to report a dangerous citation?** (Gemini). The repo has a feedback system
   (`/developer` → `bug_reports`). Nothing currently connects a suspect citation to it. Worth a
   follow-up item — out of scope here, but it is the only human backstop against plausible-looking
   corruption.

---

## Net effect on the plan

- **Units to change:** 1 (parity narrowed), 2 + 3 (stale-set semantics, manifest), 7 (block-level, not
  section-level; resolved strategy type), 8 (replaced by Codex's pure-projection design), 11 (test
  redesigned around generic queries).
- **Units to add:** an ingest-time numeric-integrity invariant (C9); a hash-payload-shape unit in PR A
  (SHOULD FIX 4).
- **Not adopted:** domain-aware sentence boundaries inside Unit 1 (C1 — filed separately);
  fail-closed on undated pesticide documents (DQ3 — too broad); explicit `boundaryMode` config (DQ4 —
  SKB's default is deliberate).
- **Confirmed correct by review:** the non-throwing `assessProductTable` contract (Codex, explicitly);
  the lossless-scanner approach over a patched regex; `defaultEnabled: false` staged rollout; exact
  path prefixes over keyword matching.

---

## Raw Response — Codex (`gpt-5.4`)

**CRITICAL**

- `Unit 2/3:` Reindexing only "confirmed damaged" documents is not defensible once you bump the chunker version. The failure mode is silent false negatives: inputs like `1.10`, prose before a decimal, or any force-split block whose corruption still looks plausible will stay live forever because your candidate heuristic cannot prove absence. The fix is to treat the version bump as "all docs indexed by the old chunker are stale." Reindex the full stale set, or first deterministically compute the full set of docs that ever hit the force-split path and reindex all of them. Do not use spot checks to define the write set.

- `Unit 2:` The reindex plan is race-prone if any normal crawl/index worker can touch the same `KnowledgeDocument` while the campaign runs. Trigger: worker A and worker B both read `activeRevision = 7`, both choose `newRevision = 8`, one commits, the other then flips `activeRevision` again and deletes "other revisions," potentially deleting the first worker's chunks or overwriting `indexedContentHash` with an older fetch. The fix is per-document serialization: lock the document row or take an advisory lock before revision allocation, make revision assignment DB-owned under that lock, and abort/retry if the document hash/revision changed between fetch and commit. Operationally, pause concurrent crawls for the targeted docs during the campaign.

- `Unit 8:` Moving the section filter above the gate is only safe if you eliminate the two independent destructive clear paths. Right now you have a gate clear branch (`skipped: "product-table"`) and a section-filter clear branch (`skipped: "empty"`). Trigger: a filtered page drops to empty in one path while another run or branch hits the gate path; chunks get deleted twice but metadata updates diverge, leaving `activeRevision` and `indexedContentHash` inconsistent with the actual chunk set. The fix is one atomic `clearIndexedDocument(reason, hashState)` path used by both outcomes. Make section filtering a pure prepass that returns `{ candidateHtml, empty }`; do not let it mutate DB state itself.

- `Unit 8 / deriveIndexHash:` If the refactor computes the idempotency hash from filtered HTML, you will miss source changes inside currently-dropped sections. That becomes silent corruption the moment rules change and previously-dropped content becomes admissible. The fix is to keep `contentHash` based on raw fetched/extracted content, then salt it with the resolved filter strategy identity/version plus chunker version. Filtering can affect the indexed output, not the source fingerprint.

- `Unit 4/2:` `ignoreValidators: true` is too ambiguous for a safety-relevant reindex. If that flag bypasses KB-1 or content validators rather than just HTTP cache validators, your "repair" path can re-admit exactly the content you mean to exclude. The fix is a dedicated `ignoreHttpValidators` or `forceRefetch` flag and an explicit test proving boundary/section gating still runs on forced reindex.

- `KB-1 enforcing rollout:` `boundaryModeFor(key)` defaulting to `"enforce"` for unknown keys is wrong in combination with an unproven destructive branch. Trigger: a new source or typoed key arrives, enforcement activates by default, and a misclassification clears live chunks. The fix is an explicit `boundaryMode` on `KnowledgeSourceConfig` with no implicit enforce default for unknowns. For `pnw-handbooks`, start in report-only on a production-like clone, exercise the delete path, then opt that key into enforce.

**SHOULD FIX**

- `Unit 1:` `parts.join("") === input` is the right non-loss invariant. It is not sufficient by itself. A naive scanner can still change boundaries corpus-wide while passing that property. Trigger classes: decimals and version strings (`0.5`, `v1.2.3`), ellipses, abbreviations (`e.g.`, `Dr.`), URLs/domains, CRLF, tabs, NBSP, and mixed ASCII/Unicode whitespace because the old regex boundary is `punctuation + \s|$`, not `punctuation + " "`. The fix is to define parity precisely: parity is required only on inputs where the old matcher covered the full string, and the scanner must preserve the exact old boundary rule there. Do not "improve" sentence detection in this change.

- `Unit 1 / tailForOverlap:` Sharing the helper is necessary but not enough. `tailForOverlap` prepends text into the next chunk, so you need a chunker-level invariant, not just a sentence-split invariant. Failure mode: the splitter becomes lossless, but overlap is computed from a differently segmented tail and duplicates or truncates characters across chunk boundaries. The fix is an end-to-end force-split test on `chunkMarkdown`: each next chunk must equal `suffix(previousChunk) + nextSourceSpan`, where the overlap is an exact suffix of already-emitted source text.

- `Unit 1:` "Same chunk boundaries as before on ordinary prose" and "total coverage" are in direct tension on any input where the old regex had a dead zone. You cannot preserve the old output for `abc. 0.5 def` because the old output omits bytes. The fix is to narrow the parity requirement to inputs satisfying `oldParts.join("") === input`; anything else must prefer coverage over parity.

- `Unit 7:` Changing `shouldApplySectionFilter(...): boolean` to "resolve strategy" has wider consequences than the plan states. Every call site currently using a boolean must now carry the actual strategy identity through hash derivation, logging, tests, and application. If `deriveIndexHash` keeps taking `sectionFilterApplies: boolean`, a source switching from `anchor-heading` to `body-heading` can collide and incorrectly short-circuit. The fix is a resolved value like `SectionFilterResolution = { strategy: "anchor-heading" | "body-heading"; version: string } | null` and to pass that, not a boolean, everywhere.

- `Unit 7 / deriveIndexHash:` Independent strategy versioning is incompatible with a single global `SECTION_FILTER_VERSION` unless you intentionally want any strategy bump to reindex every filtered document. If that is not intended, the fix is `SECTION_FILTER_VERSIONS` keyed by strategy and hash input including both `strategy` and `strategyVersion`. Unfiltered docs should not inherit a filter version salt.

- `PR A independence:` It is not cleanly independent as written because `Unit 2` mutates `deriveIndexHash` in the same seam `Unit 7` later rewires. The failure mode is hash-shape churn across PRs and accidental loss of one salt during merge. The fix is to define the final hash payload shape in PR A now: raw content hash + pdf bit + chunker version + resolved filter strategy/version. PR C then only adds a new strategy member.

- `Unit 4:` A single-document withdraw tool needs retrieval-state validation, not just row updates. Failure mode: `status = "withdrawn"` is set but retrieval still joins live chunks because `activeRevision`/chunks were not cleared consistently, or vice versa. The fix is an integration test that withdraw makes the document non-retrievable and leaves no active chunks reachable by the normal retrieval query.

**DESIGN QUESTIONS**

- `Unit 8:` Why move the safety-critical gate at all instead of keeping ordering and making the filter a pure projection used by the gate? A cheaper and safer design is: resolve filtered candidate HTML first, pass that candidate to `assessProductTable`, then let one centralized gate/clear path decide between `product-table`, `empty`, or proceed. That gets you the same outcome without relocating destructive logic.

- `Unit 6:` If the EM 8413 PDF is correctly classified as `product-table` and refused wholesale, is losing the prose actually acceptable, or do you need a narrower admissible extraction rule for that specific document class? The current plan notes the possibility but does not define the operational decision.

- `Unit 10/11:` The plan is missing a restartable campaign manifest. If reindex/withdraw is interrupted mid-run, you need a stable record of intended document IDs, pre-run hashes, and disposition so you can resume and audit exactly what remains stale. Without that, "64 candidate docs" becomes a moving target as sources change.

One line that is correct: `assessProductTable` being non-throwing is the right contract; keep that invariant.

---

## Raw Response — Gemini (`gemini-3.1-pro-preview`)

The plan's intent to replace the regex with a lossless character scanner (Unit 1) is structurally correct, but the execution and domain application are critically flawed.

### CRITICAL

**1. Agronomic text shattering via "existing boundary semantics" (Data Quality)**
- **Failure Mode:** Unit 1 promises to "Keep existing boundary semantics" while making the scanner lossless. This guarantees semantic destruction of domain data. If the boundary logic still splits at `.` followed by space, `"Apply JMS Stylet Oil at 1. 5 gal/100 gal"` or `"Brix approx. 24.5"` splits into `["Apply JMS Stylet Oil at 1.", "5 gal/100 gal"]`. The LLM receives an orphaned "5 gal" rate in a separate chunk.
- **Trigger:** Viticulture text is littered with abbreviations (`approx.`, `cv.`, `var.`, `spp.`, `Dr.`), growth stages (`BBCH 12. `), and non-English numeric formatting (Spanish/Catalan sources using `1.500,00` for one-thousand-five-hundred).
- **Fix:** You cannot keep existing boundary semantics. The sentence boundary detector must be domain-aware. At a minimum, explicitly negative-lookahead digits (`(?<!\d)\.(?!\d)`), and ignore an explicit list of agronomic/taxonomic abbreviations (`var.`, `spp.`, `cv.`, `subsp.`).

**2. Cross-region MMR Contamination is mathematically guaranteed (Retrieval)**
- **Failure Mode:** Unit 11 proposes testing "regionally-specific questions" in the sandbox. This fundamentally misunderstands the `mmrSelect(..., 0.7)` dissimilarity penalty. If a Bhutan tenant asks a generic question ("How to manage powdery mildew"), the vector DB matches Bhutan chunks first. MMR then penalizes similar Bhutan chunks and actively selects *dissimilar* chunks—dragging in PNW Oregon resistance profiles ("Resistance to FRAC 11 strobilurins documented"). The Bhutan winemaker is now alternating chemicals based on Oregon's resistance data.
- **Trigger:** Generic agronomy queries (not regionally-specific ones) executed in non-PNW tenants.
- **Fix:** MMR cannot separate regions; it actively mixes them. Vector chunks must have a `region` metadata tag, and retrieval must hard-filter via PGVector `WHERE region = query.tenant_region OR region = 'global'`. Unit 11's test must be: run generic disease queries in the Bhutan tenant and assert zero PNW chunks return.

**3. Stripping `Chemical control` destroys Tier B resistance management (Domain Correctness)**
- **Failure Mode:** Unit 7/8 strips the entire `Chemical control` header. Agronomically, the preamble to chemical lists is where extension agents put critical fungicide resistance management prose (e.g., "Limit Group 3 to two applications per season; tank-mix with M4"). By dropping the whole section, you throw away the exact Tier B biology context the LLM needs to advise on spray program safety.
- **Trigger:** PNW Handbook pages where resistance advice sits directly under the `Chemical control` `<h2>`, before the bulleted lists of specific chemicals begin.
- **Fix:** Change the cut-line. Do not strip the whole section. Target the DOM structure: strip `<ul>`/`<li>` and `<table>` elements within `Chemical control` (which hold the Tier C rates/REI/PHI data), but preserve the `<p>` preambles containing the FRAC/IRAC rotation guidelines.

**4. No ongoing numerical integrity invariant (Pattern Consistency)**
- **Failure Mode:** The plan fixes this one bug retrospectively but leaves the pipeline blind to future silent corruption. A corrupted rate (e.g., 0.5 lb/A dropping to 5 lb/A) is often agronomically plausible (5 lbs of sulfur is normal; 5 lbs of a Group 3 DMI is catastrophic and illegal). Winemakers cannot catch this because the LLM provides a citation, making the false number look authoritative.
- **Trigger:** The introduction of a new source with an unanticipated text shape (e.g., a PDF OCR glitch adding rogue spaces into numbers).
- **Fix:** Add an ingestion-time invariant to the chunker pipeline: regex extract all numeric rates (any `\d+[\.,]\d+` pattern) from the raw source text. Assert that 100% of those exact numeric strings exist in the finalized chunks. Abort document ingestion and alert if a number vanishes or shatters.

### SHOULD FIX

**1. Biological and Cultural Control products bypass the KB-1 gate**
- **Failure Mode:** The plan zeroes in on `Chemical control`. Viticulture `Biological control` sections heavily feature biopesticides with legal labels, REIs, and PHIs (e.g., *Bacillus subtilis* / Serenade, Potassium bicarbonate). `Cultural control` often details dormant horticultural oil rates. These are Tier C product facts, but they live outside the targeted header.
- **Trigger:** Processing PNW pages for organic-approved disease management.
- **Fix:** The KB-1 boundary gate must actively scan the `Biological control` and `Cultural control` sections for product→fact text shapes, not just blindly admit them because they lack the `Chemical` header.

**2. The `publishedAt` Pesticide Freshness Liability**
- **Failure Mode:** Unit 6 proposes "Correct publishedAt" if the PDF is found, but ignores the wider reality: Drupal node-dates mean true revision dates are often unknown. Showing an outdated date (2014) trains the user to ignore the citation. Defaulting to no date causes the user to blindly trust potentially stale, illegal PHI/REI limits. Pesticide labels are federal law (FIFRA); staleness is a legal liability, not just poor UX.
- **Trigger:** Ingesting any agricultural extension PDF or page where the explicit revision year ("2026 Edition") cannot be deterministically extracted.
- **Fix:** If a document contains pesticide safety or application data (detectable by WPS, REI, PHI, FRAC keywords) and a current revision year cannot be definitively parsed from the text body, the pipeline must fail closed and refuse the document. Do not guess.

### DESIGN QUESTIONS

- **How does a user report a corrupted rate?** There is no mention of user feedback mechanisms. When (not if) the LLM hallucinates or retrieves a mis-parsed rate, how does the winemaker flag the citation as dangerous so you can pull the document?
- **Why is `verify:kb-boundary` a dry-run script instead of a pipeline block?** Unit 0 states the enforcing chunk-clearing transaction has "never executed against real data." If KB-1 is a safety invariant, why is the gate not a hard exception at the point of ingestion for every document, rather than an async cleanup transaction?
