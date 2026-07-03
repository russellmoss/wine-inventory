import type { Metadata, Viewport } from "next";
import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import "./globals.css";
import "../styles/print.css";

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
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
