"use client";
import Image from 'next/image';
import { CalendarDays, Check, ChevronRight, Download, Droplet, Droplets, Layers, Leaf, Sprout } from 'lucide-react';
import { useEffect, useMemo, useState, type SubmitEvent } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { NativeSelect } from '../../components/ui/native-select';
import { addDays, compare, et0, initialSoilWater, preferred } from '../../domain/water-balance/model';
import catalogue from '../../data/ecocrop.json';
import { assessTemperature, ecocropSource } from '../../domain/climate/screening';
import { cropProfiles, scenarioSources } from '../comparison/scenario';
import { type CropWater, type Parcel } from './draft';
import type { ParcelHistory } from '../../server/parcel-sources';
import type { ParcelEvidence } from './parcel-decision';
import type { ConsultationPhase } from './consultation-progress';
import { formatDate } from '../operations/model';
import { waterCrops, waterCropGroups, waterCropSource } from './water-crops';
import { downloadRotationNotice, rotationMetrics, rotationPhotos, type PlantingAlternative } from './rotation-notice';

type Settings = { crop: string; harvest: string };
const names = Object.keys(waterCrops);
const priority = 'Usar menos agua';
const fmt = (value: number | null) => value === null ? 'Sin dato' : value.toLocaleString('es-BO',{maximumFractionDigits:1});

function findAlternatives(settings: Settings, history: ParcelHistory, soil: NonNullable<ParcelEvidence['soil']>, latitude: number) {
  const firstPossible = addDays(settings.harvest, 1);
  const weather = history.days.map(day => ({ ...day, et0: et0(day.date, day, latitude, history.elevation) }));
  const seedMonth = (date: string) => Number(date.slice(5, 7));
  const alternatives: PlantingAlternative[] = [];

  for (const crop of Object.values(waterCrops)) {
    if (crop.name === settings.crop || crop.cutting) continue;
    const reference = catalogue.find(entry => entry.name === crop.name && entry.plantingDays);
    const duration = crop.duration || reference?.plantingDays;
    if (!duration || (!crop.seedMonths.length && !reference)) continue;

    // Try the day after harvest and the start of each following month.
    let start = firstPossible;
    for (let month = 0; month < 12; month++, start = addDays(start.slice(0, 7) + '-01', 32).slice(0, 7) + '-01') {
      if (crop.seedMonths.length && !crop.seedMonths.includes(seedMonth(start))) continue;
      let completeCycles = 0;
      const suitableCycles = [];

      for (let year = Number(history.from.slice(0, 4)); year <= Number(history.to.slice(0, 4)); year++) {
        const historicalStart = year + start.slice(4);
        if (!validDate(historicalStart)) continue;
        const historicalEnd = addDays(historicalStart, duration - 1);
        if (historicalStart < history.from || historicalEnd > history.to) continue;
        const days = weather.filter(day => day.date >= historicalStart && day.date <= historicalEnd);
        if (days.length !== duration) continue;

        const sample = history.smap ? initialSoilWater(soil.profile, history.smap.observations, historicalStart, .5) : null;
        const [result] = compare({
          days, soil: soil.profile, turns: [], testTurnId: '', rainEfficiency: .8, irrigationEfficiency: .6,
          initialFraction: sample?.estimate ?? .5, priority,
          rotations: [{ id: crop.name, restrictions: [], seasons: [{ crop, start: historicalStart, end: historicalEnd }] }],
        }, 0);
        if (result.supplementalMm === null) continue;
        if (!reference) {
          suitableCycles.push(result);
          break;
        }

        const means = days.flatMap(day => day.tmean == null ? [] : [day.tmean]);
        if (means.length !== duration || days.some(day => day.tmin === null)) continue;
        completeCycles++;
        const thermal = assessTemperature(means, reference.temperature);
        if (thermal && thermal.category !== 'unsuitable' && days.every(day => day.tmin! > 0)) {
          suitableCycles.push(result);
        }
      }

      // New crops need two complete, thermally suitable cycles forming a majority of the usable years.
      const result = suitableCycles.at(-1);
      if (result && (!reference || (suitableCycles.length >= 2 && suitableCycles.length > completeCycles / 2))) {
        alternatives.push({ start, end: addDays(start, duration - 1), result, estimatedCalendar: Boolean(reference) });
        break;
      }
    }
  }
  return alternatives.sort((a, b) => a.start.localeCompare(b.start) || a.result.supplementalMm! - b.result.supplementalMm!).slice(0, 3);
}

export function RotationDecision({parcel,evidence,known,onProgress}:{parcel:Parcel;evidence?:ParcelEvidence;known?:CropWater;onProgress?:(phase:ConsultationPhase)=>void}) {
  const [settings,setSettings]=useState<Settings>();
  const [history,setHistory]=useState<ParcelHistory>();
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[edit,setEdit]=useState(true);
  const [downloading,setDownloading]=useState(false);
  const [noticeError,setNoticeError]=useState('');
  const knownCrop = waterCrops[known?.currentCrop ?? ''] ? known?.currentCrop : known?.firstCrop;
  const knownHarvest = knownCrop === known?.currentCrop ? known?.currentHarvest : known?.firstHarvest;
  const [selectedCrop, setSelectedCrop] = useState<string>();
  const crop = selectedCrop ?? settings?.crop ?? knownCrop ?? '';

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const harvest = String(new FormData(event.currentTarget).get('harvest') ?? '');
    if (!waterCrops[crop] || !validDate(harvest)) return setError('Elige el cultivo e indica cuándo terminarás de cosechar o cortar.');
    setSettings({ crop, harvest });
    setError('');setEdit(false);
    if (history) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/parcel-sources?kind=history&lat=${parcel.latitude}&lon=${parcel.longitude}`);
      if (!response.ok) throw new Error();
      setHistory(await response.json());
    } catch {
      setError('No pudimos cargar el clima histórico. Pulsa «Cambiar cultivo o fecha» para volver a intentar.');
    } finally { setBusy(false); }
  }

  const soil = evidence?.soil;
  const alternatives = useMemo(
    () => !edit && settings && history && soil ? findAlternatives(settings, history, soil, parcel.latitude) : undefined,
    [edit, settings, history, soil, parcel.latitude],
  );
  const results = alternatives?.map(option => option.result);
  const firstDate = alternatives?.[0]?.start;
  const selected = alternatives && preferred(
    alternatives.filter(option => option.start === firstDate).map(option => option.result), priority,
  );
  const phase: ConsultationPhase = edit ? 'editing' : results?.length ? 'complete' : 'pending';
  useEffect(()=>{onProgress?.(phase);},[phase,onProgress]);
  const resultTitle = selected ? `Para revisar primero: ${selected.rotation.id}` : '';
  const resultAction = 'Confirma con tu técnico la variedad y el agua disponible antes de sembrar.';
  async function saveNotice() {
    if (!settings || !alternatives?.length || !history || !soil) return;
    setDownloading(true);
    setNoticeError('');
    try {
      await downloadRotationNotice({
        title: resultTitle,
        action: resultAction,
        location: `${parcel.latitude.toFixed(5)}, ${parcel.longitude.toFixed(5)}${parcel.areaHa ? ` · ${parcel.areaHa.toLocaleString('es-BO')} ha` : ''}`,
        crop: settings.crop,
        harvest: settings.harvest,
        history: `${history.from} a ${history.to}`,
        soilSource: `${soil.source}${soil.distanceM > 0 ? `, referencia a ${soil.distanceM} m` : ''}`,
        alternatives,
        selected,
      });
    } catch {
      setNoticeError('No pudimos preparar el aviso. Vuelve a intentar la descarga.');
    } finally {
      setDownloading(false);
    }
  }
  return <div className="grid min-w-0 gap-4">
    <div><h2 className="text-2xl font-bold">¿Qué puedes sembrar después?</h2><p className="text-sm text-muted">Te mostramos opciones para después de tu cosecha.</p></div>
    {edit ? <form onSubmit={submit} className="consulta-no-imprimir grid gap-4 rounded-2xl bg-leaf/35 p-4">
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <Choice name="crop" label="¿Qué estás cultivando?" value={crop} onChange={setSelectedCrop}/>
        <label className="grid min-w-0 gap-1 text-sm font-semibold">{waterCrops[crop]?.cutting ? '¿Cuándo terminarás de cortar?' : '¿Cuándo esperas cosechar?'}
          <Input key={crop} name="harvest" type="date" defaultValue={settings?.crop === crop ? settings.harvest : knownCrop === crop ? knownHarvest : ''} required/>
        </label>
      </div>
      <Button type="submit" className="w-full sm:w-fit">Ver qué puedo sembrar</Button>
    </form> : <Button variant="secondary" disabled={busy} className="consulta-no-imprimir justify-self-start" onClick={()=>{setError('');setEdit(true);}}>Cambiar cultivo o fecha</Button>}
    {error && <p role="alert">{error}</p>}
    {busy && <p role="status">Consultando el clima histórico de tu parcela…</p>}
    {!edit && !busy && !error && !soil && <p role="status">{evidence ? 'Faltan datos del suelo para estimar el agua que necesitarían los cultivos.' : 'Consultando el suelo de tu parcela…'}</p>}
    {alternatives?.length === 0 && <p role="status">El historial y los datos de suelo disponibles no alcanzan para estimar opciones para esa fecha.</p>}
    {alternatives && alternatives.length > 0 && settings && history && <>
      <section className="grid min-w-0 gap-3 rounded-2xl border border-line bg-leaf/55 p-3.5 sm:p-5">
        <div className="flex items-start gap-2">
          <Sprout className="mt-0.5 size-5 shrink-0 text-action" aria-hidden="true"/>
          <div>
            <h3 className="text-lg leading-tight font-bold sm:text-xl">{resultTitle}</h3>
            <p className="mt-1 text-sm">{resultAction}</p>
          </div>
        </div>
        <p className="flex items-start gap-2 text-sm"><CalendarDays className="mt-0.5 size-4 shrink-0 text-action" aria-hidden="true"/>
          <span>{settings.crop} · {waterCrops[settings.crop].cutting ? 'Corte previsto' : 'Cosecha prevista'} <strong>{formatDate(settings.harvest)}</strong></span>
        </p>
        <Button type="button" onClick={() => void saveNotice()} disabled={downloading} className="consulta-no-imprimir w-full sm:w-fit">
          <Download size={18} aria-hidden="true"/>{downloading ? 'Preparando PDF…' : 'Descargar aviso de siembra (PDF)'}
        </Button>
        {noticeError && <p role="alert" className="text-sm text-red-800">{noticeError}</p>}
      </section>
      <p className="text-sm text-muted">Las cifras estiman el agua de cada cultivo después de tu cosecha, usando la lluvia histórica.</p>
      <div className="grid min-w-0 gap-4">{alternatives.map(({ result, start, end, estimatedCalendar }) => {
        const crop = result.rotation.seasons[0].crop;
        const details = cropProfiles[crop.name];
        const photo = rotationPhotos[crop.name];
        const metrics = rotationMetrics(result);
        const icons = [Droplets, Droplet, Layers];
        return <article key={result.rotation.id} className="rotation-card" data-selected={result === selected}>
          <div className="rotation-card-media">
            {photo ? <Image src={photo} alt="" fill unoptimized className={crop.name === 'Zanahoria' ? 'object-cover object-[50%_72%]' : 'object-cover'}/> : <Sprout size={42} aria-hidden="true"/>}
            <span className="rotation-card-group"><Leaf size={14} aria-hidden="true"/>{waterCrops[crop.name].group}</span>
          </div>
          <div className="rotation-card-content">
            <div>
              {result === selected && <p className="rotation-card-badge"><Check size={14} strokeWidth={3} aria-hidden="true"/>Para revisar primero</p>}
              <h3 className="rotation-card-title">{crop.name}</h3>
              {estimatedCalendar && <p className="mt-1 text-xs font-semibold text-muted">Calendario local por confirmar</p>}
            </div>
            <dl className="rotation-card-dates">
              <div><dt>Siembra estimada desde</dt><dd><time dateTime={start}>{formatDate(start)}</time></dd></div>
              <div><dt>Cosecha aproximada</dt><dd><time dateTime={end}>{formatDate(end)}</time></dd></div>
            </dl>
          <dl className="rotation-card-metrics">
            {metrics.map(({label,value}, index) => {
              const Icon = icons[index];
              return <div key={label} className="rotation-card-metric">
                <dt><Icon aria-hidden="true"/><span>{label}</span></dt>
                <dd>{value}</dd>
              </div>;
            })}
          </dl>
          <details className="rotation-card-detail text-sm">
            <summary>Ver detalles del cultivo <ChevronRight aria-hidden="true"/></summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {result.reasons.map(reason => <li key={reason}>{reason}</li>)}
              {parcel.areaHa && result.supplementalMm !== null && <li>Agua extra en tu parcela: {fmt(result.supplementalMm * 10 * parcel.areaHa)} m³ netos.</li>}
              <li>Días bajo el umbral de frío: {crop.frostC === undefined ? 'sin umbral validado' : fmt(result.frostDays)}.</li>
              {estimatedCalendar && <li>Ciclo de referencia FAO-56 y temperaturas históricas compatibles. Confirma la fecha de siembra con la variedad que vas a usar.</li>}
              {details && <>
                <li>Ciclo de referencia: {details.duration} días. Ajusta la duración según la variedad.</li>
                <li>{details.drought}.</li><li>{details.cold}.</li>
                {details.yieldRef && <li>{details.yieldRef}</li>}
                {details.seedRef && <li>{details.seedRef}</li>}
              </>}
            </ul>
          </details>
          </div>
        </article>;
      })}</div>
      <details className="rounded-2xl bg-leaf/35 p-4 text-sm"><summary className="cursor-pointer font-semibold">Cómo elegimos estas opciones</summary>
        <p className="mt-2">Buscamos las ventanas de siembra de referencia más próximas a tu cosecha. Si varias opciones empiezan en la misma fecha, mostramos primero la que requeriría menos agua adicional.</p>
        <p className="mt-2">Cuando falta un calendario local, usamos una duración de referencia de FAO-56 y buscamos al menos dos ciclos históricos completos con temperaturas compatibles según EcoCrop y sin mínimas de 0 °C o menos. Las cifras de esas opciones corresponden al ciclo compatible más reciente. El cálculo usa NASA POWER e IMERG ({history.from} a {history.to}), el perfil de suelo y un escenario sin riego. Si falta humedad inicial de SMAP, suponemos el 50 % del agua disponible.</p>
        <p className="mt-2"><a className="underline" href={history.url}>Serie NASA usada</a> · <a className="underline" href={scenarioSources.faoBalance}>Balance FAO-56</a> · <a className="underline" href={waterCropSource}>Ciclos y coeficientes FAO-56</a> · <a className="underline" href={ecocropSource}>EcoCrop</a> · <a className="underline" href={scenarioSources.barley}>SEFO-SAM</a> · <a className="underline" href="/images/informe/creditos.html">Créditos de las fotografías</a></p>
      </details>
    </>}
  </div>;
}
function validDate(value: string) {
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function Choice({name,label,value,onChange}:{name:string;label:string;value:string;onChange:(name:string)=>void}) {
  return <label className="grid min-w-0 gap-1 text-sm font-semibold">{label}
    <NativeSelect name={name} value={waterCrops[value] ? value : ''} onChange={event=>onChange(event.target.value)} required>
      <option value="" disabled>Selecciona un cultivo</option>
      {waterCropGroups.map(group => <optgroup key={group} label={group}>{names.filter(crop=>waterCrops[crop].group===group).map(crop=><option key={crop}>{crop}</option>)}</optgroup>)}
    </NativeSelect>
  </label>;
}
