import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { NotificationToggle } from "@/components/notification-toggle";
import { signout } from "@/app/(auth)/actions";
import { RecordButton } from "./_components/record-button";

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
    <main className="relative flex min-h-svh flex-col items-center justify-center gap-10 p-8 text-center">
      <form action={signout} className="absolute right-4 top-4">
        <Button
          type="submit"
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
        >
          <LogOut className="h-4 w-4" />
          Cerrar sesión
        </Button>
      </form>

      <div className="space-y-2">
        <h1 className="text-4xl font-bold">Hola, {elder.nombre}</h1>
        <p className="text-muted-foreground text-lg">
          Tocá el micrófono cuando quieras contarme cómo estás
        </p>
      </div>

      <NotificationToggle elderId={elder.id} />

      <RecordButton elderId={elder.id} />
    </main>
  );
}
