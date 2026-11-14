import Image from "next/image";

export default function HomePage() {
  return (
    <div className="welcome">
      <div className="welcome-copy">
        <p className="location">La Maica · D9, Itocta</p>
        <h1>¿Y si el agua<br className="desktop-break" /> llega tarde?</h1>
        <p className="intro">
          Explora el caso de La Maica y conoce las tres rotaciones que queremos
          comparar cuando un turno de riego se retrasa cinco días.
        </p>
        {/* A document navigation uses the offline page cached by the service worker. */}
        <a className="action" href="/la-maica">
          Continuar sin cuenta <span aria-hidden="true">→</span>
        </a>
      </div>
      <figure className="landscape">
        <div className="landscape-photo">
          <Image
            src="/images/valle-cochabamba.jpg"
            alt="Valle de Cochabamba visto desde la cordillera del Tunari"
            fill
            unoptimized
            preload
          />
        </div>
        <figcaption>
          <span>Valle de Cochabamba</span>
          <span>
            <a href="https://commons.wikimedia.org/wiki/File:Valle_de_Cochabamba_desde_Cordillera_Tunari.jpg">51114u9</a>
            {" · "}
            <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>
          </span>
        </figcaption>
      </figure>
    </div>
  );
}
