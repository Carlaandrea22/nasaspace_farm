"use client";
import { useEffect, useRef, useState } from 'react';
import { Download, FileText, X, MapPin, CloudRain, Sprout, CalendarDays } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { formatDate } from '../operations/model';
import { noticeClock, noticeNumber as n, noticeRequest, type IrrigationNotice } from './irrigation-notice';

export function IrrigationNoticeDialog({data,onClose}:{data:IrrigationNotice;onClose:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{
    const node=dialog.current;
    const previous=document.body.style.overflow;
    document.body.style.overflow='hidden';node?.showModal();
    return()=>{node?.close();document.body.style.overflow=previous;};
  },[]);
  async function download(){
    setBusy(true);setError('');
    try{
      const {createIrrigationPdf}=await import('./irrigation-notice');
      const blob=await createIrrigationPdf(data);
      const url=URL.createObjectURL(blob),link=document.createElement('a');
      link.href=url;link.download=`aviso-agua-${data.days[0].date}-${data.days.length}-dias.pdf`;
      document.body.appendChild(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),60000);
    }catch{setError('No pudimos crear el PDF. Vuelve a intentar; tu aviso sigue aquí.');}
    finally{setBusy(false);}
  }
  return <dialog ref={dialog} aria-labelledby="irrigation-notice-title" onClose={onClose} className="irrigation-dialog">
    <div className="irrigation-dialog-toolbar">
      <span className="flex items-center gap-2 font-semibold"><FileText size={19} aria-hidden="true"/> Vista previa del aviso</span>
      <Button variant="secondary" aria-label="Cerrar aviso" onClick={()=>dialog.current?.close()}><X size={20} aria-hidden="true"/></Button>
    </div>
    <article className="irrigation-document">
      <header className="irrigation-document-header">
        <p className="text-sm font-bold tracking-widest">YAKU · COCHABAMBA</p>
        <h2 id="irrigation-notice-title" className="mt-3 text-2xl font-bold sm:text-3xl">Aviso para coordinar el riego</h2>
        <p className="mt-2 text-sm">Para compartir con quien organiza o entrega el agua.</p>
      </header>
      <div className="grid gap-5 p-4 sm:p-7">
        <p className="text-xs text-muted">Emitido el {noticeClock(data.issuedAt)}, hora de Bolivia.</p>
        <section className="rounded-2xl bg-leaf/40 p-4">
          <h3 className="flex items-center gap-2 font-bold"><MapPin size={19} aria-hidden="true"/> Terreno y cultivo</h3>
          <p className="mt-2 font-semibold">{data.crop}{data.areaHa?` · ${n(data.areaHa)} ha aproximadas`:''}</p>
          <p className="text-sm">{data.latitude.toFixed(5)}, {data.longitude.toFixed(5)}</p>
          <p className="mt-2 text-sm">Del {formatDate(data.days[0].date)} al {formatDate(data.days.at(-1)!.date)} · {data.days.length} días evaluados</p>
          <p className="mt-1 text-sm">Siembra / último corte: {formatDate(data.planting)}. Cosecha / próximo corte: {formatDate(data.harvest)}.</p>
        </section>
        <section>
          <h3 className="text-lg font-bold">¿Por qué coordinar el riego?</h3>
          <p className="mt-2 leading-relaxed">{data.action}</p>
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {[{Icon:CloudRain,label:'Lluvia prevista',value:`${n(data.rainMm)} mm`},{Icon:Sprout,label:'Necesidad del cultivo',value:`${n(data.demandMm)} mm`},{Icon:CalendarDays,label:'Días con posible falta',value:String(data.stressDays)}].map(({Icon,label,value})=><div key={label} className="rounded-2xl bg-leaf/45 p-4"><Icon size={22} aria-hidden="true"/><p className="mt-2 text-sm">{label}</p><strong className="text-2xl">{value}</strong></div>)}
          </div>
          <p className="mt-3 text-sm">{data.irrigationDate?`Riego incluido: ${formatDate(data.irrigationDate)}, ${n(data.irrigationMm)} litros por m²${data.delayed?' (simulación con 5 días de retraso)':''}.`:'No se declararon riegos futuros; se evalúan la lluvia y la reserva inicial del suelo.'}</p>
          {data.stressDays>0&&data.rainMm>=data.demandMm&&<p className="mt-2 text-sm">La lluvia total puede ser suficiente y aun así llegar después de los días en que el cultivo necesita agua.</p>}
        </section>
        <section className="rounded-2xl border border-line p-4">
          <h3 className="text-lg font-bold">Solicitud para coordinar</h3>
          <p className="mt-2 leading-relaxed">{noticeRequest(data)}</p>
          <p className="mt-3 text-sm font-semibold">Por confirmar: fecha, horario y cantidad disponible.</p>
          <p className="mt-3 text-sm text-muted">Productor/a y contacto: completar al compartir el aviso.</p>
        </section>
        <details className="text-sm"><summary className="cursor-pointer font-bold">Datos diarios incluidos en el PDF</summary>
          <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[500px] text-left"><thead><tr><th>Día</th><th>Lluvia</th><th>Necesidad del cultivo</th><th>Estado</th></tr></thead><tbody>{data.days.map(day=><tr key={day.date} className="border-t border-line"><td className="py-2">{formatDate(day.date)}</td><td>{n(day.rain)} mm</td><td>{n(day.balance.potentialEtMm)} mm</td><td>{day.balance.stressed?'Revisar humedad':'Sin señal de falta'}</td></tr>)}</tbody></table></div>
        </details>
        <section className="text-sm leading-relaxed text-muted">
          <h3 className="font-semibold text-ink">Fuentes y alcance</h3>
          <p>Pronóstico Open-Meteo consultado el {noticeClock(data.queriedAt)}. Predicción regional; no es lluvia medida en el terreno. La segunda semana es más incierta.</p>
          <p className="mt-2">Suelo: {data.soilSource}. Humedad: {data.moistureSource}. Necesidad del cultivo calculada con referencias FAO-56.</p>
          <p className="mt-2">Agua inicial disponible: {n(data.initialFraction*100)} %. Lluvia aprovechable: {n(data.rainEfficiency*100)} %. Riego que llega a las raíces: {n(data.irrigationEfficiency*100)} %. Son supuestos y estimaciones.</p>
          <p className="mt-2">1 mm equivale a 1 litro por m². Este documento orienta la coordinación; no confirma una entrega de agua ni un riesgo de inundación.</p>
        </section>
      </div>
    </article>
    <footer className="irrigation-dialog-footer">
      <p className="text-sm text-muted">El PDF está listo para adjuntar a un correo. No se envía automáticamente.</p>
      {error&&<p role="alert" className="text-sm text-red-800">{error}</p>}
      <Button disabled={busy} onClick={()=>void download()} className="w-full sm:w-auto"><Download size={18} aria-hidden="true"/>{busy?'Preparando PDF…':'Descargar PDF'}</Button>
    </footer>
  </dialog>;
}
