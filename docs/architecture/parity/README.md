# Capability-Parity Register

The **living** version of `analysis/incumbent-teardown/`. One typed note per incumbent
(Vintrace / InnoVint) capability, answering the question that keeps us on-thesis:

> What do the incumbents do, do we cover it, and is our AI-native version better?

The teardown (`SYNTHESIS.md`, `FIX_RUNBOOK.md`) was a one-shot snapshot that drifts the moment
the next phase ships. This register is queryable at every `/plan` and `/ship` and self-defends via
`npm run verify:parity`.

## Fields (see `docs/_templates/parity.md`)

| Field | Meaning |
|-------|---------|
| `id` | `PARITY-<n>`, or `PARITY-VT-<slug>` / `PARITY-IV-<slug>` for corpus-generated stubs |
| `group` | domain bucket (cellar-ops, bottling, compliance, cost, grow, …) — drives the dashboard grouping |
| `incumbent` | `vintrace` \| `innovint` \| `both` |
| `capability` | short human label (usually the incumbent article title) |
| `status` | `covered` \| `partial` \| `gap` \| `deliberately-omitted` |
| `ourApproach` | how we do it (op + core), or empty for a gap |
| `aiNativeEdge` | the assistant utterance that does it, or `parity only` |
| `evidence` | **required to resolve when `covered`**: a repo-relative file path or `path:line` inside the repo. For other statuses, may be a corpus link (dead link = warning, not failure) |

## What the guard enforces (`npm run verify:parity`)

- A note with `status: covered` MUST have `evidence` that is a concrete repo-relative path (or
  `path:line`) resolving to a real **file inside the repo** — no `../` escapes, no wikilinks.
- Unknown `status` values / malformed frontmatter are violations (not silent skips).
- A dead corpus link on a `gap`/`partial`/`deliberately-omitted` note is a **warning**, so a refactor
  or hotfix is never blocked by a non-covered link.

## Scope + honesty

This register is **corpus-complete**: `scripts/ingest-parity-corpus.mjs` generates a `status: gap`
stub for every article in `vintrace-docs/INDEX.md` + `innovint-docs/INDEX.md` (~1000), so the dashboard
shows an honest coverage ratio (a real, small numerator against the full competitor universe) rather
than a hand-picked subset that looks complete. Coverage is enriched incrementally: as a capability
ships, its note flips to `covered` with real `ourApproach` / `aiNativeEdge` / `evidence`.

Do NOT hand-edit the generated stubs' `id`/`capability`/`incumbent`/corpus `evidence` — re-running the
ingest script regenerates those. DO hand-enrich `status` / `ourApproach` / `aiNativeEdge` as we ship
(the script preserves enriched fields).

## Related

- `docs/architecture/assistant-coverage.md` — the core→tool coverage matrix (AI-native side of the moat)
- `docs/architecture/invariants/` + `tripwires/` — the sibling self-enforcing registers
- `analysis/incumbent-teardown/` — the original one-shot teardown this register makes living
