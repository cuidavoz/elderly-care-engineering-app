"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

/**
 * Estado que devuelven las acciones de auth al formulario:
 *  - `{ error }`            → mostrar un toast de error.
 *  - `{ status: "check-email" }` → signup OK con confirmación pendiente: mostrar
 *    la pantalla "revisá tu correo".
 *  - `null`                 → estado inicial.
 * (En el camino feliz de login, o de signup sin confirmación, redirigimos y no
 *  devolvemos estado.)
 */
export type AuthState =
  | { error: string }
  | { status: "check-email"; email: string }
  | null;

function readCredentials(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  return { email, password };
}

/**
 * Normaliza el destino post-login a una ruta interna segura (evita open-redirect).
 * Solo aceptamos paths absolutos del propio sitio; cualquier otra cosa → /dashboard.
 */
function safeRedirect(raw: FormDataEntryValue | null): string {
  const value = String(raw ?? "").trim();
  if (value.startsWith("/") && !value.startsWith("//")) {
    return value;
  }
  return "/dashboard";
}

/** Base URL del sitio para armar enlaces absolutos en mails de confirmación. */
function getSiteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000"
  ).replace(/\/$/, "");
}

/**
 * Inicia sesión con email + contraseña.
 * Redirige a `redirectedFrom` (la invitación, si vino de un link) o a /dashboard.
 */
export async function login(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const { email, password } = readCredentials(formData);
  const destino = safeRedirect(formData.get("redirectedFrom"));

  if (!email || !password) {
    return { error: "Ingresá tu email y contraseña." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: traducirError(error.message) };
  }

  revalidatePath("/", "layout");
  redirect(destino);
}

/**
 * Registra un nuevo cuidador con email + contraseña.
 *
 * Con la confirmación de email activada, signUp NO devuelve sesión: mostramos la
 * pantalla "revisá tu correo" y pasamos `emailRedirectTo` para que, al confirmar,
 * el usuario vuelva a `redirectedFrom` (p. ej. la invitación). Si la confirmación
 * estuviera desactivada, signUp devuelve sesión y entramos directo.
 */
export async function signup(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const { email, password } = readCredentials(formData);
  const fullName = String(formData.get("fullName") ?? "").trim();
  const destino = safeRedirect(formData.get("redirectedFrom"));

  if (!email || !password) {
    return { error: "Ingresá tu email y contraseña." };
  }
  if (password.length < 6) {
    return { error: "La contraseña debe tener al menos 6 caracteres." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // `nombre` lo lee el trigger handle_new_user para poblar profiles.nombre;
      // `full_name` queda en user_metadata para el header.
      data: fullName ? { full_name: fullName, nombre: fullName } : undefined,
      emailRedirectTo: `${getSiteUrl()}${destino}`,
    },
  });

  if (error) {
    return { error: traducirError(error.message) };
  }

  // Confirmación desactivada: ya hay sesión → entramos directo al destino.
  if (data.session) {
    revalidatePath("/", "layout");
    redirect(destino);
  }

  // Confirmación activada: sin sesión todavía → "revisá tu correo".
  return { status: "check-email", email };
}

/**
 * Cierra la sesión actual y vuelve al login.
 */
export async function signout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

/**
 * Traducción mínima de los mensajes de error más comunes de Supabase a es-AR.
 */
function traducirError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) {
    return "Email o contraseña incorrectos.";
  }
  if (m.includes("user already registered")) {
    return "Ya existe una cuenta con ese email.";
  }
  if (m.includes("email not confirmed")) {
    return "Tenés que confirmar tu email antes de ingresar. Revisá tu correo.";
  }
  if (m.includes("rate limit") || m.includes("too many")) {
    return "Demasiados intentos. Probá de nuevo en unos minutos.";
  }
  return message || "Ocurrió un error. Intentá de nuevo.";
}
