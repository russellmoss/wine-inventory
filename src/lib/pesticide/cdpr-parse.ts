/**
 * Spray S2 Unit 6 — pure fixed-width parsing of CA DPR's product dump (product.dat / prod_site.dat /
 * site.dat). No I/O, no DB. Offsets live in ONE named table below so a mis-decode is one edit.
 *
 * Decoded empirically 2026-07-26 against the live files (Last-Modified 2026-07-25) and pinned by the
 * two counter-intuitive verified products (Gavel 75DF prodno 61549 → EPA 10163-6414; Fusilade DX
 * prodno 62562 → EPA 100-1070):
 *
 *  - product.dat: PRODNO(0,7) MFG_FIRMNO(7,17) REG_FIRMNO(17,27) LABEL_SEQ(27,32) REVISION(32,34)
 *    FUT_FIRMNO(34,44) PRODSTAT_IND(44,45) PRODUCT_NAME(45,145).
 *  - ⚠️ THE STATUS TRAP (the column plan 086 mis-decoded once): a product's liveness is
 *    PRODSTAT_IND at col 44 — 'A' = active, anything else ('B', …) = inactive. It is NOT the 'A'
 *    in prod_site.dat: the site rows of a product dead since 2004 (Fusilade prodno 30117) still
 *    carry site-status 'A'. Site status must be gated by PRODUCT status, never read alone.
 *  - EPA reg number reconstruction: MFG_FIRMNO-LABEL_SEQ, plus -REG_FIRMNO when the registering
 *    firm differs (distributor products, e.g. 9688-63-8220). A LABEL_SEQ ≥ 50000 is a CA-state-only
 *    registration (adjuvants etc.) — typed as such, deferred to S2b, never called malformed (G4).
 *  - prod_site.dat: PRODNO(0,7) SITE_CODE(7,13) … SITE_STATUS(34,35) — 'A' active, 'I' inactive.
 *    The row also carries inline PHI/REI values ("50D", "12H") — S2b's scope, deliberately ignored.
 *  - site.dat: SITE_CODE(0,7) … NAME(27,79).
 */

export const CDPR_OFFSETS = {
  product: {
    prodno: [0, 7],
    mfgFirm: [7, 17],
    regFirm: [17, 27],
    labelSeq: [27, 32],
    revision: [32, 34],
    prodstat: [44, 45],
    name: [45, 145],
  },
  prodSite: {
    prodno: [0, 7],
    siteCode: [7, 13],
    status: [34, 35],
  },
  site: {
    code: [0, 7],
    name: [27, 77], // the parent site-group code starts at 77
  },
} as const;

/** CDPR grape crop site codes (plan 086, re-verified against site.dat 2026-07-26):
 * 1014 GRAPES (ALL OR UNSPEC) · 1020 GRAPES, VINIFERA · 1021 GRAPE, AMERICAN BUNCH ·
 * 1022 GRAPES, MUSCADINE · 1501 RAISIN (DRIED GRAPE) · 29141 GRAPES (ALL OR UNSPEC) ·
 * 29143 GRAPES, WINE. (2002/29012 GRAPEFRUIT and 34198 GRAPEVINES (ORNAMENTAL) are traps.) */
export const CDPR_GRAPE_SITE_CODES: ReadonlySet<number> = new Set([1014, 1020, 1021, 1022, 1501, 29141, 29143]);

const CA_ONLY_LABEL_SEQ_FLOOR = 50000;

function slice(line: string, [start, end]: readonly [number, number]): string {
  return line.slice(start, end).trim();
}

export type CdprProductLine =
  | {
      ok: true;
      prodno: number;
      isActive: boolean;
      productName: string;
      registration: { kind: "epa"; regNumberRaw: string } | { kind: "ca-state-only" };
    }
  | { ok: false; error: string };

export function parseProductLine(line: string): CdprProductLine {
  const o = CDPR_OFFSETS.product;
  const prodno = Number.parseInt(slice(line, o.prodno), 10);
  const mfgFirm = slice(line, o.mfgFirm);
  const labelSeqRaw = slice(line, o.labelSeq);
  const labelSeq = Number.parseInt(labelSeqRaw, 10);
  const regFirm = slice(line, o.regFirm);
  const prodstat = slice(line, o.prodstat);
  const productName = slice(line, o.name);
  if (!Number.isFinite(prodno) || mfgFirm.length === 0 || !Number.isFinite(labelSeq)) {
    return { ok: false, error: `unparseable product line: ${line.slice(0, 60)}` };
  }
  const registration =
    labelSeq >= CA_ONLY_LABEL_SEQ_FLOOR
      ? ({ kind: "ca-state-only" } as const)
      : ({
          kind: "epa",
          regNumberRaw:
            regFirm.length > 0 && regFirm !== "0" && regFirm !== mfgFirm
              ? `${mfgFirm}-${labelSeqRaw}-${regFirm}`
              : `${mfgFirm}-${labelSeqRaw}`,
        } as const);
  return { ok: true, prodno, isActive: prodstat === "A", productName, registration };
}

export type CdprProdSiteLine =
  | { ok: true; prodno: number; siteCode: number; siteActive: boolean }
  | { ok: false; error: string };

export function parseProdSiteLine(line: string): CdprProdSiteLine {
  const o = CDPR_OFFSETS.prodSite;
  const prodno = Number.parseInt(slice(line, o.prodno), 10);
  const siteCode = Number.parseInt(slice(line, o.siteCode), 10);
  const status = slice(line, o.status);
  if (!Number.isFinite(prodno) || !Number.isFinite(siteCode)) {
    return { ok: false, error: `unparseable prod_site line: ${line.slice(0, 40)}` };
  }
  return { ok: true, prodno, siteCode, siteActive: status === "A" };
}

export type CdprSiteLine = { ok: true; code: number; name: string } | { ok: false; error: string };

export function parseSiteLine(line: string): CdprSiteLine {
  const o = CDPR_OFFSETS.site;
  const code = Number.parseInt(slice(line, o.code), 10);
  const name = slice(line, o.name);
  if (!Number.isFinite(code) || name.length === 0) {
    return { ok: false, error: `unparseable site line: ${line.slice(0, 40)}` };
  }
  return { ok: true, code, name };
}
