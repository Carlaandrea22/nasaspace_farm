"use client";
import { useEffect, useState, type SubmitEvent } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { NativeSelect } from '../../components/ui/native-select';
import { addDays, compare, dayDistance, et0, initialSoilWater, preferred, type BalanceInput, type Rotation, type Turn } from '../../domain/water-balance/model';
import { cropProfiles, scenarioSources } from '../comparison/scenario';
import { productionPriorities, type CropWater, type Parcel } from './draft';
import type { ParcelHistory } from '../../server/parcel-sources';
import type { ParcelEvidence } from './parcel-decision';
import type { ConsultationPhase } from './consultation-progress';

type Settings={first:string;second:string;start:string;next:string;priority:string;depth:number;interval:number;fraction:number;rainEfficiency:number;irrigationEfficiency:number;costs:Record<string,number|null>};
const names=Object.keys(cropProfiles);
const fmt=(v:number|null)=>v===null?'Sin dato':v.toLocaleString('es-BO',{maximumFractionDigits:1});

export function RotationDecision({parcel,evidence,known,onProgress}:{parcel:Parcel;evidence?:ParcelEvidence;known?:CropWater;onProgress?:(phase:ConsultationPhase)=>void}) {
  const [settings,setSettings]=useState<Settings>();
  const [history,setHistory]=useState<ParcelHistory>();
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[edit,setEdit]=useState(true),[delay,setDelay]=useState(false);
  const knownCurrentSupported=!!known?.currentCrop&&names.includes(known.currentCrop);
  async function submit(event:SubmitEvent<HTMLFormElement>){
    event.preventDefault();const form=new FormData(event.currentTarget),read=(key:string)=>String(form.get(key)??'');
    const first=read('first'),start=read('start');
    if(!names.includes(first)||!names.includes(read('second')))return setError('Selecciona los dos cultivos para comparar.');
    const next=read('next')||addDays(start,cropProfiles[first].duration+14);
    if(dayDistance(start,next)<cropProfiles[first].duration)return setError('La segunda siembra debe ir después de la cosecha de la primera campaña.');
    if(dayDistance(start,next)>400)return setError('Compara campañas consecutivas, separadas por menos de 400 días.');
    const costs=Object.fromEntries(names.map((name,index)=>[name,read('cost'+index)===''?null:Number(read('cost'+index))]));
    setSettings({first,second:read('second'),start,next,priority:read('priority'),depth:Number(read('depth')),interval:Number(read('interval')),fraction:Number(read('fraction'))/100,
      rainEfficiency:Number(read('rainEfficiency'))/100,irrigationEfficiency:Number(read('irrigationEfficiency'))/100,costs});
    setError('');setEdit(false);
    if(!history){setBusy(true);try{const r=await fetch(`/api/parcel-sources?kind=history&lat=${parcel.latitude}&lon=${parcel.longitude}`);if(!r.ok)throw new Error();setHistory(await r.json());}catch{setError('No pudimos descargar la serie NASA. Reintenta para obtener la comparación.');}finally{setBusy(false);}}
  }
  let input:BalanceInput|undefined;
  let moistureLabel='Supuesto editable';
  let calendarError='';
  if(settings&&history&&evidence?.soil){
    const offset=Number(history.from.slice(0,4))-Number(settings.start.slice(0,4));
    const shift=(date:string)=>`${Number(date.slice(0,4))+offset}${date.slice(4)}`;
    const start=shift(settings.start),next=shift(settings.next);
    const alternatives=[settings.second,...names.filter(n=>n!==settings.second&&n!==settings.first).slice(0,2)];
    const rotations:Rotation[]=alternatives.map((name,i)=>({id:i===0?'Habitual':`Alternativa ${i}`,restrictions:[],seasons:[
      {crop:cropProfiles[settings.first],start,end:addDays(start,cropProfiles[settings.first].duration-1)},
      {crop:cropProfiles[name],start:next,end:addDays(next,cropProfiles[name].duration-1)}]}));
    const end=rotations.map(r=>r.seasons[1].end).sort().at(-1)!;
    if(start<history.from||end>history.to||new Date(start+'T00:00Z').toISOString().slice(0,10)!==start)calendarError='Este calendario no cabe en los dos años de datos descargados. Acerca las dos campañas o cambia la fecha de inicio.';
    else{
      const turns:Turn[]=[];
      if(settings.depth>0)for(let date=addDays(start,settings.interval);date<=end;date=addDays(date,settings.interval))turns.push({id:date,date,grossMm:settings.depth});
      const sample=history.smap?initialSoilWater(evidence.soil.profile,history.smap.observations,start,settings.fraction):null;
      if(sample?.estimate!=null)moistureLabel=`SMAP L4 vía NASA POWER · ${sample.date} UTC · humedad superficial ${fmt((sample.sample?.surface??0)*100)} % y radicular ${fmt((sample.sample?.root??0)*100)} % volumétrico · grilla regional, producto en revisión`;
      input={days:history.days.filter(d=>d.date>=start&&d.date<=end).map(d=>({date:d.date,rain:d.rain,et0:et0(d.date,d,parcel.latitude,history.elevation),tmin:d.tmin})),
        soil:evidence.soil.profile,turns,testTurnId:turns.find(t=>t.date>=next)?.id??'',rainEfficiency:settings.rainEfficiency,irrigationEfficiency:settings.irrigationEfficiency,
        initialFraction:sample?.estimate??settings.fraction,priority:settings.priority,rotations};
    }
  }
  const results=input?compare(input,delay?5:0):null;
  const phase:ConsultationPhase=edit?'editing':results?'complete':'pending';
  useEffect(()=>{onProgress?.(phase);},[phase,onProgress]);
  const selected=results&&settings?preferred(results,settings.priority):undefined;
  const baseCost=settings?.costs[settings.second]??null;
  return <div className="grid min-w-0 gap-4">
    <div><h2 className="text-2xl font-bold">¿Qué puedes sembrar después?</h2><p className="text-sm text-muted">Compara tu cultivo habitual con otras dos opciones, usando el clima de años anteriores.</p></div>
    {known?.currentCrop&&!knownCurrentSupported&&<p role="status" className="rounded-2xl bg-amber-50 p-4 text-sm">Ya puedes revisar el agua de tu cultivo de {known.currentCrop.toLocaleLowerCase('es')}. Para comparar qué sembrar después, por ahora tenemos calendarios de maíz forrajero, avena forrajera, cebada forrajera y haba. Puedes explorar un ejemplo con esos cultivos; no será una continuación de tu cultivo actual.</p>}
    {edit?<form key={known?.currentCrop??known?.firstCrop??'new'} onSubmit={submit} className="consulta-no-imprimir grid gap-4 rounded-2xl bg-leaf/35 p-4">
      <p className="text-sm font-semibold text-action">Elige los dos cultivos y la fecha para comparar tu plan con otras opciones.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Choice name="first" label="Primer cultivo" value={settings?.first||(knownCurrentSupported?known?.currentCrop:'')||(names.includes(known?.firstCrop??'')?known?.firstCrop:'')||''}/>
        <label className="grid gap-1 text-sm font-semibold">¿Cuándo sembrarías el primer cultivo?<Input name="start" type="date" defaultValue={settings?.start||(knownCurrentSupported?known?.currentPlanting:'')||''} required/></label>
        <Choice name="second" label="¿Qué siembras habitualmente después?" value={settings?.second||known?.secondCrop||''}/>
        <label className="grid gap-1 text-sm font-semibold">Tu prioridad<NativeSelect name="priority" defaultValue={settings?.priority||known?.priority||'Usar menos agua'}>{productionPriorities.map(p=><option key={p}>{p}</option>)}</NativeSelect></label>
      </div>
      <details><summary className="cursor-pointer font-semibold">Ajustar calendario, riego y costo de semillas</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">Segunda siembra (opcional)<Input name="next" type="date" defaultValue={settings?.next}/><small>Por defecto, 14 días después de la cosecha estimada.</small></label>
        <NumberField name="depth" label="Agua en cada riego (litros por m²; 0 = sin riego)" value={settings?.depth??0} max={500}/>
        <NumberField name="interval" label="¿Cada cuántos días regarías?" value={settings?.interval??14} min={1} max={120}/>
        <NumberField name="fraction" label="Agua disponible inicial del supuesto (%)" value={(settings?.fraction??.5)*100} max={100}/>
        <NumberField name="rainEfficiency" label="Lluvia aprovechable (%)" value={(settings?.rainEfficiency??.8)*100} max={100}/>
        <NumberField name="irrigationEfficiency" label="Eficiencia del riego (%)" value={(settings?.irrigationEfficiency??.6)*100} min={1} max={100}/>
        {names.map((name,i)=><label key={name} className="grid gap-1 text-sm">Semilla de {name} (Bs/ha, opcional)<Input name={'cost'+i} type="number" min="0" step="any" defaultValue={settings?.costs[name]??''}/></label>)}
      </div><p className="mt-3 text-sm">Los costos son los que tú declares. Sin cotizaciones no estimamos ganancias ni mostramos precios inventados.</p></details>
      <Button type="submit" className="justify-self-start">Comparar tres rotaciones</Button>
    </form>:<Button variant="secondary" className="consulta-no-imprimir justify-self-start" onClick={()=>setEdit(true)}>Cambiar calendario o prioridad</Button>}
    {error&&<p role="alert">{error}</p>}{busy&&<p role="status">Descargando radiación, temperatura y lluvia NASA de esta ubicación…</p>}
    {settings&&evidence&&!evidence.soil&&<p role="status">Nos faltan datos del suelo para comparar cuánta agua necesitaría cada opción.</p>}
    {calendarError&&<p role="alert">{calendarError}</p>}
    {results&&settings&&input&&history&&<>
      <section className="rounded-2xl bg-leaf/50 p-4"><h3 className="text-xl font-bold">{selected?`Para revisar primero: ${selected.rotation.seasons[1].crop.name}`:'Ninguna estrategia puede recomendarse con este calendario'}</h3>
        <p className="mt-2 text-sm">{selected?`Según tu prioridad «${settings.priority}» y los supuestos del modelo. Confirma suelo, variedad y disponibilidad real de agua.`:'Revisa las ventanas de siembra, la duración y el destino de cosecha de las opciones.'}</p>
        <p className="mt-2 text-sm">Calendario propuesto {settings.start} / {settings.next}, reproducido en {input.rotations[0].seasons[0].start} / {input.rotations[0].seasons[1].start}. No es una predicción de rendimiento.</p>
        <p className="mt-2 text-sm">«Estrés» significa que el agua disponible baja del umbral del cultivo. «Agua adicional» estima cuánto faltaría para evitarlo; «cobertura» cuenta los días de suelo protegido por el cultivo según su etapa.</p>
      </section>
      <div className="grid items-stretch gap-3 xl:grid-cols-3">{results.map(r=>{const crop=r.rotation.seasons[1].crop;const details=cropProfiles[crop.name];const cost=settings.costs[crop.name];return <article key={r.rotation.id} className="flex min-w-0 flex-col gap-3 rounded-2xl border border-line bg-white/90 p-4">
        <span className="text-sm font-bold text-action">{r.rotation.id}</span><h3 className="text-lg font-bold">{settings.first} → {crop.name}</h3>
        <p className="text-sm font-semibold">{r.excluded?'Fuera de la ventana o duración':r.stressDays===null?'Datos insuficientes':r.compatible?'Comparable en el escenario':'No coincide con tu destino de cosecha'}</p>
        <dl className="grid grid-cols-2 gap-3 text-sm"><div><dt>Días con estrés</dt><dd className="text-2xl font-bold">{fmt(r.stressDays)}</dd></div><div><dt>Agua adicional neta</dt><dd className="text-2xl font-bold">{fmt(r.supplementalMm)}{r.supplementalMm!==null?' mm':''}</dd></div><div><dt>Días con cobertura</dt><dd>{fmt(r.coverageDays)}</dd></div><div><dt>Días bajo umbral de frío</dt><dd>{crop.frostC===undefined?'Sin umbral validado':fmt(r.frostDays)}</dd></div></dl>
        {parcel.areaHa&&r.supplementalMm!==null&&<p className="text-sm">Equivale a {fmt(r.supplementalMm*10*parcel.areaHa)} m³ netos en {fmt(parcel.areaHa)} ha; el volumen aplicado depende de la eficiencia del riego.</p>}
        <p className="text-sm">{crop.name==='Haba'?'Leguminosa: puede aportar nitrógeno con nodulación y manejo adecuados; alternar familias puede ayudar a interrumpir plagas.':'Cereal: la cobertura y los residuos pueden proteger el suelo. Repetir cereales no garantiza interrumpir sus plagas.'}</p>
        <p className="text-sm">Semilla: {cost==null?'sin cotización':`${fmt(cost)} Bs/ha`}{cost!=null&&baseCost!=null?` · ${fmt(cost-baseCost)} Bs/ha respecto a la habitual`:''}.</p>
        <details className="mt-auto text-sm"><summary className="cursor-pointer font-semibold">Por qué aparece este resultado</summary><ul className="mt-2 list-disc space-y-2 pl-4">{r.reasons.map(reason=><li key={reason}>{reason}</li>)}<li>{details.drought}.</li><li>{details.cold}.</li><li>{details.yieldRef??'No hay rendimiento local validado para estimar tu cosecha.'}</li>{details.seedRef&&<li>{details.seedRef}</li>}<li>Duración de referencia: {details.duration} días. Ajustar con el técnico y la variedad.</li></ul></details>
      </article>;})}</div>
      {!!input.turns.length&&<Button variant="secondary" className="consulta-no-imprimir justify-self-start" aria-pressed={delay} onClick={()=>setDelay(v=>!v)}>{delay?'Ver riego sin retraso':'¿Qué pasa si un riego se retrasa 5 días?'}</Button>}
      <details className="rounded-2xl bg-leaf/35 p-4 text-sm"><summary className="cursor-pointer font-semibold">Datos, fechas y supuestos de esta comparación</summary>
        <p className="mt-2">Fuente climática: NASA POWER e IMERG Final vía POWER · {history.from} a {history.to} · días UTC. Grilla regional: no es una estación dentro del terreno. ET₀ FAO-56 usa radiación, viento a 2 m, humedad, temperatura y elevación de grilla {fmt(history.elevation)} m.</p>
        <p className="mt-2">Lluvia IMERG disponible en {history.days.filter(d=>d.rainSource==='IMERG Final vía POWER').length} de {history.days.length} días descargados. POWER es respaldo explícito para los restantes.</p>
        <p className="mt-2">Inicialización: {moistureLabel} · {fmt(input.initialFraction*100)} % del agua disponible. Lluvia útil {fmt(input.rainEfficiency*100)} %, riego {fmt(input.irrigationEfficiency*100)} %. {settings.depth===0?'Sin riego incluido.':`${settings.depth} mm cada ${settings.interval} días.`} {delay?'Un riego se retrasa cinco días.':''}</p>
        <p className="mt-2">Se ordenan opciones compatibles con tu destino y calendario por estrés, agua adicional y cobertura. Ahorrar agua prioriza la demanda adicional; diversificar prioriza alternar familias (cereal y leguminosa), aunque pueda necesitar más agua. Los costos declarados se comparan aparte. Las prácticas de suelo y nitrógeno son orientativas, no simulaciones de nutrientes.</p>
        <p className="mt-2"><a className="underline" href={history.url}>Serie NASA usada</a> · <a className="underline" href={scenarioSources.faoBalance}>FAO-56</a> · <a className="underline" href={scenarioSources.barley}>SEFO-SAM</a></p>
      </details>
    </>}
  </div>;
}
function Choice({name,label,value}:{name:string;label:string;value:string}){return <label className="grid gap-1 text-sm font-semibold">{label}<NativeSelect name={name} defaultValue={value} required><option value="" disabled>Selecciona un cultivo</option>{names.map(n=><option key={n}>{n}</option>)}</NativeSelect></label>;}
function NumberField({name,label,value,min=0,max}:{name:string;label:string;value:number;min?:number;max:number}){return <label className="grid gap-1 text-sm">{label}<Input name={name} type="number" min={min} max={max} step="any" defaultValue={value} required/></label>;}
