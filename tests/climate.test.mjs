import assert from "node:assert/strict";
import test from "node:test";
import { hasEnsoCoverage, relevantEnso } from "../src/domain/climate/enso.ts";
import { assessTemperature, rankCrops, summarizeClimate } from "../src/domain/climate/screening.ts";
import { heatSignals } from "../src/features/operations/model.ts";

const dayMs = 86_400_000;
const profile = { code: "1232", name: "Cebada", species: "Hordeum vulgare", use: "forraje", days: 90, temperature: [2, 15, 20, 40], rainfall: [200, 500, 1000, 2000], optimalPh: [6.5, 7.5] };

test("EcoCrop usa las ocurrencias completas del mes y distingue lluvia ausente", () => {
  const start = Date.UTC(2020, 0, 1);
  const days = Array.from({ length: 1827 }, (_, index) => {
    const date = new Date(start + index * dayMs).toISOString().slice(0, 10);
    const hot = date.slice(5, 7) <= "03";
    return { date, temperature: hot ? 18 : 8, minimum: hot ? 1 : 0, maximum: 25, humidity: 50, rain: 2 };
  });
  const good = summarizeClimate(days, [profile]);
  assert.equal(good.crops[0][0].assessment.category, "recommended");
  assert.equal(good.crops[7][0].assessment.category, "unsuitable");
  assert.equal(good.rainYears, 5);
  assert.equal(good.crops[0][0].optimalRain, true);
  const missing = summarizeClimate(days.map((day) => day.date.endsWith("-01-01") ? { ...day, rain: null } : day), [profile]);
  assert.equal(missing.rainYears, 0);
  assert.equal(missing.crops[0][0].optimalRain, null);
  assert.equal(missing.crops[0][0].assessment.category, "recommended");
  assert.equal(missing.months[0].rain, null);
});

test("la regla de Zama distingue extremos térmicos y ordena por destino y pH", () => {
  const limits = [5, 18, 28, 32];
  const base = Array(29).fill(19);
  assert.equal(assessTemperature([...base, 19], limits).category, "recommended");
  assert.equal(assessTemperature([...base, 4], limits).category, "conditional");
  assert.equal(assessTemperature([...base, 0], limits).category, "unsuitable");
  assert.equal(assessTemperature([], limits), null);
  const hay = { ...profile, assessment: assessTemperature(base, limits), optimalRain: null, samples: 5 };
  const grain = { ...hay, use: "consumo", name: "Haba", optimalPh: [5, 6] };
  assert.equal(rankCrops([hay, grain], "consumo", 7)[0].name, "Haba");
  assert.equal(rankCrops([grain, hay], "", 7)[0].name, "Cebada");
});

test("ENSO cruza año y distingue una campaña fuera del horizonte", () => {
  const outlook = { issued: "2026-11", seasons: [
    { code: "OND", center: "2026-11", nino: 67, neutral: 30, nina: 3 },
    { code: "NDJ", center: "2026-12", nino: 90, neutral: 8, nina: 2 },
    { code: "DJF", center: "2027-01", nino: 5, neutral: 25, nina: 70 },
  ] };
  assert.deepEqual(relevantEnso(outlook, "2026-10-01", 31), []);
  assert.deepEqual(relevantEnso(outlook, "2027-01", 70).map(({ code, phase }) => [code, phase]), [["NDJ", "El Niño"], ["DJF", "La Niña"]]);
  assert.equal(hasEnsoCoverage(outlook, "2027-05", 1), false);
});

test("el aviso de calor usa la máxima a tres días y omite datos ausentes", () => {
  const forecast = { today: "2026-11-14", queriedAt: "", recent: [], days: [
    { date: "2026-11-14", maximum: 31.9 },
    { date: "2026-11-15", maximum: 32 },
    { date: "2026-11-16", maximum: null },
    { date: "2026-11-17", maximum: 40 },
  ] };
  assert.deepEqual(heatSignals(forecast).map(({ date }) => date), ["2026-11-15"]);
});
