import type { WeatherDay } from '../operations/model';
import type { BalanceRow } from '../../domain/water-balance/model';

export type IrrigationNotice = {
  issuedAt:string; queriedAt:string; latitude:number; longitude:number; areaHa:number|null;
  crop:string; planting:string; harvest:string; requestedDays:7|14;
  rainMm:number; demandMm:number; stressDays:number; firstStress:string|null;
  irrigationDate:string; irrigationMm:number; delayed:boolean;
  action:string; soilSource:string; moistureSource:string;
  rainEfficiency:number; irrigationEfficiency:number; initialFraction:number;
  days:Array<WeatherDay & {balance:BalanceRow}>;
};

export const noticeNumber=(value:number|null|undefined)=>value==null?'Sin dato':value.toLocaleString('es-BO',{maximumFractionDigits:1});
export const noticeClock=(instant:string)=>new Intl.DateTimeFormat('es-BO',{dateStyle:'medium',timeStyle:'short',timeZone:'America/La_Paz'}).format(new Date(instant));
export const noticeRequest=(notice:IrrigationNotice)=>notice.firstStress
  ? 'Solicito coordinar la disponibilidad y la fecha del próximo riego. La estimación indica posibles días con falta de agua; confirmaré la humedad del suelo antes de realizar cambios.'
  : 'Solicito confirmar la disponibilidad y la fecha del próximo riego. La estimación no muestra falta de agua en el periodo consultado; revisaré la humedad del suelo antes de cambiar el riego.';

/** Generated in the browser from the same snapshot displayed in the preview. */
export async function createIrrigationPdf(data:IrrigationNotice):Promise<Blob> {
  const {jsPDF}=await import('jspdf');
  const doc=new jsPDF({unit:'mm',format:'a4',compress:true});
  const green='#183e2b', ink='#20362c', muted='#526458';
  const clean=(text:string)=>text.replaceAll('→',' - ').replace(/[−–—]/g,'-').replaceAll('\u202f',' ').replaceAll('\u00a0',' ');
  const text=(value:string,x:number,y:number,size=10,bold=false,color=ink)=>{
    doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(size);doc.setTextColor(color);doc.text(clean(value),x,y);
  };
  const paragraph=(value:string,x:number,y:number,width=174,size=10)=>{
    doc.setFont('helvetica','normal');doc.setFontSize(size);doc.setTextColor(ink);
    const lines=doc.splitTextToSize(clean(value),width) as string[];doc.text(lines,x,y);return y+lines.length*size*.42;
  };
  const box=(x:number,y:number,w:number,h:number,color:string)=>{doc.setFillColor(color);doc.roundedRect(x,y,w,h,3,3,'F');};
  const dateRange=`${data.days[0].date} al ${data.days.at(-1)!.date}`;
  doc.setProperties({title:'Aviso para coordinar el riego - Yaku',subject:`${data.crop} | ${dateRange}`,author:'Yaku'});
  box(12,12,186,35,green);text('YAKU / COCHABAMBA',19,22,10,true,'#d8efb9');
  text('Aviso para coordinar el riego',19,32,21,true,'#ffffff');
  text('Documento de apoyo para conversar con la asociación de regantes',19,40,9,false,'#ffffff');
  text(`Emitido: ${noticeClock(data.issuedAt)} (Bolivia)`,16,56,9,false,muted);
  let y=66;
  text('1. Terreno y cultivo',16,y,13,true); y+=8;
  y=paragraph(`${data.crop} | Ubicación: ${data.latitude.toFixed(5)}, ${data.longitude.toFixed(5)}${data.areaHa?` | Superficie aproximada: ${noticeNumber(data.areaHa)} ha`:''}`,16,y);
  y=paragraph(`Siembra / último corte: ${data.planting}. Cosecha / próximo corte: ${data.harvest}.`,16,y+3);
  y=paragraph(`Periodo: ${dateRange} (${data.days.length} días disponibles; consulta de ${data.requestedDays} días).`,16,y+3);
  y+=8;text('2. Qué indica la estimación',16,y,13,true);y+=5;
  const metrics=[['Lluvia prevista',`${noticeNumber(data.rainMm)} mm`],['Necesidad del cultivo',`${noticeNumber(data.demandMm)} mm`],['Días con posible falta',String(data.stressDays)]];
  metrics.forEach(([label,value],i)=>{const x=16+i*60;box(x,y,56,24,i===2&&data.stressDays?'#fff0d3':'#edf4e6');text(label,x+4,y+7,9);text(value,x+4,y+18,18,true);});
  y+=32;
  y=paragraph(data.action,16,y);
  y=paragraph(data.irrigationDate?`Riego incluido: ${data.irrigationDate}, ${noticeNumber(data.irrigationMm)} litros por m²${data.delayed?' (escenario con 5 días de retraso)':''}.`:'No se declararon riegos futuros: se evalúan lluvia y agua inicial del suelo.',16,y+4);
  if(data.stressDays>0&&data.rainMm>=data.demandMm)y=paragraph('Aunque la lluvia total supere la necesidad del cultivo, su distribución y la reserva del suelo pueden dejar días con falta de agua.',16,y+4);
  y+=9;text('3. Solicitud para coordinar',16,y,13,true);y+=8;
  y=paragraph(noticeRequest(data),16,y);
  y=paragraph('Por confirmar con quien entrega el agua: fecha, horario y cantidad disponible. Este aviso no confirma una entrega de agua.',16,y+5);
  text('Productor/a: ____________________   Contacto: ____________________',16,y+12,10);
  // Sources and daily values on a separate page keep the notice legible on A4.
  doc.addPage();box(12,12,186,24,green);text('Detalle del periodo y fuentes',18,27,18,true,'#ffffff');
  text(dateRange,16,44,10,true);
  const columns=[16,51,79,108,138,164];
  const headings=['Día','Lluvia','Cultivo*','Riego útil','Mín./Máx.','Estado'];
  box(14,49,182,10,'#e7f0df');headings.forEach((v,i)=>text(v,columns[i],55.5,8.5,true));
  data.days.forEach((day,i)=>{
    const top=59+i*8;
    if(i%2===0)box(14,top,182,8,'#f5f7f2');
    const values=[day.date,`${noticeNumber(day.rain)} mm`,`${noticeNumber(day.balance.potentialEtMm)} mm`,`${noticeNumber(day.balance.irrigationMm)} mm`,`${noticeNumber(day.minimum)}/${noticeNumber(day.maximum)} °C`,day.balance.stressed?'Revisar':'Sin señal'];
    values.forEach((v,j)=>text(v,columns[j],top+5.5,8,false,j===5&&day.balance.stressed?'#8b550c':ink));
  });
  y=65+data.days.length*8;
  y=paragraph('* Cultivo: agua que necesitaría según el modelo. Lluvia: pronóstico total. Riego útil: agua que llegaría a las raíces. 1 mm equivale a 1 litro por m².',16,y,177,9);
  y+=6;text('Fuentes y supuestos',16,y,12,true);y+=7;
  y=paragraph(`Pronóstico: Open-Meteo, consultado ${noticeClock(data.queriedAt)} (Bolivia). Es una predicción regional, no lluvia medida en la parcela. La segunda semana es más incierta.`,16,y,177,9);
  y=paragraph(`Suelo: ${data.soilSource}. Humedad inicial: ${data.moistureSource}.`,16,y+3,177,9);
  y=paragraph(`Cálculo: balance de agua con coeficientes FAO-56. Agua disponible inicial: ${noticeNumber(data.initialFraction*100)} %. Lluvia aprovechable: ${noticeNumber(data.rainEfficiency*100)} %; riego que llega a raíces: ${noticeNumber(data.irrigationEfficiency*100)} %. Son estimaciones y supuestos, no mediciones de campo.`,16,y+3,177,9);
  text('Open-Meteo: open-meteo.com/en/docs | FAO-56: fao.org/4/x0490e/x0490e00.htm',16,y+7,8,false,muted);
  const pages=doc.getNumberOfPages();
  for(let page=1;page<=pages;page++){
    doc.setPage(page);doc.setDrawColor('#dce5d6');doc.line(16,281,194,281);
    text('Yaku | Orientación para coordinar. No enviado por correo ni aprobado por GAMC.',16,287,8,false,muted);
    text(`${page} / ${pages}`,183,287,8,false,muted);
  }
  return doc.output('blob');
}
