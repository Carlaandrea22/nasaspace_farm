"use client";

import { ArrowRight, Calculator, CalendarDays, Check, ChevronRight, CloudRain, Droplets, Info, Layers, Leaf, ThermometerSun, Wheat, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { NativeSelect } from "../../components/ui/native-select";
import { ensoSource, hasEnsoCoverage, relevantEnso } from "../../domain/climate/enso";
import { ecocropSource, powerSource, rankCrops, type ClimateProfile, type CropUse } from "../../domain/climate/screening";
import { addDays, forecastHorizonDays, forecastSource, formatDate, localDate, plantingTemperatureWindow, type Forecast } from "../operations/model";
import { decimal, type Coordinates } from "../pilot/draft";
import { EnsoAttribution, labelMonth, seasonLabel, useEnso } from "./enso-outlook";

const climateKey = "field-shift-climate-v3";
const number = new Intl.NumberFormat("es-BO", { maximumFractionDigits: 1 });

function metric(value: number | null, unit: string) {
  return value === null ? "Sin dato" : `${number.format(value)} ${unit}`;
}

export function ParcelClimate({ point, territory }: { point: Coordinates; territory: ReactNode }) {
  const params = new URLSearchParams({ lat: String(point.latitude), lon: String(point.longitude) }).toString();
  return <ClimatePanel key={params} params={params} territory={territory} />;
}

function ClimatePanel({ params, territory }: { params: string; territory: ReactNode }) {
  const today = localDate(new Date().toISOString());
  const [planting, setPlanting] = useState(today);
  const [use, setUse] = useState<CropUse | "">("");
  const [phText, setPhText] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ profile: ClimateProfile | null; cached: boolean }>();
  const [forecast, setForecast] = useState<Forecast | null>();
  const season = useEnso();

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/climate?${params}`, { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error("NASA POWER");
      const profile = await response.json() as ClimateProfile;
      if (controller.signal.aborted) return;
      try { localStorage.setItem(climateKey, JSON.stringify({ params, profile })); } catch {}
      setState({ profile, cached: false });
    }).catch(() => {
      if (controller.signal.aborted) return;
      let profile: ClimateProfile | null = null;
      try {
        const stored = JSON.parse(localStorage.getItem(climateKey) ?? "null");
        if (stored?.params === params) profile = stored.profile;
      } catch {}
      setState({ profile, cached: Boolean(profile) });
    });
    fetch(`/api/weather?${params}`, { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error("Open-Meteo");
      const weather = await response.json() as Forecast;
      if (!controller.signal.aborted) setForecast(weather);
    }).catch(() => {
      if (!controller.signal.aborted) setForecast(null);
    });
    return () => controller.abort();
  }, [params, attempt]);

  const profile = state?.profile;
  const days = forecast?.today === today ? forecast.days : [];
  const lastDate = days.at(-1)?.date ?? addDays(today, forecastHorizonDays - 1);
  const dateValid = Boolean(planting && planting >= today && planting <= lastDate);
  const month = planting.slice(0, 7);
  const index = Number(month.slice(5)) - 1;
  const metrics = dateValid ? profile?.months[index] : undefined;
  const weatherOnPlanting = dateValid ? days.find(({ date }) => date === planting) : undefined;
  const hasTemperatures = days.some((day) => day.date >= planting && day.minimum != null && day.maximum != null);
  const ph = decimal(phText);
  const phValid = Number.isFinite(ph) && ph >= 0 && ph <= 14;
  const crops = dateValid && profile ? rankCrops(profile.crops[index], use, phValid ? ph : null) : null;
  const eligibleCrops = crops?.filter((crop) => crop.eligible) ?? [];
  const noFavorableCrop = eligibleCrops.length > 0 && eligibleCrops.every((crop) =>
    crop.assessment && crop.assessment.category !== "recommended",
  );
  const cycleDays = Math.max(1, ...eligibleCrops.map((crop) => crop.days));
  const outlook = season?.outlook;
  const signals = outlook ? relevantEnso(outlook, planting, cycleDays) : [];
  return (
    <>
    <section id="clima-parcela" aria-labelledby="climate-title" className="panel consulta-seccion consulta-clima scroll-mt-5">
      <h2 id="climate-title" className="consulta-titulo"><CloudRain aria-hidden="true"/> Clima de la parcela</h2>
      {!state && <p role="status" className="mt-2 text-sm text-muted">Consultando el historial de NASA POWER…</p>}
      {state && !profile && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <p role="status" className="text-sm text-muted">Historial no disponible para este punto. Puedes reintentar con conexión.</p>
          <Button type="button" variant="secondary" onClick={() => { setState(undefined); setForecast(undefined); setAttempt(attempt + 1); }}>Reintentar historial</Button>
        </div>
      )}
      {profile && metrics && <>
        <p className="mt-1 text-sm text-muted">
          Historial de {labelMonth(month).split(" ")[0]} · NASA POWER · {profile.from.slice(0, 4)}–{profile.to.slice(0, 4)} · tiempo solar local.
          {state?.cached && <> Copia guardada el {profile.queriedAt.slice(0, 10)}.</>}
        </p>
          <dl className="consulta-indicadores my-4 grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-3 text-sm">
            <div><dt><ThermometerSun aria-hidden="true"/> Temperatura media</dt><dd className="font-bold">{metric(metrics.temperature, "°C")}</dd></div>
            <div><dt><ThermometerSun aria-hidden="true"/> Mín. / máx. medias</dt><dd className="font-bold">{metric(metrics.minimum, "°C")} / {metric(metrics.maximum, "°C")}</dd></div>
            <div><dt><Droplets aria-hidden="true"/> Humedad relativa</dt><dd className="font-bold">{metric(metrics.humidity, "%")}</dd></div>
            <div><dt><CloudRain aria-hidden="true"/> Lluvia del mes</dt><dd className="font-bold">{metric(metrics.rain, "mm")}</dd></div>
            <div><dt><CalendarDays aria-hidden="true"/> Lluvia anual media</dt><dd className="font-bold">{metric(profile.annualRain, "mm")}</dd></div>
          </dl>
      </>}
    </section>
    <section id="cultivos-parcela" className="panel consulta-seccion scroll-mt-5">
      <h2 className="consulta-titulo"><Leaf aria-hidden="true"/> ¿Qué puedes cultivar?</h2>
      <p className="mt-1 text-sm text-muted">Compara cómo les fue a estos cultivos con las temperaturas de otros años.</p>
      <fieldset className="consulta-no-imprimir consulta-filtros mt-3 min-w-0 px-3 pb-3 sm:px-4">
        <legend className="px-1 font-semibold">Planifica tu siembra</legend>
        <div className="grid gap-3 py-2 sm:grid-cols-3">
          <div className="min-w-0">
            <label htmlFor="planting-date" className="mb-1 block text-sm font-semibold">¿Cuándo quieres sembrar?</label>
            <Input id="planting-date" type="date" min={today} max={lastDate} value={planting}
              aria-invalid={!dateValid} aria-describedby="planting-date-help" onChange={(event) => setPlanting(event.target.value)} />
          </div>
          <div>
            <label htmlFor="climate-use" className="mb-1 block text-sm font-semibold">Destino de la cosecha</label>
            <NativeSelect id="climate-use" value={use} onChange={(event) => setUse(event.target.value as CropUse | "")}>
              <option value="">Cualquier destino</option>
              <option value="forraje">Forraje</option>
              <option value="consumo">Consumo</option>
            </NativeSelect>
          </div>
          <div>
            <label htmlFor="climate-ph" className="mb-1 block text-sm font-semibold">pH medido (opcional)</label>
            <Input id="climate-ph" inputMode="decimal" placeholder="Ej. 6,5" value={phText} aria-invalid={Boolean(phText) && !phValid} aria-describedby={phText && !phValid ? "climate-ph-error" : undefined} onChange={(event) => setPhText(event.target.value)} />
            {phText && !phValid && <p id="climate-ph-error" className="mt-1 text-xs text-red-800">Ingresa un pH entre 0 y 14.</p>}
          </div>
        </div>
        <p id="planting-date-help" aria-live="polite" className={`text-xs ${dateValid ? "text-muted" : "text-red-800"}`}>
          {dateValid ? `Puedes elegir desde hoy hasta el ${formatDate(lastDate)}.` : `Elige una fecha entre hoy y el ${formatDate(lastDate)}.`}
        </p>
      </fieldset>
      {dateValid && <div aria-live="polite" className="mt-4 text-sm text-muted">
        {weatherOnPlanting ? <>
          <p><strong className="text-ink">Pronóstico para el {formatDate(planting)}.</strong> Lluvia {metric(weatherOnPlanting.rain, "mm")} · mín. {metric(weatherOnPlanting.minimum, "°C")} · máx. {metric(weatherOnPlanting.maximum ?? null, "°C")}.</p>
          <p className="mt-1">Antes de sembrar, revisa la lluvia y la humedad del suelo. <a className="underline" href={forecastSource}>Open-Meteo</a></p>
        </> : <p>{forecast === undefined ? "Consultando el pronóstico local…" : "Pronóstico diario no disponible para esta fecha."}</p>}
      </div>}
      {profile && crops ? <>
        <p className="consulta-filtros-impresos mt-3 text-sm">
          Siembra: {formatDate(planting)} · Destino: {use || "Cualquiera"}{phValid ? ` · pH: ${number.format(ph)}` : ""}
        </p>
        <div aria-live="polite" className="consulta-grupos">
          {noFavorableCrop && <p className="consulta-aviso">Ninguna opción para el destino elegido tuvo un ajuste térmico favorable en este mes.</p>}
          {cropGroups.map(group => {
            const entries = crops.filter(crop => group.categories.includes(crop.eligible ? crop.assessment?.category ?? "unknown" : "excluded"));
            if (!entries.length) return null;
            const GroupIcon = group.icon;
            const onlyConditional = group.key === "recommended" && entries.every(crop => crop.assessment?.category === "conditional");
            return <div key={group.key} className="consulta-grupo" data-category={group.key}>
              <div className="consulta-grupo-titulo">
                <GroupIcon aria-hidden="true"/>
                <div>
                  <h3>{onlyConditional ? "Cultivos posibles con reservas" : group.title}</h3>
                  {group.description && <p>{onlyConditional ? "Compara cómo respondieron a las temperaturas de otros años." : group.description}</p>}
                </div>
              </div>
              <ul className="consulta-cultivos-lista">
                {entries.map(crop => <CropCard key={crop.species} crop={crop}
                  window={hasTemperatures && crop.eligible && crop.assessment && crop.assessment.category !== "unsuitable"
                    ? plantingTemperatureWindow(days, planting, crop.temperature) : undefined} />)}
              </ul>
            </div>;
          })}
        </div>
      </> : dateValid && <p className="mt-3 text-sm text-muted">La comparación necesita el historial de temperatura.</p>}
    </section>
    <section id="informacion-adicional" className="panel consulta-seccion scroll-mt-5">
      <h2 className="consulta-titulo"><Layers aria-hidden="true"/> Información adicional</h2>
      <div className="consulta-detalles">
        <details className="consulta-detalle consulta-detalle-estacional">
          <summary><CalendarDays aria-hidden="true"/> <span>Panorama estacional<small>Pacífico ecuatorial</small></span> <ChevronRight aria-hidden="true"/></summary>
          {outlook ? <>
            {signals.length > 0 ? <>
              <p className="mt-2 text-muted">Probabilidad de la fase en el Pacífico. Para la parcela, revisa el pronóstico local de lluvia y temperatura.</p>
              <ul className="my-2 list-disc pl-5">{signals.map((signal) => <li key={signal.center}>{signal.phase} · {signal.probability}% en {seasonLabel(signal)}</li>)}</ul>
            </> : <p className="mt-2 text-muted">{hasEnsoCoverage(outlook, planting, cycleDays)
              ? "El boletín no indica una señal de El Niño o La Niña por encima del umbral de seguimiento."
              : "El boletín aún no cubre la campaña elegida."}</p>}
            <EnsoAttribution outlook={outlook} cached={Boolean(season?.cached)} />
          </> : <>
            <p className="mt-2">{season ? "El boletín estacional no está disponible." : "Consultando el boletín estacional…"}</p>
            <a className="underline" href={ensoSource}>Consultar NOAA CPC</a>
          </>}
        </details>
        <details className="consulta-detalle consulta-detalle-metodo">
          <summary><Calculator aria-hidden="true"/> <span>¿Cómo se calcula la aptitud?</span> <ChevronRight aria-hidden="true"/></summary>
          <p className="mt-1 text-muted">Simulamos una siembra el primer día del mes elegido en cada año del historial. Para cada cultivo usamos el punto medio del rango de días de <a href={ecocropSource} className="underline">FAO EcoCrop</a>. Contamos solo los ciclos que tienen una temperatura media para cada día y exigimos al menos tres ciclos completos.</p>
          <p className="mt-2 text-muted">La categoría resume cuántos ciclos cumplieron el criterio térmico. El orden considera el destino de la cosecha y el pH medido. La cuadrícula de <a href={powerSource} className="underline">NASA POWER</a> describe el clima regional. La lluvia, el suelo y el riego requieren revisión aparte.</p>
          <p className="mt-2 text-muted">La ventana de siembra muestra la primera secuencia de días, a partir de la fecha elegida, con mínimas y máximas previstas dentro de los límites térmicos de EcoCrop.</p>
        </details>
        {territory}
      </div>
      <p className="mt-4 text-xs text-muted">Fotografías ilustrativas. <a href="/images/informe/creditos.html" className="underline">Créditos de las imágenes</a></p>
    </section>
    </>
  );
}

const cropGroups = [
  { key: "recommended", categories: ["recommended", "conditional"], title: "Cultivos con condiciones favorables o con reservas", description: "Revisa el resultado de cada cultivo.", icon: Check },
  { key: "unsuitable", categories: ["unsuitable"], title: "Cultivos con condiciones poco favorables", description: "Las temperaturas de este mes dificultan su desarrollo.", icon: X },
  { key: "unknown", categories: ["unknown"], title: "Datos insuficientes", icon: Info },
  { key: "excluded", categories: ["excluded"], title: "Otros destinos de cosecha", icon: Info },
];

const cropPhotos: Readonly<Record<string, string>> = {
  "Avena sativa": "/images/informe/avena.webp",
  "Hordeum vulgare": "/images/informe/cebada.webp",
  "Vicia faba": "/images/informe/haba.webp",
  "Zea mays": "/images/informe/maiz.webp",
};

function CropCard({ crop, window }: { crop: ReturnType<typeof rankCrops>[number]; window?: ReturnType<typeof plantingTemperatureWindow> }) {
  const labels = { recommended: "Favorable por temperatura", conditional: "Posible con reservas", unsuitable: "Poco favorable por temperatura" };
  const climateStatus = crop.assessment ? labels[crop.assessment.category] : "Datos insuficientes";
  return (
    <li className="consulta-cultivo overflow-hidden rounded-xl border border-line bg-surface">
      {cropPhotos[crop.species] && <div className="consulta-cultivo-foto">
        <Image src={cropPhotos[crop.species]} alt="" fill unoptimized />
      </div>}
      <div className="consulta-cultivo-contenido">
      <h4 className="flex items-center gap-2 font-bold"><Wheat size={19} aria-hidden="true"/>{crop.name}</h4>
      <p className="text-xs text-muted">{crop.use === "forraje" ? "Forraje" : "Consumo"} · {crop.cycleRange.join("–")} días estimados entre siembra y cosecha</p>
      <p className="consulta-aptitud" data-category={crop.assessment?.category}>{climateStatus}</p>
      {window !== undefined && <p className="mt-2 rounded-lg bg-canvas p-2 text-xs font-semibold">
        {window ? window.start === window.end ? `Temperatura compatible el ${formatDate(window.start)}.` : `Temperatura compatible del ${formatDate(window.start)} al ${formatDate(window.end)}.`
          : "Sin una ventana de temperatura compatible en el pronóstico."}
      </p>}
      <details className="consulta-cultivo-detalles text-xs text-muted">
        <summary>
          {crop.assessment && crop.samples > 0 && <span className="consulta-ciclos" aria-hidden="true">
            <span style={{ flexBasis: `${100 * crop.favorableCycles / crop.samples}%` }}/>
            <span style={{ flexBasis: `${100 * crop.conditionalCycles / crop.samples}%` }}/>
          </span>}
          <ArrowRight size={18} aria-hidden="true"/>
          <span className="sr-only">Ver detalles de {crop.name}</span>
        </summary>
      {!crop.eligible && <p className="text-xs font-semibold text-muted">Fuera del destino elegido.</p>}
      {crop.assessment && <p className="mt-1 flex items-start gap-1 text-xs text-muted"><ThermometerSun size={14} className="shrink-0" aria-hidden="true" />
        {crop.favorableCycles} de {crop.samples} ciclos históricos favorables{crop.conditionalCycles > 0 && `, ${crop.conditionalCycles} con reservas`}. Le favorecen {crop.temperature[1]}–{crop.temperature[2]} °C.
      </p>}
      {crop.assessment?.category === "unsuitable" && <p className="mt-1 text-xs text-muted">
        En al menos la mitad de los ciclos evaluados, la temperatura fue desfavorable con demasiada frecuencia o se alejó demasiado del rango adecuado.
      </p>}
      {!crop.assessment && <p className="mt-1 text-xs text-muted">Hay {crop.samples} ciclos completos en el histórico. Se requieren al menos 3.</p>}
      <p className="mt-1 text-xs text-muted">Lluvia anual {crop.optimalRain === null ? "sin dato" : crop.optimalRain ? "en el rango óptimo" : "fuera del rango óptimo"}.</p>
      {crop.phMatch !== null && <p className="text-xs text-muted">pH medido {crop.phMatch ? "en el rango óptimo" : "fuera del rango óptimo"} ({crop.optimalPh.map((value) => number.format(value)).join("–")}).</p>}
      {crop.assessment &&
        <p className="mt-1">Para comparar usamos ciclos de {crop.days} días. Entre todos los ciclos evaluados hubo {crop.assessment.optimal} de {crop.assessment.observations} días en el rango favorable y {crop.assessment.outside} fuera de los límites de {crop.temperature[0]}–{crop.temperature[3]} °C.</p>
      }
      </details>
      </div>
    </li>
  );
}
