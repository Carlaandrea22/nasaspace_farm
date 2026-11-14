import type { Metadata } from "next";
import type { ReactNode } from "react";
import "../estilo.css";
import "./visual.css";

export const metadata: Metadata = {
  title: "Agua y Siembra | Cochabamba",
  description: "Prototipo de apoyo a decisiones agrícolas en Cochabamba.",
};

export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="es-BO"><body>{children}</body></html>;
}
