import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Field Shift · La Maica",
    short_name: "Field Shift",
    description: "Decisiones de cultivo y riego para La Maica, Cochabamba.",
    lang: "es-BO",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#eef0e7",
    theme_color: "#eef0e7",
    icons: [
      { src: "/icons/field-shift-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/field-shift-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
