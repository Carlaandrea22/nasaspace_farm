import assert from "node:assert/strict";
import test from "node:test";
import { buildInspection, cropStage, summarizeWeather, toForecast } from "../src/features/operations/model.ts";

test("el pronóstico separa los días locales recientes y conserva cero y faltantes", () => {
  const response = {
    timezone: "America/La_Paz",
    daily_units: { precipitation_sum: "mm", et0_fao_evapotranspiration: "mm", temperature_2m_min: "°C" },
    daily: {
      time: ["2026-11-13", "2026-11-14", "2026-11-15"],
      precipitation_sum: [0, null, 12], et0_fao_evapotranspiration: [3, 4, 5], temperature_2m_min: [10, 9, 8],
    },
  };
  const forecast = toForecast(response, "2026-11-14T18:00:00Z", { "2026-11-13": 22 });
  assert.equal(forecast.recent.find(({ date }) => date === "2026-11-13").rain, 22);
  assert.equal(forecast.recent.find(({ date }) => date === "2026-11-13").source, "imerg-early");
  assert.deepEqual(forecast.recent.at(0), { date: "2026-11-11", rain: null, source: "missing" });
  assert.deepEqual(toForecast(response, "2026-11-14T18:00:00Z").recent.at(-1), { date: "2026-11-13", rain: 0, source: "modeled" });
  assert.equal(forecast.days[0].rain, null);
  assert.deepEqual(summarizeWeather(forecast.days), { rain: null, et0: 9, count: 2, rainCount: 1, et0Count: 2 });
  assert.throws(() => toForecast({ ...response, daily_units: { ...response.daily_units, precipitation_sum: "inch" } }, "2026-11-14T18:00:00Z"));
});

test("la etapa usa días calendario y requiere declaraciones comparables", () => {
  assert.equal(cropStage("2026-11-01", "", "2026-11-14"), "Etapa por confirmar");
  assert.equal(cropStage("2026-11-01", "2027-01-01", "2026-11-15"), "Desarrollo");
  assert.equal(cropStage("2026-11-01", "2026-11-13", "2026-11-14"), "Ciclo terminado según las fechas declaradas");
});

test("la ficha requiere lluvia cercana y coincidencia cartográfica GAMC", () => {
  const days = Array.from({ length: 8 }, (_, index) => ({ date: `2026-11-${14 + index}`, rain: index === 7 ? 60 : 0, et0: 4, minimum: 12 }));
  const forecast = { queriedAt: "2026-11-14T18:00:00Z", today: "2026-11-14", days, recent: [{ date: "2026-11-13", rain: 42, source: "modeled" }] };
  const territory = {
    source: "GAMC · Proyecto 04", queriedAt: "2026-11-14T18:00:00Z",
    district: { status: "unique", matches: [{ district: "D9", commune: "Itocta", label: "D9" }] },
    drainage: { status: "unique", matches: [{ label: "Zona de influencia" }] },
  };
  assert.equal(buildInspection(forecast, territory), null);
  forecast.days[0].rain = 31;
  assert.equal(buildInspection(forecast, { ...territory, drainage: { status: "no-match", matches: [] } }), null);
  assert.equal(buildInspection(forecast, { ...territory, queriedAt: "2026-11-13T18:00:00Z" }), null);
  assert.equal(buildInspection(forecast, territory).zone, "D9 · Itocta");
  assert.match(buildInspection(forecast, territory).text, /31 mm/);
  assert.match(buildInspection(forecast, territory).text, /hidráulic/);
});
