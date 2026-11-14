"use client";

import type { FeatureCollection, GeoJsonObject, MultiPolygon, Polygon } from "geojson";
import * as L from "leaflet";
import { Crosshair, LocateFixed, MapPin } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Button } from "../../components/ui/button";
import { NativeSelect } from "../../components/ui/native-select";
import { getReferenceCase } from "../territory/reference";
import { layerNames, type TerritoryLayer } from "../territory/types";
import { inMap, type Coordinates } from "./draft";
import { PlaceSearch } from "./place-search";
import "leaflet/dist/leaflet.css";

const recorteTunari = [[-17.349, -66.166], [-17.332, -66.143]];
const city: L.LatLngTuple = [-17.3936, -66.1569];
const cityBounds = L.latLngBounds([-17.59, -66.31], [-17.23, -66.01]);
const primaryDistricts = new Set(["9", "13", "15"]);
type District = { codigo_distrito: string; nombre: string; latitud: number; longitud: number };
type MapProps = {
  selected: Coordinates | null;
  onSelect: (location: Coordinates) => void;
  onView: (view: string) => void;
  overview: boolean;
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

export default function ParcelMap({ selected, onSelect, onView, overview }: MapProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const marker = useRef<L.CircleMarker | null>(null);
  const [districts, setDistricts] = useState<District[]>([]);
  const [district, setDistrict] = useState("");
  const [showDistricts, setShowDistricts] = useState(true);
  const [districtError, setDistrictError] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [satellite, setSatellite] = useState(overview);
  const [satelliteError, setSatelliteError] = useState(false);
  const [locationStatus, setLocationStatus] = useState("");
  const [baseResult, setBaseResult] = useState<{ region: string; status: "ready" | "error" }>();
  const [layer, setLayer] = useState<TerritoryLayer | "">("");
  const [overlayError, setOverlayError] = useState(false);
  const select = useEffectEvent((coords: Coordinates) => onSelect(coords));
  const initialPoint = useEffectEvent(() => selected);
  const updateView = useEffectEvent((map: L.Map) => onView(currentView(map)));
  const region = selected ? pilotRegion(selected) : "custom";
  const baseStatus = baseResult?.region === region ? baseResult.status : "loading";
  const latitude = selected?.latitude;
  const longitude = selected?.longitude;

  useEffect(() => {
    if (!container.current) return;
    const initial = initialPoint();
    const map = L.map(container.current, {
      maxBounds: cityBounds,
      maxBoundsViscosity: 0.8,
      minZoom: 12,
      maxZoom: 18,
      scrollWheelZoom: false,
      zoomAnimation: false,
      markerZoomAnimation: false,
      zoomControl: false,
    }).setView(initial ? point(initial) : city, initial ? 15 : 12);
    mapRef.current = map;
    map.createPane("districts").style.zIndex = "425";
    map.createPane("territory").style.zIndex = "440";
    map.createPane("parcel-point").style.zIndex = "450";
    L.control.zoom({ position: "topright", zoomInTitle: "Acercar mapa", zoomOutTitle: "Alejar mapa" }).addTo(map);
    L.control.scale({ imperial: false }).addTo(map);
    map.attributionControl.setPrefix(false);
    marker.current = L.circleMarker(initial ? point(initial) : city, {
      radius: 8, color: "#ffffff", weight: 3, fillColor: "#173c30",
      fillOpacity: initial ? 1 : 0, opacity: initial ? 1 : 0,
      interactive: false, pane: "parcel-point",
    }).addTo(map);

    map.on("click", ({ latlng }: L.LeafletMouseEvent) => select({ latitude: latlng.lat, longitude: latlng.lng }));
    function updateLabels() {
      map.getContainer().classList.toggle("hide-district-labels", map.getZoom() >= 14);
    }
    map.on("zoomend", updateLabels);
    updateLabels();
    map.on("moveend resize", () => updateView(map));
    updateView(map);

    const onNetwork = () => setOnline(navigator.onLine);
    window.addEventListener("online", onNetwork);
    window.addEventListener("offline", onNetwork);
    const resize = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    resize.observe(container.current);
    return () => {
      window.removeEventListener("online", onNetwork);
      window.removeEventListener("offline", onNetwork);
      resize.disconnect();
      marker.current = null;
      mapRef.current = null;
      map.remove();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !showDistricts) return;
    const controller = new AbortController();
    let districtsOnMap: L.GeoJSON | undefined;
    fetch("/maps/cochabamba-distritos.geojson", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Distritos no disponibles");
        return response.json() as Promise<FeatureCollection<Polygon | MultiPolygon, District>>;
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        districtsOnMap = L.geoJSON<District>(data, {
          pane: "districts",
          attribution: '<a href="https://hogaria.com/geo">Hogaria</a> · Ciudatos Lab · <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap · ODbL</a>',
          style: (feature) => {
            const priority = primaryDistricts.has(feature?.properties.codigo_distrito ?? "");
            return { color: priority ? "#c7f399" : "#b7d2a8", weight: priority ? 2 : 1, opacity: 0.95, fillColor: priority ? "#98cd64" : "#638454", fillOpacity: 0.22 };
          },
          onEachFeature: (feature, layer) => {
            const info = feature.properties;
            const highlighted = primaryDistricts.has(info.codigo_distrito);
            const shape = layer as L.Polygon;
            const label = document.createElement("span");
            label.textContent = "D" + info.codigo_distrito;
            shape.options.bubblingMouseEvents = false;
            shape.bindTooltip(label, { direction: "center", permanent: true, interactive: false, className: "district-label" + (highlighted ? " priority-district" : "") });
            shape.on("click", ({ latlng }: L.LeafletMouseEvent) => {
              if (map.getZoom() < 14) {
                setDistrict(info.codigo_distrito);
                map.setView([info.latitud, info.longitud], 14, { animate: false });
              } else {
                select({ latitude: latlng.lat, longitude: latlng.lng });
              }
            });
          },
        }).addTo(map);
        setDistricts(data.features.map(({ properties }) => properties).sort((a, b) => Number(a.codigo_distrito) - Number(b.codigo_distrito)));
        setDistrictError(false);
      })
      .catch(() => { if (!controller.signal.aborted) setDistrictError(true); });
    return () => {
      controller.abort();
      districtsOnMap?.remove();
    };
  }, [showDistricts]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !satellite || !online) return;
    const imagery = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 18,
      attribution: '<a href="https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9">Imagen © Esri y colaboradores</a>',
    });
    let loaded = false;
    imagery.on("tileload", () => {
      loaded = true;
      setSatelliteError(false);
    });
    imagery.on("loading", () => { loaded = false; });
    imagery.on("load", () => { if (!loaded) setSatelliteError(true); });
    imagery.addTo(map);
    return () => { imagery.off(); imagery.remove(); };
  }, [online, satellite]);

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
          attribution: '<a href="https://www.openstreetmap.org/copyright">Recortes © OpenStreetMap</a>',
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
    if (latitude === undefined || longitude === undefined) {
      marker.current.setStyle({ opacity: 0, fillOpacity: 0 });
      return;
    }
    const latlng: L.LatLngTuple = [latitude, longitude];
    marker.current.setLatLng(latlng).setStyle({ opacity: 1, fillOpacity: 1 });
    const reference = getReferenceCase(latitude, longitude);
    if (!cityBounds.contains(latlng)) return;
    if (!map.getBounds().contains(latlng) || reference && map.getZoom() < 14) {
      map.setView(latlng, 15, { animate: false });
    }
  }, [latitude, longitude]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layer) return;
    const overlay = L.imageOverlay("", map.getBounds(), { pane: "territory", opacity: 0.68, interactive: false, alt: layerNames[layer] });
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

  function focusDistrict(code: string) {
    setDistrict(code);
    const map = mapRef.current;
    if (!map) return;
    const info = districts.find((item) => item.codigo_distrito === code);
    map.setView(info ? [info.latitud, info.longitud] : city, info ? 14 : 12, { animate: false });
  }

  function locate() {
    const map = mapRef.current;
    if (!map || !navigator.geolocation) {
      setLocationStatus("La ubicación no está disponible en este navegador.");
      return;
    }
    setLocationStatus("Buscando tu ubicación…");
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      if (mapRef.current !== map) return;
      const position: L.LatLngTuple = [coords.latitude, coords.longitude];
      if (!cityBounds.contains(position)) {
        setLocationStatus("Tu ubicación está fuera de la vista de Cochabamba.");
        return;
      }
      map.setView(position, 16, { animate: false });
      setLocationStatus("Vista centrada. Toca el mapa o elige «Marcar centro» para seleccionar el punto.");
    }, () => {
      if (mapRef.current === map) setLocationStatus("No se pudo obtener tu ubicación. Puedes marcar un punto a mano.");
    }, { timeout: 8000, maximumAge: 60000 });
  }

  return (
    <div className="panel">
      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <div className="grid content-start gap-1">
          <label className="text-sm font-semibold" htmlFor="district-selector">Distrito</label>
          <NativeSelect id="district-selector" value={district} onChange={(event) => focusDistrict(event.target.value)}>
            <option value="">Todo Cochabamba</option>
            {districts.map((info) => <option key={info.codigo_distrito} value={info.codigo_distrito}>{info.nombre}</option>)}
          </NativeSelect>
        </div>
        {overview && <PlaceSearch bounds={cityBounds} online={online} onLocate={(coords) => mapRef.current?.setView(point(coords), 16, { animate: false })} />}
        {!overview && <div className="grid content-start gap-1">
          <label className="text-sm font-semibold" htmlFor="gamc-layer-selector">Capa GAMC</label>
          <NativeSelect id="gamc-layer-selector" value={layer} onChange={(event) => {
            setOverlayError(false);
            setLayer(event.target.value as TerritoryLayer | "");
          }}>
            <option value="">Mapa base</option>
            {Object.entries(layerNames).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
          </NativeSelect>
        </div>}
      </div>
      <div className="relative isolate overflow-hidden rounded-xl">
        <div
          ref={container}
          role="region"
          aria-label={overview ? "Mapa de Cochabamba" : region === "la-maica" ? "Mapa de La Maica" : region === "tunari" ? "Mapa de Tirani" : "Mapa de la parcela"}
          data-overview={overview}
          className="parcel-viewport"
        />
        <Crosshair size={22} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-1/2 z-[410] -translate-x-1/2 -translate-y-1/2 text-white drop-shadow-[0_1px_2px_#173c30]" />
        <div className="absolute top-2.5 left-2.5 z-[500] flex flex-col items-start gap-1.5">
          <Button type="button" variant="secondary" className="parcel-map-action" onClick={locate}><LocateFixed size={17} aria-hidden="true" /> Mi ubicación</Button>
          <Button type="button" variant="secondary" className="parcel-map-action" onClick={() => {
            const center = mapRef.current?.getCenter();
            if (center) onSelect({ latitude: center.lat, longitude: center.lng });
          }}><MapPin size={17} aria-hidden="true" /> Marcar centro</Button>
        </div>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-4 text-sm font-semibold">
        <label className="inline-flex min-h-11 items-center gap-1.5"><input type="checkbox" className="size-4 accent-action" checked={showDistricts} onChange={(event) => setShowDistricts(event.target.checked)} /> Distritos</label>
        <label className="inline-flex min-h-11 items-center gap-1.5"><input type="checkbox" className="size-4 accent-action" checked={satellite && online} disabled={!online} onChange={(event) => {
          setSatelliteError(false);
          setSatellite(event.target.checked);
        }} /> Satélite</label>
      </div>
      {showDistricts && !districtError && <p className="mt-1 text-xs text-muted">D9, D13 y D15 resaltados. Confirma el distrito de tu parcela con GAMC.</p>}
      {locationStatus && <p className="mt-2 text-sm text-muted" role="status">{locationStatus}</p>}
      {districtError && showDistricts && <p role="status" className="mt-2 text-sm text-muted">No se pudieron cargar los distritos de referencia.</p>}
      {satellite && (!online || satelliteError) && <p role="status" className="mt-2 text-sm text-muted">Imágenes satelitales no disponibles. El mapa local sigue activo.</p>}
      {layer && <p className="mt-1 text-sm text-muted"><a className="underline" target="_blank" rel="noreferrer" href={`/api/territory?operation=legend&layer=${layer}`}>Abrir leyenda de {layerNames[layer]}</a></p>}
      {overlayError && layer && <p role="status" className="mt-2 text-sm text-muted">Capa GAMC no disponible en este momento.</p>}
      {region !== "custom" && baseStatus !== "ready" && <p role="status" className="mt-2 text-sm text-muted">
        {baseStatus === "loading" ? "Cargando el mapa base…" : "Mapa base no disponible. Puedes ingresar las coordenadas en el formulario."}
      </p>}
    </div>
  );
}
