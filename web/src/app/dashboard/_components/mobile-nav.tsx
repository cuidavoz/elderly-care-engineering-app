"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Menu } from "lucide-react";

import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import type { FamilyWithRole } from "@/lib/types";

export function MobileNav({ families }: { families: FamilyWithRole[] }) {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  const activeFamilyId = families.find((f) => f.id === segments[1])?.id ?? null;

  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button variant="ghost" size="icon-sm" className="md:hidden" />
        }
        aria-label="Abrir menú"
      >
        <Menu className="size-5" />
      </SheetTrigger>

      <SheetContent>
        <div className="flex h-16 items-center px-6">
          <Logo />
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
          <NavLink
            href="/dashboard"
            icon={Home}
            label="Inicio"
            active={pathname === "/dashboard"}
          />

          {families.length > 0 && (
            <div className="mt-4">
              <p className="text-muted-foreground px-3 pb-1 text-xs font-medium tracking-wide uppercase">
                Tus familias
              </p>
              {families.map((family) => (
                <Link
                  key={family.id}
                  href={`/dashboard/${family.id}`}
                  className={cn(
                    "flex items-center gap-3 truncate rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    activeFamilyId === family.id
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <span
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      activeFamilyId === family.id
                        ? "bg-primary"
                        : "bg-muted-foreground/40"
                    )}
                  />
                  <span className="truncate">{family.nombre}</span>
                </Link>
              ))}
            </div>
          )}
        </nav>
      </SheetContent>
    </Sheet>
  );
}

function NavLink({
  href,
  icon: Icon,
  label,
  active,
}: {
  href: string;
  icon: typeof Home;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      )}
    >
      <Icon className="size-4" />
      {label}
    </Link>
  );
}
