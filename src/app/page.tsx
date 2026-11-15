import { ArrowRight, MapPin } from "lucide-react";
import { FieldSceneCarousel } from "../components/field-scene-carousel";
import { Button } from "../components/ui/button";
import { ParcelForm } from "../features/pilot/parcel-form";

export default function HomePage() {
  return (
    <div className="pb-5">
      <header className="field-hero">
        <div className="field-hero-copy">
          <p className="field-hero-place"><MapPin size={16} aria-hidden="true" /> Cochabamba, Bolivia</p>
          <h1>Tu parcela,<br className="hidden sm:block" /> a la vista.</h1>
          <p className="field-hero-description">Encuentra tu terreno en Cochabamba, revisa cuándo regar y compara qué sembrar en la próxima campaña.</p>
        </div>
        <FieldSceneCarousel />
      </header>
      <ParcelForm explore />
      <section className="pilot-card" aria-labelledby="demo-title">
        <p className="text-sm font-semibold text-leaf">Ejemplo · La Maica, distrito 9 (Itocta)</p>
        <h2 id="demo-title" className="mt-1 text-2xl font-bold">¿Qué cambia si el riego se retrasa cinco días?</h2>
        <p className="mt-2 max-w-lg text-sm">Simula el retraso de un turno de riego y compara cómo afecta a tres rotaciones con datos ilustrativos de La Maica.</p>
        <Button asChild className="mt-4 border-leaf bg-leaf text-ink hover:border-white hover:bg-white hover:text-ink">
          <a href="/la-maica/comparar#demo">Abrir simulación de riego <ArrowRight size={17} aria-hidden="true" /></a>
        </Button>
        <small className="mt-4 block text-xs">
          Foto del valle <a className="underline underline-offset-3" href="https://commons.wikimedia.org/wiki/File:Valle_de_Cochabamba_desde_Cordillera_Tunari.jpg">51114u9</a>
          {" · "}
          <a className="underline underline-offset-3" href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>
        </small>
      </section>
    </div>
  );
}
