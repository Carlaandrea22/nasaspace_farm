"use client";

import dynamic from "next/dynamic";
import { useRef, useState, type SubmitEvent } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { getReferenceCase, referenceCases } from "../territory/reference";
import { TerritorySummary } from "../territory/summary";
import type { Territory } from "../territory/types";
import { coordinates, decimal, pilotCoordinates, type Coordinates, type Parcel } from "./draft";
import { DraftActions, DraftForm, DraftHeader, Field, type DraftStatus } from "./draft-form";

const ParcelMap = dynamic(() => import("./parcel-map"), {
  ssr: false,
  loading: () => <p role="status" className="grid h-80 place-items-center bg-action/5 text-muted">Abriendo el mapa…</p>,
});

export function ParcelForm() {
  return (
    <div className="py-8 sm:py-10">
      <DraftHeader title="Mi parcela" description="Marca la ubicación de tu parcela y guarda el borrador para retomarla en este dispositivo." parcel />
      <DraftForm>
        {(draft, save, status, markEdited) => (
          <ParcelFields parcel={draft?.parcel} save={(parcel) => save({ parcel })} status={status} markEdited={markEdited} />
        )}
      </DraftForm>
    </div>
  );
}

function ParcelFields({ parcel, save, status, markEdited }: { parcel?: Parcel; save: (parcel: Parcel) => Promise<void>; status: DraftStatus; markEdited: () => void }) {
  const [latitude, setLatitude] = useState(String(parcel?.latitude ?? pilotCoordinates.latitude));
  const [longitude, setLongitude] = useState(String(parcel?.longitude ?? pilotCoordinates.longitude));
  const [error, setError] = useState("");
  const [mapOpen, setMapOpen] = useState(!parcel);
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
      <div className="flex flex-wrap items-center gap-2" aria-label="Casos de referencia" role="group">
        {Object.entries(referenceCases).map(([key, option]) => (
          <Button key={key} type="button" variant="secondary" aria-pressed={reference === key} className="aria-pressed:border-action aria-pressed:bg-action/10" onClick={() => selectPoint(option)}>{option.label}</Button>
        ))}
      </div>
      <div className="grid items-start gap-8 lg:grid-cols-[1.55fr_1fr]">
        <section aria-labelledby="map-title" className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 id="map-title" className="font-display text-3xl">Mapa de referencia</h2>
            <Button type="button" variant="secondary" aria-controls="parcel-map" aria-expanded={mapOpen} onClick={() => setMapOpen(!mapOpen)}>{mapOpen ? "Ocultar mapa" : "Abrir mapa"}</Button>
          </div>
          <div id="parcel-map" hidden={!mapOpen}>
            {mapOpen && <ParcelMap selected={selected} onSelect={selectPoint} onView={setView} />}
            <p className="mt-3 text-sm text-muted">Toca el mapa para mover el punto o escribe las coordenadas. Los recortes muestran caminos, áreas agrícolas y cursos de agua.</p>
          </div>
          {!mapOpen && <p className="text-sm text-muted">Puedes consultar o editar las coordenadas sin abrir el mapa.</p>}
        </section>
        <section aria-labelledby="parcel-fields" className="border-t border-line pt-5 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
          <h2 id="parcel-fields" className="font-display text-3xl">Datos de la parcela</h2>
          <form className="mt-5" onSubmit={submit} onChange={() => setError("")}>
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
      <TerritorySummary reference={reference} result={currentResult} />
      <div className="grid justify-items-start gap-2">
        <Button type="button" variant="secondary" disabled={!selected || consulting || status === "saving"} onClick={() => void consult()}>{consulting ? "Consultando…" : "Consultar GAMC"}</Button>
        {lookupError && <p role="status" className="text-sm text-muted">{lookupError}</p>}
      </div>
    </div>
  );
}
