"use client";

import { Sprout, ThermometerSun } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { NativeSelect } from "../../components/ui/native-select";
import { ensoSource, hasEnsoCoverage, relevantEnso } from "../../domain/climate/enso";
import { ecocropSource, powerSource, rankCrops, type ClimateProfile, type CropUse } from "../../domain/climate/screening";
import { localDate } from "../operations/model";
import { decimal, type Coordinates } from "../pilot/draft";
import { EnsoAttribution, labelMonth, seasonLabel, useEnso } from "./enso-outlook";

const climateKey = "field-shift-climate-v3";
const number = new Intl.NumberFormat("es-BO", { maximumFractionDigits: 1 });

function metric(value: number | null, unit: string) {
  return value === null ? "Sin dato" : `${number.format(value)} ${unit}`;
}

function monthOptions() {
  const [year, month] = localDate(new Date().toISOString()).split("-").map(Number);
  return Array.from({ length: 12 }, (_, index) => new Date(Date.UTC(year, month - 1 + index, 1)).toISOString().slice(0, 7));
}

export function ParcelClimate({ point }: { point: Coordinates }) {
  const params = new URLSearchParams({ lat: String(point.latitude), lon: String(point.longitude) }).toString();
  return <ClimatePanel key={params} params={params} />;
}

function ClimatePanel({ params }: { params: string }) {
  const [months] = useState(monthOptions);
  const [month, setMonth] = useState(months[0]);
  const [use, setUse] = useState<CropUse | "">("");
  const [phText, setPhText] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ profile: ClimateProfile | null; cached: boolean }>();
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
    return () => controller.abort();
  }, [params, attempt]);

  const profile = state?.profile;
  const index = Number(month.slice(5)) - 1;
  const metrics = profile?.months[index];
  const ph = decimal(phText);
  const phValid = Number.isFinite(ph) && ph >= 0 && ph <= 14;
  const crops = profile ? rankCrops(profile.crops[index], use, phValid ? ph : null) : null;
  const eligibleCrops = crops?.filter((crop) => crop.eligible) ?? [];
  const noFavorableCrop = eligibleCrops.length > 0 && eligibleCrops.every((crop) =>
    crop.assessment && crop.assessment.category !== "recommended",
  );
  const cycleDays = Math.max(1, ...eligibleCrops.map((crop) => crop.days));
  const outlook = season?.outlook;
  const signals = outlook ? relevantEnso(outlook, month, cycleDays) : [];
  return (
    <section id="clima-parcela" aria-labelledby="climate-title" className="panel scroll-mt-5">
      <h2 id="climate-title" className="flex items-center gap-2 text-xl font-bold"><Sprout size={22} aria-hidden="true" /> Clima y cultivos para este punto</h2>
      {!state && <p role="status" className="mt-2 text-sm text-muted">Consultando el historial de NASA POWER…</p>}
      {state && !profile && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <p role="status" className="text-sm text-muted">Historial no disponible para este punto. Puedes reintentar con conexión.</p>
          <Button type="button" variant="secondary" onClick={() => { setState(undefined); setAttempt(attempt + 1); }}>Reintentar historial</Button>
        </div>
      )}
      {profile && metrics && crops && <>
        <p className="mt-1 text-sm text-muted">
          NASA POWER · {profile.from.slice(0, 4)}–{profile.to.slice(0, 4)} · tiempo solar local.
          {state?.cached && <> Copia guardada el {profile.queriedAt.slice(0, 10)}.</>}
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="planting-month" className="mb-1 block text-sm font-semibold">Mes previsto de siembra</label>
            <NativeSelect id="planting-month" value={month} onChange={(event) => setMonth(event.target.value)}>
              {months.map((option) => <option key={option} value={option}>{labelMonth(option)}</option>)}
            </NativeSelect>
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
            <Input id="climate-ph" inputMode="decimal" value={phText} aria-invalid={Boolean(phText) && !phValid} aria-describedby={phText && !phValid ? "climate-ph-error" : undefined} onChange={(event) => setPhText(event.target.value)} />
            {phText && !phValid && <p id="climate-ph-error" className="mt-1 text-xs text-red-800">Ingresa un pH entre 0 y 14.</p>}
          </div>
        </div>
        <div aria-live="polite">
          <dl className="my-4 grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-3 rounded-xl bg-canvas p-3 text-sm">
            <div><dt className="text-muted">Temperatura media</dt><dd className="font-bold">{metric(metrics.temperature, "°C")}</dd></div>
            <div><dt className="text-muted">Mín. / máx. medias</dt><dd className="font-bold">{metric(metrics.minimum, "°C")} / {metric(metrics.maximum, "°C")}</dd></div>
            <div><dt className="text-muted">Humedad relativa</dt><dd className="font-bold">{metric(metrics.humidity, "%")}</dd></div>
            <div><dt className="text-muted">Lluvia del mes</dt><dd className="font-bold">{metric(metrics.rain, "mm")}</dd></div>
            <div><dt className="text-muted">Lluvia anual media</dt><dd className="font-bold">{metric(profile.annualRain, "mm")}</dd></div>
          </dl>
          {!season && <p className="mb-3 text-sm text-muted">Consultando el boletín estacional…</p>}
          {season && !season.outlook && <p className="mb-3 text-sm text-muted">Boletín estacional no disponible. Confirma el panorama con <a href={ensoSource} className="underline">NOAA CPC</a>.</p>}
          {noFavorableCrop && <p className="text-sm text-muted">Ninguna opción para el destino elegido tuvo un ajuste térmico favorable en este mes. Puedes comparar otro mes de siembra.</p>}
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {crops.map((crop) => <CropCard key={crop.species} crop={crop} />)}
          </ul>
          {outlook && <details className="mt-4 border-t border-line pt-3 text-sm">
            <summary className="cursor-pointer font-semibold">Panorama estacional · Pacífico ecuatorial</summary>
            {signals.length > 0 ? <>
              <p className="mt-2 text-muted">Probabilidad de la fase en el Pacífico. Para la parcela, revisa el pronóstico local de lluvia y temperatura.</p>
              <ul className="my-2 list-disc pl-5">{signals.map((signal) => <li key={signal.center}>{signal.phase} · {signal.probability}% en {seasonLabel(signal)}</li>)}</ul>
            </> : <p className="mt-2 text-muted">{hasEnsoCoverage(outlook, month, cycleDays)
              ? "El boletín no indica una señal de El Niño o La Niña por encima del umbral de seguimiento."
              : "El boletín aún no cubre la campaña elegida."}</p>}
            <EnsoAttribution outlook={outlook} cached={Boolean(season?.cached)} />
          </details>}
        </div>
        <details className="mt-4 border-t border-line pt-3 text-sm">
          <summary className="min-h-8 cursor-pointer font-semibold">Cómo se calcula la aptitud</summary>
          <p className="mt-1 text-muted">Simulamos una siembra el primer día del mes elegido en cada año del historial. Para cada cultivo usamos el punto medio del rango de días de <a href={ecocropSource} className="underline">FAO EcoCrop</a>. Contamos solo los ciclos que tienen una temperatura media para cada día y exigimos al menos tres ciclos completos.</p>
          <p className="mt-2 text-muted">La categoría resume cuántos ciclos cumplieron el criterio térmico. El orden considera el destino de la cosecha y el pH medido. La cuadrícula de <a href={powerSource} className="underline">NASA POWER</a> describe el clima regional. La lluvia, el suelo y el riego requieren revisión aparte.</p>
        </details>
      </>}
    </section>
  );
}

function CropCard({ crop }: { crop: ReturnType<typeof rankCrops>[number] }) {
  const labels = { recommended: "Favorable por temperatura", conditional: "Posible con reservas", unsuitable: "Poco favorable por temperatura" };
  const climateStatus = crop.assessment ? labels[crop.assessment.category] : "Datos insuficientes";
  return (
    <li className="rounded-xl border border-line bg-surface p-3">
      <h3 className="font-bold">{crop.name}</h3>
      <p className="text-xs text-muted">{crop.use === "forraje" ? "Forraje" : "Consumo"} · ciclo de referencia de {crop.days} días</p>
      <p className="mt-2 text-sm font-semibold">{climateStatus}</p>
      {!crop.eligible && <p className="text-xs font-semibold text-muted">Fuera del destino elegido.</p>}
      {crop.assessment && <p className="mt-1 flex items-start gap-1 text-xs text-muted"><ThermometerSun size={14} className="shrink-0" aria-hidden="true" />
        {crop.favorableCycles} de {crop.samples} ciclos históricos favorables{crop.conditionalCycles > 0 && `, ${crop.conditionalCycles} con reservas`}. Le favorecen {crop.temperature[1]}–{crop.temperature[2]} °C.
      </p>}
      {crop.assessment?.category === "unsuitable" && <p className="mt-1 text-xs text-muted">
        En al menos la mitad de los ciclos, la frecuencia o la magnitud de las temperaturas desfavorables superó el criterio evaluado.
      </p>}
      {!crop.assessment && <p className="mt-1 text-xs text-muted">Hay {crop.samples} ciclos completos en el histórico. Se requieren al menos 3.</p>}
      <p className="mt-1 text-xs text-muted">Lluvia anual {crop.optimalRain === null ? "sin dato" : crop.optimalRain ? "en el rango óptimo" : "fuera del rango óptimo"}.</p>
      {crop.phMatch !== null && <p className="text-xs text-muted">pH medido {crop.phMatch ? "en el rango óptimo" : "fuera del rango óptimo"} ({crop.optimalPh.map((value) => number.format(value)).join("–")}).</p>}
      {crop.assessment && <details className="mt-2 text-xs text-muted">
        <summary className="cursor-pointer font-semibold">Ver datos del ciclo</summary>
        <p className="mt-1">EcoCrop estima {crop.cycleRange.join("–")} días. Entre todos los ciclos evaluados hubo {crop.assessment.optimal} de {crop.assessment.observations} días en el rango favorable y {crop.assessment.outside} fuera de los límites de {crop.temperature[0]}–{crop.temperature[3]} °C.</p>
      </details>}
    </li>
  );
}
