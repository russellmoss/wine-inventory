import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";

// Phase 16 Unit 1 — data-minimization guard (D19). The immutable delta (SalesExportEvent) and the
// mutable order projection (Commerce7Order) must carry ONLY opaque ids + amounts + SKU refs — NEVER a
// DTC customer's name/email/phone/address. This test reads Prisma's datamodel so a future column named
// like PII fails here, at the schema, before it can ever be written or logged. Pure, DB-free.

const PII_FIELD = /(^|_)(email|phone|firstname|lastname|fullname|customername|address|street|city|zip|postal)($|_)/i;
// `name` alone is too broken-out to blanket-ban (e.g. orderNumber); ban the customer-PII shapes above.

const PII_FREE_MODELS = ["Commerce7Order", "SalesExportEvent"];

describe("Commerce7 PII data-minimization (D19)", () => {
  for (const modelName of PII_FREE_MODELS) {
    it(`${modelName} has no PII-shaped columns`, () => {
      const model = Prisma.dmmf.datamodel.models.find((m) => m.name === modelName);
      expect(model, `${modelName} exists in the datamodel`).toBeTruthy();
      const offenders = (model?.fields ?? []).map((f) => f.name).filter((n) => PII_FIELD.test(n));
      expect(offenders, `PII-shaped columns on ${modelName}: ${offenders.join(", ") || "(none)"}`).toEqual([]);
    });
  }

  it("only opaque customer id is stored on the order projection", () => {
    const order = Prisma.dmmf.datamodel.models.find((m) => m.name === "Commerce7Order");
    const customerFields = (order?.fields ?? []).map((f) => f.name).filter((n) => /customer/i.test(n));
    // The ONLY customer-referencing column is the opaque id.
    expect(customerFields).toEqual(["commerce7CustomerId"]);
  });
});
