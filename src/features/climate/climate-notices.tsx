"use client";

import { Bell, CloudSun, ThermometerSun } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "../../components/ui/button";
import { ensoSource, hasEnsoCoverage, relevantEnso } from "../../domain/climate/enso";
import { forecastSource, formatDate, heatSignals, heatThreshold, horizon, localDate, type Forecast } from "../operations/model";
import { EnsoAttribution, seasonLabel, useEnso } from "./enso-outlook";

const permissionKey = "field-shift-climate-notifications";
const number = new Intl.NumberFormat("es-BO", { maximumFractionDigits: 1 });
const seasonalDays = 92;

type Notice = { key: string; title: string; body: string };

function readPermission() {
  try {
    return !!window.Notification && Notification.permission === "granted" && localStorage.getItem(permissionKey) === "on";
  } catch {
    return false;
  }
}

export function ClimateNotices({ forecast, cached, parcelKey, children }: {
  forecast: Forecast | null; cached: boolean; parcelKey: string; children: ReactNode;
}) {
  const season = useEnso();
  const weatherIsCurrent = forecast && !cached && forecast.today === localDate(new Date().toISOString());
  const heat = weatherIsCurrent ? heatSignals(forecast) : [];
  const outlook = season?.outlook;
  const today = localDate(new Date().toISOString());
  const seasonal = outlook ? relevantEnso(outlook, today, seasonalDays).sort((a, b) => b.probability - a.probability)[0] : undefined;
  const pending: Notice[] = heat.map((day) => ({
    key: `heat:${parcelKey}:${day.date}`,
    title: `Calor previsto el ${formatDate(day.date)}`,
    body: `Open-Meteo estima ${number.format(day.maximum)} °C. Revisa el suelo y confirma el riego con el regante.`,
  }));
  if (seasonal && outlook && !season?.cached) pending.push({
    key: `enso:${outlook.issued}:${seasonal.phase}`,
    title: `Boletín estacional · ${seasonal.phase}`,
    body: `NOAA CPC publica ${seasonal.probability} % de probabilidad de ${seasonal.phase} en el Pacífico ecuatorial, de ${seasonLabel(seasonal)}.`,
  });

  return <>
    <section aria-labelledby="climate-notices-title" className="panel mb-6 grid gap-3">
      <h2 id="climate-notices-title" className="flex items-center gap-2 text-xl font-bold"><Bell size={20} aria-hidden="true" /> Avisos climáticos</h2>
      {heat.length > 0 ? (
        <ul className="grid gap-2">
          {heat.map((day) => (
            <li key={day.date} className="rounded-lg bg-[#f4ebd7] p-3 text-sm text-[#624217]">
              <p className="flex items-center gap-2 font-bold"><ThermometerSun size={17} aria-hidden="true" /> Calor previsto el {formatDate(day.date)}</p>
              <p className="mt-1">Máxima de {number.format(day.maximum)} °C{day.humidity != null ? ` · humedad media de ${number.format(day.humidity)}%` : ""}. Revisa la humedad del suelo y confirma el turno con el regante.</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">
          {weatherIsCurrent && horizon(forecast.days, today, 3).some((day) => day.maximum != null)
            ? `Umbral de vigilancia del piloto: ${heatThreshold} °C. Ningún aviso de calor en las máximas disponibles para los próximos tres días.`
            : "Actualiza el pronóstico para evaluar avisos de calor."}
        </p>
      )}
      <NoticeSettings entries={pending} />
    </section>
    {children}
    <section aria-labelledby="seasonal-outlook-title" className="panel mt-6">
        <h2 id="seasonal-outlook-title" className="flex items-center gap-2 text-lg font-bold"><CloudSun size={18} aria-hidden="true" /> Panorama estacional</h2>
        {!season && <p className="mt-1 text-sm text-muted">Consultando el boletín estacional…</p>}
        {season && !outlook && <p className="mt-1 text-sm text-muted">Boletín estacional no disponible. <a className="underline" href={ensoSource}>Consultar NOAA CPC</a>.</p>}
        {outlook && <>
          {seasonal ? <>
            <p className="mt-2 font-semibold">{seasonal.probability} % de probabilidad de {seasonal.phase} en el Pacífico ecuatorial.</p>
            <p className="my-1 text-sm text-muted">Trimestre de {seasonLabel(seasonal)}.</p>
          </> : <p className="my-1 text-sm text-muted">
            {hasEnsoCoverage(outlook, today, seasonalDays)
                ? "Sin señal de El Niño o La Niña por encima del umbral de vigilancia en los trimestres disponibles."
                : "El boletín no cubre el periodo consultado."}
          </p>}
          <EnsoAttribution outlook={outlook} cached={Boolean(season?.cached)} />
        </>}
        <p className="mt-2 text-sm text-muted">
          Este boletín da contexto para la campaña. {forecast && <>
            <a href="#forecast-title" className="font-semibold underline underline-offset-2">Ver el pronóstico para tu parcela</a> para revisar el próximo riego.
          </>}
        </p>
    </section>
  </>;
}

function NoticeSettings({ entries }: { entries: Notice[] }) {
  const [enabled, setEnabled] = useState(readPermission);
  const [status, setStatus] = useState("");
  const [available] = useState(() => typeof window !== "undefined" && Boolean(window.Notification && navigator.serviceWorker));
  const inFlight = useRef(new Set<string>());

  useEffect(() => {
    let active = true;
    if (!enabled || !entries.length || Notification.permission !== "granted") return;
    const sending = inFlight.current;
    void navigator.serviceWorker.ready.then(async (registration) => {
      for (const notice of entries) {
        if (!active) break;
        const tag = `field-shift:${notice.key}`;
        if (sending.has(tag)) continue;
        try {
          if (localStorage.getItem(tag)) continue;
          sending.add(tag);
          await registration.showNotification(notice.title, { body: notice.body, icon: "/icons/yaku-mark-192.png", tag });
          localStorage.setItem(tag, "sent");
        } catch {
          if (active) setStatus("El navegador no entregó el aviso. Puedes consultarlo aquí.");
        } finally {
          sending.delete(tag);
        }
      }
    }).catch(() => {});
    return () => { active = false; };
  }, [enabled, entries]);

  async function toggle() {
    if (enabled) {
      try {
        localStorage.removeItem(permissionKey);
        setEnabled(false);
        setStatus("Notificaciones desactivadas en este dispositivo.");
      } catch {
        setStatus("No se pudo guardar la preferencia del navegador.");
      }
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("Las tarjetas de avisos siguen disponibles en Agua.");
        return;
      }
      localStorage.setItem(permissionKey, "on");
      setEnabled(true);
      setStatus("Notificaciones activas mientras consultes Agua.");
    } catch {
      setStatus("Las notificaciones del navegador no están disponibles.");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line pt-3">
      {available && <Button variant="secondary" type="button" onClick={() => void toggle()}>{enabled ? "Desactivar notificaciones" : "Activar notificaciones"}</Button>}
      <p className="text-xs text-muted">En Agua puedes recibir avisos de calor previsto de <a href={forecastSource} className="underline">Open-Meteo</a> y boletines estacionales de NOAA CPC mientras la pantalla está activa.</p>
      {status && <p className="w-full text-xs text-muted" role="status">{status}</p>}
    </div>
  );
}
