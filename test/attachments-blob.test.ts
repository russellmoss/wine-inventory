import { describe, it, expect } from "vitest";
import { safeAttachmentName, validateAndStripImage, MAX_ATTACHMENT_BYTES } from "@/lib/attachments/blob";

// A real 1×1 PNG (validates + strips cleanly through readPng/stripPngMetadata).
const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

describe("safeAttachmentName", () => {
  it("strips path traversal to a basename", () => {
    expect(safeAttachmentName("../../etc/passwd")).toBe("passwd");
    expect(safeAttachmentName("C:\\Windows\\evil.png")).toBe("evil.png");
  });
  it("replaces control/special chars", () => {
    expect(safeAttachmentName("a\tb*c?.png")).toBe("a_b_c_.png");
  });
  it("caps length at 120 chars", () => {
    expect(safeAttachmentName("x".repeat(300)).length).toBe(120);
  });
  it("falls back to 'attachment' for empty/garbage", () => {
    expect(safeAttachmentName("")).toBe("attachment");
    expect(safeAttachmentName("/")).toBe("attachment");
  });
});

describe("validateAndStripImage", () => {
  it("accepts a real PNG and returns dimensions + sha256", () => {
    const out = validateAndStripImage(PNG_1x1);
    expect(out.contentType).toBe("image/png");
    expect(out.width).toBe(1);
    expect(out.height).toBe(1);
    expect(out.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(out.bytes.length).toBeGreaterThan(0);
  });
  it("rejects empty input", () => {
    expect(() => validateAndStripImage(Buffer.alloc(0))).toThrow(/5 MB or smaller/);
  });
  it("rejects oversize input", () => {
    expect(() => validateAndStripImage(Buffer.alloc(MAX_ATTACHMENT_BYTES + 1))).toThrow(/5 MB or smaller/);
  });
  it("rejects non-image bytes (spoofed content)", () => {
    expect(() => validateAndStripImage(Buffer.from("not really an image at all, just text"))).toThrow(
      /real PNG or JPEG/,
    );
  });
});
