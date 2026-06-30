import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getFamilies } from "@/lib/data/queries";
import { DashboardSidebar } from "./_components/sidebar";
import { DashboardHeader } from "./_components/header";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  // Verificación de sesión en el server. El proxy ya redirige, pero esto es
  // defensa en profundidad y nos da los datos del usuario para el header.
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) {
    redirect("/login");
  }

  const claims = data.claims;
  const email = typeof claims.email === "string" ? claims.email : "";
  const metadata = (claims.user_metadata ?? {}) as Record<string, unknown>;
  const fullName =
    typeof metadata.full_name === "string" ? metadata.full_name : "";
  const displayName = fullName || email || "Cuidador/a";

  // Familias para el selector del sidebar (RLS filtra por membresía).
  const families = await getFamilies();

  // Un usuario que solo tiene rol adulto_mayor no debería ver el dashboard de
  // cuidadores — lo mandamos a su propia vista simplificada.
  if (families.length > 0 && families.every((f) => f.rol === "adulto_mayor")) {
    redirect("/elder");
  }

  return (
    <div className="flex min-h-svh">
      <DashboardSidebar families={families} />
      <div className="flex flex-1 flex-col">
        <DashboardHeader displayName={displayName} email={email} families={families} />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
