import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

/**
 * Estado vacío reutilizable: ícono, título, descripción y una acción opcional.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
        <div className="bg-accent text-primary flex size-12 items-center justify-center rounded-xl">
          <Icon className="size-6" />
        </div>
        <div className="space-y-1">
          <p className="font-medium">{title}</p>
          <p className="text-muted-foreground mx-auto max-w-sm text-sm">
            {description}
          </p>
        </div>
        {action}
      </CardContent>
    </Card>
  );
}
