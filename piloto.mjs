import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Parámetros ilustrativos. Los tres cultivos comparten el mismo perfil efectivo
// para conservar el agua almacenada entre campañas en esta primera versión.
const suelo = { capacidadCampo: 0.30, marchitez: 0.15, profundidad: 0.60, agotamientoInicial: 16 };
const campana2 = 115;
const dias = 235;
const turno = { dia: campana2 + 42, laminaNeta: 32 };
const otrosTurnos = new Map(
  [14, 28, 42, 56, 70, 84, 98, 112, 129, 143, 171, 185, 199, 213, 227]
    .map(dia => [dia, 32])
);

const maiz = cultivo('Maíz forrajero', [20, 30, 40, 25], [0.35, 1.15, 0.70], 0.55);
const opciones = [
  { id: 'A', segundo: cultivo('Avena forrajera', [18, 27, 35, 25], [0.30, 1.10, 0.65], 0.55), forraje: true },
  { id: 'B', segundo: cultivo('Cebada forrajera', [16, 24, 30, 22], [0.30, 1.05, 0.55], 0.55), forraje: true },
  { id: 'C', segundo: cultivo('Haba', [18, 30, 40, 27], [0.45, 1.15, 0.65], 0.45), forraje: false }
];

function cultivo(nombre, etapas, kc, p) {
  return { nombre, etapas, kc, p, duracion: etapas.reduce((suma, valor) => suma + valor, 0) };
}

function fase(c, edad) {
  const [inicio, desarrollo, media, final] = c.etapas;
  const [kcInicial, kcMedio, kcFinal] = c.kc;
  if (edad >= c.duracion) return { etapa: 'Sin cultivo', kc: 0.2, activo: false };
  if (edad < inicio) return { etapa: 'Inicial', kc: kcInicial, activo: true };
  if (edad < inicio + desarrollo) {
    const fraccion = (edad - inicio + 1) / desarrollo;
    return { etapa: 'Desarrollo', kc: kcInicial + fraccion * (kcMedio - kcInicial), activo: true };
  }
  if (edad < inicio + desarrollo + media) return { etapa: 'Media', kc: kcMedio, activo: true };
  const fraccion = (edad - inicio - desarrollo - media + 1) / final;
  return { etapa: 'Final', kc: kcMedio + fraccion * (kcFinal - kcMedio), activo: true };
}

export function climaDemo() {
  return Array.from({ length: dias }, (_, dia) => ({
    et0: dia < campana2 ? 4.7 : 3.8,
    lluviaEfectiva: dia % 13 === 0 ? 8 : 0
  }));
}

export function simular(opcion, retraso, clima, suplementar = false) {
  if (!Number.isInteger(retraso) || retraso < 0 || retraso > 5) throw new Error('Retraso válido: 0 a 5 días.');
  if (clima.length !== dias || clima.some(d => ![d.et0, d.lluviaEfectiva].every(n => Number.isFinite(n) && n >= 0))) {
    throw new Error('Se requieren 235 días de ET₀ y lluvia efectiva válidas.');
  }
  const taw = 1000 * (suelo.capacidadCampo - suelo.marchitez) * suelo.profundidad;
  let agotamiento = suelo.agotamientoInicial;
  return clima.map(({ et0, lluviaEfectiva }, dia) => {
    const segunda = dia >= campana2;
    const c = segunda ? opcion.segundo : maiz;
    const { etapa, kc, activo } = fase(c, segunda ? dia - campana2 : dia);
    const umbral = c.p * taw;
    const riego = (otrosTurnos.get(dia) ?? 0) + (dia === turno.dia + retraso ? turno.laminaNeta : 0);
    const antesEt = Math.max(0, agotamiento - lluviaEfectiva - riego);
    const demanda = kc * et0;
    // El contrafactual agrega la lámina mínima diaria para terminar bajo el umbral.
    const extra = suplementar && segunda && activo ? Math.max(0, antesEt + demanda - umbral) : 0;
    const restante = Math.max(0, antesEt - extra);
    const ks = activo && restante > umbral ? (taw - restante) / (taw - umbral) : 1;
    const etReal = Math.min(taw - restante, demanda * ks);
    agotamiento = restante + etReal;
    return { dia, etapa, activo, et0, lluviaEfectiva, riego, extra, agotamiento, umbral,
      estres: activo && agotamiento > umbral + 1e-9 };
  });
}

export function comparar(clima = climaDemo(), requiereForraje = true) {
  return opciones.map(opcion => {
    const escenarios = [0, 5].map(retraso => {
      const serie = simular(opcion, retraso, clima);
      const estres = serie.slice(campana2).filter(dia => dia.estres);
      const extra = simular(opcion, retraso, clima, true).reduce((total, dia) => total + dia.extra, 0);
      return { retraso, serie, primerDia: estres[0], diasEstres: estres.length, extra };
    });
    return { opcion, elegible: opcion.forraje || !requiereForraje, escenarios };
  });
}

function ejecutar() {
  const args = process.argv.slice(2);
  const destino = args.find(arg => arg.startsWith('--csv='))?.slice(6);
  const resultados = comparar(climaDemo(), !args.includes('--diversificar'));
  console.log('La Maica · D9 / Itocta · parcela y clima ilustrativos');
  console.log('Segunda campaña · mismo calendario y turno de 32 mm netos, desplazado 5 días');
  console.table(resultados.flatMap(({ opcion, elegible, escenarios }) => escenarios.map(e => ({
    opción: opcion.id,
    secuencia: `Maíz forrajero → ${opcion.segundo.nombre}`,
    apta: elegible ? 'Sí, por destino' : 'Condicionada por forraje',
    retraso: e.retraso,
    primerDíaDesdeTurno: e.primerDia ? e.primerDia.dia - turno.dia : '—',
    etapa: e.primerDia?.etapa ?? '—',
    díasSobreUmbral: e.diasEstres,
    riegoExtraMm: e.extra.toFixed(1),
    díasConCultivo: opcion.segundo.duracion
  }))));
  console.log('Ventana del retraso · días 0 a 4 antes de que llegue el turno tardío');
  console.table(resultados.map(({ opcion, escenarios: [normal, tarde] }) => {
    const contar = e => e.serie.slice(turno.dia, turno.dia + 5).filter(d => d.estres).length;
    const primerCambio = tarde.serie.find(d => d.estres && !normal.serie[d.dia].estres);
    return {
      opción: opcion.id,
      díasSobreUmbralATiempo: contar(normal),
      díasSobreUmbralConRetraso: contar(tarde),
      primerDíaAdicional: primerCambio ? primerCambio.dia - turno.dia : '—',
      etapa: primerCambio?.etapa ?? '—'
    };
  }));
  for (const escenario of [0, 1]) {
    const preferida = resultados.filter(r => r.elegible).sort((a, b) =>
      a.escenarios[escenario].diasEstres - b.escenarios[escenario].diasEstres ||
      a.escenarios[escenario].extra - b.escenarios[escenario].extra)[0];
    const e = preferida.escenarios[escenario];
    console.log(`Turno +${e.retraso} días · menor estrés entre aptas: ${preferida.opcion.id} (${e.diasEstres} días)`);
  }

  if (destino) {
    const filas = resultados.flatMap(({ opcion, escenarios }) => escenarios.flatMap(({ retraso, serie }) =>
      serie.map(d => [opcion.id, retraso, d.dia, d.dia - turno.dia, d.etapa, d.et0, d.lluviaEfectiva, d.riego,
        d.agotamiento.toFixed(3), d.umbral.toFixed(3), Number(d.estres)].join(','))));
    const encabezado = 'secuencia,retraso_dias,dia_piloto,dia_desde_turno,etapa,et0_mm,lluvia_efectiva_mm,riego_mm,agotamiento_mm,umbral_mm,estres';
    writeFileSync(destino, [encabezado, ...filas].join('\n') + '\n', 'utf8');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) ejecutar();
