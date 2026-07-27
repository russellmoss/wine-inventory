-- VI P4 soil overlay — add the OPTIONAL block-clipped display geometry column. Additive, nullable, no
-- RLS change (same block_soil_snapshot table, already tenant-isolated). Overlay-only; the composition
-- snapshot stays authoritative and is never derived from this (design §13.6).
ALTER TABLE "block_soil_snapshot" ADD COLUMN "displayGeometry" JSONB;
