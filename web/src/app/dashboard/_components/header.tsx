import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { MobileNav } from "./mobile-nav";
import { signout } from "@/app/(auth)/actions";
import type { FamilyWithRole } from "@/lib/types";

export function DashboardHeader({
  displayName,
  email,
  families,
}: {
  displayName: string;
  email: string;
  families: FamilyWithRole[];
}) {
  return (
    <header className="bg-background/80 sticky top-0 z-10 flex h-16 items-center justify-between border-b px-6 backdrop-blur">
      <MobileNav families={families} />
      <div className="flex flex-1 items-center justify-end gap-4">
        <div className="hidden flex-col text-right leading-tight sm:flex">
          <span className="text-sm font-medium">{displayName}</span>
          {email && (
            <span className="text-muted-foreground text-xs">{email}</span>
          )}
        </div>
        <form action={signout}>
          <Button type="submit" variant="outline" size="sm">
            <LogOut className="h-4 w-4" />
            Salir
          </Button>
        </form>
      </div>
    </header>
  );
}
