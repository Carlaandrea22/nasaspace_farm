import { ensoSource, type EnsoOutlook, type EnsoSeason } from "../domain/climate/enso";

const names = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const codes = ["DJF", "JFM", "FMA", "MAM", "AMJ", "MJJ", "JJA", "JAS", "ASO", "SON", "OND", "NDJ"];
const isoMonth = (date: Date) => date.toISOString().slice(0, 7);

export function parseEnso(html: string, now = new Date()): EnsoOutlook {
  const issue = html.match(/<h2[^>]*>\s*Issued\s+([a-z]+)\s+(\d{4})\s*<\/h2>/i);
  const month = names.findIndex((name) => name.toLowerCase() === issue?.[1].toLowerCase());
  const year = Number(issue?.[2]);
  const table = html.match(/<table\b[^>]*\bid="probabilities-table"[^>]*>([\s\S]*?)<\/table>/i)?.[1];
  const headings = table?.match(/<tr[^>]*class="cell-headings"[^>]*>([\s\S]*?)<\/tr>/i)?.[1]
    .replaceAll(/&ntilde;|ñ/g, "n").replaceAll(/<[^>]+>/g, " ").replaceAll(/\s+/g, " ").trim();
  if (month < 0 || !Number.isInteger(year) || !table || headings !== "Season La Nina Neutral El Nino") {
    throw new Error("Cambió el formato del boletín CPC.");
  }
  const issueDate = new Date(Date.UTC(year, month, 1));
  const age = now.getUTCFullYear() * 12 + now.getUTCMonth() - (year * 12 + month);
  if (age < 0 || age > 2) throw new Error("Boletín CPC fuera de vigencia.");

  const seasons: EnsoSeason[] = [];
  let previous = -Infinity;
  for (const row of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const code = row[1].match(/<abbr[^>]*>\s*([A-Z]{3})\b/)?.[1];
    const center = codes.indexOf(code ?? "");
    const probabilities = [...row[1].matchAll(/<td[^>]*>\s*(\d{1,3})\s*<\/td>/gi)].map((cell) => Number(cell[1]));
    if (!code && !probabilities.length) continue;
    if (!code || center < 0 || probabilities.length !== 3 || probabilities.some((value) => value > 100) ||
        Math.abs(probabilities.reduce((sum, value) => sum + value, 0) - 100) > 1) {
      throw new Error("Probabilidades CPC inválidas.");
    }
    const offset = seasons.length ? previous + 1 : ((center - month + 13) % 12) - 1;
    const date = new Date(Date.UTC(year, month + offset, 1));
    if (date.getUTCMonth() !== center || !seasons.length && Math.abs(offset) > 1) throw new Error("Trimestres CPC inválidos.");
    const [nina, neutral, nino] = probabilities;
    seasons.push({ code, center: isoMonth(date), nina, neutral, nino });
    previous = offset;
  }
  if (seasons.length < 3 || seasons.length > 12) throw new Error("Horizonte CPC incompleto.");
  return { issued: isoMonth(issueDate), seasons };
}

export async function readEnso() {
  const response = await fetch(ensoSource, { next: { revalidate: 21_600 }, signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error("Boletín CPC no disponible.");
  return parseEnso(await response.text());
}
