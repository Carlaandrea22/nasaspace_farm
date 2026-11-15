"use client";
import { useState } from 'react';
import { CloudRain, Droplets, Thermometer, Sprout, TriangleAlert, CircleCheck, CalendarDays } from 'lucide-react';
import { formatDate, type Forecast } from '../operations/model';
import type { forecastBalance } from '../../domain/water-balance/model';
import { noticeClock, noticeNumber as n } from './irrigation-notice';

export function WaterOutlook({result,forecast,period,action}:{
  result:NonNullable<ReturnType<typeof forecastBalance>>;forecast:Forecast;period:7|14;action:string;
}) {
  const [selected,setSelected]=useState('');
  const selectedRow=result.rows.find(row=>row.date===selected)??result.rows[0];
  const weather=forecast.days.find(day=>day.date===selectedRow.date);
  const maxRain=Math.max(1,...forecast.days.filter(d=>result.rows.some(r=>r.date===d.date)).map(d=>d.rain??0));
  return <div className="grid min-w-0 gap-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-xs font-bold uppercase tracking-widest text-action">Tu cultivo, día a día</p><h4 className="mt-1 text-xl font-bold">¿Cómo estará el agua?</h4></div>
    </div>
    <div className={result.stressDays?'water-action water-action-review':'water-action water-action-ok'}>
      {result.stressDays?<TriangleAlert aria-hidden="true" size={26}/>:<CircleCheck aria-hidden="true" size={26}/>}
      <div><h4 className="font-bold">¿Qué hago ahora?</h4><p className="mt-1 text-sm leading-relaxed">{action}</p></div>
    </div>
    <div className="grid gap-3 sm:grid-cols-3">
      {[{Icon:CloudRain,label:'Lluvia prevista',value:`${n(result.rainMm)} mm`,note:'Pronóstico de Open-Meteo',color:'water-metric-rain'},
        {Icon:Sprout,label:'Agua que necesitaría el cultivo',value:`${n(result.demandMm)} mm`,note:'Estimación según tu cultivo',color:'water-metric-crop'},
        {Icon:CalendarDays,label:'Días con posible falta de agua',value:String(result.stressDays),note:`De ${result.rows.length} días evaluados`,color:'water-metric-risk'}].map(({Icon,label,value,note,color})=><div key={label} className={`water-metric ${color}`}><Icon size={25} aria-hidden="true"/><p className="mt-2 text-sm">{label}</p><strong className="block text-3xl">{value}</strong><small className="mt-1 block text-muted">{note}</small></div>)}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
      <p>Del {formatDate(result.rows[0].date)} al {formatDate(result.rows.at(-1)!.date)}</p>
      <p>Open-Meteo · consultado {noticeClock(forecast.queriedAt)}</p>
    </div>
    {period===14&&<p className="rounded-xl bg-white/75 px-3 py-2 text-sm">Los días 8 a 14 son más inciertos. Revisa de nuevo el pronóstico antes de regar.</p>}
    <section className="rounded-2xl bg-white/90 p-3 sm:p-4" aria-label="Lluvia y cultivo por día">
      <h4 className="font-bold">Elige un día para ver el detalle</h4>
      <p className="mt-1 text-xs text-muted">Barras azules: lluvia prevista. «Revisar»: posible falta de agua según el cálculo.</p>
      <div className="water-day-strip" role="group" aria-label="Días del análisis">
        {result.rows.map(row=>{
          const day=forecast.days.find(d=>d.date===row.date);
          return <button type="button" key={row.date} aria-pressed={row.date===selectedRow.date} aria-label={`${formatDate(row.date)}: lluvia ${n(day?.rain)} mm, ${row.stressed?'revisar humedad':'sin señal de falta'}`} className="water-day" onClick={()=>setSelected(row.date)}>
            <time dateTime={row.date}>{new Intl.DateTimeFormat('es-BO',{weekday:'short',day:'numeric',timeZone:'UTC'}).format(new Date(row.date+'T12:00:00Z'))}</time>
            <span className="water-rain-track" aria-hidden="true"><span style={{height:`${(day?.rain??0)/maxRain*100}%`}}/></span>
            <strong>{n(day?.rain)} mm</strong><small className={row.stressed?'text-amber-800':'text-action'}>{row.stressed?'Revisar':'Sin señal'}</small>
          </button>;
        })}
      </div>
      <div className="water-day-detail" aria-live="polite">
        <div className="flex flex-wrap items-center justify-between gap-2"><h5 className="font-bold">{formatDate(selectedRow.date)}</h5><span className="rounded-full bg-white px-3 py-1 text-xs font-semibold">{selectedRow.stressed?'Revisar humedad':'Sin señal de falta de agua'}</span></div>
        <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {[{Icon:CloudRain,label:'Lluvia prevista',value:`${n(weather?.rain)} mm`},{Icon:Sprout,label:'Necesidad del cultivo',value:`${n(selectedRow.potentialEtMm)} mm`},{Icon:Droplets,label:'Riego que llega a raíces',value:`${n(selectedRow.irrigationMm)} mm`},{Icon:Thermometer,label:'Temperatura mín. / máx.',value:`${n(weather?.minimum)} / ${n(weather?.maximum)} °C`},{Icon:Droplets,label:'Humedad del aire',value:weather?.humidity==null?'Sin dato':`${n(weather.humidity)} %`},{Icon:Droplets,label:'Agua restante en suelo',value:`${n(selectedRow.storageMm)} mm`}].map(({Icon,label,value})=><div key={label}><dt className="flex items-center gap-1 text-xs text-muted"><Icon size={15} className="shrink-0" aria-hidden="true"/>{label}</dt><dd className="mt-1 text-sm font-bold sm:text-base">{value}</dd></div>)}
        </dl>
      </div>
    </section>
  </div>;
}
