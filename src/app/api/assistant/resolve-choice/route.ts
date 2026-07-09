import { getCurrentUser } from "@/lib/dal";
import { verifyProposal } from "@/lib/assistant/confirm";
import { getToolsFor } from "@/lib/assistant/registry";
import { asProposal } from "@/lib/assistant/assistant-events";

// Deterministic picker resume: a disambiguation tap POSTs its signed `resume` token here. We re-run the
// SAME tool with the record pinned by id (the token's args) and return the resulting confirm proposal —
// no model in the loop, so identical-name selections always resolve to the exact record the user tapped.
// Idempotent (produces a proposal, mutates nothing); the returned proposal carries its own commit token.
export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.banned || user.mustChangePassword) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Bad request body." }, { status: 400 });
  }

  const token = (body as { token?: unknown })?.token;
  if (typeof token !== "string" || token.length === 0) {
    return Response.json({ error: "Missing selection token." }, { status: 400 });
  }

  try {
    const payload = verifyProposal(token);
    if (payload.kind !== "resume") throw new Error("That isn't a picker selection.");
    const tool = getToolsFor(user).find((t) => t.name === payload.tool);
    if (!tool) throw new Error("That action is unavailable.");
    const out = await tool.run({ user }, payload.args);
    const proposal = asProposal(out);
    if (!proposal) throw new Error("Couldn't prepare that change — please ask again.");
    return Response.json({ ok: true, preview: proposal.preview, token: proposal.token, details: proposal.details });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "Could not resolve that selection." },
      { status: 400 },
    );
  }
}
