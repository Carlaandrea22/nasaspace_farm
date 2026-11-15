"use client";

import Link from "next/link";
import { ArrowLeft, ChevronRight, Map, MapPin, Printer, Scan, Sprout } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/button";
import { ParcelClimate } from "../climate/parcel-climate";
import { getReferenceCase } from "../territory/reference";
import { TerritorySummary } from "../territory/summary";
import type { Territory } from "../territory/types";
import type { Coordinates } from "./draft";

export function ParcelReport({ point, parcel, area, view }: {
  point: Coordinates; parcel: boolean; area: number | null; view: string;
}) {
  const [attempt, setAttempt] = useState(0);
  const [territory, setTerritory] = useState<Territory | null>();
  const report = useRef<HTMLElement>(null);
  const { latitude, longitude } = point;

  useEffect(() => {
    const request = new AbortController();
    const params = new URLSearchParams(view);
    params.set("lat", String(latitude));
    params.set("lon", String(longitude));
    fetch(`/api/territory?${params}`, { signal: AbortSignal.any([request.signal, AbortSignal.timeout(9000)]) })
      .then(async response => {
        if (!response.ok) throw new Error("GAMC");
        const result: Territory = await response.json();
        if (!request.signal.aborted) setTerritory(result);
      })
      .catch(() => { if (!request.signal.aborted) setTerritory(null); });
    return () => request.abort();
  }, [latitude, longitude, view, attempt]);

  function printReport() {
    const closed = report.current?.querySelectorAll<HTMLDetailsElement>("details:not([open])");
    closed?.forEach(item => { item.open = true; });
    try { window.print(); }
    finally { closed?.forEach(item => { item.open = false; }); }
  }

  return <article ref={report} className="consulta-informe grid min-w-0 gap-3">
    <header className="consulta-portada">
      <Link href="/" className="consulta-no-imprimir mb-3 inline-flex items-center gap-2 text-sm font-bold"><ArrowLeft size={17} aria-hidden="true"/> Volver al mapa</Link>
      <div className="consulta-portada-contenido">
        <div>
          <p className="consulta-etiqueta"><Sprout size={18} aria-hidden="true"/> {parcel ? "Informe de la parcela" : "Informe de ubicación"}</p>
          <h1>{parcel ? "¿Qué puedes cultivar en tu terreno?" : "¿Qué puedes cultivar aquí?"}</h1>
          <p className="mt-2 max-w-[36ch]">Conoce el clima de este lugar y compara las opciones de cultivo.</p>
        </div>
        <section className="consulta-portada-resumen">
          <h2>{parcel ? "Resumen de la parcela" : "Resumen de la ubicación"}</h2>
          <dl className="consulta-resumen">
            <div><dt><MapPin aria-hidden="true"/> Cochabamba, Bolivia</dt><dd>{latitude.toFixed(5)}, {longitude.toFixed(5)}</dd></div>
            {parcel && area !== null && <div><dt><Scan aria-hidden="true"/> Superficie aproximada</dt><dd>{area.toLocaleString("es-BO")} ha</dd></div>}
          </dl>
        </section>
      </div>
    </header>
    <ParcelClimate point={point} territory={<details className="consulta-detalle consulta-detalle-territorio">
      <summary><Map aria-hidden="true"/> <span>Contexto territorial<small>Límites, periurbanos y drenaje</small></span> <ChevronRight aria-hidden="true"/></summary>
      <TerritorySummary reference={getReferenceCase(latitude, longitude)} result={territory ?? undefined}>
        {territory === undefined && <p role="status">Consultando las capas municipales…</p>}
        {territory === null && <p role="status">Las capas municipales no están disponibles en este momento.</p>}
        {territory !== undefined && <Button type="button" variant="secondary" className="consulta-no-imprimir justify-self-start" onClick={() => {
          setTerritory(undefined); setAttempt(n => n + 1);
        }}>Actualizar datos municipales</Button>}
      </TerritorySummary>
    </details>}/>
    <div className="consulta-no-imprimir justify-self-end">
      <Button type="button" variant="secondary" className="consulta-imprimir" onClick={printReport}><Printer size={18} aria-hidden="true"/> Imprimir o guardar PDF</Button>
    </div>
  </article>;
}
