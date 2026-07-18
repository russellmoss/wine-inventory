import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { MAX_DOCUMENT_BYTES, validateDocument } from "@/lib/attachments/blob";

/** Minimal, real PDF: the "%PDF-" magic marker is all validateDocument checks for PDFs. */
function pdfBytes(padTo = 64): Buffer {
  const head = Buffer.from("%PDF-1.4\n%\xff\xff\n", "binary");
  const pad = Buffer.alloc(Math.max(0, padTo - head.length), 0x20);
  return Buffer.concat([head, pad]);
}

/** Minimal, real PNG (sig + IHDR + IEND) that satisfies validateAndStripImage's readPng path. */
function pngBytes(): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(4, 0); // width
  ihdrData.writeUInt32BE(4, 4); // height
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type
  const ihdr = chunk("IHDR", ihdrData);
  const iend = chunk("IEND", Buffer.alloc(0));
  return Buffer.concat([sig, ihdr, iend]);
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4); // real PNG readers ignore CRC here; validateAndStripImage doesn't check it
  return Buffer.concat([len, Buffer.from(type, "ascii"), data, crc]);
}

describe("validateDocument — PDF path", () => {
  it("accepts a PDF within the size cap and returns a sha256 of the verbatim bytes", () => {
    const bytes = pdfBytes();
    const doc = validateDocument(bytes, "application/pdf");
    expect(doc.contentType).toBe("application/pdf");
    // PDFs are stored verbatim — never metadata-stripped — so the sha covers the exact input bytes.
    expect(doc.bytes.equals(bytes)).toBe(true);
    expect(doc.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
  });

  it("accepts a PDF by magic bytes even without a content-type hint", () => {
    const doc = validateDocument(pdfBytes(), null);
    expect(doc.contentType).toBe("application/pdf");
  });

  it("rejects an oversize PDF", () => {
    const big = Buffer.concat([pdfBytes(), Buffer.alloc(MAX_DOCUMENT_BYTES + 1, 0x20)]);
    expect(() => validateDocument(big, "application/pdf")).toThrow(/10 MB or smaller/);
  });

  it("rejects non-PDF magic bytes carrying an application/pdf content-type", () => {
    const notPdf = Buffer.from("this is plainly not a pdf at all", "ascii");
    expect(() => validateDocument(notPdf, "application/pdf")).toThrow(/real PDF/);
  });
});

describe("validateDocument — image path (unchanged)", () => {
  it("accepts a real PNG and routes through the image validator", () => {
    const doc = validateDocument(pngBytes(), "image/png");
    expect(doc.contentType).toBe("image/png");
    expect(doc.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects a disallowed type (neither PDF nor real PNG/JPEG)", () => {
    const junk = Buffer.from("GIF89a not really an accepted type", "ascii");
    expect(() => validateDocument(junk, "image/gif")).toThrow(/PNG or JPEG/);
  });
});
