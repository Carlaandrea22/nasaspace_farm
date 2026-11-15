import test from "node:test";
import assert from "node:assert/strict";
import { addDays, compare, et0, flowVolume, historicalRain, initialSoilWater, millimeters, moveTurn, rootCapacity } from "../src/domain/water-balance/model.ts";

test("converts irrigation and integrates the explored soil horizon", () => {
  assert.equal(millimeters(100, 2), 5);
  assert.equal(flowVolume(5, 80), 24);
  assert.equal(rootCapacity([{top: 0, bottom: 30, fc: .3, wp: .15}, {top: 30, bottom: 60, fc: .25, wp: .1}], .5), 75);
  assert.equal(rootCapacity([{top: 0, bottom: 30, fc: .3, wp: .15}], .5), null);
});

test("a five day delay changes only the selected irrigation date, across months", () => {
  const turns = [{id:"a", date:"2025-05-29", grossMm:45}, {id:"b", date:"2025-06-03", grossMm:20}];
  assert.deepEqual(moveTurn(turns,"a",5), [{...turns[0],date:"2025-06-03"},turns[1]]);
  assert.equal(turns[0].date,"2025-05-29");
  assert.equal(addDays("2024-02-28", 1),"2024-02-29");
});

test("Penman–Monteith gives a plausible daily ET0 and handles invalid inputs", () => {
  const day = {tmin:10,tmax:25,rh:55,wind:2,solar:20};
  assert.ok(Math.abs(et0("2025-04-20",day,-17.4,2560) - 4.31) < .35);
  assert.equal(et0("2025-04-20",{...day,solar:null},-17.4,2560), null);
});

const soil = [{top:0,bottom:100,fc:.3,wp:.15}];

test("SMAP uses reviewed root-zone moisture from the previous UTC day", () => {
  const sample = { date: "2024-12-31", surface: 0.27, root: 0.225, quality: "accepted" };
  assert.equal(initialSoilWater(soil, [sample], "2025-01-01", .72).fraction, 0.5);
  assert.equal(initialSoilWater(soil, [{ ...sample, quality: "suspect" }], "2025-01-01", .72).fraction, .72);
  assert.equal(initialSoilWater(soil, [sample], "2025-01-02", .72).fraction, .72);
  assert.equal(initialSoilWater(soil, [{ ...sample, root: 0.32 }], "2025-01-01", .72).fraction, 1);
});

test("IMERG Final takes precedence on valid days and falls back without inventing rain", () => {
  const rain = historicalRain("2025-01-01", "2025-01-03", { "2025-01-01": 0, "2025-01-02": null }, {
    "2025-01-01": { rain: 8 }, "2025-01-02": { rain: 4 },
  });
  assert.deepEqual(rain.map(({ rain, reference, source }) => [rain, reference, source]), [
    [0, 8, "IMERG Final"], [4, 4, "POWER"], [null, null, "Sin dato"],
  ]);
});

const crop = {name:"Cultivo", kc:[1,1,1], rootM:.4, p:.5, minDays:1, maxDays:100, seedMonths:[1], use:"forage"};
const season = {start:"2025-01-01",end:"2025-01-07",crop};
const input = {
  days: Array.from({length:7}, (_,i)=>({date:addDays(season.start,i), rain:0, et0:6, tmin:10})),
  soil, turns:[{id:"test",date:"2025-01-04",grossMm:35}], testTurnId:"test",
  rainEfficiency:1, irrigationEfficiency:1, initialFraction:1, priority:"Producir forraje",
  rotations:[{id:"A",seasons:[season],restrictions:[]}],
};

test("daily balance keeps storage bounded and reports stress changes", () => {
  const [planned] = compare(input,0);
  const [late] = compare(input,5);
  assert.equal(planned.stressDays,0);
  assert.equal(late.firstStress.date,"2025-01-05");
  assert.ok(late.supplementalMm > 0);
  assert.ok(late.series.every(d=>d.storageMm >= 0 && d.storageMm <= d.capacityMm));
  for (const row of planned.series) {
    assert.ok(Math.abs(row.storageBeforeMm + row.rainMm + row.irrigationMm - row.lossMm - row.actualEtMm - row.storageMm) < 1e-6);
  }
});

test("absence differs from zero, and incompatible calendars are excluded", () => {
  const [missing] = compare({...input, days:input.days.map((d,i)=>i===2 ? {...d,rain:null}:d)},0);
  assert.equal(missing.status,"indeterminate");
  assert.equal(missing.stressDays,null);
  const [incompatible] = compare({...input, rotations:[{id:"A",seasons:[{...season,crop:{...crop,seedMonths:[2]}}],restrictions:[]}]},0);
  assert.equal(incompatible.status,"conditional");
  assert.ok(incompatible.excluded);
});
