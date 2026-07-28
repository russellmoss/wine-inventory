import type { Metadata, Viewport } from "next";
import { Inter, Inter_Tight } from "next/font/google";
import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import "./globals.css";
import "../styles/print.css";

/**
 * Inter + Inter Tight, self-hosted by next/font (v2 §A7 "CHANGED — font loading").
 * These used to arrive via a render-blocking `@import` of fonts.googleapis.com at
 * the top of globals.css; on poor cellar wifi the entire type system fell back
 * while that request hung.
 *
 * They deliberately do NOT publish `--font-body` / `--font-heading` directly —
 * those tokens already exist in styles/tokens/typography.css and carry the whole
 * fallback stack. Publishing them here would either clobber that stack or tie on
 * specificity with `:root`. Instead each font gets its own variable, which
 * typography.css consumes at the head of the existing stack.
 */
const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });
const interTight = Inter_Tight({ subsets: ["latin"], display: "swap", variable: "--font-inter-tight" });

export const metadata: Metadata = {
  title: "Cellarhand",
  description: "Cellarhand — the winery operating system: inventory, production, records, financials, and scouting.",
  icons: {
    other: [{ rel: "mask-icon", url: "/safari-pinned-tab.svg", color: "#662D10" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#662D10",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`h-full antialiased ${inter.variable} ${interTight.variable}`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
