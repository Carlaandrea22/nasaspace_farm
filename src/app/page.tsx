import { MapPin } from "lucide-react";
import { FieldSceneCarousel } from "../components/field-scene-carousel";
import { ParcelForm } from "../features/pilot/parcel-form";

export default function HomePage() {
  return (
    <div className="explore-home pb-5">
      <header className="field-hero">
        <div className="field-hero-copy">
          <p className="field-hero-place"><MapPin size={16} aria-hidden="true" /> Cochabamba, Bolivia</p>
          <h1>Tu parcela,<br className="hidden sm:block" /> a la vista.</h1>
          <p className="field-hero-description">Encuentra tu terreno en Cochabamba, revisa cuándo regar y compara qué sembrar en la próxima campaña.</p>
        </div>
        <FieldSceneCarousel />
      </header>
      <ParcelForm explore />
    </div>
  );
}
