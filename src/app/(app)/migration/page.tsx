import { requireAdmin, requireActiveTenant } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { getMigrationBatchDetail, listMigrationBatches } from "@/lib/migration/batch";
import { loadGenericMigrationFixture } from "@/lib/migration/generic-fixture";
import { MigrationClient } from "./MigrationClient";

export const metadata = { title: "Migration" };
export const dynamic = "force-dynamic";

type MigrationPageProps = {
  searchParams: Promise<{ batch?: string | string[] }>;
};

export default async function MigrationPage({ searchParams }: MigrationPageProps) {
  await requireAdmin();
  await requireActiveTenant();
  const sp = await searchParams;
  const selectedBatchId = typeof sp.batch === "string" ? sp.batch : undefined;
  const [batches, detail, vessels, bonds] = await Promise.all([
    listMigrationBatches(),
    selectedBatchId ? getMigrationBatchDetail(selectedBatchId) : Promise.resolve(null),
    prisma.vessel.findMany({ where: { isActive: true }, select: { id: true, code: true, type: true, capacityL: true }, orderBy: { code: "asc" } }),
    prisma.bond.findMany({ select: { id: true, registryNumber: true, isPrimary: true }, orderBy: { registryNumber: "asc" } }),
  ]);
  const fixture = loadGenericMigrationFixture();

  return (
    <MigrationClient
      batches={batches.map((b) => ({
        ...b,
        cutoverAt: b.cutoverAt.toISOString(),
        createdAt: b.createdAt.toISOString(),
      }))}
      selectedBatchId={selectedBatchId ?? batches[0]?.id ?? null}
      detail={
        detail
          ? {
              batch: {
                ...detail.batch,
                cutoverAt: detail.batch.cutoverAt.toISOString(),
                createdAt: detail.batch.createdAt.toISOString(),
                signedOffAt: detail.batch.signedOffAt?.toISOString() ?? null,
                publishedAt: detail.batch.publishedAt?.toISOString() ?? null,
                discardedAt: detail.batch.discardedAt?.toISOString() ?? null,
                updatedAt: detail.batch.updatedAt.toISOString(),
              },
              lots: detail.lots.map((l) => ({ ...l, createdAt: l.createdAt.toISOString(), updatedAt: l.updatedAt.toISOString() })),
              positions: detail.positions.map((p) => ({
                ...p,
                volumeL: Number(p.volumeL),
                costAmount: p.costAmount == null ? null : Number(p.costAmount),
                createdAt: p.createdAt.toISOString(),
                updatedAt: p.updatedAt.toISOString(),
              })),
              legacyOperations: detail.legacyOperations.map((l) => ({
                ...l,
                occurredAt: l.occurredAt?.toISOString() ?? null,
                volume: l.volume == null ? null : Number(l.volume),
                canonicalVolumeL: l.canonicalVolumeL == null ? null : Number(l.canonicalVolumeL),
                costAmount: l.costAmount == null ? null : Number(l.costAmount),
                publishedAt: l.publishedAt?.toISOString() ?? null,
                createdAt: l.createdAt.toISOString(),
                updatedAt: l.updatedAt.toISOString(),
              })),
              panels: detail.panels.map((p) => ({ ...p, observedAt: p.observedAt.toISOString(), createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString() })),
              readings: detail.readings.map((r) => ({ ...r, value: Number(r.value), createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() })),
              reconciliation: detail.reconciliation.map((r) => ({
                ...r,
                expectedValue: r.expectedValue == null ? null : Number(r.expectedValue),
                actualValue: r.actualValue == null ? null : Number(r.actualValue),
                deltaValue: r.deltaValue == null ? null : Number(r.deltaValue),
                acceptedAt: r.acceptedAt?.toISOString() ?? null,
                createdAt: r.createdAt.toISOString(),
                updatedAt: r.updatedAt.toISOString(),
              })),
              fieldMappings: detail.fieldMappings.map((m) => ({ ...m, createdAt: m.createdAt.toISOString(), updatedAt: m.updatedAt.toISOString() })),
              entityMappings: detail.entityMappings.map((m) => ({ ...m, createdAt: m.createdAt.toISOString(), updatedAt: m.updatedAt.toISOString() })),
            }
          : null
      }
      proofMappings={fixture.expectedFieldMappings}
      entitySources={{
        vessels: [...new Set(fixture.positions.map((p) => p.sourceVesselKey))],
        bonds: [...new Set(fixture.positions.map((p) => p.bondKey).filter((v): v is string => !!v))],
        analytes: [...new Set(fixture.analysisReadings.map((r) => r.analyte))],
        lotCodes: fixture.lots.map((l) => ({ sourceLotKey: l.sourceLotKey, code: l.code })),
      }}
      reference={{
        vessels: vessels.map((v) => ({ id: v.id, label: `${v.code} (${v.type}, ${Number(v.capacityL)} L)` })),
        bonds: bonds.map((b) => ({ id: b.id, label: `${b.registryNumber}${b.isPrimary ? " (primary)" : ""}` })),
        analytes: [{ id: "ALCOHOL", label: "ALCOHOL" }],
      }}
    />
  );
}
