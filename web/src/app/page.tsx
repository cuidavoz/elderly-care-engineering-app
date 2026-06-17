import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";

export default function Home() {
  return (
    <main className="flex min-h-svh flex-col">
      <header className="flex items-center justify-between p-6">
        <Logo className="gap-2.5" markClassName="size-8" />
        <nav className="flex items-center gap-2">
          <Button asChild variant="ghost">
            <Link href="/login">Ingresar</Link>
          </Button>
          <Button asChild>
            <Link href="/signup">Crear cuenta</Link>
          </Button>
        </nav>
      </header>

      <section className="mx-auto flex max-w-2xl flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl">
          Cuidá mejor a quien más querés
        </h1>
        <p className="text-muted-foreground text-lg text-balance">
          CuidaVoz transcribe lo que pasa en el día y arma reportes claros,
          alertas y un historial que podés consultar cuando quieras. Pensado
          para cuidadores y familias de adultos mayores.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link href="/signup">Empezar gratis</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/login">Ya tengo cuenta</Link>
          </Button>
        </div>
      </section>

      <footer className="text-muted-foreground p-6 text-center text-sm">
        CuidaVoz · Cuidado de adultos mayores
      </footer>
    </main>
  );
}
