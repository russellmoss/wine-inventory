# Strategy — Wedge, Segment & Raise
_Generated from an /office-hours session, 2026-07-01. Working strategy doc, not a pitch deck (yet)._

## One-line thesis
The AI-native production ERP for small/medium wineries. We get a winery **off Vintrace and
live in days instead of months**, their **TTB compliance files itself**, and they run the
cellar by **talking to it** — on an event-sourced core that makes cost and compliance
provably correct in a way 15-year-old incumbents structurally can't retrofit.

## Founder-market fit (the "why me")
- Former **winery manager** (lived the cellar + operations).
- Former **Cornell viticulture professor** (the East Coast winemaking feeder network).
- **Board member, Bhutan Wine Company** (an operating winery = private R&D + dogfood lab).
- Now RevOps at a fintech (Savvy Wealth) — the tech/GTM chops to build and sell it.
This is a rare "who else could do this" answer. Lead the raise with it.

## Demand reality (honest state)
- Strong conviction + insider knowledge that Vintrace is **hard to learn and set up** and
  wineries aren't happy — but that's the thesis every challenger cites.
- **Gap to close:** turn "I know the pain" into *evidence* — design-partner wineries live
  on the product, not just Bhutan.

## Status quo (the real competitor)
Wineries live on **Vintrace / InnoVint for production**, stitched to **Commerce7/WineDirect
(DTC)**, **QuickBooks (accounting)**, **ShipCompliant (shipping compliance)**, and
spreadsheets in the gaps. They stay not out of love but out of **switching fear**: years of
production data, compliance continuity, crew retraining.

## Segment / beachhead
- **Beachhead: Northeast US SMB wineries (Finger Lakes + East Coast) via the Cornell
  network.** Warm, credible, referral-driven access in a trust-driven industry; a region
  where Vintrace/InnoVint are less entrenched than the West Coast; US-TTB pain is universal.
- **Bhutan Wine Company = private dogfooding sandbox**, not the market (tiny, non-US, no
  TTB, ~zero VC TAM). Iterate there with full control; sell into the Cornell network.
- **West Coast (CA/OR/WA) = expansion**, not beachhead (biggest market, but where the
  incumbents are strongest and native network is thinner).

## The wedge (spearhead)
**Painless AI migration + onboarding.** Import their Vintrace data, AI configures the
winery, live in days not months, natural-language instead of crew retraining. It attacks
BOTH the incumbent's self-evident weakness (setup/learning curve) AND the switching-cost
moat that keeps wineries stuck. It's the best demo and the lowest-friction path to a first
design partner. Land here, then expand.

**Pricing stance (deliberate):** do **NOT** lead on "cheaper than Vintrace." Price-as-wedge
selects for churny, price-sensitive customers, signals "lesser" in a premium industry,
doesn't touch the real (switching-cost) barrier, and caps ACV/NRR — which wrecks the raise.
Price transparently and competitively; win on ease + compliance + AI, not on being cheap.

## Moat / defensibility (put in the deck)
1. **Event-sourced, append-only ledger** → provably correct cost roll-up + auditable
   compliance + an AI-queryable operation. Legacy mutable-row systems can't retrofit this.
2. **AI-native throughout** — migration/onboarding, auto-TTB reporting, voice cellar
   logging, natural-language querying of the whole operation.
3. **Cross-winery benchmark data** nobody else can assemble (yields, costs, timing).
4. **Founder-market fit + Cornell network** as unfair go-to-market.

## Expansion path (land → expand, ACV grows as modules switch on)
Migration + production (land) → **TTB/state compliance** (stickiness) → **COGS + QuickBooks/
Xero** → **DTC/club integration (Commerce7/WineDirect)** → **purchasing/AP** → **labor/
timeclock/payroll** (ROADMAP Phase 11). Own production + compliance + cost + AI; **integrate**
DTC, accounting, and shipping-compliance rather than build them.

## Premises (agreed this session)
1. Founder-market fit is real and rare — lead with it. ✅
2. Beachhead is the Northeast/Cornell network; Bhutan is the sandbox. ✅
3. The wedge is AI migration + onboarding, not price. ✅
4. Commitment path: build to design-partner traction, then quit + raise. ✅

## Raise-path alternatives considered
- **A) Traction-then-raise (CHOSEN):** nights/weekends + Claude Code → 3-5 Cornell-network
  wineries live on the migration wedge → raise pre-seed → go full-time. De-risks the leap;
  strongest evidence-backed raise.
- **B) All-in now on founder-market fit:** quit + raise on the story + prototype. Faster,
  higher personal risk, raising on narrative over evidence.
- **C) All-in co-founder carries it:** solves bandwidth, costs dilution, requires finding
  someone as committed as the idea deserves.

## What to prove BEFORE the raise (milestones)
- [ ] A **working migration**: import a real Vintrace export, a winery live in days. This
      is the demo.
- [ ] **3–5 design-partner wineries** from the Cornell network actually using it (not just
      Bhutan).
- [ ] **One winery's TTB report** generated from the system.
- [ ] **Before/after on setup time** (Vintrace onboarding weeks/months vs. yours in days).
- [ ] Ideally 1–2 **paying** or signed **LOIs**.

## The Assignment (do this next, in the real world)
Call **three wineries in your Cornell network this month** and ask one question: *"Walk me
through what it took to get set up on Vintrace, and what you'd pay to never do that again."*
Don't pitch. Watch them describe the pain in their own words. That transcript is worth more
than another feature. It tells you if the migration wedge is as sharp as you think, and it's
the start of your design-partner list.

## Open questions / risks
- **Compliance depth is the hard, unglamorous moat** — TTB rules are fiddly and per-state.
  Scope v1 to your beachhead states (NY + Northeast) first.
- **Migration is a promise you must keep** — a bad Vintrace import kills trust fast; the
  demo has to actually work on real exports.
- **Bandwidth** — traction-then-raise only works if the nights/weekends actually produce
  live wineries; set a date to reassess (e.g., "if 3 wineries aren't live in N months,
  change the plan").

---

## Competitive Wedge (Vintrace & InnoVint)
_From a 2026-07 review/forum/pricing/API research pass (Capterra, Software Advice, GetApp,
SourceForge, vendor docs, WineMakingTalk). Quotes are real user reviews. Cepaos comparison
claims are competitor marketing and are excluded/flagged. Neither vendor publishes pricing._

### The landscape in one paragraph
**Vintrace** (owned by Encompass since 2022) is the powerful-but-heavy incumbent: deep, but a
steep learning curve, opaque quote-only pricing + implementation fees, weak reporting/accounting,
and — newest signal — **declining support** (2024–2026 reviews: *"more AI than people," "less
likely to fix bugs"*). **InnoVint** is the beloved modern alternative (4.6/5, **zero 1–2★
reviews**, "white-glove" support, strong TTB): it's already **catching Vintrace defectors**, so
it — not Vintrace — is the real competitor for the "modern winery software" slot. **Both**
under-serve **sub-5,000-case producers** (*"software is either built for 50,000-case operations
or people using Excel and paper"* — WineMakingTalk), which is our beachhead gap.

### Top solvable complaints → our answer (evidence strength)
| # | Complaint (both/which) | Evidence | Our structural answer |
|---|------------------------|----------|-----------------------|
| 1 | **Painful, months-long onboarding + opaque pricing/implementation fees** (Vintrace) | strong | **AI migration + onboarding wedge** — off Vintrace, live in days. Attacks the exact pain + the switching-cost moat. |
| 2 | **Can't cleanly fix a mistake / correction is painful** (BOTH) | strong — *"no way to edit an action already input"* (InnoVint); *"if a mistake is made, difficult to amend," "correcting a dispatch reverts volumes to zero"* (Vintrace) | **Append-only ledger + compensating corrections (D6/D15) + full lineage.** Our most broadly-validated "why we're architecturally better." |
| 3 | **Sparkling / méthode traditionnelle traceability is bad** (Vintrace) | medium (1 detailed SourceForge 2★ + 1 corroboration) — *"can't partial-disgorge without splitting the tirage lot… introducing falsities into the traceability… treats wine on lees like cardboard boxes"* | **Phase 7**: partial disgorgement is a clean SPLIT with per-tranche lineage/specs. We independently built the fix to Vintrace's worst-reviewed module. **Feature this in the demo** for sparkling houses. |
| 4 | **Accounting/COGS weak** (BOTH, differently) | strong — Vintrace: one-way Xero, *"costing reports incorrectly,"* Cost-Tracking **1.0/5**, Billing **2.0/5**. InnoVint: **no QuickBooks API at all** (manual reconcile), COGS is a paid add-on | **Two-way QuickBooks/Xero + Phase 8 cost roll-up over the ledger DAG.** One has none, the other's is clunky/one-way → beat both. Strongest proof of the ERP-consolidation thesis. |
| 5 | **Rigid reporting / customization** (BOTH) | medium — *"reporting is terrible… requires excel manipulation," "can't customize an invoice"* (Vintrace) | **Natural-language query over the structured ledger** ("what's my COGS on the 2024 Riesling") vs a fixed report builder. AI-native leverage. |
| 6 | **Fragmentation** — production ≠ DTC ≠ accounting ≠ compliance | strong (structural) | **Consolidation**: own production+compliance+cost, integrate DTC/accounting. Expansion story. |
| 7 | **Mobile gaps** | medium — InnoVint **iOS-only, no Android**; Vintrace mobile "limited," can't change locations in-app | Modern, mobile-first, offline-capable (vessel-first capture). Lead against InnoVint on **Android**. |
| 8 | **Custom-crush client visibility** (Vintrace) | medium — *"clients don't have the level of visibility"*; InnoVint's Commerce7 link **can't connect multiple wineries to one account** | **Multi-tenancy (just built)** → scoped client read-access; native multi-winery. A real edge for custom-crush facilities + multi-brand groups. |

### Do NOT attack (their moats)
- InnoVint: **support** (4.8, "white-glove") and **TTB compliance** (5120.17 + audit report). Match, don't attack.
- Vintrace: traceability/audit breadth, configurability across sizes, bulk vintage-rollover import/export, barrel-scanner hardware.
- **Compliance correction (honest):** basic **federal TTB 5120.17 is table stakes — BOTH generate it.** The "excise lives in spreadsheets" line is competitor marketing and is false. Our compliance edge is narrower: **AI/anomaly detection + multi-state DTC/excise + it being part of the unified system**, not "we generate the 5120.17."

### Lead-with, per competitor (don't spray all eight)
- **vs Vintrace:** (1) painless AI migration, (3) sparkling traceability, (4) accounting/COGS, (2) correctable/auditable data, + the live opening of **declining support**.
- **vs InnoVint:** (2) correction rigidity, (7) Android/mobile depth, (4) COGS hand-off (paid add-on / no QBO API), pricing transparency. **Not** compliance or support.

### Pricing posture (reaffirmed)
Both are ~$149–159/mo entry, quote-only, opaque, + implementation fees. The pain is **opacity +
implementation cost**, which the onboarding wedge attacks — **not** the monthly sticker. Be
**transparent** and value-priced; don't lead on "cheaper." One design cue from a Vintrace gripe:
**gate pricing by volume/usage (ferments, cases), not by withholding core features** like bottling.

### Churn signal (validates the wedge)
Real switching stories: multiple wineries left **Vintrace → InnoVint** (2023–24), repeatedly
citing that **Vintrace obstructed the exit** (*"created switching obstacles… threw up hurdles"*).
Demand to leave exists; the incumbent makes leaving painful. That is precisely the seam a
**painless, customer-authorized migration** cuts through — and it's why migration is the wedge.
