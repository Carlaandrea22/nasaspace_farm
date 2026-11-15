"use client";

import { ChevronDown, Eye, EyeOff, LogIn, LogOut, Sprout, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type SubmitEvent } from "react";
import { authClient } from "../lib/browser/auth-client";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export function AccountDialog() {
  const { data: session } = authClient.useSession();
  const path = usePathname();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [register, setRegister] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!menuOpen) return;
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !accountRef.current?.contains(event.target)) setMenuOpen(false);
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [menuOpen]);

  useEffect(() => {
    if (dialogRef.current?.open) dialogRef.current.querySelector<HTMLInputElement>("input")?.focus();
  }, [register]);

  function openAccount(createAccount: boolean) {
    setMessage("");
    setShowPassword(false);
    setRegister(createAccount);
    dialogRef.current?.showModal();
  }

  async function submitAccount(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const inputs = new FormData(form);
    setMessage("");
    setPending(true);
    try {
      const login = String(inputs.get("login") ?? "").trim();
      const password = String(inputs.get("password") ?? "");
      const result = register
        ? await authClient.signUp.email({ email: login, password, name: String(inputs.get("name") ?? "").trim() })
        : login.includes("@")
          ? await authClient.signIn.email({ email: login, password })
          : await authClient.signIn.username({ username: login, password });
      if (result.error) {
        if (result.error.status === 429) setMessage("Demasiados intentos. Prueba de nuevo en un momento.");
        else if (register && result.error.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") {
          setMessage("Ya hay una cuenta con ese correo. Pulsa Iniciar sesión.");
        } else if (!register && result.error.status === 401) {
          setMessage(login.includes("@") ? "Revisa el correo y la contraseña." : "Revisa el ID y la contraseña.");
        } else if (register && result.error.status < 500) {
          setMessage("Revisa tu nombre, correo y contraseña. Usa al menos 8 caracteres en la contraseña.");
        } else {
          setMessage("El acceso a tu cuenta no está disponible. Inténtalo de nuevo en un momento.");
        }
        return;
      }
      form.reset();
      dialogRef.current?.close();
    } catch {
      setMessage("El acceso a tu cuenta no está disponible. Inténtalo de nuevo en un momento.");
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
      {session ? <div ref={accountRef} className="account-anchor"
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
          aria-expanded={menuOpen} aria-controls={menuId} onClick={() => { setMessage(""); setMenuOpen(!menuOpen); }}>
          <span className="account-initial" aria-hidden="true">{session.user.name.slice(0, 1).toUpperCase()}</span>
          <span className="min-w-0 truncate">{session.user.name}</span>
          <ChevronDown size={16} aria-hidden="true" className={menuOpen ? "shrink-0 rotate-180" : "shrink-0"} />
        </button>
        <div id={menuId} className="account-menu" hidden={!menuOpen}>
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
        </div>
      </div> : <nav className="guest-navigation" aria-label="Navegación principal">
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="guest-link" href="/" aria-current={path === "/" ? "page" : undefined}>Explorar</a>
        <button type="button" className="guest-link" aria-haspopup="dialog" onClick={() => openAccount(false)}>Iniciar sesión</button>
        <button type="button" className="project-link" aria-haspopup="dialog" onClick={() => openAccount(true)}>Crear cuenta</button>
      </nav>}
      <dialog ref={dialogRef} className="account-dialog" aria-labelledby="account-title" aria-describedby="account-description"
        onClose={(event) => event.currentTarget.querySelector("form")?.reset()}
        onClick={(event) => { if (event.target === event.currentTarget && !pending) event.currentTarget.close(); }}
        onCancel={(event) => { if (pending) event.preventDefault(); }}>
        <div className="account-dialog-content">
          <button type="button" className="account-close" aria-label="Cerrar ventana" onClick={() => dialogRef.current?.close()} disabled={pending}>
            <X size={21} aria-hidden="true" />
          </button>
          <span className="account-mark"><Sprout size={25} aria-hidden="true" /></span>
          <h2 id="account-title" className="mt-4 text-3xl leading-tight font-bold">{register ? "Crear cuenta" : "Iniciar sesión"}</h2>
          <p id="account-description" className="mt-2 text-sm leading-relaxed text-muted">
            Guarda tus parcelas, cultivos y turnos en tu cuenta para retomarlos al volver.
          </p>

          <form key={String(register)} className="mt-5 grid gap-4" onSubmit={submitAccount}>
            {register && <div className="grid gap-1.5">
              <label className="text-sm font-semibold" htmlFor="account-name">Tu nombre</label>
              <Input id="account-name" name="name" autoComplete="name" required maxLength={80} pattern={".*\\S.*"} />
            </div>}
            <div className="grid gap-1.5">
              <label className="text-sm font-semibold" htmlFor="account-username">{register ? "Correo electrónico" : "Correo o ID de usuario"}</label>
              <Input id="account-username" name="login" type={register ? "email" : "text"} inputMode="email"
                autoComplete={register ? "email" : "username"} autoCapitalize="none" required maxLength={254} />
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-semibold" htmlFor="account-password">Contraseña</label>
              <div className="relative">
                <Input id="account-password" name="password" type={showPassword ? "text" : "password"}
                  placeholder={register ? "Al menos 8 caracteres" : "Escribe tu contraseña"}
                  autoComplete={register ? "new-password" : "current-password"} required minLength={register ? 8 : undefined} maxLength={128} className="pr-12" />
                <button type="button" className="absolute inset-y-0 right-0 grid w-11 cursor-pointer place-items-center rounded-xl text-muted"
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"} aria-controls="account-password"
                  onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                </button>
              </div>
            </div>
            {message && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{message}</p>}
            <Button type="submit" disabled={pending}><LogIn size={17} aria-hidden="true" />
              {register ? (pending ? "Creando cuenta…" : "Crear cuenta") : (pending ? "Entrando…" : "Entrar")}
            </Button>
          </form>

          <div className="mt-5 flex flex-wrap justify-between gap-x-3 border-t border-line pt-3">
            <button type="button" disabled={pending} className="min-h-10 cursor-pointer px-1 text-sm font-bold text-action underline-offset-4 hover:underline"
              onClick={() => { setRegister(!register); setMessage(""); setShowPassword(false); }}>
              {register ? "Iniciar sesión" : "Crear cuenta"}
            </button>
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
