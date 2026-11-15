import reference from '../data/la-maica-sources.json';
import pilotSoils from '../data/soil-pilots.json';
import { distanceMeters, modeledRootMoisture, parseBalanceHistory, parseSoil, soilResponseStatus, type SoilStatus } from '../domain/water-balance/source-parsers';
import { localDate } from '../features/operations/model';
import type { Coordinates } from '../features/pilot/draft';
import { readRegionalSmap } from './smap';

async function json(url:URL, seconds:number) {
  const response=await fetch(url,{next:{revalidate:seconds},signal:AbortSignal.timeout(18000)});
  if(!response.ok) throw new Error('Fuente no disponible');
  return response.json();
}

export async function readParcelSoil(point:Coordinates) {
  const queriedAt=new Date().toISOString();
  // Use the verified pilot extraction within its existing 100 m reference radius.
  for (const sample of pilotSoils.samples) {
    const distance = distanceMeters(point, sample.point);
    if (distance <= 100) {
      return {soil:{...sample,distanceM:distance < 1 ? 0 : Math.round(distance)},soilStatus:'available' as const};
    }
  }
  async function sample(p:Coordinates) {
    const url=new URL('https://rest.isric.org/soilgrids/v2.0/properties/query');
    url.searchParams.set('lat',p.latitude.toFixed(5));url.searchParams.set('lon',p.longitude.toFixed(5));
    for(const property of ['wv0033','wv1500','sand','clay'])url.searchParams.append('property',property);
    for(const depth of ['0-5cm','5-15cm','15-30cm','30-60cm','60-100cm'])url.searchParams.append('depth',depth);
    url.searchParams.set('value','mean');
    const payload=await json(url,86400*30),profile=parseSoil(payload);
    return {soil:profile?{profile,point:p,distanceM:Math.round(distanceMeters(point,p)),source:'SoilGrids · ISRIC · 250 m',url:url.toString(),queriedAt}:null,soilStatus:soilResponseStatus(payload)};
  }
  let soilStatus:SoilStatus='unavailable';
  // Never use La Maica's profile as the default for other points.
  try { const exact=await sample(point);if(exact.soil)return exact;soilStatus=exact.soilStatus; }catch { /* Try the regional extraction within its reference radius. */ }
  if(distanceMeters(point,reference.meta.soilPoint)<=350) return {soil:{
    profile:reference.soil,point:reference.meta.soilPoint,distanceM:Math.round(distanceMeters(point,reference.meta.soilPoint)),
    source:'SoilGrids · extracción regional revisada',url:reference.meta.soilSource,queriedAt:reference.meta.fetchedAt,
  },soilStatus:'available' as const};
  // A single nearby candidate, explicitly labelled, avoids hammering ISRIC's beta service.
  try {const nearby=await sample({latitude:point.latitude-.0025,longitude:point.longitude});if(nearby.soil)return nearby;}catch{ /* Preserve the status of the selected point. */ }
  return {soil:null,soilStatus};
}

export async function readModeledMoisture(point:Coordinates) {
  const url=new URL('https://api.open-meteo.com/v1/forecast');
  url.search=new URLSearchParams({latitude:String(point.latitude),longitude:String(point.longitude),timezone:'America/La_Paz',forecast_days:'1',
    hourly:'soil_moisture_0_to_1cm,soil_moisture_1_to_3cm,soil_moisture_3_to_9cm,soil_moisture_9_to_27cm,soil_moisture_27_to_81cm'}).toString();
  try{return modeledRootMoisture(await json(url,1800),localDate(new Date().toISOString()));}catch{return null;}
}

export async function readBalanceHistory(point:Coordinates) {
  const lastYear=new Date().getUTCFullYear()-1;
  const from=`${lastYear-2}-01-01`,to=`${lastYear}-12-31`;
  const url=new URL('https://power.larc.nasa.gov/api/temporal/daily/point');
  url.search=new URLSearchParams({latitude:point.latitude.toFixed(3),longitude:point.longitude.toFixed(3),community:'AG',
    parameters:'T2M,T2M_MAX,T2M_MIN,RH2M,WS2M,ALLSKY_SFC_SW_DWN,PRECTOTCORR,IMERG_PRECTOT',
    start:from.replaceAll('-',''),end:to.replaceAll('-',''),format:'JSON','time-standard':'UTC'}).toString();
  const result=parseBalanceHistory(await json(url,86400*7),from,to);
  return {...result,from,to,url:url.toString(),queriedAt:new Date().toISOString(),point,smap:readRegionalSmap(point)};
}

export type ParcelSoil = Awaited<ReturnType<typeof readParcelSoil>>['soil'];
export type ParcelHistory = Awaited<ReturnType<typeof readBalanceHistory>>;
export type ParcelMoisture = Awaited<ReturnType<typeof readModeledMoisture>>;
