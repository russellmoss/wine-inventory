import { getCurrentUser } from "@/lib/dal";
import { ttsEnabled } from "@/lib/voice/config";
import { synthesizeStream } from "@/lib/voice/elevenlabs";
import { toSpeakable } from "@/lib/voice/speech";

// Text-to-speech proxy for assistant voice mode. The client posts one sentence at
// a time (sentence-streamed) and gets back streaming MP3 audio. The ElevenLabs
// key stays server-side; we never expose it to the browser.
export const runtime = "nodejs";
export const maxDuration = 30;

// One spoken sentence. Generous, but bounds abuse / runaway synthesis cost.
const MAX_TEXT = 1500;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.banned || user.mustChangePassword) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }

  if (!ttsEnabled()) {
    return Response.json({ error: "Voice output is not configured." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Bad request body." }, { status: 400 });
  }

  const raw = (body as { text?: unknown })?.text;
  if (typeof raw !== "string") {
    return Response.json({ error: "Missing text." }, { status: 400 });
  }

  // Defense in depth: the client already speaks-normalizes, but never trust it.
  const text = toSpeakable(raw).slice(0, MAX_TEXT).trim();
  if (!text) {
    return Response.json({ error: "Nothing to say." }, { status: 400 });
  }

  try {
    const audio = await synthesizeStream(text);
    return new Response(audio, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return Response.json({ error: "Voice synthesis failed." }, { status: 502 });
  }
}
