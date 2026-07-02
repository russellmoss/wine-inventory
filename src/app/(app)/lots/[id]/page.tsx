import { notFound } from "next/navigation";
import { requireReadyUser } from "@/lib/dal";
import { getLotDetail } from "@/lib/lot/data";
import { getLotCostView } from "@/lib/cost/data";
import { LotDetailClient } from "./LotDetailClient";

// Read-only Lot detail (Phase 2): current-state header + reverse-chron operation feed
// from the ledger. params is a Promise in this Next build — await it; bad id -> notFound().
// Phase 8 (Unit 15): also loads the decomposed cost view for the trust panel.

export default async function LotDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireReadyUser();
  const { id } = await params;
  const lot = await getLotDetail(id);
  if (!lot) notFound();
  const cost = await getLotCostView(id);
  return <LotDetailClient lot={lot} cost={cost} />;
}
