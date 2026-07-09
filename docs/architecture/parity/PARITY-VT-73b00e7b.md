---
id: PARITY-VT-73b00e7b
group: vintrace-web
incumbent: vintrace
capability: Dynamic MSO2 (Molecular Sulphur Dioxide) calculation
overlap: vintrace-only
status: covered
ourApproach: molecularSO2 implements Margalit/Henderson-Hasselbalch (pKa 1.81) read-only within one AnalysisPanel; freeSO2ForMolecularTarget inverts it for target dosing.
aiNativeEdge: calc_so2 exposes the derivation; a parity-win over InnoVint (no MSO2).
evidence: src/lib/chemistry/so2.ts
counterpart: ""
tags:
  - parity
---

# PARITY-VT-73b00e7b — Dynamic MSO2 (Molecular Sulphur Dioxide) calculation

> [!info] Parity (vintrace) — we cover this.

- **Incumbent:** vintrace
- **Cross-incumbent overlap:** Vintrace only
- **Our approach:** molecularSO2 implements Margalit/Henderson-Hasselbalch (pKa 1.81) read-only within one AnalysisPanel; freeSO2ForMolecularTarget inverts it for target dosing.
- **AI-native edge:** calc_so2 exposes the derivation; a parity-win over InnoVint (no MSO2).
- **Evidence:** `src/lib/chemistry/so2.ts`
- **Source:** `vintrace-docs/vintrace-web/lab-work/dynamic-mso2-molecular-sulphur-dioxide-calculation.md` — see [[assistant-coverage]] / [[system-map]]
