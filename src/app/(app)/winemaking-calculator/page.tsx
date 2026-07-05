import type { Metadata } from "next";
import CalculatorClient from "./CalculatorClient";

export const metadata: Metadata = { title: "Winemaking Calculator" };

// Stateless in PR1 (pure client compute, no persistence). PR2 adds a server component wrapper
// that passes the logging server action + initial history down.
export default function WinemakingCalculatorPage() {
  return <CalculatorClient />;
}
