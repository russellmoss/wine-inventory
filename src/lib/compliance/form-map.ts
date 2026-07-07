// Unit 5 — the deterministic operation→form-line map. Pure, footnote-aware. This is the SINGLE
// authority for "which §A/§B line + column does this movement hit" (eng-review E4/E5), including
// the RemovalDisposition→line taxonomy. No DB, no @prisma/client — validated in Phase 0.
//
// Encodes the full Part I §A (1–31) / §B (1–20) taxonomy from docs/ttb-5120-17, with the footnote
// rules folded in:
//   • ftn 3 — §A line 13 (bulk bottled-out) == §B line 2 (bottled-in): the fold posts both from one
//     BOTTLE op (source BULK → A13; source BOTTLED → B2), same volume, so A13 total == B2 total.
//   • ftn 5 — BLEND hits line 5/20 ONLY when it crosses tax classes (else internal → null).
//   • ftn 2/3 — sparkling BF/BP is a render-time sub-row (carried through, not a separate line).
//   • ftn 4 — shortages/losses/class-changes emit a `partXReason` so the human writes Part X.
//   • C2 — CRUSH is NOT wine (→ null); "produced by fermentation" (A2) fires on the MUST/JUICE→WINE
//     transition, modeled by the pseudo op FERMENT_TO_WINE the fold synthesizes.

import type { OperationType } from "@/lib/ledger/vocabulary";
import {
  REMOVAL_DISPOSITIONS,
  type FormLine,
  type RemovalDisposition,
  type SparklingSub,
  type WineTaxClass,
} from "./types";

/**
 * Pseudo op-types the period fold synthesizes for events that are NOT a single ledger line:
 *   FERMENT_TO_WINE — a lot's MUST/JUICE→WINE transition (A2, C2), volume = lot volume at transition.
 * (Inventory gain/loss reconciliation A9/A30/B19 is posted by the fold arithmetic directly, not here.)
 */
export type ReportableOpType = OperationType | "FERMENT_TO_WINE";

/** Where the wine physically sat — decides §A vs §B (S5: section from bucket, not disposition). */
export type MovementSource = "BULK" | "BOTTLED";

/** A normalized reportable movement the fold feeds to the map. */
export type MovementInput = {
  opType: ReportableOpType;
  /** The ledger line's `reason` (e.g. "bottle", "loss", or a RemovalDisposition string), or null. */
  reason: string | null;
  /** Vessel-backed wine = BULK (§A); bottled-lot / finished-goods wine = BOTTLED (§B). */
  source: MovementSource;
  /** +1 = wine enters this section's bond; −1 = leaves. (A CORRECTION's inverse leg flips the sign.) */
  deltaSign: 1 | -1;
  taxClass: WineTaxClass;
  sparklingSub: SparklingSub;
  /** BLEND only: true when the blend mixes wines of different tax classes (ftn 5). */
  crossesTaxClass?: boolean;
};

export type FormMapResult = {
  /** The target cell, or null for a non-reportable (internal, in-bond) movement. */
  target: FormLine | null;
  /** Set when the movement needs a Part X explanation (shortage / loss / class-change). */
  partXReason: string | null;
};

const A = (line: number, sub: SparklingSub = null): FormLine => ({ section: "A", line, sub });
const B = (line: number, sub: SparklingSub = null): FormLine => ({ section: "B", line, sub });
const none = (partXReason: string | null = null): FormMapResult => ({ target: null, partXReason });

/** Disposition → { §A line, §B line } (one may be absent). Section chosen from `source` (S5). */
const DISPOSITION_LINES: Record<RemovalDisposition, { A?: number; B?: number }> = {
  TAXPAID: { A: 14, B: 8 },
  TESTING: { A: 23, B: 14 },
  EXPORT: { B: 12 },
  FAMILY_USE: { B: 13 },
  TASTING: { B: 11 },
  DISTILLING_MATERIAL: { A: 16 },
  VINEGAR: { A: 17 },
  SWEETENING: { A: 18 },
  SPIRITS: { A: 19 },
  AMELIORATION: { A: 21 },
  EFFERVESCENT: { A: 22 },
};

const isDisposition = (r: string | null): r is RemovalDisposition =>
  r != null && (REMOVAL_DISPOSITIONS as readonly string[]).includes(r);

/** Reasons that represent wine physically lost (not inventory-book) — A29 bulk / B18 bottled breakage. */
const LOSS_REASONS = new Set(["loss", "dump", "filtration", "evaporation"]);

/**
 * Map one normalized movement to its form cell. Returns `{ target: null }` for internal, in-bond
 * moves (rack, topping, fining, cap-mgmt, riddling, crush-origination) that don't touch the summary.
 */
export function mapLineToForm(m: MovementInput): FormMapResult {
  const sub = m.taxClass === "E_SPARKLING" ? m.sparklingSub : null;

  switch (m.opType) {
    // Produced by fermentation (A2) — the MUST/JUICE→WINE transition (C2), never CRUSH.
    case "FERMENT_TO_WINE":
      return { target: A(2, sub), partXReason: null };

    // CRUSH originates MUST/JUICE, which is NOT bulk wine (§A) — it's Part IV/VII (stubbed in v1).
    case "CRUSH":
    case "SAIGNEE":
      return none();

    // Bottling: bulk-out → A13 (§A), bottle-in → B2 (§B). Same volume ⇒ A13 total == B2 total (ftn3).
    case "BOTTLE":
      return { target: m.source === "BULK" ? A(13, sub) : B(2, sub), partXReason: null };

    // Tax determination + all removal/used-for dispositions. Section from `source` (S5).
    case "REMOVE_TAXPAID": {
      if (!isDisposition(m.reason)) {
        return none("A tax-removal has no recognized disposition — classify it in Part X.");
      }
      const lines = DISPOSITION_LINES[m.reason];
      const line = m.source === "BULK" ? lines.A : lines.B;
      if (line == null) {
        return none(
          `A "${m.reason}" removal was recorded against ${m.source.toLowerCase()} wine, which the form has no line for — explain in Part X.`,
        );
      }
      return { target: m.source === "BULK" ? A(line, sub) : B(line, sub), partXReason: null };
    }

    // In-bond transfer (BOND-1): symmetric per bond. The RECEIVED leg (+) posts §A7 (bulk) / §B3
    // (bottled) on the DEST bond; the REMOVED leg (−) posts §A15 / §B9 on the SOURCE bond. The fold
    // runs per-bond (C6) and feeds only the leg whose bond matches the report being folded, so each
    // side hits exactly one report — the symmetric removed/received pair BOND-1 requires.
    case "TRANSFER_IN_BOND":
      return m.deltaSign > 0
        ? { target: m.source === "BULK" ? A(7, sub) : B(3, sub), partXReason: null }
        : { target: m.source === "BULK" ? A(15, sub) : B(9, sub), partXReason: null };

    // Return-to-bond (TAXPAID-1): the ONLY re-admission past the REMOVE_TAXPAID terminal state. The
    // refund-flagged +V re-admission posts §A11 "taxpaid wine returned to bulk" (bulk) / §B4 "taxpaid
    // wine returned to bond" (bottled) — an ADDITION, so the returned volume re-enters the column.
    case "RETURN_TO_BOND":
      return { target: m.source === "BULK" ? A(11, sub) : B(4, sub), partXReason: null };

    // Blending: internal unless it crosses tax classes (ftn 5). Cross-class posts A5 (produced, into
    // the child class) / A20 (used for, out of each parent class) so the columns still foot, AND
    // flags an anomaly for human review (R8 — never a silent cross-class post).
    case "BLEND": {
      if (!m.crossesTaxClass) return none();
      const partX = "Cross-class blend — verify the produced/used-for gallons in Part X.";
      return m.deltaSign > 0 ? { target: A(5, sub), partXReason: partX } : { target: A(20, sub), partXReason: partX };
    }

    // Standalone volume loss. Bulk → A29 (losses other than inventory); bottled → B18 (breakage).
    case "LOSS":
      return m.source === "BULK"
        ? { target: A(29), partXReason: "Bulk wine loss — explain in Part X if unusual." }
        : { target: B(18), partXReason: "Bottled breakage — explain in Part X if unusual." };

    default:
      break;
  }

  // A loss-tagged external leg on any other op (e.g. a rack/press lees loss, filtration loss).
  if (LOSS_REASONS.has(m.reason ?? "")) {
    return m.source === "BULK" ? { target: A(29), partXReason: null } : { target: B(18), partXReason: null };
  }

  // Everything else (RACK/TOPPING/FINING/FILTRATION-neutral/CAP_MGMT/ADDITION/RIDDLING/DOSAGE/…):
  // internal, in-bond, net-neutral within the section → no summary line.
  return none();
}
