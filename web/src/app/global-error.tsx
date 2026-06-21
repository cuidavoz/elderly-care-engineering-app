"use client"; // Los error boundaries deben ser Client Components.

// global-error reemplaza al root layout cuando se activa, así que tiene que
// renderizar su propio <html>/<body> e importar los estilos globales para
// mantener la marca (tipografías y tokens del tema).
import "./globals.css";

/**
 * Boundary de último recurso: captura errores que escapan al root layout.
 * Como reemplaza al layout, define su propio documento. Lo mantenemos mínimo:
 * un mensaje y un botón para reintentar.
 *
 * En Next 16.2 el prop de recuperación es `unstable_retry`; dejamos `reset`
 * como fallback por compatibilidad.
 */
export default function GlobalError({
  unstable_retry,
  reset,
}: {
  error: Error & { digest?: string };
  unstable_retry?: () => void;
  reset?: () => void;
}) {
  function onRetry() {
    if (unstable_retry) {
      unstable_retry();
    } else {
      reset?.();
    }
  }

  return (
    <html lang="es-AR" className="h-full antialiased">
      <body className="bg-background text-foreground flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-semibold tracking-tight">
          Algo salió mal
        </h1>
        <p className="text-muted-foreground max-w-md text-sm">
          Ocurrió un error inesperado. Probá recargar; si sigue pasando,
          volvé a entrar en un momento.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="bg-primary text-primary-foreground hover:bg-primary/80 inline-flex h-8 items-center justify-center rounded-lg px-3 text-sm font-medium transition-colors"
        >
          Reintentar
        </button>
      </body>
    </html>
  );
}
