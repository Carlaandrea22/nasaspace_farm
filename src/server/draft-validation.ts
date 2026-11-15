import { z } from "zod";
import { waterCrops } from "../features/pilot/water-crops";

const text = z.string().max(160);
const positive = z.number().positive().nullable();
const parcelKey = z.string().max(24).regex(/^(?:-?\d{1,3}\.\d{5},-?\d{1,3}\.\d{5})?$/);
const territoryMatch = z.object({ district: text.nullable(), commune: text.nullable(), label: z.string().max(1000) });
const layer = z.object({
  status: z.enum(["unique", "ambiguous", "no-match", "unavailable"]),
  matches: z.array(territoryMatch).max(50),
});
const coordinates = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) });

const parcel = coordinates.extend({
  name: z.string().max(100),
  areaHa: positive,
  outline: z.array(coordinates).length(4).optional(),
  territory: z.object({
    source: z.literal("GAMC · Proyecto 04"), queriedAt: text,
    district: layer, periurban: layer, drainage: layer,
  }).optional(),
});

const cropWater = z.object({
  firstCrop: text, firstPlanting: text, firstHarvest: text,
  secondCrop: text, secondPlanting: text, secondHarvest: text,
  priority: text, waterSource: text, turnDate: text,
  intervalDays: z.number().int().positive().nullable(), volumeM3: positive,
  turnDepthMm: z.number().positive().max(500).nullable().optional(),
  currentCrop: text.optional(), currentPlanting: text.optional(), currentHarvest: text.optional(), harvestUse: text.optional(),
  turnStatus: text.optional(), flowLs: positive.optional(), durationMinutes: positive.optional(),
  scenarioVolumeM3: positive.optional(), parcelKey: parcelKey.optional(),
});

export const draftPatchSchema = z.object({ parcel: parcel.optional(), cropWater: cropWater.optional() });
const reportCrop = z.string().refine((name) => Object.hasOwn(waterCrops, name));
const optionalDate = z.union([z.iso.date(), z.literal("")]);
const newReportParcel = z.object({ name: z.string().trim().max(100), areaHa: positive }).optional();
const waterReportPatch = z.strictObject({
  reportWater: z.object({
    location: coordinates,
    crop: reportCrop,
    planting: z.iso.date(),
    harvest: z.iso.date(),
    turn: optionalDate,
    depthMm: z.number().positive().max(500).nullable(),
  }).refine(({ planting, harvest, turn, depthMm }) =>
    planting < harvest && (turn ? depthMm !== null && turn <= harvest : depthMm === null)),
  waterOptions: z.object({
    reviewed: z.boolean(), period: z.union([z.literal(7), z.literal(14)]), delayed: z.boolean(),
    pastTurn: optionalDate, pastDepth: z.number().min(0).max(500),
    initial: z.enum(["scenario", "modeled"]), fraction: z.number().min(0).max(1),
    rainEfficiency: z.number().min(0).max(1), irrigationEfficiency: z.number().min(0.01).max(1),
  }).optional(),
  newParcel: newReportParcel,
});
const rotationReportPatch = z.strictObject({
  reportRotation: z.object({
    location: coordinates,
    inputs: z.object({
      crop: reportCrop, harvest: z.iso.date(), planting: optionalDate.optional(),
      habitual: reportCrop.refine((name) => !waterCrops[name]?.cutting),
      priority: text, destination: text,
    }).refine(({ planting, harvest }) => !planting || planting <= harvest),
    seedCosts: z.record(reportCrop, z.string().max(24).regex(/^\d*(?:[.,]\d+)?$/)),
  }),
  newParcel: newReportParcel,
});
export const reportPatchSchema = z.union([waterReportPatch, rotationReportPatch]);
export const fullDraftSchema = draftPatchSchema.extend({
  id: z.uuid(),
  version: z.literal(1),
  cropWaterByParcel: z.record(parcelKey, cropWater).optional(),
});
