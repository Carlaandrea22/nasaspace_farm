"use client";

import { ArrowRight, CalendarDays, CloudRain, Droplets, MapPin, Sprout, UserRound, X } from "lucide-react";
import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { Punto } from "./mapa";

const Mapa = dynamic(() => import("./mapa"), { ssr: false, loading: () => <p>Cargando mapa…</p> });

const pantallas = [
  { id: "mapa", nombre: "Explorar", icono: MapPin },
  { id: "agua", nombre: "Agua", icono: Droplets },
  { id: "rotaciones", nombre: "Rotaciones", icono: Sprout },
] as const;
type Pantalla = typeof pantallas[number]["id"];

const cultivos = [
  { nombre: "Avena forrajera", uso: "Forraje · rotación de referencia", dias: [52, 55], ventana: [0, 3], agua: 61.6 },
  { nombre: "Cebada forrajera", uso: "Forraje · ciclo más corto", dias: [43, 47], ventana: [0, 5], agua: 42.5 },
  { nombre: "Haba", uso: "Leguminosa · venta o consumo", dias: [84, 87], ventana: [0, 5], agua: 111.1 },
];
export default function Inicio() {
  const [pantalla, setPantalla] = useState<Pantalla>("mapa");
  const [horizonte, setHorizonte] = useState(7);
  const [retraso, setRetraso] = useState(false);
  const [forraje, setForraje] = useState(true);
  const [punto, setPunto] = useState<Punto | null>(null);
  const acceso = useRef<HTMLDialogElement>(null);
  const [modo, setModo] = useState<"ingresar" | "crear">("ingresar");
  const [motivo, setMotivo] = useState<"cuenta" | "guardar">("cuenta");
  const escenario = retraso ? 1 : 0;

  function abrirAcceso(para: "cuenta" | "guardar") {
    setMotivo(para);
    setModo("ingresar");
    acceso.current?.showModal();
  }

  function ir(destino: Pantalla) {
    setPantalla(destino);
    window.scrollTo(0, 0);
  }

  return <>
    <header className="barra cabecera">
      <div className="identidad"><span className="emblema"><Sprout size={23}/></span><div><span className="marca">Agua y Siembra</span><span className="lugar">Cochabamba</span></div></div>
      <button className="cuenta" onClick={() => abrirAcceso("cuenta")}><UserRound size={17}/> <span>Iniciar sesión</span></button>
    </header>
    <div className="marco">
      <nav className="navegacion" aria-label="Pantallas">
        {pantallas.map(({ id, nombre, icono: Icono }) =>
          <button key={id} aria-current={pantalla === id ? "page" : undefined} onClick={() => ir(id)}><Icono size={20} aria-hidden="true"/>{nombre}</button>)}
        <button onClick={() => abrirAcceso("guardar")}><UserRound size={20} aria-hidden="true"/> Mis parcelas</button>
      </nav>
      <main>
        {pantalla !== "mapa" && <div className="ubicacion"><p className="contexto">EJEMPLO · LA MAICA</p><span className="demo">Datos de demo</span></div>}
        {pantalla === "agua" && <section>
          <h1>Mi próximo turno</h1>
          <article className="tarjeta"><CalendarDays size={24}/><h2>En 3 días</h2><p>Turno de ejemplo para maíz en desarrollo.</p></article>
          <h2>Lluvia esperada</h2>
          <div className="segmentos" aria-label="Horizonte del pronóstico">
            {[7, 14].map(n => <button key={n} aria-pressed={n === horizonte} onClick={() => setHorizonte(n)}>{n} días</button>)}
          </div>
          <article className="tarjeta" aria-live="polite"><CloudRain size={24}/> <strong className="dato">{horizonte === 7 ? 8 : 21} mm</strong>
            <p>{horizonte === 7 ? "Lluvia acumulada en la próxima semana." : "Lluvia acumulada en dos semanas. La segunda semana tiene mayor incertidumbre."}</p>
          </article>
          <details><summary>Fuentes previstas</summary><p>SMAP para humedad regional, GPM IMERG para lluvia reciente, NASA POWER para el historial climático y una fuente abierta para el pronóstico.</p></details>
        </section>}
        {pantalla === "rotaciones" && <section>
          <h1>¿Qué siembro después?</h1>
          <p className="subtitulo">Tres opciones después del maíz forrajero.</p>
          <label className="campo">Mi prioridad
            <select value={forraje ? "forraje" : "diversificar"} onChange={e => setForraje(e.target.value === "forraje")}>
              <option value="forraje">Mantener el forraje</option><option value="diversificar">Considerar venta o consumo</option>
            </select>
          </label>
          <label className="opcion"><input type="checkbox" checked={retraso} onChange={e => setRetraso(e.target.checked)}/> Simular un retraso de cinco días</label>
          <div aria-live="polite">
            {cultivos.map(c => <article key={c.nombre} className={`tarjeta rotacion ${c.nombre === "Cebada forrajera" ? "destacada" : ""}`}>
              <h2>{c.nombre}</h2><p>{c.uso}</p>
              {c.nombre === "Cebada forrajera" && <p className="contexto">MENOS DÍAS DE ESTRÉS EN ESTA SIMULACIÓN</p>}
              {c.nombre === "Haba" && forraje && <p className="contexto">CONDICIONADA POR LA NECESIDAD DE FORRAJE</p>}
              <div className="metricas"><div><strong>{c.dias[escenario]} días</strong><small>Sobre el umbral en la campaña</small></div><div><strong>{c.ventana[escenario]} de 5 días</strong><small>Sobre el umbral durante la espera</small></div></div>
              <details><summary>Ver riego suplementario</summary><p>{c.agua.toLocaleString("es-BO")} mm netos estimados en la campaña bajo estos supuestos.</p></details>
            </article>)}
          </div>
        </section>}
        {pantalla === "mapa" && <section>
          <h1>Explora Cochabamba</h1>
          <p className="subtitulo">Toca un distrito para acercarte. Luego toca el terreno para marcar tu parcela.</p>
          <Mapa punto={punto} seleccionar={setPunto}/>
          {punto && <article className="tarjeta">
            <h2>Punto seleccionado</h2>
            <p>{punto.lat.toFixed(5)}, {punto.lng.toFixed(5)}</p>
            <button className="guardar" onClick={() => abrirAcceso("guardar")}>Guardar parcela <ArrowRight size={17}/></button>
          </article>}
        </section>}
      </main>
    </div>
    <dialog ref={acceso} className="acceso" aria-labelledby="titulo-acceso">
      <button className="cerrar" aria-label="Cerrar" onClick={() => acceso.current?.close()}><X size={22}/></button>
      <span className="emblema"><UserRound size={22}/></span>
      <h2 id="titulo-acceso">{modo === "crear" ? "Crear cuenta" : "Iniciar sesión"}</h2>
      <p>{motivo === "guardar" ? "Con una cuenta podrás guardar tu parcela y consultar su seguimiento." : "Entra a tu espacio para consultar tus parcelas guardadas."}</p>
      <div className="segmentos" aria-label="Opciones de cuenta">
        <button aria-pressed={modo === "ingresar"} onClick={() => setModo("ingresar")}>Iniciar sesión</button>
        <button aria-pressed={modo === "crear"} onClick={() => setModo("crear")}>Crear cuenta</button>
      </div>
      <p className="subtitulo">Vista de prototipo. El acceso a cuentas estará disponible al conectar el servidor.</p>
      <button className="guardar" onClick={() => acceso.current?.close()}>Volver a la consulta <ArrowRight size={17}/></button>
    </dialog>
  </>;
}
