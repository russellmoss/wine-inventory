import { describe, it, expect, beforeAll } from "vitest";
import { ingestDocumentsTool } from "@/lib/assistant/tools/ingest-documents";

// signProposal (the confirm-token HMAC) needs BETTER_AUTH_SECRET; CI doesn't provide it, so supply a dummy
// (mirrors test/assistant-confirm.test.ts / assistant-choice.test.ts). We only assert the token is present.
beforeAll(() => {
  process.env.BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET || "test-secret-for-ingest-tool-spec";
});
import { reverseIntakeTool } from "@/lib/assistant/tools/reverse-intake";
import { queryRecentIntakesTool } from "@/lib/assistant/tools/query-recent-intakes";

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

describe("intake see/reverse tools", () => {
  it("query_recent_intakes is a read tool", () => {
    expect(queryRecentIntakesTool.kind).toBe("read");
  });
  it("reverse_intake is a write tool requiring an intake id", () => {
    expect(reverseIntakeTool.kind).toBe("write");
    expect(reverseIntakeTool.inputSchema.required).toContain("ingestedInvoiceId");
  });
  it("reverse_intake rejects a missing id before touching the DB", async () => {
    await expect(reverseIntakeTool.run(ctx, {})).rejects.toThrow(/which intake/i);
    await expect(reverseIntakeTool.run(ctx, { ingestedInvoiceId: "   " })).rejects.toThrow(/which intake/i);
  });
});
