"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type AuthState = { error: string } | null;

function readCredentials(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  return { email, password };
}

/**
 * Inicia sesión con email + contraseña.
 * Devuelve `{ error }` para que el formulario muestre un toast, o redirige
 * a /dashboard si todo sale bien.
 */
export async function login(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const { email, password } = readCredentials(formData);

  if (!email || !password) {
    return { error: "Ingresá tu email y contraseña." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: traducirError(error.message) };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

/**
 * Registra un nuevo cuidador con email + contraseña.
 */
export async function signup(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const { email, password } = readCredentials(formData);
  const fullName = String(formData.get("fullName") ?? "").trim();

  if (!email || !password) {
    return { error: "Ingresá tu email y contraseña." };
  }
  if (password.length < 6) {
    return { error: "La contraseña debe tener al menos 6 caracteres." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: fullName ? { full_name: fullName } : undefined,
    },
  });

  if (error) {
    return { error: traducirError(error.message) };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
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
    return "Tenés que confirmar tu email antes de ingresar.";
  }
  if (m.includes("rate limit") || m.includes("too many")) {
    return "Demasiados intentos. Probá de nuevo en unos minutos.";
  }
  return message || "Ocurrió un error. Intentá de nuevo.";
}
