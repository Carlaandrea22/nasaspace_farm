"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import type { FeatureCollection } from "geojson";
import { LocateFixed, Map as MapIcon } from "lucide-react";
import "leaflet/dist/leaflet.css";
import "maplibre-gl/dist/maplibre-gl.css";
import { maplibreGL } from "@maplibre/maplibre-gl-leaflet";
import { setWorkerUrl } from "maplibre-gl";
import Buscador from "./buscador";

const centro: L.LatLngTuple = [-17.3936, -66.1569];
const cobertura = L.latLngBounds([-17.57, -66.30], [-17.23, -66.02]);
const prioritarios = new Set(["9", "13", "15"]);
const distritosDisponibles = Array.from({ length: 15 }, (_, i) => String(i + 1));
export type Punto = { lat: number; lng: number };

export default function Mapa({ punto, seleccionar }: { punto: Punto | null; seleccionar: (p: Punto) => void }) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const pin = useRef<L.CircleMarker | null>(null);
  const gps = useRef<L.LayerGroup | null>(null);
  const distritoEnfocado = useRef<string | null>(null);
  const extensiones = useRef(new Map<string, L.LatLngBounds>());
  const [distrito, setDistrito] = useState("");
  const accionManual = useRef(0);
  const [capa, setCapa] = useState<"cargando" | "lista" | "error">("cargando");
  const [estado, setEstado] = useState("");
  const [buscando, setBuscando] = useState(false);

  function enfocarDistrito(instancia: L.Map, id: string) {
    const extension = extensiones.current.get(id);
    if (!extension) return;
    distritoEnfocado.current = id;
    setDistrito(id);
    accionManual.current++;
    instancia.flyToBounds(extension, { padding: [24, 24], maxZoom: 16, duration: 0.55 });
  }

  function ubicar(instancia: L.Map) {
    if (!navigator.geolocation) {
      setEstado("Tu navegador no ofrece ubicación. Mueve el mapa y toca tu parcela.");
      return;
    }
    const version = accionManual.current;
    setBuscando(true);
    setEstado("Buscando tu ubicación…");
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      if (mapa.current !== instancia) return;
      const posicion: L.LatLngTuple = [coords.latitude, coords.longitude];
      if (!cobertura.contains(posicion)) {
        setBuscando(false);
        setEstado("Estás fuera de la zona del mapa. Puedes buscar una dirección en Cochabamba.");
        return;
      }
      gps.current?.remove();
      gps.current = L.layerGroup([
        L.circle(posicion, { radius: coords.accuracy, color: "#60a5fa", weight: 1, interactive: false }),
        L.circleMarker(posicion, { radius: 8, color: "white", weight: 3, fillColor: "#2563eb", fillOpacity: 1, interactive: false })
      ]).addTo(instancia);
      if (accionManual.current === version) instancia.setView(posicion, coords.accuracy < 100 ? 17 : 15);
      setBuscando(false);
      setEstado("El punto azul indica tu ubicación aproximada. Toca el terreno para elegir tu parcela.");
    }, error => {
      if (mapa.current !== instancia) return;
      setBuscando(false);
      setEstado(error.code === 1 ? "La ubicación está desactivada. Puedes elegir tu parcela en el mapa." :
        "No pudimos obtener tu ubicación. Intenta otra vez o elige un punto.");
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  }

  useEffect(() => {
    const instancia = L.map(contenedor.current!, { zoomControl: false, zoomSnap: 0.25, minZoom: 11.5, maxBounds: cobertura, maxBoundsViscosity: 1 }).setView(centro, 12);
    const clicsDistrito = new WeakSet<Event>();
    const extents = extensiones.current;
    mapa.current = instancia;
    function actualizarDetalle() {
      const cerca = instancia.getZoom() >= 13.5;
      instancia.getContainer().classList.toggle("mapa-en-detalle", cerca);
    }
    instancia.on("zoomend", actualizarDetalle);
    L.control.zoom({ position: "bottomright", zoomInTitle: "Acercar", zoomOutTitle: "Alejar" }).addTo(instancia);
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      maxNativeZoom: 19, maxZoom: 20, attribution: "Imagen: Esri, Maxar, Earthstar Geographics y colaboradores GIS"
    }).addTo(instancia);
    setWorkerUrl("/maplibre-worker.mjs");
    const paneNombres = instancia.createPane("nombresCalles");
    paneNombres.style.zIndex = "350";
    paneNombres.style.pointerEvents = "none";
    maplibreGL({
      style: "/nombres-calles.json",
      attributionControl: false,
      pane: "nombresCalles"
    } as Parameters<typeof maplibreGL>[0] & { pane: string }).addTo(instancia);
    instancia.on("click", ({ latlng, originalEvent }: L.LeafletMouseEvent) => {
      if (!clicsDistrito.has(originalEvent)) seleccionar({ lat: latlng.lat, lng: latlng.lng });
    });
    const descarga = new AbortController();
    fetch("/distritos.geojson", { signal: descarga.signal })
      .then(async respuesta => {
        if (!respuesta.ok) throw new Error("Distritos no disponibles");
        return respuesta.json() as Promise<FeatureCollection>;
      })
      .then(datos => {
        if (mapa.current !== instancia) return;
        L.geoJSON(datos, {
          bubblingMouseEvents: false,
          attribution: '<a href="https://hogaria.com/geo">Hogaria</a> · Ciudatos Lab · © OpenStreetMap · ODbL',
          style: f => prioritarios.has(String(f?.properties?.codigo_distrito))
            ? { color: "#d4ff8c", weight: 3, fillColor: "#9cf94d", fillOpacity: 0.24 }
            : { color: "#eef1dc", weight: 1.5, fillOpacity: 0 },
          onEachFeature: (f, layer) => {
            const id = String(f.properties?.codigo_distrito);
            if (layer instanceof L.Polygon) extents.set(id, layer.getBounds());
            const etiqueta = document.createElement("span");
            etiqueta.textContent = f.properties?.nombre ?? "";
            const prioridad = prioritarios.has(String(f.properties?.codigo_distrito));
            layer.bindTooltip(etiqueta, {
              permanent: true, direction: "center",
              className: prioridad ? "nombre-distrito distrito-prioritario" : "nombre-distrito",
              interactive: true
            });
            function acercar(evento: L.LeafletMouseEvent) {
              if (clicsDistrito.has(evento.originalEvent)) return;
              clicsDistrito.add(evento.originalEvent);
              L.DomEvent.stopPropagation(evento.originalEvent);
              if (distritoEnfocado.current === id || instancia.getZoom() >= 13.5) {
                seleccionar({ lat: evento.latlng.lat, lng: evento.latlng.lng });
                return;
              }
              enfocarDistrito(instancia, id);
            }
            layer.on("click", acercar);
            layer.getTooltip()?.on("click", acercar);
          }
        }).addTo(instancia);
        actualizarDetalle();
        setCapa("lista");
      })
      .catch(() => { if (mapa.current === instancia) setCapa("error"); });
    const inicio = window.setTimeout(() => {
      if (!sessionStorage.getItem("ubicacion-solicitada")) {
        sessionStorage.setItem("ubicacion-solicitada", "1");
        ubicar(instancia);
      }
    }, 0);
    return () => {
      window.clearTimeout(inicio);
      mapa.current = null;
      pin.current = null;
      extents.clear();
      descarga.abort();
      instancia.remove();
    };
  }, [seleccionar]);

  useEffect(() => {
    const instancia = mapa.current;
    if (!instancia || !punto) return;
    pin.current?.remove();
    pin.current = L.circleMarker([punto.lat, punto.lng], {
      radius: 9, color: "#223a20", weight: 3, fillColor: "#cef49f", fillOpacity: 1, interactive: false
    }).addTo(instancia);
  }, [punto]);

  return <div className="distribucion-mapa">
    <div className="selectores-mapa">
      <label className="campo"><span className="rotulo-control"><MapIcon size={20} aria-hidden="true"/> Selecciona tu distrito</span>
        <select value={distrito} disabled={capa !== "lista"} onChange={e => {
          if (mapa.current) enfocarDistrito(mapa.current, e.target.value);
        }}>
          <option value="" disabled>Elija un distrito</option>
          {distritosDisponibles.map(id => <option key={id} value={id}>Distrito {id}</option>)}
        </select>
      </label>
      <div className="separador-mapa" aria-hidden="true">o</div>
      <Buscador ubicar={(lat, lng) => {
        accionManual.current++;
        distritoEnfocado.current = null;
        setDistrito("");
        seleccionar({ lat, lng });
        mapa.current?.flyTo([lat, lng], 17, { duration: 0.55 });
      }}/>
      <button className="ubicacion-panel" disabled={buscando} onClick={() => { if (mapa.current) ubicar(mapa.current); }}>
        <LocateFixed size={20} aria-hidden="true"/> Usar mi ubicación
      </button>
      {capa === "error" && <p role="status">No se pudieron cargar los distritos.</p>}
      {estado && <p className="estado-mapa" role="status">{estado}</p>}
    </div>
    <div className="visor">
      <div ref={contenedor} className="visor-mapa" aria-label="Mapa satelital interactivo de Cochabamba"/>
    </div>
  </div>;
}
