import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Agua y Siembra · Field Shift",
    short_name: "Agua y Siembra",
    description: "Decisiones de cultivo y riego en Cochabamba.",
    lang: "es-BO",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f3f6ef",
    theme_color: "#f8faf5",
    icons: [
      { src: "/icons/field-shift-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/field-shift-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
