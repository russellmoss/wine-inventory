// Pure assembly logic for the field-report save tool. No server/DB imports so it
// is unit-testable; save-field-report.ts wires it to the real data.
import { normalizeInputKey } from "@/lib/fieldnotes/sanitize";
import { EMPTY_BLOCK_STATUS, type BlockStatus, type InputApplication } from "@/lib/fieldnotes/types";

/**
 * Overlay the model's per-block edits onto a base (existing report or carried-
 * forward defaults), accepting keys by block id OR label, then guarantee every
 * current block has a status so createFieldNote's coverage check passes.
 */
export function assembleBlockStatuses(
  base: Record<string, BlockStatus>,
  edits: Record<string, Partial<BlockStatus>>,
  blocks: { id: string; label: string }[],
): Record<string, BlockStatus> {
  const idSet = new Set(blocks.map((b) => b.id));
  const labelToId = new Map(blocks.map((b) => [b.label.toLowerCase().trim(), b.id]));
  const out: Record<string, BlockStatus> = { ...base };

  for (const [key, partial] of Object.entries(edits ?? {})) {
    const id = idSet.has(key) ? key : labelToId.get(key.toLowerCase().trim());
    if (!id) continue;
    out[id] = { ...(out[id] ?? EMPTY_BLOCK_STATUS), ...partial };
  }
  for (const id of idSet) if (!out[id]) out[id] = { ...EMPTY_BLOCK_STATUS };
  return out;
}

/** Names in `apps` not already in the master list (compared by normalized key). */
export function unknownInputNames(apps: InputApplication[], knownNames: string[]): string[] {
  const known = new Set(knownNames.map(normalizeInputKey));
  const out = new Set<string>();
  for (const a of apps ?? []) {
    if (a?.name && !known.has(normalizeInputKey(a.name))) out.add(a.name);
  }
  return [...out];
}
