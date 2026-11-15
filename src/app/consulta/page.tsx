import Link from "next/link";
import { coordinates, decimal } from "../../features/pilot/draft";
import { ParcelReport } from "../../features/pilot/parcel-report";

export const metadata = { title: "Informe de consulta" };

export default async function ConsultaPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const value = (key: string) => typeof params[key] === "string" ? params[key] : "";
  const point = coordinates(value("lat"), value("lon"));
  if (!point) return <section className="panel">
    <h1>Selecciona una ubicación</h1>
    <p>Marca un punto o dibuja una parcela para abrir su informe.</p>
    <Link href="/" className="mt-3 inline-block underline">Volver al mapa</Link>
  </section>;
  const area = decimal(value("area"));
  const view = new URLSearchParams();
  for (const key of ["bbox", "width", "height"]) {
    if (value(key)) view.set(key, value(key));
  }
  return <ParcelReport point={point} parcel={value("tipo") === "parcela"} area={area > 0 ? area : null} view={view.toString()} />;
}
