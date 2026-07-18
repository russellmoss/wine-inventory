/**
 * Plan 076 browser-QA fixtures — Demo Winery ONLY. Seeds a duplicate pair so the review screen exercises the
 * payment selector + the apply-time duplicate gate, then prints the batch URL. `--clean` removes them.
 *   npx tsx --conditions=react-server --env-file=.env scripts/qa-076-seed.ts
 *   npx tsx --conditions=react-server --env-file=.env scripts/qa-076-seed.ts --clean
 */
import { prisma, prismaBase } from "@/lib/prisma";
import { runAsTenant } from "@/lib/tenant/context";

const TENANT = "org_demo_winery";
const BATCH = "QA-076-Demo";
const VENDOR = "QA-076 Dup Co";
const INVNO = "QA-076-DUP-1";

async function clean() {
  await runAsTenant(TENANT, async () => {
    const invs = await prisma.ingestedInvoice.findMany({ where: { OR: [{ batchId: BATCH }, { vendorNameRaw: VENDOR }] }, select: { id: true } });
    const ids = invs.map((i) => i.id);
    await prisma.ingestedInvoiceLine.deleteMany({ where: { ingestedInvoiceId: { in: ids } } });
    await prisma.ingestedInvoice.deleteMany({ where: { id: { in: ids } } });
    console.log(`cleaned ${ids.length} QA-076 invoice(s).`);
  });
}

async function seed() {
  await clean();
  await runAsTenant(TENANT, async () => {
    const ex = { docType: "invoice", charges: null, warnings: [], coa: null, lines: [] };
    // Invoice A — already APPLIED with the same (vendor, invoice#) → triggers the apply-time duplicate guard.
    await prisma.ingestedInvoice.create({
      data: { batchId: `${BATCH}-applied`, blobUrl: "local://qa-a.pdf", fileName: "qa-076-applied.pdf", mimeType: "application/pdf", docType: "invoice", status: "applied", currency: "USD", vendorNameRaw: VENDOR, vendorInvoiceNumber: INVNO, invoiceTotal: 50, extractedJson: ex, createdBy: "qa-076", appliedAt: new Date() },
    });
    // Invoice B — PENDING, same (vendor, invoice#), one valid line → the review screen under test.
    const b = await prisma.ingestedInvoice.create({
      data: { batchId: BATCH, blobUrl: "local://qa-b.pdf", fileName: "qa-076-review.pdf", mimeType: "application/pdf", docType: "invoice", status: "pending", currency: "USD", vendorNameRaw: VENDOR, vendorInvoiceNumber: INVNO, invoiceTotal: 50, extractedJson: ex, createdBy: "qa-076" },
      select: { id: true },
    });
    await prisma.ingestedInvoiceLine.create({
      data: { ingestedInvoiceId: b.id, lineNo: 1, descriptionRaw: "QA-076 Test Additive", qty: 10, unitRaw: "1 kg", unitPrice: 5, lineTotal: 50, matchDecision: "new", resolvedKind: "OTHER", resolvedCategory: "OTHER" },
    });
    console.log(`Seeded QA-076 into Demo Winery. Review URL: /setup/expendables/ingest?batch=${encodeURIComponent(BATCH)}`);
  });
}

async function main() {
  if (process.argv.includes("--clean")) await clean();
  else await seed();
  await prismaBase.$disconnect();
  process.exit(0);
}
main().catch(async (e) => { console.error(e); await prismaBase.$disconnect(); process.exit(1); });
