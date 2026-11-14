"use client";

import type { FeatureCollection, Point } from "geojson";
import type { LatLngBounds } from "leaflet";
import { MapPin, Search } from "lucide-react";
import { useState, type SubmitEvent } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { coordinates, type Coordinates } from "./draft";

type PlaceProperties = { name?: string; street?: string; locality?: string; city?: string };
type Place = { label: string; point: Coordinates };

export function PlaceSearch({ bounds, online, onLocate }: { bounds: LatLngBounds; online: boolean; onLocate: (point: Coordinates) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [message, setMessage] = useState("");
  const [searching, setSearching] = useState(false);

  async function search(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = query.trim();
    if (searching || !online || q.length < 3) return;
    setSearching(true);
    setResults([]);
    setMessage("Buscando lugares…");
    try {
      const params = new URLSearchParams({ q, bbox: bounds.toBBoxString(), limit: "6" });
      const response = await fetch(`https://photon.komoot.io/api/?${params}`, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error("Búsqueda no disponible");
      const data: FeatureCollection<Point, PlaceProperties> = await response.json();
      const places: Place[] = [];
      for (const { geometry, properties } of data.features) {
        if (geometry?.type !== "Point" || !properties) continue;
        const [lon, lat] = geometry.coordinates;
        const point = coordinates(String(lat), String(lon));
        if (!point || !bounds.contains([lat, lon])) continue;
        const label = [...new Set([properties.name, properties.street, properties.locality, properties.city].filter(Boolean))].join(" · ");
        places.push({ label: label || "Lugar en Cochabamba", point });
      }
      setResults(places);
      setMessage(places.length ? `${places.length} lugares encontrados.` : "Sin resultados en la zona. Prueba con otro nombre.");
    } catch {
      setMessage("Búsqueda no disponible. Puedes usar el mapa o ingresar coordenadas.");
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="min-w-0">
      <form onSubmit={search}>
        <label className="block text-sm font-semibold" htmlFor="place-query">Buscar lugar o dirección</label>
        <div className="mt-1 flex gap-2">
          <Input id="place-query" type="search" value={query} onChange={(event) => setQuery(event.target.value)}
            placeholder="Ej. Av. Panamericana" minLength={3} maxLength={160} required disabled={!online || searching} />
          <Button type="submit" variant="secondary" disabled={!online || searching}><Search size={16} aria-hidden="true" /> Buscar</Button>
        </div>
      </form>
      <p className="mt-1 text-xs text-muted">
        {online ? <>Búsqueda con <a className="underline" href="https://photon.komoot.io/">Photon</a> y © OpenStreetMap.</> : "Búsqueda de lugares disponible con conexión."}
      </p>
      {message && <p role="status" className="mt-1 text-xs text-muted">{message}</p>}
      {results.length > 0 && <ul className="mt-2 grid gap-1" aria-label="Lugares encontrados">
        {results.map(({ label, point }, index) => (
          <li key={index}>
            <Button type="button" variant="secondary" className="w-full justify-start text-left" onClick={() => {
              onLocate(point);
              setQuery(label);
              setResults([]);
              setMessage("Vista centrada en el lugar. Marca el punto en el mapa.");
            }}>
              <MapPin size={16} className="shrink-0" aria-hidden="true" /> {label}
            </Button>
          </li>
        ))}
      </ul>}
    </div>
  );
}
