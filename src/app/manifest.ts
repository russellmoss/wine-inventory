import type { MetadataRoute } from "next";

// Phase 6 Unit 7: web app manifest (Next 16 App Router built-in). Lets the cellar tablet install
// the app to its home screen. Icons reuse the existing app icons (src/app/icon.svg + apple-icon.png).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Wine Inventory — Cellar",
    short_name: "Cellar",
    description: "Vineyard & cellar inventory, including the offline fermentation Round.",
    start_url: "/bulk",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#7c1d3f",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
