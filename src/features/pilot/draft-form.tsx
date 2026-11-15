"use client";

import { Fragment, useEffect, useState, type ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { authClient } from "../../lib/browser/auth-client";
import { readPilotDraft, savePilotDraft } from "../../lib/browser/pilot-drafts";
import type { DraftPatch, PilotDraft } from "./draft";

type Save = (patch: DraftPatch) => Promise<void>;
type DraftContent = (draft: PilotDraft | undefined, save: Save, status: DraftStatus, markEdited: () => void) => ReactNode;
export type DraftStatus = "idle" | "edited" | "saving" | "saved" | "saved-account" | "error";

async function accountDraft(method = "GET", data?: DraftPatch | PilotDraft): Promise<PilotDraft | undefined> {
  const response = await fetch("/api/account-draft", {
    method,
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
    ...(data ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) } : {}),
  });
  if (!response.ok) throw new Error(response.status === 409 ? "existing-draft" : "account-draft");
  return (await response.json()) ?? undefined;
}

export function DraftForm({ children }: { children: DraftContent }) {
  const { data: session, isPending } = authClient.useSession();
  if (isPending && !session) return <p role="status" className="text-muted">Abriendo el borrador…</p>;
  return <DraftWorkspace key={session?.user.id ?? "guest"} account={Boolean(session)}>{children}</DraftWorkspace>;
}

function DraftWorkspace({ children, account }: { children: DraftContent; account: boolean }) {
  const [draft, setDraft] = useState<{ value?: PilotDraft }>();
  const [readFailed, setReadFailed] = useState(false);
  const [status, setStatus] = useState<DraftStatus>("idle");
  const [localCopy, setLocalCopy] = useState<PilotDraft>();
  const [copyError, setCopyError] = useState("");
  const [copying, setCopying] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    (account ? accountDraft() : readPilotDraft()).then(
      (value) => {
        if (!active) return;
        setDraft({ value });
        if (account && !value) {
          readPilotDraft().then((local) => { if (active) setLocalCopy(local); }).catch(() => {});
        }
      },
      () => { if (active) setReadFailed(true); },
    );
    return () => { active = false; };
  }, [account]);

  async function save(patch: Parameters<Save>[0]) {
    setStatus("saving");
    try {
      if (account) {
        await accountDraft("PATCH", patch);
        setLocalCopy(undefined);
        setStatus("saved-account");
      } else {
        await savePilotDraft(patch);
        setStatus("saved");
      }
    } catch {
      setStatus("error");
    }
  }

  async function copyLocalDraft() {
    if (!localCopy || copying) return;
    setCopying(true);
    setCopyError("");
    try {
      const value = await accountDraft("PUT", localCopy);
      setDraft({ value });
      setLocalCopy(undefined);
      setRevision((current) => current + 1);
      setStatus("saved-account");
    } catch (error) {
      setCopyError(error instanceof Error && error.message === "existing-draft"
        ? "La cuenta ya tiene un borrador. Recarga para abrirlo."
        : "No se pudo copiar el borrador. Revisa la conexión e inténtalo de nuevo.");
    } finally {
      setCopying(false);
    }
  }

  if (readFailed) {
    return <Alert>
      <AlertTitle>{account ? "Borrador de la cuenta no disponible" : "Borrador no disponible"}</AlertTitle>
      <AlertDescription>{account ? "Verifica la conexión y recarga para abrirlo de nuevo." : "Recarga la página para intentar abrirlo de nuevo."}</AlertDescription>
    </Alert>;
  }
  if (!draft) return <p role="status" className="text-muted">Abriendo el borrador…</p>;

  function markEdited() {
    if (status !== "saving") setStatus("edited");
  }

  return <>
    {localCopy && <div className="panel mb-5">
      <p className="text-sm text-muted">Tienes un borrador guardado en este dispositivo. Puedes copiarlo a la cuenta.</p>
      <Button type="button" variant="secondary" className="mt-2" disabled={copying || status === "saving" || status === "edited"}
        onClick={() => void copyLocalDraft()}>{copying ? "Copiando…" : "Copiar borrador a mi cuenta"}</Button>
      {copyError && <p role="alert" className="mt-2 text-sm text-red-800">{copyError}</p>}
    </div>}
    <Fragment key={revision}>{children(draft.value, save, copying ? "saving" : status, markEdited)}</Fragment>
  </>;
}

export function DraftHeader({ title, description, cover }: { title: string; description: string; cover?: "water" | "crops" }) {
  return (
    <header className={cover ? "section-cover" : "mb-5 sm:mb-7"} data-cover={cover}>
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
        {status === "saved-account" && "Guardado en tu cuenta"}
        {status === "error" && "No se pudo guardar. Tus cambios siguen en pantalla. Intenta guardar de nuevo."}
        {status === "saving" && "Guardando el borrador…"}
      </p>
    </div>
  );
}
