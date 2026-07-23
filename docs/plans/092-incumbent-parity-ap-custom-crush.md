# Incumbent parity — AP / custom-crush ownership (plan 092)
**Date**: 2026-07-23
**Sources**: `innovint-docs/`, `vintrace-docs/` (incl. API specs), `analysis/incumbent-teardown/*.md`
**Why**: Vintrace and InnoVint have run real custom-crush / alternating-proprietorship (AP)
facilities for years. Before building Phase 23's ownership model, we checked ours against theirs
so we ship parity, not a re-derived guess.

## The headline: the core architecture is confirmed

**Both incumbents owner-scope WITHIN one tenant. Neither uses a separate database per client.**
This was the biggest architectural fork and both land where plan 092 does.

- **InnoVint**: one winery account; an "Owner" tag on lots, vessels, vineyards, additives, work
  orders; clients are owner-scoped members. *"InnoVint's term for each of your clients is an
  'Owner'."* (`setting-up-your-custom-crush-permissions.md:30`)
- **Vintrace**: multi-winery within one org (`{db}` in the API URL = the org, not the client);
  AP proprietors are Address-Book "Owner" parties flagged "AP Owner" with their own bond;
  owner-scoped read-only logins. No per-client database anywhere in the docs.

So the denormalized `ownerId`-within-one-tenant spine (eng review) matches two battle-tested systems.
Big de-risk.

## Where 092 diverged from BOTH incumbents, and the fix

### 1. Cross-owner blends — RESOLVED: add a CHANGE_OWNERSHIP event (2026-07-23)

Plan 092 originally REFUSED cross-owner blends outright (Unit 6b). **Neither incumbent refuses.**

- **Vintrace**: a first-class **`CHANGE_OWNER` / "Change Ownership"** operation
  (`operation-api-v7.yaml:3760`), modeled as a bond change paired with a mandatory zero-volume
  measurement to lock the bond change as of the date/time (`compliance.md:60-62`). Co-mingled wine
  is represented as fractional `ownership[] = {owner, percentage}` (`operation-api-v7.yaml:2968,3013`).
- **InnoVint**: cross-owner operations are **allowed with a soft warning** the user can accept or
  cancel (`11-12-21-release-notes...:36`), because a cross-owner combine is a real cross-**bond**
  transfer that posts symmetric Received/Removed-in-Bond lines on both bonds' TTB
  (`compliance.md:130-131,305-307`). A hard refusal would prevent *recording a legal operation*.

**Decision:** keep scalar `ownerId` (RLS stays a sargable column compare), but add a first-class
**`CHANGE_OWNERSHIP`** operation, a real TTB-reportable transfer-in-bond. A cross-owner blend is
refused UNTIL the wine is brought under one owner via Change Ownership, then blends normally. This
matches both incumbents' legal reality, keeps the enforcement model intact, and fills a gap the
teardown explicitly flags as absent in Cellarhand (`operations-workflow.md:284`,
`domain-model.md:179`). It is the correction-as-event philosophy the app already lives by.

**Why not full fractional ownership (Vintrace's model)?** It breaks the denormalized scalar
`ownerId` the RLS enforcement rests on (the predicate becomes a join, undoing the eng/council
decision), and InnoVint doesn't do fractional either (it uses a tag-set, not percentages). Vintrace
itself pairs fractional ownership with the same `CHANGE_OWNER` op, so the event is the load-bearing
primitive, not the fraction. Scalar + event is the honest parity.

### 2. Compliance keys off BOND, not ownerId — RESOLVED: first-class Bond entity (2026-07-23)

Plan 092 originally put `ownerId` on the compliance chain (Unit 3c). **Both incumbents file
per-BOND, with bond as a first-class entity and owner upstream of it.**

- **Vintrace**: *"every wine sits under a bond derived from its location; AP bonds are derived from
  the OWNER of the batch and take precedence over the winery/location bond"* (`compliance.md:53-54`).
  The 5120.17 has a Bond selector; you file per bond.
- **InnoVint**: each Owner is created *with a corresponding bond, including AP bonds*
  (`setting-up-your-custom-crush-permissions.md:32-34`); the 5120.17 generator requires a bond
  (`generate-and-download-the-ttb-report.md:27`). *"A custom-crush facility with N AP02 clients
  files N+1 reports"* (`compliance.md:322-324`).

**Decision:** model a first-class **Bond** entity; a wine's bond derives from its location unless an
AP owner-bond attaches and takes precedence (both incumbents' exact rule). File per-bond. The
teardown names this exact gap: Cellarhand today *"lacks a first-class bond entity… no per-owner
5120.17"* (`compliance.md:276`). `ownerId` stays on the wine for RLS scope; **bond** is the
compliance key, derived from owner (AP) or location.

## Where 092 EXCEEDS the incumbents (keep — these are the moat)

- **CostLine `visibility` split (client-billable vs facility overhead).** Neither incumbent hides
  facility margin from a client. Vintrace's cost schema has `overhead`/`operation` buckets but **no
  `margin`/`markup`/`billableRate` field** and no per-owner cost filter (`costs.md`, `common-schemas.yaml:99-135`).
  InnoVint owner-scopes cost visibility and relies on a client-recorded "Custom Crush" fee category,
  with **no hidden-facility-cost layer**. Council C2's `visibility` enum is genuinely ahead.
- **Purpose-built client "Your wine" home.** Neither has a branded portal — both are owner-scoped
  read-only logins in the same app (Vintrace's "pourtal" is a *support* site, not a data view;
  `accessing-the-vintrace-pourtal.md:74`). The design-review choice exceeds them; the teardown lists
  a custom-crush portal as a planned Cellarhand differentiator.
- **DB-enforced RLS.** Both incumbents owner-scope in the app layer; nothing in the docs claims
  DB-level enforcement. Plan 092's RESTRICTIVE RLS is a stronger fence.

## One divergence we accept deliberately

- **Fractional ownership.** Vintrace supports it (`ownership[].percentage`); InnoVint does not
  (tag-set, no percentages); plan 092 does not (scalar). We match InnoVint and Vintrace's
  `batchOwner`, and handle co-mingling via the CHANGE_OWNERSHIP event rather than fractions. If a
  real AP partner needs true fractional co-ownership, revisit — but it breaks the RLS model and
  neither the simpler incumbent nor the event-based path requires it.
