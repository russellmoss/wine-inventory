---
title: Voice-mode pronunciation lexicon, mined and screened from the knowledge base
type: feat
status: draft
date: 2026-07-23
branch: feat/voice-pronunciation-lexicon
depth: standard
units: 7
---

## Overview

Assistant voice mode mispronounces the vocabulary the job is made of: grape varieties,
yeast strains, Latin binomials, French cellar terms. We add a local alias lexicon to the
existing `toSpeakable` transform so TTS reads "see-rah" instead of whatever it currently
does to "Syrah".

The list is not hand-guessed. We mine candidates from the 36,931-chunk knowledge base plus
the app's own Variety and CellarMaterial rows, then screen them with an automated
TTS→STT round-trip so a human only ever reviews terms the engine demonstrably gets wrong.

## Problem Frame

Ticket `cmrvhmo030001jp04t7youq4h` / issue #464, TRIAGED, filed from Demo Winery.
A winemaker using hands-free voice mode in the cellar hears the assistant mangle the words
they use every day. Flagged examples: "Syrah", yeast strain names, "Saccharomyces cerevisiae".

The stated bar is explicit and it matters for scoping: **"doesn't need to be perfect, but it
should be much better than what we have."** That is a request for broad coverage of common
offenders, not phonetic exactness on rare ones.

Cost of doing nothing: voice mode is the hands-free surface for people whose hands are wet
and full. Every mispronounced varietal is a small credibility tax on an assistant that is
otherwise being trusted to log real cellar operations. It does not corrupt data. It makes
the product sound like it does not know the domain.

**The reframe that shapes this whole plan:** the deliverable is not a dictionary of wine
words. It is a dictionary of **wine words the TTS engine gets wrong**. Most terms it already
handles fine. Every rule added for a word that was already correct is pure downside risk —
it can only move a correct pronunciation to an incorrect one. So the work is a screening
funnel, and the screen is the expensive part, not the writing.

## Requirements

- MUST: Alias-style respelling only, applied locally in `src/lib/voice/speech.ts`.
- MUST: Be idempotent. `toSpeakable` runs twice on every spoken sentence (client, then the
  route defensively) — a rule that fires twice or cascades into another rule is a bug.
- MUST: Longest-match-first, so "Cabernet Sauvignon" beats "Cabernet".
- MUST: Candidate terms mined from real data (knowledge base + app tables), not invented.
- MUST: A human-reviewed curation gate. An auto-generated list never reaches production
  unreviewed.
- MUST: Only spoken output changes. The chat transcript, the assistant's history, and every
  stored value keep their original text.
- SHOULD: An objective before/after number, so "much better" is measured, not asserted.
- SHOULD: Handle lot codes (`2026-SY-2`), vessel codes (T5), and strain codes (EC-1118).
- SHOULD: Match accented and unaccented spellings alike (Gewürztraminer / Gewurztraminer).
- NICE: Leave the mined term list in a shape the future STT keyterm ticket can consume.

## Scope Boundaries

**In scope:**
- Candidate mining from `knowledge_chunk`, `Variety`, `CellarMaterial`.
- An automated TTS→STT round-trip screen to find actual mispronunciations.
- A pure, unit-tested lexicon module wired into `toSpeakable`.
- Lot / vessel / strain code speech rules.
- A committed audit artifact recording what was mined, screened, adopted, and skipped.

**Out of scope, and why:**
- **Switching TTS model.** IPA phoneme rules only work on `eleven_flash_v2` and
  `eleven_v3`; we run `eleven_flash_v2_5`, chosen deliberately for conversational latency
  (see the comment at `src/lib/voice/config.ts`). Flash v2.5 silently ignores phoneme rules,
  so an IPA approach would appear to work and change nothing. Alias is the only lever on the
  current model, and the latency is worth more than the phonetic precision.
- **An uploaded ElevenLabs pronunciation dictionary.** For alias rules it is functionally
  identical to doing it locally, and it costs testability plus two env vars plus a
  re-upload and version bump for every word edit.
- **The STT input side** (Scribe hearing "Syrah" as "Sarah"). Different risk class: a wrong
  respelling costs a funny-sounding word, a wrong transcript correction changes what the
  assistant *acts on*. Own ticket, own gate. Noted in "Follow-on" below.
- **Per-tenant or user-editable pronunciations.** A static committed list first. If tenants
  need their own strain names later, the module should be shaped to allow it, not built for it.

## Research Summary

### Codebase Patterns

`src/lib/voice/speech.ts` already contains this exact class of transform. `normalizeUnits()`
rewrites `mg/L` to "milligrams per liter", `SO₂` to "sulfur dioxide", `°Bx` to "Brix", `%`
to "percent" — all so TTS does not spell them out. Its own comments record the ordering
lessons the hard way (most-specific pattern first, or `mg/L` gets half-eaten by the `g/L`
rule; `\b` does not work after `₂` because it is not a word character). The lexicon is the
same idea one function over, and should inherit the same discipline.

`toSpeakable` is pure, dependency-free, and isomorphic by design. The client calls it before
POSTing each sentence; `src/app/api/assistant/speak/route.ts` calls it again on the way in as
defense in depth. **Double application is the load-bearing constraint of this plan.**

Tests: `test/voice-speech.test.ts`, vitest, plain input/output assertions, no DOM. The voice
libs keep pure logic testable under `environment: "node"` on purpose — the components are not
testable in this repo (no jsdom/RTL).

Corpus, measured today against the live DB, not assumed:

| | |
|---|---|
| Active knowledge documents | 3,312 |
| Chunks | 36,931 |
| Total tokens | 12,513,955 |
| Sources | 25 |

Useful shape in that corpus: `umc` (Union des Maisons de Champagne, 177 docs) is French, and
`wbi` (WBI Freiburg, 79 docs) is German. Those two carry the French and German cellar
vocabulary that English extension sources will not.

Schema notes that change the approach:
- `knowledge_chunk.text` is the mineable field. The KB tables (`KnowledgeSource`,
  `KnowledgeDocument`, `KnowledgeChunk`) carry **no `tenantId`** — the corpus is global, so
  mining needs no tenant context and no `runAsSystem` gymnastics.
- `Variety` is tenant-scoped: `name`, `abbreviation`, plus `clone`, `rootstock`, `nursery`.
- `CellarMaterial` is tenant-scoped and has four separate name-ish fields worth mining:
  `name`, `genericName`, `brand`, `brandName` (`brandName` is where "EC-1118" lives).

### Prior Learnings

- Plan 090 (KB re-index) established the habit that matters here: **read the rows back,
  never trust the tally.** Its smoke test reported "0 errors" while silently writing nulls.
  A mining script that reports "412 candidates" proves nothing about whether they are good.
- Ticket #460 (voice turn-taking) closed with a developer note stating plainly that automated
  tests cannot verify how a pause *feels*, and asking the reporter to re-test by ear. Same
  posture applies here, and this plan takes it further by finding a number that *can* be
  automated (the round-trip screen) so the ear pass is a confirmation, not the whole method.
- Repo convention: build in the MAIN checkout, which has `.env`; worktrees do not.

### External Research

ElevenLabs documentation, confirmed 2026-07-23:
- "Pronunciation dictionary phoneme tags only work with `eleven_flash_v2` and `eleven_v3`
  models." Other models skip phoneme tags and use default pronunciation.
- Alias rules work across models — substitute spellings that produce the pronunciation you want.
- Scribe STT pricing $0.22/hr, so the round-trip screen costs pennies at the volume here.

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| Where the substitution happens | Locally in `toSpeakable` | Uploaded ElevenLabs dictionary | Identical capability for alias rules; local is unit-testable, has no vendor state, and edits are a commit not a re-upload + version bump |
| Rule type | Alias respelling | IPA / CMU phonemes | Phonemes are silently ignored on `eleven_flash_v2_5`; switching models costs the conversational latency the config deliberately bought |
| How the term list is built | Mine, then screen, then curate | Hand-write ~60 terms | Hand-written lists encode my guesses about both what appears and what breaks; mining answers the first, the screen answers the second |
| Which terms get a rule | Only terms that FAIL the screen | Every wine term found | A rule on an already-correct word can only make it worse |
| Ordering inside `toSpeakable` | Lexicon runs LAST, after `normalizeUnits` | Before | `normalizeUnits` *generates* "Brix"; a lexicon running earlier would never see it |
| Matcher construction | One combined alternation regex, single pass, alternatives ordered longest-first | Sequential per-term `replace` | A single pass cannot re-scan its own output, which kills the cascade class of bug outright and gives longest-match-first for free |
| Screen methodology | Automated TTS→STT round-trip, then human ear on failures only | Human listens to every candidate | Turns ~300 manual listens into ~40; and the same screen re-run after the fix becomes the regression metric |

## Implementation Units

### Unit 1: Candidate mining script

**Goal:** Produce a frequency-ranked list of domain-vocabulary candidates from real data.
**Files:** `scripts/mine-pronunciation-candidates.ts`, `package.json` (script entry)
**Approach:** Read-only sweep. Stream `knowledge_chunk.text` in batches (36,931 rows, ~12.5M
tokens — trivial for Node, but do not load it all at once). Extract candidates with
deterministic heuristics, no LLM at this stage:
- capitalized multi-word sequences matching a `Genus species` shape (Latin binomials);
- tokens containing non-ASCII letters (é, ü, à, ô, ç) — the French/German cellar vocabulary,
  which is why the `umc` and `wbi` sources matter;
- suffix families: `-myces`, `-coccus`, `-bacter`, `-aceae`, `-ose`, `-ase`;
- capitalized tokens that are absent from a common-English word list.
Union that with the app vocabulary: `Variety.name`/`abbreviation`/`clone`/`rootstock`, and
`CellarMaterial.name`/`genericName`/`brand`/`brandName`. Emit a ranked artifact with the
term, its corpus frequency, which sources it came from, and whether it also appears in app data.
**Cap it hard and say so:** take the top N (start N=400) and **log the count dropped**. A
silent truncation reads as "we covered everything" when we did not.
**Tests:** Extraction heuristics are pure functions in `src/lib/voice/mining.ts` — unit test
each: binomial detection, diacritic detection, suffix families, stopword rejection.
**Depends on:** none
**Verification:** Run it; eyeball that the top 50 contain the obvious varieties and genera and
that the script reports both kept and dropped counts.

### Unit 2: Automated TTS→STT round-trip screen

**Goal:** Find which candidates the engine actually mispronounces, without listening to 400 words.
**Files:** `scripts/screen-pronunciation.ts`, `package.json` (script entry)
**Approach:** For each candidate, synthesize a short **carrier sentence** rather than the bare
word ("The lot is mostly Syrah this year") — a word in isolation gets different prosody than
one in a sentence, and the sentence is what we actually ship. Send the audio back through
Scribe, then compare the transcribed term against the original under a normalized,
diacritic-folded, case-insensitive match. A mismatch is a strong signal the engine said
something other than the word.

Emit a report: term, expected, heard, verdict. Rate-limit and batch; both directions are on
the one `ELEVENLABS_API_KEY`. At ~400 short clips this is a few minutes of audio and pennies.

**This is a screen, not an oracle, and the plan should not pretend otherwise.** STT has its
own biases: it can "correct" a mispronunciation back to the right spelling (false negative)
or mis-hear a perfectly-spoken word (false positive). It narrows the human's work by roughly
an order of magnitude. It does not replace the ear.
**Tests:** The comparison/normalization logic is pure — unit test it (diacritic folding,
case, punctuation, plural tolerance). The network calls are not unit tested.
**Depends on:** Unit 1
**Verification:** Run against a hand-built set of ~10 known-good and ~10 known-bad terms and
confirm the screen separates them sensibly.

### Unit 3: The lexicon module and matcher

**Goal:** The pure machinery, correct and fully tested, before any word list exists.
**Files:** `src/lib/voice/lexicon.ts`, `test/voice-lexicon.test.ts`
**Approach:** Export an ordered rule table (`{ match, spoken }`) and an `applyLexicon(text)`
that compiles the table into **one alternation regex, applied in a single pass**, with
alternatives sorted by descending length. Single-pass is the design that makes cascade
impossible: a replacement's output is never re-scanned within the pass. Match must be
diacritic-tolerant and case-insensitive, on word boundaries.

Ship this unit with an empty or near-empty table. The machinery is what is being tested here;
the content arrives in Unit 5.

Add a **structural guard test** over whatever the table contains: for every rule, assert that
its `spoken` output matches no rule's `match` pattern. That is the invariant that keeps the
table safe to extend later by someone who has not read this plan.
**Tests:** longest-match-first (`Cabernet Sauvignon` vs `Cabernet`); diacritic-insensitive
matching; word-boundary respect (no matching inside a larger word); idempotency
(`applyLexicon(applyLexicon(x)) === applyLexicon(x)`); the structural no-cascade guard.
**Depends on:** none
**Verification:** `npx vitest run test/voice-lexicon.test.ts`

### Unit 4: Wire the lexicon into `toSpeakable`

**Goal:** The spoken path uses the lexicon; nothing else changes.
**Files:** `src/lib/voice/speech.ts`, `test/voice-speech.test.ts`
**Approach:** Call `applyLexicon` as the **last** step of `toSpeakable`, after
`normalizeUnits`. Ordering is load-bearing and non-obvious: `normalizeUnits` *produces* the
word "Brix" from `°Bx`, so a lexicon running before it would never see the term it is
supposed to fix.
**Tests:** Extend `test/voice-speech.test.ts` with a double-application test asserting
`toSpeakable(toSpeakable(x)) === toSpeakable(x)` across a corpus containing every lexicon
term — this is the one that models the real client-then-route pipeline. Assert existing unit
normalization still passes unchanged.
**Depends on:** Unit 3
**Verification:** `npx vitest run test/voice-speech.test.ts test/voice-lexicon.test.ts`

### Unit 5: Curate and populate the lexicon

**Goal:** Turn screened failures into reviewed rules. This is the human gate.
**Files:** `src/lib/voice/lexicon.ts`, `docs/kb-eval/pronunciation-lexicon-audit.md`
**Approach:** Take Unit 2's failure list. For each failure, write a respelling —
lowercase-hyphenated ("see-rah", "reez-ling", "vee-oh-nyay"), **not** ALL-CAPS syllables,
which some voices read as initialisms or hard emphasis. Then close the loop: **re-run the
Unit 2 screen on the respelling** and keep it only if it now passes. That makes the screen
validate the fix, not just detect the problem.

Cap the committed table (start ~120 rules) and record in the audit doc what was mined, what
failed, what was adopted, what was rejected and why, and what was dropped by the cap. That
audit file is the "no auto-generated list reaches production unreviewed" gate the request asked for.
**Tests:** Guard tests from Unit 3 now run against the full table — no-cascade and idempotency
must hold at real size.
**Depends on:** Units 1, 2, 3, 4
**Verification:** Full voice test suite green; audit doc committed alongside the table.

### Unit 6: Codes — lot, vessel, strain

**Goal:** Stop the assistant reading `2026-SY-2` as "twenty-twenty-six minus S Y minus two".
**Files:** `src/lib/voice/lexicon.ts` (pattern rules), `test/voice-lexicon.test.ts`
**Approach:** Pattern rules rather than term rules, since these are generated, not enumerable.
Lot codes (`YYYY-XX-N`), vessel codes (T5, T7), and strain codes (EC-1118, D254, RC212, VP41).
Decide per shape whether digits read as digits or as a number — "EC eleven eighteen" versus
"E C one one one eight" is exactly the kind of thing to settle with the ear pass in Unit 7,
not by assertion here. Keep these rules in the same single-pass table so no-cascade still holds.
**Tests:** Each code shape; and that a bare year or a plain number is left alone.
**Depends on:** Unit 3
**Verification:** `npx vitest run test/voice-lexicon.test.ts`

### Unit 7: Measure, listen, tune

**Goal:** Prove it got better, then fix what the number cannot see.
**Files:** `docs/kb-eval/pronunciation-lexicon-audit.md`, `src/lib/voice/lexicon.ts` (tuning)
**Approach:** Re-run the Unit 2 screen over the same candidate set with the lexicon applied.
Record before/after failure counts — that is the objective claim ("63/400 round-trip failures
before, 11/400 after") and it belongs in the ticket resolution note.

Then the ear pass, which is the actual acceptance gate. Synthesize batched carrier sentences,
roughly 25 terms per clip, so the review is about 20 minutes of listening rather than 400
individual plays. Russell listens once, flags what still sounds wrong plus anything the
lexicon made *worse*, and one tuning iteration is budgeted to fix those.
**Tests:** No new unit tests; this unit produces evidence.
**Depends on:** Units 5, 6
**Verification:** Before/after numbers recorded; Russell signs off by ear.

## Test Strategy

**Unit tests:** vitest under `test/`, matching `test/voice-speech.test.ts` — plain
input/output assertions, `environment: "node"`, no DOM. New file `test/voice-lexicon.test.ts`;
extensions to `test/voice-speech.test.ts`.

**The three tests that actually matter:**
1. Idempotency across the full term corpus — models the real client-then-route double call.
2. Structural no-cascade — no rule's output matches another rule's pattern.
3. Longest-match-first — "Cabernet Sauvignon" never degrades to "Cabernet" + " Sauvignon".

**Integration:** none required. The change is confined to a pure function on the spoken path.

**Manual verification:** The Unit 7 ear pass. A unit test proves a substitution *fired*; only
listening proves it *sounds right*. That is the honest acceptance criterion here, same as
ticket #460's.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| A respelling makes a word worse than the default | MED | MED | Only add rules for terms that FAIL the screen, and re-screen the respelling before adopting it |
| Mining surfaces mostly junk (author names, journals, place names) from scientific text | HIGH | LOW | Frequency ranking plus the screen — a junk term that the engine pronounces fine never reaches a human |
| Round-trip screen gives false negatives (STT "corrects" a bad pronunciation) | MED | MED | Screen is explicitly a narrowing tool, not an oracle; the ear pass is the real gate |
| Cascade / double-application bug garbles speech in production | LOW | HIGH | Single-pass alternation matcher makes it structurally impossible, plus the guard test and the idempotency corpus test |
| Scope explosion — 12.5M tokens will happily yield thousands of candidates | HIGH | MED | Hard caps at both stages (N=400 screened, ~120 adopted), with dropped counts logged, never silently truncated |
| Lexicon leaks into the written transcript or stored data | LOW | HIGH | Applied only inside `toSpeakable`, which is on the spoken path only; assert in tests that no caller stores its output |

## Success Criteria

- [ ] Candidate list mined from real data, with kept/dropped counts reported.
- [ ] Round-trip screen produces a before/after failure count over the same candidate set.
- [ ] Lexicon covers the ticket's flagged terms: Syrah, Saccharomyces cerevisiae, yeast strains.
- [ ] Lot codes, vessel codes, and strain codes read naturally.
- [ ] `toSpeakable(toSpeakable(x)) === toSpeakable(x)` across the full term corpus.
- [ ] No rule's output matches another rule's pattern.
- [ ] Audit doc committed recording mined / screened / adopted / rejected / dropped.
- [ ] Russell's ear pass signed off, with one tuning iteration applied.
- [ ] All existing voice tests pass; no regressions.

## Follow-on (explicitly not this plan)

The **STT input side** — Scribe hearing "Syrah" as "Sarah". Two facts make this a natural next
ticket rather than part of this one:

1. Scribe v2 supports **keyterm prompting** (a `keyterms` array, up to 1000 terms of 50 chars,
   context-aware). We currently send `scribe_v1` with no biasing at all.
2. This repo already had exactly that bias and lost it by accident. Commit `3a3fba51` moved STT
   from OpenAI to ElevenLabs and deleted a `DOMAIN_HINT` prompt that biased toward cellar
   vocabulary. The commit message reason was "the OpenAI key 502'd" — an infrastructure
   failure, not a quality judgment. The capability was collateral damage.

The term list this plan mines is the natural input to that ticket. It stays separate because
the risk classes differ: a wrong respelling costs a funny-sounding word, a wrong transcript
correction changes what the assistant acts on.
