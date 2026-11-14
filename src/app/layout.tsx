import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Sprout } from "lucide-react";
import { AppNavigation } from "../components/app-navigation";
import { ServiceWorkerRegistration } from "../lib/browser/service-worker-registration";
import "@fontsource-variable/dm-sans/wght.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Agua y Siembra | Field Shift", template: "%s | Agua y Siembra" },
  description: "Decisiones de cultivo y riego en Cochabamba.",
  icons: {
    icon: "/icons/field-shift-192.png",
    apple: "/icons/field-shift-180.png",
  },
};

export const viewport: Viewport = { themeColor: "#f8faf5" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-BO">
      <body>
        <a className="skip-link" href="#contenido">Ir al contenido</a>
        <header className="site-header">
          <div className="header-inner">
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a className="brand" href="/">
              <span className="brand-mark"><Sprout size={23} aria-hidden="true" /></span>
              <span><strong>Agua y Siembra</strong><small>Cochabamba</small></span>
            </a>
            <a className="project-link" href="/la-maica">Piloto La Maica</a>
          </div>
        </header>
        <div className="app-frame">
          <AppNavigation />
          <main id="contenido" tabIndex={-1}>{children}</main>
        </div>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
