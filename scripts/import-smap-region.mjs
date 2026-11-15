/** Public NASA POWER SMAP Zarr subset. No Earthdata credentials, no global download. */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { Blosc } from 'numcodecs';

const base='https://nasa-power-smap.s3.amazonaws.com/smap/temporal/power_smap_daily_temporal_utc.zarr/';
const dayMs=86400000;
const today=new Date().toISOString().slice(0,10);
const from=`${new Date().getUTCFullYear()-2}-01-01`;
const meta=(await(await fetch(base+'.zmetadata')).json()).metadata;
if(meta['time/.zattrs'].units!=='days since 2015-03-31 00:00:00')throw new Error('Time origin changed');
const epoch=Date.parse('2015-03-31T00:00Z');
await mkdir('.data-cache/smap',{recursive:true});
async function decoded(key){
  const file='.data-cache/smap/'+key.replaceAll('/','_');
  let bytes;
  // Coordinate arrays are invariant; data chunks refresh on every import.
  if(key.startsWith('lat/')||key.startsWith('lon/')){try{bytes=await readFile(file);}catch{/* fetch below */}}
  if(!bytes){const r=await fetch(base+key,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw new Error(`NASA ${r.status}: ${key}`);bytes=new Uint8Array(await r.arrayBuffer());await writeFile(file,bytes);}
  const codec=meta[key.split('/')[0]+'/.zarray'].compressor;
  if(codec.id!=='blosc')throw new Error('Unsupported compressor');
  return new Blosc().decode(bytes);
}
async function axis(name){const bytes=await decoded(name+'/0');return new Float64Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/8);}
const lat=await axis('lat'),lon=await axis('lon');
const nearest=(a,v)=>a.reduce((j,x,i)=>Math.abs(x-v)<Math.abs(a[j]-v)?i:j,0);
const range=(a,lo,hi)=>{const ends=[nearest(a,lo),nearest(a,hi)].sort((x,y)=>x-y);return Array.from({length:ends[1]-ends[0]+1},(_,i)=>ends[0]+i);};
const ys=range(lat,-17.54,-17.25),xs=range(lon,-66.29,-66.06);
const start=Math.round((Date.parse(from)-epoch)/dayMs),end=Math.round((Date.parse(today)-epoch)/dayMs);
const cache=new Map();
async function value(field,t,y,x){
  const config=meta[field+'/.zarray'];
  if(meta[field+'/.zattrs'].units!=='m3 m-3'||config.dtype!=='<f4'||config.order!=='C')throw new Error('SMAP units or storage changed');
  const [ct,cy,cx]=config.chunks;
  const key=`${field}/${Math.floor(t/ct)}.${Math.floor(y/cy)}.${Math.floor(x/cx)}`;
  if(!cache.has(key)){const bytes=await decoded(key);cache.set(key,new Float32Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/4));}
  const filters=config.filters;
  if(filters?.length!==1||filters[0].id!=='fixedscaleoffset'||filters[0].astype!=='<f4')throw new Error('SMAP scaling changed');
  const raw=cache.get(key)[((t%ct)*cy+y%cy)*cx+x%cx];
  const result=raw/filters[0].scale+filters[0].offset;
  return Number.isFinite(result)&&result>=0&&result<=.9?Number(result.toFixed(4)):null;
}
function bounds(axis,i){return [(axis[i-1]+axis[i])/2,(axis[i]+axis[i+1])/2].sort((a,b)=>a-b);}
const cells=[];
for(const y of ys)for(const x of xs){
  const surface=[],root=[];
  for(let t=start;t<=end;t++){surface.push(await value('SFMC',t,y,x));root.push(await value('RZMC',t,y,x));}
  const [south,north]=bounds(lat,y),[west,east]=bounds(lon,x);
  cells.push({latitude:lat[y],longitude:lon[x],bounds:{south,north,west,east},surface,root});
}
// NASA's temporal chunks can lag behind the spatial store. Refresh only the latest week.
const availability=await(await fetch('https://nasa-power.s3.amazonaws.com/last_available.json')).json();
const latest=availability.smap?.spatial?.daily?.utc;
const spatialBase=base.replace('/temporal/','/spatial/').replace('_temporal_','_spatial_');
const spatial=(await(await fetch(spatialBase+'.zmetadata')).json()).metadata;
if(latest&&latest<=today)for(let offset=0;offset<7;offset++){
  const stamp=Date.parse(latest)-offset*dayMs,t=Math.round((stamp-epoch)/dayMs),index=t-start;
  if(index<0)continue;
  for(const field of ['SFMC','RZMC']){
    const config=spatial[field+'/.zarray'];const [ct,cy,cx]=config.chunks;
    if(ct!==1||config.dtype!=='<f4'||config.filters?.[0]?.id!=='fixedscaleoffset'||spatial[field+'/.zattrs'].units!=='m3 m-3')throw new Error('Spatial format changed');
    const loaded=new Map();
    for(let i=0;i<cells.length;i++){
      const y=ys[Math.floor(i/xs.length)],x=xs[i%xs.length],key=`${field}/${t}.${Math.floor(y/cy)}.${Math.floor(x/cx)}`;
      if(!loaded.has(key)){const r=await fetch(spatialBase+key,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw new Error(`Spatial SMAP unavailable: ${r.status}`);const bytes=await new Blosc().decode(new Uint8Array(await r.arrayBuffer()));loaded.set(key,new Float32Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/4));}
      const raw=loaded.get(key)[(y%cy)*cx+x%cx],value=raw/config.filters[0].scale+config.filters[0].offset;
      cells[i][field==='SFMC'?'surface':'root'][index]=Number.isFinite(value)&&value>=0&&value<=.9?Number(value.toFixed(4)):null;
    }
  }
}
let lastIndex=-1;
for(const cell of cells)for(let i=cell.root.length-1;i>lastIndex;i--)if(cell.root[i]!==null&&cell.surface[i]!==null){lastIndex=i;break;}
if(lastIndex<0)throw new Error('No valid SMAP samples; previous bundle kept');
const to=new Date(Date.parse(from)+lastIndex*dayMs).toISOString().slice(0,10);
for(const c of cells){c.root=c.root.slice(0,lastIndex+1);c.surface=c.surface.slice(0,lastIndex+1);}
const output={source:base,spatialSource:spatialBase,documentation:'https://power.larc.nasa.gov/docs/methodology/data/sources_hydrology/',
  product:'SMAP L4 vía NASA POWER · grilla remuestreada ~9 km',status:meta['RZMC/.zattrs'].status,
  precision:meta['RZMC/.zattrs'].significant_digits,timeStandard:'UTC',units:'m3 m-3',from,to,fetchedAt:new Date().toISOString(),cells};
await writeFile('src/data/smap-cochabamba.json',JSON.stringify(output)+'\n');
console.log(`SMAP: ${cells.length} celdas, ${from} a ${to}; ${cache.size} bloques descargados. Último dato válido, no fecha de consulta.`);
