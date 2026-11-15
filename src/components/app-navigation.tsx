"use client";

import { Droplets, MapPin, Menu, Sprout, UserRound, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { authClient } from "../lib/browser/auth-client";

const destinations = [
  { label: "Explorar", href: "/", icon: MapPin },
  { label: "Mis parcelas", href: "/la-maica/mi-parcela", icon: UserRound },
  { label: "Agua", href: "/la-maica/mi-proximo-turno", icon: Droplets },
  { label: "Rotaciones", href: "/la-maica/comparar", icon: Sprout },
] as const;

function NavigationLinks({ current, onNavigate }: { current: string; onNavigate?: () => void }) {
  return destinations.map(({ label, href, icon: Icon }) => (
    <a key={href} href={href} aria-current={href === current ? "page" : undefined} onClick={onNavigate}>
      <span className="nav-icon"><Icon size={19} aria-hidden="true" /></span>
      <span>{label}</span>
    </a>
  ));
}

function NavigationDrawer({ current }: { current: string }) {
  const drawer = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const desktop = window.matchMedia("(min-width: 55rem)");
    function closeOnMobile() {
      if (!desktop.matches && drawer.current?.open) {
        drawer.current.close();
        document.querySelector<HTMLAnchorElement>('.app-navigation a[aria-current="page"]')?.focus({ preventScroll: true });
      }
    }
    desktop.addEventListener("change", closeOnMobile);
    closeOnMobile();
    return () => desktop.removeEventListener("change", closeOnMobile);
  }, [open]);

  return (
    <div className="desktop-navigation">
      <button type="button" className="navigation-trigger" aria-label="Abrir menú" aria-haspopup="dialog"
        aria-expanded={open} aria-controls="navigation-drawer" onClick={(event) => {
          if (!drawer.current) return;
          event.currentTarget.focus({ preventScroll: true });
          drawer.current.showModal();
          setOpen(true);
        }}>
        <Menu size={22} aria-hidden="true" />
      </button>
      <dialog ref={drawer} id="navigation-drawer" className="navigation-drawer" aria-label="Menú"
        onClose={() => setOpen(false)} onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}>
        <button type="button" className="navigation-close" aria-label="Cerrar menú" autoFocus onClick={() => drawer.current?.close()}>
          <X size={20} aria-hidden="true" />
        </button>
        <nav className="navigation-drawer-links" aria-label="Navegación principal">
          <NavigationLinks current={current} onNavigate={() => drawer.current?.close()} />
        </nav>
      </dialog>
    </div>
  );
}

export function AppNavigation({ placement }: { placement: "desktop" | "mobile" }) {
  const path = usePathname();
  const { data: session } = authClient.useSession();
  if (!session) return null;
  const current = path === "/la-maica/mi-cultivo-y-mi-agua" ? "/la-maica/mi-parcela" : path;
  if (placement === "desktop") return <NavigationDrawer current={current} />;
  return (
    <nav className="app-navigation" aria-label="Navegación principal">
      <NavigationLinks current={current} />
    </nav>
  );
}
