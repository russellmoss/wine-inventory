import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { KB_EMBEDDING_DIM } from "@/lib/knowledge/env";

// Build a fake Voyage response for N inputs (unit-order preserved, each a valid 1024-dim vector).
function fakeVoyageResponse(inputs: string[]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      data: inputs.map((_, i) => ({
        index: i,
        embedding: Array.from({ length: KB_EMBEDDING_DIM }, () => 0.01),
      })),
      model: "voyage-4",
      usage: { total_tokens: inputs.length * 3 },
    }),
    text: async () => "",
  } as unknown as Response;
}

describe("embedTexts (Voyage client)", () => {
  const OLD = process.env.VOYAGE_API_KEY;
  beforeEach(() => {
    process.env.VOYAGE_API_KEY = "pa-test-key";
  });
  afterEach(() => {
    process.env.VOYAGE_API_KEY = OLD;
    vi.restoreAllMocks();
  });

  it("returns one 1024-dim vector per input, in order", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      expect(body.model).toBe("voyage-4");
      expect(body.input_type).toBe("document");
      return fakeVoyageResponse(body.input);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { embedTexts } = await import("@/lib/knowledge/embed");
    const vecs = await embedTexts(["a", "b", "c"], { inputType: "document" });
    expect(vecs).toHaveLength(3);
    expect(vecs[0]).toHaveLength(KB_EMBEDDING_DIM);
  });

  it("uses input_type=query for embedQuery", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      expect(body.input_type).toBe("query");
      return fakeVoyageResponse(body.input);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { embedQuery } = await import("@/lib/knowledge/embed");
    const v = await embedQuery("molecular SO2 at pH 3.2");
    expect(v).toHaveLength(KB_EMBEDDING_DIM);
  });

  it("returns [] for no inputs without calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { embedTexts } = await import("@/lib/knowledge/embed");
    expect(await embedTexts([], { inputType: "document" })).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws a clear error when VOYAGE_API_KEY is missing", async () => {
    delete process.env.VOYAGE_API_KEY;
    const { embedTexts } = await import("@/lib/knowledge/embed");
    await expect(embedTexts(["x"], { inputType: "document" })).rejects.toThrow(/VOYAGE_API_KEY/);
  });

  it("rejects a wrong-dimension vector from the provider", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ data: [{ index: 0, embedding: [0.1, 0.2, 0.3] }], model: "voyage-4" }),
        text: async () => "",
      })),
    );
    const { embedTexts } = await import("@/lib/knowledge/embed");
    await expect(embedTexts(["x"], { inputType: "document" })).rejects.toThrow(/invalid vector|dim/);
  });
});
