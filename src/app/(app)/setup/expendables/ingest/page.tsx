import Link from "next/link";
import { requireReadyUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { Card, Eyebrow, Button } from "@/components/ui";
import { listMaterials } from "@/lib/cellar/materials";
import { listVendors } from "@/lib/vendors/vendors";
import { categoryOf } from "@/lib/cellar/material-taxonomy";
import { getRate } from "@/lib/money/fx/rate-service";
import { coerceCurrency, SUPPORTED_CURRENCIES } from "@/lib/money/currency";
import { isForeignCurrency } from "./ingest-review-model";
import type { MaterialCandidate } from "@/lib/cellar/material-match";
import type { ExtractedDocument } from "@/lib/ingest/extract-invoice";
import { IngestReviewClient } from "./IngestReviewClient";
import type { ReviewDoc, ReviewDocType, ReviewStatus } from "./ingest-review-model";

export const metadata = { title: "Review ingested invoice" };

// Plan 072 Unit 8 — the per-batch review surface. Reads all IngestedInvoice rows (+ their staged lines) for
// the `?batch=` in the URL (the upload flow + the assistant both deep-link here), plus the material catalog
// (with vendor-scoped item codes) for the dedup control and the vendor list for the vendor panel. Everything
// is tenant-scoped: the `prisma` model reads resolve the caller's winery via the tenant extension (RLS).

const numOrNull = (v: unknown): number | null => (v == null ? null : Number(v));

export default async function IngestReviewPage({ searchParams }: { searchParams: Promise<{ batch?: string }> }) {
  await requireReadyUser();
  const batchId = (await searchParams).batch?.trim() ?? "";

  if (!batchId) {
    return (
      <div>
        <Eyebrow rule>Setup</Eyebrow>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 36, margin: "10px 0 6px" }}>Ingest invoice</h1>
        <Card padding="var(--space-5)" style={{ marginTop: 8, textAlign: "center" }}>
          <p style={{ color: "var(--text-secondary)", fontSize: 15, margin: "8px 0 14px", maxWidth: "56ch", marginInline: "auto" }}>
            No ingestion batch selected. Start from the Expendables page — use{" "}
            <strong>+ Ingest invoice</strong> to upload supplier documents, and you&rsquo;ll land back here to
            review them.
          </p>
          <Link href="/setup/expendables">
            <Button variant="primary">Go to Expendables</Button>
          </Link>
        </Card>
      </div>
    );
  }

  const [rows, materials, vendors, settings, qboConn] = await Promise.all([
    prisma.ingestedInvoice.findMany({ where: { batchId }, orderBy: { createdAt: "asc" } }),
    listMaterials({ includeInactive: false }),
    listVendors({ activeOnly: true }),
    prisma.appSettings.findFirst({ select: { currency: true } }),
    prisma.accountingConnection.findFirst({ where: { provider: "QBO", status: "CONNECTED" }, select: { multiCurrencyEnabled: true } }),
  ]);
  const baseCurrency = coerceCurrency(settings?.currency);

  // Lines for all invoices in one query, grouped by invoice.
  const invoiceIds = rows.map((r) => r.id);
  const lineRows = invoiceIds.length
    ? await prisma.ingestedInvoiceLine.findMany({ where: { ingestedInvoiceId: { in: invoiceIds } }, orderBy: { lineNo: "asc" } })
    : [];
  const linesByInvoice = new Map<string, typeof lineRows>();
  for (const l of lineRows) {
    const arr = linesByInvoice.get(l.ingestedInvoiceId) ?? [];
    arr.push(l);
    linesByInvoice.set(l.ingestedInvoiceId, arr);
  }

  // Vendor-scoped item codes, grouped by material, for the dedup matcher.
  const codeRows = await prisma.vendorMaterialCode.findMany({ select: { materialId: true, vendorId: true, code: true } });
  const codesByMaterial = new Map<string, { vendorId: string; code: string }[]>();
  for (const c of codeRows) {
    const arr = codesByMaterial.get(c.materialId) ?? [];
    arr.push({ vendorId: c.vendorId, code: c.code });
    codesByMaterial.set(c.materialId, arr);
  }

  const candidates: MaterialCandidate[] = materials.map((m) => ({
    materialId: m.id,
    name: m.name,
    category: (m.category as string) ?? categoryOf(m.kind),
    vendorCodes: codesByMaterial.get(m.id) ?? [],
  }));

  // Serialize the staging rows into the pure-model DTO the client edits (Decimals → numbers; charges +
  // warnings + COA lot no. lifted out of the stored extraction).
  const docs: ReviewDoc[] = rows.map((r) => {
    const extracted = (r.extractedJson ?? null) as ExtractedDocument | null;
    const lines = (linesByInvoice.get(r.id) ?? []).map((l) => ({
      id: l.id,
      lineNo: l.lineNo,
      descriptionRaw: l.descriptionRaw,
      vendorItemCodeRaw: l.vendorItemCodeRaw,
      qty: numOrNull(l.qty),
      unitRaw: l.unitRaw,
      unitPrice: numOrNull(l.unitPrice),
      lineTotal: numOrNull(l.lineTotal),
      lotNoRaw: l.lotNoRaw,
      matchDecision: (l.matchDecision as "new" | "existing" | "skip" | null) ?? null,
      matchedMaterialId: l.matchedMaterialId,
      resolvedKind: l.resolvedKind,
      resolvedCategory: l.resolvedCategory,
      allocatedUnitCost: numOrNull(l.allocatedUnitCost),
      createdSupplyLotId: l.createdSupplyLotId,
    }));
    return {
      id: r.id,
      batchId: r.batchId,
      fileName: r.fileName,
      mimeType: r.mimeType,
      docType: r.docType as ReviewDocType,
      status: r.status as ReviewStatus,
      currency: r.currency,
      vendorNameRaw: r.vendorNameRaw,
      vendorInvoiceNumber: r.vendorInvoiceNumber,
      invoiceTotal: numOrNull(r.invoiceTotal),
      taxTotal: numOrNull(r.taxTotal),
      landedReceipt: r.landedReceipt,
      charges: extracted?.charges ?? null,
      warnings: Array.isArray(extracted?.warnings) ? extracted!.warnings : [],
      coaLotNo: extracted?.coa?.lotNo ?? null,
      lines,
    };
  });

  // Plan 073: per-doc FX suggestion for a foreign invoice — a persisted manual override wins, else the dated
  // feed (getRate caches daily). null = the feed had no rate → the client blocks Confirm until one is entered.
  const fxByDoc: Record<string, { rate: number | null; rateDate: string | null; source: string | null }> = {};
  await Promise.all(
    rows.map(async (r) => {
      if (!isForeignCurrency(r.currency, baseCurrency)) return;
      if (r.fxRate != null) {
        fxByDoc[r.id] = { rate: Number(r.fxRate), rateDate: r.fxRateDate ? r.fxRateDate.toISOString().slice(0, 10) : null, source: r.fxRateSource ?? "manual override" };
        return;
      }
      // An unsupported invoice currency can't be priced — surface null (Confirm blocks) rather than a fake 1.0.
      const foreignCode = (r.currency ?? "").trim().toUpperCase();
      if (!(SUPPORTED_CURRENCIES as readonly string[]).includes(foreignCode)) {
        fxByDoc[r.id] = { rate: null, rateDate: null, source: null };
        return;
      }
      const resolved = await getRate(baseCurrency, foreignCode, new Date());
      fxByDoc[r.id] = resolved.ok
        ? { rate: resolved.rate, rateDate: resolved.rateDate.toISOString().slice(0, 10), source: resolved.source }
        : { rate: null, rateDate: null, source: null };
    }),
  );

  return (
    <IngestReviewClient
      batchId={batchId}
      docs={docs}
      candidates={candidates}
      vendors={vendors}
      baseCurrency={baseCurrency}
      multiCurrencyEnabled={qboConn ? qboConn.multiCurrencyEnabled ?? null : undefined}
      fxByDoc={fxByDoc}
    />
  );
}
