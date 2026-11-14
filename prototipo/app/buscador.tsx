"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, MapPin, Search, X } from "lucide-react";

type Resultado = {
  geometry: { coordinates: [number, number] };
  properties: { name?: string; street?: string; housenumber?: string; locality?: string; city?: string };
};

function rotulo({ properties: p }: Resultado) {
  const direccion = [p.street, p.housenumber].filter(Boolean).join(" ");
  const titulo = p.name || direccion || p.locality || "Lugar en Cochabamba";
  const zona = [...new Set([direccion, p.locality, p.city].filter(v => v && v !== titulo))].join(" · ");
  return { titulo, zona };
}

export default function Buscador({ ubicar }: { ubicar: (lat: number, lng: number) => void }) {
  const [consulta, setConsulta] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(-1);
  const [respuesta, setRespuesta] = useState<{ q: string; lugares: Resultado[]; error?: boolean }>();
  const cache = useRef(new Map<string, Resultado[]>());
  const entrada = useRef<HTMLInputElement>(null);
  const q = consulta.trim();
  const buscando = abierto && q.length >= 3;
  const actual = respuesta?.q === q ? respuesta : undefined;
  const lugares = actual?.lugares ?? [];

  useEffect(() => {
    if (!buscando) return;
    const solicitud = new AbortController();
    const espera = window.setTimeout(async () => {
      const previo = cache.current.get(q);
      if (previo) {
        setRespuesta({ q, lugares: previo });
        return;
      }
      try {
        const params = new URLSearchParams({ q, bbox: "-66.30,-17.57,-66.02,-17.23", limit: "6" });
        const url = process.env.NEXT_PUBLIC_PHOTON_URL || "https://photon.komoot.io/api/";
        const res = await fetch(`${url}?${params}`, {
          signal: AbortSignal.any([solicitud.signal, AbortSignal.timeout(9000)])
        });
        if (!res.ok) throw new Error("Búsqueda no disponible");
        const datos: { features: Resultado[] } = await res.json();
        if (solicitud.signal.aborted) return;
        if (cache.current.size >= 30) cache.current.clear();
        cache.current.set(q, datos.features);
        setRespuesta({ q, lugares: datos.features });
      } catch {
        if (!solicitud.signal.aborted) setRespuesta({ q, lugares: [], error: true });
      }
    }, 340);
    return () => { window.clearTimeout(espera); solicitud.abort(); };
  }, [buscando, q]);

  function elegir(lugar: Resultado) {
    const [lng, lat] = lugar.geometry.coordinates;
    ubicar(lat, lng);
    setConsulta(rotulo(lugar).titulo);
    setAbierto(false);
    setActivo(-1);
    entrada.current?.blur();
  }

  return <div className="buscador campo" onBlur={e => {
    if (!e.currentTarget.contains(e.relatedTarget)) setAbierto(false);
  }}>
    <label className="rotulo-control" htmlFor="direccion"><Search size={20} aria-hidden="true"/> Buscar dirección o lugar</label>
    <div className="buscador-mapa">
      <Search size={20} aria-hidden="true"/>
      <input ref={entrada} id="direccion" type="search" role="combobox" autoComplete="off"
        aria-autocomplete="list" aria-expanded={buscando && lugares.length > 0} aria-controls="sugerencias"
        aria-activedescendant={buscando && activo >= 0 && lugares[activo] ? `direccion-${activo}` : undefined}
        value={consulta} placeholder="Ej. Av. Panamericana" maxLength={160}
        onFocus={() => setAbierto(true)}
        onChange={e => { setConsulta(e.target.value); setActivo(-1); setAbierto(true); }}
        onKeyDown={e => {
          if (e.key === "Escape") { setAbierto(false); setActivo(-1); }
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setAbierto(true);
            if (lugares.length) setActivo(i => i < 0 ? (e.key === "ArrowDown" ? 0 : lugares.length - 1) :
              (i + (e.key === "ArrowDown" ? 1 : -1) + lugares.length) % lugares.length);
          }
          if (e.key === "Enter" && buscando && lugares.length) { e.preventDefault(); elegir(lugares[activo] ?? lugares[0]); }
        }}/>
      {consulta && <button type="button" aria-label="Borrar dirección" onClick={() => {
        setConsulta(""); setActivo(-1); entrada.current?.focus();
      }}><X size={17}/></button>}
    </div>
    {buscando && lugares.length === 0 && <p className="estado-busqueda" role="status">
      {!actual ? "Buscando lugares…" : actual.error ? "Búsqueda no disponible. Intenta otra dirección." : "Sin resultados. Prueba con una calle o zona."}
    </p>}
    <ul id="sugerencias" className="resultados-mapa" role="listbox" aria-label="Direcciones sugeridas" hidden={!buscando || !lugares.length}>
      {lugares.map((lugar, i) => {
        const { titulo, zona } = rotulo(lugar);
        return <li id={`direccion-${i}`} key={i} role="option" aria-selected={activo === i}
          onMouseDown={e => e.preventDefault()} onClick={() => elegir(lugar)}>
          <MapPin size={18} aria-hidden="true"/><span><strong>{titulo}</strong><small>{zona}</small></span><ArrowUpRight size={16} aria-hidden="true"/>
        </li>;
      })}
    </ul>
  </div>;
}
