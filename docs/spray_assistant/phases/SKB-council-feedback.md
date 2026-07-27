# SKB — Council feedback

**Date:** 2026-07-26
**Plan:** [SKB-knowledge-sources-plan.md](SKB-knowledge-sources-plan.md)
**Reviewers:** Codex (enforcement mechanics, pipeline seams, phase ordering) · Gemini
(safety, domain correctness, sequencing)
**Tally:** 17 findings — **13 folded**, **3 partially refuted**, **1 rejected**

> Two decisions were owner-confirmed before council and framed as invitations to refute, not
> re-choose: **D1** (the corpus line is tabular-vs-prose) and **D7** (crawl Penn State despite its
> undeclared edge block). D1 **survives, but acquires a hard precondition** — see C1. D7 was not
> contested by either reviewer.

---

## The one-line verdict

**The plan's source selection and its rejections hold up. Its enforcement does not.** Both reviewers
independently concluded that the boundary guard as designed cannot enforce the boundary: it runs at
the wrong pipeline seam, reports after the money is already spent, and fails open on a safety
invariant. And Gemini found a hazard the plan missed entirely — **closing a regional coverage gap
without a regional retrieval filter can make regional correctness worse, not better.**

---

## Critical

### C1 — Tier B is safe *only if* Unit 3 is real enforcement. As written, neither is. (both reviewers)

Gemini took the invitation and **built the failure case**, twice:

> **De-facto clearance.** Grower asks *"can I spray Captan to knock down this black rot?"* The
> relational engine says `GAP`. The corpus retrieves tier-B prose — *"multi-site protectants such as
> captan (M4) or mancozeb (M3) provide additional coverage."* The model synthesises: *"Yes, Captan
> (M4) provides excellent coverage for black rot. Always check your label for rates."* **A clearance
> was issued that overrode a relational `GAP`.**
>
> **De-facto hard stop.** Grower asks *"should I rotate in Abound?"* Tier-B prose retrieved: *"if
> resistance is suspected, do not apply Group 11 fungicides."* The model synthesises a prohibition —
> **violating the rule that the model may never produce a hard stop.**

Codex arrived at the same place from the mechanics side: *"this is still a prompt-string change, not a
hard safety boundary. A golden eval and a description test do not prevent the assistant from
answering legality from KB passages if the model ignores the hint or a later prompt drifts."*

**Assessment — D1 survives, and is strengthened, but §2 was wrong about one thing.** §2 claimed the
two-engines-disagree failure is a property of tier C only. It is not. It is a property of **any**
corpus content that names a product, and tier C merely makes it dense and legible. What actually
separates tier B from tier C is not danger, it is *value*: tier B carries irreplaceable regional
epidemiology and tier C carries a lookup the relational engine already owns exactly. That is still a
good reason to draw the line where it is drawn. It is not a reason to believe tier B is safe on its
own.

**Fold:** Unit 3 stops being a parallel unit and becomes a **hard dependency of every source unit**.
It moves from the tool *description* into the tool *handler* — see C2 — and no source lands before it.
The tier-B justification in §2 is rewritten to say what is actually true: tier B is admitted because
its value is unreplaceable and its risk is *mediated by Unit 3*, not because it is intrinsically safe.

### C2 — The guard runs at the wrong seam, after the money is spent, and fails open (both)

Three defects in one mechanism, and they compound.

**Wrong seam** (Codex): the detector reads *extracted* text. But `extract/pdf.ts` emits no pipe tables
and no headings, so a table-dominated PDF has already collapsed into one segment with a garbage
breadcrumb by the time the detector sees it. *"The repeated-row signal the heuristic depends on can
collapse to `prose`. That means the guard fails open exactly on the case you care about."* The plan
cited that same extractor limitation in §6.4 as a reason to reject ENTO-635-C and **did not notice it
also disarms the detector.**

**Post-hoc** (Codex): `verify:kb-boundary` reads `knowledge_document` rows, so a tier-C document is
fetched, extracted, chunked, **embedded at Voyage cost**, and written before anything complains.
*"`npm run verify:kb-boundary` can pass while the corpus is already polluted."*

**Fails open on a safety invariant** (both): Unit 1 specifies `prose` when unsure, reasoning that a
false positive silently deletes good content. Gemini: *"a badly formatted HTML table that the parser
mangles into a text list will be classified as Tier-B prose and ingested. You are failing open on a
safety boundary."* Codex: *"the only thing preventing a table ingest is perfect detection. That is too
weak for a safety boundary."*

**Fold, with the throw hazard respected.** The detector runs **pre-extraction on raw HTML/DOM** where
table structure still exists, and additionally on the PDF's table-aware pre-chunk representation. The
gate moves **inline into `index-documents.ts`** and returns a typed non-throw result — Codex was
explicit that signalling rejection by throwing from `fetchDocument` is forbidden, because the monthly
tombstone pass reads a throw as *"the page was removed"* and would mass-tombstone the source. Failure
direction inverts for enforcing sources: **uncertain ⇒ skip the document and report it**, never
silently admit. Fail-open is retained only for report-only sources, where the detector is a
measurement and not a gate.

### C3 — Report-only for the 25 incumbents cannot be justified as a safety invariant (Gemini; Codex concurs)

> *"If Tier C tabular data is dangerous enough to warrant building a dedicated detector that bans new
> sources, why are you leaving it active in the 25 live production sources? If `uc-ipm` contains a
> table that causes a hallucination, the grower is just as exposed. **A safety invariant cannot be
> grandfathered.**"*

**Partially refuted — the reasoning is right, the remedy is a sequence, not a switch.** D3's actual
justification was never that incumbents are safe; it was that silently changing retrieval for live
tenants without a measurement is its own hazard. Both things are true. But the plan let "measure
first" read as "enforce later, unscheduled," which is how a grandfather clause is born.

**Fold:** D3 gains a **committed close-out**. The measurement runs in the same PR as the guard, and
whatever count it produces resolves inside this phase — enforce, or a named exclusion per document
with a recorded reason. "Report-only" ceases to be a resting state. If the count is zero, the
enforcing list becomes *all sources* immediately and D3 disappears, which is the outcome to hope for.

### C4 — Closing a regional gap without a regional filter can make regional correctness worse (Gemini)

**The finding the plan missed entirely, and the strongest one in this review.**

> A Michigan grower asks about downy mildew. Retrieval fetches one chunk from Michigan State (humid
> continental) and one from AWRI Australia (hot, dry Mediterranean), because both are semantically
> close to the query. The model synthesises them: *"wait for X humidity [the Australian trigger], but
> use mancozeb [the eastern recommendation]."* **A geographically impossible IPM strategy, fully
> cited, that makes the grower miss their spray window.**

There is **no region dimension in retrieval at all** — not on the chunk, not in the query, not in
tenant config. MMR at λ 0.7 actively rewards *dissimilarity* between selected passages, so a
retrieval set that mixes climates is not an accident, it is the diversification objective working as
designed. The plan's §1 premise — that a Virginia grower currently gets Californian epidemiology — is
correct, and the plan's remedy makes the *cross-regional* case denser rather than resolving it.

**Fold, as a gate rather than a build.** A regional metadata dimension plus a tenant-region query
filter is a real architectural change to a global shared corpus and does not belong buried in a
source-expansion phase. But it cannot be ignored either. So:
- a **new unit** adds cross-region contamination cases to the eval set — a Michigan downy question, a
  Virginia powdery question — asserting the top-k does not mix incompatible climate regimes;
- if contamination **reproduces**, the regional filter is a **hard blocker on the `defaultEnabled`
  flip**, not on landing the sources dark. The sources can sit dark indefinitely at no cost;
- the finding is recorded at **HIGH** in the risk register and as a scale/architecture register entry,
  because it is a property of the whole corpus and not of these two sources.

Gemini's stronger claim — that Units 6 and 7 must not ship at all without the filter — is **partially
refuted**: landing a source with `defaultEnabled: false` changes nothing for any tenant, and the
staged rollout exists precisely so that a measurement can stop a flip. The gate belongs at the flip.

---

## Should fix

### S1 — Displacement is a blind acceptance signal for a safety-relevant change (Gemini)

The 20-question baseline was written before eastern sources existed and **contains no eastern-US
disease questions**. So an eastern source that correctly answers an eastern question is invisible to
it, while an eastern source that displaces a Californian chunk on a Californian question registers as
drift and is *actively degrading* Californian accuracy. *"Passing a 0.5 per-question displacement
threshold doesn't mean the new source is safe; it just means it didn't completely destroy the existing
evaluation set. A source could pass your aggregate threshold while totally inverting the answer to a
single, high-stakes safety question."*

**Folded.** Displacement is retained as a *regression* signal — it is the only thing that measures
slot occupancy, and that was always its job. But it is demoted from acceptance signal to one of three,
alongside the new eastern retrieval cases (which prove the source earns its slots) and the
cross-region cases from C4 (which prove it does not poison a neighbour). The plan's §8 gate is
rewritten so no flip rests on displacement alone.

### S2 — The baseline artifact needs a real control, not a PR-body note (Codex)

> *"'State it in the PR body' does not protect it. Another session can silently overwrite the only
> before-evidence. The verification can still pass on a fresh recapture while the original baseline is
> already lost."*

**Folded.** The pre-phase capture is copied to an **immutable phase-scoped artifact**
(`phases/SKB-baseline-register.json`) that no tool writes. The shared `docs/kb-register-baseline.json`
stays the live comparison target; the phase's evidence stops depending on a file any session may
recapture.

### S3 — `allowPaths` needs a canonicalization contract, not a slash-tolerance sentence (Codex)

The plan said "slash-tolerant in both directions" and left everything else undefined. Codex named the
bypasses: **case sensitivity, percent-encoding** (`/a%2Fb` must not collapse to `/a/b`), **query
strings, fragments**, matching on pathname **only after redirect resolution**, and deny-prefix
evaluation against the **final canonical** URL. It also noted the stated tests *"do not cover the
bypasses that matter, so the suite can pass while the allowlist is still porous."*

**Folded** into Unit 5 as an explicit contract plus a negative test per bypass.

### S4 — Unit 9 must not branch on an unreproducible network outcome (Codex)

> *"Branching `defaultEnabled` off one live crawl is non-reproducible. Split probe, measurement
> artifact, and config flip."*

**Folded.** Unit 9 splits into three: the probe run (produces an artifact), the artifact review, and a
config change that is a separate commit citing it. Codex's design question — *is the "≥3 passes across
≥2 egresses" rule machine-enforced or operator policy?* — is answered: **operator policy, so it
belongs in the runbook**, with the probe script only *reporting* what it observed and explicitly
declining to authorise anything.

### S5 — A source that cannot be reliably re-crawled will rot silently (Gemini)

> *"Relying on an operator's home-internet connection to manually bypass a WAF is not a pipeline; it
> is a hack. If it cannot be reliably re-crawled via CI, it will rot. Rule 8's staleness caveat will
> fail because the system won't know the source is stale."*

**Partially refuted on the remedy, fully accepted on the diagnosis.** Gemini's disposition — reject
MSU outright until there is an API agreement or a dedicated proxy — is too strong: MSU's content shape
is the best-fitting of any candidate (rate/acre 0, trade names 0, pure tier B) and D9 already
guarantees it never enters the automated sweep, so it cannot red the monthly job. But "it will rot and
the staleness guard won't know" is exactly right, and the plan had no answer.

**Fold:** any source that cannot be CI-refreshed gets an explicit **staleness floor** — a maximum
document age past which its passages are hard-caveated or dropped from retrieval, enforced rather than
hoped for. This applies to MSU and it is the honest precondition for admitting it at all. The same
mechanism covers Gemini's related point about Penn State: `lastmod` without `Last-Modified` is
fragile, because a CMS routinely fails to bump `lastmod` when a page is softly deprecated.

### S6 — The Penn State powdery mildew gap is not defensible as written (Gemini)

> *"Powdery mildew is arguably the single most economically destructive grape disease in the eastern
> United States. Accepting a localized gap for the #1 disease means a Pennsylvania grower asking about
> it will fall back to California (Mediterranean) epidemiology. That defeats the entire purpose of the
> phase."*

**Partially refuted, and folded as a coverage assertion.** The premise slightly overstates the
consequence: the corpus already holds eastern powdery mildew material via `cornell-grapes`, so the
fallback is not necessarily Californian. But the plan wrote "accepted gap" without *checking* that,
which is the actual error — an unverified assumption sitting exactly where the phase claims its value.

**Fold:** an explicit eval case asserting that an eastern powdery mildew question is answered by
eastern material. If it is not, sourcing an eastern PM page becomes in-scope for this phase rather
than an accepted gap.

### S7 — Measure latency before landing chunks, not after (Gemini)

D11 records the scale-register tripwire as already crossed (~23.5k chunks against a ~10k tripwire on a
🟢 status) and measures latency in Units 4 and 8. Gemini: *"why measure latency after landing the
chunks instead of mitigating it first?"*

**Folded as a gate, not a mitigation.** Unit 4's pre-phase latency sample becomes a recorded **flip
precondition**: if post-crawl latency degrades past the number Unit 4 establishes, the flip waits.
Building the ANN index stays out of scope (D11) — an index build on the live global corpus is its own
decision — but the phase no longer merely observes the number after the fact.

---

## Design questions answered

**Q3 — does Unit 3 belong in SKB or the later legality phase?** *(the plan's own biggest open
question)* Gemini argued the sequencing hard and **found the third option the plan asked for:**

> *"Currently a grower gets an extension-cited passage that is likely agronomically correct. If you
> hard-refuse, the grower is on a tractor, mid-season, facing a pest outbreak. They will not wait for
> Phase 2; they will Google it or spray from memory."*
>
> **"Do not refuse the query; refuse the conclusion."** State that legal compliance cannot be
> certified, **but still provide the retrieved agronomic context** — efficacy, resistance group,
> target pests. *"This keeps the grower in the app, surfaces safe Tier-B reasoning, and safely avoids
> the legal Yes/No trap."*

**Adopted, and it resolves the sequencing question rather than answering it.** Unit 3 belongs in SKB —
the refusal is not "no answer," it is "no *verdict*," which is available immediately and needs no
destination tool. It also removes the plan's stated worry about refusing without an alternative, and
it is strictly better than the status quo, which offers a verdict with no refusal at all. The golden
eval changes shape: the assertion is no longer *"must not answer from a passage"* but *"must not issue
a verdict, must still surface the cited context, must not fire a write."*

**Q2 — enforce on the incumbents?** Yes, on a schedule inside this phase. See C3.

**Q4 — is an undeclared edge block equivalent to a robots disallow, as precedent?** Neither reviewer
contested D7 or offered a general principle. **Unresolved, and it stays an open item** — the decision
to crawl PSU stands, but the precedent question is deferred rather than answered.

**Q5 — fold in the third eastern source (`ext.grapepathology.org`)?** Not raised by either reviewer.
Stays out (D12).

---

## Rejected

**Gemini Q7 — extract the ENTO-635-C tables now into a static JSON lookup for the relational engine.**

> *"By rejecting it, you are actively withholding the exact safety data (REI/PHI) the grower needs to
> protect their workers. Is 'reject it here and maybe ingest it there someday' just a deferral dressed
> as a decision?"*

The challenge to the *disposition* is fair and is folded (below). The proposed *remedy* is rejected.
Hand-extracting 22 pages of product/rate/REI/PHI tables into a static JSON lookup inside a
knowledge-source phase would create an unversioned, un-sourced, manually-maintained parallel authority
on exactly the data the program has decided is relational, with no ingest pipeline, no `sourceAsOf`, no
per-row citation, and no supersession path for an **annually revised** document. That is not a smaller
version of S2b; it is the thing S2b exists to prevent. The program already has the pattern for this —
per-row `sourceUrl` + `sourceAsOf` + `reviewedBy`, enforced by a boundaries test — and a temporary JSON
lookup satisfies none of it.

**But "maybe someday" was a fair hit.** Folded as a change to the *disposition*, not the decision:
ENTO-635-C is recorded as a **named candidate artifact handed to S2b**, with its affirmative reuse
grant captured — that grant is genuinely valuable and is the reason it is worth naming rather than
merely rejecting. It is a routed hand-off with an owner, not an open question.

---

## What changes in the plan

| # | Change | Where |
|---|---|---|
| C1 | Unit 3 becomes a hard dependency of every source unit; §2's tier-B rationale rewritten (value, not safety) | §2, D2, Units 6/7/9 deps |
| C1/Q3 | Unit 3 refuses the **verdict**, not the query — still surfaces cited context | Unit 3, its golden |
| C2 | Detector moves pre-extraction (raw HTML + table-aware PDF representation); gate moves **inline** to `index-documents.ts` as a typed non-throw; **uncertain ⇒ skip** for enforcing sources | Units 1, 2 |
| C3 | D3 gains a committed close-out inside this phase; report-only stops being a resting state | D3, Unit 2 |
| C4 | **New unit**: cross-region contamination eval; a reproduced hazard hard-blocks the flip; HIGH risk + register entry | new unit, §9, Unit 10 |
| S1 | Displacement demoted from acceptance signal to one of three | §8 |
| S2 | Baseline copied to an immutable phase-scoped artifact | Unit 4 |
| S3 | `allowPaths` canonicalization contract + a negative test per bypass | Unit 5 |
| S4 | Unit 9 splits into probe / review / config change; the authorisation rule is runbook policy, not script logic | Unit 9 |
| S5 | Staleness floor for any source that cannot be CI-refreshed | Units 7, 9 |
| S6 | Eastern powdery mildew coverage asserted, not assumed | Unit 8 |
| S7 | Unit 4's latency sample becomes a flip precondition | Unit 4, §8 |
| — | ENTO-635-C recorded as a named S2b hand-off with its reuse grant | Unit 10 |

**Net effect on shape:** 10 units → 11, and the phase's centre of gravity moves. It was "add two
sources, with a guard." It becomes "make the boundary real, then add two sources behind it." The
source work barely changes; the enforcement work roughly doubles. Both reviewers were pointed at the
same conclusion from different directions, which is the outcome that most justifies having run this.

---

## Raw response — Codex (`gpt-5.4-mini`; ⚠️ `gpt-5.4-pro` failed, fell back)

**CRITICAL**
- Unit 1 / D1: the detector is wired at the wrong seam. After `extract/pdf.ts`, a table-heavy PDF has already lost pipe-table structure and headings, so the repeated-row signal the heuristic depends on can collapse to `prose`. That means the guard fails open exactly on the case you care about. It needs to run before Defuddle/chunking, on raw HTML/DOM or a table-aware pre-chunk representation, or you will still pay embed costs and index bad docs. `npx vitest run test/knowledge-product-table.test.ts` can pass while the ingest path remains ineffective.
- Unit 2 / D3: `verify:kb-boundary` is post-hoc telemetry, not enforcement. As written it lets tier-C docs fetch, extract, chunk, embed, and write before it complains. If you inline it, do not signal rejection by throwing from `fetchDocument`; the monthly tombstone pass treats that as page removal and can mass-tombstone a source. The skip/reject decision has to live in `index-documents.ts` or the crawl loop as a typed non-throw result. `npm run verify:kb-boundary` can pass while the corpus is already polluted.
- Unit 3 / D2: this is still a prompt-string change, not a hard safety boundary. A golden eval and a description test do not prevent the assistant from answering legality from KB passages if the model ignores the hint or a later prompt drifts. If legality is the boundary, enforce it in routing before KB retrieval or in the tool handler itself, not only in the tool description.
- Unit 4 / D10: `docs/kb-register-baseline.json` is a committed measurement artifact, and "state it in the PR body" does not protect it. Another session can silently overwrite the only before-evidence. The verification can still pass on a fresh recapture while the original baseline is already lost, which defeats the point of the phase's displacement accounting.

**SHOULD FIX**
- Unit 5 / D6: `allowPaths` needs an explicit canonicalization contract. Match on pathname only after redirect resolution, ignore query strings and fragments, keep paths case-sensitive, and define percent-encoding behavior so `/a%2Fb` does not collapse into `/a/b`. Deny prefixes must be checked on the final canonical URL and still win. The current test set does not cover the bypasses that matter, so `npx vitest run test/knowledge-crawl.test.ts test/knowledge-config.test.ts` can pass while the allowlist is still porous.
- Unit 5 / D6: making `allowPaths` config-only is risky given the DB-driven crawl selection path. If it is not persisted, add a strict loader/schema contract so missing or unknown keys fail closed instead of silently misrouting the sweep. Right now the plan reuses the exact failure class that already killed the monthly job once, just with a new field.
- Unit 9 / D8 / D9: branching `defaultEnabled` off one live crawl is non-reproducible. Split probe, measurement artifact, and config flip. Otherwise `scripts/verify-msu.ts` can report a clean run while the repo state is still wrong, or the decision is made on a transient 200 that will not hold.
- Unit 1 / Unit 2: the plan never states the source-level contract for uncertain enforcing-list docs. If "uncertain => prose" remains the default, the guard is still fail-open and the only thing preventing a table ingest is perfect detection. That is too weak for a safety boundary.

**DESIGN QUESTIONS**
- Unit 1: for an enforcing source, should an undecidable document be skipped, quarantined, or indexed and flagged? The answer determines whether fail-open is acceptable at all.
- Unit 2: should a tier-C hit fail the whole source crawl or only skip that page? The plan needs one explicit source-level outcome so the monthly sweep, seed job, and verify script all agree.
- Unit 5: should allow entries be normalized slashless canonical paths, or literal strings with slash-equivalence handled separately? The current wording implies both, which is easy to implement inconsistently.
- Unit 9: is the ">=3 consecutive passes across >=2 egresses" rule machine-enforced or operator policy? If it is policy, it belongs in the runbook, not the probe code.

---

## Raw response — Gemini (`gemini-3.1-pro-preview`)

### CRITICAL: SAFETY & HIGH-RISK FLAWS

**1. The Tier-B boundary (D1, Unit 1) does not prevent the "two-engines-disagree" failure; it guarantees it.**
The owner's premise is that tabular data (Tier C) causes the two-engine collision, while advisory prose (Tier B) is safe because it defers rates to the label. This is a false distinction in a generative LLM context.
- **The Concrete Failure (De-facto clearance):** A Virginia grower asks, "Can I spray Captan to knock down this black rot?" The relational engine (once built) will say UNKNOWN/GAP because the specific formulated product isn't mapped for their tenant. But the KB retrieves Tier-B prose: *"multi-site protectants such as captan (M4) or mancozeb (M3) provide additional coverage."* The LLM synthesizes: "Yes, Captan (M4) provides excellent coverage for black rot. Always check your label for rates." The grower sprays. The assistant just issued a clearance that overrode a relational GAP.
- **The Concrete Failure (De-facto hard stop):** A grower asks, "Should I rotate in Abound (Group 11)?" Tier-B prose retrieved: *"If resistance is suspected, do not apply Group 11 fungicides."* The LLM synthesizes: "No, do not apply Group 11 fungicides if you suspect resistance." You just violated the program rule that the model may never produce a hard stop.
- **The Detector (Unit 1):** The plan explicitly says the Unit 1 detector "FAILS OPEN (prose when unsure)." This means a badly formatted HTML table that the parser mangles into a text list will be classified as Tier-B prose and ingested. You are failing *open* on a safety boundary.

**2. Regional expansion without a regional filter creates a synthesis hazard (Unit 8).**
You are trying to fix a geographic gap (Virginia getting California advice) by dumping East Coast, West Coast, Australian, and European epidemiology into the same undifferentiated vector space.
- **The Concrete Failure:** A Michigan grower asks about downy mildew. The retrieval fetches one chunk from Michigan State (wet, humid climate rules) and one from AWRI Australia (hot, dry Mediterranean rules) because both have high semantic similarity to the query. The LLM synthesizes them: "Wait for X humidity [the Australian trigger], but use Mancozeb [the Eastern US recommendation]." You have just created a hallucinated, geographically impossible IPM strategy that will cause the Michigan grower to miss their spray window and lose their crop.
- **The Minimum Viable Fix:** You cannot ship Unit 6 and 7 without adding a `region` metadata tag to chunks and enforcing a tenant-region filter at query time. Closing a regional gap by guaranteeing cross-regional contamination is worse than the status quo.

**3. Displacement is a mathematically blind safety metric for this phase (Unit 4, D10).**
You are using a 20-question baseline written *before* eastern US sources existed.
- If an eastern source correctly answers an eastern question, it won't show up in this baseline.
- If an eastern source *does* displace a California chunk for a California question, it is actively degrading the accuracy of the system for California growers. Passing a "0.5 per-question displacement threshold" doesn't mean the new source is safe; it just means it didn't completely destroy the existing evaluation set. A source could pass your aggregate threshold while totally inverting the answer to a single, high-stakes safety question.

### SHOULD FIX: SEQUENCING & CURRENCY

**4. Unit 3's Sequencing: Banning legality questions now without a fallback.**
Implementing the refusal *before* the relational tool exists leaves the grower with nothing mid-season.
- **Worse than status quo:** Currently, a grower gets an extension-cited passage that is likely agronomically correct, even if not mathematically verified. If you hard-refuse, the grower is on a tractor, mid-season, facing a pest outbreak. They will not wait for Phase 2; they will Google it (risking unvetted SEO spam) or spray from memory.
- **The Missed Third Option:** Do not refuse the *query*; refuse the *conclusion*. The prompt instruction should be: *"When asked if a product is registered, legal, or clears PHI/REI, state that you cannot certify legal compliance. However, you MUST STILL provide the retrieved agronomic context regarding the product's efficacy, resistance group, and target pests."* This keeps the grower in the app, surfaces safe Tier-B reasoning, and safely avoids the legal "Yes/No" trap.

**5. Operational fantasy in content currency (D8, D9, Unit 9).**
Pesticide registrations get cancelled mid-season. Pest emergence data is hyper-local and time-bound.
- **Michigan State (D9):** Relying on an operator's home-internet connection to manually bypass a WAF is not a pipeline; it is a hack. If it cannot be reliably re-crawled via CI, it *will* rot. Rule 8's staleness caveat will fail because the system won't know the source is stale. **Honest disposition:** Reject MSU entirely until you have an API agreement or a dedicated proxy IP that clears the WAF.
- **Penn State (D7):** Relying entirely on `sitemap lastmod` without `Last-Modified` headers is incredibly fragile. CMS platforms routinely fail to update `lastmod` when underlying page templates change or when content is softly deprecated.

**6. Domain Correctness: The Powdery Mildew gap (Unit 6, D6).**
The plan notes Penn State has no grape powdery mildew article and accepts this as a gap. Powdery mildew is arguably the single most economically destructive grape disease in the eastern United States. Accepting a localized gap for the #1 disease means a Pennsylvania grower asking about it will fallback to California (Mediterranean) epidemiology. This defeats the entire purpose of the phase. You must source a PA-specific powdery mildew fact sheet, even if it requires a manual PDF ingestion.

### DESIGN QUESTIONS

**7. Are we throwing away the most valuable data to satisfy an arbitrary phase boundary? (D5, ENTO-635-C)**
You rejected the Virginia Tech pest guide because it is 96% tables (Tier C). But you acknowledge it carries an affirmative reuse license and is the *only* source containing local REI and PHI data.
- *Question:* Is "reject it here and maybe ingest it there someday" just a deferral dressed as a decision? By rejecting it, you are actively withholding the exact safety data (REI/PHI) the grower needs to protect their workers. Why not extract the tables *now* into a temporary static JSON lookup for the relational engine, rather than tossing out the most valuable 23 pages in the East?

**8. Why is D3 (the tabular detector) Report-Only for incumbents?**
If Tier C tabular data is dangerous enough to warrant building a dedicated Unit 1 detector that bans new sources, why are you leaving it active in the 25 live, production sources? If `uc-ipm` contains a table that causes a hallucination, the grower is just as exposed. A safety invariant cannot be grandfathered.

**9. Have you modeled the latency impact of D11?**
You note the ANN index is delayed, but you are adding ~130+ pages of dense HTML. If the chunk count is already crossing 23.5k (triggering a false green), doing brute-force cosine similarity in memory across the expanding corpus during peak harvest queries could push TTFB (Time to First Byte) past the timeout window. Why measure latency *after* landing the chunks (Unit 10) instead of mitigating it first?
