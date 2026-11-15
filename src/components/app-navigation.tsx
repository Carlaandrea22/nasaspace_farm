"use client";

import { Grid2x2, MapPinned, Menu, WavesHorizontal, Wheat, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";

const destinations = [
  { label: "Explorar", href: "/", icon: MapPinned },
  { label: "Agua", href: "/la-maica/mi-proximo-turno", icon: WavesHorizontal },
  { label: "Rotaciones", href: "/la-maica/comparar", icon: Wheat },
  { label: "Mis parcelas", href: "/la-maica/mi-parcela", icon: Grid2x2 },
] as const;

export function AppNavigation() {
  const path = usePathname();
  const drawer = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const current = path === "/la-maica/mi-cultivo-y-mi-agua" ? "/la-maica/mi-parcela" : path;

  return (
    <>
      <button
        type="button"
        className="navigation-trigger"
        aria-label="Abrir menú"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="navigation-drawer"
        onClick={(event) => {
          if (!drawer.current) return;
          event.currentTarget.focus({ preventScroll: true });
          drawer.current.showModal();
          setOpen(true);
        }}
      >
        <Menu size={22} aria-hidden="true" />
      </button>
      <dialog
        ref={drawer}
        id="navigation-drawer"
        className="navigation-drawer"
        aria-label="Menú"
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
      >
        <button type="button" className="navigation-close" aria-label="Cerrar menú" autoFocus onClick={() => drawer.current?.close()}>
          <X size={20} aria-hidden="true" />
        </button>
        <nav className="app-navigation" aria-label="Navegación principal">
          {destinations.map(({ label, href, icon: Icon }) => (
            <a key={href} href={href} aria-current={href === current ? "page" : undefined} onClick={() => drawer.current?.close()}>
              <Icon size={19} aria-hidden="true" />
              <span>{label}</span>
            </a>
          ))}
        </nav>
      </dialog>
    </>
  );
}
