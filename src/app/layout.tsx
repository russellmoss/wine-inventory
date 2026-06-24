import type { Metadata, Viewport } from "next";
import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bhutan Wine Company — Inventory",
  description: "Bulk, bottled, and finished-goods inventory for the Bhutan Wine Company.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
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
