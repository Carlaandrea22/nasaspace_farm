"use client";

import { useState, type FormEvent } from "react";
import { MapPin, Search } from "lucide-react";

type Resultado = {
  geometry: { coordinates: [number, number] };
  properties: { name?: string; street?: string; housenumber?: string; locality?: string; city?: string };
};

export default function Buscador({ ubicar }: { ubicar: (lat: number, lng: number) => void }) {
  const [consulta, setConsulta] = useState("");
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [mensaje, setMensaje] = useState("");
  const [cargando, setCargando] = useState(false);

  async function buscar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const q = consulta.trim();
    if (q.length < 3 || cargando) return;
    setCargando(true);
    setMensaje("Buscando…");
    setResultados([]);
    try {
      const params = new URLSearchParams({ q, bbox: "-66.30,-17.57,-66.02,-17.23", limit: "6" });
      const respuesta = await fetch(`https://photon.komoot.io/api/?${params}`, { signal: AbortSignal.timeout(9000) });
      if (!respuesta.ok) throw new Error("Búsqueda no disponible");
      const datos: { features: Resultado[] } = await respuesta.json();
      setResultados(datos.features);
      setMensaje(datos.features.length ? "" : "Sin resultados. Prueba con el nombre de la calle o zona.");
    } catch {
      setMensaje("No pudimos buscar ahora. Intenta otra vez o usa el mapa.");
    } finally {
      setCargando(false);
    }
  }

  return <div className="buscador">
    <form className="campo" onSubmit={buscar}>
      <label htmlFor="direccion">Buscar dirección o lugar</label>
      <div className="buscador-mapa">
        <input id="direccion" type="search" value={consulta} onChange={e => setConsulta(e.target.value)}
          placeholder="Ej. Av. Panamericana" required minLength={3} maxLength={160}/>
        <button className="cuenta" disabled={cargando}><Search size={18}/> Buscar</button>
      </div>
    </form>
    <p role="status">{mensaje}</p>
    {resultados.length > 0 && <ul className="resultados-mapa" aria-label="Resultados">
      {resultados.map(({ properties: p, geometry }, i) => {
        const direccion = [p.street, p.housenumber].filter(Boolean).join(" ");
        const nombre = [...new Set([p.name, direccion, p.locality, p.city].filter(Boolean))].join(" · ");
        return <li key={i}><button onClick={() => {
          const [lng, lat] = geometry.coordinates;
          ubicar(lat, lng);
          setConsulta(nombre);
          setResultados([]);
        }}><MapPin size={17}/>{nombre || "Lugar en Cochabamba"}</button></li>;
      })}
    </ul>}
    <small>Direcciones de Photon y © OpenStreetMap</small>
  </div>;
}
