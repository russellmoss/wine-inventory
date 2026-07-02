import "server-only";
import { PDFDocument, PDFName, PDFBool } from "pdf-lib";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import fieldmap from "./ttb-5120-17-fieldmap.json";
import type { ComputedSnapshot } from "./generate";
import type { FormSection, SparklingSub, WineTaxClass } from "./types";

// Unit 10 — fill the real TTB F 5120.17 AcroForm from a persisted report snapshot, via the committed
// calibrated fieldmap (Unit 9). The PDF renders the ALREADY-ROUNDED gallons from the snapshot and
// NEVER re-rounds (eng-review E3), so the paper can't disagree with the review screen.

const PDF_PATH = join(process.cwd(), "docs/ttb-5120-17/TTB-5120.17-fillable.pdf");

const COL_LETTER: Record<WineTaxClass, string> = {
  A_LE16: "a",
  B_16_21: "b",
  C_21_24: "c",
  D_CARBONATED: "d",
  E_SPARKLING: "e",
  F_HARD_CIDER: "f",
};

const cellKey = (section: FormSection, line: number, column: WineTaxClass, sub: SparklingSub) =>
  `${section}.${line}.${COL_LETTER[column]}${sub ? "." + sub : ""}`;

export type ProfileHeader = {
  ein?: string | null;
  registryNumber?: string | null;
  operatedBy?: string | null;
};

export type FillInput = {
  computed: ComputedSnapshot;
  periodStart: Date;
  periodEnd: Date;
  // The stored cadence; only MONTHLY prints a month. A 5120.17 row is never SEMIMONTHLY, but accept
  // the full enum so callers pass `report.cadence` without narrowing.
  cadence: "MONTHLY" | "QUARTERLY" | "ANNUAL" | "SEMIMONTHLY";
  version: "ORIGINAL" | "AMENDED";
  isFinalBusinessReport: boolean;
  remarks: string;
  profile: ProfileHeader;
};

const fmt = (g: number) => g.toFixed(2);

/** Fill the form and return the PDF bytes. Missing field names are skipped (some form cells are greyed
 * out per column) and reported via the returned `unmappedCells` for diagnostics. */
export async function fillTtbPdf(input: FillInput): Promise<{ bytes: Uint8Array; unmappedCells: string[] }> {
  const doc = await PDFDocument.load(await readFile(PDF_PATH), { ignoreEncryption: true });
  const form = doc.getForm();
  const cells = (fieldmap as { cells: Record<string, string> }).cells;
  const header = (fieldmap as { header: Record<string, string> }).header;
  const unmapped: string[] = [];

  const setText = (fieldName: string | undefined, value: string) => {
    if (!fieldName) return false;
    try {
      form.getTextField(fieldName).setText(value);
      return true;
    } catch {
      return false;
    }
  };

  // Header from the tenant profile + period + version.
  const y = input.periodEnd.getUTCFullYear();
  const month = input.cadence === "MONTHLY" ? String(input.periodEnd.getUTCMonth() + 1) : "";
  setText(header.year, String(y));
  if (month) setText(header.month, month);
  setText(header.ein, input.profile.ein ?? "");
  setText(header.registry, input.profile.registryNumber ?? "");
  setText(header.operatedBy, input.profile.operatedBy ?? "");
  setText(header.remarks, input.remarks ?? "");

  // TTB SMART-FORM mirror fields (info.*): the 5120.17sm ships these with "REQUIRED!" hint text as
  // their default value, cleared by the form's own validation SCRIPT once the real field is filled.
  // pdf-lib can't run that script, so we set/clear the mirror fields ourselves — otherwise the
  // scaffolding hints ("REQUIRED! # EIN 00-0000000") print on the header. Missing names are skipped.
  const versionLabel = input.version + (input.isFinalBusinessReport ? " (FINAL)" : "");
  const smartInfo: Record<string, string> = {
    "info.Year": String(y),
    "info.Month_Quaterly": month,
    "info.Employer_ID": input.profile.ein ?? "",
    "info.Plant_No": input.profile.registryNumber ?? "",
    "info.Operated_By": input.profile.operatedBy ?? "",
    "info.Version": versionLabel,
    "info.Proprietor": "", // signed at filing time, not auto-populated
    "info.Title": "",
    "info.Date": "",
  };
  for (const [name, value] of Object.entries(smartInfo)) setText(name, value);

  // Grid cells (begin / flows / end) from the snapshot.
  for (const c of input.computed.cells) {
    const key = cellKey(c.section, c.line, c.column, c.sub);
    let field = cells[key];
    // Fall back to the single (unsplit) e cell if a BF/BP field isn't mapped for this line.
    if (!field && c.sub) field = cells[`${c.section}.${c.line}.${COL_LETTER[c.column]}`];
    if (!setText(field, fmt(c.gallons))) unmapped.push(key);
  }

  // TOTAL lines from the footings: §A line 12 (add side) / 32 (remove side); §B line 7 / 21.
  for (const f of input.computed.footings) {
    const totalAdd = f.section === "A" ? 12 : 7;
    const totalRemove = f.section === "A" ? 32 : 21;
    const keyAdd = cellKey(f.section, totalAdd, f.column, f.sub);
    const keyRem = cellKey(f.section, totalRemove, f.column, f.sub);
    if (!setText(cells[keyAdd] ?? cells[`${f.section}.${totalAdd}.${COL_LETTER[f.column]}`], fmt(f.addSideTotal))) unmapped.push(keyAdd);
    if (!setText(cells[keyRem] ?? cells[`${f.section}.${totalRemove}.${COL_LETTER[f.column]}`], fmt(f.removeSideTotal))) unmapped.push(keyRem);
  }

  // Let viewers regenerate appearances for the values we set.
  try {
    form.acroForm.dict.set(PDFName.of("NeedAppearances"), PDFBool.True);
  } catch {
    /* best-effort; pypdf already set NeedAppearances on the committed asset */
  }

  const bytes = await doc.save({ updateFieldAppearances: false });
  return { bytes, unmappedCells: unmapped };
}
