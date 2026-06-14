import { redirect } from "next/navigation";

// Finished goods are now part of the unified Inventory page.
export default function FinishedGoodsRedirect() {
  redirect("/inventory");
}
