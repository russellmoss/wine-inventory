import type { Metadata } from "next";
import { requireReadyUser } from "@/lib/dal";
import { queryCalculationHistory } from "@/lib/winemaking-calc/log";
import CalculatorClient from "./CalculatorClient";
import { logCalculationAction } from "./actions";

export const metadata: Metadata = { title: "Winemaking Calculator" };

// PR2: thin server component — loads the user's recent calculation history and hands the client the
// logging server action + that initial history (traceability). Compute itself stays pure/client.
export default async function WinemakingCalculatorPage() {
  const user = await requireReadyUser();
  const initialHistory = await queryCalculationHistory(user, { limit: 20 });
  return <CalculatorClient initialHistory={initialHistory} logAction={logCalculationAction} />;
}
