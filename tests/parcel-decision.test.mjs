import test from 'node:test';
import assert from 'node:assert/strict';
import { forecastBalance, addDays, preferred, compare } from '../src/domain/water-balance/model.ts';
import { parseSoil, sameImergCell, modeledRootMoisture, parseBalanceHistory, soilResponseStatus } from '../src/domain/water-balance/source-parsers.ts';
import { waterCrops } from '../src/features/pilot/water-crops.ts';

const soil=[{top:0,bottom:100,fc:.3,wp:.15}];
const crop={name:'maíz',kc:[.3,1.2,.65],rootM:.75,p:.55,minDays:100,maxDays:165,seedMonths:[11],use:'forage'};
const base={soil,crop,planting:'2026-09-01',harvest:'2027-01-15',initialFraction:.7,turns:[],rainEfficiency:.8,irrigationEfficiency:.6,
 days:Array.from({length:14},(_,i)=>({date:addDays('2026-11-15',i),rain:0,et0:5,tmin:10}))};

test('ahorrar agua prioriza el menor déficit, no la ausencia de un umbral de heladas',()=>{
 const candidates=[{compatible:true,excluded:false,status:'viable',stressDays:58,supplementalMm:144,coverageDays:150,rotation:{id:'haba'}},
 {compatible:true,excluded:false,status:'conditional',stressDays:27,supplementalMm:50,coverageDays:130,rotation:{id:'cebada'}}];
 assert.equal(preferred(candidates,'Usar menos agua').rotation.id,'cebada');
});

test('balance futuro conserva masa, no inventa lluvia y distingue pérdida de desborde',()=>{
 const result=forecastBalance(base);assert.equal(result.rows.length,14);assert.ok(result.stressDays>0);
 for(const row of result.rows){assert.ok(row.storageMm>=0&&row.storageMm<=row.capacityMm);assert.ok(Math.abs(row.storageBeforeMm+row.rainMm+row.irrigationMm-row.lossMm-row.actualEtMm-row.storageMm)<1e-8);}
 assert.equal(forecastBalance({...base,days:base.days.map((d,i)=>i===3?{...d,rain:null}:d)}),null);
 assert.equal(forecastBalance({...base,days:base.days.filter((_,i)=>i!==2)}),null);
 assert.equal(forecastBalance({...base,initialFraction:NaN}),null);
 assert.equal(forecastBalance({...base,soil:[]}),null);
 const wet=forecastBalance({...base,days:base.days.map(d=>({...d,rain:50})),initialFraction:1});assert.ok(wet.excessMm>0);assert.equal(wet.stressDays,0);
});
test('un turno retrasado conserva el volumen y cambia la evolución del balance',()=>{
 const normal=forecastBalance({...base,initialFraction:.5,turns:[{id:'x',date:'2026-11-15',grossMm:60}]});
 const late=forecastBalance({...base,initialFraction:.5,turns:[{id:'x',date:'2026-11-20',grossMm:60}]});
 assert.equal(normal.rows.reduce((s,r)=>s+r.irrigationMm,0),late.rows.reduce((s,r)=>s+r.irrigationMm,0));
 assert.ok(late.rows.slice(0,5).filter(r=>r.stressed).length>normal.rows.slice(0,5).filter(r=>r.stressed).length);
});
test('actualizar SMAP antes de sembrar conserva agua sin atribuir estrés a un cultivo ausente',()=>{
 const before=forecastBalance({...base,planting:'2026-11-18',initialFraction:.1,days:base.days.slice(0,3)});
 assert.ok(before);assert.equal(before.stressDays,0);assert.ok(before.rows.every(r=>r.stage==='Antes de la siembra'));
 assert.equal(forecastBalance({...base,days:[base.days[0],base.days[2]]}),null);
});
test('diversificar prioriza alternar familias y un umbral de frío ausente no se convierte en cero',()=>{
 const candidates=[{compatible:true,excluded:false,status:'conditional',stressDays:10,supplementalMm:20,coverageDays:130,rotation:{id:'cereales',seasons:[{crop:{family:'cereal'}},{crop:{family:'cereal'}}]}},
 {compatible:true,excluded:false,status:'conditional',stressDays:20,supplementalMm:30,coverageDays:150,rotation:{id:'leguminosa',seasons:[{crop:{family:'cereal'}},{crop:{family:'legume'}}]}}];
 assert.equal(preferred(candidates,'Diversificar la producción').rotation.id,'leguminosa');
 const input={...base,testTurnId:'',priority:'Usar menos agua',rotations:[{id:'sin umbral',restrictions:[],seasons:[{start:'2026-11-15',end:'2026-11-28',crop:{...crop,minDays:1,maxDays:30}}]}]};
 const [result]=compare(input,0);assert.equal(result.frostDays,null);assert.match(result.reasons.join(' '),/evaluación del frío está incompleta/);
});
test('IMERG se comparte solo dentro del píxel importado, no un radio aproximado',()=>{
 assert.equal(sameImergCell(-17.42442,-66.18272,-17.45,-66.15),true);
 assert.equal(sameImergCell(-17.39,-66.15,-17.45,-66.15),false);
 assert.equal(sameImergCell(-17.45,-66.21,-17.45,-66.15),false);
});
const depths=[[0,5],[5,15],[15,30],[30,60],[60,100]];
function soilPayload(){return {properties:{layers:Object.entries({wv0033:300,wv1500:150,sand:400,clay:250}).map(([name,mean])=>({name,unit_measure:{d_factor:10},depths:depths.map(([top_depth,bottom_depth])=>({range:{top_depth,bottom_depth},values:{mean}}))}))}};}
test('SoilGrids valida unidades, nulos, continuidad y capacidad de retención',()=>{
 const payload=soilPayload();const profile=parseSoil(payload);assert.equal(profile[0].fc,.3);assert.equal(profile[0].wp,.15);assert.equal(profile[0].sand,40);
 payload.properties.layers[0].depths[2].values.mean=null;assert.equal(parseSoil(payload),null);
 const wrong=soilPayload();wrong.properties.layers[0].unit_measure.d_factor=100;assert.equal(parseSoil(wrong),null);
});

test('distingue falta de cobertura de una respuesta incompleta o malformada',()=>{
 assert.equal(soilResponseStatus(soilPayload()),'available');
 const empty=soilPayload();for(const layer of empty.properties.layers)for(const depth of layer.depths)depth.values.mean=null;
 assert.equal(soilResponseStatus(empty),'no-coverage');
 const partial=soilPayload();partial.properties.layers[0].depths[1].values.mean=null;
 assert.equal(soilResponseStatus(partial),'incomplete');
 assert.equal(soilResponseStatus({properties:{layers:{}}}),'incomplete');
 assert.equal(soilResponseStatus(null),'incomplete');
 const units=soilPayload();units.properties.layers[0].unit_measure.d_factor=100;
 assert.equal(soilResponseStatus(units),'incomplete');
});

test('los nuevos cultivos producen balances finitos y conservan agua en el metro de suelo disponible',()=>{
 for(const profile of Object.values(waterCrops)){
   const result=forecastBalance({...base,crop:profile});
   assert.ok(result,profile.name);assert.ok(result.demandMm>0,profile.name);
   for(const row of result.rows)assert.ok(Math.abs(row.storageBeforeMm+row.rainMm+row.irrigationMm-row.lossMm-row.actualEtMm-row.storageMm)<1e-8,profile.name);
   assert.ok(profile.rootM<=1&&profile.rootM>0,profile.name);
   const start = `2024-${String(profile.seedMonths[0] ?? 3).padStart(2,'0')}-01`;
   const duration = profile.duration || 90;
   const [historical] = compare({
     ...base, testTurnId:'', priority:'Usar menos agua',
     days: Array.from({length:duration},(_,i)=>({date:addDays(start,i),rain:2,et0:4,tmin:10})),
     rotations:[{id:profile.name,restrictions:[],seasons:[{crop:profile,start,end:addDays(start,duration-1)}]}],
   },0);
   assert.equal(historical.excluded,false,profile.name);
   assert.ok(Number.isFinite(historical.supplementalMm),profile.name);
 }
 // FAO-56 Table 12: potatoes .5/1.15/.75; alfalfa .4/1.2/1.15 per cutting period.
 assert.deepEqual(waterCrops.Papa.kc,[.5,1.15,.75]);
 assert.deepEqual(waterCrops.Alfalfa.kc,[.4,1.2,1.15]);
 assert.equal(waterCrops.Alfalfa.cutting,true);
 for(const c of Object.values(waterCrops).filter(c=>!c.duration))assert.equal(c.requiresEndDate,true,c.name);
});
test('la humedad complementaria es una media por profundidad del inicio del día local',()=>{
 const names=['0_to_1','1_to_3','3_to_9','9_to_27','27_to_81'].map(d=>'soil_moisture_'+d+'cm');
 const payload={timezone:'America/La_Paz',hourly_units:Object.fromEntries(names.map(n=>[n,'m³/m³'])),hourly:{time:['2026-11-15T00:00'],...Object.fromEntries(names.map((n,i)=>[n,[i===4?.3:.2]]))}};
 assert.ok(Math.abs(modeledRootMoisture(payload,'2026-11-15').root-((27*.2+54*.3)/81))<1e-10);
 assert.equal(modeledRootMoisture(payload,'2026-11-16'),null);
 payload.hourly[names[0]]=[null];assert.equal(modeledRootMoisture(payload,'2026-11-15'),null);
});
test('POWER conserva cero, usa IMERG primero y no convierte el fill value en observación',()=>{
 const units={T2M_MAX:'C',T2M_MIN:'C',RH2M:'%',WS2M:'m/s',ALLSKY_SFC_SW_DWN:'MJ/m^2/day',PRECTOTCORR:'mm/day',IMERG_PRECTOT:'mm/day'};
 const payload={header:{time_standard:'UTC',fill_value:-999,sources:['IMERG']},parameters:Object.fromEntries(Object.entries(units).map(([k,u])=>[k,{units:u}])),geometry:{coordinates:[-66.18,-17.42,3100]},properties:{parameter:Object.fromEntries(Object.keys(units).map(k=>[k,{20240101:k==='IMERG_PRECTOT'?0:10,20240102:-999}]))}};
 const data=parseBalanceHistory(payload,'2024-01-01','2024-01-02');assert.equal(data.days[0].rain,0);assert.equal(data.days[0].rainSource,'IMERG Final vía POWER');assert.equal(data.days[1].rain,null);
 payload.header.time_standard='LST';assert.throws(()=>parseBalanceHistory(payload,'2024-01-01','2024-01-02'));
});
