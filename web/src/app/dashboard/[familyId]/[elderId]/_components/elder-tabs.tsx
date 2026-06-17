"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  CalendarRange,
  FileText,
  MessageCircle,
  TrendingUp,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Sub-navegación del panel de un adulto mayor:
 * Reportes / Tendencias / Resumen / Alertas / Consultar.
 * Resalta la pestaña activa según el pathname y muestra un badge con la
 * cantidad de alertas pendientes en el tab de Alertas.
 */
export function ElderTabs({
  familyId,
  elderId,
  pendingAlerts = 0,
}: {
  familyId: string;
  elderId: string;
  pendingAlerts?: number;
}) {
  const pathname = usePathname();
  const base = `/dashboard/${familyId}/${elderId}`;

  const tabs = [
    { label: "Reportes", href: base, icon: FileText, exact: true },
    {
      label: "Tendencias",
      href: `${base}/tendencias`,
      icon: TrendingUp,
      exact: false,
    },
    {
      label: "Resumen",
      href: `${base}/resumen`,
      icon: CalendarRange,
      exact: false,
    },
    {
      label: "Alertas",
      href: `${base}/alertas`,
      icon: Bell,
      exact: false,
      badge: pendingAlerts,
    },
    {
      label: "Consultar",
      href: `${base}/consultar`,
      icon: MessageCircle,
      exact: false,
    },
  ];

  return (
    <nav className="border-border flex gap-1 overflow-x-auto border-b">
      {tabs.map(({ label, href, icon: Icon, exact, badge }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
              active
                ? "border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground border-transparent"
            )}
          >
            <Icon className="size-4" />
            {label}
            {badge && badge > 0 ? (
              <span className="bg-primary text-primary-foreground inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold">
                {badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
