import { z } from "zod";

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
  currentCrop: text.optional(), currentPlanting: text.optional(), harvestUse: text.optional(),
  turnStatus: text.optional(), flowLs: positive.optional(), durationMinutes: positive.optional(),
  scenarioVolumeM3: positive.optional(), parcelKey: parcelKey.optional(),
});

export const draftPatchSchema = z.object({ parcel: parcel.optional(), cropWater: cropWater.optional() });
export const fullDraftSchema = draftPatchSchema.extend({
  id: z.uuid(),
  version: z.literal(1),
  cropWaterByParcel: z.record(parcelKey, cropWater).optional(),
});
