import "server-only";
import { listMaterials } from "@/lib/cellar/materials";
import { materialDisplayName, type CellarMaterialDTO } from "@/lib/cellar/materials-shared";
import { resolveOneOrChoice, type ResolveResult } from "./resolve";
import { signResume } from "../confirm";

// Shared free-text → ONE catalog material resolution for the Wave-3 material tools (receive_supply,
// set_material_active). Same behavior the add_addition picker proved: an exact normalized-name match wins;
// genuine ambiguity (partial name / true duplicates) returns a clickable CHOICE whose options pin the
// material by id via signResume — so identical names resolve deterministically, no model round-trip.
// (add_addition keeps its own copy because it additionally scopes to doseable additives.)

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export async function pickMaterial(
  text: string,
  toolName: string,
  resumeInput: Record<string, unknown>,
  opts: { includeInactive?: boolean; materialKey?: string } = {},
): Promise<ResolveResult<CellarMaterialDTO>> {
  const all = await listMaterials({ includeInactive: opts.includeInactive });
  const key = opts.materialKey ?? "material";
  const raw = text.trim();

  // A picker tap re-sends the command with the material pinned by id ("#<uuid>") — resolve that exactly.
  const idToken = raw.match(/#\s*([0-9a-z-]{8,})/i)?.[1] ?? raw;
  const byId = idToken.replace(/-/g, "").toLowerCase();
  const pinned = all.find((m) => m.id.replace(/-/g, "").toLowerCase() === byId);
  if (raw.startsWith("#") && !pinned) throw new Error("That material isn't in the catalog anymore — pick it again.");
  if (pinned) return { kind: "one", row: pinned };

  const needle = norm(raw);
  const nameNorms = (m: CellarMaterialDTO) => [materialDisplayName(m), m.name, m.genericName, m.brandName, m.brand].filter(Boolean).map((x) => norm(String(x)));
  const exact = all.filter((m) => nameNorms(m).includes(needle));
  const fuzzy = all.filter((m) => nameNorms(m).some((h) => h !== "" && (h.includes(needle) || needle.includes(h))));
  const matches = exact.length > 0 ? exact : fuzzy;

  return resolveOneOrChoice(matches, {
    prompt: `Which "${raw}" do you mean?`,
    describe: (m) => materialDisplayName(m),
    detail: (m) => [m.kind, m.subcategory].filter(Boolean).join(" · ") + ` · ref ${m.id.replace(/-/g, "").slice(0, 6)}`,
    resume: (m) => signResume(toolName, { ...resumeInput, [key]: `#${m.id}` }),
    noneMsg: `No material matches "${raw}". Add it to the catalog first (create_material), or check the name.`,
  });
}
