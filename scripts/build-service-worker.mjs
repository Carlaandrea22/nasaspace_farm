import { readFile, readdir, writeFile } from "node:fs/promises";

const buildId = (await readFile(".next/BUILD_ID", "utf8")).trim();
const staticFiles = await readdir(".next/static", { recursive: true, withFileTypes: true });
const buildAssets = staticFiles
  .filter((file) => file.isFile() && /\.(css|js|woff2)$/.test(file.name))
  .map((file) => `/_next/${file.parentPath.slice(".next/".length)}/${file.name}`)
  .sort();

const browserAssets = [
  "/manifest.webmanifest",
  "/icons/field-shift-180.png",
  "/icons/field-shift-192.png",
  "/icons/field-shift-512.png",
  "/images/valle-cochabamba.jpg",
  "/images/carla-valle.webp",
  "/images/carla-cultivos.jpg",
  "/images/parcela-paisaje.webp",
  "/images/parcela-tractor.webp",
  "/images/informe/avena.webp",
  "/images/informe/cebada.webp",
  "/images/informe/haba.webp",
  "/images/informe/maiz.webp",
  "/images/informe/creditos.html",
  "/maps/cochabamba-distritos.geojson",
  "/pilots/la-maica/contexto-osm.geojson",
  "/pilots/tunari/contexto-osm.geojson",
  ...(await readdir("public/images/field-scenes"))
    .filter((name) => name.endsWith(".webp"))
    .sort()
    .map((name) => `/images/field-scenes/${name}`),
];

const source = await readFile("src/lib/browser/service-worker.js", "utf8");
await writeFile(
  "public/sw.js",
  `const buildId = ${JSON.stringify(buildId)};\nconst assets = ${JSON.stringify([...browserAssets, ...buildAssets])};\n${source}`,
);
