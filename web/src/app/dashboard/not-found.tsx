import Link from "next/link";
import { SearchX } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function DashboardNotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <div className="bg-accent text-primary flex size-14 items-center justify-center rounded-2xl">
        <SearchX className="size-7" />
      </div>
      <h1 className="text-xl font-semibold tracking-tight">No encontramos eso</h1>
      <p className="text-muted-foreground text-sm">
        La familia o el adulto mayor no existe, o no tenés acceso. Probá volver a
        tus familias.
      </p>
      <Button asChild>
        <Link href="/dashboard/familia">Ir a mis familias</Link>
      </Button>
    </div>
  );
}
