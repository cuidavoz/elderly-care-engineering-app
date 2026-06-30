import { redirect } from "next/navigation";
import { Mic } from "lucide-react";

import { createClient } from "@/lib/supabase/server";

export default async function ElderPage() {
  const supabase = await createClient();

  // Null-guard ronda 6 I1: si la sesión no está disponible, redirigir al login.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: elder } = await supabase
    .from("elders")
    .select("id, nombre")
    .eq("user_id", user.id)
    .maybeSingle();

  // Si no hay elder vinculado a este usuario, lo mandamos al dashboard por las dudas.
  if (!elder) redirect("/dashboard");

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-10 p-8 text-center">
      <div className="space-y-2">
        <h1 className="text-4xl font-bold">Hola, {elder.nombre}</h1>
        <p className="text-muted-foreground text-lg">
          Tocá el micrófono cuando quieras contarme cómo estás
        </p>
      </div>

      <button
        className="bg-primary text-primary-foreground hover:bg-primary/90 flex h-32 w-32 cursor-not-allowed items-center justify-center rounded-full shadow-lg transition-colors opacity-60"
        disabled
        aria-label="Grabar"
      >
        <Mic className="size-12" />
      </button>

      <p className="text-muted-foreground text-sm">
        Función de grabación en desarrollo
      </p>
    </main>
  );
}
