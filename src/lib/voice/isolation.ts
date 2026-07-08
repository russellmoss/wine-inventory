import "server-only";

const ELEVEN_ISOLATION_URL = "https://api.elevenlabs.io/v1/audio-isolation";

export function audioIsolationConfigured(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY);
}

export async function isolateVoiceAudio(audio: Blob, filename = "speech.webm", timeoutMs = 4500): Promise<Blob> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set; audio isolation is unavailable.");

  const form = new FormData();
  form.append("audio", audio, filename);

  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(ELEVEN_ISOLATION_URL, {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: form,
      signal: ac.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`ElevenLabs Voice Isolator failed (${res.status}). ${detail.slice(0, 160)}`);
    }
    return await res.blob();
  } finally {
    clearTimeout(timeout);
  }
}
