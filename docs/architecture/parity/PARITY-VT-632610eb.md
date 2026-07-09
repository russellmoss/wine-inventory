---
id: PARITY-VT-632610eb
group: harvest-vintage
incumbent: vintrace
capability: Managing Fruit Intakes and  Fruit Intake Bookings
overlap: both
status: covered
ourApproach: writeHarvestPickTx records the weigh-in (weightKg + brix/pH/TA at pick) as a first-class HarvestPick anchoring later crush consumption.
aiNativeEdge: Same tx backs the action, the log_harvest_pick tool, and HARVEST_WEIGH_IN WO completion — hands-free crush-pad weigh-in.
evidence: src/lib/harvest/pick-core.ts
counterpart: innovint-docs/harvest/harvest-workflow-fermentation-tracking/how-to-receive-fruit.md
tags:
  - parity
---

# PARITY-VT-632610eb — Managing Fruit Intakes and  Fruit Intake Bookings

> [!info] Parity (vintrace) — we cover this.

- **Incumbent:** vintrace
- **Cross-incumbent overlap:** both incumbents — TABLE STAKES
- **Our approach:** writeHarvestPickTx records the weigh-in (weightKg + brix/pH/TA at pick) as a first-class HarvestPick anchoring later crush consumption.
- **AI-native edge:** Same tx backs the action, the log_harvest_pick tool, and HARVEST_WEIGH_IN WO completion — hands-free crush-pad weigh-in.
- **Evidence:** `src/lib/harvest/pick-core.ts`
- **Counterpart article:** `innovint-docs/harvest/harvest-workflow-fermentation-tracking/how-to-receive-fruit.md`
- **Source:** `vintrace-docs/harvest-vintage/fruit-bookings/managing-fruit-intakes-and-fruit-intake-bookings.md` — see [[assistant-coverage]] / [[system-map]]
