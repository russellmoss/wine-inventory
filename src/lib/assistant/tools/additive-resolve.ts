import type { CellarMaterialDTO } from "@/lib/cellar/materials-shared";
import { materialDisplayName } from "@/lib/cellar/materials-shared";
import { isDoseableCategory, categoryOf, type MaterialCategory } from "@/lib/cellar/material-taxonomy";
import { resolveOneOrChoice, type ResolveResult } from "./resolve";
import { signResume } from "../confirm";

// Pure (DB-free, client-safe) free-text → ONE additive resolution, ADDITIVE-scoped. Extracted so the
// multi-vessel WO tool (issue_operation_wo) resolves a dosed material the SAME way the single-vessel
// add_addition picker does: genuine ambiguity (a partial name OR true name-duplicates, e.g. two
// "Bentonite" catalog entries) returns a clickable CHOICE whose options pin the material BY ID — not a
// text "be more specific" question, which dead-loops when the two names are byte-for-byte identical and
// no clarification the user types can ever break the tie. A `#<id>` ref (a picker tap) pins directly.
// Refuses a non-additive-only match (packaging / cleaning are never dosed into wine — WORKORDER-3).

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const CAT_LABEL: Record<string, string> = {
  CLEANING_SANITIZING: "cleaning / sanitizing",
  PACKAGING: "packaging",
  ADDITIVE: "additive",
  OTHER: "other",
};
const catOf = (m: { category?: string | null; kind: string }) => (m.category ?? categoryOf(m.kind)) as MaterialCategory;
const nonAdditiveMsg = (m: CellarMaterialDTO) =>
  `"${materialDisplayName(m)}" is a ${CAT_LABEL[catOf(m)] ?? "non-additive"} material — it can't be dosed into wine.`;

/**
 * Resolve an additive by name from a catalog list. Returns exactly one match, or a clickable CHOICE the
 * caller returns to the client (`if (res.kind === "choice") return res.choice`). Each choice option
 * carries a signed `resume` token that re-drives `issue_operation_wo` with the material pinned by id, so
 * identical names still pick cleanly. `resumeBase` is the tool's original input (minus material) so the
 * re-drive rebuilds the full work order. Throws only on no-match or an only-non-additive match.
 */
export function resolveAdditiveFrom(
  all: CellarMaterialDTO[],
  ref: string,
  resumeBase: Record<string, unknown>,
): ResolveResult<CellarMaterialDTO> {
  const raw = ref.trim();

  // A picker tap re-sends the command with the material pinned by id ("#<uuid>") — resolve that exactly,
  // bypassing name matching (the whole point: identical names pick by identity, not text).
  const idToken = raw.match(/#\s*([0-9a-z-]{8,})/i)?.[1] ?? raw;
  const byId = idToken.replace(/-/g, "").toLowerCase();
  const pinned = all.find((m) => m.id.replace(/-/g, "").toLowerCase() === byId);
  if (raw.startsWith("#") && !pinned) throw new Error("That additive isn't in the catalog anymore — pick it again.");
  if (pinned) {
    if (!isDoseableCategory(catOf(pinned))) throw new Error(nonAdditiveMsg(pinned));
    return { kind: "one", row: pinned };
  }

  const needle = norm(raw);
  const nameNorms = (m: CellarMaterialDTO) =>
    [materialDisplayName(m), m.name, m.genericName, m.brandName, m.brand].filter(Boolean).map((x) => norm(String(x)));
  // Exact normalized-name match wins over fuzzy contains (a fully-specified name beats near-duplicates).
  const exact = all.filter((m) => nameNorms(m).includes(needle));
  const fuzzy = all.filter((m) => nameNorms(m).some((h) => h !== "" && (h.includes(needle) || needle.includes(h))));
  const matches = exact.length > 0 ? exact : fuzzy;
  if (matches.length === 0) throw new Error(`No additive matches "${ref}". Add it to the expendables catalog first, or check the name.`);

  const doseable = matches.filter((m) => isDoseableCategory(catOf(m)));
  if (doseable.length === 0) throw new Error(nonAdditiveMsg(matches[0]));

  // Ambiguous (partial name, or true name-duplicates) → a clickable PICKER, not a text dead-loop. Each
  // option pins the material by id; the sublabel carries a distinguishing field + a short ref.
  return resolveOneOrChoice(doseable, {
    prompt: `Which "${ref}" do you mean?`,
    describe: (m) => materialDisplayName(m),
    detail: (m) => [m.kind, m.subcategory].filter(Boolean).join(" · ") + ` · ref ${m.id.replace(/-/g, "").slice(0, 6)}`,
    resume: (m) => signResume("issue_operation_wo", { ...resumeBase, material: `#${m.id}` }),
    noneMsg: `No additive matches "${ref}". Add it to the expendables catalog first, or check the name.`,
  });
}
