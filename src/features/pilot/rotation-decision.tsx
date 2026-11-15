"use client";
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { CalendarDays, Check, ChevronRight, Download, Droplet, Droplets, Layers, Leaf, Save, Sprout } from 'lucide-react';
import { useEffect, useMemo, useState, type SubmitEvent } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { NativeSelect } from '../../components/ui/native-select';
import catalogue from '../../data/ecocrop.json';
import { ecocropSource } from '../../domain/climate/screening';
import { cropProfiles, scenarioSources } from '../comparison/scenario';
import { decimal, productionPriorities, type CropWater, type Parcel, type SavedRotationReport } from './draft';
import type { ParcelHistory } from '../../server/parcel-sources';
import type { ParcelEvidence } from './parcel-decision';
import type { ConsultationPhase } from './consultation-progress';
import { formatDate } from '../operations/model';
import { waterCrops, waterCropGroups, waterCropSource } from './water-crops';
import { downloadRotationNotice, rotationMetrics, rotationPhotos } from './rotation-notice';
import { planParcelRotations, type RotationRequest } from './parcel-rotations';

const names = Object.keys(waterCrops);
const destinations = ['Forraje', 'Venta', 'Consumo', 'Semilla'];
const fmt = (value: number | null) => value === null ? 'Sin dato' : value.toLocaleString('es-BO', {maximumFractionDigits: 1});

export function RotationDecision({ parcel, evidence, known, restored, onProgress, autoSave, onSave, saveFooter }: {
  parcel: Parcel; evidence?: ParcelEvidence; known?: CropWater; restored?: SavedRotationReport;
  onProgress?: (phase: ConsultationPhase) => void; autoSave: boolean;
  onSave?: (rotation: SavedRotationReport) => Promise<void>; saveFooter: HTMLDivElement | null;
}) {
  const router = useRouter();
  const [settings,setSettings]=useState<RotationRequest | undefined>(restored?.inputs);
  const [history,setHistory]=useState<ParcelHistory>();
  const [busy,setBusy]=useState(Boolean(restored)),[error,setError]=useState(''),[edit,setEdit]=useState(!restored);
  const [downloading,setDownloading]=useState(false);
  const [noticeError,setNoticeError]=useState('');
  const [seedCosts, setSeedCosts] = useState<Record<string, string>>(restored?.seedCosts ?? {});
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const knownCrop = waterCrops[known?.currentCrop ?? ''] ? known?.currentCrop : known?.firstCrop;
  const knownHarvest = knownCrop === known?.currentCrop ? known?.currentHarvest : known?.firstHarvest;
  const knownPlanting = knownCrop === known?.currentCrop ? known?.currentPlanting : known?.firstPlanting;
  const [selectedCrop, setSelectedCrop] = useState<string>();
  const crop = selectedCrop ?? settings?.crop ?? knownCrop ?? '';

  async function saveRotation(inputs: RotationRequest, returnToParcels = false) {
    if (!onSave || saveStatus === 'saving') return;
    setSaveStatus('saving');
    const validCosts = Object.fromEntries(Object.entries(seedCosts)
      .filter(([, text]) => text.trim().length <= 24 && decimal(text) >= 0)
      .map(([name, text]) => [name, text.trim()]));
    try {
      await onSave({ inputs, seedCosts: validCosts });
      setSaveStatus('saved');
      if (returnToParcels) router.push('/la-maica/mi-parcela');
    } catch {
      setSaveStatus('error');
    }
  }

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const field = (name: string) => String(data.get(name) ?? '');
    const harvest = field('harvest');
    const planting = field('planting');
    const habitual = field('habitual');
    if (!waterCrops[crop] || !validDate(harvest)) return setError('Elige el cultivo e indica cuándo terminarás de cosechar o cortar.');
    if (!waterCrops[habitual] || waterCrops[habitual].cutting) return setError('Elige el cultivo que sueles sembrar después.');
    if (planting && (!validDate(planting) || planting > harvest)) return setError('Revisa el orden de las fechas del cultivo actual.');
    const inputs = { crop, harvest, planting, habitual, priority: field('priority'), destination: field('destination') };
    setSettings(inputs);
    setError('');setEdit(false);
    setSaveStatus('idle');
    if (!history) setBusy(true);
    if (autoSave) void saveRotation(inputs);
  }

  useEffect(() => {
    if (edit || history) return;
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(21000)]);
    async function loadHistory() {
      try {
        const response = await fetch(`/api/parcel-sources?kind=history&lat=${parcel.latitude}&lon=${parcel.longitude}`, { signal });
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (!controller.signal.aborted) setHistory(data);
      } catch {
        if (!controller.signal.aborted) setError('No pudimos cargar el clima histórico. Pulsa «Cambiar cultivo o fecha» para volver a intentar.');
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    }
    void loadHistory();
    return () => controller.abort();
  }, [edit, history, parcel.latitude, parcel.longitude]);

  const soil = evidence?.soil;
  const plan = useMemo(
    () => !edit && settings && history && soil ? planParcelRotations(settings, history, soil.profile, parcel.latitude, catalogue) : undefined,
    [edit, settings, history, soil, parcel.latitude],
  );
  const alternatives = plan?.options;
  const selected = plan?.selected;
  const costs = alternatives?.map(({ result, habitual }) => {
    const [, next] = result.rotation.seasons;
    const name = next.crop.name;
    const text = seedCosts[name] ?? '';
    const value = decimal(text);
    return { name, habitual, text, cost: Number.isFinite(value) && value >= 0 ? value : null };
  }) ?? [];
  const habitualCost = costs.find(({ habitual }) => habitual)?.cost ?? null;
  function compareCost(cost: number, habitual: boolean) {
    if (habitual || habitualCost === null) return '';
    const difference = cost - habitualCost;
    return ` Diferencia frente a la habitual: ${difference > 0 ? '+' : ''}${fmt(difference)} Bs/ha.`;
  }
  const phase: ConsultationPhase = edit ? 'editing' : plan ? 'complete' : 'pending';
  useEffect(()=>{onProgress?.(phase);},[phase,onProgress]);
  const resultTitle = selected ? `Para revisar primero: ${selected.rotation.id}` : 'Opciones con restricciones para el destino indicado';
  const resultAction = 'Confirma con tu técnico la variedad y el agua disponible antes de sembrar.';
  async function saveNotice() {
    if (!settings || !plan || !history || !soil) return;
    setDownloading(true);
    setNoticeError('');
    try {
      await downloadRotationNotice({
        title: resultTitle,
        action: resultAction,
        location: `${parcel.latitude.toFixed(5)}, ${parcel.longitude.toFixed(5)}${parcel.areaHa ? ` · ${parcel.areaHa.toLocaleString('es-BO')} ha` : ''}`,
        crop: settings.crop,
        harvest: settings.harvest,
        history: `${plan.from} a ${plan.to}`,
        soilSource: `${soil.source}${soil.distanceM > 0 ? `, referencia a ${soil.distanceM} m` : ''}`,
        alternatives: plan.options,
        selected,
        seedQuotes: costs.flatMap(({ name, cost, habitual }) => cost === null ? [] : [
          `${name}: ${fmt(cost)} Bs/ha.${compareCost(cost, habitual)}`,
        ]),
      });
    } catch {
      setNoticeError('No pudimos preparar el aviso. Vuelve a intentar la descarga.');
    } finally {
      setDownloading(false);
    }
  }
  return <div className="grid min-w-0 gap-4">
    <div><h2 className="text-2xl font-bold">¿Qué puedes sembrar después?</h2><p className="text-sm text-muted">Compara tu rotación habitual con dos opciones para después de tu cosecha.</p></div>
    {edit ? <form onSubmit={submit} className="consulta-no-imprimir grid gap-4 rounded-2xl bg-leaf/35 p-4">
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <Choice name="crop" label="¿Qué estás cultivando?" value={crop} onChange={setSelectedCrop}/>
        <label className="grid min-w-0 gap-1 text-sm font-semibold">{waterCrops[crop]?.cutting ? '¿Cuándo terminarás de cortar?' : '¿Cuándo esperas cosechar?'}
          <Input key={crop} name="harvest" type="date" defaultValue={settings?.crop === crop ? settings.harvest : knownCrop === crop ? knownHarvest : ''} required/>
        </label>
      </div>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <Choice name="habitual" label="¿Qué sueles sembrar después?" defaultValue={settings?.habitual ?? known?.secondCrop} nextCrop />
        <label className="grid gap-1 text-sm font-semibold">Prioridad de producción
          <NativeSelect name="priority" defaultValue={settings?.priority || known?.priority || 'Usar menos agua'}>
            {productionPriorities.map(priority => <option key={priority}>{priority}</option>)}
          </NativeSelect>
        </label>
        <label className="grid gap-1 text-sm font-semibold">Uso de la próxima cosecha
          <NativeSelect name="destination" defaultValue={settings?.destination ?? known?.harvestUse ?? ''}>
            <option value="">Por confirmar</option>
            {destinations.map(destination => <option key={destination}>{destination}</option>)}
          </NativeSelect>
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          {waterCrops[crop]?.cutting ? '¿Cuándo fue el último corte?' : '¿Cuándo lo sembraste? (opcional)'}
          <Input key={'planting-' + crop} name="planting" type="date" required={!!waterCrops[crop]?.cutting}
            defaultValue={settings?.crop === crop ? settings.planting : knownCrop === crop ? knownPlanting : ''}/>
        </label>
      </div>
      <Button type="submit" disabled={saveStatus === 'saving'} className="w-full sm:w-fit">Ver qué puedo sembrar</Button>
    </form> : <Button variant="secondary" disabled={busy || saveStatus === 'saving'} className="consulta-no-imprimir justify-self-start" onClick={()=>{setError('');setEdit(true);}}>Cambiar cultivo o fecha</Button>}
    {saveStatus === 'saved' && <p role="status" className="consulta-no-imprimir text-sm font-semibold">Rotación guardada en tu cuenta</p>}
    {onSave && settings && !edit && saveFooter && createPortal(<>
      <Button type="button" className="max-sm:w-full" disabled={saveStatus === 'saving'}
        onClick={() => void saveRotation(settings, true)}>
        <Save size={18} aria-hidden="true"/> {saveStatus === 'saving' ? 'Guardando…' : 'Guardar y volver a Mis parcelas'}
      </Button>
      {saveStatus === 'error' && <p role="alert" className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-red-800">No se pudo guardar la rotación. Intenta de nuevo.</p>}
    </>, saveFooter)}
    {error && <p role="alert">{error}</p>}
    {busy && <p role="status">Consultando el clima histórico de tu parcela…</p>}
    {!edit && !busy && !error && !soil && <p role="status">{evidence ? 'Faltan datos del suelo para estimar el agua que necesitarían los cultivos.' : 'Consultando el suelo de tu parcela…'}</p>}
    {plan === null && <p role="status">El clima, el suelo o las fechas disponibles no alcanzan para comparar tu rotación habitual con dos alternativas. Revisa las fechas y el cultivo habitual.</p>}
    {plan && alternatives && settings && history && <>
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
      <p className="text-sm text-muted">Prioridad: {settings.priority}. Uso de la próxima cosecha: {settings.destination || 'por confirmar'}. Todas las opciones se simulan con el mismo suelo y el mismo historial.</p>
      <details className="rounded-2xl bg-leaf/35 p-4 text-sm">
        <summary className="min-h-6 cursor-pointer font-semibold">Comparar costos de semilla (opcional)</summary>
        <p className="consulta-no-imprimir mt-2 text-muted">
          Ingresa cuánto gastarías en semilla para sembrar una hectárea. Si cotizaste la rotación habitual, verás cuánto más o menos cuesta cada alternativa.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {costs.map(({ name, habitual, text, cost }) => <div key={name} className="min-w-0">
            <label className="consulta-no-imprimir grid gap-1 font-semibold">
              {name} (Bs/ha)
              <Input inputMode="decimal" maxLength={24} value={text} disabled={saveStatus === 'saving'} onChange={event => {
                const value = event.target.value;
                setSeedCosts(previous => ({ ...previous, [name]: value }));
                setSaveStatus('idle');
              }} />
            </label>
            {cost !== null && <p className="mt-1 text-muted">
              <span className="consulta-filtros-impresos">{name} · </span>
              Costo declarado: {fmt(cost)} Bs/ha.{compareCost(cost, habitual)}
            </p>}
            {text && cost === null && <p className="consulta-no-imprimir mt-1 text-red-800">Escribe un costo mayor o igual a cero.</p>}
          </div>)}
        </div>
      </details>
      <div className="grid min-w-0 gap-4">{alternatives.map(({ result, start, end, estimatedCalendar, habitual }) => {
        const [previous, next] = result.rotation.seasons;
        const crop = next.crop;
        const differentFamily = previous.crop.family && crop.family && previous.crop.family !== crop.family;
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
              <p className="text-xs font-semibold uppercase text-muted">{habitual ? 'Rotación habitual' : 'Alternativa'}</p>
              <h3 className="rotation-card-title">{crop.name}</h3>
              <p className="mt-1 text-sm text-muted">{previous.crop.name} → {crop.name}</p>
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
              <li>Frío durante las campañas: {result.frostDays === null ? 'sin evaluación completa del umbral' : `${fmt(result.frostDays)} días bajo los umbrales de referencia`}.</li>
              <li>{differentFamily ? 'Alternar familias puede interrumpir plagas específicas. Confirma las plagas del lugar.' : 'Repetir una familia puede mantener presión de plagas. Revisa el historial de la parcela.'}</li>
              <li>{crop.family === 'legume' ? 'La leguminosa puede aportar nitrógeno si logra nodular; el aporte depende del manejo.' : 'Evalúa la devolución de rastrojo para conservar materia orgánica.'} La cobertura reduce suelo expuesto y puede protegerlo de la erosión.</li>
              {!details?.yieldRef && <li>Rendimiento local por confirmar con la variedad y manejo de la parcela.</li>}
              {!details?.drought && <li>Tolerancia a sequía por confirmar. Usa la demanda estimada para comparar, junto con el agua disponible.</li>}
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
        <p className="mt-2">Aplicamos el clima observado entre {plan.from} y {plan.to} a las tres secuencias, con el mismo suelo y un escenario sin riego. {plan.usedDeclaredPlanting ? 'Usamos la siembra declarada.' : 'Estimamos la siembra del cultivo actual con su duración de referencia.'} {plan.usedSmap ? 'Inicializamos con humedad radicular SMAP.' : 'Sin SMAP válido para esa fecha, usamos el 50 % de la reserva útil como supuesto.'}</p>
        <p className="mt-2">Priorizamos el destino y el objetivo declarados. Los calendarios sin ventana local usan duración FAO-56 y se contrastan con EcoCrop y las mínimas del periodo. Los costos los declara el productor. La cobertura y las familias de cultivo orientan sobre suelo y plagas; requieren validación en campo.</p>
        <p className="mt-2"><a className="underline" href={history.url}>Serie NASA usada</a> · <a className="underline" href={scenarioSources.faoBalance}>Balance FAO-56</a> · <a className="underline" href={waterCropSource}>Ciclos y coeficientes FAO-56</a> · <a className="underline" href={ecocropSource}>EcoCrop</a> · <a className="underline" href={scenarioSources.barley}>SEFO-SAM</a> · <a className="underline" href="/images/informe/creditos.html">Créditos de las fotografías</a></p>
      </details>
    </>}
  </div>;
}
function validDate(value: string) {
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function Choice({name,label,value,defaultValue,onChange,nextCrop}: {
  name:string; label:string; value?:string; defaultValue?:string; onChange?:(name:string)=>void; nextCrop?:boolean;
}) {
  const options = names.filter(name => !nextCrop || !waterCrops[name].cutting);
  const selection = value === undefined ? { defaultValue: defaultValue && options.includes(defaultValue) ? defaultValue : '' }
    : { value: options.includes(value) ? value : '' };
  return <label className="grid min-w-0 gap-1 text-sm font-semibold">{label}
    <NativeSelect name={name} {...selection} onChange={onChange ? event => onChange(event.target.value) : undefined} required>
      <option value="" disabled>Selecciona un cultivo</option>
      {waterCropGroups.map(group => <optgroup key={group} label={group}>{options.filter(crop=>waterCrops[crop].group===group).map(crop=><option key={crop}>{crop}</option>)}</optgroup>)}
    </NativeSelect>
  </label>;
}
