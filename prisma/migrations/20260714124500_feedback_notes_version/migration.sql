-- Plan 067 / PR B: prevent stale developer-console edits from erasing machine-appended
-- triage and Linear handoff history. Existing rows begin at revision 1; every notes
-- writer performs an optimistic compare-and-swap and increments the revision.
ALTER TABLE "assistant_feedback"
  ADD COLUMN "developerNotesVersion" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "feedback_ticket"
  ADD COLUMN "developerNotesVersion" INTEGER NOT NULL DEFAULT 1;

-- The migration is deployed before the new application build becomes active. During
-- that overlap, an old instance can still try to replace developerNotes without a
-- revision predicate. Preserve the old value when reconciling such a legacy write,
-- while retaining as much of the legacy writer's intended text as the 5000-char app
-- bound allows. New writers increment exactly once; stale compare-and-swaps match no row.
CREATE OR REPLACE FUNCTION reconcile_feedback_developer_notes_version()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  separator CONSTANT TEXT := E'\n\n---\n';
  available INTEGER;
BEGIN
  IF NEW."developerNotes" IS DISTINCT FROM OLD."developerNotes"
     AND NEW."developerNotesVersion" = OLD."developerNotesVersion" THEN
    NEW."developerNotesVersion" := OLD."developerNotesVersion" + 1;
    IF OLD."developerNotes" IS NULL OR OLD."developerNotes" = '' THEN
      NULL; -- No prior history exists, so the legacy value is safe as-is.
    ELSIF NEW."developerNotes" IS NULL OR NEW."developerNotes" = '' THEN
      NEW."developerNotes" := OLD."developerNotes";
    ELSIF POSITION(OLD."developerNotes" IN NEW."developerNotes") > 0 THEN
      NULL; -- The legacy writer already retained the current history.
    ELSIF POSITION(NEW."developerNotes" IN OLD."developerNotes") > 0 THEN
      NEW."developerNotes" := OLD."developerNotes";
    ELSE
      available := 5000 - CHAR_LENGTH(OLD."developerNotes") - CHAR_LENGTH(separator);
      IF available > 0 THEN
        NEW."developerNotes" := LEFT(NEW."developerNotes", available) || separator || OLD."developerNotes";
      ELSE
        NEW."developerNotes" := OLD."developerNotes";
      END IF;
    END IF;
  END IF;
  IF NEW."developerNotesVersion" <> OLD."developerNotesVersion"
     AND NEW."developerNotesVersion" <> OLD."developerNotesVersion" + 1 THEN
    RAISE EXCEPTION 'developerNotesVersion must advance by exactly one'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "assistant_feedback_reconcile_developer_notes_version"
  BEFORE UPDATE OF "developerNotes", "developerNotesVersion" ON "assistant_feedback"
  FOR EACH ROW
  EXECUTE FUNCTION reconcile_feedback_developer_notes_version();

CREATE TRIGGER "feedback_ticket_reconcile_developer_notes_version"
  BEFORE UPDATE OF "developerNotes", "developerNotesVersion" ON "feedback_ticket"
  FOR EACH ROW
  EXECUTE FUNCTION reconcile_feedback_developer_notes_version();
