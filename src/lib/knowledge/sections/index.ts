// Plan 084 Unit 3 — the section filter seam.
//
// Runs BEFORE extraction (index-documents.ts), on raw HTML, because Defuddle destroys the section
// anchors. Emits ONE filtered document, never one document per section: the pipeline is strictly
// one-document-per-URL and enforces it in three places (normalizeCrawlUrl splits on "#",
// extractLinks drops "#" hrefs, and alias-dedup keys on the raw-byte hash).

import crypto from "node:crypto";
import { PDF_EXTRACT_VERSION } from "../extract/pdf-structure";
import { findSourceConfig } from "../config";
import { splitHtmlSections } from "./split-html-sections";
import { classifySection } from "./classify-section";

/**
 * BUMP THIS whenever a drop pattern in classify-section.ts changes.
 *
 * index-documents.ts short-circuits on `indexedContentHash === contentHash`, and contentHash is the
 * hash of the RAW FETCHED BYTES. Tuning a pattern does not change the bytes, so without this version
 * participating in the stored hash every subsequent crawl returns skipped:"unchanged" and the new
 * rules never take effect. The failure is silent — the crawl reports success and indexes nothing.
 */
// v2 (2026-07-20): added the MAX_CLASSIFIABLE_HEADING prose guard after the live gate caught
//                  EN-159 #1 dropping real fermentation content on an incidental phrase match.
// v4 (2026-07-20): fix-review — bounded comment/script masking (the v3 mask OVER-matched on
//                  malformed markup and silently swallowed sections) + two-pass number strip (v3
//                  broke case-insensitive arabic and could strip a bare separator).
// v3 (2026-07-20): review fixes — monotonic slice starts (two anchors sharing a block produced a
//                  zero-length slice and silently deleted the KEPT section's content), comment /
//                  script masking, and a well-formed Roman numeral strip ("Civil. Engineering" was
//                  normalizing to "Engineering"). All three change what gets indexed.
export const SECTION_FILTER_VERSION = "4";

export interface DroppedSection {
  anchor: string;
  heading: string;
  reason: string;
}

export interface SectionFilterResult {
  /** Filtered HTML to extract from, or null when sections were found and ALL were dropped. */
  html: string | null;
  /**
   * True when the page carried no section anchors at all (T1-era, issues #1-40, ~24% of the VT
   * corpus). The page is passed through WHOLE and unfiltered. Treating it as empty would silently
   * drop a quarter of the archive while the crawl still reported success.
   */
  failedOpen: boolean;
  keptAnchors: string[];
  dropped: DroppedSection[];
}

/**
 * Should the section filter run for this document? Pure so the three conditions are testable —
 * they were previously inline in indexDocument, which is DB-bound and has no unit coverage.
 *
 * The `html` gate is load-bearing: VT seeds 7 PDF-only notes, and PDFs carry no anchors. Without
 * it, PDF bytes would be coerced through toString("utf8"), find nothing, and fail open — masking
 * the mistake instead of surfacing it.
 */
export function shouldApplySectionFilter(contentType: string, sourceKey?: string): boolean {
  if (contentType !== "html" || !sourceKey) return false;
  return findSourceConfig(sourceKey)?.sectionFilter === "anchor-heading";
}

export function applySectionFilter(rawHtml: string): SectionFilterResult {
  const { sections } = splitHtmlSections(rawHtml);

  if (sections.length === 0) {
    return { html: rawHtml, failedOpen: true, keptAnchors: [], dropped: [] };
  }

  const kept: string[] = [];
  const dropped: DroppedSection[] = [];
  const keptHtml: string[] = [];

  for (const s of sections) {
    const verdict = classifySection(s.headingText);
    if (verdict.keep) {
      kept.push(s.anchor);
      keptHtml.push(s.html);
    } else {
      dropped.push({ anchor: s.anchor, heading: s.headingText, reason: verdict.reason });
    }
  }

  if (keptHtml.length === 0) {
    return { html: null, failedOpen: false, keptAnchors: [], dropped };
  }

  // Synthesized body. Verified in the spike across 14 issues: 136/136 prose windows survive
  // verbatim, lowConfidence never trips, and the length lost versus the original is left-nav soup
  // (27 of 28 diff lines on EN-130), not content.
  const html = `<!doctype html><html><body><article>${keptHtml.join("\n")}</article></body></html>`;
  return { html, failedOpen: false, keptAnchors: kept, dropped };
}

/**
 * The value stored in KnowledgeDocument.indexedContentHash. Folds in the filter version so that
 * changing a drop pattern actually forces a re-index. KnowledgeBlob.contentHash (byte-level dedup,
 * written by the crawler) is deliberately NOT affected — only the index idempotency basis moves.
 */
export function deriveIndexHash(contentHash: string, filterApplied: boolean, isPdf = false): string {
  const parts: string[] = [];
  if (filterApplied) parts.push(`sf:${SECTION_FILTER_VERSION}`);
  // Plan 090 Unit 8 — PDFs get their own version component. Section filtering is HTML-only, so before
  // this a PDF's index hash was the bare content hash and NO extractor improvement could ever force a
  // re-index of unchanged bytes. See PDF_EXTRACT_VERSION for the full note.
  if (isPdf) parts.push(`pdf:${PDF_EXTRACT_VERSION}`);
  // No version component applies => the bare content hash, byte-identical to pre-plan-090 behaviour, so
  // HTML documents are not needlessly re-indexed by this change.
  if (parts.length === 0) return contentHash;
  return crypto.createHash("sha256").update([contentHash, ...parts].join("|")).digest("hex");
}

export { splitHtmlSections } from "./split-html-sections";
export { classifySection, normalizeHeading } from "./classify-section";
