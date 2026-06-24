import { put } from "@vercel/blob";
import { getCurrentUser, canManagerAccessVineyard } from "@/lib/dal";

// Binary multipart upload doesn't fit a server action cleanly, so this is the one
// upload route. Node runtime (Vercel Blob SDK + Buffer).
export const runtime = "nodejs";

const MAX_BYTES = 8 * 1024 * 1024; // 8MB server backstop; the client downscales to <1MB first
const ALLOWED = /^image\//;

function ext(type: string): string {
  if (type === "image/jpeg") return "jpg";
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "image/heic" || type === "image/heif") return "heic";
  return "img";
}

export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user || user.banned) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Expected multipart form data." }, { status: 400 });
  }

  const vineyardId = String(form.get("vineyardId") ?? "");
  if (!vineyardId) {
    return Response.json({ error: "Missing vineyardId." }, { status: 400 });
  }
  // Re-run the manager scope check here — otherwise any authed user could dump
  // arbitrary blobs against any vineyard's path.
  if (!canManagerAccessVineyard(user, vineyardId)) {
    return Response.json({ error: "Forbidden for this vineyard." }, { status: 403 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Missing file." }, { status: 400 });
  }
  if (!ALLOWED.test(file.type)) {
    return Response.json({ error: "Only image uploads are allowed." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "Image is too large (max 8MB)." }, { status: 400 });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return Response.json({ error: "Photo storage is not configured." }, { status: 503 });
  }

  try {
    const pathname = `field-notes/${vineyardId}/${crypto.randomUUID()}.${ext(file.type)}`;
    const blob = await put(pathname, file, {
      access: "public",
      contentType: file.type,
      addRandomSuffix: true,
    });
    return Response.json({ url: blob.url });
  } catch {
    return Response.json({ error: "Upload failed. Please retry." }, { status: 502 });
  }
}
