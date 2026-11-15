"use client";

import { CalendarDays, CloudRain, Droplets, ThermometerSun } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../../components/ui/button";
import type { ClimateProfile } from "../../domain/climate/screening";
import { localDate } from "../operations/model";
import type { Coordinates } from "../pilot/draft";
import { labelMonth } from "./enso-outlook";

const climateKey = "field-shift-climate-v3";
const number = new Intl.NumberFormat("es-BO", { maximumFractionDigits: 1 });

function metric(value: number | null, unit: string) {
  return value === null ? "Sin dato" : `${number.format(value)} ${unit}`;
}

export function ParcelClimate({ point }: { point: Coordinates }) {
  const params = new URLSearchParams({ lat: String(point.latitude), lon: String(point.longitude) }).toString();
  return <ClimatePanel key={params} params={params} />;
}

function ClimatePanel({ params }: { params: string }) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ profile: ClimateProfile | null; cached: boolean }>();
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
  const month = localDate(new Date().toISOString()).slice(0, 7);
  const metrics = profile?.months[Number(month.slice(5)) - 1];

  return (
    <section id="clima-parcela" aria-labelledby="climate-title" className="panel consulta-seccion consulta-clima scroll-mt-5">
      <h2 id="climate-title" className="consulta-titulo"><CloudRain aria-hidden="true"/> Clima de la parcela</h2>
      {!state && <p role="status" className="mt-2 text-sm text-muted">Consultando el historial de NASA POWER…</p>}
      {state && !profile && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <p role="status" className="text-sm text-muted">Historial no disponible para este punto. Puedes reintentar con conexión.</p>
          <Button type="button" variant="secondary" onClick={() => { setState(undefined); setAttempt(attempt + 1); }}>Reintentar historial</Button>
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
  );
}
