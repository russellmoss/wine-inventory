import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Reset the module registry between tests so each test re-reads process.env at
// import time the way the route does. config.ts/elevenlabs.ts are server-only;
// vitest aliases `server-only` to a stub (see vitest.config.ts).

const ENV_KEYS = [
  "ELEVENLABS_API_KEY",
  "ELEVENLABS_VOICE_ID",
  "ELEVENLABS_MODEL_ID",
  "ELEVENLABS_STABILITY",
  "ELEVENLABS_SIMILARITY_BOOST",
  "OPENAI_API_KEY",
] as const;

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  vi.resetModules();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.restoreAllMocks();
});

describe("voice config gates", () => {
  it("ttsEnabled tracks the ElevenLabs key", async () => {
    const { ttsEnabled } = await import("@/lib/voice/config");
    expect(ttsEnabled()).toBe(false);
    process.env.ELEVENLABS_API_KEY = "sk_test";
    expect(ttsEnabled()).toBe(true);
  });

  it("sttEnabled tracks the OpenAI key", async () => {
    const { sttEnabled } = await import("@/lib/voice/config");
    expect(sttEnabled()).toBe(false);
    process.env.OPENAI_API_KEY = "sk-openai";
    expect(sttEnabled()).toBe(true);
  });

  it("voiceEnabled requires both keys", async () => {
    const { voiceEnabled } = await import("@/lib/voice/config");
    expect(voiceEnabled()).toBe(false);
    process.env.ELEVENLABS_API_KEY = "sk_test";
    expect(voiceEnabled()).toBe(false);
    process.env.OPENAI_API_KEY = "sk-openai";
    expect(voiceEnabled()).toBe(true);
  });
});

describe("getVoiceConfig", () => {
  it("throws when the key is missing", async () => {
    const { getVoiceConfig } = await import("@/lib/voice/config");
    expect(() => getVoiceConfig()).toThrow(/ELEVENLABS_API_KEY/);
  });

  it("uses defaults when only the key is set", async () => {
    process.env.ELEVENLABS_API_KEY = "sk_test";
    const { getVoiceConfig } = await import("@/lib/voice/config");
    const cfg = getVoiceConfig();
    expect(cfg.apiKey).toBe("sk_test");
    expect(cfg.voiceId).toBe("Cb8NLd0sUB8jI4MW2f9M");
    expect(cfg.modelId).toBe("eleven_turbo_v2_5");
    expect(cfg.stability).toBe(0.5);
    expect(cfg.similarityBoost).toBe(0.75);
  });

  it("honors env overrides and falls back to defaults on non-numeric tuning", async () => {
    process.env.ELEVENLABS_API_KEY = "sk_test";
    process.env.ELEVENLABS_VOICE_ID = "voice123";
    process.env.ELEVENLABS_MODEL_ID = "eleven_flash_v2_5";
    process.env.ELEVENLABS_STABILITY = "0.3";
    process.env.ELEVENLABS_SIMILARITY_BOOST = "not-a-number";
    const { getVoiceConfig } = await import("@/lib/voice/config");
    const cfg = getVoiceConfig();
    expect(cfg.voiceId).toBe("voice123");
    expect(cfg.modelId).toBe("eleven_flash_v2_5");
    expect(cfg.stability).toBe(0.3);
    expect(cfg.similarityBoost).toBe(0.75); // bad value -> default
  });
});

describe("synthesizeStream", () => {
  it("POSTs to the streaming endpoint with the right headers/body and returns the body", async () => {
    process.env.ELEVENLABS_API_KEY = "sk_test";
    process.env.ELEVENLABS_VOICE_ID = "voiceABC";

    const fakeBody = new ReadableStream<Uint8Array>();
    const fetchMock = vi.fn(async () => new Response(fakeBody, { status: 200 }));
    // Response with a ReadableStream body keeps res.body non-null.
    vi.stubGlobal("fetch", fetchMock);

    const { synthesizeStream } = await import("@/lib/voice/elevenlabs");
    const out = await synthesizeStream("Hello there.");
    expect(out).toBeInstanceOf(ReadableStream);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.elevenlabs.io/v1/text-to-speech/voiceABC/stream");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["xi-api-key"]).toBe("sk_test");
    expect(headers.accept).toBe("audio/mpeg");
    const parsed = JSON.parse(init.body as string);
    expect(parsed.text).toBe("Hello there.");
    expect(parsed.model_id).toBe("eleven_turbo_v2_5");
    expect(parsed.voice_settings).toEqual({ stability: 0.5, similarity_boost: 0.75 });
  });

  it("throws a clean error on a non-2xx upstream response", async () => {
    process.env.ELEVENLABS_API_KEY = "sk_test";
    const fetchMock = vi.fn(async () => new Response("rate limited", { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);
    const { synthesizeStream } = await import("@/lib/voice/elevenlabs");
    await expect(synthesizeStream("hi")).rejects.toThrow(/ElevenLabs TTS failed \(429\)/);
  });
});
