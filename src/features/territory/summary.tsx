import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { referenceCases, type ReferenceCase } from "./reference";
import { layerNames, type LayerLookup, type Territory } from "./types";

function lookupText(layer: LayerLookup) {
  if (layer.status === "unavailable") return "Servicio no disponible.";
  if (layer.status === "no-match") return "Sin coincidencia en esta consulta.";
  const values = layer.matches.map((match) => match.label).join("; ");
  return layer.status === "ambiguous" ? `Coincidencias múltiples: ${values}.` : values;
}

export function TerritorySummary({ reference, result }: { reference: ReferenceCase | null; result?: Territory }) {
  const selected = reference ? referenceCases[reference] : null;
  return (
    <section aria-labelledby="territory-title" className="grid gap-3 border-t border-line pt-5">
      <h2 id="territory-title" className="font-display text-3xl">Contexto territorial</h2>
      {selected && <p className="text-sm text-muted">
        Referencia del piloto: <a href={selected.source} className="underline underline-offset-2">{selected.label}</a>.
        {"coordinatesSource" in selected && <> <a href={selected.coordinatesSource} className="underline underline-offset-2">Fuente del punto</a>.</>}
        {" "}Consulta el punto para confirmar su coincidencia.
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
      ) : <p className="text-sm text-muted">Consulta el distrito, la comuna, el contexto periurbano y el drenaje del punto seleccionado.</p>}
      {result && result.drainage.status !== "unavailable" && (
        <Alert role="note">
          <AlertTitle className="text-sm">Drenaje cartografiado</AlertTitle>
          <AlertDescription>La capa describe el contexto territorial. Una estimación de desborde requiere datos hidráulicos del canal.</AlertDescription>
        </Alert>
      )}
    </section>
  );
}
