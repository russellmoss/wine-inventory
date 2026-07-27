// SKB Unit 2(b) — the pure arithmetic behind `verify:kb-boundary`.
//
// Split out from the script so the grouping, the enforcing-set logic, and above all the EXIT CODE are
// unit-tested against injected rows rather than against whatever the live corpus happens to hold.
// A verify script whose pass/fail arithmetic has no test is a script that can quietly start passing.

import type { BoundaryVerdict } from "./product-table-core";
import { boundaryModeFor, type BoundaryMode } from "./enforcing";

/** One audited document. `unaudited` = we could not re-read its raw bytes, so we know nothing. */
export type AuditVerdict = BoundaryVerdict | "unaudited";

export interface AuditRow {
  documentId: string;
  sourceKey: string;
  canonicalUrl: string;
  verdict: AuditVerdict;
}

export interface SourceTally {
  sourceKey: string;
  mode: BoundaryMode;
  total: number;
  productTable: number;
  uncertain: number;
  prose: number;
  /** Documents whose raw bytes could not be re-read. Reported, never silently folded into `prose`. */
  unaudited: number;
}

export interface BoundaryAuditSummary {
  perSource: SourceTally[];
  /**
   * Documents on an ENFORCING source that the detector flags. After the inline gate ships this should
   * be structurally impossible, so a non-empty list means the gate LEAKED — which is exactly what an
   * auditor is for. It is not a duplicate of the gate; it is the check that the gate is real.
   */
  enforcingHits: AuditRow[];
  /** Enforcing-source documents we could not re-read. Non-fatal, but the audit cannot vouch for them. */
  enforcingUnaudited: AuditRow[];
  /** The number D3's close-out decides against: flagged documents across the report-only census. */
  reportOnlyFlagged: number;
  exitCode: 0 | 1;
}

const FLAGGED: AuditVerdict[] = ["product-table", "uncertain"];

export function summarizeBoundaryAudit(rows: AuditRow[]): BoundaryAuditSummary {
  const bySource = new Map<string, SourceTally>();
  const enforcingHits: AuditRow[] = [];
  const enforcingUnaudited: AuditRow[] = [];
  let reportOnlyFlagged = 0;

  for (const row of rows) {
    const mode = boundaryModeFor(row.sourceKey);
    let t = bySource.get(row.sourceKey);
    if (!t) {
      t = { sourceKey: row.sourceKey, mode, total: 0, productTable: 0, uncertain: 0, prose: 0, unaudited: 0 };
      bySource.set(row.sourceKey, t);
    }
    t.total++;
    if (row.verdict === "product-table") t.productTable++;
    else if (row.verdict === "uncertain") t.uncertain++;
    else if (row.verdict === "unaudited") t.unaudited++;
    else t.prose++;

    if (mode === "enforce") {
      if (FLAGGED.includes(row.verdict)) enforcingHits.push(row);
      else if (row.verdict === "unaudited") enforcingUnaudited.push(row);
    } else if (FLAGGED.includes(row.verdict)) {
      reportOnlyFlagged++;
    }
  }

  return {
    perSource: [...bySource.values()].sort((a, b) => a.sourceKey.localeCompare(b.sourceKey)),
    enforcingHits,
    enforcingUnaudited,
    reportOnlyFlagged,
    // ONLY an enforcing-source hit fails. A report-only count is the measurement D3 exists to take,
    // and failing on it would make the measurement impossible to take at all. An enforcing-source
    // document we could not re-read is loud but not fatal: a transient blob fetch failure must not
    // red the build, and the count is printed so a persistent one is visible.
    exitCode: enforcingHits.length > 0 ? 1 : 0,
  };
}
