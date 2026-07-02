import "server-only";
import { PDFDocument, PDFName, PDFBool } from "pdf-lib";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import fieldmap from "./ttb-5000-24-fieldmap.json";
import type { ExciseComputed } from "./excise";
import type { ProfileHeader } from "./fill-pdf";

// plan-026 Unit 8 — fill the real TTB F 5000.24sm from a persisted excise return, via the committed
// fieldmap (Unit 7). It renders the ALREADY-COMPUTED dollars from the `computed` snapshot and never
// re-derives (E5), so the paper can't disagree with the review screen / Pay.gov panel.
//
// Wine-only scope: only the wine line (10), its total roll-ups (17/19), the Schedule B CBMA credit
// (→ line 20), and the payment line (21) are filled. Spirits/beer/tobacco lines stay blank/zero.
//
// CBMA placement (combo A — the internally-consistent, form-accurate reading): line 10 = GROSS wine
// tax; the CBMA small-producer credit is a Schedule B decreasing adjustment (col (b) TAX) → line 34 →
// line 20; line 21 (amount to pay) = line 19 − line 20 = the NET tax. See docs/ttb-5000-24/README.md.

const PDF_PATH = join(process.cwd(), "docs/ttb-5000-24/TTB-5000.24-fillable.pdf");

const F = (fieldmap as { fields: Record<string, string> }).fields;
const RADIO = (fieldmap as { radio: Record<string, string> }).radio;
const INFO = (fieldmap as { info: Record<string, string> }).info;
const REQ_CLEAR = (fieldmap as { reqClear: string[] }).reqClear;

const money = (n: number) => n.toFixed(2);
/** MM/DD/YYYY in UTC (the form's US date format). */
const usDate = (d: Date) => `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}/${d.getUTCFullYear()}`;

export type FillExciseInput = {
  computed: ExciseComputed;
  periodStart: Date;
  periodEnd: Date;
  profile: ProfileHeader;
};

/** Fill the 5000.24 and return the PDF bytes. Unknown field names are skipped and reported. */
export async function fillExcisePdf(input: FillExciseInput): Promise<{ bytes: Uint8Array; unmapped: string[] }> {
  const doc = await PDFDocument.load(await readFile(PDF_PATH), { ignoreEncryption: true });
  const form = doc.getForm();
  const unmapped: string[] = [];

  const setText = (name: string | undefined, value: string) => {
    if (!name) return;
    try {
      form.getTextField(name).setText(value);
    } catch {
      unmapped.push(name);
    }
  };

  const { grossTax, cbmaCredit, netTax } = input.computed;

  // Line 10 WINE (gross) + total roll-ups (wine-only → 17 == 10; 18 = 0 increasing; 19 = 17 + 18).
  setText(F.wineTaxLine10, money(grossTax));
  setText(F.totalTaxLiability17, money(grossTax));
  setText(F.adjIncreasing18, money(0));
  setText(F.grossDue19, money(grossTax));

  // Schedule B — the CBMA small-producer credit as a decreasing adjustment (col (a) text, (b) TAX).
  if (cbmaCredit > 0) {
    const gal = Math.round(input.computed.ladder.periodRemovedGal);
    setText(F.schedBExplanation, `CBMA small producer wine tax credit (26 USC 5041(c)) — ${gal.toLocaleString("en-US")} gal removed`);
    setText(F.schedBTaxCredit, money(cbmaCredit));
    setText(F.schedBSubtotalTax, money(cbmaCredit));
    setText(F.schedBTotal34, money(cbmaCredit));
    setText(F.adjDecreasing20, money(cbmaCredit)); // line 20 (from Schedule B line 34)
  } else {
    setText(F.adjDecreasing20, money(0));
  }

  // Line 21 AMOUNT TO BE PAID = line 19 − line 20 = net; mirror into the payment box.
  setText(F.amountToPay21, money(netTax));
  setText(F.paymentAmount, money(netTax));

  // Return period (Return_Covers = PERIOD; Beginning/Ending in MM/DD/YYYY).
  try {
    form.getRadioGroup(RADIO.returnCovers).select(RADIO.returnCoversPeriodOption);
  } catch {
    unmapped.push(RADIO.returnCovers);
  }
  setText(F.beginning, usDate(input.periodStart));
  setText(F.ending, usDate(input.periodEnd));

  // Header from the tenant profile.
  setText(F.employerId, input.profile.ein ?? "");
  setText(F.plantNo, input.profile.registryNumber ?? "");
  setText(F.taxpayerAddress, input.profile.operatedBy ?? "");

  // Clear the "REQUIRED! …" mirror/hint fields the form's own script would clear (pdf-lib can't run it).
  setText(INFO.employerId, input.profile.ein ?? "");
  setText(INFO.plantNo, input.profile.registryNumber ?? "");
  setText(INFO.serialNumber, ""); // serial + date signed at filing time — left blank
  setText(INFO.dateOnForm, "");
  setText(INFO.title, "");
  for (const name of REQ_CLEAR) setText(name, "");

  try {
    form.acroForm.dict.set(PDFName.of("NeedAppearances"), PDFBool.True);
  } catch {
    /* best-effort; pypdf set NeedAppearances on the committed asset */
  }

  const bytes = await doc.save({ updateFieldAppearances: false });
  return { bytes, unmapped };
}
