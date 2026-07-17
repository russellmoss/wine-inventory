import { describe, it, expect } from "vitest";
import { ingestDocumentsTool } from "@/lib/assistant/tools/ingest-documents";

// Plan 072 Unit 9: the assistant ingest tool PROPOSES (does not mutate) and routes to the review screen.
// The extraction + apply are exercised end-to-end by verify:ingest; here we lock the tool's proposal contract.

const ctx = { user: {} as never };

describe("ingest_documents tool", () => {
  it("is a write tool that requires files", () => {
    expect(ingestDocumentsTool.kind).toBe("write");
    expect(ingestDocumentsTool.inputSchema.required).toContain("files");
  });

  it("rejects an empty/absent file list cleanly (upload first)", async () => {
    await expect(ingestDocumentsTool.run(ctx, { files: [] })).rejects.toThrow(/upload/i);
    await expect(ingestDocumentsTool.run(ctx, {})).rejects.toThrow(/upload/i);
  });

  it("drops malformed refs and, with a valid one, returns a confirm proposal (does NOT mutate)", async () => {
    const res = (await ingestDocumentsTool.run(ctx, {
      files: [
        { fileName: "no-url.pdf", mimeType: "application/pdf" }, // missing blobUrl → dropped
        { blobUrl: "https://blob/x.pdf", fileName: "x.pdf", mimeType: "application/pdf" },
      ],
    })) as { needsConfirmation?: boolean; preview?: string; token?: string };
    expect(res.needsConfirmation).toBe(true);
    expect(res.token).toBeTruthy();
    expect(res.preview).toMatch(/1 uploaded document/);
    expect(res.preview).toMatch(/review screen/i);
  });

  it("rejects when every ref is malformed (nothing to ingest)", async () => {
    await expect(ingestDocumentsTool.run(ctx, { files: [{ fileName: "x.pdf" }] })).rejects.toThrow(/upload/i);
  });
});
