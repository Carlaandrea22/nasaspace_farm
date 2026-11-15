"use client";

import type { FeatureCollection, GeoJsonObject, MultiPolygon, Polygon } from "geojson";
import * as L from "leaflet";
import { ChevronDown, Crop, Crosshair, Layers2, LocateFixed, MapPinned } from "lucide-react";
import { useCallback, useEffect, useEffectEvent, useId, useRef, useState } from "react";
import { Button } from "../../components/ui/button";
import { NativeSelect } from "../../components/ui/native-select";
import { getReferenceCase, referenceCases, type ReferenceCase } from "../territory/reference";
import { layerNames, type TerritoryLayer } from "../territory/types";
import { inMap, type Coordinates } from "./draft";
import "leaflet/dist/leaflet.css";
import "maplibre-gl/dist/maplibre-gl.css";

const recorteTunari = [[-17.349, -66.166], [-17.332, -66.143]];
const city: L.LatLngTuple = [-17.3936, -66.1569];
const cityBounds = L.latLngBounds([-17.59, -66.31], [-17.23, -66.01]);
const overviewPadding = L.point(38, 38);
const zoomSnap = 0.25;
const satelliteTiles = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const primaryDistricts = new Set(["9", "13", "15"]);
const outlineCorners = 4;
const clickDelayMs = 500;
type District = { codigo_distrito: string; nombre: string; latitud: number; longitud: number };
type MapProps = {
  selected: Coordinates | null;
  onSelect: (location: Coordinates) => void;
  onView: (view: string) => void;
  onOutline: (vertices: Coordinates[], center: Coordinates, areaHa: number) => void;
  outline?: Coordinates[];
  overview: boolean;
};

function point({ latitude, longitude }: Coordinates): L.LatLngTuple {
  return [latitude, longitude];
}

function overviewZoom(map: L.Map) {
  const available = map.getSize().subtract(overviewPadding);
  const extent = map.project(cityBounds.getSouthEast(), 0).subtract(map.project(cityBounds.getNorthWest(), 0));
  const scale = Math.min(Math.max(1, available.x) / extent.x, Math.max(1, available.y) / extent.y);
  const step = L.Browser.any3d ? zoomSnap : 1;
  // Recalculate without the previous minimum so the overview can adapt to a smaller viewport.
  return Math.max(8, Math.floor(map.getScaleZoom(scale, 0) / step) * step);
}

function showCityOverview(map: L.Map) {
  map.setView(cityBounds.getCenter(), map.getMinZoom(), { animate: false });
}

function satellitePreview(map: L.Map) {
  const zoom = 8;
  const tileSize = 256;
  // Include the margins around the city that can be visible in the overview.
  const coverage = cityBounds.pad(2);
  const first = map.project(coverage.getNorthWest(), zoom).divideBy(tileSize).floor();
  const last = map.project(coverage.getSouthEast(), zoom).divideBy(tileSize).floor();
  const images: L.ImageOverlay[] = [];
  for (let y = first.y; y <= last.y; y++) {
    for (let x = first.x; x <= last.x; x++) {
      const nw = map.unproject(L.point(x * tileSize, y * tileSize), zoom);
      const se = map.unproject(L.point((x + 1) * tileSize, (y + 1) * tileSize), zoom);
      // Image overlays keep their content when Leaflet resets the detailed tile grid.
      images.push(L.imageOverlay(L.Util.template(satelliteTiles, { x, y, z: zoom }), L.latLngBounds(nw, se), {
        pane: "tilePane", zIndex: 0, className: "satellite-preview",
      }));
    }
  }
  return images;
}

function pilotRegion(location: Coordinates) {
  if (inMap(location)) return "la-maica";
  const [[south, west], [north, east]] = recorteTunari;
  if (location.latitude >= south && location.latitude <= north && location.longitude >= west && location.longitude <= east) return "tunari";
  return "custom";
}

function currentView(map: L.Map, bounds = map.getBounds()) {
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

export default function ParcelMap({ selected, onSelect, onView, overview, outline, onOutline }: MapProps) {
  const gestureHint = useId();
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const marker = useRef<L.CircleMarker | null>(null);
  const gps = useRef<L.LayerGroup | null>(null);
  const manualAction = useRef(0);
  const pendingClick = useRef<number | undefined>(undefined);
  const districtBounds = useRef(new Map<string, L.LatLngBounds>());
  const focusedDistrict = useRef("");
  const [drawing, setDrawing] = useState(false);
  const [vertices, setVertices] = useState<Coordinates[]>([]);
  const [drawError, setDrawError] = useState("");
  const [districts, setDistricts] = useState<District[]>([]);
  const [districtLayer, setDistrictLayer] = useState<L.GeoJSON<District>>();
  const [district, setDistrict] = useState("");
  const [showDistricts, setShowDistricts] = useState(true);
  const [districtError, setDistrictError] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [satellite, setSatellite] = useState(() => !window.matchMedia("(pointer: coarse)").matches);
  const [locationStatus, setLocationStatus] = useState("");
  const [locating, setLocating] = useState(false);
  const [satelliteError, setSatelliteError] = useState(false);
  const [baseResult, setBaseResult] = useState<{ region: string; status: "ready" | "error" }>();
  const [layer, setLayer] = useState<TerritoryLayer | "">("");
  const [overlayError, setOverlayError] = useState(false);
  const handleTerrain = useEffectEvent((coords: Coordinates) => {
    if (!cityBounds.contains(point(coords))) return;
    if (drawing) {
      if (vertices.length >= outlineCorners) return;
      const next = [...vertices, coords];
      setDrawError("");
      setVertices(next);
      if (next.length === outlineCorners) finishOutline(next);
    } else onSelect(coords);
  });
  const isDrawing = useEffectEvent(() => drawing);
  const focus = useEffectEvent((code: string) => focusDistrict(code));
  const initialPoint = useEffectEvent(() => selected);
  const updateView = useEffectEvent((map: L.Map) => onView(currentView(map)));
  const region = selected ? pilotRegion(selected) : "custom";
  const baseStatus = baseResult?.region === region ? baseResult.status : "loading";
  const latitude = selected?.latitude;
  const longitude = selected?.longitude;

  const cancelMapClick = useCallback(() => {
    window.clearTimeout(pendingClick.current);
    pendingClick.current = undefined;
  }, []);

  const afterSingleClick = useCallback((event: L.LeafletMouseEvent, action: () => void) => {
    cancelMapClick();
    if ((event.originalEvent as MouseEvent).detail > 1) return;
    pendingClick.current = window.setTimeout(action, clickDelayMs);
  }, [cancelMapClick]);

  useEffect(() => {
    if (!container.current) return;
    const initial = initialPoint();
    const map = L.map(container.current, {
      zoomSnap,
      maxZoom: 18,
      maxBounds: cityBounds,
      maxBoundsViscosity: 1,
      scrollWheelZoom: true,
      wheelPxPerZoomLevel: 100,
      touchZoom: true,
      bounceAtZoomLimits: false,
      zoomAnimation: false,
      markerZoomAnimation: false,
      zoomControl: false,
      trackResize: false,
    });
    map.setMinZoom(overviewZoom(map));
    showCityOverview(map);
    mapRef.current = map;
    map.createPane("districts").style.zIndex = "425";
    const streetLabels = map.createPane("streetLabels");
    streetLabels.style.zIndex = "420";
    streetLabels.style.pointerEvents = "none";
    map.createPane("territory").style.zIndex = "440";
    map.createPane("parcel-point").style.zIndex = "450";
    L.control.zoom({ position: "bottomright", zoomInTitle: "Acercar mapa", zoomOutTitle: "Alejar mapa" }).addTo(map);
    L.control.scale({ imperial: false }).addTo(map);
    map.attributionControl.setPrefix(false);
    marker.current = L.circleMarker(initial ? point(initial) : city, {
      radius: 10, color: "#ffffff", weight: 3, fillColor: "#315a25",
      fillOpacity: initial ? 1 : 0, opacity: initial ? 1 : 0,
      interactive: false, pane: "parcel-point",
    }).addTo(map);

    map.on("dragstart zoomstart dblclick", () => {
      cancelMapClick();
      manualAction.current += 1;
    });
    map.on("click", (event: L.LeafletMouseEvent) => {
      const { latlng } = event;
      manualAction.current += 1;
      afterSingleClick(event, () => handleTerrain({ latitude: latlng.lat, longitude: latlng.lng }));
    });
    function updateLabels() {
      const zoom = map.getZoom();
      map.getContainer().classList.toggle("overview-district-labels", zoom < 11);
      map.getContainer().classList.toggle("hide-district-labels", zoom >= 13.5);
    }
    map.on("zoomend", updateLabels);
    updateLabels();
    map.on("moveend resize", () => updateView(map));
    updateView(map);

    const onNetwork = () => setOnline(navigator.onLine);
    window.addEventListener("online", onNetwork);
    window.addEventListener("offline", onNetwork);
    const resize = new ResizeObserver(() => {
      const atOverview = map.getZoom() === map.getMinZoom();
      map.invalidateSize({ animate: false });
      const minimum = overviewZoom(map);
      if (minimum === map.getMinZoom()) return;
      map.setMinZoom(minimum);
      if (atOverview) showCityOverview(map);
    });
    resize.observe(container.current);
    return () => {
      window.removeEventListener("online", onNetwork);
      window.removeEventListener("offline", onNetwork);
      resize.disconnect();
      cancelMapClick();
      marker.current = null;
      gps.current = null;
      mapRef.current = null;
      map.remove();
    };
  }, [afterSingleClick, cancelMapClick]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const controller = new AbortController();
    fetch("/maps/cochabamba-distritos.geojson", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Distritos no disponibles");
        return response.json() as Promise<FeatureCollection<Polygon | MultiPolygon, District>>;
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        const polygons = L.geoJSON<District>(data, {
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
            districtBounds.current.set(info.codigo_distrito, shape.getBounds());
            const label = document.createElement("span");
            label.textContent = "D" + info.codigo_distrito;
            shape.options.bubblingMouseEvents = false;
            shape.bindTooltip(label, { direction: "center", permanent: true, interactive: false, className: "district-label" + (highlighted ? " priority-district" : "") });
            shape.on("click", (event: L.LeafletMouseEvent) => {
              const { latlng } = event;
              afterSingleClick(event, () => {
                if (!isDrawing() && map.getZoom() < 13.5 && focusedDistrict.current !== info.codigo_distrito) {
                  focus(info.codigo_distrito);
                } else {
                  handleTerrain({ latitude: latlng.lat, longitude: latlng.lng });
                }
              });
            });
          },
        });
        setDistrictLayer(polygons);
        setDistricts(data.features.map(({ properties }) => properties).sort((a, b) => Number(a.codigo_distrito) - Number(b.codigo_distrito)));
        setDistrictError(false);
      })
      .catch(() => { if (!controller.signal.aborted) setDistrictError(true); });
    return () => controller.abort();
  }, [afterSingleClick]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !districtLayer || !showDistricts) return;
    districtLayer.addTo(map);
    return () => { districtLayer.remove(); };
  }, [districtLayer, showDistricts]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const points = (drawing ? vertices : outline ?? []).map(point);
    if (!points.length) return;
    const style = { pane: "parcel-point", interactive: false, color: "#f8ffe9", weight: 3,
      fillColor: "#a7d861", fillOpacity: 0.35 };
    const shape = points.length >= 3 ? L.polygon(points, style) : L.polyline(points, style);
    const layer = L.layerGroup([shape, ...points.map(p => L.circleMarker(p, { ...style, radius: 4, fillOpacity: 1 }))]).addTo(map);
    return () => { layer.remove(); };
  }, [drawing, vertices, outline]);

  function finishOutline(vertices: Coordinates[]) {
    const origin = vertices[0];
    if (vertices.length !== outlineCorners || !origin) return;
    const meter = Math.PI * 6371008.8 / 180;
    const east = meter * Math.cos(origin.latitude * Math.PI / 180);
    const points = vertices.map(p => ({ x: (p.longitude - origin.longitude) * east, y: (p.latitude - origin.latitude) * meter }));
    const cross = (a: typeof points[number], b: typeof points[number], c: typeof points[number]) =>
      (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    let twiceArea = 0, centerX = 0, centerY = 0;
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      if (Math.hypot(a.x - b.x, a.y - b.y) < 0.1) return setDrawError("Deshaz un punto y marca esquinas distintas.");
      for (let j = i + 2; j < points.length; j++) {
        if (i === 0 && j === points.length - 1) continue;
        const c = points[j], d = points[(j + 1) % points.length];
        if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) {
          return setDrawError("El contorno se cruza. Deshaz un punto y sigue el borde del terreno.");
        }
      }
      const signed = a.x * b.y - b.x * a.y;
      twiceArea += signed;
      centerX += (a.x + b.x) * signed;
      centerY += (a.y + b.y) * signed;
    }
    if (Math.abs(twiceArea) < 2) return setDrawError("Deshaz un punto y marca esquinas que encierren una superficie.");
    onOutline(vertices, {
      longitude: origin.longitude + centerX / (3 * twiceArea * east),
      latitude: origin.latitude + centerY / (3 * twiceArea * meter),
    }, Math.abs(twiceArea) / 20000);
    setDrawing(false);
  }

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !satellite || !online) return;
    const imagery = L.tileLayer(satelliteTiles, {
      maxZoom: 18,
      updateWhenZooming: false,
      attribution: '<a href="https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9">Imagen © Esri y colaboradores</a>',
    });
    const previews = satellitePreview(map);
    let hasImagery = false;
    let remainingPreviews = previews.length;
    function showImagery() {
      hasImagery = true;
      setSatelliteError(false);
    }
    function reportFailure() {
      if (!hasImagery && remainingPreviews === 0 && !imagery.isLoading()) setSatelliteError(true);
    }
    for (const preview of previews) {
      preview.on("load", showImagery);
      preview.once("load error", () => { remainingPreviews -= 1; reportFailure(); });
      preview.addTo(map);
    }
    imagery.on("tileload", showImagery).on("load", reportFailure).addTo(map);
    return () => {
      for (const tiles of [...previews, imagery]) {
        tiles.off("load error tileload").remove();
      }
    };
  }, [online, satellite]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !satellite || !online || satelliteError) return;
    let active = true;
    let labels: L.Layer | undefined;
    const attribution = "Nombres de calles: Esri y colaboradores";
    Promise.all([import("maplibre-gl"), import("@maplibre/maplibre-gl-leaflet")]).then(([maplibre, plugin]) => {
      if (!active) return;
      maplibre.setWorkerUrl("/maplibre-worker.mjs");
      const options = { style: "/maps/nombres-calles.json", attributionControl: false as const, pane: "streetLabels" };
      labels = plugin.maplibreGL(options).addTo(map);
      map.attributionControl.addAttribution(attribution);
    }).catch(() => { /* Street labels are optional; retain the local district map. */ });
    return () => {
      active = false;
      if (!labels) return;
      labels.remove();
      map.attributionControl.removeAttribution(attribution);
    };
  }, [online, satellite, satelliteError]);

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
    const alreadyMarked = marker.current.options.opacity === 1 && marker.current.getLatLng().equals(latlng);
    marker.current.setLatLng(latlng).setStyle({ opacity: 1, fillOpacity: 1 });
    if (alreadyMarked) return;
    const reference = getReferenceCase(latitude, longitude);
    if (!cityBounds.contains(latlng)) return;
    if (!map.getBounds().contains(latlng) || reference && map.getZoom() < 14) {
      map.setView(latlng, 15, { animate: false });
    }
  }, [latitude, longitude]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layer) return;
    const layerName = layerNames[layer];
    let visible: { url: string; overlay: L.ImageOverlay } | undefined;
    let pending: { url: string; overlay: L.ImageOverlay } | undefined;
    let frame = 0;

    function discardPending() {
      if (!pending) return;
      const { overlay } = pending;
      pending = undefined;
      overlay.off("load error").remove();
      overlay.getElement()?.removeAttribute("src");
    }

    function refresh() {
      if (!map) return;
      const bounds = map.getBounds();
      const url = `/api/territory?operation=map&layer=${layer}&${currentView(map, bounds)}`;
      if (pending?.url === url) return;
      discardPending();
      if (visible?.url === url) {
        setOverlayError(false);
        return;
      }

      // Each image must keep the geographic bounds used in its request.
      const overlay = L.imageOverlay(url, bounds, { pane: "territory", opacity: 0, alt: layerName });
      pending = { url, overlay };
      overlay.once("load", () => {
        pending = undefined;
        overlay.off("error").setOpacity(0.68);
        visible?.overlay.remove();
        visible = { url, overlay };
        setOverlayError(false);
      });
      overlay.once("error", () => {
        discardPending();
        setOverlayError(true);
      });
      overlay.addTo(map);
    }
    function scheduleRefresh() {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(refresh);
    }

    scheduleRefresh();
    map.on("moveend resize", scheduleRefresh);
    return () => {
      map.off("moveend resize", scheduleRefresh);
      window.cancelAnimationFrame(frame);
      discardPending();
      visible?.overlay.remove();
    };
  }, [layer]);

  function focusDistrict(code: string) {
    manualAction.current += 1;
    cancelMapClick();
    setDistrict(code);
    focusedDistrict.current = code;
    const map = mapRef.current;
    if (!map) return;
    const bounds = districtBounds.current.get(code);
    if (bounds) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 16, animate: false });
    else showCityOverview(map);
  }

  function visitReference(key: ReferenceCase) {
    manualAction.current += 1;
    const map = mapRef.current;
    if (!map) return;
    cancelMapClick();
    setDistrict(referenceCases[key].district);
    focusedDistrict.current = referenceCases[key].district;
    setDrawing(false);
    setVertices([]);
    setDrawError("");
    // Navigation only: the user chooses the point or draws the parcel afterwards.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) map.setView(point(referenceCases[key]), 17, { animate: false });
    else map.flyTo(point(referenceCases[key]), 17, { duration: 0.55 });
  }

  function locate() {
    const map = mapRef.current;
    if (!map || !navigator.geolocation) {
      setLocationStatus("La ubicación no está disponible en este navegador.");
      return;
    }
    const requestVersion = manualAction.current;
    setLocating(true);
    setLocationStatus("Buscando tu ubicación…");
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      if (mapRef.current !== map) return;
      setLocating(false);
      const position: L.LatLngTuple = [coords.latitude, coords.longitude];
      if (!cityBounds.contains(position)) {
        setLocationStatus("Tu ubicación está fuera de la vista de Cochabamba.");
        return;
      }
      gps.current?.remove();
      gps.current = L.layerGroup([
        L.circle(position, { radius: coords.accuracy, color: "#60a5fa", weight: 1, interactive: false, pane: "parcel-point" }),
        L.circleMarker(position, { radius: 8, color: "white", weight: 3, fillColor: "#2563eb", fillOpacity: 1, interactive: false, pane: "parcel-point" }),
      ]).addTo(map);
      if (manualAction.current === requestVersion) map.setView(position, coords.accuracy < 100 ? 17 : 15, { animate: false });
      setLocationStatus("El punto azul indica tu ubicación aproximada. Toca el terreno para elegir tu parcela.");
    }, () => {
      if (mapRef.current !== map) return;
      setLocating(false);
      setLocationStatus("No se pudo obtener tu ubicación. Puedes marcar un punto a mano.");
    }, { timeout: 8000, maximumAge: 60000 });
  }

  return (
    <div className={overview ? "map-distribution" : "panel"}>
      <div className={overview ? "map-controls" : "mb-3 grid items-end gap-3 sm:grid-cols-2"}>
        <div className="map-district grid min-w-0 gap-1.5">
          <label className="map-control-label" htmlFor="district-selector"><Layers2 size={18} aria-hidden="true" /> Selecciona tu distrito</label>
          <div className="relative">
            <NativeSelect id="district-selector" value={district} aria-busy={!districtLayer && !districtError} disabled={!districts.length} onChange={(event) => focusDistrict(event.target.value)}>
              <option value="">{districtLayer ? "Todo Cochabamba" : districtError ? "Distritos no disponibles" : "Cargando distritos…"}</option>
              {districts.map((info) => <option key={info.codigo_distrito} value={info.codigo_distrito}>{info.nombre}</option>)}
            </NativeSelect>
            {overview && <ChevronDown size={18} className="pointer-events-none absolute end-3.5 top-1/2 -translate-y-1/2 text-action forced-colors:hidden" aria-hidden="true" />}
          </div>
        </div>
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
        {overview && <Button type="button" variant="secondary" onClick={locate} disabled={locating}><LocateFixed size={17} aria-hidden="true" /> Usar mi ubicación</Button>}
        <div className="grid gap-2">
          {drawing ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" disabled={!vertices.length} onClick={() => { setVertices(v => v.slice(0, -1)); setDrawError(""); }}>Deshacer</Button>
              <Button type="button" variant="secondary" onClick={() => { setDrawing(false); setDrawError(""); }}>Cancelar</Button>
            </div>
          ) : <Button type="button" variant="secondary" onClick={() => { setVertices([]); setDrawError(""); setDrawing(true); }}><Crop size={17} aria-hidden="true" /> {outline?.length ? "Volver a dibujar" : "Dibujar parcela"}</Button>}
        </div>
        {(drawing || Boolean(outline?.length)) && <div className="col-span-full grid gap-1.5 text-sm text-muted">
          <p role="status">{drawing ? `${vertices.length} de ${outlineCorners} puntos marcados` : "4 de 4 puntos · Contorno cerrado"}</p>
          <progress className="map-outline-progress" aria-label="Puntos del contorno" value={drawing ? vertices.length : outlineCorners} max={outlineCorners} />
          {drawing && <p>Toca las esquinas en orden.</p>}
        </div>}
        {drawError && <p role="alert" className="col-span-full text-sm text-red-800">{drawError}</p>}
        {overview && locationStatus && <p className="text-sm text-muted" role="status">{locationStatus}</p>}
      </div>
      <div className="min-w-0">
        <div className="isolate overflow-hidden rounded-[22px]">
          <div
            ref={container}
            role="region"
            aria-label={overview ? "Mapa de Cochabamba" : region === "la-maica" ? "Mapa de La Maica" : region === "tunari" ? "Mapa de Tirani" : "Mapa de la parcela"}
            aria-describedby={gestureHint}
            data-overview={overview}
            className="parcel-viewport"
          />
        </div>
        <p id={gestureHint} className="map-gesture-hint">
          <span className="map-gesture-hint-pointer">Usa la rueda sobre el mapa para acercar o alejar.</span>
          <span className="map-gesture-hint-touch">Pellizca con dos dedos para acercar o alejar. Arrastra para moverte.</span>
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm font-semibold">
          <label className="inline-flex min-h-11 items-center gap-1.5"><input type="checkbox" className="size-4 accent-action" checked={showDistricts} onChange={(event) => setShowDistricts(event.target.checked)} /> Distritos</label>
          <label className="inline-flex min-h-11 items-center gap-1.5"><input type="checkbox" className="size-4 accent-action" checked={satellite && online} disabled={!online} onChange={(event) => {
            setSatelliteError(false);
            setSatellite(event.target.checked);
          }} /> Satélite</label>
          <Button type="button" variant="secondary" className="max-sm:flex-auto sm:ml-auto" onClick={() => {
            setShowDistricts(true);
            focusDistrict("");
          }}><MapPinned size={17} aria-hidden="true" /> Ver todos los distritos</Button>
          <Button type="button" variant="secondary" className="max-sm:flex-auto" onClick={() => {
            manualAction.current += 1;
            const center = mapRef.current?.getCenter();
            if (center) onSelect({ latitude: center.lat, longitude: center.lng });
          }}><Crosshair size={17} aria-hidden="true" /> Marcar centro</Button>
          {!overview && <Button type="button" variant="secondary" onClick={locate} disabled={locating}><LocateFixed size={17} aria-hidden="true" /> Usar mi ubicación</Button>}
          <Button type="button" variant="secondary" onClick={() => visitReference("tunari")}>Tirani</Button>
          <Button type="button" variant="secondary" onClick={() => visitReference("la-maica")}>La Maica</Button>
        </div>
        {!overview && locationStatus && <p className="mt-2 text-sm text-muted" role="status">{locationStatus}</p>}
        {districtError && showDistricts && <p role="status" className="mt-2 text-sm text-muted">No se pudieron cargar los distritos de referencia.</p>}
        {satellite && (!online || satelliteError) && <p role="status" className="mt-2 text-sm text-muted">Imágenes satelitales no disponibles. El mapa local sigue activo.</p>}
        {layer && <p className="mt-1 text-sm text-muted"><a className="underline" target="_blank" rel="noreferrer" href={`/api/territory?operation=legend&layer=${layer}`}>Abrir leyenda de {layerNames[layer]}</a></p>}
        {overlayError && layer && <p role="status" className="mt-2 text-sm text-muted">Capa GAMC no disponible en este momento.</p>}
        {region !== "custom" && baseStatus !== "ready" && <p role="status" className="mt-2 text-sm text-muted">
          {baseStatus === "loading" ? "Cargando el mapa base…" : "Mapa base no disponible. Puedes ingresar las coordenadas en el formulario."}
        </p>}
      </div>
    </div>
  );
}
