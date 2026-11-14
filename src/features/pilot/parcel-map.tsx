"use client";

import type { GeoJsonObject } from "geojson";
import * as L from "leaflet";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { NativeSelect } from "../../components/ui/native-select";
import { getReferenceCase, referenceCases } from "../territory/reference";
import { layerNames, type TerritoryLayer } from "../territory/types";
import { inMap, pilotCoordinates, type Coordinates } from "./draft";
import "leaflet/dist/leaflet.css";

const recorteTunari = [[-17.349, -66.166], [-17.332, -66.143]];
type MapProps = {
  selected: Coordinates | null;
  onSelect: (location: Coordinates) => void;
  onView: (view: string) => void;
};

function point({ latitude, longitude }: Coordinates): L.LatLngTuple {
  return [latitude, longitude];
}

function pilotRegion(location: Coordinates) {
  if (inMap(location)) return "la-maica";
  const [[south, west], [north, east]] = recorteTunari;
  if (location.latitude >= south && location.latitude <= north && location.longitude >= west && location.longitude <= east) return "tunari";
  return "custom";
}

function currentView(map: L.Map) {
  const bounds = map.getBounds();
  const sw = L.CRS.EPSG3857.project(bounds.getSouthWest());
  const ne = L.CRS.EPSG3857.project(bounds.getNorthEast());
  const size = map.getSize();
  const scale = Math.min(1, 1024 / Math.max(size.x, size.y));
  return new URLSearchParams({
    bbox: [sw.x, sw.y, ne.x, ne.y].map((v) => v.toFixed(2)).join(","),
    width: String(Math.max(16, Math.round(size.x * scale))),
    height: String(Math.max(16, Math.round(size.y * scale))),
  }).toString();
}

export default function ParcelMap({ selected, onSelect, onView }: MapProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const marker = useRef<L.CircleMarker | null>(null);
  const [baseResult, setBaseResult] = useState<{ region: string; status: "ready" | "error" }>();
  const [layer, setLayer] = useState<TerritoryLayer | "">("");
  const [overlayError, setOverlayError] = useState(false);
  const select = useEffectEvent((coords: Coordinates) => onSelect(coords));
  const initialPoint = useEffectEvent(() => selected ?? pilotCoordinates);
  const updateView = useEffectEvent((map: L.Map) => onView(currentView(map)));
  const region = pilotRegion(selected ?? pilotCoordinates);
  const baseStatus = baseResult?.region === region ? baseResult.status : "loading";

  useEffect(() => {
    if (!container.current) return;
    const initial = initialPoint();
    const map = L.map(container.current, {
      maxBounds: [[-17.59, -66.31], [-17.23, -66.01]],
      maxBoundsViscosity: 0.8,
      minZoom: 12,
      maxZoom: 18,
      scrollWheelZoom: false,
      zoomAnimation: false,
      markerZoomAnimation: false,
      zoomControl: false,
    }).setView(point(initial), pilotRegion(initial) === "custom" ? 12 : 15);
    mapRef.current = map;
    L.control.zoom({ zoomInTitle: "Acercar mapa", zoomOutTitle: "Alejar mapa" }).addTo(map);
    L.control.scale({ imperial: false }).addTo(map);
    map.attributionControl.setPrefix(false);
    map.attributionControl.addAttribution('<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap</a>');
    marker.current = L.circleMarker(point(initial), {
      radius: 8, color: "#ffffff", weight: 3, fillColor: "#304d37", fillOpacity: 1, opacity: 1,
      interactive: false,
    }).addTo(map);

    map.on("click", ({ latlng }: L.LeafletMouseEvent) => select({ latitude: latlng.lat, longitude: latlng.lng }));
    map.on("moveend resize", () => updateView(map));
    updateView(map);

    const resize = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    resize.observe(container.current);
    return () => {
      resize.disconnect();
      marker.current = null;
      mapRef.current = null;
      map.remove();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || region === "custom") return;
    const controller = new AbortController();
    let base: L.GeoJSON | undefined;
    fetch(`/pilots/${region}/contexto-osm.geojson`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Mapa base no disponible");
        return response.json() as Promise<GeoJsonObject>;
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        base = L.geoJSON(data, {
          interactive: false,
          style: (feature) => {
            switch (feature?.properties.kind) {
              case "fields": return { color: "#99a482", weight: 0.6, fillColor: "#c7cda1", fillOpacity: 0.68 };
              case "water": return { color: "#5a8290", weight: 1.8, fillColor: "#8fb0b8", fillOpacity: 0.7 };
              default: return { color: "#8c8272", weight: 1.2, opacity: 0.8 };
            }
          },
        }).addTo(map).bringToBack();
        setBaseResult({ region, status: "ready" });
      })
      .catch(() => { if (!controller.signal.aborted) setBaseResult({ region, status: "error" }); });
    return () => {
      controller.abort();
      if (base) base.remove();
    };
  }, [region]);

  useEffect(() => {
    const map = mapRef.current;
    if (!marker.current || !map) return;
    if (!selected) {
      marker.current.setStyle({ opacity: 0, fillOpacity: 0 });
      return;
    }
    const latlng = point(selected);
    marker.current.setLatLng(latlng).setStyle({ opacity: 1, fillOpacity: 1 });
    const reference = getReferenceCase(selected.latitude, selected.longitude);
    if (reference && !map.getBounds().contains(latlng)) {
      map.setView(point(referenceCases[reference]), 15, { animate: false });
    }
  }, [selected]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layer) return;
    const overlay = L.imageOverlay("", map.getBounds(), { opacity: 0.68, interactive: false, alt: layerNames[layer] });
    function refresh() {
      if (!map) return;
      overlay.setBounds(map.getBounds()).setUrl(`/api/territory?operation=map&layer=${layer}&${currentView(map)}`);
    }
    overlay.on("error", () => setOverlayError(true));
    overlay.on("load", () => setOverlayError(false));
    refresh();
    overlay.addTo(map);
    map.on("moveend resize", refresh);
    return () => {
      map.off("moveend resize", refresh);
      overlay.off();
      overlay.remove();
    };
  }, [layer]);

  return (
    <>
      <label className="mb-2 inline-flex items-center gap-2 text-sm text-muted">
        Capa GAMC
        <NativeSelect className="w-auto" value={layer} onChange={(event) => {
          setOverlayError(false);
          setLayer(event.target.value as TerritoryLayer | "");
        }}>
          <option value="">Mapa base</option>
          {Object.entries(layerNames).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
        </NativeSelect>
      </label>
      <div ref={container} role="region" aria-label={region === "la-maica" ? "Mapa de La Maica" : region === "tunari" ? "Mapa de Tirani" : "Mapa de la parcela"} className="isolate h-80 w-full rounded-sm sm:h-[26rem]" style={{ backgroundColor: "#e5e8d8" }} />
      {layer && <p className="mt-1 text-sm text-muted"><a className="underline" target="_blank" rel="noreferrer" href={`/api/territory?operation=legend&layer=${layer}`}>Abrir leyenda de {layerNames[layer]}</a></p>}
      {overlayError && layer && <p role="status" className="mt-2 text-sm text-muted">Capa GAMC no disponible en este momento.</p>}
      {region !== "custom" && baseStatus !== "ready" && <p role="status" className="mt-2 text-sm text-muted">
        {baseStatus === "loading" ? "Cargando el mapa base…" : "Mapa base no disponible. Puedes ingresar las coordenadas en el formulario."}
      </p>}
      {region === "custom" && <p className="mt-2 text-sm text-muted">El punto está fuera de los recortes sin conexión. Puedes ubicarlo con sus coordenadas y consultar la capa distrital.</p>}
    </>
  );
}
