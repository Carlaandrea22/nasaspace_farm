import type { Metadata, Viewport } from "next";
import Image from "next/image";
import type { ReactNode } from "react";
import { AccountDialog } from "../components/account-dialog";
import { AppNavigation } from "../components/app-navigation";
import { ServiceWorkerRegistration } from "../lib/browser/service-worker-registration";
import "@fontsource-variable/dm-sans/wght.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Yaku", template: "%s | Yaku" },
  description: "Decisiones de cultivo y riego en Cochabamba.",
  icons: {
    icon: "/icons/yaku-mark-192.png",
    apple: "/icons/yaku-mark-180.png",
  },
};

export const viewport: Viewport = { themeColor: "#263d21" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-BO">
      <body>
        <a className="skip-link" href="#contenido">Ir al contenido</a>
        <header className="site-header">
          <div className="header-inner">
            <div className="header-brand">
              <AppNavigation placement="desktop" />
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a className="brand" href="/" aria-label="Yaku, inicio">
                <Image className="brand-mark" src="/icons/yaku-mark-192.png" alt="" width={44} height={44} loading="eager" unoptimized />
                <span><strong>Yaku</strong><small>Cochabamba</small></span>
              </a>
            </div>
            <AccountDialog />
          </div>
        </header>
        <div className="app-frame">
          <AppNavigation placement="mobile" />
          <main id="contenido" tabIndex={-1}>{children}</main>
        </div>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
