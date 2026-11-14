import assert from "node:assert/strict";
import { test } from "node:test";
import { featurePixel, gamcUrl, parseFeatureInfo, projectMercator, readMapView } from "../src/server/gamc.ts";

test("feature lookup accepts attribute-only responses and distinguishes the layers' statuses", () => {
  const feature = { type: "Feature", properties: { Distrito: "D13", Comuna: "TUNARI" } };
  const result = (features) => parseFeatureInfo({ type: "FeatureCollection", features }, "district");
  assert.deepEqual(result([feature]), { status: "unique", matches: [{ district: "D13", commune: "TUNARI", label: "D13 · TUNARI" }] });
  assert.equal(result([feature, feature]).status, "ambiguous");
  assert.deepEqual(result([]), { status: "no-match", matches: [] });
  assert.equal(result([{ type: "Feature" }]).status, "unavailable");
  assert.equal(parseFeatureInfo({}, "district").status, "unavailable");
});

test("the visible viewport is projected in meters and queries the appropriate WMS pixel", () => {
  const [x, y] = projectMercator(-17.42442, -66.18272);
  const view = readMapView(new URLSearchParams({ bbox: [x - 500, y - 500, x + 500, y + 500].join(","), width: "256", height: "512" }));
  const pixel = featurePixel(view, -17.42442, -66.18272);
  assert.deepEqual(pixel, { x: 128, y: 256 });
  assert.equal(featurePixel(view, -17.3, -66.1), null);
  assert.equal(readMapView(new URLSearchParams({ bbox: "0,0,1,1", width: "2000", height: "256" })), null);
  const url = gamcUrl("example-secret", "district", "GetFeatureInfo", view, pixel);
  assert.equal(url.origin, "https://serviciosgamc.cochabamba.bo");
  assert.equal(url.searchParams.get("SRS"), "EPSG:3857");
  assert.equal(url.searchParams.get("X"), "128");
  assert.equal(url.searchParams.get("Y"), "256");
  assert.equal(gamcUrl("example-secret", "drainage", "GetLegendGraphic").searchParams.get("VERSION"), "1.0.0");
});
