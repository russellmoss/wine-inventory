// Plan 084 Unit 3 — the section filter seam.
//
// Runs BEFORE extraction (index-documents.ts), on raw HTML, because Defuddle destroys the section
// anchors. Emits ONE filtered document, never one document per section: the pipeline is strictly
// one-document-per-URL and enforces it in three places (normalizeCrawlUrl splits on "#",
// extractLinks drops "#" hrefs, and alias-dedup keys on the raw-byte hash).

import crypto from "node:crypto";
import { PDF_EXTRACT_VERSION } from "../extract/pdf-structure";
import { CHUNKER_VERSION } from "../chunk";
import { findSourceConfig } from "../config";
import { splitHtmlSections } from "./split-html-sections";
import { splitPnwSections, isProductSection, stripProductBlocks, stripRateShapedBlocks } from "./split-pnw-sections";
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
  return resolveSectionFilter(contentType, sourceKey) !== null;
}

/** The strategies a source may declare. */
export type SectionFilterStrategy = "anchor-heading" | "pnw-label";

/**
 * BUMP THIS when the PNW splitter or its product-section rule changes what gets indexed.
 * Versioned SEPARATELY from SECTION_FILTER_VERSION so a change to one strategy does not force a
 * re-index of every document filtered by the other.
 */
export const PNW_FILTER_VERSION = "1";

export interface SectionFilterResolution {
  strategy: SectionFilterStrategy;
  version: string;
}

/**
 * Plan 100 Unit 1b — resolve WHICH filter strategy applies, not merely whether one does.
 *
 * A boolean cannot distinguish two strategies, so a source switching from one to another would
 * produce the same index hash and wrongly short-circuit as "unchanged" — silently keeping the old
 * strategy's chunks live forever. Returning the resolution (and folding it into the hash) is what
 * makes a strategy change actually take effect.
 *
 * The `html` gate is load-bearing: VT seeds 7 PDF-only notes, and PDFs carry no anchors. Without it,
 * PDF bytes would be coerced through toString("utf8"), find nothing, and fail open — masking the
 * mistake instead of surfacing it.
 */
export function resolveSectionFilter(
  contentType: string,
  sourceKey?: string,
): SectionFilterResolution | null {
  if (contentType !== "html" || !sourceKey) return null;
  const strategy = findSourceConfig(sourceKey)?.sectionFilter;
  if (strategy === "anchor-heading") return { strategy, version: SECTION_FILTER_VERSION };
  if (strategy === "pnw-label") return { strategy, version: PNW_FILTER_VERSION };
  return null;
}

/**
 * Plan 100 Unit 7 — dispatch on the resolved strategy.
 *
 * `strategy` defaults to "anchor-heading" so every pre-plan-100 caller (and the VT verify script,
 * which calls this directly) behaves byte-identically.
 */
export function applySectionFilter(
  rawHtml: string,
  strategy: SectionFilterStrategy = "anchor-heading",
): SectionFilterResult {
  return strategy === "pnw-label" ? applyPnwFilter(rawHtml) : applyAnchorHeadingFilter(rawHtml);
}

/**
 * The PNW filter. Unlike the anchor-heading strategy this does NOT drop whole sections — it keeps
 * every section and strips the product BLOCKS out of the management ones. See split-pnw-sections.ts
 * for why the cut has to be at block level (the FRAC resistance-management prose lives inside
 * `Chemical control`, above the product bullets, and is the best content on the page).
 */
function applyPnwFilter(rawHtml: string): SectionFilterResult {
  const { sections } = splitPnwSections(rawHtml);

  // Fail OPEN on an unrecognized template. Returning null here would clear the document's chunks.
  if (sections.length === 0) {
    return { html: rawHtml, failedOpen: true, keptAnchors: [], dropped: [] };
  }

  const kept: string[] = [];
  const dropped: DroppedSection[] = [];
  const keptHtml: string[] = [];

  for (const s of sections) {
    // Two rules, and the second is the one that actually holds the line.
    //
    //   label-based  — a section CALLED "Chemical control" loses all of its lists and tables.
    //   content-based — any rate-shaped list or table loses itself, wherever it sits.
    //
    // The content rule exists because the fixtures showed a `Chemical control` section is itself
    // subdivided by seasonal lead-ins ("Dormant season", "Summer") and by `Note` /
    // `Combination Fungicides`, each opening a new section whose label says nothing about products
    // while its bullets are still rate tables. Enumerating every sub-heading a land-grant editor
    // might write is not a strategy; reading the blocks is.
    const prose = isProductSection(s.label)
      ? stripProductBlocks(s.html)
      : stripRateShapedBlocks(s.html);

    keptHtml.push(prose);
    kept.push(prose.length < s.html.length ? `${s.label} (prose only)` : s.label);
    // Recorded as a drop so the crawl log and the verify script can SEE the tier-C removal happen.
    // A silent strip is indistinguishable from a splitter that quietly stopped matching.
    if (prose.length < s.html.length) {
      dropped.push({
        anchor: s.label,
        heading: s.label,
        reason: `product blocks stripped (${s.html.length - prose.length} bytes)`,
      });
    }
  }

  const html = `<!doctype html><html><body><article>${keptHtml.join("\n")}</article></body></html>`;
  return { html, failedOpen: false, keptAnchors: kept, dropped };
}

function applyAnchorHeadingFilter(rawHtml: string): SectionFilterResult {
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

export interface IndexHashInput {
  /**
   * Hash of the RAW FETCHED BYTES. Never of filtered or extracted output.
   *
   * Plan 100 Unit 1b, and this is the part that is easy to get wrong. Once the section filter runs
   * before the boundary gate (PR C), it is tempting to fingerprint what survives filtering, since
   * that is what actually gets indexed. Doing so makes every change inside a DROPPED section
   * invisible: the filtered projection is unchanged, the hash matches, the crawl reports
   * "unchanged", and the document is frozen. The damage surfaces later and silently, the moment a
   * drop rule loosens and that stale content becomes admissible.
   *
   * Filtering decides what we INDEX. It must never decide what we consider CHANGED.
   */
  rawContentHash: string;
  isPdf?: boolean;
  /** Which section-filter strategy applied, or null. Not a boolean — see resolveSectionFilter. */
  filter?: SectionFilterResolution | null;
  /** Defaults to the current CHUNKER_VERSION; injectable so tests can pin a value. */
  chunkerVersion?: string;
}

/**
 * The value stored in KnowledgeDocument.indexedContentHash — the idempotency basis, and the only
 * thing standing between a shipped pipeline fix and a corpus that silently never receives it.
 *
 * Payload: rawContentHash + pdf version + chunker version + filter strategy AND its version.
 * KnowledgeBlob.contentHash (byte-level dedup, written by the crawler) is deliberately NOT affected.
 *
 * Strategy and version are folded in SEPARATELY on purpose. A single global filter version would
 * mean any one strategy's bump re-indexes every filtered document in the corpus, and — worse — two
 * strategies at the same version number would collide, so a source switching between them would
 * short-circuit as "unchanged" and keep the old strategy's chunks forever.
 */
export function deriveIndexHash(input: IndexHashInput): string {
  const parts: string[] = [];
  if (input.filter) parts.push(`sf:${input.filter.strategy}:${input.filter.version}`);
  // Plan 090 Unit 8 — PDFs get their own version component. Section filtering is HTML-only, so before
  // this a PDF's index hash was the bare content hash and NO extractor improvement could ever force a
  // re-index of unchanged bytes. See PDF_EXTRACT_VERSION for the full note.
  if (input.isPdf) parts.push(`pdf:${PDF_EXTRACT_VERSION}`);
  // Plan 100 Unit 1b — unconditional, unlike the two above. EVERY document is chunked, so a chunker
  // fix must be able to reach every document; gating this on some other condition is exactly how the
  // v1 text-loss bug would have survived its own fix.
  parts.push(`ck:${input.chunkerVersion ?? CHUNKER_VERSION}`);
  return crypto.createHash("sha256").update([input.rawContentHash, ...parts].join("|")).digest("hex");
}

export { splitHtmlSections } from "./split-html-sections";
export { splitPnwSections, isProductSection, stripProductBlocks, stripRateShapedBlocks } from "./split-pnw-sections";
export { classifySection, normalizeHeading } from "./classify-section";
