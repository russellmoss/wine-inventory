import type { MetadataRoute } from "next";

// Web app manifest (Next 16 App Router built-in). Lets the cellar tablet install
// Cellarhand to its home screen. Icons live in /public/icons (see
// design-system/assets/logos/pwa). The mark favicon is src/app/icon.svg.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cellarhand",
    short_name: "Cellarhand",
    description: "The winery operating system — inventory, production, records, and the offline fermentation Round.",
    start_url: "/bulk",
    display: "standalone",
    background_color: "#F9F1E4",
    theme_color: "#662D10",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
