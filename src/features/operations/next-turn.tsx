"use client";

import { useEffect, useState } from "react";
import { CalendarDays, CloudRain } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { cropProgress, dayDistance, type Crop } from "../../domain/water-balance/model";
import { ClimateNotices } from "../climate/climate-notices";
import { DraftForm, DraftHeader } from "../pilot/draft-form";
import { cropForParcel, locationKey, pilotCoordinates, type Coordinates, type CropWater, type Parcel } from "../pilot/draft";
import {
  buildInspection, cropStage, forecastSource, formatDate, gamcSource, horizon, imergSource, inspectionSignal, inspectionThreshold,
  localDate, summarizeWeather, timeZone, type Forecast, type TerritoryExposure, type WeatherDay,
} from "./model";

const cacheKey = "field-shift-weather-v1";
const number = new Intl.NumberFormat("es-BO", { maximumFractionDigits: 1 });
const clock = new Intl.DateTimeFormat("es-BO", { dateStyle: "medium", timeStyle: "short", timeZone });

function amount(value: number | null, unit = "mm") {
  return value === null ? "Sin dato" : `${number.format(value)} ${unit}`;
}

function upstream<T>(path: string, signal: AbortSignal): Promise<T> {
  return fetch(path, { signal, cache: "no-store" }).then((response) => {
    if (!response.ok) throw new Error("Servicio no disponible");
    return response.json();
  });
}

function savedWeather(point: string) {
  try {
    const value = JSON.parse(localStorage.getItem(cacheKey) ?? "null") as { point: string; forecast: Forecast } | null;
    return value?.point === point && Array.isArray(value.forecast?.days) && Array.isArray(value.forecast?.recent) ? value.forecast : null;
  } catch {
    return null;
  }
}

type WeatherState = { forecast: Forecast | null; cached: boolean; done: boolean };

function useWeather({ latitude, longitude }: Coordinates) {
  const [refresh, setRefresh] = useState(0);
  const [weather, setWeather] = useState<WeatherState>({ forecast: null, cached: false, done: false });
  const [territory, setTerritory] = useState<TerritoryExposure | null>(null);
  const point = new URLSearchParams({ lat: String(latitude), lon: String(longitude) }).toString();

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    upstream<Forecast>(`/api/weather?${point}`, signal).then((forecast) => {
      if (signal.aborted) return;
      try {
        localStorage.setItem(cacheKey, JSON.stringify({ point, forecast }));
      } catch {
        // The live forecast is still usable when browser storage is unavailable.
      }
      setWeather({ forecast, cached: false, done: true });
    }).catch(() => {
      if (signal.aborted) return;
      const forecast = savedWeather(point);
      setWeather({ forecast, cached: Boolean(forecast), done: true });
    });
    upstream<TerritoryExposure>(`/api/territory?${point}`, signal).then((data) => {
      if (!signal.aborted) setTerritory(data);
    }).catch(() => {});
    return () => controller.abort();
  }, [point, refresh]);

  function update() {
    setWeather((previous) => ({ ...previous, done: false }));
    setTerritory(null);
    setRefresh((previous) => previous + 1);
  }

  useEffect(() => {
    const refreshOnReturn = () => {
      if (document.visibilityState === "visible") setRefresh((previous) => previous + 1);
    };
    const timer = window.setInterval(refreshOnReturn, 60 * 60 * 1000);
    window.addEventListener("online", refreshOnReturn);
    document.addEventListener("visibilitychange", refreshOnReturn);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", refreshOnReturn);
      document.removeEventListener("visibilitychange", refreshOnReturn);
    };
  }, []);

  return { weather, territory, update };
}

function currentCrop(cropWater: CropWater | undefined, today: string, harvest?: string) {
  if (!cropWater) return { name: "Cultivo actual por registrar", stage: "Etapa por confirmar" };
  const campaigns = [
    { name: cropWater.firstCrop, start: cropWater.firstPlanting, end: cropWater.firstHarvest },
    { name: cropWater.secondCrop, start: cropWater.secondPlanting, end: cropWater.secondHarvest },
  ];
  const declared = cropWater.currentCrop?.trim();
  const planting = cropWater.currentPlanting ?? "";
  const applicable = declared ? campaigns.filter(({ name, start }) => name === declared && (!planting || planting === start))
    : campaigns.filter(({ name, start, end }) => name && start && end && start <= today && today < end);
  const match = applicable.length === 1 ? applicable[0] : undefined;
  return {
    name: declared || match?.name || "Cultivo actual por registrar",
    stage: cropStage(planting || match?.start || "", harvest || match?.end || "", today),
  };
}

function OperationalPlan({ cropWater, forecast, cached, consultation, harvest, profile }: { cropWater?: CropWater; forecast: Forecast | null; cached: boolean; consultation?: boolean; harvest?: string; profile?: Crop }) {
  const today = localDate(new Date().toISOString());
  const crop = currentCrop(cropWater, today, harvest);
  const turnDate = cropWater?.turnDate;
  const turnClosed = cropWater?.turnStatus === "Aplicado" || cropWater?.turnStatus === "Cancelado" || Boolean(turnDate && turnDate < today);
  const turn = !cached && !turnClosed && turnDate && forecast?.days.find((day) => day.date === turnDate);
  const planting = cropWater?.currentPlanting;
  const day = planting && turnDate ? dayDistance(planting, turnDate) : NaN;
  const duration = planting && harvest ? dayDistance(planting, harvest) : NaN;
  const demand = profile && turn && turn.et0 !== null && day >= 0 && day < duration
    ? turn.et0 * cropProgress(day, duration, profile.kc).kc : null;

  return (
    <section aria-labelledby="operating-title" className="panel grid gap-4 md:grid-cols-[1fr_1fr_1.55fr]">
      <div>
        <h2 id="operating-title" className="flex items-center gap-2 text-sm font-semibold"><CalendarDays size={18} aria-hidden="true" /> Riego previsto</h2>
        <p className="mt-1 text-2xl font-bold">{turnDate ? formatDate(turnDate) : "Por registrar"}</p>
        {cropWater?.turnStatus && <p className="text-sm text-muted">{cropWater.turnStatus}</p>}
      </div>
      <div>
        <p className="text-sm text-muted">{crop.name}</p>
        <p className="mt-1 text-xl font-bold">{crop.stage}</p>
        <p className="mt-1 text-sm text-muted">Etapa estimada con las fechas declaradas.</p>
      </div>
      <div className="border-t border-line pt-4 md:border-t-0 md:border-l md:pt-0 md:pl-5">
        <p className="font-semibold">Qué revisar con el regante</p>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          {turnClosed ? "Indica la próxima fecha de riego y comprueba la humedad del suelo antes de ajustar la siguiente aplicación." : turn && turn.rain !== null
            ? `El modelo estima ${amount(turn.rain)} para el día del riego. Revisa la humedad del suelo y confirma el horario y el caudal antes de ajustar el riego.`
            : "Revisa la humedad del suelo y confirma fecha, horario y caudal del riego antes de decidir cuánto regar."}
        </p>
        {demand !== null && <p className="mt-2 text-sm text-muted">Demanda estimada del cultivo el día del riego: {amount(demand)}. Confirma la humedad del suelo antes de decidir la cantidad de agua.</p>}
        {!consultation && <Button asChild variant="secondary" className="mt-3"><a href="/la-maica/mi-cultivo-y-mi-agua">Editar mi riego y cultivo</a></Button>}
      </div>
    </section>
  );
}

function HorizonSummary({ title, days }: { title: string; days: WeatherDay[] }) {
  const totals = summarizeWeather(days);
  return (
    <div className="border-t border-line py-4">
      <h3 className="font-semibold">{title}</h3>
      <dl className="mt-2 grid grid-cols-2 gap-3">
        <div><dt className="text-sm text-muted">Lluvia acumulada</dt><dd className="text-2xl font-bold">{amount(totals.rain)}</dd></div>
        <div><dt className="text-sm text-muted">ET₀ acumulada</dt><dd className="text-2xl font-bold">{amount(totals.et0)}</dd></div>
      </dl>
      {(totals.rainCount < totals.count || totals.et0Count < totals.count) && <p className="mt-2 text-sm text-muted">
        Días con datos: lluvia {totals.rainCount}/{totals.count}, ET₀ {totals.et0Count}/{totals.count}.
      </p>}
    </div>
  );
}

function ForecastDetails({ forecast, period: selectedPeriod, onPeriodChange }: { forecast: Forecast; period?:7|14; onPeriodChange?:(period:7|14)=>void }) {
  const [ownPeriod, setOwnPeriod] = useState<7 | 14>(7);
  const period=selectedPeriod??ownPeriod;
  const setPeriod=onPeriodChange??setOwnPeriod;
  const days = horizon(forecast.days, forecast.today, period);
  return (
    <section aria-labelledby="forecast-title" className="panel">
      <h2 id="forecast-title" className="flex items-center gap-2 text-2xl font-bold"><CloudRain size={23} aria-hidden="true" /> Pronóstico</h2>
      <div role="group" aria-label="Horizonte del pronóstico" className="my-3 flex gap-2">
        {([7, 14] as const).map((value) => (
          <Button key={value} variant="secondary" aria-pressed={period === value} className="aria-pressed:border-action aria-pressed:bg-leaf" onClick={() => setPeriod(value)}>{value} días</Button>
        ))}
      </div>
      <div aria-live="polite">
        <HorizonSummary title={`Próximos ${period} días`} days={days} />
        {period === 14 && <p className="mb-3 rounded-lg bg-leaf/65 p-2.5 text-sm leading-relaxed text-muted">La segunda semana tiene mayor incertidumbre. Confirma el pronóstico más cerca del día de riego.</p>}
      </div>
      <details className="border-y border-line py-3 text-sm">
        <summary className="min-h-8 cursor-pointer font-semibold">Ver datos por día</summary>
        <table className="mt-2 w-full text-left text-sm">
          <caption className="sr-only">Pronóstico diario de lluvia, evapotranspiración y temperatura mínima</caption>
          <thead><tr className="border-b border-line"><th scope="col">Día</th><th scope="col">Lluvia</th><th scope="col">ET₀</th><th scope="col">Mín.</th></tr></thead>
          <tbody>{days.map((day, index) => (
            <tr key={day.date} className={index === 7 ? "border-t-2 border-action/35" : "border-t border-line/50"}>
              <th scope="row" className="py-1 font-normal">{formatDate(day.date)}</th>
              <td>{amount(day.rain)}</td><td>{amount(day.et0)}</td><td>{amount(day.minimum, "°C")}</td>
            </tr>
          ))}</tbody>
        </table>
      </details>
      <p className="mt-3 text-sm text-muted">ET₀ es la evapotranspiración de referencia. La demanda del cultivo requiere su coeficiente y etapa.</p>
    </section>
  );
}

function Inspection({ sheet }: { sheet: NonNullable<ReturnType<typeof buildInspection>> }) {
  const [message, setMessage] = useState("");
  const shareAvailable = typeof navigator !== "undefined" && typeof navigator.share === "function";

  function download() {
    const url = URL.createObjectURL(new Blob([sheet.text], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `yaku-inspeccion-${sheet.date}.txt`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function share() {
    try {
      await navigator.share({ title: sheet.title, text: sheet.text });
    } catch (error) {
      if (!(error instanceof DOMException) || error.name !== "AbortError") setMessage("No se pudo compartir. Puedes descargar la ficha.");
    }
  }

  return (
    <section aria-labelledby="inspection-title" className="mb-7 rounded-2xl border border-action/30 bg-leaf/65 p-4 sm:p-6">
      <h2 id="inspection-title" className="text-2xl font-bold">Ficha de inspección por sector</h2>
      <p className="mt-2 text-sm font-semibold">{sheet.zone} · {formatDate(sheet.date)}</p>
      <p className="mt-2 text-sm">{sheet.reason}</p>
      <details className="mt-3 text-sm">
        <summary className="min-h-8 cursor-pointer font-semibold">Abrir ficha de inspección</summary>
        <p className="mt-2">Sector: {sheet.sector || "Sin nombre en la capa"}</p>
        <p className="mt-2">{sheet.action}</p>
        <p className="mt-2 text-muted">{sheet.limitation}</p>
        <p className="mt-2">Fuentes: <a href={sheet.weatherUrl} className="underline">{sheet.weatherSource}</a> y <a href={gamcSource} className="underline">GAMC · Proyecto 04</a>.</p>
      </details>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={download}>Descargar ficha</Button>
        {shareAvailable && <Button type="button" onClick={() => void share()}>Compartir ficha</Button>}
      </div>
      <p className="mt-2 text-sm" role="status">{message}</p>
    </section>
  );
}

export type ForecastAvailability = 'loading' | 'available' | 'unavailable' | 'cached';
export function ForecastPanel({ parcel, cropWater, consultation, harvest, profile, onForecast, onAvailability, period, onPeriodChange }: { parcel?: Parcel; cropWater?: CropWater; consultation?: boolean; harvest?: string; profile?: Crop; onForecast?: (forecast: Forecast | undefined) => void; onAvailability?: (status:ForecastAvailability)=>void; period?:7|14; onPeriodChange?:(period:7|14)=>void }) {
  const { weather, territory, update } = useWeather(parcel ?? pilotCoordinates);
  const { forecast, cached, done } = weather;
  useEffect(() => { onForecast?.(cached ? undefined : forecast ?? undefined); }, [forecast, cached, onForecast]);
  useEffect(() => { onAvailability?.(!done?'loading':cached?'cached':forecast?'available':'unavailable'); }, [done,cached,forecast,onAvailability]);
  const sheet = done && forecast && !cached ? buildInspection(forecast, territory) : null;
  const heavy = done && forecast && !cached ? inspectionSignal(forecast) : null;
  const parcelKey = locationKey(parcel ?? pilotCoordinates);
  const associated = cropWater?.parcelKey === parcelKey || (!cropWater?.parcelKey && parcelKey === locationKey(pilotCoordinates));

  return (
    <>
      {(!consultation || (associated && cropWater?.currentCrop)) && <OperationalPlan cropWater={associated ? cropWater : undefined} forecast={forecast} cached={cached} consultation={consultation} harvest={harvest} profile={profile} />}
      <div className="my-7 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted" role="status">
          <p>{consultation ? "Ubicación seleccionada en el informe" : parcel?.name || (parcel ? "Parcela guardada" : "Punto de referencia de La Maica")}</p>
          {!done && <p>Consultando el pronóstico…</p>}
          {done && forecast && <p>{cached ? "Última consulta guardada" : "Consultado"} el {clock.format(new Date(forecast.queriedAt))}, hora de Cochabamba.</p>}
        </div>
        <Button type="button" variant="secondary" onClick={update} disabled={!done}>Actualizar pronóstico</Button>
      </div>
      {done && !forecast && <Alert role="note" className="mb-7"><AlertTitle>Pronóstico no disponible</AlertTitle><AlertDescription>No hay datos guardados para este punto. Vuelve a consultar con conexión.</AlertDescription></Alert>}
      {cached && <Alert role="note" className="mb-7"><AlertTitle>Pronóstico de una consulta anterior</AlertTitle><AlertDescription>Consulta la fecha indicada y actualiza antes de ajustar el riego.</AlertDescription></Alert>}
      <ClimateNotices forecast={forecast} cached={cached} parcelKey={parcelKey} />
      {sheet && <Inspection sheet={sheet} />}
      {heavy && !sheet && <Alert role="note" className="mb-7"><AlertTitle>Señal de lluvia intensa</AlertTitle><AlertDescription>
        {amount(heavy.rain)} el {formatDate(heavy.date)}. {territory?.drainage.status === "no-match"
          ? "Sin coincidencia en la consulta de drenaje cartografiado."
          : "Exposición y sector aún por confirmar con el GAMC."}
      </AlertDescription></Alert>}
      {forecast && (
        <div className="grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <section aria-labelledby="recent-title" className="panel order-2 md:order-0">
            <h2 id="recent-title" className="mb-3 text-2xl font-bold">Lluvia reciente</h2>
            <ul className="divide-y divide-line border-y border-line">
              {forecast.recent.map((day) => (
                <li key={day.date} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 py-3 text-sm">
                  <time dateTime={day.date}>{formatDate(day.date)}</time><strong>{amount(day.rain)}</strong>
                  <span className="col-span-2 text-muted">
                    {day.source === "imerg-early" ? "NASA GPM IMERG Early · estimación satelital" : day.source === "modeled" ? "Open-Meteo · estimación por modelo" : "Sin dato disponible"}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm leading-relaxed text-muted">Los días recientes usan IMERG Early cuando hay una extracción aplicable. La alternativa modelada se identifica por día.</p>
          </section>
          <ForecastDetails forecast={forecast} period={period} onPeriodChange={onPeriodChange} />
        </div>
      )}
      <details className="mt-7 border-t border-line pt-3 text-sm">
        <summary className="cursor-pointer font-semibold">Fuentes y criterio de inspección</summary>
        <p className="mt-2 leading-relaxed text-muted">La ficha requiere una coincidencia en Drenaje e Influencia del GAMC y una señal de al menos {inspectionThreshold} mm en un día durante los próximos tres días o en el último día cerrado de IMERG Early. Es un umbral operativo del piloto para revisar en campo. Un desborde requiere información hidráulica.</p>
        <p className="mt-2"><a href={forecastSource} className="underline">Open-Meteo</a> · <a href={imergSource} className="underline">NASA GPM IMERG</a> · <a href={gamcSource} className="underline">GAMC</a></p>
      </details>
    </>
  );
}

export function NextTurn() {
  return (
    <div className="py-8 sm:py-10">
      <DraftHeader cover="water" title="Mi próximo riego" description="Consulta la lluvia esperada antes de regar." />
      <DraftForm>{(draft) => <ForecastPanel parcel={draft?.parcel} cropWater={cropForParcel(draft)} />}</DraftForm>
    </div>
  );
}
