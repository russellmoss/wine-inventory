import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// transcribe.ts is server-only (stubbed by vitest.config alias). It reads
// ELEVENLABS_API_KEY at call time, so manage it per test.

let savedKey: string | undefined;
let savedModel: string | undefined;

beforeEach(() => {
  savedKey = process.env.ELEVENLABS_API_KEY;
  savedModel = process.env.ELEVENLABS_STT_MODEL;
  delete process.env.ELEVENLABS_API_KEY;
  delete process.env.ELEVENLABS_STT_MODEL;
  vi.resetModules();
});

afterEach(() => {
  if (savedKey === undefined) delete process.env.ELEVENLABS_API_KEY;
  else process.env.ELEVENLABS_API_KEY = savedKey;
  if (savedModel === undefined) delete process.env.ELEVENLABS_STT_MODEL;
  else process.env.ELEVENLABS_STT_MODEL = savedModel;
  vi.restoreAllMocks();
});

describe("transcribeEnabled", () => {
  it("tracks the ElevenLabs key", async () => {
    const m = await import("@/lib/voice/transcribe");
    expect(m.transcribeEnabled()).toBe(false);
    process.env.ELEVENLABS_API_KEY = "sk_test";
    expect(m.transcribeEnabled()).toBe(true);
  });
});

describe("transcribeAudio", () => {
  it("posts multipart form-data to ElevenLabs Scribe and returns the text", async () => {
    process.env.ELEVENLABS_API_KEY = "sk_test";

    const fetchMock = vi.fn(async () => Response.json({ text: "  log 24 brix on block a  " }));
    vi.stubGlobal("fetch", fetchMock);

    const { transcribeAudio } = await import("@/lib/voice/transcribe");
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" });
    const text = await transcribeAudio(blob, "speech.webm");

    expect(text).toBe("log 24 brix on block a"); // trimmed
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.elevenlabs.io/v1/speech-to-text");
    expect((init.headers as Record<string, string>)["xi-api-key"]).toBe("sk_test");
    const form = init.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(form.get("model_id")).toBe("scribe_v1");
    expect(form.get("language_code")).toBe("eng"); // pinned English (no hallucinated languages)
    expect(form.get("tag_audio_events")).toBe("false");
    expect(form.get("file")).toBeInstanceOf(Blob);
  });

  it("honors ELEVENLABS_STT_MODEL override", async () => {
    process.env.ELEVENLABS_API_KEY = "sk_test";
    process.env.ELEVENLABS_STT_MODEL = "scribe_v2";
    const fetchMock = vi.fn(async () => Response.json({ text: "ok" }));
    vi.stubGlobal("fetch", fetchMock);
    const { transcribeAudio } = await import("@/lib/voice/transcribe");
    await transcribeAudio(new Blob(["x"]));
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.body as FormData).get("model_id")).toBe("scribe_v2");
  });

  it("throws when the key is missing", async () => {
    const { transcribeAudio } = await import("@/lib/voice/transcribe");
    await expect(transcribeAudio(new Blob(["x"]))).rejects.toThrow(/ELEVENLABS_API_KEY/);
  });

  it("throws a clean error on a non-2xx upstream response", async () => {
    process.env.ELEVENLABS_API_KEY = "sk_test";
    const fetchMock = vi.fn(async () => new Response("bad", { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    const { transcribeAudio } = await import("@/lib/voice/transcribe");
    await expect(transcribeAudio(new Blob(["x"]))).rejects.toThrow(/ElevenLabs STT failed \(400\)/);
  });

  it("returns empty string when upstream omits text", async () => {
    process.env.ELEVENLABS_API_KEY = "sk_test";
    const fetchMock = vi.fn(async () => Response.json({}));
    vi.stubGlobal("fetch", fetchMock);
    const { transcribeAudio } = await import("@/lib/voice/transcribe");
    expect(await transcribeAudio(new Blob(["x"]))).toBe("");
  });
});
