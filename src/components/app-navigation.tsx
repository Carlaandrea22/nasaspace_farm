"use client";

import { Droplets, MapPin, Sprout, UserRound } from "lucide-react";
import { usePathname } from "next/navigation";

const destinations = [
  { label: "Explorar", href: "/", icon: MapPin },
  { label: "Agua", href: "/la-maica/mi-proximo-turno", icon: Droplets },
  { label: "Rotaciones", href: "/la-maica/comparar", icon: Sprout },
  { label: "Mis parcelas", href: "/la-maica/mi-parcela", icon: UserRound },
] as const;

export function AppNavigation() {
  const path = usePathname();
  const current = path === "/la-maica/mi-cultivo-y-mi-agua" ? "/la-maica/mi-parcela" : path;
  return (
    <nav className="app-navigation" aria-label="Navegación principal">
      {destinations.map(({ label, href, icon: Icon }) => (
        <a key={href} href={href} aria-current={href === current ? "page" : undefined}>
          <Icon size={21} aria-hidden="true" />
          <span>{label}</span>
        </a>
      ))}
    </nav>
  );
}
