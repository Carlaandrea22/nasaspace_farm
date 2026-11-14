"use client";

import { useEffect, useState } from "react";
import { ensoSource, type EnsoOutlook, type EnsoSeason } from "../../domain/climate/enso";

const storageKey = "field-shift-enso-v1";
const monthLabel = new Intl.DateTimeFormat("es-BO", { month: "long", year: "numeric", timeZone: "UTC" });
const shortMonth = new Intl.DateTimeFormat("es-BO", { month: "short", year: "2-digit", timeZone: "UTC" });

export const labelMonth = (month: string) => monthLabel.format(new Date(`${month}-01T00:00:00Z`));

export function seasonLabel(season: EnsoSeason) {
  const [year, month] = season.center.split("-").map(Number);
  return `${shortMonth.format(Date.UTC(year, month - 2, 1))}–${shortMonth.format(Date.UTC(year, month, 1))}`;
}

function readSavedEnso(): EnsoOutlook | null {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) ?? "null") as EnsoOutlook | null;
    if (!value || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value.issued) || !Array.isArray(value.seasons)) return null;
    const current = new Date();
    const issue = new Date(`${value.issued}-01T00:00:00Z`);
    const months = (current.getUTCFullYear() - issue.getUTCFullYear()) * 12 + current.getUTCMonth() - issue.getUTCMonth();
    return months >= 0 && months <= 2 ? value : null;
  } catch {
    return null;
  }
}

export function useEnso() {
  const [state, setState] = useState<{ outlook: EnsoOutlook | null; cached: boolean }>();
  useEffect(() => {
    let controller: AbortController | undefined;
    function load() {
      if (document.visibilityState !== "visible") return;
      controller?.abort();
      controller = new AbortController();
      const { signal } = controller;
      fetch("/api/enso", { signal }).then(async (response) => {
        if (!response.ok) throw new Error("CPC");
        const outlook = await response.json() as EnsoOutlook;
        if (signal.aborted) return;
        try { localStorage.setItem(storageKey, JSON.stringify(outlook)); } catch {}
        setState({ outlook, cached: false });
      }).catch(() => {
        if (signal.aborted) return;
        const outlook = readSavedEnso();
        setState({ outlook, cached: Boolean(outlook) });
      });
    }
    load();
    const timer = window.setInterval(load, 60 * 60 * 1000);
    window.addEventListener("online", load);
    document.addEventListener("visibilitychange", load);
    return () => {
      controller?.abort();
      window.clearInterval(timer);
      window.removeEventListener("online", load);
      document.removeEventListener("visibilitychange", load);
    };
  }, []);
  return state;
}

export function EnsoAttribution({ outlook, cached }: { outlook: EnsoOutlook; cached: boolean }) {
  return (
    <p className="text-xs text-muted">
      Boletín de <a href={ensoSource} className="underline underline-offset-2">NOAA CPC</a>, {labelMonth(outlook.issued)}{cached ? " · copia guardada" : ""}.
    </p>
  );
}
