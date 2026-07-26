import { redirect } from "next/navigation";

// Planting setup folded into the Reference vineyard editor ("Varieties & vineyards"): draw blocks, then
// "Finish setup" creates the planting area in one place. This route redirects so old links keep working.
export default function PlantingSetupRedirect() {
  redirect("/reference");
}
