"use server";

import { navContext } from "@/lib/nav/server-context";
import { searchEverything } from "./query";
import { groupHits, looksLikeQuestion, type SearchGroup } from "./rank";

export interface PaletteResult {
  groups: SearchGroup[];
  /** True when the query reads as a question — the Ask row goes at the BOTTOM. */
  question: boolean;
}

/**
 * The command palette's read.
 *
 * Auth first, always: the search spans many tenant-scoped tables, so an
 * unauthenticated or org-less caller must get nothing rather than a partial
 * answer. The role context comes from the session, never from the client — a
 * client-supplied `isAdmin` would turn search into a privilege-escalation path.
 *
 * The context comes from `navContext()`, the SAME function the sub-navs use. It was
 * briefly a hand-rolled copy here — `role === "admin" || role === "owner"` (missing
 * `developer`), `hasVineyard: isAdmin`, and its own pair of capability reads — which
 * is exactly how the palette and the sidebar end up disagreeing about who sees what.
 * `navContext` calls `requireReadyUser()` itself, and that is `cache()`d per request,
 * so this is one auth check, not two.
 */
export async function paletteSearchAction(query: string): Promise<PaletteResult> {
  const ctx = await navContext();
  const hits = await searchEverything(query, ctx);
  return { groups: groupHits(hits), question: looksLikeQuestion(query) };
}
