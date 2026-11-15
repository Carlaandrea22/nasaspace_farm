export type SoilLayer = { top: number; bottom: number; fc: number; wp: number; sand?: number; clay?: number };
export type Weather = { tmin: number | null; tmax: number | null; rh: number | null; wind: number | null; solar: number | null };
export type Day = { date: string; rain: number | null; et0: number | null; tmin: number | null };
export type Turn = { id: string; date: string; grossMm: number };
export type Crop = {
  name: string;
  kc: readonly [number, number, number];
  rootM: number;
  p: number;
  minDays: number;
  maxDays: number;
  seedMonths: readonly number[];
  use: "forage" | "grain";
  frostC?: number;
  family?: "cereal" | "legume" | "nightshade" | "carrot" | "amaryllis" | "daisy";
};
export type Season = { start: string; end: string; crop: Crop };
export type Rotation = { id: string; seasons: Season[]; restrictions: string[] };
export type BalanceInput = {
  days: Day[];
  soil: SoilLayer[];
  turns: Turn[];
  testTurnId: string;
  rainEfficiency: number;
  irrigationEfficiency: number;
  initialFraction: number;
  expansionFraction?: number;
  priority: string;
  rotations: Rotation[];
};

const dayMs = 86_400_000;
const time = (date: string) => Date.parse(date + "T00:00:00Z");
export const dayDistance = (from: string, to: string) => Math.round((time(to) - time(from)) / dayMs);
export const addDays = (date: string, count: number) => new Date(time(date) + dayMs * count).toISOString().slice(0, 10);
export const millimeters = (volumeM3: number, areaHa: number) => volumeM3 / (areaHa * 10);
export const flowVolume = (litersPerSecond: number, minutes: number) => litersPerSecond * minutes * 60 / 1000;
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

export function moveTurn(turns: Turn[], id: string, delay: number): Turn[] {
  return turns.map((turn) => turn.id === id ? { ...turn, date: addDays(turn.date, delay) } : turn);
}

function rootStorageLimits(layers: SoilLayer[], depthM: number) {
  const depth = depthM * 100;
  let fieldCapacity = 0;
  let wiltingPoint = 0;
  let bottom = 0;
  for (const layer of layers) {
    if (bottom >= depth) break;
    if (layer.top !== bottom || layer.bottom <= bottom || ![layer.fc, layer.wp].every(Number.isFinite) || layer.fc > 1 || layer.wp < 0 || layer.fc <= layer.wp) return null;
    const end = Math.min(depth, layer.bottom);
    const thickness = (end - bottom) * 10;
    fieldCapacity += layer.fc * thickness;
    wiltingPoint += layer.wp * thickness;
    bottom = end;
  }
  return bottom >= depth && fieldCapacity > wiltingPoint ? { fieldCapacity, wiltingPoint } : null;
}

export function rootCapacity(layers: SoilLayer[], depthM: number): number | null {
  const limits = rootStorageLimits(layers, depthM);
  return limits ? limits.fieldCapacity - limits.wiltingPoint : null;
}

export function availableWaterFraction(layers: SoilLayer[], depthM: number, volumetricMoisture: number) {
  if (!Number.isFinite(volumetricMoisture) || volumetricMoisture < 0 || volumetricMoisture > 1) return null;
  const limits = rootStorageLimits(layers, depthM);
  if (!limits) return null;
  const storageMm = volumetricMoisture * depthM * 1000;
  return clamp((storageMm - limits.wiltingPoint) / (limits.fieldCapacity - limits.wiltingPoint), 0, 1);
}

export type SmapObservation = { date: string; surface: number | null; root: number | null; quality: string };

export function initialSoilWater(
  layers: SoilLayer[], observations: SmapObservation[], start: string, assumed: number,
) {
  const date = addDays(start, -1);
  const sample = observations.find((row) => row.date === date);
  const validSurface = sample?.surface != null && sample.surface >= 0 && sample.surface <= 1;
  const estimate = sample?.quality === "accepted" && validSurface && sample.root !== null
    ? availableWaterFraction(layers, 1, sample.root) : null;
  return { date, sample, estimate, fraction: estimate ?? assumed };
}

function validRain(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) && value >= 0 ? value : null;
}

export function historicalRain(
  start: string, end: string, imerg: Record<string, number | null>,
  power: Record<string, { rain: number | null }>,
) {
  const length = dayDistance(start, end) + 1;
  return Array.from({ length }, (_, index) => {
    const date = addDays(start, index);
    const final = validRain(imerg[date]);
    const reference = validRain(power[date]?.rain);
    const source = final !== null ? "IMERG Final" : reference !== null ? "POWER" : "Sin dato";
    return { date, rain: final ?? reference, reference, source };
  });
}

// FAO-56 daily Penman–Monteith, using actual vapour pressure estimated from RHmean.
export function et0(date: string, weather: Weather, latitude: number, elevation: number): number | null {
  const { tmin, tmax, rh, wind, solar } = weather;
  if (tmin === null || tmax === null || rh === null || wind === null || solar === null ||
      ![tmin, tmax, rh, wind, solar].every(Number.isFinite) || tmin > tmax || rh < 0 || rh > 100 || wind < 0 || solar < 0) return null;
  const t = (tmin + tmax) / 2;
  const saturation = (c: number) => 0.6108 * Math.exp(17.27 * c / (c + 237.3));
  const es = (saturation(tmin) + saturation(tmax)) / 2;
  const ea = es * rh / 100;
  const slope = 4098 * saturation(t) / (t + 237.3) ** 2;
  const gamma = 0.000665 * 101.3 * ((293 - 0.0065 * elevation) / 293) ** 5.26;
  const j = dayDistance(date.slice(0, 4) + "-01-01", date) + 1;
  const orbital = 2 * Math.PI * j / 365;
  const phi = latitude * Math.PI / 180;
  const declination = 0.409 * Math.sin(orbital - 1.39);
  const sunset = Math.acos(clamp(-Math.tan(phi) * Math.tan(declination), -1, 1));
  const ra = 24 * 60 / Math.PI * 0.082 * (1 + 0.033 * Math.cos(orbital)) *
    (sunset * Math.sin(phi) * Math.sin(declination) + Math.cos(phi) * Math.cos(declination) * Math.sin(sunset));
  const rso = (0.75 + 0.00002 * elevation) * ra;
  const longwave = 4.903e-9 * ((tmax + 273.16) ** 4 + (tmin + 273.16) ** 4) / 2 *
    (0.34 - 0.14 * Math.sqrt(ea)) * (1.35 * clamp(solar / rso, 0.3, 1) - 0.35);
  const result = (0.408 * slope * (0.77 * solar - longwave) + gamma * 900 / (t + 273) * wind * (es - ea)) /
    (slope + gamma * (1 + 0.34 * wind));
  return Number.isFinite(result) ? Math.max(0, result) : null;
}

export function cropProgress(index: number, duration: number, [initial, mid, end]: Crop["kc"]) {
  const fraction = index / Math.max(1, duration);
  if (fraction < 0.2) return { stage: "Establecimiento", kc: initial, covered: false };
  if (fraction < 0.45) return { stage: "Desarrollo", kc: initial + (mid - initial) * (fraction - 0.2) / 0.25, covered: fraction >= 0.35 };
  if (fraction < 0.8) return { stage: "Máxima demanda", kc: mid, covered: true };
  return { stage: "Fin de ciclo", kc: mid + (end - mid) * (fraction - 0.8) / 0.2, covered: true };
}

/** Short-term screening, not a hydraulic flood model. Missing days invalidate the balance. */
export function forecastBalance(input: {
  days: Day[]; soil: SoilLayer[]; crop: Crop; planting: string; harvest: string;
  initialFraction: number; turns: Turn[]; rainEfficiency: number; irrigationEfficiency: number;
}) {
  const capacity = rootCapacity(input.soil, input.crop.rootM);
  const duration = dayDistance(input.planting, input.harvest) + 1;
  if (capacity === null || !input.days.length || !Number.isFinite(duration) || duration <= 0 ||
      !Number.isFinite(input.initialFraction) || input.initialFraction < 0 || input.initialFraction > 1 ||
      ![input.rainEfficiency, input.irrigationEfficiency].every(x => Number.isFinite(x) && x >= 0 && x <= 1) ||
      input.turns.some(t => !Number.isFinite(t.grossMm) || t.grossMm < 0)) return null;
  let storage = capacity * input.initialFraction;
  const rows: BalanceRow[] = [];
  for (const [index, day] of input.days.entries()) {
    if (!Number.isFinite(dayDistance(day.date, day.date)) || day.date > input.harvest ||
        (index > 0 && dayDistance(input.days[index - 1].date, day.date) !== 1) ||
        day.rain === null || day.et0 === null || !Number.isFinite(day.rain) || !Number.isFinite(day.et0) || day.rain < 0 || day.et0 < 0) return null;
    const active=day.date>=input.planting;
    const phase = active?cropProgress(dayDistance(input.planting, day.date), duration, input.crop.kc):{stage:'Antes de la siembra',kc:.25};
    const demand = day.et0 * phase.kc;
    const threshold = active?capacity * (1 - clamp(input.crop.p + .04 * (5 - demand), .1, .8)):0;
    const rain = day.rain * input.rainEfficiency;
    const irrigation = input.turns.filter(t => t.date === day.date).reduce((sum, t) => sum + t.grossMm * input.irrigationEfficiency, 0);
    const before = storage;
    const available = Math.min(capacity, storage + rain + irrigation);
    const loss = Math.max(0, storage + rain + irrigation - capacity);
    const actual = Math.min(available, demand * (threshold>0?Math.min(1, available / threshold):1));
    storage = available - actual;
    rows.push({date: day.date, stage: phase.stage, storageBeforeMm: before, storageMm: storage, capacityMm: capacity,
      thresholdMm: threshold, rainMm: rain, irrigationMm: irrigation, lossMm: loss, potentialEtMm: demand,
      actualEtMm: actual, stressed: storage + 1e-8 < threshold});
  }
  return { rows, stressDays: rows.filter(r => r.stressed).length, firstStress: rows.find(r => r.stressed)?.date ?? null,
    demandMm: rows.reduce((s, r) => s + r.potentialEtMm, 0), excessMm: rows.reduce((s, r) => s + r.lossMm, 0),
    rainMm: input.days.reduce((s, r) => s + r.rain!, 0) };
}

export type BalanceRow = {
  date: string;
  stage: string;
  storageBeforeMm: number;
  storageMm: number;
  capacityMm: number;
  thresholdMm: number;
  rainMm: number;
  irrigationMm: number;
  lossMm: number;
  potentialEtMm: number;
  actualEtMm: number;
  stressed: boolean;
};

export type Result = {
  rotation: Rotation;
  status: "viable" | "conditional" | "indeterminate";
  excluded: boolean;
  reasons: string[];
  compatible: boolean;
  stressDays: number | null;
  firstStress: BalanceRow | null;
  supplementalMm: number | null;
  coverageDays: number | null;
  frostDays: number | null;
  series: BalanceRow[];
};

export function compare(input: BalanceInput, delay: number): Result[] {
  const turns = moveTurn(input.turns, input.testTurnId, delay);
  const rainByDate = new Map<string, number>();
  for (const turn of turns) rainByDate.set(turn.date, (rainByDate.get(turn.date) ?? 0) + turn.grossMm * input.irrigationEfficiency);
  return input.rotations.map((rotation) => evaluateRotation(input, rotation, rainByDate));
}

function evaluateRotation(input: BalanceInput, rotation: Rotation, irrigation: Map<string, number>): Result {
  const { seasons } = rotation;
  const reasons = [...rotation.restrictions];
  const compatible = !((input.priority === "Producir forraje" && seasons.some(({ crop }) => crop.use !== "forage")) ||
    (input.priority === "Vender la cosecha" && seasons.every(({ crop }) => crop.use !== "grain")));
  if (!compatible) reasons.push("El destino de la cosecha requiere confirmación para la prioridad indicada.");

  let excluded = false;
  for (const [index, season] of seasons.entries()) {
    const duration = dayDistance(season.start, season.end) + 1;
    if (!Number.isFinite(duration) || duration < season.crop.minDays || duration > season.crop.maxDays ||
        (season.crop.seedMonths.length > 0 && !season.crop.seedMonths.includes(Number(season.start.slice(5, 7)))) || (index > 0 && season.start <= seasons[index - 1].end)) {
      reasons.push(`${season.crop.name}: la ventana, la duración o el orden no encajan con el calendario evaluado.`);
      excluded = true;
    }
  }
  const base: Result = { rotation, status: "indeterminate", excluded, reasons, compatible, stressDays: null, firstStress: null, supplementalMm: null, coverageDays: null, frostDays: null, series: [] };
  if (excluded) return { ...base, status: "conditional" };
  const horizonStart = input.days[0]?.date;
  const horizonEnd = input.days.at(-1)?.date;
  if (!horizonStart || !horizonEnd || seasons.some(({ start, end }) => start < horizonStart || end > horizonEnd) ||
      input.days.some((day, index) => index > 0 && dayDistance(input.days[index - 1].date, day.date) !== 1)) {
    return { ...base, reasons: [...reasons, "Falta una serie diaria continua que cubra las dos campañas."] };
  }
  const capacity = seasons.map(({ crop }) => rootCapacity(input.soil, crop.rootM));
  if (!capacity.length || capacity.some((value) => value === null)) {
    return { ...base, reasons: [...reasons, "Faltan capas de retención de agua hasta la profundidad efectiva de raíces."] };
  }

  let stored = capacity[0]! * input.initialFraction;
  let supplementalStorage = stored;
  const expansionFraction = input.expansionFraction ?? input.initialFraction;
  let previousCapacity = capacity[0]!;
  let supplementalMm = 0;
  let coverageDays = 0;
  let frostDays = 0;
  let frostComplete = seasons.every(s=>s.crop.frostC!==undefined);
  const series: BalanceRow[] = [];

  for (const day of input.days) {
    if (day.rain === null || day.et0 === null || !Number.isFinite(day.rain) || !Number.isFinite(day.et0) || day.rain < 0 || day.et0 < 0) {
      return { ...base, reasons: [...reasons, `Falta lluvia o ET₀ utilizable para ${day.date}.`] };
    }
    const index = seasons.findIndex(({ start, end }) => day.date >= start && day.date <= end);
    const season = seasons[index];
    const max = capacity[index] ?? previousCapacity;
    if (max !== previousCapacity) {
      const resize = (amount: number) => max > previousCapacity ? amount + (max - previousCapacity) * expansionFraction : amount * max / previousCapacity;
      stored = resize(stored);
      supplementalStorage = resize(supplementalStorage);
      previousCapacity = max;
    }
    const phase = season ? cropProgress(dayDistance(season.start, day.date), dayDistance(season.start, season.end) + 1, season.crop.kc)
      : { stage: "Entre campañas", kc: 0.25, covered: false };
    const demand = day.et0 * phase.kc;
    const p = season ? clamp(season.crop.p + 0.04 * (5 - demand), 0.1, 0.8) : 1;
    const threshold = max * (1 - p);
    const rain = day.rain * input.rainEfficiency;
    const water = irrigation.get(day.date) ?? 0;
    const before = stored;
    const available = Math.min(max, stored + rain + water);
    const loss = Math.max(0, stored + rain + water - max);
    const ks = threshold > 0 ? Math.min(1, available / threshold) : 1;
    const actualEt = Math.min(available, demand * ks);
    stored = available - actualEt;

    const availableWithSupplement = Math.min(max, supplementalStorage + rain + water);
    const need = season ? Math.max(0, demand + threshold - availableWithSupplement) : 0;
    supplementalMm += need;
    supplementalStorage = clamp(availableWithSupplement + need - demand, 0, max);

    const stressed = Boolean(season) && stored + 1e-8 < threshold;
    if (phase.covered) coverageDays++;
    if (season && day.tmin === null) frostComplete = false;
    if (season && day.tmin !== null && season.crop.frostC !== undefined && day.tmin <= season.crop.frostC) frostDays++;
    series.push({ date: day.date, stage: phase.stage, storageBeforeMm: before, storageMm: stored, capacityMm: max,
      thresholdMm: threshold, rainMm: rain, irrigationMm: water, lossMm: loss, potentialEtMm: demand, actualEtMm: actualEt, stressed });
  }
  if (frostDays > 0) reasons.push(`${frostDays} días alcanzan un umbral de frío de referencia en cultivo activo.`);
  if (!frostComplete) reasons.push('La evaluación del frío está incompleta: falta un umbral validado o temperaturas mínimas. No significa ausencia de heladas.');
  const stressDays = series.filter((day) => day.stressed).length;
  return { ...base, status: reasons.length ? "conditional" : "viable", reasons, stressDays,
    firstStress: series.find((day) => day.stressed) ?? null, supplementalMm, coverageDays, frostDays: frostComplete?frostDays:null, series };
}

export function preferred(results: Result[], priority: string): Result | undefined {
  const diversity=(r:Result)=>new Set(r.rotation.seasons.map(s=>s.crop.family??s.crop.name)).size;
  return results.filter((entry) => entry.compatible && !entry.excluded && entry.stressDays !== null)
    .sort((a, b) =>
      (priority === "Diversificar la producción" ? diversity(b)-diversity(a) : 0) ||
      (priority === "Usar menos agua" ? a.supplementalMm! - b.supplementalMm! || a.stressDays! - b.stressDays! :
        a.stressDays! - b.stressDays! || a.supplementalMm! - b.supplementalMm!) ||
      Number(a.status !== "viable") - Number(b.status !== "viable") ||
      b.coverageDays! - a.coverageDays!)[0];
}
