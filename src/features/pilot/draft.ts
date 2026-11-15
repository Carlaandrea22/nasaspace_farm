import type { Territory } from "../territory/types";

export const pilotCoordinates = { latitude: -17.42442, longitude: -66.18272 };

export const mapBounds: [[number, number], [number, number]] = [
  [-17.436, -66.198],
  [-17.413, -66.169],
];

export type Coordinates = typeof pilotCoordinates;
export type Parcel = Coordinates & { name: string; areaHa: number | null; outline?: Coordinates[]; territory?: Territory };

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
  turnDepthMm?: number | null;
  intervalDays: number | null;
  volumeM3: number | null;
  currentCrop?: string;
  currentPlanting?: string;
  currentHarvest?: string;
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

export type DraftPatch = Pick<PilotDraft, "parcel" | "cropWater">;

export type ReportWater = {
  location: Coordinates;
  crop: string;
  planting: string;
  harvest: string;
  turn: string;
  depthMm: number | null;
};

export type ReportWaterSave = { reportWater: ReportWater; newParcel?: Pick<Parcel, "name" | "areaHa"> };

export function cropWaterFromReport(previous: CropWater | undefined, parcel: Parcel, report: ReportWater): CropWater {
  return {
    firstCrop: "", firstPlanting: "", firstHarvest: "",
    secondCrop: "", secondPlanting: "", secondHarvest: "",
    priority: "", waterSource: "", intervalDays: null,
    ...previous,
    currentCrop: report.crop,
    currentPlanting: report.planting,
    currentHarvest: report.harvest,
    turnDate: report.turn,
    turnDepthMm: report.depthMm,
    volumeM3: report.depthMm !== null && parcel.areaHa
      ? report.depthMm * parcel.areaHa * 10
      : null,
    turnStatus: report.turn
      ? previous?.turnDate === report.turn && previous.turnStatus === "Confirmado" ? "Confirmado" : "Previsto"
      : "",
    parcelKey: locationKey(parcel),
  };
}

export function applyDraftPatch(draft: PilotDraft, patch: DraftPatch): PilotDraft {
  const previous = draft.cropWater;
  const byParcel = draft.cropWaterByParcel ?? (previous?.parcelKey !== undefined ? { [previous.parcelKey]: previous } : {});
  const cropWater = patch.cropWater;
  const updatedByParcel = cropWater?.parcelKey !== undefined ? { ...byParcel, [cropWater.parcelKey]: cropWater } : byParcel;
  return { ...draft, ...patch, cropWaterByParcel: updatedByParcel };
}

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
