-- Plan 068 review follow-up (security P2): close the write-side asymmetry on the DM tables. The
-- per-user migration gave direct_message / direct_message_attachment a RESTRICTIVE SELECT policy but
-- no RESTRICTIVE UPDATE/DELETE, while app_rls holds UPDATE/DELETE grants — so those ops were governed
-- only by the permissive tenant_isolation (any same-tenant row). Not exploitable today (messages are
-- append-only; deletes happen via owner-privileged FK cascade), but the thread + notification tables
-- got participant/owner-scoped U/D and these two should match. Add participant-scoped RESTRICTIVE
-- UPDATE/DELETE (mirroring member_message_select / member_attachment_select).

CREATE POLICY "member_message_update" ON "direct_message" AS RESTRICTIVE FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM "direct_message_thread" t
      WHERE t."tenantId" = "direct_message"."tenantId"
        AND t."id" = "direct_message"."threadId"
        AND (t."userAId" = current_setting('app.user_id', true) OR t."userBId" = current_setting('app.user_id', true))
    )
  );
CREATE POLICY "member_message_delete" ON "direct_message" AS RESTRICTIVE FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM "direct_message_thread" t
      WHERE t."tenantId" = "direct_message"."tenantId"
        AND t."id" = "direct_message"."threadId"
        AND (t."userAId" = current_setting('app.user_id', true) OR t."userBId" = current_setting('app.user_id', true))
    )
  );

CREATE POLICY "member_attachment_update" ON "direct_message_attachment" AS RESTRICTIVE FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM "direct_message" m
      JOIN "direct_message_thread" t ON t."tenantId" = m."tenantId" AND t."id" = m."threadId"
      WHERE m."tenantId" = "direct_message_attachment"."tenantId"
        AND m."id" = "direct_message_attachment"."messageId"
        AND (t."userAId" = current_setting('app.user_id', true) OR t."userBId" = current_setting('app.user_id', true))
    )
  );
CREATE POLICY "member_attachment_delete" ON "direct_message_attachment" AS RESTRICTIVE FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM "direct_message" m
      JOIN "direct_message_thread" t ON t."tenantId" = m."tenantId" AND t."id" = m."threadId"
      WHERE m."tenantId" = "direct_message_attachment"."tenantId"
        AND m."id" = "direct_message_attachment"."messageId"
        AND (t."userAId" = current_setting('app.user_id', true) OR t."userBId" = current_setting('app.user_id', true))
    )
  );

-- Fail the migration if any of the four write policies is missing.
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      ('direct_message', 'member_message_update'),
      ('direct_message', 'member_message_delete'),
      ('direct_message_attachment', 'member_attachment_update'),
      ('direct_message_attachment', 'member_attachment_delete')
    ) AS v(tbl, pol)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = rec.tbl AND policyname = rec.pol AND permissive = 'RESTRICTIVE'
    ) THEN
      RAISE EXCEPTION 'per-user write policy % missing on %', rec.pol, rec.tbl;
    END IF;
  END LOOP;
END
$$;
