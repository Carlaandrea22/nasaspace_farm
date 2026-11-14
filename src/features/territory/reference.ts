export const referenceCases = {
  "la-maica": {
    latitude: -17.42442,
    longitude: -66.18272,
    label: "La Maica · D9 / Itocta",
    district: "9",
    commune: "Itocta",
    source: "https://biblioteca.concejocbba.gob.bo/PUBLICACION/libro_guia_cos.pdf",
  },
  tunari: {
    latitude: -17.34161,
    longitude: -66.15458,
    label: "Tirani · D13 / Tunari",
    district: "13",
    commune: "Tunari",
    source: "https://biblioteca.concejocbba.gob.bo/LEY/LEY_1384_2023.pdf",
    coordinatesSource: "https://www.empoderar.gob.bo/public/document/68d536c4df1e7_10%20PUBLICACION%20ASOC%20DE%20PROD%20TIRANI%20-%20SUBPROY%20PRODUCTIVO%20-%20UOD%20CBBA.pdf",
  },
} as const;

export type ReferenceCase = keyof typeof referenceCases;

export function getReferenceCase(latitude: number, longitude: number): ReferenceCase | null {
  for (const key of Object.keys(referenceCases) as ReferenceCase[]) {
    const reference = referenceCases[key];
    if (latitude.toFixed(5) === reference.latitude.toFixed(5) &&
        longitude.toFixed(5) === reference.longitude.toFixed(5)) return key;
  }
  return null;
}
