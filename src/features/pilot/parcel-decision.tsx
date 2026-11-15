"use client";
import { useCallback, useEffect, useState } from 'react';
import { Info } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { accountDraft } from '../../lib/browser/account-drafts';
import { readPilotDraft } from '../../lib/browser/pilot-drafts';
import { cropForParcel, locationKey, type CropWater, type Parcel, type PilotDraft } from './draft';
import type { ParcelMoisture, ParcelSoil } from '../../server/parcel-sources';
import type { smapSummary } from '../../server/smap';
import { WaterDecision } from './water-decision';
import { RotationDecision } from './rotation-decision';
import type { SoilStatus } from '../../domain/water-balance/source-parsers';
import { rootCapacity } from '../../domain/water-balance/model';
import type { ReferenceCase } from '../territory/reference';
import type { ConsultationMode, ConsultationPhase } from './consultation-progress';

export type ParcelEvidence = {soil:ParcelSoil;soilStatus?:SoilStatus;moisture:ParcelMoisture;smap:ReturnType<typeof smapSummary>;queriedAt:string};
export default function ParcelDecision({ mode, parcel, demo, account, savedParcelId, onProgress }: {
  mode: 'water' | 'rotations'; parcel: Parcel; demo?: ReferenceCase; account: boolean; savedParcelId?: string;
  onProgress: (mode: ConsultationMode, phase: ConsultationPhase) => void;
}) {
  const waterProgress = useCallback((phase: ConsultationPhase) => onProgress('water', phase), [onProgress]);
  const rotationProgress = useCallback((phase: ConsultationPhase) => onProgress('rotations', phase), [onProgress]);
  const [known,setKnown]=useState<CropWater>();
  const [evidence,setEvidence]=useState<ParcelEvidence>();
  const [draftReady, setDraftReady] = useState(Boolean(demo || (account && !savedParcelId)));
  const [error,setError]=useState('');
  const [attempt,setAttempt]=useState(0);
  const [visited,setVisited]=useState({water:mode==='water',rotations:mode==='rotations'});
  if(!visited[mode])setVisited({...visited,[mode]:true});
  useEffect(() => {
    if (demo || (account && !savedParcelId)) return;
    let active = true;
    const draft = account
      ? accountDraft<PilotDraft | undefined>(new URLSearchParams({ parcel: savedParcelId! }).toString())
      : readPilotDraft();
    draft.then((saved) => {
      if (active && saved) setKnown(cropForParcel({ ...saved, parcel }));
    }).catch(() => {}).finally(() => { if (active) setDraftReady(true); });
    return () => { active = false; };
  }, [account, demo, parcel, savedParcelId]);
  useEffect(()=>{
    const controller=new AbortController();
    const params=new URLSearchParams({lat:String(parcel.latitude),lon:String(parcel.longitude)});
    fetch('/api/parcel-sources?'+params,{signal:controller.signal}).then(async r=>{
      if(!r.ok)throw new Error('Fuente');
      const result:ParcelEvidence=await r.json();if(!controller.signal.aborted){setEvidence(result);setError('');}
    }).catch(()=>{if(!controller.signal.aborted)setError('No pudimos obtener los datos del suelo de esta ubicación.');});
    return()=>controller.abort();
  },[parcel.latitude,parcel.longitude,attempt]);
  return <div className="grid min-w-0 gap-4">
    {!evidence&&!error&&<p role="status" className="text-sm text-muted">Buscando información de tu terreno…</p>}
    {(error||(evidence&&!evidence.soil))&&<aside className="flex items-start gap-3 rounded-2xl bg-amber-50 p-4 sm:p-5" role="status">
      <Info className="mt-0.5 shrink-0 text-amber-700" size={22} aria-hidden="true"/>
      <div className="min-w-0">
        <h3 className="font-bold">{evidence?.soilStatus==='no-coverage'?'No tenemos información del suelo para este punto':evidence?.soilStatus==='incomplete'?'La información del suelo está incompleta':'No pudimos cargar la información del suelo'}</h3>
        <p className="mt-1 text-sm leading-relaxed">Esto no significa que tu terreno no sirva para cultivar. Puedes consultar el clima y la lluvia; para estimar cuánto regar nos falta saber cuánta agua retiene el suelo.</p>
        <div className="consulta-no-imprimir mt-3 flex flex-wrap items-center gap-3">
          <a className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4" href={mode==='water'?'#pronostico-agua':'#clima-parcela'}>{mode==='water'?'Ver las próximas lluvias':'Ver el clima de este lugar'}</a>
          {(error||!evidence?.soilStatus||evidence.soilStatus==='unavailable')&&<Button variant="secondary" onClick={()=>{setError('');setEvidence(undefined);setAttempt(n=>n+1);}}>Volver a intentar</Button>}
        </div>
      </div>
    </aside>}
    {!draftReady && <p role="status" className="text-sm text-muted">Abriendo el cultivo guardado…</p>}
    <div hidden={mode!=='water'} id="parcel-water">{ draftReady && visited.water && <WaterDecision parcel={parcel} evidence={evidence} known={known} onCropKnown={setKnown} onProgress={waterProgress} />}</div>
    <div hidden={mode!=='rotations'} id="parcel-rotations">{draftReady && visited.rotations && <RotationDecision key={locationKey(parcel)} parcel={parcel} evidence={evidence} known={known} onProgress={rotationProgress} />}</div>
    {evidence&&<details className="rounded-2xl bg-leaf/40 p-4 text-sm">
      <summary className="cursor-pointer font-semibold">¿De dónde salen los datos de mi terreno?</summary>
      {evidence.soil?<>
        <p className="mt-2">{evidence.soil.source}. {evidence.soil.distanceM>0?`Referencia a ${evidence.soil.distanceM} m del punto seleccionado.`:'Muestreo en la ubicación seleccionada.'} Es una predicción regional, no un análisis de laboratorio.</p>
        <p>Horizonte superficial: arena {evidence.soil.profile[0].sand?.toFixed(1)} % · arcilla {evidence.soil.profile[0].clay?.toFixed(1)} %. Retención consultada hasta 1 m.</p>
        <p className="mt-2">Reserva útil estimada hasta 1 m de profundidad: {rootCapacity(evidence.soil.profile,1)?.toLocaleString('es-BO',{maximumFractionDigits:1})} litros por m². Es la capacidad de almacenar agua aprovechable por las raíces; no la cantidad de agua que tiene el suelo hoy.</p>
        <p className="mt-2">Datos de suelo obtenidos el {evidence.soil.queriedAt.slice(0,10)}.</p>
        <a className="underline" href={evidence.soil.url} target="_blank" rel="noreferrer">Consultar fuente del suelo</a>
      </>:<p className="mt-2">Sin perfil de suelo utilizable. El pronóstico sigue disponible; no calculamos un balance radicular sin capacidad de retención.</p>}
      <p className="mt-2">La consulta usa el punto o centro de la parcela. Dibujar el contorno permite calcular superficie, pero no aumenta la resolución del satélite ni representa un promedio de todos los píxeles del terreno.</p>
      <p className="mt-2">{evidence.smap?.latest?`SMAP L4 vía NASA POWER: último día válido ${evidence.smap.latest.date} (${evidence.smap.ageDays} días de antigüedad). Superficie ${((evidence.smap.latest.surface??0)*100).toFixed(1)} % y raíces ${((evidence.smap.latest.root??0)*100).toFixed(1)} % de humedad volumétrica. Grilla regional de unos 9 km, datos UTC; producto del proveedor en revisión.`:'No hay humedad SMAP válida para este punto.'} {!evidence.smap?.recent&&'Este corte se usa en comparaciones históricas, no como humedad de hoy. Para el balance actual se ofrece el modelo Open-Meteo.'}</p>
    </details>}
  </div>;
}
