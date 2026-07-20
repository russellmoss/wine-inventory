// Plan 084 Unit 2 — build a tiny, VALID PDF in memory so extractPdf can be tested without checking a
// binary fixture into the repo (test/ has no fixtures directory for extraction, and the extract suite's
// existing convention is inline fixtures).
//
// The xref offsets must be byte-accurate: pdf.js can often recover from a broken xref, but a test that
// silently depends on error recovery is not testing what it claims to. So offsets are computed from the
// assembled body rather than hardcoded.

export interface MinimalPdfOptions {
  /** Visible page text, also what extractText should return. */
  text?: string;
  /** Raw /Title value for the Info dictionary. Omit to leave Title unset. */
  title?: string;
  /** Raw /CreationDate value, e.g. "D:20180507101503-04'00'". Omit to leave it unset. */
  creationDate?: string;
  /** Raw /ModDate value. Omit to leave it unset. */
  modDate?: string;
}

/** Escape the PDF string-literal metacharacters so a title containing parentheses can't break the object. */
function pdfString(s: string): string {
  return `(${s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")})`;
}

export function buildMinimalPdf(opts: MinimalPdfOptions = {}): Buffer {
  const text = opts.text ?? "Grape disease control for cool climate vineyards.";

  const content = `BT /F1 12 Tf 20 150 Td ${pdfString(text)} Tj ET`;

  const info: string[] = [];
  if (opts.title !== undefined) info.push(`/Title ${pdfString(opts.title)}`);
  if (opts.creationDate !== undefined) info.push(`/CreationDate ${pdfString(opts.creationDate)}`);
  if (opts.modDate !== undefined) info.push(`/ModDate ${pdfString(opts.modDate)}`);

  const objects = [
    `<< /Type /Catalog /Pages 2 0 R >>`,
    `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`,
    `<< ${info.join(" ")} >>`,
  ];

  const header = "%PDF-1.4\n";
  let body = "";
  const offsets: number[] = [];
  objects.forEach((obj, idx) => {
    offsets.push(header.length + body.length);
    body += `${idx + 1} 0 obj\n${obj}\nendobj\n`;
  });

  const xrefOffset = header.length + body.length;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) xref += `${String(off).padStart(10, "0")} 00000 n \n`;

  const trailer =
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${objects.length} 0 R >>\n` +
    `startxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(header + body + xref + trailer, "latin1");
}
