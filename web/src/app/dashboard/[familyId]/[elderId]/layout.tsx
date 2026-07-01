import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, UserRound } from "lucide-react";

import { NotificationToggle } from "@/components/notification-toggle";
import { getElder, getPendingAlertCount } from "@/lib/data/queries";
import { ElderTabs } from "./_components/elder-tabs";

/**
 * Layout del panel de un adulto mayor. Valida el elder (RLS: solo si es de una
 * familia del usuario) y verifica que pertenezca a la familia de la URL.
 * Renderiza el encabezado con su nombre + la sub-navegación.
 */
export default async function ElderLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ familyId: string; elderId: string }>;
}) {
  const { familyId, elderId } = await params;
  const elder = await getElder(elderId);

  if (!elder || elder.family_id !== familyId) {
    notFound();
  }

  const pendingAlerts = await getPendingAlertCount(elderId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link
          href={`/dashboard/${familyId}`}
          className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1.5 text-sm"
        >
          <ArrowLeft className="size-4" />
          Volver a la familia
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-accent text-primary flex size-10 items-center justify-center rounded-full">
              <UserRound className="size-5" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {elder.nombre}
            </h1>
          </div>

          <NotificationToggle elderId={elderId} align="end" />
        </div>
      </div>

      <ElderTabs
        familyId={familyId}
        elderId={elderId}
        pendingAlerts={pendingAlerts}
      />

      <div>{children}</div>
    </div>
  );
}
