"use client";

import dynamic from "next/dynamic";
import { ArrowRight, MapPin } from "lucide-react";
import { useState, type SubmitEvent } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { getReferenceCase, referenceCases } from "../territory/reference";
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
        {(draft, save, status, markEdited, account) => (
          <ParcelFields parcel={draft?.parcel} explore={explore} account={account} save={(parcel) => save({ parcel })} status={status} markEdited={markEdited} />
        )}
      </DraftForm>
    </div>
  );
}

function ParcelFields({ parcel, explore, account, save, status, markEdited }: { parcel?: Parcel; explore: boolean; account: boolean; save: (parcel: Parcel) => Promise<void>; status: DraftStatus; markEdited: () => void }) {
  const initial = parcel ?? (explore ? null : pilotCoordinates);
  const [latitude, setLatitude] = useState(String(initial?.latitude ?? ""));
  const [longitude, setLongitude] = useState(String(initial?.longitude ?? ""));
  const [outline, setOutline] = useState(parcel?.outline);
  const [area, setArea] = useState(String(parcel?.areaHa ?? ""));
  const [error, setError] = useState("");
  const [mapOpen, setMapOpen] = useState(explore || !parcel);
  const [view, setView] = useState("");
  const [pointChosen, setPointChosen] = useState(!explore);
  const selected = coordinates(latitude, longitude);
  const mapPoint = pointChosen ? selected : null;
  const reference = selected ? getReferenceCase(selected.latitude, selected.longitude) : null;
  const params = new URLSearchParams(mapOpen ? view : "");
  if (selected) {
    params.set("lat", String(selected.latitude));
    params.set("lon", String(selected.longitude));
    if (outline) params.set("tipo", "parcela");
    if (outline && decimal(area) > 0) params.set("area", String(decimal(area)));
  }
  const savedTerritory = parcel && selected && parcel.latitude === selected.latitude &&
    parcel.longitude === selected.longitude ? parcel.territory : undefined;

  function selectPoint(point: Coordinates) {
    if (status === "saving") return;
    setPointChosen(true);
    setLatitude(point.latitude.toFixed(5));
    setLongitude(point.longitude.toFixed(5));
    setError("");
    markEdited();
  }

  function selectOutline(vertices: Coordinates[], center: Coordinates, areaHa: number) {
    if (status === "saving") return;
    selectPoint(center);
    setOutline(vertices);
    setArea(String(Number(areaHa.toFixed(4)) || areaHa));
  }

  function clearOutline() {
    if (outline) setArea("");
    setOutline(undefined);
  }

  function replacePoint(point: Coordinates) {
    if (status === "saving") return;
    clearOutline();
    selectPoint(point);
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
    void save({ ...point, name: String(values.get("name") ?? "").trim(), areaHa, ...(outline ? { outline } : {}), ...(savedTerritory ? { territory: savedTerritory } : {}) });
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
            {mapOpen && <ParcelMap overview={explore} selected={mapPoint} onSelect={replacePoint} onView={setView} outline={pointChosen ? outline : undefined} onOutline={selectOutline} />}
          </div>
          <div className="map-selected">
            <span className="map-emblem"><MapPin size={22} aria-hidden="true" /></span>
            <div className="min-w-0" role="status">
              <p>{mapPoint ? (outline ? "Parcela delimitada" : "Punto seleccionado") : "Selecciona un punto o dibuja tu parcela"}</p>
              {mapPoint && outline && decimal(area) > 0 && <p className="text-sm font-normal">Superficie aproximada: {decimal(area).toLocaleString("es-BO")} ha</p>}
              {mapPoint && <p className="text-sm font-normal text-muted">{outline && "Centro: "}{mapPoint.latitude.toFixed(5)}, {mapPoint.longitude.toFixed(5)}</p>}
            </div>
            {selected && <Button asChild className="w-full sm:ml-auto sm:w-auto">
              <a href={`/consulta?${params}`} target="_blank" rel="noopener">
                {!pointChosen ? "Abrir parcela guardada" : outline ? "Consultar esta parcela" : "Consultar ubicación"} <ArrowRight size={17} aria-hidden="true" />
              </a>
            </Button>}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Casos de referencia" role="group">
            {Object.entries(referenceCases).map(([key, option]) => (
              <Button key={key} type="button" variant="secondary" aria-pressed={Boolean(mapPoint && reference === key)} className="aria-pressed:border-action aria-pressed:bg-leaf" onClick={() => replacePoint(option)}>{option.label}</Button>
            ))}
          </div>
        </section>
        <section aria-labelledby="parcel-fields" className="panel">
          <h2 id="parcel-fields" className="text-xl font-bold">Datos de la parcela</h2>
          <p className="mt-1 text-sm text-muted">{account ? "Puedes editar los datos y guardar la parcela en tu cuenta." : "Puedes editar los datos y guardar la parcela en este dispositivo."}</p>
          <form className="mt-4" onSubmit={submit} onChange={() => { setError(""); markEdited(); }}>
            <fieldset disabled={status === "saving"} className="grid gap-4">
              <Field label="Nombre de la parcela (opcional)"><Input name="name" maxLength={100} defaultValue={parcel?.name ?? ""} /></Field>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-4">
                <Field label="Latitud"><Input name="latitude" inputMode="decimal" required value={latitude} onChange={(event) => { setLatitude(event.target.value); setPointChosen(true); clearOutline(); }} /></Field>
                <Field label="Longitud"><Input name="longitude" inputMode="decimal" required value={longitude} onChange={(event) => { setLongitude(event.target.value); setPointChosen(true); clearOutline(); }} /></Field>
              </div>
              <Field label="Superficie (ha, opcional)"><Input name="area" inputMode="decimal" value={area} onChange={event => setArea(event.target.value)} /></Field>
            </fieldset>
            {error && <p role="alert" className="mt-3 text-sm text-red-800">{error}</p>}
            <DraftActions status={status} next={{ href: "/la-maica/mi-cultivo-y-mi-agua", label: "Ir a cultivo y agua" }} />
          </form>
        </section>
      </div>
    </div>
  );
}
