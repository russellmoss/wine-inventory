-- Spray Intelligence S5a — the latent-infection ledger, enums isolated first (the Windows enum
-- rule, AGENTS.md:80-83). Brand-new CREATE TYPE only; no ALTER TYPE, no data mutation. Kept in its
-- own migration so the types are committed + deployed before the schema migration that references
-- them. Precedent: 20260727100000_phenology_block_enums -> 20260727100100_block_canopy_profile.
--
-- SHIP ONLY WHAT S5a WRITES (plan D-1, both council reviewers independently). Pre-declaring enum
-- arms to dodge a later migration trades a hypothetical cost for a permanently under-constrained
-- schema, and an isolated enum migration is already a solved pattern in this repo. The pathogens,
-- resolution shapes and evidence sources S5b will need are recorded as design rationale in
-- docs/spray_assistant/phases/S5a-powdery-index-latent-ledger-plan.md KD-3 — the RESEARCH is the
-- durable artifact, not the enum value.

-- S5a implements powdery mildew and nothing else. Downy, black rot, phomopsis and botrytis arrive
-- with S5b, each as a one-line ALTER TYPE in its own migration.
CREATE TYPE "InfectionPathogen" AS ENUM ('POWDERY_MILDEW');

-- Host organ is a FIRST-CLASS discriminator, not a detail (plan KD-3a). Black rot on the same vine
-- in the same infection event has a leaf incubation of 10-12 days and a FRUIT incubation of 3 weeks
-- to symptom and 4-5 weeks to rot; susceptibility windows differ by organ too. A single 14- or
-- 21-day close-out silently drops real late-window berry infections — which is precisely the
-- failure this ledger exists to prevent. Powdery infects all three of these.
CREATE TYPE "InfectionHostOrgan" AS ENUM ('LEAF', 'SHOOT', 'FRUIT');

-- How an open event is allowed to end.
--   FIXED_WINDOW — a day-count window from the infection date (powdery, S5a).
--   UNKNOWN      — we cannot project a resolution; a first-class arm, never a default (rule 3.3).
--   ERADICATED   — killed in planta by a kickback/eradicant spray before it ever became infectious
--                  (council C9). Without this state the ledger projects a DEAD pathogen to become
--                  infectious and prompts another application, driving exactly the resistance
--                  pressure S7a exists to manage. In S5a this arm is reachable only by an
--                  attributed human override; the FRAC-group kickback lookup belongs with S2's
--                  resistance data and S7a, and is deliberately NOT faked here.
CREATE TYPE "InfectionResolutionKind" AS ENUM ('FIXED_WINDOW', 'UNKNOWN', 'ERADICATED');

-- The state THIS append asserts. There is no SUPERSEDED value on purpose: marking an older row
-- superseded would require UPDATEing it, and this table takes no updates at all. "Superseded" is
-- derived from the existence of a later row in the same logical stream.
CREATE TYPE "InfectionEventStatus" AS ENUM ('OPEN', 'CLOSED', 'VOID');

-- What established the event. S5a can only write what a human supplied — there is no model: the
-- Unit 0 gate ruled the powdery index out on reconstructed hourly data
-- (docs/spray_assistant/phases/S5a-diurnal-fidelity-probe.md), so a MODEL source has no writer yet
-- and is not pre-declared.
CREATE TYPE "InfectionEvidenceSource" AS ENUM ('SCOUTING_OBSERVATION', 'GROWER_REPORT');

-- NEVER encode epistemic state in a NULL (council C7). A bare NULL projected-timestamp would
-- conflate *unknown*, *not applicable*, *not yet computed* and *cleared by correction* — the same
-- collapse S4's three-distinct-facts rule (null / NOT_ASSESSED / NONE) exists to forbid. Each
-- projected transition therefore carries a kind ALONGSIDE its date, and a CHECK constraint keeps
-- the two honest.
CREATE TYPE "InfectionProjectionKind" AS ENUM ('PROJECTED', 'UNKNOWN', 'NOT_APPLICABLE');
