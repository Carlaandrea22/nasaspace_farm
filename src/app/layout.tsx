import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { ServiceWorkerRegistration } from "../lib/browser/service-worker-registration";
import "@fontsource-variable/instrument-sans/wght.css";
import "@fontsource/instrument-serif/latin-400.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Field Shift", template: "%s | Field Shift" },
  description: "Decisiones de cultivo y riego para La Maica, Cochabamba.",
  icons: {
    icon: "/icons/field-shift-192.png",
    apple: "/icons/field-shift-180.png",
  },
};

export const viewport: Viewport = { themeColor: "#eef0e7" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-BO">
      <body>
        <a className="skip-link" href="#contenido">Ir al contenido</a>
        <header className="site-header page-width">
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a className="brand" href="/">Field Shift<span aria-hidden="true">.</span></a>
          <p>Cochabamba, Bolivia</p>
        </header>
        <main className="page-width" id="contenido">{children}</main>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
