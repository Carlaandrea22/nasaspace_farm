export const ensoSource = "https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso/roni/probabilities/";
export const ensoThreshold = 70;
export type EnsoSeason = { code: string; center: string; nina: number; neutral: number; nino: number };
export type EnsoOutlook = { issued: string; seasons: EnsoSeason[] };

const monthStart = (month: string) => Date.parse(`${month.slice(0, 7)}-01T00:00:00Z`);

function overlapsEnsoSeason(season: EnsoSeason, from: number, to: number) {
  const [year, month] = season.center.split("-").map(Number);
  return Date.UTC(year, month - 2, 1) < to && Date.UTC(year, month + 1, 1) > from;
}

export function hasEnsoCoverage(outlook: EnsoOutlook, start: string, days: number) {
  const from = start.length === 7 ? monthStart(start) : Date.parse(start);
  return outlook.seasons.some((season) => overlapsEnsoSeason(season, from, from + days * 86_400_000));
}

export function relevantEnso(outlook: EnsoOutlook, start: string, days: number) {
  const from = start.length === 7 ? monthStart(start) : Date.parse(start);
  const to = from + days * 86_400_000;
  if (!Number.isFinite(from) || days <= 0) return [];
  return outlook.seasons.flatMap((season) => {
    const probability = Math.max(season.nino, season.nina);
    if (probability < ensoThreshold || !overlapsEnsoSeason(season, from, to)) return [];
    return [{ ...season, probability, phase: season.nino > season.nina ? "El Niño" : "La Niña" }];
  });
}
