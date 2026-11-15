"use client";
import { useEffect, useId, useState, type SubmitEvent } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Sprout, CalendarDays, Droplets, FileText, Save } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { NativeSelect } from '../../components/ui/native-select';
import { addDays, dayDistance, availableWaterFraction, forecastBalance, moveTurn, type Turn } from '../../domain/water-balance/model';
import { waterCrops, waterCropGroups, waterCropSource, waterRootSource, localCropSource } from './water-crops';
import { formatDate, localDate, type Forecast } from '../operations/model';
import { ForecastPanel, type ForecastAvailability } from '../operations/next-turn';
import { cropWaterFromReport, type CropWater, type Parcel, type ReportWater, type SavedWaterReport, type WaterReportOptions } from './draft';
import type { ParcelEvidence } from './parcel-decision';
import type { ConsultationPhase } from './consultation-progress';
import { WaterOutlook } from './water-outlook';
import { IrrigationNoticeDialog } from './irrigation-notice-dialog';
import type { IrrigationNotice } from './irrigation-notice';

type WaterSettings = Pick<ReportWater, 'crop' | 'planting' | 'harvest' | 'turn'> &
  Omit<WaterReportOptions, 'period' | 'reviewed' | 'delayed'> & { depth: number };

const n=(value:number)=>value.toLocaleString('es-BO',{maximumFractionDigits:1});
export function WaterDecision({parcel,evidence,known,restored,onCropKnown,onProgress,onSave,creatingParcel,parcelId,saveFooter}: {
  parcel:Parcel; evidence?:ParcelEvidence; known?:CropWater;
  restored?: SavedWaterReport;
  onCropKnown?:(crop:CropWater)=>void; onProgress?:(phase:ConsultationPhase)=>void;
  onSave?:(water:ReportWater, options:WaterReportOptions)=>Promise<void>;
  creatingParcel?:boolean;
  parcelId?:string;
  saveFooter:HTMLDivElement | null;
}) {
  const router = useRouter();
  const formId = useId();
  const today=localDate(new Date().toISOString());
  const [settings,setSettings]=useState<WaterSettings | undefined>(() => {
    if (!restored) return undefined;
    const { crop, planting, harvest, turn, depthMm } = restored.inputs;
    const options = restored.options;
    return { crop, planting, harvest, turn: turn >= today ? turn : '', depth: turn >= today ? depthMm ?? 0 : 0,
      pastTurn: options?.pastTurn ?? '', pastDepth: options?.pastDepth ?? 0, initial: options?.initial ?? 'modeled',
      fraction: options?.fraction ?? .5, rainEfficiency: options?.rainEfficiency ?? .8, irrigationEfficiency: options?.irrigationEfficiency ?? .6 };
  });
  const [editedCrop,setEditedCrop]=useState<string>();
  const [forecast,setForecast]=useState<Forecast>();
  const [forecastAvailability,setForecastAvailability]=useState<ForecastAvailability>('loading');
  const [edit,setEdit]=useState(!restored?.options?.reviewed || restored.inputs.harvest < today);
  const [error,setError]=useState('');
  const [delayed,setDelayed]=useState(restored?.options?.delayed ?? false);
  const [period,setPeriod]=useState<7|14>(restored?.options?.period ?? 7);
  const [notice,setNotice]=useState<IrrigationNotice|null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle'|'saving'|'saved'|'error'|'return-error'>('idle');
  const saveLabel = creatingParcel ? 'Guardar parcela, cultivo y turno' : 'Guardar cultivo y turno';
  const formValues=settings;
  const selectedName=editedCrop??formValues?.crop??(known?.currentCrop&&waterCrops[known.currentCrop]?known.currentCrop:'');
  const selectedCrop=waterCrops[selectedName];
  const sameCrop=formValues?.crop===selectedName;
  const missingSoil=!!evidence&&!evidence.soil;
  const plannedDate = known?.turnDate && known.turnDate >= today && !['Aplicado', 'Cancelado'].includes(known.turnStatus ?? '')
    ? known.turnDate : '';
  const plannedDepth = plannedDate ? known?.turnDepthMm ?? (known?.volumeM3 && parcel.areaHa ? known.volumeM3 / (parcel.areaHa * 10) : '') : '';
  function reportValues({crop, planting, harvest, turn, depth}: WaterSettings): ReportWater {
    return { location: { latitude: parcel.latitude, longitude: parcel.longitude }, crop, planting, harvest, turn, depthMm: turn ? depth : null };
  }
  async function saveWater(values: WaterSettings, returnToParcels = false, reviewed = !edit, delay = delayed) {
    if (!onSave || saveStatus === 'saving') return;
    if (returnToParcels && saveStatus === 'saved') {
      router.push('/la-maica/mi-parcela');
      return;
    }
    setSaveStatus('saving');
    try {
      const { pastTurn, pastDepth, initial, fraction, rainEfficiency, irrigationEfficiency } = values;
      await onSave(reportValues(values), { reviewed, period, delayed: delay,
        pastTurn, pastDepth, initial, fraction, rainEfficiency, irrigationEfficiency });
      setSettings(values);
      setSaveStatus('saved');
      if (returnToParcels) router.push('/la-maica/mi-parcela');
    } catch {
      setSaveStatus(returnToParcels ? 'return-error' : 'error');
    }
  }
  function submit(event:SubmitEvent<HTMLFormElement>) {
    event.preventDefault();const data=new FormData(event.currentTarget);const read=(k:string)=>String(data.get(k)??'');
    const action = event.nativeEvent.submitter?.getAttribute('value');
    const returnToParcels = action === 'save-return';
    const saving = action === 'save' || returnToParcels;
    function validationError(message: string) {
      setError(message);
      if (returnToParcels) event.currentTarget.scrollIntoView({ block: 'end' });
    }
    if (saveStatus === 'saving' || (!saving && missingSoil)) return;
    const crop=read('crop'),planting=read('planting'),profile=waterCrops[crop];
    if(!profile||!planting)return validationError('Elige el cultivo e indica la fecha para continuar.');
    if(profile.requiresEndDate&&!read('harvest'))return validationError(profile.cutting?'Indica cuándo esperas hacer el próximo corte.':'Indica cuándo esperas cosechar. Puede ser una fecha aproximada.');
    const harvest=read('harvest')||addDays(planting,profile.duration-1);
    if(planting>today||harvest<today||harvest<=planting)return validationError(profile.cutting?'El último corte debe ser hoy o antes; el próximo corte debe ser después.':'La siembra debe ser hoy o antes y la cosecha todavía no debe haber pasado. Revisa las fechas.');
    const turn=read('turn'),depth=Number(read('depth')||0);
    if(Boolean(turn)!==(depth>0))return validationError('Para incluir riego, indica fecha y cantidad. Puedes dejar ambos vacíos para evaluar sin riego.');
    if (turn && turn > harvest) return validationError('El turno debe ser el día de la cosecha o antes.');
    const pastTurn=read('pastTurn'),pastDepth=Number(read('pastDepth')||0);
    if(Boolean(pastTurn)!==(pastDepth>0))return validationError('Completa fecha y cantidad del riego pasado, o deja ambos vacíos.');
    const values: WaterSettings = {crop,planting,harvest,turn,depth,pastTurn,pastDepth,initial:read('initial') === 'scenario' ? 'scenario' : 'modeled',fraction:Number(read('fraction'))/100,
      rainEfficiency:Number(read('rainEfficiency'))/100,irrigationEfficiency:Number(read('irrigationEfficiency'))/100};
    if (saving) {
      setError('');
      void saveWater(values, returnToParcels);
      return;
    }
    setSettings(values);
    onCropKnown?.(cropWaterFromReport(known, parcel, reportValues(values)));
    setEdit(false);setError('');setDelayed(false);
    if (parcelId) void saveWater(values, false, true, false);
  }
  function changePeriod(value: 7 | 14) {
    if (saveStatus === 'saving') return;
    setPeriod(value);
    if (saveStatus === 'saved') setSaveStatus('idle');
  }
  const profile=settings&&waterCrops[settings.crop];
  const soil=evidence?.soil;
  const candidate=evidence?.smap?.recent?evidence.smap.latest:null;
  const elapsed=candidate?Math.max(0,dayDistance(candidate.date,today)-1):0;
  const warmup=forecast?.history?.filter(d=>candidate&&d.date>candidate.date&&d.date<today)??[];
  const smap=candidate&&warmup.length===elapsed?candidate:null;
  let initial=settings?.initial==='scenario'?settings.fraction:soil&&smap?.root!=null?availableWaterFraction(soil.profile,1,smap.root):
    soil&&evidence?.moisture?.date===today?availableWaterFraction(soil.profile,.81,evidence.moisture.root):null;
  if(settings&&profile&&soil&&smap&&settings.initial!=='scenario'&&initial!=null&&warmup.length){
    const past=forecastBalance({days:warmup.map(d=>({date:d.date,rain:d.rain,et0:d.et0,tmin:d.minimum})),soil:soil.profile,crop:profile,planting:settings.planting,harvest:settings.harvest,
      initialFraction:initial,turns:settings.pastTurn?[{id:'past',date:settings.pastTurn,grossMm:settings.pastDepth}]:[],rainEfficiency:settings.rainEfficiency,irrigationEfficiency:settings.irrigationEfficiency});
    const last=past?.rows.at(-1);initial=last?last.storageMm/last.capacityMm:null;
  }
  const days=forecast?.days.filter(d=>d.date<=addDays(today,period-1)&&(!settings||d.date<=settings.harvest)).map(d=>({date:d.date,rain:d.rain,et0:d.et0,tmin:d.minimum}));
  const turns:Turn[]=settings?.turn?[{id:'next',date:settings.turn,grossMm:settings.depth}]:[];
  const calculate=(delay:number)=>settings&&profile&&soil&&days?.[0]?.date===today&&initial!=null&&forecast?.today===today ?forecastBalance({days,soil:soil.profile,crop:profile,planting:settings.planting,harvest:settings.harvest,
    initialFraction:initial,turns:moveTurn(turns,'next',delay),rainEfficiency:settings.rainEfficiency,irrigationEfficiency:settings.irrigationEfficiency}):null;
  const baseline = calculate(0);
  const turnInWindow = Boolean(settings?.turn && days?.some(({ date }) => date === settings.turn));
  const compareDelay = delayed && turnInWindow;
  const result = compareDelay ? calculate(5) : baseline;
  const scenarioTurn = settings?.turn ? addDays(settings.turn, compareDelay ? 5 : 0) : "";
  const scenarioHasTurn = Boolean(scenarioTurn && days?.some(({ date }) => date === scenarioTurn));
  const phase:ConsultationPhase=edit?'editing':result?'complete':'pending';
  useEffect(()=>{onProgress?.(phase);},[phase,onProgress]);
  const partial=!!days&&days.length<period&&settings&&settings.harvest>=addDays(today,period-1);
  const forecastFailed=forecastAvailability==='unavailable'||forecastAvailability==='cached';
  const moisturePending=Boolean(soil)&&evidence?.moisture===undefined&&initial==null;
  const severity=result?.stressDays?'Revisa la humedad antes del próximo riego':result?'Sin señal de falta de agua en el escenario':forecastFailed?'No pudimos actualizar el pronóstico':!forecast||moisturePending?'Preparando tu consulta…':'Faltan datos para completar la consulta';
  const cropWater=settings?cropWaterFromReport(known, parcel, reportValues(settings)):known;
  const action=result?.firstStress?`Revisa si la tierra está húmeda donde llegan las raíces. El cálculo muestra posible falta de agua desde el ${formatDate(result.firstStress)}; confirma la fecha del riego con quien te entrega el agua.`:'El cálculo no muestra falta de agua con estos datos. Revisa la humedad de la tierra antes de cambiar la fecha del riego.';
  function previewNotice(){
    if(!settings||!result||!forecast||!soil||initial==null)return;
    setNotice({issuedAt:new Date().toISOString(),queriedAt:forecast.queriedAt,latitude:parcel.latitude,longitude:parcel.longitude,areaHa:parcel.areaHa,
      crop:settings.crop,planting:settings.planting,harvest:settings.harvest,requestedDays:period,rainMm:result.rainMm,demandMm:result.demandMm,stressDays:result.stressDays,firstStress:result.firstStress,
      irrigationDate:scenarioTurn,irrigationMm:settings.depth,delayed:compareDelay,action,
      soilSource:`${soil.source}${soil.distanceM>0?` (referencia a ${soil.distanceM} m del punto)`:''}`,
      moistureSource:settings.initial==='scenario'?'Supuesto elegido por el usuario':smap?`NASA SMAP L4 vía POWER (${smap.date}), actualizado mediante balance`:'Modelo Open-Meteo (0-81 cm)',
      rainEfficiency:settings.rainEfficiency,irrigationEfficiency:settings.irrigationEfficiency,initialFraction:initial,
      days:result.rows.map(balance=>({...forecast.days.find(day=>day.date===balance.date)!,balance}))});
  }
  return <div className="grid gap-4">
    <div><h2 className="text-2xl font-bold">¿Le alcanzará el agua a tu cultivo?</h2><p className="mt-1 text-sm text-muted">Cuéntanos qué tienes sembrado. Revisaremos la lluvia prevista y el agua que podría necesitar.</p></div>
    {edit?<form id={formId} onSubmit={submit} onChange={() => { if (saveStatus !== 'saving') setSaveStatus('idle'); }} className="rounded-3xl bg-leaf/35 p-4 sm:p-6 consulta-no-imprimir">
      <fieldset disabled={saveStatus === 'saving'} className="grid min-w-0 gap-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid content-start gap-2 text-sm font-semibold"><span className="flex items-center gap-2"><Sprout size={20} aria-hidden="true"/>¿Qué estás cultivando?</span><NativeSelect name="crop" value={selectedName} onChange={e=>{setEditedCrop(e.target.value);setError('');}} required><option value="" disabled>Selecciona tu cultivo</option>{waterCropGroups.map(group=><optgroup key={group} label={group}>{Object.values(waterCrops).filter(c=>c.group===group).map(c=><option key={c.name}>{c.name}</option>)}</optgroup>)}</NativeSelect></label>
        <label className="grid content-start gap-2 text-sm font-semibold"><span className="flex items-center gap-2"><CalendarDays size={20} aria-hidden="true"/>{selectedCrop?.cutting?'¿Cuándo fue el último corte?':'¿Cuándo lo sembraste?'}</span><Input key={selectedName} name="planting" type="date" defaultValue={sameCrop?formValues.planting:known?.currentCrop===selectedName?known.currentPlanting:''} max={today} required/></label>
        {selectedCrop?.requiresEndDate&&<label className="grid content-start gap-2 text-sm font-semibold">{selectedCrop.cutting?'¿Cuándo esperas hacer el próximo corte?':'¿Cuándo esperas cosechar?'}<Input key={selectedName} name="harvest" type="date" defaultValue={sameCrop?formValues.harvest:known?.currentCrop===selectedName?known.currentHarvest:''} min={today} required/><small className="font-normal text-muted">Puede ser una fecha aproximada. Así tomamos en cuenta la duración de tu cultivo.</small></label>}
      </div>
      {selectedCrop?.cutting&&<p className="text-sm">Para alfalfa que ya has cortado: revisamos el agua que necesita para volver a crecer hasta el siguiente corte.</p>}
      <details className="rounded-2xl bg-white/80 p-4 sm:p-5">
        <summary className="cursor-pointer font-semibold">¿Vas a regar? Agrega la fecha y la cantidad</summary>
        <p className="mt-2 text-sm text-muted">Es opcional. Si no sabes cuánto regarás, deja ambos campos vacíos: veremos qué pasaría sin agregar riego.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="grid content-start gap-2 text-sm font-semibold">¿Qué día vas a regar?<Input name="turn" type="date" min={today} defaultValue={formValues?.turn??plannedDate}/></label>
          <label className="grid content-start gap-2 text-sm font-semibold">¿Cuánta agua aplicarás? (litros por m²)<Input name="depth" type="number" min="0" max="500" step="any" placeholder="Ej.: 30" defaultValue={formValues?.depth??plannedDepth}/><small className="font-normal text-muted">La cantidad por cada metro cuadrado, no el total del terreno. Si te la indican en mm, escribe el mismo número: 1 mm = 1 litro por m².</small></label>
        </div>
        <details className="mt-4 rounded-xl bg-leaf/30 p-3">
          <summary className="cursor-pointer text-sm font-semibold">¿Ya regaste en los últimos días?</summary>
          <p className="mt-2 text-sm text-muted">Agrega un riego reciente si conoces la fecha y la cantidad. Se tendrá en cuenta cuando actualicemos un dato anterior de humedad.</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <label className="grid content-start gap-2 text-sm">¿Qué día regaste?<Input name="pastTurn" type="date" min={evidence?.smap?.latest?addDays(evidence.smap.latest.date,1):addDays(today,-7)} max={addDays(today,-1)} defaultValue={settings?.pastTurn}/></label>
            <label className="grid content-start gap-2 text-sm">¿Cuánta agua aplicaste? (litros por m²)<Input name="pastDepth" type="number" min="0" max="500" step="any" defaultValue={settings?.pastDepth??''}/></label>
          </div>
        </details>
      </details>
      <details className="rounded-2xl bg-white/60 p-4">
        <summary className="cursor-pointer text-sm font-semibold">Más opciones (opcional)</summary>
        {!selectedCrop?.requiresEndDate&&<label className="mt-4 grid gap-2 text-sm">¿Cuándo esperas cosechar?<Input key={selectedName} name="harvest" type="date" defaultValue={sameCrop?formValues.harvest:known?.currentCrop===selectedName?known.currentHarvest:''} min={today}/><small className="text-muted">Si no sabes la fecha, déjala vacía. Usaremos la duración habitual de este cultivo.</small></label>}
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-semibold">Ajustes del cálculo</summary>
          <p className="mt-2 text-sm text-muted">Puedes dejarlos como están. Son valores de referencia; cámbialos si cuentas con información de tu terreno o apoyo técnico.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="grid content-start gap-2 text-sm">¿Cómo estimamos el agua que ya tiene el suelo?<NativeSelect name="initial" defaultValue={settings?.initial??'modeled'}><option value="modeled">Usar el dato reciente disponible</option><option value="scenario">Probar una cantidad de agua de ejemplo</option></NativeSelect></label>
            <label className="grid content-start gap-2 text-sm">Agua en el suelo para el ejemplo (%)<Input name="fraction" type="number" min="0" max="100" defaultValue={(settings?.fraction??.5)*100} required/><small className="text-muted">Solo se usa si eliges probar un ejemplo. 50 % representa la mitad de la reserva útil; no es una medición.</small></label>
            <label className="grid content-start gap-2 text-sm">Parte de la lluvia que aprovecha el cultivo (%)<Input name="rainEfficiency" type="number" min="0" max="100" defaultValue={(settings?.rainEfficiency??.8)*100} required/><small className="text-muted">80 % supone que se aprovechan 80 de cada 100 litros de lluvia.</small></label>
            <label className="grid content-start gap-2 text-sm">Parte del riego que llega a las raíces (%)<Input name="irrigationEfficiency" type="number" min="1" max="100" defaultValue={(settings?.irrigationEfficiency??.6)*100} required/><small className="text-muted">60 % supone que llegan a las raíces 60 de cada 100 litros aplicados.</small></label>
          </div>
        </details>
      </details>
      {error&&<p role="alert">{error}</p>}
      {missingSoil && <p className="rounded-2xl bg-white/75 p-3 text-sm">Puedes ver las próximas lluvias más abajo. La estimación de agua de tu cultivo estará disponible cuando tengamos información del suelo.</p>}
      <div className="flex flex-wrap gap-2">
        {!missingSoil && <Button type="submit" disabled={!evidence || saveStatus === 'saving'}><Droplets size={18} aria-hidden="true"/>{evidence?'Ver cómo estará el agua':'Cargando datos del terreno…'}</Button>}
        {onSave && <Button type="submit" value="save" variant="secondary" disabled={saveStatus === 'saving' || saveStatus === 'saved'}>{saveStatus === 'saving' ? 'Guardando…' : saveLabel}</Button>}
      </div>
      </fieldset>
    </form>:<div className="consulta-no-imprimir flex flex-wrap gap-2">
      <Button variant="secondary" disabled={saveStatus === 'saving'} onClick={()=>setEdit(true)}>Cambiar cultivo o riego</Button>
      {onSave && settings && <Button type="button" disabled={saveStatus === 'saving' || saveStatus === 'saved'} onClick={() => void saveWater(settings)}>{saveStatus === 'saving' ? 'Guardando…' : saveLabel}</Button>}
      {onSave && compareDelay && <p className="w-full text-sm text-muted">Se guarda la fecha de riego indicada. El retraso es una simulación.</p>}
    </div>}
    {saveStatus === 'saved' && <p role="status" className="consulta-no-imprimir font-semibold">Cultivo y turno guardados en tu cuenta</p>}
    {saveStatus === 'error' && <p role="alert" className="consulta-no-imprimir text-sm text-red-800">No pudimos guardar. Revisa la conexión y que la parcela siga en tu cuenta. Tus datos siguen aquí.</p>}
    {onSave && saveFooter && (edit || settings) && createPortal(<>
      <Button type={edit ? 'submit' : 'button'} form={edit ? formId : undefined} value="save-return"
        className="max-sm:w-full" disabled={saveStatus === 'saving'}
        onClick={edit ? undefined : () => { if (settings) void saveWater(settings, true); }}>
        <Save size={18} className="shrink-0" aria-hidden="true"/>
        {saveStatus === 'saving' ? 'Guardando…' : 'Guardar y volver a Mis parcelas'}
      </Button>
      {saveStatus === 'return-error' && <p role="alert" className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-red-800">No se pudo guardar. Intenta de nuevo.</p>}
    </>, saveFooter)}
    {settings&&!edit&&<section className="rounded-2xl bg-leaf/50 p-4 sm:p-6" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-xl font-bold">{severity}</h3>
        <div role="group" aria-label="Periodo del análisis de agua" className="water-period consulta-no-imprimir">
          {([7,14] as const).map(value=><Button key={value} variant="secondary" aria-pressed={period===value} onClick={()=>changePeriod(value)}>{value} días</Button>)}
        </div>
      </div>
      {result?<>
        <p className="mt-2">{settings.crop} · próximos {result.rows.length} días</p>
        {forecast&&<WaterOutlook result={result} forecast={forecast} period={period} action={action}/>}
        {partial&&<p className="mt-2 font-semibold">Pronóstico parcial: hay {result.rows.length} de {period} días disponibles.</p>}
        <p className="mb-2 text-sm text-muted">1 mm equivale a 1 litro de agua por m². El agua que necesita el cultivo puede venir de la lluvia, del suelo y del riego.</p>
        {result.stressDays>0&&result.rainMm>=result.demandMm&&<p className="mb-2 text-sm">Aunque la lluvia total parece suficiente, también importa cuándo llueve y cuánta agua puede guardar el suelo. Por eso pueden aparecer días con falta de agua.</p>}
        <p className="text-sm">Estimación para orientarte, no una medición en tu terreno. {scenarioHasTurn
          ? `Incluye el riego ${compareDelay ? 'retrasado' : 'indicado'} para el ${formatDate(scenarioTurn)}.`
          : scenarioTurn ? `El turno del ${formatDate(scenarioTurn)} queda fuera de los días analizados.` : 'No incluye riegos futuros: solo la lluvia prevista.'}</p>
        <details className="mt-4 text-sm"><summary className="cursor-pointer font-semibold">Cómo hicimos esta estimación</summary><div className="mt-3 space-y-2">
        <p className="text-sm">Humedad inicial: {settings.initial==='scenario'?'supuesto elegido':smap?`SMAP L4 vía POWER · promedio UTC ${smap.date}, actualizado con ${warmup.length} días de balance hasta hoy. Producto regional en revisión, no medición de campo`:'modelo Open-Meteo (0–81 cm), no observación SMAP'} · {n((initial??0)*100)} % del agua disponible. Lluvia aprovechable {n(settings.rainEfficiency*100)} %, eficiencia de riego {n(settings.irrigationEfficiency*100)} %: supuestos editables.</p>
        {smap&&settings.initial!=='scenario'&&<p className="mt-2 text-sm">{settings.pastTurn?`Riego pasado incluido: ${settings.pastDepth} mm el ${settings.pastTurn}.`:'No se incluyó riego desde la observación SMAP.'} La media diaria UTC se toma como aproximación al inicio del siguiente día local; puede existir diferencia por el horario de la lluvia.</p>}
        {smap&&warmup.length>0&&settings.initial!=='scenario'&&<p className="mt-2 text-sm">Actualización desde SMAP: {warmup.filter(d=>d.rainSource==='imerg-early').length} días de lluvia GPM IMERG Early y {warmup.filter(d=>d.rainSource!=='imerg-early').length} días de lluvia modelada Open-Meteo. El consumo diario usa ET₀ modelada y el coeficiente del cultivo.</p>}
        <p>{profile?.note} El desarrollo del cultivo se aproxima por etapas según las fechas indicadas. Los coeficientes FAO son referencias; no están calibrados para cada variedad o terreno.</p>
        <p><a className="underline" href={waterCropSource} target="_blank" rel="noreferrer">Consumo de agua · FAO-56</a> · <a className="underline" href={waterRootSource} target="_blank" rel="noreferrer">Raíces y suelo · FAO-56</a> · <a className="underline" href={localCropSource} target="_blank" rel="noreferrer">Cultivos de los valles · Agrecol Andes</a></p>
        </div></details>
        {turnInWindow && <div className="mt-3"><Button variant="secondary" aria-pressed={compareDelay} className="consulta-no-imprimir" disabled={saveStatus === 'saving'} onClick={() => {setDelayed(v=>!v); if (saveStatus === 'saved') setSaveStatus('idle');}}>{compareDelay?'Ver riego sin retraso':'¿Qué pasa si riego 5 días después?'}</Button><p className="mt-2 text-sm">Escenario: {compareDelay?'riego retrasado 5 días':'riego sin retraso'}. {compareDelay&&baseline?`${result.stressDays-baseline.stressDays} días adicionales con estrés respecto al riego sin retraso.`:''}</p></div>}
        {result.excessMm>0&&<p className="mt-3 text-sm">El modelo calcula {n(result.excessMm)} mm por encima de la capacidad de retención. Puede perderse por drenaje o escorrentía; no confirma anegamiento ni desborde de canales.</p>}
        <details className="mt-4"><summary className="cursor-pointer font-semibold">Ver balance diario</summary><div className="mt-2 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th>Fecha</th><th>Lluvia útil</th><th>Riego útil</th><th>Demanda</th><th>Agua restante</th><th>Estado</th></tr></thead><tbody>{result.rows.map(r=><tr key={r.date}><td className="py-2">{r.date}</td><td>{n(r.rainMm)} mm</td><td>{n(r.irrigationMm)} mm</td><td>{n(r.potentialEtMm)} mm</td><td>{n(r.storageMm)} mm</td><td>{r.stressed?'Revisar':'Sin señal'}</td></tr>)}</tbody></table></div></details>
        <Button variant="secondary" className="mt-4 consulta-no-imprimir" onClick={previewNotice}><FileText size={19} aria-hidden="true"/>Ver aviso para coordinar el riego</Button>
        <p className="mt-2 text-sm">Revisa el aviso y descarga un PDF para compartirlo. No se envía automáticamente.</p>
      </>:<p className="mt-2">{!evidence?'Buscando información del suelo…':!soil?'Nos faltan datos del suelo para estimar el agua de tu cultivo. Puedes consultar las próximas lluvias.':forecastFailed?'Tus datos siguen aquí. Pulsa «Actualizar pronóstico» más abajo para volver a intentarlo.':!forecast?'Consultando las próximas lluvias. El resultado aparecerá aquí.':moisturePending?'Consultando la humedad del suelo de hoy…':initial==null?'Nos falta el dato de humedad de hoy. En los ajustes puedes probar una cantidad de agua inicial como ejemplo.':'Faltan datos de algunos días; todavía no podemos completar la estimación.'}</p>}
    </section>}
    {notice&&<IrrigationNoticeDialog data={notice} onClose={()=>setNotice(null)}/>}
    <details id="pronostico-agua" open={missingSoil||forecastFailed} className="min-w-0 scroll-mt-24 rounded-2xl bg-white/70 p-4"><summary className="cursor-pointer font-semibold">Ver lluvias y temperatura de los próximos días</summary><div className="mt-4"><ForecastPanel parcel={parcel} parcelId={parcelId} cropWater={cropWater} harvest={settings?.harvest} profile={profile} onForecast={setForecast} onAvailability={setForecastAvailability} period={period} onPeriodChange={changePeriod} showPeriod={edit} consultation/></div></details>
  </div>;
}
