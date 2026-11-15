import { copyFileSync } from "node:fs";

copyFileSync(
  new URL(import.meta.resolve("maplibre-gl/dist/maplibre-gl-worker.mjs")),
  new URL("../public/maplibre-worker.mjs", import.meta.url)
);
