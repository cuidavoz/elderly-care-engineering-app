import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Users } from "lucide-react";

import { getFamilies } from "@/lib/data/queries";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreateFamilyDialog } from "./_components/create-family-dialog";
import { FamilyOnboarding } from "./_components/family-onboarding";

export const metadata: Metadata = {
  title: "Panel",
};

export default async function DashboardPage() {
  const families = await getFamilies();

  if (families.length === 0) {
    return <FamilyOnboarding />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inicio</h1>
          <p className="text-muted-foreground">
            Elegí una familia para ver sus adultos mayores y reportes.
          </p>
        </div>
        <CreateFamilyDialog />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {families.map((family) => (
          <Link key={family.id} href={`/dashboard/${family.id}`}>
            <Card className="hover:ring-primary/30 h-full transition-all hover:ring-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="bg-accent text-primary flex size-9 items-center justify-center rounded-lg">
                    <Users className="size-4" />
                  </div>
                  <Badge variant={family.isOwner ? "default" : "secondary"}>
                    {family.isOwner
                      ? "Propietario/a"
                      : family.rol === "adulto_mayor"
                        ? "Adulto mayor"
                        : family.rol === "familiar"
                          ? "Familiar"
                          : "Cuidador/a"}
                  </Badge>
                </div>
                <CardTitle className="mt-2 flex items-center justify-between">
                  {family.nombre}
                  <ChevronRight className="text-muted-foreground size-4" />
                </CardTitle>
                <CardDescription>
                  Ver adultos mayores, reportes y alertas.
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
