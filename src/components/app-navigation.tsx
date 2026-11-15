"use client";

import { Droplets, MapPin, Sprout, UserRound } from "lucide-react";
import { usePathname } from "next/navigation";
import { authClient } from "../lib/browser/auth-client";

const destinations = [
  { label: "Explorar", href: "/", icon: MapPin },
  { label: "Mis parcelas", href: "/la-maica/mi-parcela", icon: UserRound },
  { label: "Agua", href: "/la-maica/mi-proximo-turno", icon: Droplets },
  { label: "Rotaciones", href: "/la-maica/comparar", icon: Sprout },
] as const;

export function AppNavigation() {
  const path = usePathname();
  const { data: session } = authClient.useSession();
  if (!session) return null;
  const current = path === "/la-maica/mi-cultivo-y-mi-agua" ? "/la-maica/mi-parcela" : path;
  return (
    <nav className="app-navigation" aria-label="Navegación principal">
      {destinations.map(({ label, href, icon: Icon }) => (
        <a key={href} href={href} aria-current={href === current ? "page" : undefined}>
          <span className="nav-icon"><Icon size={19} aria-hidden="true" /></span>
          <span>{label}</span>
        </a>
      ))}
    </nav>
  );
}
