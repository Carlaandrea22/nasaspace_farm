export type ClimateDay = {
  date: string;
  temperature: number | null;
  minimum: number | null;
  maximum: number | null;
  humidity: number | null;
  rain: number | null;
};

export type CropUse = "forraje" | "consumo";
export type CropProfile = {
  code: string;
  name: string;
  species: string;
  use: CropUse;
  days: number;
  cycleRange: number[];
  temperature: number[];
  rainfall: number[];
  optimalPh: number[];
};

type TemperatureCategory = "recommended" | "conditional" | "unsuitable";
export type TemperatureAssessment = {
  category: TemperatureCategory;
  observations: number;
  optimal: number;
  outside: number;
};

export type CropScreen = Pick<CropProfile, "code" | "name" | "species" | "use" | "days" | "cycleRange" | "temperature" | "optimalPh"> & {
  assessment: TemperatureAssessment | null;
  optimalRain: boolean | null;
  samples: number;
  favorableCycles: number;
  conditionalCycles: number;
};

export type ClimateProfile = {
  point: { latitude: number; longitude: number };
  queriedAt: string;
  from: string;
  to: string;
  annualRain: number | null;
  rainYears: number;
  months: { month: number; temperature: number | null; minimum: number | null; maximum: number | null; humidity: number | null; rain: number | null }[];
  crops: CropScreen[][];
};

export const powerSource = "https://power.larc.nasa.gov/docs/services/api/temporal/daily/";
export const ecocropSource = "https://www.fao.org/geospatial/data-and-tools/data-portals/ecocrop/en";

const dayMs = 86_400_000;
const round = (value: number) => Math.round(value * 10) / 10;
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const mean = (values: number[]) => sum(values) / values.length;
const adequate = (values: number[]) => values.length ? round(mean(values)) : null;

function validValues(days: ClimateDay[], metric: keyof Omit<ClimateDay, "date">) {
  return days.flatMap((day) => day[metric] === null ? [] : [day[metric]]);
}

// Port of assess_temperature from Zama's fieldshift.py (746c031).
export function assessTemperature(values: number[], [minimum, low, high, maximum]: number[]): TemperatureAssessment | null {
  if (!values.length) return null;
  const observations = values.length;
  const optimal = values.filter((value) => value >= low && value <= high).length;
  const outside = values.filter((value) => value < minimum || value > maximum).length;
  const averageGap = mean(values.map((value) => Math.max(low - value, value - high, 0)));
  const largestExcess = Math.max(...values.map((value) => Math.max(minimum - value, value - maximum, 0)));
  const category = outside === 0 && optimal > observations / 2 ? "recommended"
    : outside <= observations * 0.1 && largestExcess <= 2 && averageGap <= 2 ? "conditional"
    : "unsuitable";
  return { category, observations, optimal, outside };
}

const categoryOrder = { recommended: 0, conditional: 1, unsuitable: 2 };
export function rankCrops(crops: CropScreen[], use: CropUse | "", ph: number | null) {
  const candidates = crops.map((crop) => ({
    ...crop,
    eligible: !use || crop.use === use,
    phMatch: ph === null ? null : ph >= crop.optimalPh[0] && ph <= crop.optimalPh[1],
  }));
  function order(a: typeof candidates[number], b: typeof a) {
    return Number(b.eligible) - Number(a.eligible) ||
      (a.assessment ? categoryOrder[a.assessment.category] : 3) - (b.assessment ? categoryOrder[b.assessment.category] : 3) ||
      (b.samples ? b.favorableCycles / b.samples : 0) - (a.samples ? a.favorableCycles / a.samples : 0) ||
      (a.assessment ? a.assessment.outside / a.assessment.observations : 1) -
        (b.assessment ? b.assessment.outside / b.assessment.observations : 1) ||
      (b.assessment ? b.assessment.optimal / b.assessment.observations : 0) -
        (a.assessment ? a.assessment.optimal / a.assessment.observations : 0) ||
      Number(a.phMatch === false) - Number(b.phMatch === false);
  }
  return candidates.sort(order);
}

export function summarizeClimate(days: ClimateDay[], profiles: CropProfile[]) {
  const years = new Map<number, ClimateDay[]>();
  for (const day of days) {
    const year = Number(day.date.slice(0, 4));
    const group = years.get(year) ?? [];
    group.push(day);
    years.set(year, group);
  }

  const annualTotals: number[] = [];
  for (const [year, group] of years) {
    const expected = (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / dayMs;
    const rain = validValues(group, "rain");
    if (rain.length === expected) annualTotals.push(sum(rain));
  }
  const annualRain = adequate(annualTotals);
  const monthly = Array.from({ length: 12 }, (_, month) => {
    const series = Array.from(years, ([year, group]) => ({
      days: group.filter((day) => Number(day.date.slice(5, 7)) === month + 1),
      expected: new Date(Date.UTC(year, month + 1, 0)).getUTCDate(),
    }));
    function annualSamples(metric: keyof Omit<ClimateDay, "date">) {
      return series.flatMap(({ days, expected }) => {
        const values = validValues(days, metric);
        return values.length === expected ? [values] : [];
      });
    }
    const temperature = annualSamples("temperature");
    return {
      summary: {
        month: month + 1,
        temperature: adequate(temperature.flat()),
        minimum: adequate(annualSamples("minimum").flat()),
        maximum: adequate(annualSamples("maximum").flat()),
        humidity: adequate(annualSamples("humidity").flat()),
        rain: adequate(annualSamples("rain").map(sum)),
      },
    };
  });

  const temperatureByDate = new Map(days.map((day) => [day.date, day.temperature]));
  const crops = monthly.map((_, month) => profiles.map((profile): CropScreen => {
    const cycles = [];
    for (const year of years.keys()) {
      const start = Date.UTC(year, month, 1);
      const temperatures = [];
      for (let day = 0; day < profile.days; day++) {
        const date = new Date(start + day * dayMs).toISOString().slice(0, 10);
        const value = temperatureByDate.get(date);
        if (value == null) break;
        temperatures.push(value);
      }
      if (temperatures.length !== profile.days) continue;
      const cycle = assessTemperature(temperatures, profile.temperature);
      if (cycle) cycles.push(cycle);
    }
    const samples = cycles.length;
    const favorableCycles = cycles.filter(({ category }) => category === "recommended").length;
    const conditionalCycles = cycles.filter(({ category }) => category === "conditional").length;
    const category = favorableCycles > samples / 2 ? "recommended"
      : favorableCycles + conditionalCycles > samples / 2 ? "conditional" : "unsuitable";
    return {
      code: profile.code, name: profile.name, species: profile.species, use: profile.use,
      days: profile.days, cycleRange: profile.cycleRange, temperature: profile.temperature,
      optimalPh: profile.optimalPh, samples, favorableCycles, conditionalCycles,
      assessment: samples < 3 ? null : {
        category, observations: samples * profile.days,
        optimal: sum(cycles.map((cycle) => cycle.optimal)),
        outside: sum(cycles.map((cycle) => cycle.outside)),
      },
      optimalRain: annualRain === null ? null : annualRain >= profile.rainfall[1] && annualRain <= profile.rainfall[2],
    };
  }));

  return { annualRain, rainYears: annualTotals.length, months: monthly.map(({ summary }) => summary), crops };
}
