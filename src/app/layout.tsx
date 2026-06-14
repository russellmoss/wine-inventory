import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bhutan Wine Company — Inventory",
  description: "Bulk, bottled, and finished-goods inventory for the Bhutan Wine Company.",
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
