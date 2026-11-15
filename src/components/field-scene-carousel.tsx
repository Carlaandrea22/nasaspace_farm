"use client";

import Image from "next/image";
import { ChevronLeft, ChevronRight, CloudRain, Droplet, MapPin, Satellite, Sprout } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

const scenes = [
  { name: "parcelas", label: "Encuentra tu parcela", detail: "Ubica tu terreno en el mapa de Cochabamba.", icon: MapPin },
  { name: "riego", label: "Planifica tu riego", detail: "Explora qué cambia si se retrasa tu turno.", icon: Droplet },
  { name: "cultivos", label: "Elige qué sembrar", detail: "Compara cultivos para tu próxima campaña.", icon: Sprout },
  { name: "clima", label: "Anticipa el clima", detail: "Revisa la lluvia prevista y los avisos de calor.", icon: CloudRain },
  { name: "satelite", label: "Consulta el historial climático", detail: "Conoce el clima de tu zona con NASA POWER.", icon: Satellite },
] as const;

const interval = 7000;

export function FieldSceneCarousel() {
  const root = useRef<HTMLElement>(null);
  const slidesId = useId();
  const [active, setActive] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [keyboardFocus, setKeyboardFocus] = useState(false);
  const [visible, setVisible] = useState(false);
  const rotating = !reducedMotion && visible && !hovered && !keyboardFocus;

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotion = () => setReducedMotion(media.matches);
    syncMotion();
    media.addEventListener("change", syncMotion);
    return () => media.removeEventListener("change", syncMotion);
  }, []);

  useEffect(() => {
    const section = root.current;
    if (!section) return;
    let inViewport = false;
    const update = () => setVisible(inViewport && document.visibilityState === "visible");
    const observer = new IntersectionObserver(([entry]) => {
      inViewport = entry.isIntersecting;
      update();
    }, { threshold: 0.2 });
    observer.observe(section);
    document.addEventListener("visibilitychange", update);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  useEffect(() => {
    if (!rotating) return;
    const timer = window.setTimeout(() => setActive((active + 1) % scenes.length), interval);
    return () => window.clearTimeout(timer);
  }, [active, rotating]);

  function goTo(index: number) {
    setActive((index + scenes.length) % scenes.length);
  }

  const scene = scenes[active];
  const Icon = scene.icon;
  return (
    <section
      ref={root}
      className="field-carousel"
      aria-label="Escenas de Yaku"
      aria-roledescription="carrusel"
      data-playing={rotating}
      onPointerEnter={(event) => { if (event.pointerType === "mouse") setHovered(true); }}
      onPointerLeave={(event) => { if (event.pointerType === "mouse") setHovered(false); }}
      onFocusCapture={(event) => setKeyboardFocus(event.target.matches(":focus-visible"))}
      onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setKeyboardFocus(false); }}
      onPointerDown={() => setKeyboardFocus(false)}
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        goTo(active + (event.key === "ArrowLeft" ? -1 : 1));
      }}
    >
      <div id={slidesId} className="field-carousel-picture">
        <div key={scene.name} className="field-carousel-layer" data-active aria-hidden="true">
          <Image
            src={`/images/field-scenes/${scene.name}.webp`}
            alt=""
            fill
            unoptimized
            loading="eager"
            fetchPriority={active === 0 ? "high" : "auto"}
          />
        </div>
        <span className="absolute end-2 top-2 z-10 rounded bg-black/75 px-2 py-1 text-xs text-white">Ilustración generada con IA</span>
        <div className="field-carousel-caption" aria-live={rotating ? "off" : "polite"} aria-atomic="true">
          <span className="field-carousel-icon"><Icon size={21} aria-hidden="true" /></span>
          <div>
            <p className="field-carousel-title">{scene.label}</p>
            <p className="field-carousel-detail">{scene.detail}</p>
          </div>
        </div>
      </div>
      <div className="field-carousel-controls" role="group" aria-label="Controles del carrusel">
        <button type="button" aria-label="Escena anterior" aria-controls={slidesId} onClick={() => goTo(active - 1)}>
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
        <div className="field-carousel-dots" role="group" aria-label="Elegir escena">
          {scenes.map(({ name, label }, index) => (
            <button key={name} type="button" aria-label={label} aria-current={index === active ? "true" : undefined}
              aria-controls={slidesId} onClick={() => goTo(index)}><span /></button>
          ))}
        </div>
        <button type="button" aria-label="Siguiente escena" aria-controls={slidesId} onClick={() => goTo(active + 1)}>
          <ChevronRight size={20} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
