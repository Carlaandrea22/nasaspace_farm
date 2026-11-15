import regional from '../data/smap-cochabamba.json';
import { addDays, dayDistance, type SmapObservation } from '../domain/water-balance/model';
import type { Coordinates } from '../features/pilot/draft';

export function readRegionalSmap(point:Coordinates) {
  const cell=regional.cells.find(c=>point.latitude>=c.bounds.south&&point.latitude<c.bounds.north&&point.longitude>=c.bounds.west&&point.longitude<c.bounds.east);
  if(!cell)return null;
  const observations:SmapObservation[]=cell.root.map((root,index)=>({date:addDays(regional.from,index),root,surface:cell.surface[index],
    quality:root!==null&&cell.surface[index]!==null?'accepted':'missing'}));
  const latest=observations.findLast(o=>o.quality==='accepted')??null;
  return {observations,latest,point:{latitude:cell.latitude,longitude:cell.longitude},bounds:cell.bounds,
    from:regional.from,to:regional.to,source:regional.product,url:regional.documentation,
    fetchedAt:regional.fetchedAt,providerStatus:regional.status,precision:regional.precision};
}

export function smapSummary(point:Coordinates, today:string) {
  const data=readRegionalSmap(point);
  if(!data)return null;
  const {latest,point:cellPoint,bounds,from,to,source,url,fetchedAt,providerStatus,precision}=data;
  const ageDays=data.latest?dayDistance(data.latest.date,today):null;
  return {latest,point:cellPoint,bounds,from,to,source,url,fetchedAt,providerStatus,precision,ageDays,recent:ageDays!==null&&ageDays>=1&&ageDays<=7};
}
