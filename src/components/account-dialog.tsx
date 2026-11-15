"use client";

import { ChevronDown, Eye, EyeOff, LogIn, LogOut, Sprout, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type SubmitEvent } from "react";
import { authClient } from "../lib/browser/auth-client";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export function AccountDialog() {
  const { data: session } = authClient.useSession();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!menuOpen) return;
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !accountRef.current?.contains(event.target)) setMenuOpen(false);
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [menuOpen]);

  function openAccount() {
    setMessage("");
    if (session) {
      setMenuOpen(!menuOpen);
      return;
    }
    setShowPassword(false);
    dialogRef.current?.showModal();
  }

  async function signIn(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const inputs = new FormData(form);
    setMessage("");
    setPending(true);
    try {
      const result = await authClient.signIn.username({
        username: String(inputs.get("username") ?? "").trim(),
        password: String(inputs.get("password") ?? ""),
      });
      if (result.error) {
        setMessage(result.error.status === 401 ? "Revisa el ID y la contraseña." : result.error.status === 429
          ? "Demasiados intentos. Prueba de nuevo en un momento."
          : "No pudimos iniciar sesión. Revisa tu conexión e inténtalo de nuevo.");
        return;
      }
      form.reset();
      dialogRef.current?.close();
    } catch {
      setMessage("No pudimos iniciar sesión. Revisa tu conexión e inténtalo de nuevo.");
    } finally {
      setPending(false);
    }
  }

  async function signOut() {
    setMessage("");
    setPending(true);
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error("sign-out");
      setMenuOpen(false);
      triggerRef.current?.focus();
    } catch {
      setMessage("No pudimos cerrar la sesión. Inténtalo de nuevo con conexión.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div ref={accountRef} className="account-anchor"
        onKeyDown={(event) => {
          if (event.key !== "Escape" || !menuOpen) return;
          event.preventDefault();
          setMenuOpen(false);
          triggerRef.current?.focus();
        }}
        onBlur={(event) => {
          if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setMenuOpen(false);
        }}>
        <button ref={triggerRef} type="button" className="project-link"
          aria-haspopup={session ? undefined : "dialog"}
          aria-expanded={session ? menuOpen : undefined} aria-controls={session ? menuId : undefined} onClick={openAccount}>
          {session ? <>
            <span className="account-initial" aria-hidden="true">{session.user.name.slice(0, 1).toUpperCase()}</span>
            <span className="min-w-0 truncate">{session.user.name}</span>
            <ChevronDown size={16} aria-hidden="true" className={menuOpen ? "shrink-0 rotate-180" : "shrink-0"} />
          </> : <><LogIn size={17} aria-hidden="true" /> Iniciar sesión</>}
        </button>
        {session && <div id={menuId} className="account-menu" hidden={!menuOpen}>
          <div className="account-menu-identity">
            <span className="account-initial" aria-hidden="true">{session.user.name.slice(0, 1).toUpperCase()}</span>
            <div className="min-w-0">
              <p className="truncate font-bold">{session.user.name}</p>
              <p className="truncate text-xs text-muted">{session.user.username ? `@${session.user.username}` : "Cuenta activa"}</p>
            </div>
          </div>
          <Button type="button" variant="secondary" className="account-sign-out" onClick={() => void signOut()} disabled={pending}>
            <LogOut size={18} aria-hidden="true" /> {pending ? "Cerrando sesión…" : "Cerrar sesión"}
          </Button>
          {message && <p role="alert" className="px-2 pb-2 text-sm text-red-800">{message}</p>}
        </div>}
      </div>
      <dialog ref={dialogRef} className="account-dialog" aria-labelledby="account-title" aria-describedby="account-description"
        onClose={(event) => event.currentTarget.querySelector("form")?.reset()}
        onClick={(event) => { if (event.target === event.currentTarget && !pending) event.currentTarget.close(); }}
        onCancel={(event) => { if (pending) event.preventDefault(); }}>
        <div className="account-dialog-content">
          <button type="button" className="account-close" aria-label="Cerrar ventana" onClick={() => dialogRef.current?.close()} disabled={pending}>
            <X size={21} aria-hidden="true" />
          </button>
          <span className="account-mark"><Sprout size={25} aria-hidden="true" /></span>
          <h2 id="account-title" className="mt-4 text-3xl leading-tight font-bold">Iniciar sesión</h2>
          <p id="account-description" className="mt-2 text-sm leading-relaxed text-muted">
            Guarda tus parcelas, cultivos y turnos en tu cuenta para retomarlos al volver.
          </p>

          <form className="mt-5 grid gap-4" onSubmit={signIn}>
            <div className="grid gap-1.5">
              <label className="text-sm font-semibold" htmlFor="account-username">ID de usuario</label>
              <Input id="account-username" name="username" placeholder="Escribe tu ID" autoComplete="username" autoCapitalize="none" required maxLength={30} />
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-semibold" htmlFor="account-password">Contraseña</label>
              <div className="relative">
                <Input id="account-password" name="password" type={showPassword ? "text" : "password"}
                  placeholder="Escribe tu contraseña" autoComplete="current-password" required maxLength={128} className="pr-12" />
                <button type="button" className="absolute inset-y-0 right-0 grid w-11 cursor-pointer place-items-center rounded-xl text-muted"
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"} aria-controls="account-password"
                  onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                </button>
              </div>
            </div>
            {message && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{message}</p>}
            <Button type="submit" disabled={pending}><LogIn size={17} aria-hidden="true" /> {pending ? "Entrando…" : "Entrar"}</Button>
          </form>

          <div className="mt-5 border-t border-line pt-3">
            <button type="button" onClick={() => dialogRef.current?.close()} disabled={pending}
              className="min-h-10 cursor-pointer px-1 text-sm font-semibold text-action underline-offset-4 hover:underline">
              Continuar como invitado
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
