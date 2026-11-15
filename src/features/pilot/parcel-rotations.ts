import { assessTemperature } from "../../domain/climate/screening";
import {
  addDays, compare, dayDistance, et0, initialSoilWater, preferred,
  type Result, type Rotation, type SoilLayer,
} from "../../domain/water-balance/model";
import type { ParcelHistory } from "../../server/parcel-sources";
import { waterCrops, type WaterCrop } from "./water-crops";

export type RotationRequest = {
  crop: string;
  harvest: string;
  planting?: string;
  habitual: string;
  priority: string;
  destination: string;
};

type CropReference = { name: string; plantingDays?: number; temperature: number[] };
type Window = { start: string; end: string; estimatedCalendar: boolean };
export type PlantingAlternative = Window & { result: Result; habitual: boolean };

function sowingDates(afterHarvest: string) {
  const dates = [afterHarvest];
  for (let i = 0; i < 11; i++) {
    dates.push(addDays(dates.at(-1)!.slice(0, 7) + "-01", 32).slice(0, 7) + "-01");
  }
  return dates;
}

function plannedWindow(crop: WaterCrop, starts: string[], reference?: CropReference): Window | null {
  const duration = crop.duration || reference?.plantingDays;
  if (crop.cutting || !duration) return null;
  const start = starts.find((date) => !crop.seedMonths.length || crop.seedMonths.includes(Number(date.slice(5, 7))));
  return start ? { start, end: addDays(start, duration - 1), estimatedCalendar: !crop.seedMonths.length } : null;
}

function fitsDestination(crop: WaterCrop, priority: string, destination: string) {
  if (priority === "Producir forraje" || destination === "Forraje") return crop.use === "forage";
  if (destination === "Consumo" || destination === "Semilla") return crop.use === "grain";
  return true;
}

function replayDate(date: string, yearOffset: number) {
  const year = Number(date.slice(0, 4)) + yearOffset;
  const projected = String(year) + date.slice(4);
  const instant = new Date(projected + "T00:00:00Z");
  return Number.isFinite(instant.getTime()) && instant.toISOString().slice(0, 10) === projected
    ? projected : null;
}

export function planParcelRotations(
  request: RotationRequest, history: ParcelHistory, soil: SoilLayer[], latitude: number, references: readonly CropReference[],
) {
  const current = waterCrops[request.crop];
  const habitual = waterCrops[request.habitual];
  if (!current || !habitual) return null;
  const byName = new Map(references.map((reference) => [reference.name, reference]));
  const currentDays = request.planting ? dayDistance(request.planting, request.harvest) + 1
    : current.duration || byName.get(current.name)?.plantingDays;
  if (!currentDays || currentDays < current.minDays || currentDays > current.maxDays) return null;
  const firstPlanting = addDays(request.harvest, 1 - currentDays);
  const starts = sowingDates(addDays(request.harvest, 1));
  const candidates = [habitual, ...Object.values(waterCrops).filter(({ name }) => name !== habitual.name && name !== current.name)]
    .flatMap((crop) => {
      const reference = byName.get(crop.name);
      const window = plannedWindow(crop, starts, reference);
      return window ? [{ crop, reference, window, habitual: crop.name === habitual.name }] : [];
    });
  if (!candidates[0]?.habitual || candidates.length < 3) return null;
  const weather = history.days.map((day) => ({ ...day, et0: et0(day.date, day, latitude, history.elevation) }));
  const requestedYear = Number(request.harvest.slice(0, 4));
  for (let year = Number(history.to.slice(0, 4)); year >= Number(history.from.slice(0, 4)); year--) {
    const offset = year - requestedYear;
    const from = replayDate(firstPlanting, offset);
    const harvest = replayDate(request.harvest, offset);
    if (!from || !harvest || from < history.from) continue;
    const plans = candidates.flatMap((candidate) => {
      const { crop, reference, window, habitual } = candidate;
      const start = replayDate(window.start, offset);
      const end = start ? addDays(start, dayDistance(window.start, window.end)) : null;
      if (!start || !end || end > history.to) return [];
      const days = weather.filter(({ date }) => date >= start && date <= end);
      const temperatures = days.flatMap(({ tmean }) => tmean === null ? [] : [tmean]);
      const thermal = reference && days.length && temperatures.length === days.length
        ? assessTemperature(temperatures, reference.temperature) : null;
      const unsuitable = thermal?.category === "unsuitable" ||
        (window.estimatedCalendar && (!thermal || days.some(({ tmin }) => tmin === null || tmin <= 0)));
      if (unsuitable && !habitual) return [];
      const destination = fitsDestination(crop, request.priority, request.destination);
      const restrictions = [
        ...(!destination ? ["El destino indicado no es el uso de referencia de este cultivo."] : []),
        ...(unsuitable ? ["No se pudo confirmar la aptitud térmica de la rotación habitual en este periodo."] : []),
      ];
      const rotation: Rotation = {
        id: crop.name,
        seasons: [
          { crop: { ...current, seedMonths: [] }, start: from, end: harvest },
          { crop, start, end },
        ],
        restrictions,
      };
      return [{ ...candidate, rotation, compatible: destination && !unsuitable }];
    });
    if (!plans[0]?.habitual || plans.length < 3) continue;
    const to = plans.reduce((last, plan) => {
      const end = plan.rotation.seasons[1].end;
      return end > last ? end : last;
    }, harvest);
    const days = weather.filter(({ date }) => date >= from && date <= to);
    if (days.length !== dayDistance(from, to) + 1) continue;
    const moisture = history.smap ? initialSoilWater(soil, history.smap.observations, from, .5) : null;
    const results = compare({
      days, soil, turns: [], testTurnId: "", rainEfficiency: .8, irrigationEfficiency: .6,
      initialFraction: moisture?.fraction ?? .5, priority: "", rotations: plans.map(({ rotation }) => rotation),
    }, 0);
    const options = plans.flatMap(({ window, habitual, compatible }, index): PlantingAlternative[] =>
      results[index].supplementalMm === null ? [] : [{ ...window, habitual, result: { ...results[index], compatible } }]);
    if (!options[0]?.habitual || options.length < 3) continue;
    const alternatives = options.slice(1);
    const shortlisted = [options[0]];
    while (shortlisted.length < 3) {
      const remaining = alternatives.filter((option) => !shortlisted.includes(option));
      const best = preferred(remaining.map(({ result }) => result), request.priority);
      shortlisted.push(remaining.find(({ result }) => result === best) ?? remaining[0]);
    }
    return {
      options: shortlisted, from, to, usedSmap: moisture?.estimate != null,
      selected: preferred(shortlisted.map(({ result }) => result), request.priority),
      usedDeclaredPlanting: Boolean(request.planting),
    };
  }
  return null;
}
