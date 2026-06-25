import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// transcribe.ts is server-only (stubbed by vitest.config alias). It reads
// OPENAI_API_KEY at call time, so manage it per test.

let savedKey: string | undefined;
let savedModel: string | undefined;

beforeEach(() => {
  savedKey = process.env.OPENAI_API_KEY;
  savedModel = process.env.OPENAI_TRANSCRIBE_MODEL;
  vi.resetModules();
});

afterEach(() => {
  if (savedKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = savedKey;
  if (savedModel === undefined) delete process.env.OPENAI_TRANSCRIBE_MODEL;
  else process.env.OPENAI_TRANSCRIBE_MODEL = savedModel;
  vi.restoreAllMocks();
});

describe("transcribeEnabled", () => {
  it("tracks the OpenAI key", async () => {
    delete process.env.OPENAI_API_KEY;
    const m = await import("@/lib/voice/transcribe");
    expect(m.transcribeEnabled()).toBe(false);
    process.env.OPENAI_API_KEY = "sk-openai";
    expect(m.transcribeEnabled()).toBe(true);
  });
});

describe("transcribeAudio", () => {
  it("posts multipart form-data with auth + model and returns the text", async () => {
    process.env.OPENAI_API_KEY = "sk-openai";
    delete process.env.OPENAI_TRANSCRIBE_MODEL;

    const fetchMock = vi.fn(async () => Response.json({ text: "  log 24 brix on block a  " }));
    vi.stubGlobal("fetch", fetchMock);

    const { transcribeAudio } = await import("@/lib/voice/transcribe");
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" });
    const text = await transcribeAudio(blob, "speech.webm");

    expect(text).toBe("log 24 brix on block a"); // trimmed
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/audio/transcriptions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-openai");
    const form = init.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(form.get("model")).toBe("gpt-4o-transcribe");
    expect(form.get("language")).toBe("en");
    expect(typeof form.get("prompt")).toBe("string");
    expect(form.get("file")).toBeInstanceOf(Blob);
  });

  it("honors OPENAI_TRANSCRIBE_MODEL override", async () => {
    process.env.OPENAI_API_KEY = "sk-openai";
    process.env.OPENAI_TRANSCRIBE_MODEL = "whisper-1";
    const fetchMock = vi.fn(async () => Response.json({ text: "ok" }));
    vi.stubGlobal("fetch", fetchMock);
    const { transcribeAudio } = await import("@/lib/voice/transcribe");
    await transcribeAudio(new Blob(["x"]));
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.body as FormData).get("model")).toBe("whisper-1");
  });

  it("throws when the key is missing", async () => {
    delete process.env.OPENAI_API_KEY;
    const { transcribeAudio } = await import("@/lib/voice/transcribe");
    await expect(transcribeAudio(new Blob(["x"]))).rejects.toThrow(/OPENAI_API_KEY/);
  });

  it("throws a clean error on a non-2xx upstream response", async () => {
    process.env.OPENAI_API_KEY = "sk-openai";
    const fetchMock = vi.fn(async () => new Response("bad", { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    const { transcribeAudio } = await import("@/lib/voice/transcribe");
    await expect(transcribeAudio(new Blob(["x"]))).rejects.toThrow(/transcription failed \(400\)/);
  });

  it("returns empty string when upstream omits text", async () => {
    process.env.OPENAI_API_KEY = "sk-openai";
    const fetchMock = vi.fn(async () => Response.json({}));
    vi.stubGlobal("fetch", fetchMock);
    const { transcribeAudio } = await import("@/lib/voice/transcribe");
    expect(await transcribeAudio(new Blob(["x"]))).toBe("");
  });
});
