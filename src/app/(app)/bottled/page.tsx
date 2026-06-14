import { redirect } from "next/navigation";

// Bottled inventory is now part of the unified Inventory page.
export default function BottledRedirect() {
  redirect("/inventory");
}
