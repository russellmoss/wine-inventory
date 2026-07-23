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
  "ELEVENLABS_STYLE",
  "ELEVENLABS_SPEAKER_BOOST",
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

  it("sttEnabled tracks the ElevenLabs key (Scribe shares the TTS key)", async () => {
    const { sttEnabled } = await import("@/lib/voice/config");
    expect(sttEnabled()).toBe(false);
    process.env.ELEVENLABS_API_KEY = "sk_test";
    expect(sttEnabled()).toBe(true);
  });

  it("voiceEnabled needs only the ElevenLabs key (both directions use it)", async () => {
    const { voiceEnabled } = await import("@/lib/voice/config");
    expect(voiceEnabled()).toBe(false);
    process.env.ELEVENLABS_API_KEY = "sk_test";
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
    expect(cfg.voiceId).toBe("UgBBYS2sOqTuMpoF3BR0");
    expect(cfg.modelId).toBe("eleven_flash_v2"); // same ~75ms as v2_5, but honours <phoneme> tags
    expect(cfg.stability).toBe(0.45);
    expect(cfg.similarityBoost).toBe(0.75);
    expect(cfg.style).toBe(0);
    expect(cfg.useSpeakerBoost).toBe(true);
  });

  it("honors env overrides and falls back to defaults on non-numeric tuning", async () => {
    process.env.ELEVENLABS_API_KEY = "sk_test";
    process.env.ELEVENLABS_VOICE_ID = "voice123";
    process.env.ELEVENLABS_MODEL_ID = "eleven_turbo_v2_5";
    process.env.ELEVENLABS_STABILITY = "0.3";
    process.env.ELEVENLABS_SIMILARITY_BOOST = "not-a-number";
    process.env.ELEVENLABS_STYLE = "0.4";
    const { getVoiceConfig } = await import("@/lib/voice/config");
    const cfg = getVoiceConfig();
    expect(cfg.voiceId).toBe("voice123");
    expect(cfg.modelId).toBe("eleven_turbo_v2_5");
    expect(cfg.stability).toBe(0.3);
    expect(cfg.similarityBoost).toBe(0.75); // bad value -> default
    expect(cfg.style).toBe(0.4);
  });

  it("parses the speaker-boost flag from common truthy/falsey spellings", async () => {
    process.env.ELEVENLABS_API_KEY = "sk_test";
    for (const [raw, expected] of [
      ["false", false],
      ["0", false],
      ["no", false],
      ["true", true],
      ["1", true],
      ["garbage", true], // unparseable -> default (true)
    ] as const) {
      vi.resetModules();
      process.env.ELEVENLABS_SPEAKER_BOOST = raw;
      const { getVoiceConfig } = await import("@/lib/voice/config");
      expect(getVoiceConfig().useSpeakerBoost, `for "${raw}"`).toBe(expected);
    }
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
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.elevenlabs.io/v1/text-to-speech/voiceABC/stream");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["xi-api-key"]).toBe("sk_test");
    expect(headers.accept).toBe("audio/mpeg");
    const parsed = JSON.parse(init.body as string);
    expect(parsed.text).toBe("Hello there.");
    expect(parsed.model_id).toBe("eleven_flash_v2");
    // All FOUR settings must go on the wire — style and use_speaker_boost were being
    // dropped before, so setting them had no effect no matter what they were set to.
    expect(parsed.voice_settings).toEqual({
      stability: 0.45,
      similarity_boost: 0.75,
      style: 0,
      use_speaker_boost: true,
    });
  });

  it("throws a clean error on a non-2xx upstream response", async () => {
    process.env.ELEVENLABS_API_KEY = "sk_test";
    const fetchMock = vi.fn(async () => new Response("rate limited", { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);
    const { synthesizeStream } = await import("@/lib/voice/elevenlabs");
    await expect(synthesizeStream("hi")).rejects.toThrow(/ElevenLabs TTS failed \(429\)/);
  });
});
