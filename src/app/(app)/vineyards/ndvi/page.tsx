import { redirect } from "next/navigation";

// The NDVI console folded into the unified Map Explorer at /vineyards/maps. This route is kept as a
// permanent redirect so existing links, bookmarks, and the assistant's navigate tool keep working.
export default async function NdviRedirect({ searchParams }: { searchParams: Promise<{ vineyard?: string }> }) {
  const sp = await searchParams;
  redirect(sp.vineyard ? `/vineyards/maps?vineyard=${sp.vineyard}` : "/vineyards/maps");
}
