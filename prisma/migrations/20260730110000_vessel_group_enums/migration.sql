-- Cellarhand v2 Phase 7 (plan 106, Unit 2) — the two brand-new group enums, ALONE in their own file.
--
-- Brand-new CREATE TYPE only; no ALTER TYPE, no table touched, no data mutation. Kept in its own
-- migration so the types are committed AND deployed before the structural migration that references
-- them. Precedent: 20260727100000_phenology_block_enums -> 20260727100100_block_canopy_profile, and
-- 20260728100000_latent_infection_enums -> 20260728100100_latent_infection_event.
--
-- NOTE the distinction from plan 106's M1 (20260730100000_cellarhand_v2_enum_values): that file was
-- alone because ALTER TYPE ... ADD VALUE cannot be used in the transaction that adds it. This file is
-- alone for the weaker but still real reason above — a deploy that applies the structure migration
-- against a database missing these types fails at the first column definition.

-- RFC-001 §4.2. OPERATIONAL is the durable working set work is assigned to and is what OD-3
-- (GROUP-1) constrains to one-per-vessel. AD_HOC is a transient selection with unlimited overlap.
--
-- AD_HOC ships as a VALUE and nothing more. Plan 106 §3 "Still open" is explicit: this phase builds
-- no AD_HOC creation path and no auto-archive lifecycle, because RFC-001 §4.2's "auto-archives when
-- its work order closes" is a lifecycle nothing in Phase 7 owns. The value exists because GROUP-1's
-- partial index needs a type to be partial ON. Every group created in Phase 7 is OPERATIONAL.
CREATE TYPE "VesselGroupType" AS ENUM ('OPERATIONAL', 'AD_HOC');

-- RFC-001 §4.5. Archiving hides the group from pickers and indexes, keeps all history, and does NOT
-- affect open work orders that already reference it (they carry their own frozen member list —
-- GROUP-3). Existing `isActive: false` maps to ARCHIVED; see the sync trigger in the next migration
-- for why both columns continue to exist.
CREATE TYPE "VesselGroupStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
