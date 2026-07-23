# Pronunciation lexicon — audit trail

Plan [091](../plans/2026-07-23-091-feat-voice-pronunciation-lexicon-plan.md).
Ticket `cmrvhmo030001jp04t7youq4h` / issue #464.

This file is the curation gate: what was mined, what was screened, what earned a rule,
and what was deliberately left out. An auto-generated list never reaches production
unreviewed.

---

## Unit 1 — mining (DONE)

Swept 36,931 chunks across 3,299 active documents plus Demo Winery's Variety and
CellarMaterial rows.

| | |
|---|---|
| App-vocabulary terms (always kept) | 175 |
| Corpus candidates found | 26,720 |
| Corpus candidates kept | 400 (100 per heuristic) |
| Corpus candidates **dropped** | 26,320 |
| Written to `pronunciation-candidates.json` | 575 |

Three things the real data changed:

1. **9 of 25 knowledge sources publish in French, Spanish or German** (UMC, IFV France,
   IFV Occitanie, Chambre Gironde, ICVV, MAPA, INCAVI, WBI, LVWO). Unfiltered, the top
   candidates were `année`, `région`, `cépage`, `acidité` — ordinary foreign words, not
   borrowed cellar terms. Gating by source key is exact. A text-density detector was
   tried and rejected: tightening it enough to catch a French glossary block also
   flagged English prose naming two varietals, and losing real terms is the worse
   failure. Accented pool 4,426 → 1,122; the top is now `véraison`, `rosé`, `Moët`,
   `Baumé`, `Rhône`.
2. **Stratified cap, not flat top-N.** `proper-noun` yields 16k candidates and
   `scientific` 482. One ranked list is therefore all proper nouns, and the Latin terms
   never make the cut.
3. **Document frequency, not raw count.** An author name repeated 40× inside one paper
   must not outrank a term used once in each of 30 papers.

---

## Unit 2 — TTS→STT round-trip screen (BUILT, AND IT DOES NOT WORK)

**Verdict: rejected as a triage gate. The failure is structural, not tunable.**

The idea was to speak each candidate, transcribe it back with Scribe, and treat a
mismatch as evidence of mispronunciation — turning ~400 manual listens into ~40.

### Run 1 — wine carrier ("The winemaker mentioned X during the tasting.")

| | |
|---|---|
| Known-good failure rate | 0% |
| Known-hard failure rate | 10% |
| Separation | **10 points** |

9 of 10 known-hard terms came back byte-perfect, including Syrah, Gewürztraminer and
Saccharomyces. The carrier sentence names a winemaker and a tasting, handing Scribe the
exact domain prior it needs to repair the word.

### Run 2 — neutral carrier ("The next word is X, followed by a pause.")

| | |
|---|---|
| Known-good failure rate | 10% |
| Known-hard failure rate | 40% |
| Separation | **30 points** |

Newly caught: `bâtonnage`→"batonage", `Mourvèdre`→"Morvedra", `Oenococcus`→"onococus",
`veraison`→"verizon".

That clears the 30-point bar, but reading past the headline number kills it:

- **False positive:** `cellar` → "seller". Not a mispronunciation at all. ElevenLabs
  said it correctly; Scribe just picked the other homophone. The screen would send a
  human to fix a word that was already right.
- **False negatives:** `Syrah`, `Saccharomyces`, `Gewürztraminer`, `Viognier`,
  `Riesling`, `Brettanomyces` all passed — **including the two terms the ticket names
  explicitly**.

### Why this cannot be tuned

Scribe is a modern STT with a strong language-model prior. Its job is to output the
word the speaker *intended*, regardless of how well it was pronounced. That is exactly
the signal we are trying to measure, so the tool is structurally opposed to the
measurement. Starving it of context does surface some failures, but it degrades general
transcription at the same time (`cellar`→"seller"), adding noise faster than signal.

30 points of separation on a 20-term sample is an artifact, not a method.

### Knock-on consequence

Unit 7's planned objective before/after number ("63/400 failures before, 11/400 after")
**is no longer available**. If the screen cannot detect a mispronunciation, it cannot
measure that one was fixed. The ear pass is now the only acceptance gate, as it was for
the voice turn-taking ticket (#460).

The harness is kept, not deleted: it is a reusable TTS→STT rig, it documents the
negative result so nobody re-derives it, and its `--lexicon` mode can still spot a
respelling that makes a word *actively worse* (a strong regression signal even though
the weak direction is unreliable).

---

## Unit 7 — ear pass, batch 1 (2026-07-23, Russell)

27 numbered terms, one ~90s file, grounded in Demo's real varieties and materials plus
the two the ticket names. **9 of 27 judged wrong.**

### The result that matters

The ear pass is the reason the automated screen was right to be rejected — it got the
answer wrong in *both* directions:

| Term | Automated screen | Russell's ear |
|---|---|---|
| Syrah | passed | **wrong** |
| Saccharomyces | passed | **wrong** |
| Gewürztraminer | passed | **wrong** |
| Brettanomyces | passed | **wrong** |
| veraison | **failed** | fine |
| bâtonnage | **failed** | fine |

Trusting the screen would have left every reported term broken while rewriting two
words the engine already says correctly. That is worse than doing nothing, and it is
why the rule is: nothing enters the table without being heard.

### Adopted (9)

| # | Term | Spoken as |
|---|---|---|
| 1 | Syrah | `see-rah` |
| 2 | Saccharomyces cerevisiae | `sack-a-roh-my-seez sair-uh-vizz-ee-eye` |
| 11 | Gewürztraminer | `guh-verts-trah-mee-ner` |
| 15 | Sangiovese | `san-joh-vay-zeh` |
| 16 | Brettanomyces | `bret-an-oh-my-seez` |
| 17 | Oenococcus oeni | `ee-noh-kok-us ee-nee` |
| 22 | Erbslöh | `erbs-luh` |
| 24 | EC-1118 | `E C eleven eighteen` |
| 25 | potassium metabisulfite | `puh-tass-ee-um met-a-by-sul-fite` |

Plus three companion forms for when the assistant says the short version on its own:
bare `Saccharomyces`, bare `Oenococcus`, bare `metabisulfite`, and `cerevisiae` after an
abbreviated genus. 13 rules total.

**#24 is a convention, not a reading rule.** "E C eleven eighteen" is how the industry
says that strain (confirmed by Russell). It is deliberately NOT generalised into a
pattern over strain codes: `D254` and `RC212` have their own spoken conventions that are
custom rather than arithmetic, and guessing them ships a confident mispronunciation.
They get rules when they get an ear pass.

### Judged fine — deliberately NOT given rules (18)

Meunier, Solaris, Sauvignon Blanc, Cabernet Sauvignon, Pinot Noir, Chardonnay, Merlot,
Viognier, Mourvèdre, Grenache, Riesling, veraison, bâtonnage, malolactic, Brix, Lalvin,
Amorim, and the lot code `2026-SY-2`.

Their absence from the table is an assertion, and `test/voice-lexicon.test.ts` pins it.

**Unit 6 (lot / vessel / strain code rules) is therefore mostly unnecessary.** The plan
assumed `2026-SY-2` would read as "twenty-twenty-six minus S Y minus two"; it does not,
so no code rule was written. Only the EC-1118 strain convention needed one.

## Unit 5 — outstanding

Batch 1 covered 27 terms. 548 of the 575 mined candidates remain unheard. Whether to run
more batches depends on how batch 1's fix lands.

## Deliberately out of scope

- **STT input side** (Scribe mishearing "Syrah" as "Sarah"). Separate risk class: a
  wrong respelling costs a funny-sounding word, a wrong transcript correction changes
  what the assistant *acts on*. Scribe v2 supports keyterm prompting, and this repo
  already had that bias via OpenAI's `prompt` until commit `3a3fba51` dropped it for an
  infrastructure reason ("the OpenAI key 502'd"), not a quality one. The mined term
  list here is the natural input to that ticket.
- **Switching TTS model** to unlock IPA phonemes. `eleven_flash_v2_5` ignores phoneme
  rules silently; changing model costs the conversational latency it was chosen for.
