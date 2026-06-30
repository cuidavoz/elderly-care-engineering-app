import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, HeartHandshake, Users } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
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
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const metadata = (data?.claims?.user_metadata ?? {}) as Record<string, unknown>;
  const fullName = typeof metadata.full_name === "string" ? metadata.full_name.trim() : "";

  const families = await getFamilies();

  if (families.length === 0) {
    return <FamilyOnboarding />;
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="bg-accent text-primary flex size-12 items-center justify-center rounded-2xl">
            <HeartHandshake className="size-6" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {fullName ? `Hola, ${fullName.split(" ")[0]}` : "Bienvenido/a"}
            </h1>
            <p className="text-muted-foreground">
              Elegí una familia para ver sus adultos mayores y reportes.
            </p>
          </div>
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
