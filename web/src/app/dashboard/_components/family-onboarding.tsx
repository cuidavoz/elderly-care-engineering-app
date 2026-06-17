import { HeartHandshake } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateFamilyDialog } from "./create-family-dialog";

/**
 * Pantalla de bienvenida cuando el cuidador todavía no tiene ninguna familia.
 */
export function FamilyOnboarding() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-6 py-12 text-center">
      <div className="bg-accent text-primary flex size-16 items-center justify-center rounded-2xl">
        <HeartHandshake className="size-8" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Creá tu primera familia
        </h1>
        <p className="text-muted-foreground">
          En CuidaVoz, una familia agrupa a los adultos mayores que cuidás. Es
          tu espacio de trabajo: ahí vas a ver los reportes diarios y las
          alertas de cada persona.
        </p>
      </div>

      <Card className="w-full text-left">
        <CardHeader>
          <CardTitle>Empecemos</CardTitle>
          <CardDescription>
            Creá una familia y después sumá a los adultos mayores que cuidás.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center pb-2">
          <CreateFamilyDialog triggerLabel="Crear mi primera familia" />
        </CardContent>
      </Card>
    </div>
  );
}
