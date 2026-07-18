-- Plan 072: invoice / document ingestion.
-- Two RLS-neutral COLUMN adds on existing tables (SupplyLot.expiresAt, ApExportEvent.vendorInvoiceNumber —
-- the existing tenant_isolation policy already covers new columns) + four NEW tenant-scoped staging /
-- provenance tables that ship full ENABLE + FORCE ROW LEVEL SECURITY with a tenant_isolation policy
-- (Phase-12 pattern). Cross-tenant-risk refs are COMPOSITE (tenantId, refId) → (tenantId, id) FKs (K11) so
-- a system/owner write can't create a cross-tenant pointer. Nullable composite FKs use the column-list
-- ON DELETE SET NULL ("col") form so only the ref column nulls (tenantId stays NOT NULL).

-- ─────────────────────────── Column adds on existing tables (RLS-neutral) ───────────────────────────
ALTER TABLE "supply_lot" ADD COLUMN "expiresAt" TIMESTAMP(3);
ALTER TABLE "ap_export_event" ADD COLUMN "vendorInvoiceNumber" TEXT;

-- ─────────────────────────── New tables ───────────────────────────
CREATE TABLE "ingested_invoice" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "blobUrl" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSha256" TEXT,
    "docType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "currency" TEXT,
    "vendorId" TEXT,
    "vendorNameRaw" TEXT,
    "vendorInvoiceNumber" TEXT,
    "invoiceTotal" DECIMAL(18,8),
    "taxTotal" DECIMAL(18,8),
    "landedReceipt" BOOLEAN,
    "extractedJson" JSONB NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "ingested_invoice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ingested_invoice_line" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "ingestedInvoiceId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "descriptionRaw" TEXT NOT NULL,
    "vendorItemCodeRaw" TEXT,
    "qty" DECIMAL(18,6),
    "unitRaw" TEXT,
    "unitPrice" DECIMAL(18,8),
    "lineTotal" DECIMAL(18,8),
    "lotNoRaw" TEXT,
    "allocatedUnitCost" DECIMAL(18,8),
    "matchDecision" TEXT,
    "matchedMaterialId" TEXT,
    "resolvedKind" TEXT,
    "resolvedCategory" TEXT,
    "createdSupplyLotId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingested_invoice_line_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "lot_document" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "supplyLotId" TEXT NOT NULL,
    "ingestedInvoiceId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lot_document_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "vendor_material_code" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_material_code_pkey" PRIMARY KEY ("id")
);

-- ─────────────────────────── Indexes ───────────────────────────
CREATE UNIQUE INDEX "ingested_invoice_tenantId_id_key" ON "ingested_invoice"("tenantId", "id");
CREATE INDEX "ingested_invoice_tenantId_idx" ON "ingested_invoice"("tenantId");
CREATE INDEX "ingested_invoice_tenantId_batchId_idx" ON "ingested_invoice"("tenantId", "batchId");
CREATE INDEX "ingested_invoice_tenantId_vendorId_vendorInvoiceNumber_idx" ON "ingested_invoice"("tenantId", "vendorId", "vendorInvoiceNumber");
CREATE INDEX "ingested_invoice_tenantId_fileSha256_idx" ON "ingested_invoice"("tenantId", "fileSha256");

CREATE UNIQUE INDEX "ingested_invoice_line_tenantId_id_key" ON "ingested_invoice_line"("tenantId", "id");
CREATE UNIQUE INDEX "ingested_invoice_line_tenantId_ingestedInvoiceId_lineNo_key" ON "ingested_invoice_line"("tenantId", "ingestedInvoiceId", "lineNo");
CREATE INDEX "ingested_invoice_line_tenantId_idx" ON "ingested_invoice_line"("tenantId");
CREATE INDEX "ingested_invoice_line_tenantId_ingestedInvoiceId_idx" ON "ingested_invoice_line"("tenantId", "ingestedInvoiceId");

CREATE UNIQUE INDEX "lot_document_tenantId_id_key" ON "lot_document"("tenantId", "id");
CREATE UNIQUE INDEX "lot_document_tenantId_supplyLotId_ingestedInvoiceId_role_key" ON "lot_document"("tenantId", "supplyLotId", "ingestedInvoiceId", "role");
CREATE INDEX "lot_document_tenantId_idx" ON "lot_document"("tenantId");
CREATE INDEX "lot_document_tenantId_supplyLotId_idx" ON "lot_document"("tenantId", "supplyLotId");
CREATE INDEX "lot_document_tenantId_ingestedInvoiceId_idx" ON "lot_document"("tenantId", "ingestedInvoiceId");

CREATE UNIQUE INDEX "vendor_material_code_tenantId_id_key" ON "vendor_material_code"("tenantId", "id");
CREATE UNIQUE INDEX "vendor_material_code_tenantId_vendorId_code_key" ON "vendor_material_code"("tenantId", "vendorId", "code");
CREATE INDEX "vendor_material_code_tenantId_idx" ON "vendor_material_code"("tenantId");
CREATE INDEX "vendor_material_code_tenantId_materialId_idx" ON "vendor_material_code"("tenantId", "materialId");

-- Promote every (tenantId, id) unique index to a CONSTRAINT so it can be a composite-FK target (K11).
ALTER TABLE "ingested_invoice" ADD CONSTRAINT "ingested_invoice_tenantId_id_key" UNIQUE USING INDEX "ingested_invoice_tenantId_id_key";
ALTER TABLE "ingested_invoice_line" ADD CONSTRAINT "ingested_invoice_line_tenantId_id_key" UNIQUE USING INDEX "ingested_invoice_line_tenantId_id_key";
ALTER TABLE "lot_document" ADD CONSTRAINT "lot_document_tenantId_id_key" UNIQUE USING INDEX "lot_document_tenantId_id_key";
ALTER TABLE "vendor_material_code" ADD CONSTRAINT "vendor_material_code_tenantId_id_key" UNIQUE USING INDEX "vendor_material_code_tenantId_id_key";

-- ─────────────────────────── tenantId → organization(id) (tenant scoping backbone) ───────────────────────────
ALTER TABLE "ingested_invoice" ADD CONSTRAINT "ingested_invoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ingested_invoice_line" ADD CONSTRAINT "ingested_invoice_line_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lot_document" ADD CONSTRAINT "lot_document_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vendor_material_code" ADD CONSTRAINT "vendor_material_code_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────── Composite cross-tenant FKs (K11) ───────────────────────────
-- Owned children CASCADE with their parent; optional back-pointers SET NULL only the ref column.
ALTER TABLE "ingested_invoice_line" ADD CONSTRAINT "ingested_invoice_line_invoice_fkey" FOREIGN KEY ("tenantId", "ingestedInvoiceId") REFERENCES "ingested_invoice"("tenantId", "id") ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "ingested_invoice_line" ADD CONSTRAINT "ingested_invoice_line_matchedMaterial_fkey" FOREIGN KEY ("tenantId", "matchedMaterialId") REFERENCES "cellar_material"("tenantId", "id") ON UPDATE CASCADE ON DELETE SET NULL ("matchedMaterialId");
ALTER TABLE "ingested_invoice_line" ADD CONSTRAINT "ingested_invoice_line_createdSupplyLot_fkey" FOREIGN KEY ("tenantId", "createdSupplyLotId") REFERENCES "supply_lot"("tenantId", "id") ON UPDATE CASCADE ON DELETE SET NULL ("createdSupplyLotId");

ALTER TABLE "ingested_invoice" ADD CONSTRAINT "ingested_invoice_vendor_fkey" FOREIGN KEY ("tenantId", "vendorId") REFERENCES "vendor"("tenantId", "id") ON UPDATE CASCADE ON DELETE SET NULL ("vendorId");

ALTER TABLE "lot_document" ADD CONSTRAINT "lot_document_supplyLot_fkey" FOREIGN KEY ("tenantId", "supplyLotId") REFERENCES "supply_lot"("tenantId", "id") ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "lot_document" ADD CONSTRAINT "lot_document_invoice_fkey" FOREIGN KEY ("tenantId", "ingestedInvoiceId") REFERENCES "ingested_invoice"("tenantId", "id") ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE "vendor_material_code" ADD CONSTRAINT "vendor_material_code_vendor_fkey" FOREIGN KEY ("tenantId", "vendorId") REFERENCES "vendor"("tenantId", "id") ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "vendor_material_code" ADD CONSTRAINT "vendor_material_code_material_fkey" FOREIGN KEY ("tenantId", "materialId") REFERENCES "cellar_material"("tenantId", "id") ON UPDATE CASCADE ON DELETE CASCADE;

-- ─────────────────────────── Row Level Security (tenant isolation, fail-closed) ───────────────────────────
ALTER TABLE "ingested_invoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ingested_invoice" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "ingested_invoice" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "ingested_invoice_line" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ingested_invoice_line" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "ingested_invoice_line" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "lot_document" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lot_document" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "lot_document" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "vendor_material_code" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vendor_material_code" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "vendor_material_code" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON "ingested_invoice" TO app_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ingested_invoice_line" TO app_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON "lot_document" TO app_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON "vendor_material_code" TO app_rls;

-- Fail this migration if any new table somehow lacks RLS (a table with no policy is a silent leak).
DO $$
DECLARE
  r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['ingested_invoice', 'ingested_invoice_line', 'lot_document', 'vendor_material_code'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = r AND c.relrowsecurity AND c.relforcerowsecurity
    ) THEN
      RAISE EXCEPTION 'RLS not fully enabled (ENABLE+FORCE) on %', r;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = r AND policyname = 'tenant_isolation') THEN
      RAISE EXCEPTION 'tenant_isolation policy missing on %', r;
    END IF;
  END LOOP;
END
$$;
