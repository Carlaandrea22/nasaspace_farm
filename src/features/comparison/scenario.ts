import sourceJson from "../../data/la-maica-sources.json";
import { addDays, dayDistance, et0, flowVolume, millimeters, type BalanceInput, type Crop, type SoilLayer, type Turn, type Weather } from "../../domain/water-balance/model";
import { cropForParcel, productionPriorities, type CropWater, type PilotDraft, type ProductionPriority } from "../pilot/draft";
import { getReferenceCase } from "../territory/reference";

const sources = sourceJson as {
  power: Record<string, Weather & { rain: number | null }>;
  imerg: Record<string, number | null>;
  soil: SoilLayer[];
  smap: { date: string; surface: number | null; root: number | null; quality: string }[];
  meta: typeof sourceJson.meta;
};

const maize = "Maíz forrajero";
const oats = "Avena forrajera";
const barley = "Cebada forrajera";
const beans = "Haba";
export const cropProfiles: Record<string, Crop & { duration: number; cold: string; drought: string; yieldRef?: string; seedRef?: string }> = {
  [maize]: { name: maize, kc: [.3, 1.2, .65], rootM: .75, p: .55, minDays: 100, maxDays: 165, seedMonths: [10,11,12,1], use: "forage", duration: 127, frostC: 0, cold: "Umbral de 0 °C para revisar heladas", drought: "Revisar disponibilidad en máxima demanda" },
  [oats]: { name: oats, kc: [.3, 1.15, .6], rootM: .65, p: .55, minDays: 100, maxDays: 155, seedMonths: [2,3,4], use: "forage", duration: 111, frostC: -1, cold: "EcoCrop: referencia de −1 °C durante el crecimiento", drought: "Consultar tolerancia de la variedad" },
  [barley]: { name: barley, kc: [.3, 1.15, .75], rootM: .6, p: .55, minDays: 60, maxDays: 115, seedMonths: [2,3,4], use: "forage", duration: 74, frostC: 0, cold: "SEFO-SAM describe resistencia a heladas. EcoCrop: umbral de 0 °C durante crecimiento.", drought: "SEFO-SAM describe tolerancia a sequía", yieldRef: "4–7 t/ha de materia seca con buen manejo (SEFO-SAM, variedades ensayadas)", seedRef: "90–100 kg/ha en cultivo puro (SEFO-SAM)" },
  [beans]: { name: beans, kc: [.5, 1.15, 1.1], rootM: .55, p: .45, minDays: 95, maxDays: 150, seedMonths: [2,3,4], use: "grain", duration: 106, cold: "Confirmar tolerancia en floración", drought: "Haba Cinteña requiere humedad sostenida según SEFO-SAM", seedRef: "120–130 kg/ha para Haba Cinteña (SEFO-SAM)" },
};

export const scenarioSources = {
  power: "https://power.larc.nasa.gov/docs/services/api/temporal/daily/",
  imerg: "https://gpm.nasa.gov/data/directory",
  smap: "https://nsidc.org/data/spl4smgp/versions/8",
  soil: "https://docs.isric.org/globaldata/soilgrids/wcs.html",
  faoEt: "https://www.fao.org/4/x0490e/x0490e08.htm",
  faoCrop: "https://www.fao.org/4/x0490e/x0490e0b.htm",
  faoBalance: "https://www.fao.org/4/x0490e/x0490e0e.htm",
  barley: "https://www.sefosam.com.bo/pdf/cebada.pdf",
  beans: "https://sefosam.com.bo/pdf/ft-haba.pdf",
};

type Scenario = {
  input: BalanceInput;
  volume: number;
  area: number;
  volumeSource: string;
  history: boolean;
  usingImerg: boolean;
};

export const demoVolume = 400;
export const demoInterval = 17;
const defaultDates = { firstPlanting: "2024-11-12", firstHarvest: "2025-03-18", secondPlanting: "2025-04-04", secondHarvest: "2025-07-23" };
export const demoTurnDate = "2025-05-26";
export const metadata = sources.meta;
export const smapRows = sources.smap;

function volumeFor(crop: CropWater | undefined): { volume: number; source: string } | null {
  if (crop?.volumeM3) return { volume: crop.volumeM3, source: "Volumen declarado" };
  if (crop?.flowLs && crop?.durationMinutes) return {volume: flowVolume(crop.flowLs, crop.durationMinutes), source: "Estimación por caudal y duración declarados"};
  if (crop?.scenarioVolumeM3) return {volume:crop.scenarioVolumeM3, source:"Volumen de escenario · supuesto editable"};
  return null;
}

export function assessDraft(draft: PilotDraft | undefined) {
  if (!draft?.parcel) return { zone: "Parcela por registrar", gaps: ["Ubica y guarda la parcela.", "Registra la rotación habitual, el calendario y el turno de riego."] };
  const parcel = draft.parcel;
  const reference = getReferenceCase(parcel.latitude, parcel.longitude);
  const district = parcel.territory?.district.status === "unique" ? parcel.territory.district.matches[0] : undefined;
  const zone = reference === "tunari" ? "Tirani · D13 / Tunari" : reference === "la-maica" ? "La Maica · D9 / Itocta" :
    district?.district ? [district.district, district.commune].filter(Boolean).join(" / ") : "Ubicación ingresada";
  const crop = cropForParcel(draft);
  const gaps = [];
  if (!parcel.areaHa) gaps.push("Confirma la superficie de la parcela.");
  if (!crop?.firstCrop || !crop.secondCrop || !cropProfiles[crop.firstCrop] || !cropProfiles[crop.secondCrop]) gaps.push("Registra la secuencia habitual y confirma perfiles agronómicos para sus cultivos.");
  if (!crop?.firstPlanting || !crop.firstHarvest || !crop.secondPlanting || !crop.secondHarvest) gaps.push("Completa las fechas de siembra y corte de las dos campañas.");
  if (!crop?.priority) gaps.push("Indica la prioridad del productor.");
  if (!crop?.turnDate || !volumeFor(crop)) gaps.push("Confirma fecha y volumen del turno, caudal y duración o un supuesto explícito.");
  if (crop?.turnStatus === "Cancelado") gaps.push("Confirma un turno evaluable, porque el registrado está cancelado.");
  if (reference !== "la-maica") gaps.push("Incorpora suelo, clima histórico y alternativas agronómicas compatibles con esta ubicación.");
  if (crop?.firstPlanting && crop?.secondHarvest && (crop.firstPlanting < metadata.period.start || crop.secondHarvest > metadata.period.end)) gaps.push("Carga una serie histórica que cubra las fechas declaradas. La serie incluida es de 2024–2025.");
  if (crop?.secondPlanting && crop?.secondHarvest && crop?.turnDate &&
      (crop.turnDate < crop.secondPlanting || crop.turnDate > crop.secondHarvest || addDays(crop.turnDate, 5) > crop.secondHarvest)) {
    gaps.push("El turno previsto y su variante retrasada deben caber en la segunda campaña.");
  }
  return { zone, gaps, crop };
}

export function prepareScenario(draft: PilotDraft | undefined, demo: boolean, assumedVolume?: number, demoPriority: ProductionPriority = productionPriorities[0]): Scenario | null {
  const assessment = assessDraft(draft);
  if (!demo && assessment.gaps.length) return null;
  const data = demo ? undefined : assessment.crop;
  const dates = data ?? defaultDates;
  const first = cropProfiles[data?.firstCrop || maize];
  const second = cropProfiles[data?.secondCrop || oats];
  if (!first || !second) return null;
  const others = [oats, barley, beans, maize].filter((name) => name !== second.name).slice(0, 2).map((name) => cropProfiles[name]);
  const water = volumeFor(data) ?? { volume: assumedVolume ?? demoVolume, source: "Volumen del turno · supuesto editable de la demo" };
  if (!Number.isFinite(water.volume) || water.volume <= 0) return null;
  const area = data ? draft?.parcel?.areaHa ?? 1 : 1;
  const priority = data?.priority || demoPriority;
  const testTurn = data?.turnDate || demoTurnDate;
  const lastDay = data ? dates.secondHarvest : "2025-08-05";
  const rotations = [second, ...others].map((crop, index) => ({
    id: ["A", "B", "C"][index],
    restrictions: first.name === beans || crop.name === beans ? ["Confirma uso de la cosecha, ventana local, suelo y calidad del agua para el haba."] : [],
    seasons: [
      { start: dates.firstPlanting, end: dates.firstHarvest, crop: first },
      { start: dates.secondPlanting, end: index === 0 ? dates.secondHarvest : addDays(dates.secondPlanting, crop.duration - 1), crop },
    ],
  }));
  if (data && rotations.some(({seasons}) => seasons[1].end > lastDay)) {
    for (const rotation of rotations) if (rotation.seasons[1].end > lastDay) {
      rotation.restrictions.push("La alternativa se extiende más allá del periodo declarado.");
    }
  }
  const grossMm = millimeters(water.volume, area);
  const turns: Turn[] = [{ id: "turno", date: testTurn, grossMm }];
  const interval = data ? data.intervalDays : demoInterval;
  if (interval && interval > 0 && Number.isSafeInteger(interval)) {
    for (let offset = -interval; offset >= -dayDistance(dates.firstPlanting, testTurn); offset -= interval) {
      turns.push({ id: "prev" + offset, date: addDays(testTurn, offset), grossMm });
    }
    for (let offset = interval; offset <= dayDistance(testTurn, lastDay); offset += interval) {
      turns.push({ id: "next" + offset, date: addDays(testTurn, offset), grossMm });
    }
  }

  const usingImerg = Object.keys(sources.imerg).length > 0;
  const length = dayDistance(dates.firstPlanting, lastDay) + 1;
  const days = Array.from({length}, (_, index) => {
    const date = addDays(dates.firstPlanting, index);
    const weather = sources.power[date];
    return { date, rain: usingImerg ? sources.imerg[date] ?? null : weather?.rain ?? null,
      et0: weather ? et0(date, weather, -17.42442, 2560) : null, tmin: weather?.tmin ?? null };
  });
  return {
    input: { days, soil: sources.soil, turns, testTurnId: "turno", rainEfficiency: .85, irrigationEfficiency: .75, initialFraction: .72, priority, rotations },
    volume: water.volume, area, volumeSource: water.source, history: Boolean(data), usingImerg,
  };
}
