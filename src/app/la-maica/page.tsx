import type { Metadata } from "next";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";

export const metadata: Metadata = { title: "Piloto La Maica" };

const rotations = [
  { crop: "Avena forrajera", purpose: "Referencia provisional de forraje" },
  { crop: "Cebada forrajera", purpose: "Alternativa de forraje" },
  { crop: "Haba", purpose: "Alternativa de diversificación" },
];

export default function LaMaicaPage() {
  return (
    <article className="pilot">
      <Button asChild variant="secondary">
        {/* A document navigation uses the cached page when offline. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/"><span aria-hidden="true">←</span> Volver al inicio</a>
      </Button>
      <div className="pilot-overview">
        <div>
          <p className="location">D9 · Itocta, Cochabamba</p>
          <h1>La Maica</h1>
          <p className="intro">
            El caso plantea mover un turno de riego cinco días en la segunda
            campaña y comparar las rotaciones con el mismo volumen de agua.
          </p>
        </div>
        <Alert role="note" className="max-w-sm" aria-labelledby="pilot-status">
          <AlertTitle id="pilot-status">Parcela ilustrativa</AlertTitle>
          <AlertDescription>
            La demo combina datos regionales con supuestos identificados. El historial y el turno de la parcela se confirman en campo.
          </AlertDescription>
        </Alert>
      </div>
      <nav aria-label="Ficha del piloto" className="mt-7 flex flex-wrap gap-3">
        <Button asChild>
          <a href="/la-maica/mi-parcela">Mi parcela</a>
        </Button>
        <Button asChild variant="secondary">
          <a href="/la-maica/mi-cultivo-y-mi-agua">Mi cultivo y mi agua</a>
        </Button>
        <Button asChild variant="secondary"><a href="/la-maica/comparar">Comparar tres rotaciones</a></Button>
        <Button asChild variant="secondary"><a href="/la-maica/mi-proximo-turno">Mi próximo turno</a></Button>
      </nav>
      <section className="rotations" aria-labelledby="rotations-title">
        <h2 id="rotations-title">Rotaciones del piloto</h2>
        <p>La primera campaña empieza con maíz forrajero.</p>
        <ul>
          {rotations.map(({ crop, purpose }) => (
            <li key={crop}><strong>{crop}</strong><span>{purpose}</span></li>
          ))}
        </ul>
      </section>
    </article>
  );
}
