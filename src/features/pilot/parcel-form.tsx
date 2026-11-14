"use client";

import dynamic from "next/dynamic";
import { MapPin } from "lucide-react";
import { useRef, useState, type SubmitEvent } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { ParcelClimate } from "../climate/parcel-climate";
import { getReferenceCase, referenceCases } from "../territory/reference";
import { TerritorySummary } from "../territory/summary";
import type { Territory } from "../territory/types";
import { coordinates, decimal, pilotCoordinates, type Coordinates, type Parcel } from "./draft";
import { DraftActions, DraftForm, DraftHeader, Field, type DraftStatus } from "./draft-form";

const ParcelMap = dynamic(() => import("./parcel-map"), {
  ssr: false,
  loading: () => <p role="status" className="parcel-viewport grid place-items-center rounded-2xl text-muted">Abriendo el mapa…</p>,
});

export function ParcelForm({ explore = false }: { explore?: boolean }) {
  return (
    <div className={explore ? "pb-6" : "py-6 sm:py-9"}>
      {!explore && <DraftHeader title="Mi parcela" description="Guarda la ubicación y los datos de tu parcela en este dispositivo." />}
      <DraftForm>
        {(draft, save, status, markEdited) => (
          <ParcelFields parcel={draft?.parcel} explore={explore} save={(parcel) => save({ parcel })} status={status} markEdited={markEdited} />
        )}
      </DraftForm>
    </div>
  );
}

function ParcelFields({ parcel, explore, save, status, markEdited }: { parcel?: Parcel; explore: boolean; save: (parcel: Parcel) => Promise<void>; status: DraftStatus; markEdited: () => void }) {
  const initial = parcel ?? (explore ? null : pilotCoordinates);
  const [latitude, setLatitude] = useState(String(initial?.latitude ?? ""));
  const [longitude, setLongitude] = useState(String(initial?.longitude ?? ""));
  const [error, setError] = useState("");
  const [mapOpen, setMapOpen] = useState(explore || !parcel);
  const [view, setView] = useState("");
  const [consulting, setConsulting] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [lookup, setLookup] = useState<{ point: Coordinates; result: Territory } | undefined>(
    parcel?.territory ? { point: parcel, result: parcel.territory } : undefined,
  );
  const activeLookup = useRef(0);
  const selected = coordinates(latitude, longitude);
  const reference = selected ? getReferenceCase(selected.latitude, selected.longitude) : null;
  const currentResult = lookup && selected?.latitude === lookup.point.latitude && selected.longitude === lookup.point.longitude ? lookup.result : undefined;

  function coordinatesEdited() {
    activeLookup.current += 1;
    setConsulting(false);
    setLookupError("");
  }

  function selectPoint(point: Coordinates) {
    if (status === "saving") return;
    setLatitude(point.latitude.toFixed(5));
    setLongitude(point.longitude.toFixed(5));
    coordinatesEdited();
    setError("");
    markEdited();
  }

  async function consult() {
    if (!selected) return;
    const attempt = ++activeLookup.current;
    setConsulting(true);
    setLookupError("");
    try {
      const params = new URLSearchParams({ lat: String(selected.latitude), lon: String(selected.longitude) });
      if (mapOpen && view) for (const [name, value] of new URLSearchParams(view)) params.set(name, value);
      const response = await fetch(`/api/territory?${params}`, { signal: AbortSignal.timeout(9000) });
      if (!response.ok) throw new Error("GAMC");
      const result = await response.json() as Territory;
      if (activeLookup.current !== attempt) return;
      if (Object.values({ district: result.district, periurban: result.periurban, drainage: result.drainage }).every((layer) => layer.status === "unavailable")) {
        setLookupError("No se pudo consultar el GAMC. Si ya guardaste una consulta, puedes seguir leyendo sus datos.");
      } else {
        setLookup({ point: selected, result });
        markEdited();
      }
    } catch {
      if (activeLookup.current === attempt) setLookupError("No se pudo consultar el GAMC. Revisa la conexión e inténtalo de nuevo.");
    } finally {
      if (activeLookup.current === attempt) setConsulting(false);
    }
  }

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const point = coordinates(latitude, longitude);
    const areaText = String(values.get("area") ?? "").trim();
    const areaHa = areaText ? decimal(areaText) : null;
    if (!point) return setError("Ingresa una latitud entre −90 y 90 y una longitud entre −180 y 180.");
    if (areaHa !== null && (!Number.isFinite(areaHa) || areaHa <= 0)) return setError("Ingresa una superficie mayor que cero, en hectáreas.");
    setError("");
    void save({ ...point, name: String(values.get("name") ?? "").trim(), areaHa, ...(currentResult ? { territory: currentResult } : {}) });
  }

  return (
    <div className="grid gap-6">
      <div className={explore ? "grid gap-6" : "grid items-start gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]"}>
        <section aria-labelledby="map-title" className={explore ? "map-section" : "min-w-0"}>
          {explore ? (
            <header className="map-section-heading">
              <span className="map-emblem"><MapPin size={22} aria-hidden="true" /></span>
              <div>
                <h2 id="map-title">Encuentra tu parcela</h2>
                <p>Busca una dirección o elige un distrito para acercarte.</p>
              </div>
            </header>
          ) : (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 id="map-title" className="text-xl font-bold">Mapa de referencia</h2>
              <Button type="button" variant="secondary" aria-controls="parcel-map" aria-expanded={mapOpen} onClick={() => setMapOpen(!mapOpen)}>{mapOpen ? "Ocultar mapa" : "Abrir mapa"}</Button>
            </div>
          )}
          <div id="parcel-map" hidden={!mapOpen}>
            {mapOpen && <ParcelMap overview={explore} selected={selected} onSelect={selectPoint} onView={setView} />}
          </div>
          {explore && <div className="map-selected">
            <span className="map-emblem"><MapPin size={22} aria-hidden="true" /></span>
            <span role="status">{selected ? `${selected.latitude.toFixed(5)}, ${selected.longitude.toFixed(5)}` : "Selecciona un punto del mapa"}</span>
            {selected && <Button asChild variant="secondary" className="sm:ml-auto"><a href="#clima-parcela">Ver clima y cultivos</a></Button>}
          </div>}
          {!mapOpen && <p className="text-sm text-muted">Puedes consultar o editar las coordenadas sin abrir el mapa.</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Casos de referencia" role="group">
            {Object.entries(referenceCases).map(([key, option]) => (
              <Button key={key} type="button" variant="secondary" aria-pressed={reference === key} className="aria-pressed:border-action aria-pressed:bg-leaf" onClick={() => selectPoint(option)}>{option.label}</Button>
            ))}
            {!explore && selected && <Button asChild variant="secondary"><a href="#clima-parcela">Ver clima y cultivos</a></Button>}
          </div>
        </section>
        <section aria-labelledby="parcel-fields" className="panel">
          <h2 id="parcel-fields" className="text-xl font-bold">Datos de la parcela</h2>
          <p className="mt-1 text-sm text-muted">Marca un punto o escribe las coordenadas. Tu borrador se guarda sin cuenta.</p>
          <form className="mt-4" onSubmit={submit} onChange={() => { setError(""); markEdited(); }}>
            <fieldset disabled={status === "saving"} className="grid gap-4">
              <Field label="Nombre de la parcela (opcional)"><Input name="name" maxLength={100} defaultValue={parcel?.name ?? ""} /></Field>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-4">
                <Field label="Latitud"><Input name="latitude" inputMode="decimal" required value={latitude} onChange={(event) => { setLatitude(event.target.value); coordinatesEdited(); }} /></Field>
                <Field label="Longitud"><Input name="longitude" inputMode="decimal" required value={longitude} onChange={(event) => { setLongitude(event.target.value); coordinatesEdited(); }} /></Field>
              </div>
              <Field label="Superficie (ha, opcional)"><Input name="area" inputMode="decimal" defaultValue={parcel?.areaHa ?? ""} /></Field>
            </fieldset>
            {error && <p role="alert" className="mt-3 text-sm text-red-800">{error}</p>}
            <DraftActions status={status} next={{ href: "/la-maica/mi-cultivo-y-mi-agua", label: "Ir a cultivo y agua" }} />
          </form>
        </section>
      </div>
      {selected && <ParcelClimate point={selected} />}
      <TerritorySummary reference={reference} result={currentResult} />
      <div className="grid justify-items-start gap-2">
        <Button type="button" variant="secondary" disabled={!selected || consulting || status === "saving"} onClick={() => void consult()}>{consulting ? "Consultando…" : "Consultar GAMC"}</Button>
        {lookupError && <p role="status" className="text-sm text-muted">{lookupError}</p>}
      </div>
    </div>
  );
}
