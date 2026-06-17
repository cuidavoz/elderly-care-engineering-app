import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, UserRound } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getElders, getFamily } from "@/lib/data/queries";
import { CreateElderDialog } from "../_components/create-elder-dialog";
import { EmptyState } from "../_components/empty-state";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ familyId: string }>;
}): Promise<Metadata> {
  const { familyId } = await params;
  const family = await getFamily(familyId);
  return { title: family?.nombre ?? "Familia" };
}

export default async function FamilyPage({
  params,
}: {
  params: Promise<{ familyId: string }>;
}) {
  const { familyId } = await params;
  const [family, elders] = await Promise.all([
    getFamily(familyId),
    getElders(familyId),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {family?.nombre}
          </h1>
          <p className="text-muted-foreground">
            Adultos mayores de esta familia. Elegí uno para ver su panel.
          </p>
        </div>
        {elders.length > 0 && <CreateElderDialog familyId={familyId} />}
      </div>

      {elders.length === 0 ? (
        <EmptyState
          icon={UserRound}
          title="Todavía no hay adultos mayores"
          description="Sumá a la primera persona que cuidás para empezar a ver sus reportes y alertas."
          action={<CreateElderDialog familyId={familyId} />}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {elders.map((elder) => {
            const notas =
              typeof elder.metadata?.notas === "string"
                ? elder.metadata.notas
                : null;
            return (
              <Link
                key={elder.id}
                href={`/dashboard/${familyId}/${elder.id}`}
              >
                <Card className="hover:ring-primary/30 h-full transition-all hover:ring-2">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="bg-accent text-primary flex size-9 items-center justify-center rounded-full">
                        <UserRound className="size-4" />
                      </div>
                      <CardTitle className="flex-1">{elder.nombre}</CardTitle>
                      <ChevronRight className="text-muted-foreground size-4" />
                    </div>
                    {notas ? (
                      <CardDescription className="mt-2 line-clamp-2">
                        {notas}
                      </CardDescription>
                    ) : (
                      <CardDescription className="mt-2">
                        Ver reportes y alertas.
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="text-muted-foreground text-xs">
                    Agregado el{" "}
                    {new Date(elder.created_at).toLocaleDateString("es-AR")}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
