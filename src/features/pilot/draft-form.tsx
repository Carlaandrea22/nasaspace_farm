"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { readPilotDraft, savePilotDraft } from "../../lib/browser/pilot-drafts";
import type { PilotDraft } from "./draft";

type Save = (patch: Pick<PilotDraft, "parcel" | "cropWater">) => Promise<void>;
export type DraftStatus = "idle" | "edited" | "saving" | "saved" | "error";

export function DraftForm({ children }: { children: (draft: PilotDraft | undefined, save: Save, status: DraftStatus, markEdited: () => void) => ReactNode }) {
  const [draft, setDraft] = useState<{ value?: PilotDraft }>();
  const [readFailed, setReadFailed] = useState(false);
  const [status, setStatus] = useState<DraftStatus>("idle");

  useEffect(() => {
    let active = true;
    readPilotDraft().then(
      (value) => { if (active) setDraft({ value }); },
      () => { if (active) setReadFailed(true); },
    );
    return () => { active = false; };
  }, []);

  async function save(patch: Parameters<Save>[0]) {
    setStatus("saving");
    try {
      await savePilotDraft(patch);
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  if (readFailed) {
    return <Alert><AlertTitle>Borrador no disponible</AlertTitle><AlertDescription>Recarga la página para intentar abrirlo de nuevo.</AlertDescription></Alert>;
  }
  if (!draft) return <p role="status" className="text-muted">Abriendo el borrador…</p>;

  function markEdited() {
    if (status !== "saving") setStatus("edited");
  }

  return children(draft.value, save, status, markEdited);
}

export function DraftHeader({ title, description }: { title: string; description: string }) {
  return (
    <header className="mb-5 sm:mb-7">
      <h1>{title}</h1>
      <p className="intro">{description}</p>
    </header>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="flex min-w-0 flex-col gap-1.5 text-sm font-semibold">{label}{children}</label>;
}

export function DraftActions({ status, next }: { status: DraftStatus; next?: { href: string; label: string } }) {
  return (
    <div className="mt-7">
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={status === "saving"}>Guardar borrador</Button>
        {next && status !== "saving" && <Button asChild variant="secondary"><a href={next.href}>{next.label}</a></Button>}
      </div>
      <p className="mt-3 text-sm text-muted" role="status">
        {status === "edited" && "Cambios sin guardar"}
        {status === "saved" && "Guardado en este dispositivo"}
        {status === "error" && "No se pudo guardar. Tus cambios siguen en pantalla. Intenta guardar de nuevo."}
        {status === "saving" && "Guardando el borrador…"}
      </p>
    </div>
  );
}
