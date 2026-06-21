/**
 * Skeleton para la navegación entre pestañas del adulto mayor. El encabezado
 * con el nombre y la sub-navegación viven en el layout y siguen visibles; acá
 * solo mostramos un placeholder del contenido mientras carga la pestaña.
 */
export default function ElderLoading() {
  return (
    <div className="flex flex-col gap-4">
      {Array.from({ length: 2 }).map((_, i) => (
        <div
          key={i}
          className="bg-card flex flex-col gap-3 rounded-xl p-4 ring-1 ring-foreground/10"
        >
          <div className="bg-muted h-5 w-1/3 animate-pulse rounded-md" />
          <div className="bg-muted h-4 w-full animate-pulse rounded-md" />
          <div className="bg-muted h-4 w-5/6 animate-pulse rounded-md" />
        </div>
      ))}
    </div>
  );
}
