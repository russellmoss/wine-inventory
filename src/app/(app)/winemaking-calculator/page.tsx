import type { Metadata } from "next";
import { requireReadyUser } from "@/lib/dal";
import { queryCalculationHistory } from "@/lib/winemaking-calc/log";
import CalculatorClient from "./CalculatorClient";
import { logCalculationAction } from "./actions";
import { HubSectionNav } from "@/components/nav/HubSectionNav";

export const metadata: Metadata = { title: "Winemaking Calculator" };

// PR2: thin server component — loads the user's recent calculation history and hands the client the
// logging server action + that initial history (traceability). Compute itself stays pure/client.
async function WinemakingCalculatorPageBody() {
  const user = await requireReadyUser();
  const initialHistory = await queryCalculationHistory(user, { limit: 20 });
  return <CalculatorClient initialHistory={initialHistory} logAction={logCalculationAction} />;
}

/** Plan 104 — this is a SECTION of /bulk, so it carries the same strip as its hub.
    Without it the strip is a one-way door: you use it once and it disappears. */
export default async function WinemakingCalculatorPage() {
  return (
    <>
      <HubSectionNav hub="/bulk" current="/winemaking-calculator" />
      <WinemakingCalculatorPageBody />
    </>
  );
}
