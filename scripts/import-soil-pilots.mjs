import { writeFile } from 'node:fs/promises';
import { parseSoil } from '../src/domain/water-balance/source-parsers.ts';

const points=[{name:'Tirani',latitude:-17.34161,longitude:-66.15458}];
const samples=[];
for(const point of points){
  const url=new URL('https://rest.isric.org/soilgrids/v2.0/properties/query');
  url.searchParams.set('lat',String(point.latitude));url.searchParams.set('lon',String(point.longitude));
  for(const property of ['wv0033','wv1500','sand','clay'])url.searchParams.append('property',property);
  for(const depth of ['0-5cm','5-15cm','15-30cm','30-60cm','60-100cm'])url.searchParams.append('depth',depth);
  url.searchParams.set('value','mean');
  const response=await fetch(url,{signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error(`SoilGrids ${response.status}; existing file unchanged`);
  const payload=await response.json(),profile=parseSoil(payload);
  if(!profile)throw new Error('Incomplete soil profile; existing file unchanged');
  samples.push({point,profile,url:url.toString(),queriedAt:new Date().toISOString(),source:'SoilGrids · ISRIC · extracción verificada de 250 m'});
}
await writeFile('src/data/soil-pilots.json',JSON.stringify({samples},null,2)+'\n');
console.log(`Saved ${samples.length} verified soil profiles with provenance.`);
