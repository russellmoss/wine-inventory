// Turn the assistant's markdown reply into clean prose for text-to-speech. The
// assistant formats for the eye (bold labels, bullets, `code`, headings); spoken
// aloud those become "asterisk asterisk" noise. This strips the syntax and
// normalizes a few cellar-specific tokens so ElevenLabs reads natural sentences.
//
// Pure, dependency-free, and isomorphic: the client runs it before POSTing each
// sentence to /api/assistant/speak, and the speak route runs it again defensively.

/**
 * A link target that is a SOURCE citation rather than part of the sentence.
 *
 * Deliberately narrow: ONLY knowledge-base citations (/kb/source/<id>), which is the
 * one link shape the assistant emits purely as attribution. Matches both the relative
 * form and an absolute one (http://host/kb/source/<id>). Any OTHER link — including an
 * external labelled one — keeps its label, because that text is usually the sentence's
 * subject or object and dropping it produces "See  now."
 */
function isCitationTarget(href: string): boolean {
  return href.trim().includes("/kb/source/");
}

function stripInline(text: string): string {
  let out = text;
  // Images before links, so "![alt](url)" isn't half-eaten by the link rule.
  out = out.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  // Links. Two different fates, and the distinction is the whole point:
  //  - CITATIONS (/kb/source/<id>, or any external URL) are for the EYE only. The chat
  //    transcript renders them as clickable sources; speaking them produced the
  //    unbearable "AWRI: Recommended YAN levels" read-aloud. Drop label AND target.
  //  - Everything else (in-app deep links like /vineyards/block-3) keeps its LABEL,
  //    because that text is part of the sentence and removing it breaks the grammar.
  out = out.replace(/\[([^\]]*)\]\(([^)]*)\)/g, (_m, label: string, href: string) =>
    isCitationTarget(href) ? "" : label,
  );
  // A bare URL is never speakable.
  out = out.replace(/\bhttps?:\/\/\S+/gi, "");
  // Bold/italic: **x**, __x__, *x*, _x_ -> x
  out = out.replace(/(\*\*|__)(.*?)\1/g, "$2");
  out = out.replace(/(\*|_)(.*?)\1/g, "$2");
  // Inline code: `x` -> x (fenced blocks are removed in a whole-string pre-pass)
  out = out.replace(/`([^`]+)`/g, "$1");
  // Strikethrough ~~x~~ -> x
  out = out.replace(/~~(.*?)~~/g, "$1");
  return out;
}

function normalizeUnits(text: string): string {
  let out = text;
  // "24.5 °Bx" / "24.5°Bx" / "24.5 Bx" -> "24.5 Brix" (the spoken word). Keep the
  // number; only the unit token changes. Case-insensitive on the Bx unit.
  out = out.replace(/(\d)\s*°?\s*Bx\b/gi, "$1 Brix");
  // Bare "°Bx" with no number in front -> "Brix".
  out = out.replace(/°\s*Bx\b/gi, "Brix");

  // Concentration units. TTS reads "mg/L" as letters-and-a-slash ("em gee slash el"),
  // which is unusable in a spoken answer, so spell them out. ORDER MATTERS: the most
  // specific pattern must win first, or "mg/L" would be half-eaten by the "g/L" rule.
  // \s* everywhere because the model writes "mg / L" and "mg N / L" too.
  out = out.replace(/\bmg\s*N\s*\/\s*L\b/gi, "milligrams of nitrogen per liter");
  out = out.replace(/\bmg\s*\/\s*L\b/gi, "milligrams per liter");
  out = out.replace(/\bg\s*\/\s*hL\b/gi, "grams per hectoliter");
  out = out.replace(/\bmL\s*\/\s*L\b/gi, "milliliters per liter");
  out = out.replace(/\bg\s*\/\s*L\b/gi, "grams per liter");
  // ppm / ppb are read as initialisms otherwise.
  out = out.replace(/\bppm\b/gi, "parts per million");
  out = out.replace(/\bppb\b/gi, "parts per billion");
  // Sulfur dioxide: "SO2" / "SO₂" would be spoken as letters. NOTE: a trailing \b
  // does NOT work here — "₂" (U+2082) is not a word character, so there is no word
  // boundary between it and a following space. Use an explicit lookahead instead.
  out = out.replace(/\bSO\s*(?:2|₂)(?![A-Za-z0-9])/g, "sulfur dioxide");

  // Temperatures before the bare-degree rule (those have a word char after "°").
  out = out.replace(/(\d)\s*°\s*C\b/g, "$1 degrees Celsius");
  out = out.replace(/(\d)\s*°\s*F\b/g, "$1 degrees Fahrenheit");
  // Degree symbol elsewhere -> " degrees " so it isn't read as punctuation.
  out = out.replace(/(\d)\s*°(?!\w)/g, "$1 degrees");
  // Percent sign -> the word, so "0.8%" doesn't come out as "zero point eight".
  out = out.replace(/\s*%/g, " percent");
  return out;
}

/**
 * Convert assistant markdown into a plain-text string suitable for TTS.
 * Removes markdown syntax, list markers, and headings; normalizes wine units;
 * collapses whitespace. Sentence punctuation is preserved so downstream chunking
 * and prosody stay intact.
 */
export function toSpeakable(markdown: string): string {
  // Whole-string pre-pass: fenced code blocks span multiple lines, so unwrap
  // them to their inner content before we split and process line by line.
  const defenced = markdown.replace(/```[a-zA-Z0-9]*\n?([\s\S]*?)```/g, "$1");
  const lines = defenced.split(/\r?\n/);
  const cleaned = lines.map((raw) => {
    let line = raw;
    // Heading markers: "## Title" -> "Title"
    line = line.replace(/^\s{0,3}#{1,6}\s+/, "");
    // Blockquote markers: "> quote" -> "quote"
    line = line.replace(/^\s{0,3}>\s?/, "");
    // Unordered list markers: "- ", "* ", "+ " -> ""
    line = line.replace(/^\s*[-*+]\s+/, "");
    // Ordered list markers: "1. ", "2) " -> ""
    line = line.replace(/^\s*\d+[.)]\s+/, "");
    // Horizontal rules become nothing.
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) line = "";
    return stripInline(line).trim();
  });

  const joined = cleaned.filter((l) => l.length > 0).join(". ");
  // ".. " or " . " artifacts from joining lines that already end in punctuation.
  const tidied = joined
    .replace(/([.!?]):?\s*\.\s/g, "$1 ")
    // Removing a citation leaves a gap before the punctuation it sat in front of
    // ("around 100 [AWRI](/kb/source/x)." -> "around 100 ."). Close it up, or TTS
    // reads an unnatural pause mid-clause.
    .replace(/\s+([.,;:!?])/g, "$1")
    // ...and an empty pair of brackets/parens if a citation was the whole aside.
    .replace(/\(\s*\)/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return normalizeUnits(tidied);
}
