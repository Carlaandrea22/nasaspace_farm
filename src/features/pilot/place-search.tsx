"use client";

import type { FeatureCollection, Point } from "geojson";
import type { LatLngBounds } from "leaflet";
import { ArrowUpRight, MapPin, Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Input } from "../../components/ui/input";
import { coordinates, type Coordinates } from "./draft";

type PlaceProperties = { name?: string; street?: string; housenumber?: string; locality?: string; city?: string };
type Place = { title: string; locality: string; point: Coordinates };

export function PlaceSearch({ bounds, online, onLocate }: { bounds: LatLngBounds; online: boolean; onLocate: (point: Coordinates) => void }) {
  const id = useId();
  const entry = useRef<HTMLInputElement>(null);
  const cache = useRef(new Map<string, Place[]>());
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [reply, setReply] = useState<{ query: string; places: Place[]; error?: boolean }>();
  const value = query.trim();
  const searching = online && open && value.length >= 3;
  const current = reply?.query === value ? reply : undefined;
  const places = current?.places ?? [];
  const showing = searching && places.length > 0;

  useEffect(() => {
    if (!searching) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      const previous = cache.current.get(value);
      if (previous) {
        setReply({ query: value, places: previous });
        return;
      }
      try {
        const params = new URLSearchParams({ q: value, bbox: bounds.toBBoxString(), limit: "6" });
        const response = await fetch(`https://photon.komoot.io/api/?${params}`, {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(9000)]),
        });
        if (!response.ok) throw new Error("Búsqueda no disponible");
        const data: FeatureCollection<Point, PlaceProperties> = await response.json();
        if (controller.signal.aborted) return;
        const results: Place[] = [];
        for (const { geometry, properties } of data.features) {
          if (geometry?.type !== "Point" || !properties) continue;
          const [lon, lat] = geometry.coordinates;
          const point = coordinates(String(lat), String(lon));
          if (!point || !bounds.contains([lat, lon])) continue;
          const address = [properties.street, properties.housenumber].filter(Boolean).join(" ");
          const title = properties.name || address || properties.locality || "Lugar en Cochabamba";
          const locality = [...new Set([address, properties.locality, properties.city].filter((part) => part && part !== title))].join(" · ");
          results.push({ title, locality, point });
        }
        if (cache.current.size >= 30) cache.current.clear();
        cache.current.set(value, results);
        setReply({ query: value, places: results });
      } catch {
        if (!controller.signal.aborted) setReply({ query: value, places: [], error: true });
      }
    }, 340);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [bounds, searching, value]);

  function choose(place: Place) {
    onLocate(place.point);
    setQuery(place.title);
    setOpen(false);
    setActive(-1);
  }

  function close() {
    setOpen(false);
    setActive(-1);
  }

  return (
    <div className="place-search" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) close(); }}>
      <label className="map-control-label" htmlFor={id}><Search size={20} aria-hidden="true" /> Buscar dirección o lugar</label>
      <div className="place-search-input">
        <Search size={20} aria-hidden="true" />
        <Input
          ref={entry}
          id={id}
          type="search"
          role="combobox"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={showing}
          aria-controls={id + "-suggestions"}
          aria-activedescendant={showing && places[active] ? id + "-" + active : undefined}
          value={query}
          placeholder="Ej. Av. Panamericana"
          maxLength={160}
          disabled={!online}
          onFocus={() => setOpen(true)}
          onChange={(event) => { setQuery(event.target.value); setActive(-1); setOpen(true); }}
          onKeyDown={(event) => {
            if (event.key === "Escape") close();
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
              if (!places.length) return;
              const direction = event.key === "ArrowDown" ? 1 : -1;
              setActive((index) => index < 0 ? (direction === 1 ? 0 : places.length - 1) : (index + direction + places.length) % places.length);
            }
            if (event.key === "Enter" && showing) {
              event.preventDefault();
              choose(places[active] ?? places[0]);
            }
          }}
        />
        {query && <button type="button" aria-label="Borrar dirección" onClick={() => {
          setQuery(""); setActive(-1); entry.current?.focus();
        }}><X size={17} aria-hidden="true" /></button>}
      </div>
      <p className="mt-1 text-xs text-muted">
        {online ? <>Búsqueda con <a className="underline" href="https://photon.komoot.io/">Photon</a> y © OpenStreetMap.</> : "Búsqueda de lugares disponible con conexión."}
      </p>
      {searching && !places.length && <p className="place-search-popup p-3 text-sm" role="status">
        {!current ? "Buscando lugares…" : current.error ? "Búsqueda no disponible. Intenta otra dirección." : "Sin resultados. Prueba con una calle o zona."}
      </p>}
      <ul id={id + "-suggestions"} className="place-search-popup" role="listbox" aria-label="Direcciones sugeridas" hidden={!showing}>
        {places.map((place, index) => (
          <li id={id + "-" + index} key={index} role="option" aria-selected={active === index}
            onMouseDown={(event) => event.preventDefault()} onClick={() => choose(place)}>
            <MapPin size={18} aria-hidden="true" />
            <span className="min-w-0"><strong className="block">{place.title}</strong><small className="text-muted">{place.locality}</small></span>
            <ArrowUpRight size={16} aria-hidden="true" />
          </li>
        ))}
      </ul>
    </div>
  );
}
