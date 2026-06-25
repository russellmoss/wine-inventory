# TODOS

Deferred work captured during planning/review. Each item has enough context to pick up cold.

## Introduce a server-action / DB integration test harness

**What:** Stand up a Vitest integration setup (test database + helpers) so server
actions and Prisma-backed flows can be tested automatically, not just manually.

**Why:** As of the Vineyard Details work (plan
`docs/plans/2026-06-24-005-feat-vineyard-details-blocks-plan.md`), the riskiest paths
(server actions, audit writes, map polygon persistence) have only manual QA. The project
currently has zero action/DB/component tests — `vitest.config.ts` runs in the `node`
environment and existing tests in `test/**/*.test.ts` cover only pure functions
(`audit.test.ts`, `inventory-csv.test.ts`, etc.). Pure logic for the vineyard feature
(units, colors, serializer) IS unit-tested, but the IO layer is not.

**Pros:** Automated coverage of the highest-blast-radius code; catches audit/serialization
regressions; lets future features ship with confidence instead of manual click-throughs.

**Cons:** Non-trivial setup — needs a disposable Postgres (e.g. a Neon branch or local
container), migration application in CI, transaction rollback/cleanup between tests, and a
jsdom env if component tests are added. It's its own mini-project, not a quick add.

**Context:** Decision made during `/plan-eng-review` of the vineyard plan (2026-06-24):
ship pure-logic tests + manual QA now, defer the harness. Start by deciding the test-DB
strategy (Neon branch per CI run vs local docker Postgres), then add a `vitest` project
config for integration tests separate from the existing pure-unit tests.

**Depends on / blocked by:** None. Best tackled before the next DB-heavy feature, or
alongside PR3 (interactive drawing) of the vineyard plan if action confidence is wanted.

## Accessible (keyboard) alternative for polygon drawing

**What:** Provide a non-pointer way to define a block polygon, e.g. manual lat/lng
vertex entry or import, since Leaflet-Geoman drawing is mouse/touch only.

**Why:** Surfaced in `/plan-design-review` of the vineyard plan (2026-06-24). The map
drawing flow (PR3) is pointer-driven; a keyboard-only or screen-reader user cannot draw
a block boundary. The rest of the feature (blocks, acreage, metadata, summary) is fully
accessible — only the drawing is not.

**Pros:** Closes the one real a11y gap in the feature; also useful for users who have
survey coordinates and want exact boundaries.

**Cons:** A coordinate-entry UI is fiddly; most users will prefer drawing. Lower priority
than shipping the core feature.

**Context:** Drawing is inherently visual; the accessible fallback is to type/paste vertex
coordinates that render as a polygon (reusing the same `saveBlockPolygon` validation).
Decision at design review: accept the limitation for now, capture here.

**Depends on / blocked by:** PR3 (interactive drawing) of the vineyard plan.
