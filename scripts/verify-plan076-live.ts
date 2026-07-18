/**
 * Plan 076 — LIVE QBO sandbox capstone for the two paths the offline mock covered: a MULTI-LINE aggregate
 * invoice Bill, and a BillPayment that settles it. Posts REAL objects to the connected sandbox company (Demo
 * Winery, never Bhutan), reads them back, and PRINTS the identifiers so you can verify them in QuickBooks.
 *
 *   npm run verify:plan076-live
 *
 * It LEAVES the Bill + BillPayment in the sandbox on purpose (so you can inspect them) and cleans up only the
 * local rows. Re-run to post a fresh pair. Home-currency (USD) — no Multicurrency prerequisite.
 */
import { prisma, prismaBase } from "@/lib/prisma";
import { runAsTenant } from "@/lib/tenant/context";
import { runInTenantTx } from "@/lib/tenant/tx";
import { runAccountingPostSweep } from "@/lib/accounting/post-sweep";
import { getValidAccessToken } from "@/lib/accounting/token";
import { QboClient, QboAdapter, docNumberFor } from "@/lib/accounting/qbo/client";

const TENANT = "org_demo_winery";
let passed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
  passed++;
}

async function pickAccount(connId: string, realmId: string, prefTypes: string[]): Promise<string | null> {
  const token = await getValidAccessToken(connId);
  const accounts = await new QboAdapter().listAccounts({ accessToken: token, realmId, environment: "sandbox" });
  for (const t of prefTypes) {
    const hit = accounts.find((a) => a.type === t);
    if (hit) return hit.accountKey;
  }
  return null;
}

async function main() {
  await runAsTenant(TENANT, async () => {
    const conn = await prisma.accountingConnection.findFirst({
      where: { provider: "QBO", status: "CONNECTED" },
      select: { id: true, companyName: true, externalRealmId: true, homeCurrency: true },
    });
    if (!conn || !conn.externalRealmId) {
      console.log("• Demo Winery has no CONNECTED QuickBooks company — connect the SANDBOX in Settings first, then re-run.");
      return;
    }
    console.log(`Connected to sandbox company "${conn.companyName ?? conn.externalRealmId}" (realm ${conn.externalRealmId}).`);

    const inventoryAccount = await pickAccount(conn.id, conn.externalRealmId, ["Other Current Asset", "Fixed Asset"]);
    const bankAccount = await pickAccount(conn.id, conn.externalRealmId, ["Bank"]);
    if (!inventoryAccount) { console.log("• No asset account in the sandbox chart of accounts — can't post a bill. Skipping."); return; }

    // Preserve + set the pay-from card account to something that ISN'T the bank account, so the poster classifies
    // this payment as a Check (bank). Restored in the finally.
    const savedSettings = await prisma.appSettings.findFirst({ select: { id: true, apPaymentCardAccount: true, apPaymentBankAccount: true } });

    const ts = Date.now();
    const invoiceNo = `QA076-INV-${ts}`;
    const fakeInvoiceId = `qa076-inv-${ts}`; // stands in for an IngestedInvoice id (keys apinv:<id>)
    const postingKey = `apinv:${fakeInvoiceId}`;
    const vendorName = `QA076 Vendor ${ts}`;
    const line1 = 307.79, line2 = 78.0, total = line1 + line2; // a 2-line invoice → a 2-line QBO Bill

    let vendorId = "";
    let delId = "";
    try {
      // 1) seed the aggregate PAID bill event + PENDING delivery (exactly what applyIngestedInvoiceCore emits).
      const seeded = await runInTenantTx(async (tx) => {
        if (savedSettings?.id) await tx.appSettings.update({ where: { id: savedSettings.id }, data: { apPaymentBankAccount: bankAccount ?? savedSettings.apPaymentBankAccount, apPaymentCardAccount: "QA076-NOT-A-REAL-CARD" } });
        const vendor = await tx.vendor.create({ data: { name: vendorName, currency: "USD" }, select: { id: true } });
        const ev = await tx.apExportEvent.create({
          data: {
            postingKey, ingestedInvoiceId: fakeInvoiceId, amount: total, currency: "USD",
            debitAccount: inventoryAccount, creditAccount: inventoryAccount, receivedAt: new Date(), vendorId: vendor.id,
            vendorInvoiceNumber: invoiceNo,
            billLinesJson: [
              { debitAccount: inventoryAccount, amount: line1, description: `QA076 Yeast EC1118` },
              { debitAccount: inventoryAccount, amount: line2, description: `QA076 Bentonite` },
            ],
            ...(bankAccount ? { paymentStatus: "PAID" as const, paidFromAccount: bankAccount, paidAt: new Date() } : {}),
          },
          select: { id: true },
        });
        const d = await tx.accountingDelivery.create({ data: { apExportEventId: ev.id, connectionId: conn.id, objectType: "Bill", status: "PENDING" }, select: { id: true } });
        return { vendorId: vendor.id, delId: d.id };
      });
      vendorId = seeded.vendorId;
      delId = seeded.delId;

      // 2) post to the sandbox — the Bill first, then the BillPayment pass (same sweep).
      console.log("\n── posting to the QBO sandbox ──");
      const sweep = await runAccountingPostSweep({ orgIds: [TENANT] });
      const del = await prisma.accountingDelivery.findUnique({ where: { id: delId }, select: { status: true, externalId: true } });
      assert(del?.status === "POSTED" && !!del.externalId, `multi-line Bill POSTED (externalId ${del?.externalId})`);
      const ev = await prisma.apExportEvent.findFirst({ where: { postingKey }, select: { paymentExternalId: true } });

      // 3) read the Bill back + assert the multi-line shape.
      const token = await getValidAccessToken(conn.id);
      const ctx = { accessToken: token, realmId: conn.externalRealmId!, environment: "sandbox" as const };
      const client = new QboClient();
      const billDoc = docNumberFor(postingKey);
      const br = await client.query<{ Bill?: Array<{ Id: string; DocNumber?: string; TotalAmt?: number; Balance?: number; PrivateNote?: string; Line?: Array<{ Amount?: number; Description?: string }> }> }>(
        ctx, `SELECT * FROM Bill WHERE Id = '${(del!.externalId as string).replace(/'/g, "''")}'`,
      );
      const bill = br.Bill?.[0];
      const billLines = (bill?.Line ?? []).filter((l) => typeof l.Amount === "number");
      assert(billLines.length === 2, `read-back: the Bill has 2 lines (got ${billLines.length})`);
      assert(Math.abs(Number(bill?.TotalAmt) - total) < 0.01, `read-back: Bill TotalAmt == ${total.toFixed(2)} (got ${bill?.TotalAmt})`);
      assert(typeof bill?.PrivateNote === "string" && bill!.PrivateNote.includes(invoiceNo), `read-back: Bill memo carries the invoice # ${invoiceNo}`);

      let paymentExternalId: string | null = ev?.paymentExternalId ?? null;
      let billBalance = Number(bill?.Balance ?? -1);
      if (bankAccount) {
        assert(!!paymentExternalId, `BillPayment recorded (externalId ${paymentExternalId})`);
        assert(sweep.billPaymentsPosted >= 1, `sweep reports a BillPayment posted (${sweep.billPaymentsPosted})`);
        // read the bill balance again — a recorded payment zeroes it.
        const br2 = await client.query<{ Bill?: Array<{ Balance?: number }> }>(ctx, `SELECT Balance FROM Bill WHERE Id = '${(del!.externalId as string).replace(/'/g, "''")}'`);
        billBalance = Number(br2.Bill?.[0]?.Balance ?? -1);
        assert(billBalance === 0, `read-back: the Bill's Balance is 0 after the payment (got ${billBalance})`);
      } else {
        console.log("• No Bank-type account in the sandbox — posted the Bill as OUTSTANDING only (no BillPayment). Add a bank account to also exercise the payment.");
      }

      // 4) print the identifiers to verify in QuickBooks.
      console.log("\n════════ VERIFY THESE IN THE QBO SANDBOX ════════");
      console.log(`Company / realm        : ${conn.companyName ?? ""} (${conn.externalRealmId})`);
      console.log(`Vendor                 : ${vendorName}`);
      console.log(`Supplier invoice #     : ${invoiceNo}   (shown in the Bill's memo / PrivateNote)`);
      console.log(`Bill QBO Id            : ${del?.externalId}`);
      console.log(`Bill DocNumber         : ${billDoc}`);
      console.log(`Bill lines             : 2  ($${line1.toFixed(2)} + $${line2.toFixed(2)} = $${total.toFixed(2)})`);
      console.log(`Bill Balance now       : ${billBalance === -1 ? "?" : `$${billBalance.toFixed(2)}`}${bankAccount ? "  (0 = paid)" : "  (full = outstanding)"}`);
      if (bankAccount) {
        console.log(`BillPayment QBO Id      : ${paymentExternalId}`);
        console.log(`BillPayment DocNumber   : ${docNumberFor(`pay:${fakeInvoiceId}`)}`);
        console.log(`Paid from account (Id)  : ${bankAccount}  (a Check/bank payment)`);
      }
      console.log("═════════════════════════════════════════════════");
      console.log(`\nALL ${passed} LIVE ASSERTIONS PASSED (sandbox). The Bill + BillPayment are LEFT in QuickBooks for you to inspect.`);
    } finally {
      // clean up LOCAL rows only (leave the QBO objects for inspection) + restore settings.
      if (delId) await prisma.accountingDelivery.delete({ where: { id: delId } }).catch(() => {});
      await prisma.apExportEvent.deleteMany({ where: { postingKey } }).catch(() => {});
      if (vendorId) await prisma.vendor.delete({ where: { id: vendorId } }).catch(() => {});
      if (savedSettings?.id) await prisma.appSettings.update({ where: { id: savedSettings.id }, data: { apPaymentCardAccount: savedSettings.apPaymentCardAccount, apPaymentBankAccount: savedSettings.apPaymentBankAccount } }).catch(() => {});
    }
  });
  await prismaBase.$disconnect();
  process.exit(0);
}

main().catch(async (e) => {
  console.error(e);
  await prismaBase.$disconnect();
  process.exit(1);
});
