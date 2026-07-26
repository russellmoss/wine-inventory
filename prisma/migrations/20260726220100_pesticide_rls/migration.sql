-- Spray S2 Unit 1: RLS posture for the pesticide master — DELIBERATELY NONE (the knowledge_base_rls
-- precedent). All eight pesticide_* tables are GLOBAL reference data (like fx_rate and the Plan-079
-- knowledge corpus): US EPA registrations, CA DPR state registrations, and resistance-code assignments
-- are identical for every tenant, so there is no tenantId column and no tenant_isolation policy.
--
-- This is NOT the Phase-12 tenant checklist case (AGENTS.md), and that is deliberate, not an oversight:
--   * Per-tenant CONTROL is the existing tenant-scoped KnowledgeSourceSubscription row for the
--     `epa-pesticide` source (RLS'd since 20260718140100_knowledge_base_rls).
--   * ENTITLEMENT is enforced at the service layer: src/lib/pesticide/lookup.ts is the single module
--     in the lane that imports @/lib/prisma, and every exported read checks the subscription FIRST,
--     failing closed (plan K7; guarded by test/pesticide-boundaries.test.ts).
--   * The models are listed in GLOBAL_MODELS (src/lib/tenant/models.ts), mirrored in
--     scripts/verify-tenant-isolation.ts and test/tenant-context.test.ts, so the tenant extension
--     passes them through and the RLS coverage guard skips them knowingly.
--
-- Fail this migration if any pesticide table ever picked up a tenantId column — that would mean the
-- global posture was half-converted and the coverage guard is about to be lied to.
DO $$
DECLARE
  r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['pesticide_data_revision','pesticide_product','pesticide_active_ingredient',
    'pesticide_product_ingredient','pesticide_site_registration','pesticide_state_registration',
    'pesticide_use_restriction','pesticide_resistance_assignment'] LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = r AND column_name = 'tenantId'
    ) THEN
      RAISE EXCEPTION 'pesticide table % unexpectedly carries tenantId — global posture violated', r;
    END IF;
  END LOOP;
END $$;
