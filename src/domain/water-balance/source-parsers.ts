import type { SoilLayer, Weather } from "./model";

export function distanceMeters(a: {latitude:number;longitude:number}, b: {latitude:number;longitude:number}) {
  const rad = Math.PI / 180;
  const h = Math.sin((a.latitude-b.latitude)*rad/2)**2 + Math.cos(a.latitude*rad)*Math.cos(b.latitude*rad)*Math.sin((a.longitude-b.longitude)*rad/2)**2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1,h)));
}

export function sameImergCell(lat: number, lon: number, centerLat: number, centerLon: number) {
  return lat >= centerLat-.05 && lat < centerLat+.05 && lon >= centerLon-.05 && lon < centerLon+.05;
}

type SoilPayload = { properties?: { layers?: {name:string; unit_measure?:{d_factor:number}; depths:{range:{top_depth:number;bottom_depth:number};values:{mean:number|null}}[]}[] } };
export function parseSoil(payload: unknown): SoilLayer[] | null {
  const layers = (payload as SoilPayload)?.properties?.layers;
  if (!Array.isArray(layers)) return null;
  const depths = [[0,5],[5,15],[15,30],[30,60],[60,100]];
  const profile: SoilLayer[] = [];
  for(const [top,bottom] of depths) {
    function value(name:string, scale:number) {
      const layer = layers?.find(l=>l.name===name);
      if(layer?.unit_measure?.d_factor!==10) return null;
      const raw=layer.depths?.find(d=>d.range.top_depth===top&&d.range.bottom_depth===bottom)?.values.mean;
      return typeof raw==='number'&&Number.isFinite(raw)&&raw>=0 ? raw/scale : null;
    }
    const fc=value('wv0033',1000), wp=value('wv1500',1000), sand=value('sand',10), clay=value('clay',10);
    if(fc===null||wp===null||fc<=wp||fc>1||sand===null||clay===null||sand+clay>100) return null;
    profile.push({top,bottom,fc,wp,sand,clay});
  }
  return profile;
}

export type SoilStatus = 'available' | 'no-coverage' | 'incomplete' | 'unavailable';
export function soilResponseStatus(payload: unknown): Exclude<SoilStatus, 'unavailable'> {
  if (parseSoil(payload)) return 'available';
  const layers = (payload as SoilPayload)?.properties?.layers;
  if (!Array.isArray(layers)) return 'incomplete';
  // A successful response with explicitly empty water-retention values is not an outage.
  const empty = ['wv0033', 'wv1500'].every(name => {
    const layer = layers?.find(l => l.name === name);
    return layer?.unit_measure?.d_factor === 10 && [[0,5],[5,15],[15,30],[30,60],[60,100]].every(([top,bottom]) =>
      layer.depths?.find(d => d.range.top_depth === top && d.range.bottom_depth === bottom)?.values.mean === null);
  });
  return empty ? 'no-coverage' : 'incomplete';
}

const fields = {tmax:['T2M_MAX','C'],tmin:['T2M_MIN','C'],rh:['RH2M','%'],wind:['WS2M','m/s'],solar:['ALLSKY_SFC_SW_DWN','MJ/m^2/day'],rain:['PRECTOTCORR','mm/day'],imerg:['IMERG_PRECTOT','mm/day']} as const;
export type HistoryDay = Weather & {date:string;tmean:number|null;rain:number|null;rainSource:'IMERG Final vía POWER'|'POWER'|'Sin dato'};
export function parseBalanceHistory(payload:unknown, from:string, to:string) {
  const data=payload as {header?:{time_standard?:string;fill_value?:number;sources?:string[]};parameters?:Record<string,{units:string}>;properties?:{parameter?:Record<string,Record<string,unknown>>};geometry?:{coordinates:number[]}};
  if(data.header?.time_standard!=='UTC'||!data.properties?.parameter||Object.values(fields).some(([name,units])=>data.parameters?.[name]?.units!==units)) throw new Error('Unidades NASA POWER no verificadas');
  const elevation=data.geometry?.coordinates[2];
  if(typeof elevation!=='number'||!Number.isFinite(elevation)) throw new Error('Sin elevación de la grilla');
  const days:HistoryDay[]=[];
  const meanValues = data.parameters?.T2M?.units === 'C' ? data.properties.parameter.T2M : undefined;
  for(let t=Date.parse(from+'T00:00:00Z');t<=Date.parse(to+'T00:00:00Z');t+=86400000){
    const date=new Date(t).toISOString().slice(0,10), key=date.replaceAll('-','');
    function read(field:keyof typeof fields){const raw=data.properties?.parameter?.[fields[field][0]]?.[key];return typeof raw==='number'&&Number.isFinite(raw)&&raw!==data.header?.fill_value&&raw>=(field==='tmin'||field==='tmax'?-90:0)&&(field!=='rh'||raw<=100)?raw:null;}
    const imerg=data.header.sources?.includes('IMERG')?read('imerg'):null, rain=read('rain');
    const mean = meanValues?.[key];
    const tmean = typeof mean === 'number' && Number.isFinite(mean) && mean !== data.header.fill_value && mean >= -90 && mean <= 80 ? mean : null;
    days.push({date,tmean,tmin:read('tmin'),tmax:read('tmax'),rh:read('rh'),wind:read('wind'),solar:read('solar'),rain:imerg??rain,rainSource:imerg!==null?'IMERG Final vía POWER':rain!==null?'POWER':'Sin dato'});
  }
  return {days,elevation};
}

export function modeledRootMoisture(payload:unknown, today:string) {
  const data=payload as {timezone?:string;latitude?:number;longitude?:number;hourly_units?:Record<string,string>;hourly?:Record<string,unknown[]>};
  const depths=[[0,1],[1,3],[3,9],[9,27],[27,81]];
  const index=data.hourly?.time?.indexOf(today+'T00:00')??-1;
  if(data.timezone!=='America/La_Paz'||index<0) return null;
  let sum=0;
  for(const [top,bottom] of depths){const field=`soil_moisture_${top}_to_${bottom}cm`;const value=data.hourly?.[field]?.[index];if(data.hourly_units?.[field]!=='m³/m³'||typeof value!=='number'||!Number.isFinite(value)||value<0||value>1)return null;sum+=value*(bottom-top);}
  return {root:sum/81,depthM:.81,date:today,latitude:data.latitude,longitude:data.longitude};
}
