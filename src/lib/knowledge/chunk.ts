// Plan 079 — structure-aware chunking. Splits extracted markdown on its heading hierarchy into sections,
// packs each section's paragraphs/tables into ~512-token chunks (never splitting a markdown table — the
// council's dose-table safety rule), prepends the section breadcrumb to each chunk (so a chunk carries its
// context into the embedding), and carries a small sentence overlap between consecutive chunks of a
// section. Deterministic, pure, unit-testable. Token counts are estimated (chars/4) — good enough for
// sizing; exact tokenization isn't needed here.

export interface Chunk {
  ordinal: number;
  sectionPath: string;
  text: string; // breadcrumb + body — exactly what gets embedded AND stored
  tokenCount: number;
}

const TARGET_TOKENS = 512;
const MAX_TOKENS = 700; // a single block bigger than this is force-split (prose) or kept whole (table)
const OVERLAP_TOKENS = 75; // ~15%

/**
 * Plan 090 Unit 4 — hard ceiling on a breadcrumb, enforced HERE rather than only at the extractors.
 *
 * The breadcrumb is prepended into every chunk's `text` (see `emit` below), which is embedded AND backs
 * the GENERATED `search_vector`. When extractPdf fed this function headingless text, the stack never
 * pushed and the breadcrumb collapsed to `rootTitle` — 192 characters of page one on average, repeated
 * across every chunk of the document, so a query matching that slab matched all of them equally.
 *
 * extract/pdf.ts now caps its own title, but a cap that lives only in one caller is one new extractor
 * away from regressing. 140 sits above the 96-character average of a real HTML breadcrumb in this
 * corpus and well below the 192 that caused the problem. Truncation is on a word boundary with an
 * ellipsis so a clipped breadcrumb reads as clipped rather than as a mangled sentence.
 */
const MAX_BREADCRUMB_CHARS = 140;

export function capBreadcrumb(crumb: string): string {
  const s = crumb.trim().replace(/\s+/g, " ");
  if (s.length <= MAX_BREADCRUMB_CHARS) return s;
  const cut = s.slice(0, MAX_BREADCRUMB_CHARS);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > MAX_BREADCRUMB_CHARS * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

export function estimateTokens(s: string): number {
  return Math.ceil(s.length / 4);
}

interface Block {
  kind: "text" | "table";
  content: string;
}
interface Segment {
  breadcrumb: string;
  blocks: Block[];
}

const isHeading = (line: string) => /^#{1,6}\s+/.test(line.trim());
const isTableRow = (line: string) => /^\s*\|/.test(line);

/** Parse markdown into heading-scoped segments of text/table blocks. */
function parseSegments(markdown: string, rootTitle: string): Segment[] {
  const lines = markdown.split("\n");
  const stack: { level: number; text: string }[] = [];
  const breadcrumb = () =>
    capBreadcrumb([rootTitle.trim(), ...stack.map((h) => h.text)].filter(Boolean).join(" > "));

  const segments: Segment[] = [];
  let blocks: Block[] = [];
  let crumb = breadcrumb();
  const flush = () => {
    if (blocks.length) segments.push({ breadcrumb: crumb, blocks });
    blocks = [];
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (isHeading(line)) {
      flush();
      const m = /^(#{1,6})\s+(.*)$/.exec(line.trim())!;
      const level = m[1].length;
      while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
      stack.push({ level, text: m[2].trim() });
      crumb = breadcrumb();
      i++;
      continue;
    }
    if (isTableRow(line)) {
      const rows: string[] = [];
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(lines[i]);
        i++;
      }
      blocks.push({ kind: "table", content: rows.join("\n") });
      continue;
    }
    if (line.trim() === "") {
      i++;
      continue;
    }
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !isTableRow(lines[i]) &&
      !isHeading(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    blocks.push({ kind: "text", content: para.join("\n").trim() });
  }
  flush();
  return segments;
}

const isTerminator = (ch: string) => ch === "." || ch === "!" || ch === "?";
const isSpace = (ch: string) => /\s/.test(ch);

/**
 * Plan 099 Unit 1 — split text into sentences WITHOUT losing a single character.
 *
 * This replaces `text.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g)`, which silently deleted text.
 * Neither alternative of that regex can match a `.` that is not followed by whitespace, and
 * `String.prototype.match(/…/g)` SKIPS spans it cannot match instead of failing. So any decimal
 * sitting after the last sentence boundary fell into a dead zone and vanished:
 *
 *     "abc. 0.5 def"  ->  ["abc. ", "5 def"]          the "0." is gone
 *
 * In the live corpus that turned "Abound at 10 to 15.5 fl oz/A" into "5 fl oz/A" — losing the
 * product name AND turning the rate into a different number, in a pesticide guide, under a
 * citation that made it look authoritative.
 *
 * The boundary RULE is deliberately unchanged from the regex it replaces: a sentence ends at a run
 * of [.!?] that is followed by whitespace or end-of-input, and the single whitespace character
 * after the terminator is consumed with it (the old `(\s|$)` group did exactly that). Improving
 * sentence detection — abbreviations like `spp.`/`approx.`, European decimal commas — is a
 * separate, real problem, tracked in TODOS. Bundling it here would destroy the parity control that
 * proves THIS change is safe.
 *
 * The invariant is total coverage, so it is written as one: `splitIntoSentences(s).join("") === s`
 * for every input. Asserted as a property in test/knowledge-chunk-integrity.test.ts.
 */
export function splitIntoSentences(text: string): string[] {
  if (text === "") return [];
  const parts: string[] = [];
  let start = 0;
  let i = 0;
  while (i < text.length) {
    if (!isTerminator(text[i])) {
      i++;
      continue;
    }
    let end = i;
    while (end < text.length && isTerminator(text[end])) end++;
    if (end >= text.length) break; // terminators run to the end; the tail below takes them
    if (isSpace(text[end])) {
      parts.push(text.slice(start, end + 1)); // include the one whitespace char, as `(\s|$)` did
      start = end + 1;
      i = start;
      continue;
    }
    i = end; // not a boundary (the "." in 0.5) — keep scanning, but never skip the span
  }
  if (start < text.length) parts.push(text.slice(start));
  return parts;
}

export function splitBySentences(text: string, targetTokens: number): string[] {
  const sentences = splitIntoSentences(text);
  if (!sentences.length) return [];
  const out: string[] = [];
  let buf = "";
  for (const s of sentences) {
    if (buf && estimateTokens(buf + s) > targetTokens) {
      out.push(buf.trim());
      buf = "";
    }
    buf += s;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

export function tailForOverlap(body: string): string {
  const sentences = splitIntoSentences(body);
  let tail = "";
  for (let i = sentences.length - 1; i >= 0; i--) {
    const next = sentences[i] + tail;
    if (estimateTokens(next) > OVERLAP_TOKENS) break;
    tail = next;
  }
  return tail.trim();
}

/**
 * Plan 099 Unit 3b — the standing guard, not a fix for one regex.
 *
 * Fixing `splitIntoSentences` closes the bug we found. It does nothing about the next one, and this
 * failure mode is invisible by construction: a corrupted rate is usually still agronomically
 * plausible. 5 lb/A of sulfur is a normal spray; 5 lb/A of a Group 3 DMI is catastrophic and
 * illegal. Nobody downstream can tell the difference, and the citation makes the wrong number look
 * checked.
 *
 * So: every decimal-shaped token in the extracted text must still be findable in the chunks that
 * text produced. Presence is the assertion, not position or count — chunk overlap legitimately
 * duplicates a token, and a chunk boundary legitimately separates a number from its unit.
 *
 * Returns the distinct tokens that vanished, in source order. Empty means the document is clean.
 */
export function findDroppedNumericTokens(sourceText: string, chunkTexts: string[]): string[] {
  const dropped: string[] = [];
  const seen = new Set<string>();
  for (const match of sourceText.matchAll(/\d+[.,]\d+/g)) {
    const token = match[0];
    if (seen.has(token)) continue;
    seen.add(token);
    if (!chunkTexts.some((c) => c.includes(token))) dropped.push(token);
  }
  return dropped;
}

function chunkSegment(seg: Segment, startOrdinal: number): Chunk[] {
  const chunks: Chunk[] = [];
  let buf: string[] = [];
  let bufTokens = 0;
  let ordinal = startOrdinal;
  let emittedInSegment = 0;
  let prevTail = "";

  const emit = () => {
    if (!buf.length) return;
    let body = buf.join("\n\n").trim();
    if (emittedInSegment > 0 && prevTail) body = `${prevTail}\n\n${body}`;
    const text = `${seg.breadcrumb}\n\n${body}`.trim();
    chunks.push({ ordinal: ordinal++, sectionPath: seg.breadcrumb, text, tokenCount: estimateTokens(text) });
    prevTail = tailForOverlap(buf.join(" "));
    emittedInSegment++;
    buf = [];
    bufTokens = 0;
  };

  for (const block of seg.blocks) {
    const bt = estimateTokens(block.content);
    if (block.kind === "table") {
      if (bufTokens > 0 && bufTokens + bt > TARGET_TOKENS) emit();
      buf.push(block.content);
      bufTokens += bt;
      if (bufTokens >= TARGET_TOKENS) emit(); // a table alone may exceed target; still kept whole
      continue;
    }
    if (bt > MAX_TOKENS) {
      if (bufTokens > 0) emit();
      for (const piece of splitBySentences(block.content, TARGET_TOKENS)) {
        buf.push(piece);
        bufTokens += estimateTokens(piece);
        emit();
      }
      continue;
    }
    if (bufTokens + bt > TARGET_TOKENS) emit();
    buf.push(block.content);
    bufTokens += bt;
  }
  emit();
  return chunks;
}

/** Chunk a document's extracted markdown into embed-ready chunks. */
export function chunkMarkdown(markdown: string, title: string): Chunk[] {
  const segments = parseSegments(markdown, title);
  const chunks: Chunk[] = [];
  for (const seg of segments) {
    chunks.push(...chunkSegment(seg, chunks.length));
  }
  return chunks;
}
