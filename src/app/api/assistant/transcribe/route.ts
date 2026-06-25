import { getCurrentUser } from "@/lib/dal";
import { transcribeEnabled, transcribeAudio } from "@/lib/voice/transcribe";

// Speech-to-text for assistant voice mode. The client records an utterance and
// posts it as multipart/form-data; we return the transcript. The OpenAI key
// stays server-side.
export const runtime = "nodejs";
export const maxDuration = 30;

// ~25MB ElevenLabs/OpenAI-style ceiling; a hands-free turn is far smaller, this
// just bounds abuse.
const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.banned || user.mustChangePassword) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }

  if (!transcribeEnabled()) {
    return Response.json({ error: "Speech input is not configured." }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Bad request body." }, { status: 400 });
  }

  const file = form.get("audio");
  if (!(file instanceof Blob) || file.size === 0) {
    return Response.json({ error: "Missing audio." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "Audio too large." }, { status: 413 });
  }

  try {
    const text = await transcribeAudio(file);
    return Response.json({ text });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error("[transcribe] failed:", detail, "| audio:", file.type, file.size, "bytes");
    return Response.json({ error: "Transcription failed.", detail }, { status: 502 });
  }
}
