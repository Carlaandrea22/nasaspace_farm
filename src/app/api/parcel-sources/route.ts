import { coordinates } from '../../../features/pilot/draft';
import { readBalanceHistory, readModeledMoisture, readParcelSoil } from '../../../server/parcel-sources';
import { smapSummary } from '../../../server/smap';
import { localDate } from '../../../features/operations/model';

export async function GET(request:Request) {
  const params=new URL(request.url).searchParams;
  const point=coordinates(params.get('lat')??'',params.get('lon')??'');
  const headers={'Cache-Control':'private, no-store'};
  if(!point||point.latitude < -17.54||point.latitude > -17.25||point.longitude < -66.29||point.longitude > -66.06)
    return Response.json({error:'Selecciona un punto dentro de la cobertura municipal de Cochabamba.'},{status:400,headers});
  const kind=params.get('kind');
  if(kind==='history') {
    try{return Response.json(await readBalanceHistory(point),{headers});}
    catch{return Response.json({error:'NASA POWER no entregó una serie verificable. Reintenta la consulta.'},{status:502,headers});}
  }
  if(kind==='moisture') {
    return Response.json({moisture:await readModeledMoisture(point)},{headers});
  }
  const [soilResult,moisture]=await Promise.all([readParcelSoil(point),kind==='soil'?undefined:readModeledMoisture(point)]);
  return Response.json({point,...soilResult,moisture,smap:smapSummary(point,localDate(new Date().toISOString())),queriedAt:new Date().toISOString()}, {headers});
}
