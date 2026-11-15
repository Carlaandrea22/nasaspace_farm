import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import { addDays } from "../src/domain/water-balance/model.ts";

const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith(".") && !specifier.endsWith(".ts")) return next(specifier + ".ts", context);
    return next(specifier, context);
  },
});
const { planParcelRotations } = await import("../src/features/pilot/parcel-rotations.ts");
hooks.deregister();

const request = {
  crop: "Maíz forrajero", harvest: "2027-01-31", habitual: "Avena forrajera",
  priority: "Usar menos agua", destination: "",
};
const history = {
  from: "2023-01-01", to: "2025-12-31", elevation: 2560, smap: null,
  days: Array.from({ length: 1096 }, (_, index) => ({
    date: addDays("2023-01-01", index), rain: 2, tmean: 18, tmin: 10, tmax: 24, rh: 60, wind: 2, solar: 18,
  })),
};
const soil = [{ top: 0, bottom: 100, fc: .33, wp: .15 }];

test("compara la rotación habitual y dos alternativas de la misma parcela con el mismo horizonte", () => {
  const plan = planParcelRotations(request, history, soil, -17.42, []);
  assert.equal(plan.options.length, 3);
  assert.equal(plan.options[0].habitual, true);
  assert.equal(plan.options[0].result.rotation.seasons.at(-1).crop.name, "Avena forrajera");
  assert.ok(plan.options.every(({ result }) => result.rotation.seasons[0].crop.name === "Maíz forrajero"));
  assert.ok(plan.options.every(({ result }) => result.series[0].date === plan.from && result.series.at(-1).date === plan.to));
  assert.equal(new Set(plan.options.map(({ result }) => result.rotation.id)).size, 3);
  assert.ok(plan.selected);
});

test("respeta el destino de forraje y diferencia falta de clima de cero milímetros", () => {
  const forage = planParcelRotations({ ...request, destination: "Forraje" }, history, soil, -17.42, []);
  assert.equal(forage.selected.rotation.seasons.at(-1).crop.use, "forage");
  assert.ok(forage.options.some(({ result }) => !result.compatible));
  const missing = planParcelRotations(request, { ...history, days: history.days.map(day => ({ ...day, rain: null })) }, soil, -17.42, []);
  assert.equal(missing, null);
});
