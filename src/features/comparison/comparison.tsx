"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { addDays, compare, moveTurn, preferred, type Result } from "../../domain/water-balance/model";
import { DraftForm, DraftHeader, Field } from "../pilot/draft-form";
import { getReferenceCase } from "../territory/reference";
import { decimal, type PilotDraft } from "../pilot/draft";
import { assessDraft, cropProfiles, demoInterval, demoVolume, metadata, prepareScenario, scenarioSources, smapRows } from "./scenario";
import { FadeContent } from "./fade-content";

const BalanceChart = dynamic(() => import("./balance-chart"), { ssr: false });
const statusLabels = { viable: "Viable en el modelo", conditional: "Condicionada", indeterminate: "Indeterminada" };
const format = new Intl.NumberFormat("es-BO", { maximumFractionDigits: 1 });
const dateLabel = (date: string) => date.split("-").reverse().join("/");
const signed = (value: number, unit = "") => Math.abs(value) < 0.05 ? "sin cambio" : (value > 0 ? "+" : "−") + format.format(Math.abs(value)) + unit;
type Scenario = NonNullable<ReturnType<typeof prepareScenario>>;

export function Comparison() {
  return (
    <div className="py-8 sm:py-10">
      <DraftHeader active="compare" title="Comparar tres rotaciones" description="Mueve el mismo turno y revisa cómo cambia el agua disponible para cada secuencia." />
      <DraftForm>{(draft) => <ComparisonContent draft={draft} />}</DraftForm>
    </div>
  );
}

function ComparisonContent({ draft }: { draft?: PilotDraft }) {
  const reference = draft?.parcel && getReferenceCase(draft.parcel.latitude, draft.parcel.longitude);
  const [demo, setDemo] = useState(!draft?.parcel || reference === "la-maica" && assessDraft(draft).gaps.length > 0);
  const [delay, setDelay] = useState<0 | 5>(0);
  const [volume, setVolume] = useState(String(demoVolume));
  const [active, setActive] = useState("A");
  const assessment = assessDraft(draft);
  const scenario = prepareScenario(draft, demo, decimal(volume));
  const results = scenario ? [compare(scenario.input, 0), compare(scenario.input, 5)] as const : null;

  return (
    <>
      <div className="mb-7 flex flex-wrap items-center gap-3" aria-label="Datos de la comparación">
        <Button aria-pressed={!demo} variant={demo ? "secondary" : "default"} onClick={() => setDemo(false)}>Mi parcela</Button>
        <Button aria-pressed={demo} variant={demo ? "default" : "secondary"} onClick={() => setDemo(true)}>Demo La Maica</Button>
      </div>
      {!demo && assessment.gaps.length > 0 && (
        <Alert role="note" className="max-w-3xl">
          <AlertTitle>{assessment.zone} · datos insuficientes</AlertTitle>
          <AlertDescription>Confirma los datos de esta ubicación para comparar rotaciones compatibles.</AlertDescription>
          <ul className="list-disc space-y-2 py-3 pl-5 text-sm">{assessment.gaps.map((gap) => <li key={gap}>{gap}</li>)}</ul>
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="secondary"><a href="/la-maica/mi-parcela">Revisar la parcela</a></Button>
            <Button asChild variant="secondary"><a href="/la-maica/mi-cultivo-y-mi-agua">Completar cultivo y agua</a></Button>
          </div>
        </Alert>
      )}
      {demo && <Alert role="note" className="mb-6">
        <AlertTitle>La Maica · parcela ilustrativa</AlertTitle>
        <AlertDescription>El clima y el suelo se tomaron de datos regionales. El calendario, la superficie y el riego representan un escenario reproducible.</AlertDescription>
      </Alert>}
      {demo && <div className="mb-6 max-w-xs">
        <Field label="Volumen del turno (m³, supuesto)"><Input value={volume} inputMode="decimal" onChange={(event) => setVolume(event.target.value)} /></Field>
        {!scenario && <p role="alert" className="mt-2 text-sm text-red-800">Ingresa un volumen mayor que cero.</p>}
      </div>}
      {scenario && results && <Matrix scenario={scenario} results={results} delay={delay} setDelay={setDelay} active={active} setActive={setActive} use={demo ? "" : assessment.crop?.harvestUse} />}
    </>
  );
}

function Matrix({ scenario, results: [planned, late], delay, setDelay, active, setActive, use }: {
  scenario: Scenario; results: readonly [Result[], Result[]]; delay: 0 | 5; setDelay: (delay: 0 | 5) => void;
  active: string; setActive: (id: string) => void; use?: string;
}) {
  const current = delay ? late : planned;
  const before = preferred(planned, scenario.input.priority);
  const after = preferred(late, scenario.input.priority);
  const selected = current.find(({ rotation }) => rotation.id === active) ?? current[0];
  const target = moveTurn(scenario.input.turns, scenario.input.testTurnId, delay).find(({ id }) => id === scenario.input.testTurnId)!;
  const original = scenario.input.turns.find(({ id }) => id === target.id)!;
  const changed = before?.rotation.id !== after?.rotation.id;
  const preferenceCriterion = scenario.input.priority === "Usar menos agua" ? "riego suplementario, días de estrés y cobertura" : "días de estrés, riego suplementario y cobertura";
  let explanation = "No hay una preferencia defendible con los datos y restricciones del caso.";
  if (before && after && !changed) {
    const delta = after.stressDays! - before.stressDays!;
    explanation = "Se mantiene la opción " + after.rotation.id + ". El retraso deja " + after.stressDays + " días de estrés: " +
      (delta === 0 ? "sin cambio frente al turno previsto." : signed(delta) + " frente al turno previsto.");
  } else if (before && after) {
    const previous = late.find((item) => item.rotation.id === before.rotation.id)!;
    explanation = "La preferencia pasa de " + before.rotation.id + " a " + after.rotation.id +
      ". Con el retraso, " + after.rotation.id + " tiene " + after.stressDays + " días de estrés y " + format.format(after.supplementalMm!) +
      " mm suplementarios frente a " + previous.stressDays + " días y " + format.format(previous.supplementalMm!) + " mm de " + before.rotation.id +
      ". El orden considera compatibilidad, condiciones y " + preferenceCriterion + ".";
  }

  return (
    <>
      <fieldset className="mb-6 border-y border-line py-5">
        <legend className="pr-3 text-sm font-semibold">Fecha del turno de la segunda campaña</legend>
        <div className="flex flex-wrap gap-2">
          <Button aria-pressed={delay === 0} variant={delay === 0 ? "default" : "secondary"} onClick={() => setDelay(0)}>Turno previsto</Button>
          <Button aria-pressed={delay === 5} variant={delay === 5 ? "default" : "secondary"} onClick={() => setDelay(5)}>5 días más tarde</Button>
        </div>
        <p className="mt-3 text-sm text-muted">Se aplica el <strong data-testid="selected-turn">{dateLabel(target.date)}</strong> · {format.format(scenario.volume)} m³ · {scenario.volumeSource}. Se mantienen el calendario y los otros turnos.</p>
      </fieldset>
      <div aria-live="polite" className="mb-7 border-l-3 border-action bg-action/5 px-5 py-4">
        <FadeContent revision={String(delay)}>
          <p className="font-semibold">{explanation}</p>
          <p className="mt-2 text-sm text-muted">Prioridad evaluada: {scenario.input.priority}. Preferencia del modelo bajo estos supuestos.</p>
        </FadeContent>
      </div>
      <section aria-labelledby="matrix-title">
        <h2 id="matrix-title" className="mb-2 font-display text-4xl">Matriz de decisión</h2>
        <p className="mb-3 text-sm text-muted">Periodo común {dateLabel(scenario.input.days[0].date)} a {dateLabel(scenario.input.days.at(-1)!.date)}. Los cambios se indican frente al turno previsto.</p>
        <div className="grid gap-5 lg:grid-cols-3">
          {current.map((result, index) => <RotationPanel key={result.rotation.id} result={result} planned={planned[index]} delay={delay}
            preferredId={(delay ? after : before)?.rotation.id} active={selected.rotation.id} onSelect={setActive} />)}
        </div>
      </section>
      {selected.series.length > 0 && <section aria-labelledby="balance-title" className="mt-8 min-w-0 border-t border-line pt-5">
        <h2 id="balance-title" className="font-display text-3xl">Agua en raíces · Opción {selected.rotation.id}</h2>
        <p className="my-2 text-sm text-muted">Línea verde: agua almacenada. Línea discontinua: umbral de estrés. El marcador vertical indica el turno.</p>
        <BalanceChart data={selected.series.filter((entry) => entry.date >= addDays(original.date, -12) && entry.date <= addDays(original.date, 18))} turnDate={target.date} />
      </section>}
      <details className="my-8 border-y border-line py-4">
        <summary className="cursor-pointer text-lg font-semibold">¿Por qué?</summary>
        <div className="mt-3 grid max-w-4xl gap-3 text-sm leading-relaxed text-muted">
          <p><strong>Datos regionales.</strong> <a className="underline" href={scenarioSources.power}>NASA POWER</a>, serie UTC recuperada el {metadata.fetchedAt}. ET₀ estimada con <a className="underline" href={scenarioSources.faoEt}>FAO-56 Penman–Monteith</a>, temperatura, radiación, humedad media, viento a 2 m y elevación local de referencia de 2.560 m. {scenario.usingImerg ? "Lluvia histórica IMERG Final." : "Se usa precipitación corregida de POWER mientras falta una serie IMERG Final validada."} <a className="underline" href={scenarioSources.imerg}>GPM IMERG</a>.</p>
          <p><strong>Suelo.</strong> <a className="underline" href={scenarioSources.soil}>SoilGrids</a> estima textura y retención a 33 y 1.500 kPa por profundidad. Su celda válida de referencia está a 227 m del punto piloto. Arcilla en 0–30 cm: {scenario.input.soil.slice(0,3).map((layer) => format.format(layer.clay ?? 0) + "%").join(" · ")}. La cobertura es un indicador del calendario, separado de la salud del suelo medida en campo.</p>
          <p><strong>Humedad regional.</strong> <a className="underline" href={scenarioSources.smap}>SMAP L4 v8</a> usa una cuadrícula de 9 km. {smapRows.length ? (() => {
            const sample = smapRows.at(-1)!;
            return "Último registro importado: " + sample.date + ", superficie " + (sample.surface ?? "s/d") + ", raíz " + (sample.root ?? "s/d") + " m³/m³, calidad " + sample.quality + ". Se muestra como contexto.";
          })() : "Serie superficial y radicular pendiente de descarga con Earthdata. El balance parte de un supuesto de humedad inicial, sin ajuste SMAP."}</p>
          <p><strong>{scenario.history ? "Datos declarados" : "Supuestos de la demo"}.</strong> Superficie {format.format(scenario.area)} ha, prioridad «{scenario.input.priority}», {scenario.volumeSource.toLowerCase()} y {scenario.input.turns.length} turnos en el periodo. {use && "Uso declarado de la cosecha actual: " + use + ". "}{scenario.history ? "La recurrencia se deriva de la frecuencia declarada si existe." : "Turnos recurrentes cada " + demoInterval + " días. Calendario y ventanas provisionales."}</p>
          <p><strong>Método.</strong> <a className="underline" href={scenarioSources.faoCrop}>Kc por etapa</a> y <a className="underline" href={scenarioSources.faoBalance}>balance radicular</a>. Supuestos de 72% de agua disponible inicial, 85% de lluvia efectiva y 75% de eficiencia de riego. Se descuentan pérdidas por exceso de capacidad. El riego suplementario es la lámina neta estimada para evitar el umbral al cierre del día. El pronóstico operativo se consulta por separado.</p>
          <p><strong>Restricciones.</strong> La ventana, el orden y la duración se comprueban antes de ordenar. Una opción incompatible con la prioridad queda fuera del orden. Semilla, variedad, salinidad y resultados reales requieren confirmación. Fuentes de apoyo: <a className="underline" href={scenarioSources.barley}>SEFO-SAM cebada</a>, <a className="underline" href={scenarioSources.beans}>SEFO-SAM haba</a> y EcoCrop. El modelo mide sensibilidad al retraso; el ahorro real requiere validación en campo.</p>
        </div>
      </details>
      <Button asChild variant="secondary"><a href="/la-maica/mi-proximo-turno">Revisar mi próximo turno</a></Button>
    </>
  );
}

function RotationPanel({ result, planned, delay, preferredId, active, onSelect }: {
  result: Result; planned: Result; delay: number; preferredId?: string; active: string; onSelect: (id: string) => void;
}) {
  const { rotation, status, firstStress } = result;
  const crops = rotation.seasons.map(({ crop }) => crop.name);
  const profile = cropProfiles[crops.at(-1)!];
  const newStress = delay ? result.series.find((day, index) => day.stressed && planned.series[index]?.stressed === false) : undefined;
  const metrics = [
    ["Primer día de estrés", firstStress ? dateLabel(firstStress.date) + " · " + firstStress.stage : result.stressDays === null ? "Sin cálculo" : "Sin estrés"],
    ["Días con estrés", result.stressDays === null ? "Sin cálculo" : result.stressDays + (delay && planned.stressDays !== null ? " (" + signed(result.stressDays - planned.stressDays) + ")" : "")],
    ["Riego suplementario", result.supplementalMm === null ? "Sin cálculo" : format.format(result.supplementalMm) + " mm" +
      (delay && planned.supplementalMm !== null ? " (" + signed(result.supplementalMm - planned.supplementalMm, " mm") + ")" : "")],
    ["Cobertura estimada", result.coverageDays === null ? "Sin cálculo" : result.coverageDays + " días"],
    ["Prioridad", result.compatible ? "Compatible" : "Requiere confirmar destino"],
  ];
  return (
    <article className="min-w-0 border-t-3 border-action bg-white/35 px-4 py-4 sm:px-5" aria-label={"Opción " + rotation.id}>
      <p className="text-sm font-semibold text-muted">Opción {rotation.id}{rotation.id === preferredId ? " · Preferida" : ""}</p>
      <h3 className="mt-2 font-display text-3xl">{crops[0]} → {crops[1]}</h3>
      <p className="mt-2 text-sm font-semibold">{statusLabels[status]}</p>
      <p className="mt-3 text-sm text-muted">Siembras: {rotation.seasons.map(({start}) => dateLabel(start)).join(" y ")}.</p>
      <dl className="my-3 text-sm">{metrics.map(([key, value]) => <div key={key} className="border-t border-line/70 py-2"><dt className="text-muted">{key}</dt><dd className="font-semibold">{value}</dd></div>)}</dl>
      {newStress && <p className="mb-3 text-sm"><strong>Primer día adicional de estrés</strong><br />{dateLabel(newStress.date)} · {newStress.stage}</p>}
      {result.reasons.length > 0 && <ul className="list-disc space-y-1 pl-4 text-sm text-muted">{result.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}
      <details className="my-3 text-sm">
        <summary className="cursor-pointer font-semibold">Aptitud y semilla</summary>
        <div className="mt-2 space-y-1 text-muted">
          <p>{profile.cold}</p><p>{profile.drought}</p>
          <p>Rendimiento: {profile.yieldRef ?? "sin referencia aplicable confirmada"}.</p>
          <p>Semilla: {profile.seedRef ?? "dosis por confirmar"}. Precio local sin cotizar.</p>
          <p>{profile.use === "grain" ? "Alternancia cereal–leguminosa. El efecto sobre el suelo depende de nodulación, residuos y manejo." : "Secuencia de cereales. La cobertura modelada depende del periodo con cultivo, y la retención de residuos requiere verificación."}</p>
        </div>
      </details>
      {result.series.length > 0 && <Button variant="secondary" aria-pressed={active === rotation.id} onClick={() => onSelect(rotation.id)}>Ver balance de {rotation.id}</Button>}
    </article>
  );
}
