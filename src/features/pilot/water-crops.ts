import type { Crop } from '../../domain/water-balance/model';

export const waterCropSource='https://www.fao.org/4/x0490e/x0490e0b.htm';
export const waterRootSource='https://www.fao.org/4/x0490e/x0490e0e.htm';
export const localCropSource='https://www.agrecolandes.org/wp-content/uploads/2022/04/Construyendo-Agroecologia-fin.pdf';
export type WaterCrop=Crop & {group:string;duration:number;cutting?:boolean;requiresEndDate?:boolean;note?:string};

// Water-use profiles only. Presence here is not a local sowing-window or yield recommendation.
// New profiles use FAO-56 tables 12 and 22; actual end date is requested rather than inventing local phenology.
export const waterCrops:Record<string,WaterCrop>={
  'Maíz forrajero':{name:'Maíz forrajero',group:'Forrajes',family:'cereal',kc:[.3,1.2,.65],rootM:.75,p:.55,duration:127,minDays:100,maxDays:165,seedMonths:[10,11,12,1],use:'forage',frostC:0},
  'Avena forrajera':{name:'Avena forrajera',group:'Forrajes',family:'cereal',kc:[.3,1.15,.6],rootM:.65,p:.55,duration:111,minDays:100,maxDays:155,seedMonths:[2,3,4],use:'forage',frostC:-1},
  'Cebada forrajera':{name:'Cebada forrajera',group:'Forrajes',family:'cereal',kc:[.3,1.15,.75],rootM:.6,p:.55,duration:74,minDays:60,maxDays:115,seedMonths:[2,3,4],use:'forage',frostC:0},
  'Haba':{name:'Haba',group:'Legumbres',family:'legume',kc:[.5,1.15,1.1],rootM:.55,p:.45,duration:106,minDays:95,maxDays:150,seedMonths:[2,3,4],use:'grain'},
  'Alfalfa':{name:'Alfalfa',group:'Forrajes',family:'legume',kc:[.4,1.2,1.15],rootM:1,p:.55,duration:0,minDays:1,maxDays:365,seedMonths:[],use:'forage',cutting:true,requiresEndDate:true,note:'Evaluamos el rebrote entre dos cortes de una alfalfa establecida. Usamos el primer metro de suelo; sus raíces pueden ser más profundas.'},
  'Papa':{name:'Papa',group:'Hortalizas y tubérculos',family:'nightshade',kc:[.5,1.15,.75],rootM:.5,p:.35,duration:0,minDays:1,maxDays:365,seedMonths:[],use:'grain',requiresEndDate:true},
  'Zanahoria':{name:'Zanahoria',group:'Hortalizas y tubérculos',family:'carrot',kc:[.7,1.05,.95],rootM:.75,p:.35,duration:0,minDays:1,maxDays:365,seedMonths:[],use:'grain',requiresEndDate:true},
  'Cebolla (cabeza)':{name:'Cebolla (cabeza)',group:'Hortalizas y tubérculos',family:'amaryllis',kc:[.7,1.05,.75],rootM:.45,p:.3,duration:0,minDays:1,maxDays:365,seedMonths:[],use:'grain',requiresEndDate:true},
  'Lechuga':{name:'Lechuga',group:'Hortalizas y tubérculos',family:'daisy',kc:[.7,1,.95],rootM:.4,p:.3,duration:0,minDays:1,maxDays:365,seedMonths:[],use:'grain',requiresEndDate:true},
  'Arveja (verde)':{name:'Arveja (verde)',group:'Legumbres',family:'legume',kc:[.5,1.15,1.1],rootM:.8,p:.35,duration:0,minDays:1,maxDays:365,seedMonths:[],use:'grain',requiresEndDate:true},
  'Maíz en grano':{name:'Maíz en grano',group:'Cereales',family:'cereal',kc:[.3,1.2,.35],rootM:1,p:.55,duration:0,minDays:1,maxDays:365,seedMonths:[],use:'grain',requiresEndDate:true,note:'Referencia para cosecha de grano seco. Usamos el primer metro de raíces; la profundidad real depende del terreno.'},
  'Trigo':{name:'Trigo',group:'Cereales',family:'cereal',kc:[.3,1.15,.25],rootM:1,p:.55,duration:0,minDays:1,maxDays:365,seedMonths:[],use:'grain',requiresEndDate:true,note:'Referencia de trigo de primavera, sin fase de dormancia. Confirma el ciclo de la variedad que cultivas.'},
};
export const waterCropGroups=['Forrajes','Hortalizas y tubérculos','Legumbres','Cereales'];
