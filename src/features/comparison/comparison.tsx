"use client";

import dynamic from "next/dynamic";
import { CalendarDays } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { NativeSelect } from "../../components/ui/native-select";
import { addDays, compare, moveTurn, preferred, type Result } from "../../domain/water-balance/model";
import { DraftForm, DraftHeader, Field } from "../pilot/draft-form";
import { getReferenceCase } from "../territory/reference";
import { decimal, productionPriorities, type PilotDraft, type ProductionPriority } from "../pilot/draft";
import { assessDraft, assumedSoilWater, cropProfiles, demoInterval, demoVolume, metadata, prepareScenario, scenarioSources } from "./scenario";
import { FadeContent } from "./fade-content";

const BalanceChart = dynamic(() => import("./balance-chart"), { ssr: false });
const statusLabels = { viable: "Viable en el modelo", conditional: "Condicionada", indeterminate: "Indeterminada" };
const format = new Intl.NumberFormat("es-BO", { maximumFractionDigits: 1 });
const moistureFormat = new Intl.NumberFormat("es-BO", { maximumFractionDigits: 3 });
const dateLabel = (date: string) => date.split("-").reverse().join("/");
const stressDaysLabel = (days: number) => days + (days === 1 ? " día de estrés" : " días de estrés");
const signed = (value: number, unit = "") => Math.abs(value) < 0.05 ? "sin cambio" : (value > 0 ? "+" : "−") + format.format(Math.abs(value)) + unit;
const percent = (fraction: number) => format.format(fraction * 100) + " %";
type Scenario = NonNullable<ReturnType<typeof prepareScenario>>;

export function Comparison() {
  return (
    <div className="py-8 sm:py-10">
      <DraftHeader cover="crops" title="¿Qué siembro después?" description="Compara tres rotaciones y revisa cómo cambia el agua disponible si se retrasa el mismo turno." />
      <DraftForm>{(draft) => <ComparisonContent draft={draft} />}</DraftForm>
    </div>
  );
}

export function ComparisonContent({ draft, consultation = false }: { draft?: PilotDraft; consultation?: boolean }) {
  const reference = draft?.parcel && getReferenceCase(draft.parcel.latitude, draft.parcel.longitude);
  const [demo, setDemo] = useState(() => !consultation && (
    (typeof window !== "undefined" && window.location.hash === "#demo") ||
    !draft?.parcel || (reference === "la-maica" && assessDraft(draft).gaps.length > 0)),
  );
  const [delay, setDelay] = useState<0 | 5>(0);
  const [volume, setVolume] = useState(String(demoVolume));
  const [priority, setPriority] = useState<ProductionPriority>(productionPriorities[0]);
  const [active, setActive] = useState("A");
  const assessment = assessDraft(draft);
  const scenario = prepareScenario(draft, demo, decimal(volume), priority);
  const results = scenario ? [compare(scenario.input, 0), compare(scenario.input, 5)] as const : null;

  return (
    <>
      {!consultation && <div className="mb-5 flex flex-wrap items-center gap-2" role="group" aria-label="Datos de la comparación">
        <Button aria-pressed={!demo} variant={demo ? "secondary" : "default"} onClick={() => setDemo(false)}>Mi parcela</Button>
        <Button aria-pressed={demo} variant={demo ? "default" : "secondary"} onClick={() => setDemo(true)}>Demo La Maica</Button>
      </div>}
      {!demo && assessment.gaps.length > 0 && (
        <Alert role="note" className="max-w-3xl">
          <AlertTitle>{assessment.zone} · datos insuficientes</AlertTitle>
          <AlertDescription>Confirma los datos de esta ubicación para comparar rotaciones compatibles.</AlertDescription>
          <ul className="list-disc space-y-2 py-3 pl-5 text-sm">{assessment.gaps.map((gap) => <li key={gap}>{gap}</li>)}</ul>
          {!consultation && <div className="flex flex-wrap gap-3">
            <Button asChild variant="secondary"><a href="/la-maica/mi-parcela">Revisar la parcela</a></Button>
            <Button asChild variant="secondary"><a href="/la-maica/mi-cultivo-y-mi-agua">Completar cultivo y agua</a></Button>
          </div>}
        </Alert>
      )}
      {demo && <Alert role="note" className="mb-6">
        <AlertTitle>La Maica · parcela ilustrativa</AlertTitle>
        <AlertDescription>El clima y el suelo se tomaron de datos regionales. El calendario, la superficie y el riego representan un escenario reproducible.</AlertDescription>
      </Alert>}
      {demo && <div className="mb-5 grid max-w-2xl gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="demo-priority" className="mb-1.5 block text-sm font-semibold">Mi prioridad en la demo</label>
          <NativeSelect id="demo-priority" value={priority} onChange={(event) => setPriority(event.target.value as ProductionPriority)}>
            {productionPriorities.map((option) => <option key={option}>{option}</option>)}
          </NativeSelect>
        </div>
        <div>
          <Field label="Volumen del turno (m³, supuesto)"><Input value={volume} inputMode="decimal" onChange={(event) => setVolume(event.target.value)} /></Field>
          {!scenario && <p role="alert" className="mt-2 text-sm text-red-800">Ingresa un volumen mayor que cero.</p>}
        </div>
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
    explanation = "Se mantiene la opción " + after.rotation.id + ". El retraso deja " + stressDaysLabel(after.stressDays!) + ": " +
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
      <section className="panel mb-4" aria-labelledby="turn-scenario">
        <h2 id="turn-scenario" className="mb-3 flex items-center gap-2 text-base font-bold"><CalendarDays size={20} aria-hidden="true" /> Turno de la segunda campaña</h2>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Fecha de riego">
          <Button aria-pressed={delay === 0} variant="secondary" className="aria-pressed:border-action aria-pressed:bg-leaf" onClick={() => setDelay(0)}>Turno previsto</Button>
          <Button aria-pressed={delay === 5} variant="secondary" className="aria-pressed:border-action aria-pressed:bg-leaf" onClick={() => setDelay(5)}>5 días más tarde</Button>
        </div>
        <p className="mt-3 text-sm text-muted">Se aplica el <strong data-testid="selected-turn">{dateLabel(target.date)}</strong> · {format.format(scenario.volume)} m³ · {scenario.volumeSource}. Se mantienen el calendario y los otros turnos.</p>
      </section>
      <div aria-live="polite" className="mb-7 rounded-xl bg-leaf/75 px-4 py-4 sm:px-5">
        <FadeContent revision={`${delay}:${scenario.input.priority}`}>
          <p className="font-semibold">{explanation}</p>
          <p className="mt-2 text-sm text-muted">Prioridad evaluada: {scenario.input.priority}. Preferencia del modelo bajo estos supuestos.</p>
        </FadeContent>
      </div>
      <section aria-labelledby="matrix-title">
        <h2 id="matrix-title" className="mb-2 text-2xl font-bold">Matriz de decisión</h2>
        <p className="mb-3 text-sm text-muted">Periodo común {dateLabel(scenario.input.days[0].date)} a {dateLabel(scenario.input.days.at(-1)!.date)}. Los cambios se indican frente al turno previsto.</p>
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,16rem),1fr))]">
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
          <TurnEvidence scenario={scenario} planned={planned} late={late} start={original.date} />
          <p><strong>Datos regionales.</strong> <a className="underline" href={scenarioSources.power}>NASA POWER</a> aporta temperatura, radiación, humedad media y viento a 2 m. ET₀ se estima con <a className="underline" href={scenarioSources.faoEt}>FAO-56 Penman–Monteith</a> y elevación de referencia de 2.560 m.</p>
          <p><strong>Suelo.</strong> <a className="underline" href={scenarioSources.soil}>SoilGrids</a> estima textura y retención a 33 y 1.500 kPa por profundidad. Su celda válida de referencia está a 227 m del punto piloto. Arcilla en 0–30 cm: {scenario.input.soil.slice(0,3).map((layer) => format.format(layer.clay ?? 0) + "%").join(" · ")}. La cobertura es un indicador del calendario, separado de la salud del suelo medida en campo.</p>
          <p><strong>{scenario.history ? "Datos declarados" : "Supuestos de la demo"}.</strong> Superficie {format.format(scenario.area)} ha, prioridad «{scenario.input.priority}», {scenario.volumeSource.toLowerCase()} y {scenario.input.turns.length} turnos en el periodo. {use && "Uso declarado de la cosecha actual: " + use + ". "}{scenario.history ? "La recurrencia se deriva de la frecuencia declarada si existe." : "Turnos recurrentes cada " + demoInterval + " días. Calendario y ventanas provisionales."}</p>
          <p><strong>Método.</strong> <a className="underline" href={scenarioSources.faoCrop}>Kc por etapa</a> y <a className="underline" href={scenarioSources.faoBalance}>balance radicular</a>. Se aplica 85 % de lluvia efectiva y 75 % de eficiencia de riego. Para capas que las raíces incorporan después del inicio se mantiene un supuesto de {percent(assumedSoilWater)} de agua disponible. El riego suplementario es la lámina neta estimada para evitar el umbral al cierre del día.</p>
          <p><strong>Restricciones.</strong> La ventana, el orden y la duración se comprueban antes de ordenar. Una opción incompatible con la prioridad queda fuera del orden. Semilla, variedad, salinidad y resultados reales requieren confirmación. Fuentes de apoyo: <a className="underline" href={scenarioSources.barley}>SEFO-SAM cebada</a>, <a className="underline" href={scenarioSources.beans}>SEFO-SAM haba</a> y EcoCrop. El modelo mide sensibilidad al retraso; el ahorro real requiere validación en campo.</p>
        </div>
      </details>
      <Button asChild variant="secondary"><a href="/la-maica/mi-proximo-turno">Revisar mi próximo turno</a></Button>
    </>
  );
}

function TurnEvidence({ scenario, planned, late, start }: { scenario: Scenario; planned: Result[]; late: Result[]; start: string }) {
  const end = addDays(start, 5);
  const rainWindow = scenario.rain.filter((day) => day.date >= start && day.date < end);
  const imergDays = scenario.rain.filter(({ source }) => source === "IMERG Final").length;
  const powerDays = scenario.rain.filter(({ source }) => source === "POWER").length;
  const gaps = scenario.rain.length - imergDays - powerDays;
  const totalRain = rainWindow.length === 5 && rainWindow.every(({ rain }) => rain !== null)
    ? rainWindow.reduce((total, day) => total + day.rain!, 0) : null;
  const { soilWater } = scenario;
  const reference = scenario.referenceInput ? compare(scenario.referenceInput, 5) : null;
  const amount = (value: number | null) => value === null ? "sin cálculo" : format.format(value);
  return (
    <>
      <p><strong>Cambio al retrasar el turno del {dateLabel(start)} al {dateLabel(end)}.</strong> Se mantienen el volumen, la lluvia, el suelo, el calendario y los demás turnos.</p>
      <ul className="grid gap-2 sm:grid-cols-3" aria-label="Efecto del retraso por cultivo">
        {late.map((result, index) => {
          const onTime = planned[index];
          const original = reference?.[index];
          return <li key={result.rotation.id} className="rounded-xl border border-line bg-surface p-3">
            <strong className="text-ink">{result.rotation.seasons.at(-1)?.crop.name}</strong>
            <p>Días con estrés · {amount(onTime.stressDays)} → {amount(result.stressDays)}</p>
            <p>Riego suplementario (mm) · {amount(onTime.supplementalMm)} → {amount(result.supplementalMm)}</p>
            {original && <p className="mt-2 text-xs">Con el turno retrasado, la referencia con POWER y {percent(assumedSoilWater)} inicial da {original.stressDays === null ? "un resultado indeterminado" : `${stressDaysLabel(original.stressDays)} y ${amount(original.supplementalMm)} mm`}.</p>}
          </li>;
        })}
      </ul>
      <p>
        <strong>Lluvia histórica en UTC.</strong> {scenario.rain.length} días evaluados. <a className="underline" href={scenarioSources.imerg}>IMERG Final{metadata.imergVersion ? " V" + metadata.imergVersion : ""}</a>
        {imergDays > 0 && metadata.imergPowerSource && <> vía la <a className="underline" href={metadata.imergPowerSource}>API diaria de NASA POWER</a></>}
        {" "}aporta {imergDays} días y POWER aporta {powerDays} días. {gaps > 0 && <>Quedan {gaps} días sin dato. </>}
        Del {dateLabel(start)} al {dateLabel(addDays(end, -1))}, {totalRain === null ? "faltan datos para sumar la lluvia" : `se acumulan ${format.format(totalRain)} mm antes de aplicar la fracción efectiva`}. Consulta la disponibilidad de IMERG Early para lluvia reciente en <a className="underline" href="/la-maica/mi-proximo-turno">Agua</a>.
      </p>
      <p><strong>Humedad inicial.</strong> <a className="underline" href={scenarioSources.smap}>SMAP L4 v8</a> describe la humedad regional a 9 km. Fecha requerida {dateLabel(soilWater.date)} UTC. {soilWater.sample && <>Superficie {soilWater.sample.surface === null ? "sin dato" : moistureFormat.format(soilWater.sample.surface)} y zona radicular {soilWater.sample.root === null ? "sin dato" : moistureFormat.format(soilWater.sample.root)} m³/m³. Calidad {soilWater.sample.quality === "accepted" ? "revisada" : soilWater.sample.quality === "suspect" ? "pendiente de revisión" : "dato ausente"}. </>}{soilWater.estimate === null
        ? `Sin una muestra utilizable para el inicio, se supone ${percent(soilWater.fraction)} del agua disponible.`
        : `La humedad radicular y los límites de retención de SoilGrids estiman ${percent(soilWater.estimate)} del agua disponible inicial. La humedad superficial se muestra como contexto.`}</p>
    </>
  );
}

function RotationPanel({ result, planned, delay, preferredId, active, onSelect }: {
  result: Result; planned: Result; delay: number; preferredId?: string; active: string; onSelect: (id: string) => void;
}) {
  const { rotation, status, firstStress } = result;
  const recommended = rotation.id === preferredId;
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
    <article className="panel rotation-option motion-safe:transition-colors" data-preferred={recommended} aria-label={"Opción " + rotation.id}>
      <p className="text-sm font-semibold text-muted">Opción {rotation.id}{recommended ? " · Preferida" : ""}</p>
      <h3 className="mt-2 text-xl font-bold">{crops[1]}</h3>
      <p className="text-sm text-muted">Después de {crops[0].toLowerCase()}</p>
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
