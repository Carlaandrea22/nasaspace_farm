import type { ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { referenceCases, type ReferenceCase } from "./reference";
import { layerNames, type LayerLookup, type Territory } from "./types";

function lookupText(layer: LayerLookup) {
  if (layer.status === "unavailable") return "Servicio no disponible.";
  if (layer.status === "no-match") return "Sin coincidencia en esta consulta.";
  const values = layer.matches.map((match) => match.label).join("; ");
  return layer.status === "ambiguous" ? `Coincidencias múltiples: ${values}.` : values;
}

export function TerritorySummary({ reference, result, children }: { reference: ReferenceCase | null; result?: Territory; children?: ReactNode }) {
  const selected = reference ? referenceCases[reference] : null;
  return (
    <section aria-labelledby="territory-title" className="panel grid gap-3">
      <h2 id="territory-title" className="text-xl font-bold">Contexto territorial</h2>
      <p className="text-sm text-muted">Las capas del Gobierno Autónomo Municipal de Cochabamba (GAMC) permiten verificar el distrito, la comuna, la zona periurbana y el drenaje cartografiado de este punto.</p>
      {selected && <p className="text-sm text-muted">
        Referencia del piloto: <a href={selected.source} className="underline underline-offset-2">{selected.label}</a>.
        {"coordinatesSource" in selected && <> <a href={selected.coordinatesSource} className="underline underline-offset-2">Fuente del punto</a>.</>}
      </p>}
      {result ? (
        <>
          <dl className="grid gap-2 text-sm sm:grid-cols-3">
            {Object.entries(layerNames).map(([name, label]) => (
              <div key={name} className="border-l border-line pl-3">
                <dt className="font-semibold">{label}</dt>
                <dd className="text-muted">{lookupText(result[name as keyof typeof layerNames])}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-muted">
            <a className="underline underline-offset-2" href="https://recursosgamc.cochabamba.bo/api-doc">{result.source}</a>
            {" · "}{new Intl.DateTimeFormat("es-BO", { dateStyle: "medium", timeZone: "America/La_Paz" }).format(new Date(result.queriedAt))}
          </p>
        </>
      ) : null}
      {result && result.drainage.status !== "unavailable" && (
        <Alert role="note">
          <AlertTitle className="text-sm">Drenaje cartografiado</AlertTitle>
          <AlertDescription>La capa describe el contexto territorial. Una estimación de desborde requiere datos hidráulicos del canal.</AlertDescription>
        </Alert>
      )}
      {children}
    </section>
  );
}
