"use client";

import { Fragment, useEffect, useState, type ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { NativeSelect } from "../../components/ui/native-select";
import { accountDraft } from "../../lib/browser/account-drafts";
import { authClient } from "../../lib/browser/auth-client";
import { readPilotDraft, savePilotDraft } from "../../lib/browser/pilot-drafts";
import type { DraftPatch, PilotDraft } from "./draft";

type Save = (patch: DraftPatch) => Promise<void>;
type DraftContent = (draft: PilotDraft | undefined, save: Save, status: DraftStatus, markEdited: () => void, parcelId?: string) => ReactNode;
export type DraftStatus = "idle" | "edited" | "saving" | "saved" | "saved-account" | "error";

type SavedParcel = { id: string; name: string };
type ParcelControls = {
  list: SavedParcel[];
  show: boolean;
  select: (id: string) => void;
  onSaved: (parcel: SavedParcel) => void;
};

export function DraftForm({ children, showParcels = false }: { children: DraftContent; showParcels?: boolean }) {
  const { data: session, isPending } = authClient.useSession();
  if (isPending && !session) return <p role="status" className="text-muted">Abriendo el borrador…</p>;
  return session
    ? <AccountWorkspace key={session.user.id} userId={session.user.id} showParcels={showParcels}>{children}</AccountWorkspace>
    : <DraftWorkspace>{children}</DraftWorkspace>;
}

function AccountWorkspace({ children, userId, showParcels }: { children: DraftContent; userId: string; showParcels: boolean }) {
  const [list, setList] = useState<SavedParcel[]>([]);
  const [selected, setSelected] = useState<string>();
  const [failed, setFailed] = useState(false);
  const storageKey = `field-shift:parcel:${userId}`;

  useEffect(() => {
    let active = true;
    accountDraft<SavedParcel[]>("list=1").then((items) => {
      if (!active) return;
      let last: string | null = null;
      try { last = sessionStorage.getItem(storageKey); } catch {}
      setList(items);
      setSelected(items.find((item) => item.id === last)?.id ?? items[0]?.id ?? "default");
    }, () => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [storageKey]);

  function remember(id: string) {
    try { sessionStorage.setItem(storageKey, id); } catch {}
  }

  if (failed) return <Alert><AlertTitle>No pudimos abrir tus parcelas</AlertTitle>
    <AlertDescription>Verifica la conexión y recarga la página.</AlertDescription></Alert>;
  if (!selected) return <p role="status" className="text-muted">Abriendo tus parcelas…</p>;
  return <DraftWorkspace key={selected} parcelId={selected} controls={{
    list,
    show: showParcels,
    select(id) { setSelected(id); if (list.some((item) => item.id === id)) remember(id); },
    onSaved(item) {
      setList((current) => current.some((saved) => saved.id === item.id)
        ? current.map((saved) => saved.id === item.id ? item : saved)
        : [...current, item]);
      remember(item.id);
    },
  }}>{children}</DraftWorkspace>;
}

function DraftWorkspace({ children, parcelId, controls }: { children: DraftContent; parcelId?: string; controls?: ParcelControls }) {
  const account = Boolean(parcelId);
  const query = `parcel=${parcelId}`;
  const [draft, setDraft] = useState<{ value?: PilotDraft }>();
  const [readFailed, setReadFailed] = useState(false);
  const [status, setStatus] = useState<DraftStatus>("idle");
  const [localCopy, setLocalCopy] = useState<PilotDraft>();
  const [copyError, setCopyError] = useState("");
  const [copying, setCopying] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (status !== "edited" && status !== "error" && status !== "saving") return;
    const protectDraft = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protectDraft);
    return () => window.removeEventListener("beforeunload", protectDraft);
  }, [status]);

  useEffect(() => {
    let active = true;
    (account ? accountDraft<PilotDraft | undefined>(query) : readPilotDraft()).then(
      (value) => {
        if (!active) return;
        setDraft({ value });
        if (parcelId === "default" && !value) {
          readPilotDraft().then((local) => { if (active) setLocalCopy(local); }).catch(() => {});
        }
      },
      () => { if (active) setReadFailed(true); },
    );
    return () => { active = false; };
  }, [account, parcelId, query]);

  async function save(patch: Parameters<Save>[0]) {
    setStatus("saving");
    try {
      if (parcelId) {
        const saved = await accountDraft<PilotDraft>(query, "PATCH", patch);
        setDraft({ value: saved });
        controls?.onSaved({ id: parcelId, name: saved.parcel?.name ?? "" });
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
    if (!parcelId || !localCopy || copying) return;
    setCopying(true);
    setCopyError("");
    try {
      const value = await accountDraft<PilotDraft>(query, "PUT", localCopy);
      setDraft({ value });
      controls?.onSaved({ id: parcelId, name: value.parcel?.name ?? "" });
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

  function changeParcel(id: string) {
    if (id === parcelId) return;
    if ((status === "edited" || status === "error") && !window.confirm("Tienes cambios sin guardar. ¿Quieres cambiar de parcela?")) return;
    controls?.select(id);
  }

  return <>
    {controls?.show && <section className="panel mb-5 flex flex-wrap items-end gap-3" aria-label="Mis parcelas">
      <div className="min-w-0 flex-1">
        <Field label="Parcelas guardadas">
          <NativeSelect value={parcelId} disabled={copying || status === "saving"} onChange={(event) => changeParcel(event.target.value)}>
            {!controls.list.some((item) => item.id === parcelId) && <option value={parcelId}>Parcela sin guardar</option>}
            {controls.list.map((item, index) => <option key={item.id} value={item.id}>{item.name || `Parcela ${index + 1}`}</option>)}
          </NativeSelect>
        </Field>
      </div>
      <Button type="button" variant="secondary" disabled={copying || status === "saving" || !controls.list.some((item) => item.id === parcelId)}
        onClick={() => changeParcel(crypto.randomUUID())}>Nueva parcela</Button>
    </section>}
    {localCopy && <div className="panel mb-5">
      <p className="text-sm text-muted">Tienes un borrador guardado en este dispositivo. Puedes copiarlo a la cuenta.</p>
      <Button type="button" variant="secondary" className="mt-2" disabled={copying || status === "saving" || status === "edited"}
        onClick={() => void copyLocalDraft()}>{copying ? "Copiando…" : "Copiar borrador a mi cuenta"}</Button>
      {copyError && <p role="alert" className="mt-2 text-sm text-red-800">{copyError}</p>}
    </div>}
    <Fragment key={revision}>{children(draft.value, save, copying ? "saving" : status, markEdited, parcelId)}</Fragment>
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

export function DraftActions({ status, next, needsSavedParcel = false }: {
  status: DraftStatus;
  next?: { href: string; label: string };
  needsSavedParcel?: boolean;
}) {
  const mustSave = needsSavedParcel || status === "edited" || status === "error";
  return (
    <div className="mt-7">
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={status === "saving"}>Guardar borrador</Button>
        {next && (mustSave || status === "saving"
          ? <Button type="button" variant="secondary" disabled>{next.label}</Button>
          : <Button asChild variant="secondary"><a href={next.href}>{next.label}</a></Button>)}
      </div>
      <p className="mt-3 text-sm text-muted" role="status">
        {status === "idle" && needsSavedParcel && "Guarda esta parcela para continuar al cultivo y riego."}
        {status === "edited" && "Cambios sin guardar"}
        {status === "saved" && "Guardado en este dispositivo"}
        {status === "saved-account" && "Guardado en tu cuenta"}
        {status === "error" && "No se pudo guardar. Tus cambios siguen en pantalla. Intenta guardar de nuevo."}
        {status === "saving" && "Guardando el borrador…"}
      </p>
    </div>
  );
}
