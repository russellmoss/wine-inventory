-- Plan 093 (custom-crush intake), Unit 10: HarvestPick.sold — fruit sold OUT (not crushed here), for TTB
-- Part IV fruit removal. Additive, NOT NULL with a default (metadata-only; every existing pick was crushed
-- or is on hand → false is correct). No backfill.
ALTER TABLE "harvest_pick" ADD COLUMN "sold" BOOLEAN NOT NULL DEFAULT false;
