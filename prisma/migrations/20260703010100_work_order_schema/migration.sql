-- Phase 9 Unit 2 — Work Order schema. Six new tenant-scoped tables built to the AGENTS.md Phase-12
-- checklist (tenantId + @@index, composite tenant FK -> organization ON DELETE RESTRICT, per-tenant
-- uniques, and — in the sibling _work_order_rls migration — RLS ENABLE+FORCE + tenant_isolation +
-- app_rls grant). Cluster relations (WO↔task↔attempt↔template↔version↔reservation) and external refs
-- (lot/vessel/cellar_material/lot_operation) are COMPOSITE (tenantId, refId)->(tenantId, id) at the DB
-- level (K11); Prisma relations stay single-column referencing id. Money/qty Decimal(18,6).

SET lock_timeout = '5s';

-- ─────────────── work_order (the shell) ───────────────
CREATE TABLE "work_order" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "status" "WorkOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "templateVersionId" TEXT,
    "instructions" TEXT,
    "assigneeId" TEXT,
    "assigneeEmail" TEXT,
    "dueAt" TIMESTAMP(3),
    "scheduledFor" TIMESTAMP(3),
    "autoFinalize" BOOLEAN NOT NULL DEFAULT false,
    "issuedAt" TIMESTAMP(3),
    "issuedById" TEXT,
    "issuedByEmail" TEXT,
    "startedAt" TIMESTAMP(3),
    "startedById" TEXT,
    "startedByEmail" TEXT,
    "completedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedByEmail" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_order_pkey" PRIMARY KEY ("id")
);

-- ─────────────── work_order_task ───────────────
CREATE TABLE "work_order_task" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "kind" "WorkOrderTaskKind" NOT NULL,
    "status" "WorkOrderTaskStatus" NOT NULL DEFAULT 'PENDING',
    "title" TEXT NOT NULL,
    "opType" "OperationType",
    "observationType" TEXT,
    "instructions" TEXT,
    "sourceVesselId" TEXT,
    "destVesselId" TEXT,
    "lotId" TEXT,
    "materialId" TEXT,
    "assigneeId" TEXT,
    "assigneeEmail" TEXT,
    "dueAt" TIMESTAMP(3),
    "plannedPayload" JSONB NOT NULL,
    "currentAttemptId" TEXT,
    "completionNote" TEXT,
    "deviationReason" TEXT,
    "startedAt" TIMESTAMP(3),
    "startedById" TEXT,
    "startedByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_order_task_pkey" PRIMARY KEY ("id")
);

-- ─────────────── work_order_task_attempt (A1: append-only; owns commandId + op link) ───────────────
CREATE TABLE "work_order_task_attempt" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "commandId" TEXT NOT NULL,
    "status" "WorkOrderTaskAttemptStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "actualPayload" JSONB NOT NULL,
    "operationId" INTEGER,
    "correctionOperationId" INTEGER,
    "completionNote" TEXT,
    "deviationReason" TEXT,
    "rejectedReason" TEXT,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedById" TEXT,
    "completedByEmail" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_order_task_attempt_pkey" PRIMARY KEY ("id")
);

-- ─────────────── work_order_template ───────────────
CREATE TABLE "work_order_template" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "clonedFromId" TEXT,
    "recurringCadence" TEXT,
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_order_template_pkey" PRIMARY KEY ("id")
);

-- ─────────────── work_order_template_version (immutable spec snapshot) ───────────────
CREATE TABLE "work_order_template_version" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "spec" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "createdByEmail" TEXT,

    CONSTRAINT "work_order_template_version_pkey" PRIMARY KEY ("id")
);

-- ─────────────── reservation (soft advisory hold; exactly one target per kind) ───────────────
CREATE TABLE "reservation" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "taskId" TEXT,
    "kind" "ReservationKind" NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "lotId" TEXT,
    "vesselId" TEXT,
    "materialId" TEXT,
    "qty" DECIMAL(18,6) NOT NULL,
    "unit" TEXT,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reservation_pkey" PRIMARY KEY ("id")
);

-- ─────────────── Per-tenant uniques + (tenantId, id) targets + regular indexes ───────────────
CREATE UNIQUE INDEX "work_order_tenantId_number_key" ON "work_order"("tenantId", "number");
CREATE UNIQUE INDEX "work_order_tenantId_id_key" ON "work_order"("tenantId", "id");
CREATE INDEX "work_order_tenantId_idx" ON "work_order"("tenantId");
CREATE INDEX "work_order_tenantId_status_dueAt_idx" ON "work_order"("tenantId", "status", "dueAt");

CREATE UNIQUE INDEX "work_order_task_tenantId_id_key" ON "work_order_task"("tenantId", "id");
CREATE INDEX "work_order_task_tenantId_idx" ON "work_order_task"("tenantId");
CREATE INDEX "work_order_task_tenantId_workOrderId_idx" ON "work_order_task"("tenantId", "workOrderId");
CREATE INDEX "work_order_task_tenantId_status_dueAt_idx" ON "work_order_task"("tenantId", "status", "dueAt");

CREATE UNIQUE INDEX "work_order_task_attempt_commandId_key" ON "work_order_task_attempt"("commandId");
CREATE UNIQUE INDEX "work_order_task_attempt_tenantId_operationId_key" ON "work_order_task_attempt"("tenantId", "operationId");
CREATE UNIQUE INDEX "work_order_task_attempt_tenantId_id_key" ON "work_order_task_attempt"("tenantId", "id");
CREATE INDEX "work_order_task_attempt_tenantId_idx" ON "work_order_task_attempt"("tenantId");
CREATE INDEX "work_order_task_attempt_tenantId_taskId_idx" ON "work_order_task_attempt"("tenantId", "taskId");

CREATE UNIQUE INDEX "work_order_template_tenantId_code_key" ON "work_order_template"("tenantId", "code");
CREATE UNIQUE INDEX "work_order_template_tenantId_id_key" ON "work_order_template"("tenantId", "id");
CREATE INDEX "work_order_template_tenantId_idx" ON "work_order_template"("tenantId");

CREATE UNIQUE INDEX "work_order_template_version_tenantId_templateId_version_key" ON "work_order_template_version"("tenantId", "templateId", "version");
CREATE UNIQUE INDEX "work_order_template_version_tenantId_id_key" ON "work_order_template_version"("tenantId", "id");
CREATE INDEX "work_order_template_version_tenantId_idx" ON "work_order_template_version"("tenantId");

CREATE UNIQUE INDEX "reservation_tenantId_id_key" ON "reservation"("tenantId", "id");
CREATE INDEX "reservation_tenantId_idx" ON "reservation"("tenantId");
CREATE INDEX "reservation_tenantId_lotId_idx" ON "reservation"("tenantId", "lotId");
CREATE INDEX "reservation_tenantId_vesselId_idx" ON "reservation"("tenantId", "vesselId");
CREATE INDEX "reservation_tenantId_materialId_idx" ON "reservation"("tenantId", "materialId");

-- A7: partial indexes on ACTIVE holds by target — the ATP aggregation only ever scans open holds, so a
-- partial index keeps the scan a bounded seek as RELEASED/EXPIRED history grows.
CREATE INDEX "reservation_active_lot_idx" ON "reservation"("tenantId", "lotId", "validUntil") WHERE "status" = 'ACTIVE' AND "lotId" IS NOT NULL;
CREATE INDEX "reservation_active_vessel_idx" ON "reservation"("tenantId", "vesselId", "validUntil") WHERE "status" = 'ACTIVE' AND "vesselId" IS NOT NULL;
CREATE INDEX "reservation_active_material_idx" ON "reservation"("tenantId", "materialId", "validUntil") WHERE "status" = 'ACTIVE' AND "materialId" IS NOT NULL;

-- ─────────────── Promote (tenantId, id) unique INDEXES to CONSTRAINTS (Postgres FKs need a unique
-- constraint, not a bare index; names preserved -> no Prisma drift) ───────────────
ALTER TABLE "work_order" ADD CONSTRAINT "work_order_tenantId_id_key" UNIQUE USING INDEX "work_order_tenantId_id_key";
ALTER TABLE "work_order_task" ADD CONSTRAINT "work_order_task_tenantId_id_key" UNIQUE USING INDEX "work_order_task_tenantId_id_key";
ALTER TABLE "work_order_template" ADD CONSTRAINT "work_order_template_tenantId_id_key" UNIQUE USING INDEX "work_order_template_tenantId_id_key";
ALTER TABLE "work_order_template_version" ADD CONSTRAINT "work_order_template_version_tenantId_id_key" UNIQUE USING INDEX "work_order_template_version_tenantId_id_key";

-- ─────────────── FKs: tenantId -> organization (Phase-12 checklist, ON DELETE RESTRICT) ───────────────
ALTER TABLE "work_order" ADD CONSTRAINT "work_order_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "work_order_task" ADD CONSTRAINT "work_order_task_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "work_order_task_attempt" ADD CONSTRAINT "work_order_task_attempt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "work_order_template" ADD CONSTRAINT "work_order_template_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "work_order_template_version" ADD CONSTRAINT "work_order_template_version_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reservation" ADD CONSTRAINT "reservation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────── Composite tenant FKs — cluster (K11: cross-tenant edges structurally impossible) ───────────────
ALTER TABLE "work_order" ADD CONSTRAINT "work_order_tenantId_templateVersionId_fkey" FOREIGN KEY ("tenantId", "templateVersionId") REFERENCES "work_order_template_version"("tenantId", "id") ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "work_order_task" ADD CONSTRAINT "work_order_task_tenantId_workOrderId_fkey" FOREIGN KEY ("tenantId", "workOrderId") REFERENCES "work_order"("tenantId", "id") ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "work_order_task_attempt" ADD CONSTRAINT "work_order_task_attempt_tenantId_taskId_fkey" FOREIGN KEY ("tenantId", "taskId") REFERENCES "work_order_task"("tenantId", "id") ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "work_order_template_version" ADD CONSTRAINT "work_order_template_version_tenantId_templateId_fkey" FOREIGN KEY ("tenantId", "templateId") REFERENCES "work_order_template"("tenantId", "id") ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "reservation" ADD CONSTRAINT "reservation_tenantId_workOrderId_fkey" FOREIGN KEY ("tenantId", "workOrderId") REFERENCES "work_order"("tenantId", "id") ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "reservation" ADD CONSTRAINT "reservation_tenantId_taskId_fkey" FOREIGN KEY ("tenantId", "taskId") REFERENCES "work_order_task"("tenantId", "id") ON UPDATE CASCADE ON DELETE RESTRICT;

-- ─────────────── Composite tenant FKs — external refs (RESTRICT; nullable, so FK only checked when set) ───────────────
ALTER TABLE "work_order_task" ADD CONSTRAINT "work_order_task_tenantId_lotId_fkey" FOREIGN KEY ("tenantId", "lotId") REFERENCES "lot"("tenantId", "id") ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "work_order_task" ADD CONSTRAINT "work_order_task_tenantId_sourceVesselId_fkey" FOREIGN KEY ("tenantId", "sourceVesselId") REFERENCES "vessel"("tenantId", "id") ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "work_order_task" ADD CONSTRAINT "work_order_task_tenantId_destVesselId_fkey" FOREIGN KEY ("tenantId", "destVesselId") REFERENCES "vessel"("tenantId", "id") ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "work_order_task" ADD CONSTRAINT "work_order_task_tenantId_materialId_fkey" FOREIGN KEY ("tenantId", "materialId") REFERENCES "cellar_material"("tenantId", "id") ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "work_order_task_attempt" ADD CONSTRAINT "work_order_task_attempt_tenantId_operationId_fkey" FOREIGN KEY ("tenantId", "operationId") REFERENCES "lot_operation"("tenantId", "id") ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "work_order_task_attempt" ADD CONSTRAINT "work_order_task_attempt_tenantId_correctionOperationId_fkey" FOREIGN KEY ("tenantId", "correctionOperationId") REFERENCES "lot_operation"("tenantId", "id") ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "reservation" ADD CONSTRAINT "reservation_tenantId_lotId_fkey" FOREIGN KEY ("tenantId", "lotId") REFERENCES "lot"("tenantId", "id") ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "reservation" ADD CONSTRAINT "reservation_tenantId_vesselId_fkey" FOREIGN KEY ("tenantId", "vesselId") REFERENCES "vessel"("tenantId", "id") ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "reservation" ADD CONSTRAINT "reservation_tenantId_materialId_fkey" FOREIGN KEY ("tenantId", "materialId") REFERENCES "cellar_material"("tenantId", "id") ON UPDATE CASCADE ON DELETE RESTRICT;

-- ─────────────── app_rls DML (belt-and-braces; ALTER DEFAULT PRIVILEGES already auto-grants) ───────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON "work_order" TO app_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON "work_order_task" TO app_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON "work_order_task_attempt" TO app_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON "work_order_template" TO app_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON "work_order_template_version" TO app_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON "reservation" TO app_rls;
