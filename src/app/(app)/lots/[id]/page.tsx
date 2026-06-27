import { notFound } from "next/navigation";
import { requireReadyUser } from "@/lib/dal";
import { getLotDetail } from "@/lib/lot/data";
import { LotDetailClient } from "./LotDetailClient";

// Read-only Lot detail (Phase 2): current-state header + reverse-chron operation feed
// from the ledger. params is a Promise in this Next build — await it; bad id -> notFound().

export default async function LotDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireReadyUser();
  const { id } = await params;
  const lot = await getLotDetail(id);
  if (!lot) notFound();
  return <LotDetailClient lot={lot} />;
}
