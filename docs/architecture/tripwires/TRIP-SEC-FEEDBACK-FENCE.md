---
id: TRIP-SEC-FEEDBACK-FENCE
group: security
severity: high
enforce: guard
verify: "npm run verify:feedback-domain"
decision: "plan 052 — widen feedback auto-fix fence to cellar-floor domains + domain-verify backstop"
status: guarded
appliesTo:
  - scripts/feedback-fence-rules.ts
  - src/lib/
tags:
  - tripwire
---

# TRIP-SEC-FEEDBACK-FENCE — an LLM auto-merge into governed code without a domain proof

> [!warning] Tripwire — revisit when this fires
> The feedback auto-fix loop lands a change into a widened server domain (`src/lib/work-orders`, etc.)
> that was NOT proven by that domain's runtime `verify:*`, or the allowlist grows to include a
> money/tenancy/ledger/compliance/moat domain that must stay human-only.

- **Choice / what breaks:** plan 052 lets an autonomous LLM write + auto-merge into cellar-floor
  domains so real winemaking-ops bugs get fixed, not just UI. The hazard is a fix into code that
  writes `LotOperation`s to the append-only ledger going in unproven — the required `check` job runs
  lint/tsc/vitest + the deterministic brain gates but NO DB domain proof. The safety line: the
  allowlist EXCLUDES `ledger/cost/money/accounting/commerce/compliance/transform` (by omission) and
  hard-denies `auth/dal/tenant/prisma` + `.env`/workflows/migrations; `audit.ts` stays unwritable.
- **Enforced by:** `npm run verify:feedback-domain` (the `feedback-domain-verify` CI job, label-gated
  on `feedback-bug` PRs) resolves each touched domain via `resolveDomainVerifies`
  (`scripts/feedback-fence-rules.ts`) and runs its `verify:*` against a throwaway Postgres; a MAPPED
  domain whose proof fails goes red and blocks the merge. An UNMAPPED widened domain has no proof, so
  it warns and the auto-merge gate (`bug-triage`) must route it to a human. The write fence itself is
  re-checked by `npm run verify:feedback-fence`. If the excluded set ever appears in `allowedPrefixes`,
  this tripwire has fired — revert it.
- **Decision / source:** [[security-register]] (feedback auto-fix fence), plan 052, [[system-map]].
