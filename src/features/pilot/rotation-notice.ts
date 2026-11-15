import type { Result } from "../../domain/water-balance/model";
import { noticeNumber } from "./irrigation-notice";
import type { PlantingAlternative } from "./parcel-rotations";

export const rotationPhotos: Partial<Record<string, string>> = {
  "Maíz forrajero": "/images/informe/maiz.webp",
  "Maíz en grano": "/images/informe/maiz.webp",
  "Avena forrajera": "/images/informe/avena.webp",
  "Cebada forrajera": "/images/informe/cebada.webp",
  Haba: "/images/informe/haba.webp",
  Papa: "/images/informe/papa.webp",
  Zanahoria: "/images/informe/zanahoria.webp",
  "Cebolla (cabeza)": "/images/informe/cebolla.webp",
  Lechuga: "/images/informe/lechuga.webp",
  "Arveja (verde)": "/images/informe/arveja.webp",
  Trigo: "/images/informe/trigo.webp",
};

export function rotationMetrics(result: Result) {
  return [
    { label: "Días con falta de agua", value: noticeNumber(result.stressDays) },
    { label: "Agua extra estimada", value: result.supplementalMm === null ? "Sin dato" : `${noticeNumber(result.supplementalMm)} L/m²` },
    { label: "Días con suelo cubierto", value: noticeNumber(result.coverageDays) },
  ];
}

type RotationNotice = {
  title: string;
  action: string;
  location: string;
  crop: string;
  harvest: string;
  history: string;
  soilSource: string;
  alternatives: PlantingAlternative[];
  selected?: Result;
  seedQuotes: string[];
};

export async function downloadRotationNotice(data: RotationNotice) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const ink = "#20362c";
  const box = (x: number, y: number, width: number, height: number, color: string) => {
    doc.setFillColor(color);
    doc.roundedRect(x, y, width, height, 3, 3, "F");
  };
  const write = (value: string, x: number, y: number, width: number, size = 10, bold = false, color = ink) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(color);
    const lines = doc.splitTextToSize(value.replace(/[−–—]/g, "-").replace(/[\u00a0\u202f]/g, " "), width) as string[];
    doc.text(lines, x, y);
    return y + lines.length * size * .42;
  };
  doc.setProperties({ title: "Aviso de siembra - Yaku", author: "Yaku" });
  box(12, 12, 186, 28, "#183e2b");
  write("YAKU · COCHABAMBA", 19, 21, 170, 10, true, "#d8efb9");
  write("Aviso de siembra", 19, 33, 170, 23, true, "#ffffff");
  write(data.title, 16, 51, 178, 16, true);
  let y = write(data.action, 16, 62, 178) + 3;
  y = write(`Parcela: ${data.location}`, 16, y, 178) + 2;
  y = write(`Cultivo actual: ${data.crop} · Fecha indicada: ${data.harvest}`, 16, y, 178) + 4;
  y = write("Opciones para después de la cosecha", 16, y, 178, 12, true) + 2;

  const photos = await Promise.all(data.alternatives.map(async ({ result }) => {
    const photo = rotationPhotos[result.rotation.seasons.at(-1)!.crop.name];
    if (!photo) return null;
    try {
      const response = await fetch(photo);
      return response.ok ? new Uint8Array(await response.arrayBuffer()) : null;
    } catch {
      return null;
    }
  }));
  data.alternatives.forEach(({result, start, end, estimatedCalendar, habitual}, index) => {
    const crop = result.rotation.seasons.at(-1)!.crop.name;
    const image = photos[index];
    box(12, y, 186, 33, result === data.selected ? "#dfedce" : "#f0f4eb");
    let x = 17;
    if (image) {
      try {
        const { width, height } = doc.getImageProperties(image);
        const scale = Math.min(33 / width, 24 / height);
        doc.addImage(image, "WEBP", x, y + 4, width * scale, height * scale);
        x = 54;
      } catch {
        // The text remains available if a crop photo cannot be decoded.
      }
    }
    write(`${crop}${habitual ? " · Habitual" : ""}${result === data.selected ? " · Primera opción" : ""}`, x, y + 8, 193 - x, 12, true);
    let detail = write(`Siembra estimada: ${start} · Cosecha aproximada: ${end}`, x, y + 15, 193 - x);
    if (estimatedCalendar) detail = write("Calendario local por confirmar (FAO-56 y EcoCrop)", x, detail, 193 - x, 9);
    write(rotationMetrics(result).map(({ label, value }) => `${label}: ${value}`).join(" · "), x, detail + 1, 193 - x, 9);
    y += 37;
  });
  y = write(`Clima histórico: NASA POWER, ${data.history}. Suelo: ${data.soilSource}.`, 16, y + 3, 178, 9) + 2;
  y = write("Estimación basada en el clima histórico y un escenario sin riego. Confirma las fechas y el agua disponible antes de sembrar.", 16, y, 178, 9) + 2;
  if (data.seedQuotes.length) {
    y = write("Costos de semilla declarados", 16, y + 1, 178, 9, true) + 1;
    y = write(data.seedQuotes.join("\n"), 16, y, 178, 9) + 2;
  }
  doc.setFontSize(9);
  doc.setTextColor(ink);
  doc.textWithLink("Créditos de las fotografías", 16, y, { url: new URL("/images/informe/creditos.html", window.location.origin).href });
  doc.save(`aviso-siembra-${data.harvest}.pdf`);
}
