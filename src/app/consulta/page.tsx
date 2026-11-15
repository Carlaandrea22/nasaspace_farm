import { Suspense } from "react";
import { ParcelReportQuery } from "../../features/pilot/parcel-report";

export const metadata = { title: "Informe de consulta" };

export default function ConsultaPage() {
  return <Suspense fallback={<p role="status" className="text-muted">Abriendo el informe…</p>}>
    <ParcelReportQuery />
  </Suspense>;
}
