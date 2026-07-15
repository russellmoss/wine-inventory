-- Plan 068 Unit 1b: per-user RLS on the inbox tables, layered ON TOP of tenant_isolation.
-- These are RESTRICTIVE policies, so PostgreSQL ANDs them with the permissive tenant_isolation
-- policy (tenant AND owner). Keyed on current_setting('app.user_id', true), set per-transaction by
-- the Prisma extension / runInTenantTx (Unit 1b). Unset/'' -> NULL/'' comparison -> zero rows
-- (fail-closed), harmless for every table without a per-user policy.
--
-- CRUX (plan T1): reads/writes to one's OWN rows are owner-only, but a same-tenant actor must be able
-- to INSERT a notification FOR another user (the emit path). So there is NO restrictive policy on
-- INSERT — inserts remain governed only by the permissive tenant_isolation WITH CHECK (tenant match).
-- Restrictive SELECT/UPDATE/DELETE lock reading/mutating to the owner (recipient / thread participant).

-- inbox_notification: owner = recipientUserId.
CREATE POLICY "own_notification_select" ON "inbox_notification" AS RESTRICTIVE FOR SELECT
  USING ("recipientUserId" = current_setting('app.user_id', true));
CREATE POLICY "own_notification_update" ON "inbox_notification" AS RESTRICTIVE FOR UPDATE
  USING ("recipientUserId" = current_setting('app.user_id', true));
CREATE POLICY "own_notification_delete" ON "inbox_notification" AS RESTRICTIVE FOR DELETE
  USING ("recipientUserId" = current_setting('app.user_id', true));

-- direct_message_thread: participant = userAId OR userBId. UPDATE needed for the lastMessageAt bump
-- (the sender is a participant). INSERT stays tenant-only (creator sets themselves as a participant;
-- validated app-side + by the sorted-pair CHECK).
CREATE POLICY "member_thread_select" ON "direct_message_thread" AS RESTRICTIVE FOR SELECT
  USING (
    "userAId" = current_setting('app.user_id', true) OR "userBId" = current_setting('app.user_id', true)
  );
CREATE POLICY "member_thread_update" ON "direct_message_thread" AS RESTRICTIVE FOR UPDATE
  USING (
    "userAId" = current_setting('app.user_id', true) OR "userBId" = current_setting('app.user_id', true)
  );
CREATE POLICY "member_thread_delete" ON "direct_message_thread" AS RESTRICTIVE FOR DELETE
  USING (
    "userAId" = current_setting('app.user_id', true) OR "userBId" = current_setting('app.user_id', true)
  );

-- direct_message: readable only if the current user is in the parent thread's pair.
CREATE POLICY "member_message_select" ON "direct_message" AS RESTRICTIVE FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "direct_message_thread" t
      WHERE t."tenantId" = "direct_message"."tenantId"
        AND t."id" = "direct_message"."threadId"
        AND (t."userAId" = current_setting('app.user_id', true) OR t."userBId" = current_setting('app.user_id', true))
    )
  );

-- direct_message_attachment: readable only via message -> thread pair.
CREATE POLICY "member_attachment_select" ON "direct_message_attachment" AS RESTRICTIVE FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "direct_message" m
      JOIN "direct_message_thread" t ON t."tenantId" = m."tenantId" AND t."id" = m."threadId"
      WHERE m."tenantId" = "direct_message_attachment"."tenantId"
        AND m."id" = "direct_message_attachment"."messageId"
        AND (t."userAId" = current_setting('app.user_id', true) OR t."userBId" = current_setting('app.user_id', true))
    )
  );

-- Fail this migration if any table is missing its per-user restrictive policy (a silent per-user leak).
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      ('inbox_notification', 'own_notification_select'),
      ('direct_message_thread', 'member_thread_select'),
      ('direct_message', 'member_message_select'),
      ('direct_message_attachment', 'member_attachment_select')
    ) AS v(tbl, pol)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = rec.tbl AND policyname = rec.pol AND permissive = 'RESTRICTIVE'
    ) THEN
      RAISE EXCEPTION 'per-user RESTRICTIVE policy % missing on %', rec.pol, rec.tbl;
    END IF;
  END LOOP;
END
$$;
