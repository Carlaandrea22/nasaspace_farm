export const layerNames = {
  district: "Límite Distritos",
  periurban: "Periurbanos",
  drainage: "Drenaje e Influencia",
} as const;

export type TerritoryLayer = keyof typeof layerNames;
export type TerritoryMatch = { district: string | null; commune: string | null; label: string };
export type LayerLookup = {
  status: "unique" | "ambiguous" | "no-match" | "unavailable";
  matches: TerritoryMatch[];
};
export type Territory = Record<TerritoryLayer, LayerLookup> & {
  source: "GAMC · Proyecto 04";
  queriedAt: string;
};
