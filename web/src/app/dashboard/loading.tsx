/**
 * Skeleton del dashboard. Se muestra mientras el server renderiza la página
 * del segmento. Da feedback inmediato al navegar (el backend en frío puede
 * tardar varios segundos). Coherente con el layout: un título y unas cards
 * grises animadas.
 */
export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="bg-muted h-7 w-48 animate-pulse rounded-md" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="bg-card flex flex-col gap-3 rounded-xl p-4 ring-1 ring-foreground/10"
          >
            <div className="bg-muted h-5 w-2/3 animate-pulse rounded-md" />
            <div className="bg-muted h-4 w-full animate-pulse rounded-md" />
            <div className="bg-muted h-4 w-4/5 animate-pulse rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}
