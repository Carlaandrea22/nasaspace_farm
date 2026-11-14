import type { Territory } from "../territory/types";

export const pilotCoordinates = { latitude: -17.42442, longitude: -66.18272 };

export const mapBounds: [[number, number], [number, number]] = [
  [-17.436, -66.198],
  [-17.413, -66.169],
];

export type Coordinates = typeof pilotCoordinates;
export type Parcel = Coordinates & { name: string; areaHa: number | null; territory?: Territory };

export const productionPriorities = ["Producir forraje", "Vender la cosecha", "Usar menos agua", "Diversificar la producción"] as const;
export type ProductionPriority = typeof productionPriorities[number];

export type CropWater = {
  firstCrop: string;
  firstPlanting: string;
  firstHarvest: string;
  secondCrop: string;
  secondPlanting: string;
  secondHarvest: string;
  priority: string;
  waterSource: string;
  turnDate: string;
  intervalDays: number | null;
  volumeM3: number | null;
  currentCrop?: string;
  currentPlanting?: string;
  harvestUse?: string;
  turnStatus?: string;
  flowLs?: number | null;
  durationMinutes?: number | null;
  scenarioVolumeM3?: number | null;
  parcelKey?: string;
};

export function locationKey(point: Coordinates | undefined) {
  return point ? [point.latitude.toFixed(5), point.longitude.toFixed(5)].join(",") : "";
}

export type PilotDraft = {
  id: string;
  version: 1;
  parcel?: Parcel;
  cropWater?: CropWater;
  cropWaterByParcel?: Record<string, CropWater>;
};

export function cropForParcel(draft: PilotDraft | undefined) {
  const key = locationKey(draft?.parcel);
  return draft?.cropWaterByParcel?.[key] ?? (draft?.cropWater?.parcelKey === key ? draft?.cropWater : undefined);
}

export function decimal(value: string) {
  const normalized = value.trim().replace(",", ".");
  return /^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized) ? Number(normalized) : NaN;
}

export function coordinates(latitude: string, longitude: string): Coordinates | null {
  const lat = decimal(latitude);
  const lon = decimal(longitude);
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { latitude: lat, longitude: lon } : null;
}

export function inMap({ latitude, longitude }: Coordinates) {
  const [[south, west], [north, east]] = mapBounds;
  return latitude >= south && latitude <= north && longitude >= west && longitude <= east;
}
