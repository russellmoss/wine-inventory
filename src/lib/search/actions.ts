"use server";

import { requireReadyUser } from "@/lib/dal";
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
 */
export async function paletteSearchAction(query: string): Promise<PaletteResult> {
  const user = await requireReadyUser();

  const role = String(user.role ?? "").toLowerCase();
  const isAdmin = role === "admin" || role === "owner";

  const hits = await searchEverything(query, {
    isAdmin,
    isDeveloper: Boolean((user as { isDeveloper?: boolean }).isDeveloper),
    // Admins see vineyard destinations regardless; a non-admin's membership is
    // resolved by the destination filter itself.
    hasVineyard: isAdmin,
  });

  return { groups: groupHits(hits), question: looksLikeQuestion(query) };
}
