"use server";

import { requireReadyUser } from "@/lib/dal";
import { isTenantAdminLike } from "@/lib/access";
import { isCustomCrushEnabled, isSparklingEnabled } from "@/lib/settings/data";
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

  // `isTenantAdminLike`, not a hand-rolled role compare: this used to miss
  // `developer`, so a developer's palette silently hid the admin destinations the
  // sidebar was showing them at the same moment. One predicate, one answer.
  const role = String(user.role ?? "").toLowerCase();
  const isAdmin = isTenantAdminLike(user);
  const isDeveloper = role === "developer";

  // The two capability gates, so the palette hides exactly what the sub-navs hide.
  // Without them Ctrl-K would offer "En Tirage" to a winery with no sparkling
  // program — a search hit that lands on a 404 (K14).
  const tenantId = user.supportOrganizationId ?? user.activeOrganizationId;
  const [sparkling, customCrush] = await Promise.all([
    tenantId ? isSparklingEnabled() : Promise.resolve(false),
    tenantId ? isCustomCrushEnabled() : Promise.resolve(false),
  ]);

  const hits = await searchEverything(query, {
    isAdmin,
    isDeveloper,
    // Admins reach every vineyard; a manager's real membership set decides the rest.
    // It was hard-coded to `isAdmin`, which is why a vineyard manager could not find
    // their own vineyard surfaces in search either (D5).
    hasVineyard: user.vineyardIds.length > 0 || isAdmin,
    sparkling,
    customCrush,
  });

  return { groups: groupHits(hits), question: looksLikeQuestion(query) };
}
