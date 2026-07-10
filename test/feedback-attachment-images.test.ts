import { describe, it, expect } from "vitest";
import {
  selectImagesForModel,
  IMAGE_SELECTION,
  type AttachmentImageInput,
} from "../scripts/feedback-attachment-images";

function img(id: string, contentType: string, size: number): AttachmentImageInput {
  return { id, contentType, bytes: Buffer.alloc(size, 1) };
}

describe("selectImagesForModel", () => {
  it("builds one block per small png/jpeg, no skipped note", () => {
    const { blocks, skippedNote } = selectImagesForModel([
      img("a", "image/png", 1_000),
      img("b", "image/jpeg", 2_000),
    ]);
    expect(blocks).toHaveLength(2);
    expect(skippedNote).toBe("");
    expect(blocks[0].source.media_type).toBe("image/png");
    expect(blocks[1].source.media_type).toBe("image/jpeg");
    expect(blocks[0].source.type).toBe("base64");
    // base64 of 1000 bytes of 0x01 decodes back to 1000 bytes
    expect(Buffer.from(blocks[0].source.data, "base64")).toHaveLength(1_000);
  });

  it("normalises image/jpg to image/jpeg and skips unsupported types", () => {
    const { blocks, skippedNote } = selectImagesForModel([
      img("a", "image/jpg", 500),
      img("b", "image/gif", 500),
      img("c", "application/pdf", 500),
    ]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].source.media_type).toBe("image/jpeg");
    expect(skippedNote).toContain("2 attached screenshot(s) were not shown");
    expect(skippedNote).toContain("unsupported type");
  });

  it("skips a single image over the per-image byte cap", () => {
    const { blocks, skippedNote } = selectImagesForModel([
      img("big", "image/png", IMAGE_SELECTION.maxSingleImageBytes + 1),
      img("ok", "image/png", 1_000),
    ]);
    expect(blocks).toHaveLength(1);
    expect(skippedNote).toContain("1 too large");
  });

  it("enforces the image count cap in order", () => {
    const inputs = Array.from({ length: IMAGE_SELECTION.maxImages + 2 }, (_, i) =>
      img(`i${i}`, "image/png", 100),
    );
    const { blocks, skippedNote } = selectImagesForModel(inputs);
    expect(blocks).toHaveLength(IMAGE_SELECTION.maxImages);
    expect(skippedNote).toContain(`2 over the ${IMAGE_SELECTION.maxImages}-image limit`);
  });

  it("enforces the total byte budget", () => {
    // Two images that individually pass the per-image cap but together exceed the total budget.
    const half = IMAGE_SELECTION.maxSingleImageBytes;
    const { blocks, skippedNote } = selectImagesForModel(
      [img("a", "image/png", half), img("b", "image/png", half), img("c", "image/png", half)],
      { maxTotalBytes: half + 10, maxImages: 10 },
    );
    expect(blocks).toHaveLength(1);
    expect(skippedNote).toContain("over the size budget");
  });

  it("returns empty with no note for no inputs", () => {
    expect(selectImagesForModel([])).toEqual({ blocks: [], skippedNote: "" });
  });

  it("preserves input order in the emitted blocks", () => {
    const { blocks } = selectImagesForModel([
      img("first", "image/png", 10),
      img("second", "image/jpeg", 20),
    ]);
    expect(Buffer.from(blocks[0].source.data, "base64")).toHaveLength(10);
    expect(Buffer.from(blocks[1].source.data, "base64")).toHaveLength(20);
  });
});
