"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Droplets, MapPin, Printer, Scan, Sprout } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { Button } from "../../components/ui/button";
import { authClient } from "../../lib/browser/auth-client";
import { ParcelClimate } from "../climate/parcel-climate";
import { getReferenceCase, type ReferenceCase } from "../territory/reference";
import { coordinates, decimal, type Coordinates } from "./draft";
import { ConsultationProgress, type ConsultationMode, type ConsultationPhase } from "./consultation-progress";

const ParcelDecision = dynamic(() => import("./parcel-decision"), {
  loading: () => <p role="status">Abriendo la consulta…</p>,
});

export function ParcelReportQuery() {
  const params = useSearchParams();
  const point = coordinates(params.get("lat") ?? "", params.get("lon") ?? "");
  if (!point) return <section className="panel">
    <h1>Selecciona una ubicación</h1>
    <p>Marca un punto o dibuja una parcela para abrir su informe.</p>
    <Link href="/" className="mt-3 inline-block underline">Volver al mapa</Link>
  </section>;
  const area = decimal(params.get("area") ?? "");
  const reference = getReferenceCase(point.latitude, point.longitude);
  const demo = reference && params.get('demo') === reference && params.get('tipo') !== 'parcela' ? reference : undefined;
  return <ParcelReport key={params.toString()} point={point} parcel={params.get("tipo") === "parcela"}
    area={area > 0 ? area : null} demo={demo} savedParcelId={params.get("guardada") ?? undefined} />;
}

function ParcelReport({ point, parcel, area, demo, savedParcelId }: {
  point: Coordinates; parcel: boolean; area: number | null; demo?:ReferenceCase; savedParcelId?: string;
}) {
  const { data: session, isPending } = authClient.useSession();
  const [decision, setDecision] = useState<{ water?: boolean; rotations?: boolean }>({});
  const [progress, setProgress] = useState<Record<ConsultationMode, ConsultationPhase>>({water:'editing', rotations:'editing'});
  const updateProgress = useCallback((mode: ConsultationMode, phase: ConsultationPhase) => {
    setProgress(previous => previous[mode] === phase ? previous : {...previous, [mode]: phase});
  }, []);
  const report = useRef<HTMLElement>(null);
  const { latitude, longitude } = point;
  const selectedParcel = useMemo(() => ({ latitude, longitude, name: "", areaHa: area }), [latitude, longitude, area]);

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
    <ParcelClimate point={point} />
    <section aria-label="Decisiones para esta parcela" className="panel consulta-seccion grid gap-3">
      {demo&&<div className="mb-1 rounded-2xl bg-leaf/60 p-4">
        <p className="text-lg font-bold">Terreno de práctica: {demo==='tunari'?'Tirani':'La Maica'}</p>
        <p className="mt-1 text-sm">Ya elegiste un lugar con información de suelo disponible. Ahora elige qué quieres consultar y completa los datos del cultivo que quieras probar.</p>
      </div>}
      <div className="consulta-no-imprimir">
        <ConsultationProgress selected={Boolean(decision.water || decision.rotations)} phase={progress[decision.water ? 'water' : 'rotations']} />
        <h2 className="text-xl font-bold">¿Qué quieres hacer en este terreno?</h2>
        <p className="mt-1 text-sm text-muted">Elige una opción para comenzar. Te pediremos los datos que falten.</p>
      </div>
      <div className="consulta-no-imprimir grid gap-3 sm:grid-cols-2">
        <Button type="button" variant="secondary" className="consultation-choice min-h-16 whitespace-normal px-5 py-3 text-left leading-snug" aria-expanded={Boolean(decision.water)} aria-controls="parcel-water"
          onClick={() => setDecision(previous => ({ ...previous, water: !previous.water, rotations: previous.rotations && false }))}>
          <Droplets size={20} className="shrink-0" aria-hidden="true"/> <span>Ya tengo un cultivo y quiero revisar el agua</span>
        </Button>
        <Button type="button" variant="secondary" className="consultation-choice min-h-16 whitespace-normal px-5 py-3 text-left leading-snug" aria-expanded={Boolean(decision.rotations)} aria-controls="parcel-rotations"
          onClick={() => setDecision(previous => ({ ...previous, rotations: !previous.rotations, water: previous.water && false }))}>
          <Sprout size={20} className="shrink-0" aria-hidden="true"/> <span>Quiero planificar qué sembrar después</span>
        </Button>
      </div>
      <div className="consulta-decisiones-contenido" hidden={!decision.water&&!decision.rotations}>
        {(decision.water !== undefined || decision.rotations !== undefined) && (
          isPending && !session && !demo ? <p role="status">Abriendo la consulta…</p> :
            <ParcelDecision key={session?.user.id ?? "guest"} mode={decision.water ? 'water' : 'rotations'}
              parcel={selectedParcel} demo={demo} account={Boolean(session)} savedParcelId={savedParcelId} onProgress={updateProgress} />
        )}
      </div>
    </section>
    <div className="consulta-no-imprimir justify-self-end">
      <Button type="button" variant="secondary" className="consulta-imprimir" onClick={printReport}><Printer size={18} aria-hidden="true"/> Imprimir o guardar PDF</Button>
    </div>
  </article>;
}
