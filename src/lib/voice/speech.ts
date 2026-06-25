// Turn the assistant's markdown reply into clean prose for text-to-speech. The
// assistant formats for the eye (bold labels, bullets, `code`, headings); spoken
// aloud those become "asterisk asterisk" noise. This strips the syntax and
// normalizes a few cellar-specific tokens so ElevenLabs reads natural sentences.
//
// Pure, dependency-free, and isomorphic: the client runs it before POSTing each
// sentence to /api/assistant/speak, and the speak route runs it again defensively.

function stripInline(text: string): string {
  let out = text;
  // Links: [label](url) -> label
  out = out.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  // Images: ![alt](url) -> alt
  out = out.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
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
  // Degree symbol elsewhere -> " degrees " so it isn't read as punctuation.
  out = out.replace(/(\d)\s*°(?!\w)/g, "$1 degrees");
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
    .replace(/\s{2,}/g, " ")
    .trim();
  return normalizeUnits(tidied);
}
