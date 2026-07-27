# Spray Intelligence — Discovery Brief (the contract document)

**Status:** contract. The [runbook](./SPRAY_ASSISTANT_RUNBOOK.md) owns phase order and gates; this
document owns the domain rules, the math contracts, the honesty contracts, and the output shape.
**Owner:** Russell Moss
**Date:** 2026-07-26
**Companion:** [spray-data-sources-design.md](./spray-data-sources-design.md) — what data exists,
what is paid, what does not exist.

If an implementation detail here conflicts with the codebase as it stands, **preserve the product
and safety rule; adapt the implementation.**

---

## 1. The product job

> Let a grower talk to Cellarhand about a spray decision and get back an inspectable decision
> record — what the risk is, whether the block is still protected, what is legally and physically
> possible in the next window, and what we do *not* know — grounded in that block's own weather,
> phenology, and spray history.

### 1.1 Product principles

1. **Recommend and explain. Never authorize.** The label is the law. A human decides.
2. **The reasoning chain is the product.** A product name is worth little; the inspectable chain
   that produced it is worth a lot, because it is what lets a grower override us with better field
   knowledge.
3. **Never missing a constraint beats being clever.** Our value is exhaustive checking, not
   agronomic brilliance.
4. **Say what we don't know, in the same breath as what we do.** Risk and confidence are two
   numbers, always.
5. **A gap is not a clearance.** Unknown must never look like clear. This is the failure mode that
   would actually hurt someone.
6. **Every index is a screening index.** "Scout," never "diagnose."
7. **"Do not spray" and "cannot determine safely" are legitimate, first-class answers.**
8. **A model may not depend on data the system does not collect.** *(Council C10.)* If an index's
   inputs have no structured source, either the collection surface ships first or the index is cut.
   Sour rot triggered this rule — it needs berry-wound and vinegar-fly observations that do not
   exist — and it will not be the last.
9. **The app must never brick outside the US.** *(Council C6 — Bhutan is a live tenant.)* The
   regulatory layer is US-only; the agronomic engines are jurisdiction-neutral. A non-US tenant
   supplies product facts manually, attributed and marked "grower-supplied, not registry-verified,"
   and everything else works unchanged.

### 1.2 The design mistake we are explicitly avoiding

Encoding a calendar, or the shorthand *"one inch of rain means spray before and respray after."*
That is a useful grower heuristic and a terrible rule. The real decision decomposes into five
independent questions that must be evaluated **separately**:

1. Is an infection event likely?
2. Is the block currently protected?
3. How much residue survives weathering *and new growth*?
4. Can the proposed material legally and safely be applied?
5. Will conditions allow adequate coverage without injury, drift, or wash-off?

---

## 2. Architecture: two engines that never mix

This is the load-bearing decision of the program, and it is the same one
[plan 086](../plans/2026-07-20-086-feat-us-pesticide-registration-plan.md) already made.

| | **Deterministic engine** | **Probabilistic engine** |
|---|---|---|
| Answers | Is this legal? Does it rotate? Does it burn? Has the interval elapsed? | Is infection likely? Is the block still protected? Is this a good window? |
| Storage | Relational tables, versioned by EPA reg number + label date | Pure cores over time series |
| Method | Exact joins | Indices with confidence bands |
| Output | permitted / prohibited / **cannot-determine** | risk level + confidence + reason |
| Failure mode | Refuses | Says *unknown* |

**Three rules fall out of this and are absolute:**

- **The model may never produce a hard stop.** A hard stop is a join result. The LLM may explain
  one, quote one, or route to one. It may not originate one.
- **Nothing safety-critical goes in the RAG corpus.** Label rules, FRAC codes, rates, PHI/REI, and
  interlocks are structured data queried by exact match, not prose queried by similarity. The
  corpus answers *"why is powdery pressure high this week."* It must never answer *"can I legally
  apply this."*
- **Neither engine is allowed to fill the other's gap.** A missing legal fact does not become an
  agronomic judgement call, and a missing weather input does not become a conservative guess.

The assistant *composes*. It is the third layer, and it owns none of the truth.

---

## 3. Hard stops — the non-negotiable gate

The assistant must never give a pesticide recommendation from an active ingredient, trade name,
disease, or forecast alone. It needs: the exact **product**, formulation, **EPA registration
number**, current label version, state, crop, target pest, block, and application history.

Before any agronomic reasoning, verify:

- Product currently registered **in the state**; grapes and the intended target pest permitted.
- Bearing/nonbearing status and vine age satisfy the label.
- Rate, concentration, gallons/acre, and application method permitted.
- **Minimum repeat interval** elapsed; maximum applications and maximum amount per acre per season
  not exceeded.
- **PHI, REI**, PPE, WPS, restricted-use status, certification, notification satisfied.
- Pollinator / blooming-crop / flowering-groundcover / aquatic / runoff / drift-buffer /
  endangered-species restrictions satisfied.
- Any required **EPA Bulletins Live! Two** geographic bulletin checked — where a label references
  it, those geographic limits are enforceable extensions of the label.
- Tank-mix and spray-history incompatibilities satisfied.
- Workers can stay out for the REI; harvest will not occur before the PHI.

**A missing label, unknown prior spray, uncertain vine age, unknown phenology, or unavailable state
registration produces "Cannot determine safely — human review required." Never a guess.**

### 3.1 The gap-is-not-a-clearance rule (the program's most dangerous failure)

Plan 086 measured this: derivation succeeds for mainstream single-site chemistry and fails
*predictably* on multi-site compounds and biologicals. Both failures are survivable **only because
the coverage report makes them visible.** Therefore, in data and in UI:

- Every active ingredient resolves to exactly one of **coded**, **no-code-exists-for-this-class**,
  or **gap**. Zero unclassified.
- *No-code-exists* (sanitizers, oils, some fumigants — FRAC only codes fungicides) renders
  differently from *gap* (we should know this and don't).
- A **gap renders as unknown**, visually distinct from clear, and a rotation view containing a gap
  cannot report "rotation OK."

### 3.2 Two derivation traps, already measured — do not re-discover them

- **Never derive a product-level code from an AI-keyed source's trade-name parentheses.** Cornell
  lists trade names as *products containing this AI*, not *products whose code is this*. `Switch`
  appears under `cyprodinil (9)` but Switch is **9/12**. A naive join silently drops group 12 — an
  under-count of a mode of action, which is the dangerous direction.
- **Model `siteType` (single | multi) separately from the code.** Sources disagree systematically
  on multi-site compounds because they answer different questions: Cornell marks captan and copper
  `N/A` (*not a rotation partner*); UC IPM gives `M 04` / `M 01` (*the taxonomic code*). Both are
  correct. One field forces a wrong answer to one question, and rotation is the question that
  produces bad advice.

---

## 4. Rain is a reassessment trigger, not a rule

Rain acts on **both sides** of the decision: it can initiate or sustain an infection event; remove
or redistribute residue; prevent a material from drying or absorbing; and drive rapid new growth
that no prior spray ever covered.

### 4.1 What the evidence actually supports

MSU grape work: ~0.1″ can remove 20–25% of some protectant residues, but **1–2″ is usually needed
to reduce disease-control efficacy significantly** — and **older residue is far more vulnerable**
(~0.5″ can matter on a week-old, UV- and microbially-degraded residue). The practical extension
heuristic — renew a recent protectant after >2″, or after 1″ when the residue is ≥7 days old — is
an **agronomic heuristic, not a label rule**, and must be presented as such.

Working bands for **protectants** (mancozeb, captan, sulfur, copper), always modified by §4.2:

| Rain since application | Treatment |
|---|---|
| < 0.5″ | minimal loss |
| 0.5–1″ | ~25–50% loss; act if in the critical window or a new infection period is coming |
| 1–2″ | significant; assume at reapplication |
| > 2″ | assume gone |

### 4.2 Three modifiers that matter more than the total

1. **Drying time before the rain.** Rain within ~an hour of application is near-total loss
   regardless of amount; most materials want 1–2 hours to dry. This is why "spray ahead of the
   rain" fails when cut too close — spraying *after* would have been better. **S3 records whether
   the spray dried**; S6 must consume it.
2. **Intensity, not just volume.** A 1″ gentle overnight soaker removes less than 0.4″ of driving
   thunderstorm. Hourly precipitation (S1) makes this computable; almost no competing model
   captures it.
3. **Chemistry.** Rainfastness is a product property, not a category property:
   - Strobilurins (FRAC 11), SDHIs (7): rainfast ~1–2 h once absorbed into the wax layer
   - DMIs (3): a few hours, plus post-infection activity on black rot — the bailout
   - Phosphorous acid (P07): systemic, quickly rainfast, strong post-infection on downy
   - **Sulfur, copper, mancozeb, captan: purely surface, fully vulnerable**

### 4.3 Before and after

**Before rain**, recommend a pre-rain application only when *all* hold: the forecast represents
meaningful infection risk; existing protection is insufficient; there is enough rain-free time for
the material to dry or absorb per its label; wind/temperature/humidity/canopy permit a good
application; and the block is at a susceptible stage.

**After rain**, never auto-respray on a forecast total. Use **measured** rainfall, residue age,
product properties, growth since application, and the infection model. Actual weather replaces
forecast weather after the event — **recalculate, never preserve the original recommendation.**

---

## 5. The protection budget (replaces "spray interval")

Every application deposits finite residue on finite tissue. That budget depletes on **four
independent channels**, and most growers only think about the first:

1. **Wash-off** — rain amount × intensity × drying achieved × chemistry (§4)
2. **Growth dilution** — new unprotected tissue (§5.1)
3. **Degradation** — UV, temperature, microbial breakdown over residue age
4. **Redistribution loss** — wind, dew runoff

**The decision question becomes:** *is remaining protection below the threshold implied by
tonight's infection risk?* — not *has N days elapsed?*

### 5.1 Growth dilution — the underrated channel

Pre-bloom through fruit set, shoots put on 1–3″/week. A perfect Monday application can leave
30–40% of leaf area unprotected by Friday **with zero rain**. In that window the interval is
governed by growth rate, not chemistry or weather. This is why **S4 (phenology + growth) is a
Wave-1 lane** and not a nicety.

Practical shape: during rapid growth, 7 days is a ceiling and 5–7 is realistic in a wet year on a
susceptible variety. Post-veraison, with growth stopped and ontogenic resistance established, the
same product may genuinely hold 14–21 days.

### 5.2 Residual model inputs (the full set)

Chemistry class (contact/protectant · translaminar · locally systemic · mobile systemic) ·
product-specific rainfast/absorption time · time between spraying and rain onset · whether it dried ·
rain amount, intensity, duration · residue age · UV exposure and temperature since application ·
new shoot and leaf growth · canopy density and original coverage quality · disease pressure and
phenological risk · whether lesions are already present · every-row vs alternate-row, dilute vs
concentrate.

### 5.3 Output contract

**Categorical, not a percentage** *(council S1, 2026-07-26)*. The output is one of
`Protected / Vulnerable / Depleted / Unknown`, **an explicit confidence**, and **the decay drivers** —
*"depleted — 6″ shoot growth since application, 1.2″ rain on a 9-day-old protectant."*

A raw "42% protection remaining" implies a mathematical certainty that does not exist: fungicide
efficacy is not a linear dial, and a grower reading 42% will treat it as measured. Keep the
underlying number internal for goldens; **never surface it.** The driver is what a grower acts on
anyway.

Confidence falls when: no recent deposition/coverage check exists; the spray record is name-only
(legacy field note); canopy density is unknown; or rainfall comes from a distant grid cell.

**Missing spray history yields *unknown protection*, never *full protection*.**

---

## 6. The clocks

An interval is never "7 days" or "14 days." Track these separately and surface all of them:

1. Earliest **legal** repeat date (label)
2. Latest label interval permitted for this disease/use pattern
3. Expected **residue-life** clock (§5)
4. **New-growth dilution** clock
5. **Disease-infection** clock
6. **Critical-phenology** clock
7. **Resistance-management** clock
8. **PHI / harvest** clock
9. **Worker-entry (REI) / field-operation** clock

The agronomic due date is whichever becomes urgent first. **The system may never violate the
minimum legal interval.** When protection is needed before a product can legally repeat, the answer
is: *"Protection may be inadequate before this product's next legal application date. Evaluate
another currently labeled material with an appropriate mode of action, or a nonchemical
intervention."*

### 6.1 Interval shape by phenology

The single most important structural rule: **immediate pre-bloom through ~4–6 weeks post-bloom is
where the season is won or lost.** Berries acquire ontogenic resistance — powdery ~2–4 weeks
post-bloom, downy and black rot nearer 4–6. Before that, fruit is defenseless.

| Stage | Interval | Rationale |
|---|---|---|
| Bud break – 6″ shoots | 10–14 d | Low tissue; phomopsis focus |
| 6″ – immediate pre-bloom | 7–10 d | Growth dilution rising |
| **Pre-bloom → 4 wks post-bloom** | **5–7 d** | Fruit susceptible, maximum growth |
| 4 wks post-bloom → veraison | 10–14 d | Ontogenic resistance, growth slowing |
| Veraison → harvest | 14–21 d + PHI | Botrytis / sour rot only; residue limits |
| Post-harvest | as needed | Protect leaves for reserves |

**Subtlety worth encoding: the rachis stays susceptible much longer than the berries.** Late rachis
infection causes shatter and cluster collapse even when berries are immune.

### 6.2 Conditions that shorten an interval

Immediate pre-bloom → ~3 weeks post-bloom · highly susceptible cultivar · previous-year disease or
abundant overwintering inoculum · current lesions or a missed infection event · repeated warm, wet,
humid, cloudy weather · rapid shoot and leaf expansion · protectant residue exposed to substantial
rain · dense canopy, tight clusters, poor fruit-zone penetration · questionable calibration or
coverage · alternate-row spraying in a canopy too dense for cross-row deposition · severe pressure
or nearby abandoned/infected vines · a long forecast window in which another application will be
impossible.

### 6.3 Conditions that permit the longer end

Low-susceptibility cultivar · little disease history or inoculum · no active disease · weather
genuinely unfavorable to the target pathogen · shoot growth slowed · recent, largely intact residue ·
independently verified coverage · past the critical fruit-susceptibility period · **and the label
allows it.**

> A label interval of "7–14 days" is a **legal boundary, not a promise of residual control.**

---

## 7. Pathogen models

Every output is a **screening index that prompts scouting**, cross-linked to the IPM knowledge
base, never a diagnosis. This is the highest-honesty-risk part of the program; the copy matters as
much as the math.

**Universal rule: an index whose inputs are missing degrades to *unknown*, never to *low*.**

### 7.1 Powdery mildew — the exception that breaks intuition

**It does not need rain. Humidity alone is sufficient, and a dry forecast must never produce "low
powdery risk."** Spring ascospore release needs ~0.1″ rain and >50 °F; after that it runs on
temperature. Optimum 68–77 °F; suppressed above ~95 °F and by direct UV. Canopy shade and poor
airflow increase risk.

Model: **Gubler-Thomas (UC Davis) risk index** — points accrue on consecutive days with ≥6
continuous hours in the 70–85 °F band (21–30 °C); heat >35 °C knocks points down. High index →
7-day intervals; low index → stretch toward 14–17.

**Temperature-only, so it is buildable on today's daily data via diurnal reconstruction — ship it
first as the program's proof.** Additional inputs: cultivar susceptibility, active colonies,
previous-year pressure, phenology, shoot growth, canopy density, prior fungicide effectiveness and
FRAC history.

### 7.2 Downy mildew

Driven by warm, wet conditions, high humidity, and leaf wetness. Primary-infection trigger: the
**"3-10 rule"** — ~10 mm rain, mean temp ≥10 °C, shoots ≥10 cm. Secondary sporulation needs night
temperatures above ~13 °C, 4+ hours of darkness, and near-saturation humidity (Cornell: ~55–86 °F
overnight with high RH supports sporulation). Critical fruit window ≈ 2 weeks pre-bloom → 3 weeks
post-bloom; **leaves stay susceptible far later.**

Two things to encode that growers get wrong:

- **Symptoms may not appear for 7–12 days after infection.** "I scouted today and saw nothing" does
  not mean the last infection event failed → the latent-infection ledger (§7.7).
- **Late-season leaf infection still matters after the fruit is safe** — defoliation costs
  carbohydrate reserves and winter hardiness. Growers who quit at harvest pay two winters later.

The sensor-grade models (DMCast) need measured leaf wetness we do not have. **Say so.**

> ## ⚠️ §7 CORRECTED BY S0 (2026-07-26) — this table was materially incomplete
>
> Council G1 flagged it and S0 went to the sources. **Three of the six pathogen entries below
> understate what the literature specifies, and the errors all run the same way: they hide LWD
> consumers.** That matters because the whole weather lane is sized by how many things consume leaf
> wetness.
>
> | Model | What §7 said | What the literature says |
> |---|---|---|
> | **Botrytis** (§7.5) | *"cool, damp conditions"* — no LWD | **Broome et al. 1995 (Phytopathology 85:97-102) is explicitly an LWD × temperature infection model.** Botrytis is an LWD consumer |
> | **Phomopsis** (§7.4) | no numbers | **Erincik et al. 2003 (Plant Disease 87:832-840)** gives exact temperature × wetness-duration requirements, with **separate thresholds for cane and leaf infection** — optimum 16–20 °C, range ~5–35.5 °C |
> | **Powdery mildew** (§7.1) | temperature-only | Secondary spread is temperature-driven, but **primary ascospore release requires wetness**, and **liquid water suppresses secondary PM** (conidia burst). A wetness-blind PM model recommends sprays into conditions already suppressing the pathogen |
> | **Black rot** (§7.3) | three points | Spotts is a **continuous curve in 5 °F steps, 50–90 °F**, U-shaped with a minimum of **6 h at 80 °F** — and the requirement **rises again above 80 °F** (9 h at 85, 12 h at 90). The three-point reading loses both the upper limb and the resolution |
> | Anthracnose (§7.4) | 3–4 h, mid-70s–mid-80s °F | ✅ consistent — the one entry the literature agrees with |
> | Downy (§7.2) | driver named, no threshold; DMCast excluded | ✅ consistent |
>
> **Consequence: S5b's scope grows.** Botrytis and phomopsis are LWD models, not the qualitative
> gates this section implied.
>
> ⚠️ **And S5b cannot start from S0's renderings of the two.** Broome's and Erincik's published
> coefficients are **paywalled** — only their experimental designs are public — so S0 could only build
> coarsened threshold surfaces through the public anchors, which carried **no gate weight**. S5b must
> obtain both papers. Evidence: [phases/s0-lwd-disagreement.md](phases/s0-lwd-disagreement.md) §1,
> `scripts/s0-pathogens.ts`.

### 7.3 Black rot

Temperature × leaf-wetness duration (Spotts): ~24 h wetness at 50 °F, ~9 h at 60 °F, ~6 h at
70–80 °F. **⚠️ See the §7 correction above — the real curve is continuous in 5 °F steps across
50–90 °F and rises again above 80 °F.** Inputs also: rain event timing, mummified berries and infected cane material,
previous-year history, cultivar susceptibility, fruit growth stage.

**The trap is the long incubation — 8 to 21+ days.** What is visible today came from a rain event
two weeks ago, so a grower reacting to symptoms is always three sprays behind. Inoculum source
matters enormously: **mummies retained in the canopy are far worse than mummies on the ground.**
DMIs' ~72-hour post-infection activity is the bailout.

### 7.4 Phomopsis and anthracnose

Early-season; rain splash onto young susceptible tissue; overwinters in old canes and rachises.
**⚠️ Phomopsis has EXACT published thresholds — see the §7 correction above (Erincik et al. 2003),
with separate requirements for cane and leaf infection. It is an LWD consumer, not a qualitative gate.**
Anthracnose can infect on only 3–4 hours of leaf wetness in the mid-70s to mid-80s °F, with longer
wetness widening the temperature range. Elevate risk when infected canes are present, the cultivar
is susceptible, shoots are young, rain is **repeated rather than isolated**, or sanitation was
incomplete. **Sanitation and pruning-out do more than fungicide** — say so in the recommendation.

### 7.5 Botrytis bunch rot

Less a foliar calendar, more a set of gates: susceptible cultivar and **cluster compactness**;
~~cool, damp conditions~~ **⚠️ an LWD × temperature infection model — Broome et al. 1995, see the §7
correction above**; bloom-time infection potential; bunch closure; veraison and pre-harvest
weather; dead floral debris retained inside clusters; berry injury from powdery, insects, birds,
cracking, hail, or machinery; fruit-zone airflow and spray penetration.

**Latent-bloom pattern:** infection at bloom expresses at veraison. Four timings — bloom,
pre-bunch-close, veraison, pre-harvest. But **fruit-zone leaf removal at fruit set outperforms most
spray programs**, and the system should be willing to recommend it instead of a spray. Tight-clustered
varieties (Vignoles, Pinot Noir, Chardonnay) carry a different risk profile than loose-clustered.

### 7.6 Sour rot — a different model, not a botrytis variant

> ⛔ **NOT BUILDABLE TODAY — deferred under §1.1 rule 8** *(council C10, both reviewers independently)*.
> `BrixLog` exists, but **berry-wound status and vinegar-fly pressure do not exist anywhere in the
> schema**, and the weekly field note does not carry them. The model would never fire, or would fire
> on fabricated inputs. It returns only if S4 adds a *"cluster damage + pest pressure"* scouting
> observation. The domain content below stands as the contract for when it does.

A complex of damaged berries, yeast + acetic acid bacteria, and vinegar flies (including SWD).
Gates: **Brix above ~15** (`BrixLog` already exists per block), tight-clustered cultivar, berry
cracking or wounds, powdery/botrytis injury, bird/wasp/insect damage, vinegar-fly activity, warm wet
forecast, fruit-zone airflow, historical block pressure. Rain near harvest causes splitting, which
causes a spike.

**Fungicides alone do not touch it** — management is insecticide plus an antimicrobial
(peroxyacetic acid). And Cornell work found **leaf removal reduced sour-rot damage**: the
recommendation does not always have to be another spray.

### 7.7 The latent-infection ledger (differentiated)

An append-only record of infection events, each carrying its pathogen-specific incubation window,
so that:

- a clean scouting pass does **not** clear a black rot event from 14 days ago;
- a downy event stays "pending expression" for 7–12 days;
- a bloom botrytis infection stays open until veraison.

This is the house style already (append-only, correction-as-event) and it is a thing a
calendar-driven competitor structurally cannot do.

### 7.8 Ripe rot

Risk rises from veraison to harvest. NEWA's model combines phenology, temperature, and moisture, and
classifies values above 0.45 as very high risk — **and NEWA itself cautions it is not a standalone
decision source.** That caution is the correct posture for our entire §7: a weather model is one
evidence stream, not the answer.

---

## 8. Phytotoxicity interlocks

These are **deterministic hard stops** (§2), keyed by **EPA registration number and formulation** —
never by the category. Two different oils may have different temperature limits, sulfur intervals,
copper restrictions, and adjuvant rules.

### 8.1 Sulfur

Check: exact product and formulation · **cultivar sulfur sensitivity** · current temperature ·
**hourly forecast during and immediately after application** · vine water stress · recent or
planned oil · whether foliage is wet · canopy coverage · disease pressure · late-season winery
residue policy.

Cornell: even sulfur-tolerant cultivars can suffer slight-to-moderate injury at **≥85 °F during or
immediately after application**. Structure:

| Condition | Response |
|---|---|
| < 80 °F | ordinary product + cultivar checks |
| 80–84 °F | increasing caution; more so on stressed vines or sensitive cultivars |
| ≥ 85 °F during or immediately after | **strong phytotoxicity warning** |
| ≥ the product's label prohibition | **hard stop** |
| Water-stressed vines, tender growth, prior sulfur injury, recent oil | elevate further |

**Do not evaluate on the temperature when the tractor enters the block.** Sulfur can still be wet as
the day warms — this needs S1's **hourly forecast after application**. Variety sensitivity is the
bigger factor than temperature: many labrusca and hybrids are sensitive (Concord, Foch, Chancellor,
De Chaunac, Rougeon, Ives are the commonly named ones); vinifera is generally tolerant.
`Variety.species` already distinguishes `HYBRID` — that is the hook, and a per-variety sensitivity
override belongs on the block/variety profile. **Sulfur is a contact material: new tissue emerging
after application is unprotected.**

### 8.2 Horticultural oils (JMS Stylet-Oil as the worked example)

From the JMS label, for grapes: do not spray wet foliage · not above 90 °F · not on heat- or
moisture-stressed plants · not when freezing is anticipated within 48 h · add oil **last** to a tank
mix · **do not apply sulfur within 10 days after an oil application** · do not use copper and oil
together when fruit is present · specific prohibited combinations including Captan, Folpet,
chlorothalonil, and pinolene-based spreader-stickers · oil temporarily removes grape bloom.

Two system-design nuances that must be encoded:

- **The separation is direction-specific.** "No sulfur within 10 days *after* oil" does **not**
  establish that oil may be applied 10 days after every sulfur product. The sulfur label may impose
  a different rule in the other direction. Evaluate: *label A + label B + crop + fruit present +
  direction + elapsed days* → **most restrictive wins.**
- **Do not inherit JMS's rules into every oil.** Store compatibility by EPA registration number and
  formulation, not by "oil."

Practically, conservative operators run a **10–14 day separation in both directions** for
oil↔sulfur, and the same for **oil↔captan** (a known phytotoxicity combination). Oil also
temporarily suppresses photosynthesis, so heavy late-season use can delay ripening — and oil has
genuine value as a powdery eradicant and, being physical in mode of action, as a resistance tool.

### 8.3 Copper — a slow-drying problem, not a hot-weather problem

The inverse of sulfur: **injury risk rises in cool, humid, cloudy, slow-drying conditions.**
Variables: cultivar sensitivity (toxic to many natives and hybrids) · product and copper formulation ·
metallic copper delivered · rate and concentration · tenderness of current tissue · prior copper
injury · oil use and fruit presence · water chemistry and tank-mix partners · **cumulative seasonal
and historical copper use**.

Surface **two** numbers, not one: immediate phytotoxicity risk, and long-term copper **loading**.
For organic vineyards track cumulative elemental copper by block and season against soil-test
history — organic rules require avoiding accumulation, not treating copper as unlimited.

### 8.4 Captan

Beyond the oil interaction: **REI (4 days for many activities) will collide with the hand-labor
calendar** — and that is a scheduling conflict people discover the morning of. REI must be checked
against work orders, not just displayed.

### 8.5 Tank mixing

A jar test proves **physical** compatibility only — not crop safety, efficacy, or legality.
Evaluate: whether each label allows the mixture · whether any label prohibits the other active,
formulation, adjuvant, fertilizer, or oil · crop and growth-stage restrictions · spray-history
separation intervals · **mixing order** · water pH, hardness, alkalinity, temperature · whether
buffering/acidification is permitted · whether an adjuvant is required, optional, or prohibited ·
whether the mixture increases penetration and phytotoxicity · whether both products remain effective
at the same water pH · whether the combination adds unnecessary resistance or residue burden.

Standard warning copy: *"Both products are individually labeled on grapes. That does not establish
that the tank mixture is permitted or crop-safe."*

**Mixing order:** water → compatibility agent → WDG/dry flowables → wettable powders → suspension
concentrates → EC → surfactant/oil last.

**Spray water pH:** alkaline water hydrolyzes organophosphates and carbamates; buffer to ~5–6.5.
Hard water antagonizes glyphosate (add AMS). Cornell recommends testing spray-water pH and adjusting
above pH 7 where appropriate.

**Treat "hot mixes" cumulatively.** Oil, sulfur, copper, penetrant adjuvants, foliar nutrients,
heat, water stress, and tender tissue **stack** phytotoxicity risk even where no single factor would
cause injury.

---

## 9. The output: a decision record, not a product name

The assistant's answer is a structured record. Worked example:

```
Decision            Spray in the next suitable window
Target              Downy mildew — Block 4, Riesling
Biological risk     HIGH
  why               Immediate pre-bloom; 1.1″ forecast; overnight humidity and temperature
                    support infection; prior protectant is 9 days old
Protection          LOW–MEDIUM
  why               0.7″ rain since last application, ~6″ shoot growth, no recent coverage test
Hard restrictions   JMS Stylet-Oil applied 6 days ago → sulfur excluded under the loaded label rule
Legal windows       Earliest repeat date + PHI shown per eligible product
Application window  5:00–9:00 a.m.; adequate rainfast period available; wind toward the sensitive
                    property becomes unacceptable after 10:00 a.m.
Resistance note     Exclude the FRAC group used in the prior application unless the current label
                    and disease-specific strategy permit it
Next action         Human selects a currently labeled option; rescout 7–10 days after the recorded
                    infection event
Confidence          MEDIUM — the station lacks a functioning leaf-wetness sensor
What we don't know   Leaf wetness is estimated (CART, RH + dew-point depression + wind); no
                    deposition check since 6/12; block canopy density not recorded this week
```

**Contract:**

- `Decision` ∈ { spray in the next suitable window · hold and scout · do not spray · **cannot
  determine safely — human review required** }.
- Every risk and protection line carries a **why**.
- **`What we don't know` is never empty by construction.** If the system truly knows everything, it
  says so explicitly — it does not omit the section.
- Confidence is separate from risk, everywhere.
- The visual vocabulary — **clear / watch / act / unknown / blocked** — is defined once (S9) in
  DESIGN.md tokens and consumed by every surface.

---

## 10. Herbicides — inverted logic, separate engine

The instincts do not transfer; this is a distinct rule module.

First distinguish: pre-emergence vs post-emergence · annual vs perennial · grass / broadleaf /
sedge / woody vine / sucker · newly planted, nonbearing, or established bearing · soil-directed vs
foliar contact · under-vine band, spot, or whole-area.

**Pre-emergents want rain.** They need roughly 0.5″ to activate and incorporate — applying ahead of
forecast rain is *correct* here, the opposite of fungicide reasoning. But too little leaves it
unactivated, and excessive rain can move some materials below the germination zone, concentrate
treated soil in low areas, or increase crop injury and runoff. Variables: expected germinating
species · timing relative to germination · the **exact label's** activation-rain requirement ·
forecast amount and intensity · soil moisture · soil texture, organic matter, pH · slope, runoff,
erosion, ponding · vineyard age and root establishment · product persistence and prior residuals.

**Post-emergents:** correct weed ID · weed size and stage · actively growing vs drought/flood/cold
stressed · required adjuvant · rainfast period · temperature and humidity · **green vine tissue,
suckers, low shoots, exposed green bark** · shielding and nozzle alignment · wind, gusts, direction,
inversion risk · sensitive adjacent crops.

**Glyphosate translocation is the sleeper risk.** Contact with suckers or green trunk tissue moves it
into the vine and expresses as fan-shaped stunted growth the *following* spring. Late-season is worst
(the vine is translocating to roots). Shielded sprayers; keep it away from young vines entirely.

**Drift is a hard stop.** Grapes are highly sensitive to auxin herbicides, and Penn State notes
injury can persist across multiple seasons. **Do not encode one universal allowable wind speed** —
the current label may specify minimum *and* maximum wind speeds, droplet-size category, nozzle
requirements, release height, buffer distance, boom/shield requirements, and prohibition during
inversions. EPA's drift-mitigation labeling uses exactly those levers.

**The biggest herbicide threat in the East is not our spray — it is the neighbor's.** Growth-regulator
drift (2,4-D, dicamba) from corn or soybeans can volatilize days after their application at high
temperature. Register with DriftWatch/FieldWatch, keep neighbor communication logs, consider sentinel
plantings. (Bucks County makes this a live concern.) **Herbicide wind and inversion rules must be
stricter than the fungicide rules, not the same.**

The engine must be able to recommend **mechanical cultivation, mowing, hand removal, under-vine
cover management, spot treatment, delay, or a shielded application.** "Do not spray" is a legitimate
agronomic recommendation.

---

## 11. Insecticides — thresholds and phenology, not a calendar

Require: confirmed pest ID · life stage · scouting count or injury level · economic/management
threshold where one exists · trap catches and biofix · degree-day accumulation · block-edge vs
interior distribution · natural-enemy activity · previous treatments and **IRAC** groups · bloom and
bee activity · groundcover and neighboring-crop bloom · harvest date, PHI, REI · weather immediately
before and after · rainfastness and target feeding behavior.

- **Grape berry moth** — degree-day model (base 47.14 °F) from a wild-grape-bloom biofix, timings at
  810 / 1620 / 2430 DD, risk stratified by proximity to woods edge. Far better than "June 15."
- **Japanese beetle** — mature vines tolerate 15–20% defoliation before economic loss. Most JB
  sprays are anxiety management; young vines are the exception.
- **Spotted lanternfly** — a Pennsylvania problem: adult influx timing, contact materials, and a
  realistic tolerance threshold rather than eradication.
- **Potato leafhopper** — hits hybrids and young vines hard; mature vinifera shrugs it off.
- **Mealybug** — pheromone trap catches and crawler emergence; matters mostly as a leafroll vector.
- **SWD near harvest** — ties directly into sour rot (§7.6).

**Pollinator restrictions are a hard gate.** Blooming vines are not the only concern — flowering
weeds and cover crops in or adjacent to the treated area attract bees. Exact label language, state
pollinator plans, contracted hive locations, foraging activity, and time of application all matter.
**Mow flowering cover crops before insecticide applications**: grapes are wind-pollinated, the row
middles are not.

**Build a beneficial-insect penalty into scoring.** A treatment that controls the target but
disrupts predators and causes a later mite or secondary-pest problem must not score on immediate
efficacy alone.

---

## 12. Coverage is part of the dose

A material can be legally applied at the correct rate and still fail because it never reached the
target. Record: sprayer and nozzle configuration · nozzle flow by position · pressure at the
farthest nozzle · tractor speed · row spacing · **gallons per acre** · fan and air settings · canopy
height, width, density · target tissue (leaves, undersides, shoots, trunks, weeds, clusters) ·
every-row vs alternate-row · water-sensitive-card or dye results · missed rows, blocked nozzles,
leaks, interruptions.

Cornell recommends calibrating actual nozzle output and replacing tips more than 5% off.

Rules to encode:

- A contact fungicide protects only where it lands.
- Cluster-rot products need **fruit-zone** deposition; downy coverage must reach interior and lower
  leaf surfaces.
- Dense canopy growth can make a previously calibrated setup inadequate.
- **Water volume must scale with canopy** — roughly 20–30 gal/acre early, 50–100 at full canopy.
  Leaf Wall Area / Tree Row Volume should drive this automatically as the season progresses.
- Ground speed above ~3 mph badly degrades penetration in a dense canopy.
- More pressure is not better — it increases fine droplets and drift.
- **Driving faster to finish before the rain reduces deposition exactly when protection matters
  most.**
- *"The application was logged"* does not mean *"the target was adequately covered."* **Lower the
  protection-confidence score when no deposition check has been performed recently.**

Sprayer registry, calibration records, and machine-hours belong to **ROADMAP Phase 20**; this
program consumes them and must degrade gracefully while they are absent.

---

## 13. Application-window model (can we physically put this on well?)

Distinct from disease weather:

- **Wind 2–10 mph** is the window. Below ~2–3 mph, inversion risk; above ~10–12 mph with an airblast
  you are donating product to the neighbors.
- **Temperature inversions** — still, cool mornings and evenings with stable air; droplets hang and
  drift laterally. Visible smoke or dust hanging flat is the field indicator.
- **Delta T** (wet-bulb depression) — 2–8 ideal; above ~10, fine droplets evaporate before
  deposition. **Computable free from temperature and RH**, and a far better spray-quality signal
  than temperature alone. Cheapest high-value model in the program.
- **Humidity/evaporation** — very low RH with high heat evaporates droplets before they reach the
  inner canopy.
- **Rainfast window** — enough dry time before rain, from the hourly forecast, per the product's own
  requirement.

---

## 14. Resistance management

Reason over **modes of action, not brand names**: FRAC (fungicides), IRAC (insecticides/miticides),
WSSA/HRAC (herbicides); every active in a premix; target pathogen/pest; maximum consecutive uses;
maximum seasonal uses; regional resistance reports; whether a mixture partner independently controls
the target.

Implementation rules:

- **A premix counts against every resistance group it contains.**
- Two brands with the same group are **not** a rotation.
- Never assume a weak partner protects the high-risk active. For a resistance mixture to be
  meaningful, the partner must have a different mode of action and provide adequate control of the
  target on its own at the mixture rate.
- **Never use below-label rates as a resistance strategy.**
- Respect crop- and pathogen-specific FRAC guidance; **do not hard-code one universal number of
  consecutive applications.**
- Regional loss of sensitivity should change product scoring even when the product is still legally
  labeled. In the East: strobilurin (FRAC 11) resistance is widespread in powdery and downy
  populations; DMI sensitivity has shifted in black rot and powdery; boscalid resistance in botrytis
  is common. This is why the East still leans on mancozeb early and captan mid-season.
- **Mancozeb's 66-day PHI is a structural constraint on the whole program** — it forces the
  early-season mancozeb block and the mid-season transition.
- Always tank-mix a single-site material with a multi-site (mancozeb, captan, sulfur, copper) where
  labels permit.
- Track per-active and per-group **seasonal maximums as a running budget** and **refuse**
  recommendations that would exceed them.
- A suspected failure triggers **diagnosis** — identification, timing, coverage, weather, dose,
  resistance — not automatically a stronger repeat treatment.

**Licensing constraint (binding):** no FRAC/HRAC/IRAC compilation is parsed or redistributed. Codes
are derived from Tier-1 extension sources already in the corpus, each row cited.

---

## 15. Weather-data confidence is its own score

Never treat a reading as ground truth. Track: station location and distance from each block ·
elevation difference · rain shadow and topographic position · last maintenance/calibration · missing
observations · stuck leaf-wetness sensors · implausible humidity/temperature values · clogged rain
gauges · station rainfall vs manual vineyard gauges · forecast-source disagreement · radar-estimated
vs observed rainfall.

NEWA itself notes station owners are responsible for instrument accuracy and that erroneous or
missing data occurs.

Required display shape:

> Disease risk: **high** · Weather-data confidence: **medium** — nearest station 4 miles away and
> 350 ft lower; no functioning leaf-wetness sensor available.

⚠️ **Grid-estimated leaf wetness is blind to canopy architecture** *(council S6)*. Wetness inside a
leaf-pulled VSP canopy dries hours faster than in an unmanaged sprawl, and no grid product knows
which one it is looking at. Two consequences: **canopy-management state is a required modifier** on
the estimator (S4 collects it, S1 consumes it), and the grower gets a **"calibrate wetness"
override** so someone standing in a dry vineyard can correct the estimate and reset the clocks. The
override is itself an observation, recorded with attribution.

**Leaf wetness will be estimated, not measured** (S1, CART: RH + dew-point depression + wind).
Literature puts a naive RH ≥ 90% threshold at roughly 40% more error than CART. We have **no ground
truth without an on-site sensor** — so the estimator's confidence bands and its refusal threshold
are fixed in S0, before any pathogen model consumes LWD, and the honesty output is designed around
that fact rather than pretending to a validation we cannot run.

**On-site sensor ingestion is the highest-value "later"** — a grower's own station (rainfall,
temperature, RH, leaf wetness) becomes Tier 0 and per-tenant ground truth to validate every grid
against. S1 designs the seam.

---

## 16. The winery crossover — the actual differentiator

Spray decisions have downstream fermentation consequences, and nobody connects the two systems
because nobody owns both halves of the data model.

- **Elemental sulfur residue → H₂S and reduction in the wine.** Common practice is to stop sulfur
  roughly 30 days pre-harvest, more conservatively for reds and anything going to extended lees
  aging. **This is tighter than the label PHI — it is a wine-quality rule, not a legal one**, and
  must be presented as advisory winery protocol with a tenant-configurable threshold.
- **Copper residue** binds volatile thiols and can strip varietal aroma in Sauvignon Blanc-style
  whites.
- Several fungicide classes at high residue load can cause **sluggish or stuck fermentations** and
  inhibit malolactic bacteria.
- Oil residues near harvest deserve the same consideration.

**Concretely (S8):** at harvest, roll each block's spray history into a **lot-level residue risk
flag** that follows the fruit into the cellar. *"Lot 24-CH-03: sulfur applied 22 days pre-harvest —
flag for reduction risk; consider nutrient addition and aeration protocol."* No vintrace or InnoVint
module does this, and it exists only because vineyard and cellar share one data model.

---

## 17. Data model (target shape)

### 17.1 Product master (tenant-global reference; versioned by EPA reg number + label date)

Trade name and formulation · active ingredients and percentages · state registrations · crop, pest,
site · bearing/nonbearing restrictions · label rates and concentration limits · minimum and maximum
intervals · maximum applications and seasonal AI limits · **PHI, REI** · PPE, WPS · **FRAC / IRAC /
WSSA groups** and `siteType` · rainfast/absorption period · temperature, frost, stress, wet-foliage
restrictions · bloom, fruit-present, growth-stage restrictions · pollinator, drift, runoff, buffer,
endangered-species requirements · tank-mix partners, prohibited mixtures, mixing order, adjuvants ·
oil/sulfur/copper/captan separations · **label file, source, hash, effective date, review date.**

> Reality check: rates, PHI, and REI are **not freely machine-readable** (see the data-sources
> design). S2 ships registration + resistance; label-value extraction is a documented later phase.

### 17.2 Block profile

Cultivar and rootstock · vine age and bearing status · organic/conventional certification · disease
susceptibility · **sulfur and copper sensitivity** · cluster compactness · canopy vigor · row
orientation, slope, elevation, drainage · historical disease/insect/weed pressure · known inoculum
sources · **winery and buyer residue restrictions** · sensitive neighbors, water, habitat, and bee
locations.

### 17.3 The spray record — field inventory from the real template

Extracted from `docs/spray orders/Spray work order template.xlsx` (a real, good spray work order —
blank form, 41 rows × 8 cols, one sheet). Its shape is **one header + three line tables**, which is
the shape the record must take.

**Header (A1:H5)** — one pass:

| Template cell | Field | Owner |
|---|---|---|
| A1 | Vineyard name | S3a |
| A2 | Operator | S3a (+ **applicator license — template omits it**) |
| A3 | Application method | S3a (coverage input, §12) |
| A4 | Spray rig | Phase 20 (column stored by S3a) |
| A5 | Tractor | Phase 20 (column stored by S3a) |
| D1 / D2 | Start date / Finish date | S3a — **datetime, not date** |
| D3 | Tank (size) | S3a |
| F1 | **Spray vol/acre** | S3a (coverage input) |
| F2 | Gear setting | Phase 20 |
| F3 | **Ground speed** | S3a (coverage input — >3 mph degrades penetration) |

**Material lines (A7:H15, ~8 rows)** — `Materials · Active ingredient · REI · PHI · Quantity`.
S3a adds **EPA registration number** (the join key to §17.1) and a product-name snapshot.
**Note: the template already carries REI and PHI.**

**Mixing-order lines (A17:F24, ~7 rows)** — `Material to apply (mixing order) · Amount per tank`.
Not decoration: mixing order is a compatibility rule (§8.5), so S3a stores it and S7 validates it.

**Block lines (A26:H38, ~12 rows + a Totals row)** —
`Vineyard name · Blocks · acres · est. # of tanks · Start time · Stop time · Tanks used · Gal used`.
S3a owns blocks / acres / start / stop; Phase 20 owns tanks used / gal used (draw-down and cost).

**Fields the template lacks that the decision layer requires:** applicator license · **target
pest** · **wind speed, wind direction, and temperature as distinct columns** (council S5 — CA PUR
and drift-mitigation rules require speed *and direction* at time of application; a generic "weather"
blob does not satisfy them) · **`adjuvantClass` on each material line** (council C9 — captan plus an
organosilicone penetrant is a known injury combination that §8.5 warns about but the template
cannot see) · **whether the spray dried before rain** (§4.2) · every-row vs alternate-row · dilute
vs concentrate · **per-block computed rate/acre, tank-batch reference, and deposition evidence**
(council S4 — §5.3's confidence claims to fall when no deposition check exists, so something must
record one).

⚠️ **`driedBeforeRain` is DERIVED, never self-reported** *(council S3)*. Compute it from application
timestamps plus hourly precipitation; allow an attributed operator override. It materially changes
the residual estimate, and a value that load-bearing must not rest on a free-text truth source.

⚠️ **Every material line carries a facts-as-of snapshot** *(council C4)* — the resolved active
ingredients, resistance groups, PHI/REI, rainfast period, mobility class, and the facts revision +
as-of date used at entry time. The EPA registration number alone is not enough: reference data
refreshes monthly, and without a snapshot a past decision silently changes meaning. **Decisions
replay under facts-as-of-then**, with a visible flag where current facts differ. Same principle the
ledger already applies in `COST-3-immutable-cogs-snapshot`.

**Why header/line and not one row per block-spray.** ROADMAP Phase 20 requires "enter once,
attribute to each block"; the residual model (§5) requires per-block application facts; compliance
reporting keys off the pass. A single flat row breaks one of the three no matter which you pick.
**The block line is what the residual model reads.**

### 17.4 The spray program (plan) — and the invariant that keeps it safe

A season program states **intent**: target, intended product or FRAC group, a phenology anchor or
date window, and blocks. It is what lets the assistant say *"you planned mancozeb at 10″ shoots;
you're at 14″ and it hasn't gone on,"* and it is what makes plan-vs-actual drift visible.

> **A plan is intent, never evidence.** A planned application must never deplete a protection
> budget, satisfy a rotation requirement, start a PHI clock, or enter a compliance record. Only an
> actual application does any of those.

Enforce this as a **type-level separation, not a boolean on one table.** A flag will eventually be
read wrong by something in the residual or rotation engine, and that failure would be silent — a
grower would see protection they do not have. This is the same class of error as §3.1's
gap-is-not-a-clearance, and it gets the same treatment.

### 17.5 Live observations

Phenology and Brix · shoot-growth rate · scouting results and photographs · active lesions and
severity · insect traps and counts · weed species, size, distribution · vine and weed stress ·
weather observations and forecasts · **leaf wetness** · spray history · coverage audit · sensor
health.

---

## 18. Grower truisms worth encoding as heuristics

1. Prevention is more dependable than rescue. *The sprays you skip in May, you pay for in August.*
2. Rainfall alone does not define an infection — it needs susceptible tissue, viable inoculum,
   suitable temperature, and sufficient moisture or humidity.
3. **Powdery mildew is the dry-weather exception.** No rain ≠ no risk.
4. New growth consumes protection even when no rain falls.
5. Contact material protects only the surfaces it reaches.
6. "Systemic" does not mean every new leaf, cluster interior, or berry is protected. **Systemics move
   up and out, not down** — movement pattern matters.
7. Bloom and early fruit development are the least forgiving stages. *Manage the two weeks before
   bloom like the season depends on it, because it does.*
8. **Coverage over chemistry.** The best product applied badly is often worse than a good product
   applied thoroughly.
9. A spray that did not dry before rain is not fully effective.
10. Old residue is easier to compromise than fresh residue.
11. A clean scouting pass immediately after an infection period does not rule out latent disease.
12. Dense canopies simultaneously increase disease risk and decrease spray coverage. *You can't
    spray your way out of a bad canopy* — shoot thinning and fruit-zone leaf removal are fungicide
    applications with better economics.
13. Tight clusters and berry wounds change late-season rot risk dramatically.
14. Never put oil, sulfur, or copper on stressed vines without a product-specific check. *If the
    canopy won't dry before dark, don't spray copper or oil.*
15. Do not tank mix merely because both products are individually labeled on grapes.
16. **Rotate modes of action, not product logos.**
17. Scout after treatment — a recommendation is not complete until efficacy is evaluated.
18. **Manage by block or sub-block.** *Spray by block risk, not by calendar.*
19. Actual weather replaces forecast weather after the event. Recalculate.
20. A label's maximum interval is a legal boundary, not a promise of residual control.
21. Calendar insecticide applications are inferior to scouting, thresholds, and DD models.
22. Late-season vineyard decisions are winery decisions (§16).
23. *Protectant before the rain beats systemic after* — but keep a kickback material available for
    the sprays you miss.
24. *If you can only get one thing covered, cover the fruit zone.*
25. *Every 7-day interval in a wet year is a 10-day interval in a dry one* — and the model should
    say which one you're in.

---

## 19. Test and golden strategy

- **All math is pure and golden-tested**: LWD estimation, diurnal reconstruction, each infection
  index, residual decay, growth dilution, Delta T, rotation budgets, interlock resolution. No live
  providers in tests; committed fixture series only.
- **Every index has a degrade golden**: inputs missing → *unknown*, never *low*.
- **Every deterministic answer has a refusal golden**: unknown product → *cannot determine*, never
  *permitted*.
- **Copy tests** enforce "scout not diagnose" and the presence of a non-empty "what we don't know."
- **E2E `verify:*` scripts** per house pattern (`verify:weather` is the model), run on Demo Winery.
- **Assistant goldens + fleet cases** per the runbook §5.
- **Browser QA every phase** per [qa/QA-PROTOCOL.md](./qa/QA-PROTOCOL.md).

Counter-intuitive cases make the best fixtures. Carried from plan 086's live probing: Gavel 75DF and
Fusilade DX are both registered on wine grapes in CA despite widespread claims otherwise; Luna
Experience's Nassau/Suffolk restriction carries a FIFRA 24(c) SLN carve-out and is therefore not a
ban; `Switch` is 9/12; captan resolves `siteType: multi` regardless of which source supplied the
code.

---

## 20. Out of scope (deliberately)

- **Auto-approving or auto-scheduling any application.** Ever. There is no configuration that
  enables it.
- **Rate / PHI / REI extraction from label PDFs** — highest effort, highest liability; a documented
  later phase (plan 086 already deferred it, correctly). Note that **S2b curates the subset of these
  values the engines actually need** from free sources; what is deferred is bulk extraction at scale.
- **Export-market MRL checks** — *(council D1; Russell's decision 2026-07-26: **Later bucket,
  documented not built**.)* For a winery exporting to the EU, UK, Japan, or Canada, a blended wine
  breaching an import Maximum Residue Limit is plausibly a larger financial event than the §16
  wine-quality flags — and MRLs are often stricter than the US PHI that governed the application.
  We own the blend lineage that makes it computable, which is exactly why it is cheap to add later.
  It is out of v1 because neither current tenant exports to an MRL-divergent market and because MRL
  tables per market are a separate regulatory sourcing problem from US registration. **Revisit the
  moment a tenant exports.**
- **Being the label.** We cite and date; the current product label and supplemental labels govern.
- **Non-grape crops** — the pipeline generalizes later; the join filters to grape site codes.
- **Hardware or device control** — sprayer/rig control is never part of this program.
- **Personalized regulatory or legal advice.** We surface constraints and their sources.

## 21. Source posture

As of July 2026 Cornell paused production of the 2026 Crop and Pest Management Guidelines pending a
program redesign, with a relaunch planned for 2027. **Do not treat a hypothetical "2026 grape guide"
as the authoritative product table.** Use: the 2025 NY/PA grape guide as an agronomic base; current
2026 Cornell and Penn State grape pathology updates; NEWA models and local weather; live state
registration data; the exact current product and supplemental labels; and local extension and
regional resistance alerts. Cornell itself emphasizes its guide is not a substitute for labeling and
that registrations change after publication.

The safest architecture, restated as the program's spine:

```
current label + registration engine
  → block-specific biological risk engine
  → compatibility + resistance engine
  → application-window engine
  → human-confirmed recommendation + audit record
```
