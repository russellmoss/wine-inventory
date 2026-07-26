-- S3a trigger fix: spray_reject_content_mutation referenced OLD."supersededByApplicationId"
-- directly. PL/pgSQL resolves that field against the FIRING table's rowtype at plan time, so on
-- any of the five tables that lack the column the trigger errored ("column old does not exist")
-- even though the TG_TABLE_NAME guard was false — short-circuit does not save you from the
-- planner. Rewritten to go through to_jsonb(OLD)/to_jsonb(NEW), which is rowtype-agnostic.
-- Behavior is unchanged: per-table allowlist, and the supersededByApplicationId pointer is
-- writable once (NULL -> value), never repointed (KD-1 / council C9).

CREATE OR REPLACE FUNCTION spray_reject_content_mutation() RETURNS trigger AS $$
DECLARE
  allowed text[] := COALESCE(TG_ARGV, ARRAY[]::text[]);
  old_j jsonb := to_jsonb(OLD);
  new_j jsonb := to_jsonb(NEW);
  changed_col text;
BEGIN
  IF TG_TABLE_NAME = 'spray_application'
     AND (old_j ->> 'supersededByApplicationId') IS NOT NULL
     AND (new_j ->> 'supersededByApplicationId') IS DISTINCT FROM (old_j ->> 'supersededByApplicationId') THEN
    RAISE EXCEPTION 'spray append-only: supersededByApplicationId is writable once (NULL -> value) and can never be repointed (KD-1/C9)';
  END IF;
  FOR changed_col IN
    SELECT o.key
    FROM jsonb_each(old_j) o
    JOIN jsonb_each(new_j) n ON n.key = o.key
    WHERE o.value IS DISTINCT FROM n.value
  LOOP
    IF NOT (changed_col = ANY (allowed)) THEN
      RAISE EXCEPTION 'spray append-only: %.% is immutable content — correct by appending a new revision (KD-1)', TG_TABLE_NAME, changed_col;
    END IF;
  END LOOP;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
