"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { MailCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AuthState } from "./actions";

type Mode = "login" | "signup";

type AuthFormProps = {
  mode: Mode;
  action: (state: AuthState, formData: FormData) => Promise<AuthState>;
  /** Destino al que volver tras autenticarse (p. ej. una invitación). */
  redirectedFrom?: string;
  /** Aviso a mostrar como toast al montar (p. ej. error de confirmación). */
  notice?: string;
};

const copy = {
  login: {
    title: "Ingresar",
    description: "Accedé a tu panel de CuidaVoz.",
    submit: "Ingresar",
    footerText: "¿No tenés cuenta?",
    footerLink: "/signup",
    footerCta: "Crear cuenta",
  },
  signup: {
    title: "Crear cuenta",
    description: "Registrate para empezar a cuidar mejor.",
    submit: "Crear cuenta",
    footerText: "¿Ya tenés cuenta?",
    footerLink: "/login",
    footerCta: "Ingresar",
  },
} as const;

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Procesando..." : label}
    </Button>
  );
}

/** Agrega `?redirectedFrom=...` a un href interno, si corresponde. */
function withRedirect(href: string, redirectedFrom?: string): string {
  if (!redirectedFrom) return href;
  return `${href}?redirectedFrom=${encodeURIComponent(redirectedFrom)}`;
}

export function AuthForm({
  mode,
  action,
  redirectedFrom,
  notice,
}: AuthFormProps) {
  const [state, formAction] = useActionState<AuthState, FormData>(action, null);
  const t = copy[mode];

  // Cada submit devuelve un objeto `state` nuevo; guardamos la última referencia
  // ya notificada para no duplicar el toast en re-renders que no cambian el
  // estado (cada error nuevo, incluso con el mismo texto, es un objeto distinto
  // y se notifica una sola vez).
  const lastNotified = useRef<AuthState>(null);

  useEffect(() => {
    if (state && "error" in state && state !== lastNotified.current) {
      lastNotified.current = state;
      toast.error(state.error);
    }
  }, [state]);

  // Aviso de query string (p. ej. el link de confirmación falló/venció).
  const noticeShown = useRef(false);
  useEffect(() => {
    if (notice && !noticeShown.current) {
      noticeShown.current = true;
      if (notice === "confirm-error") {
        toast.error(
          "No pudimos confirmar tu correo (el link venció o ya se usó). Probá ingresar."
        );
      }
    }
  }, [notice]);

  // Signup con confirmación pendiente: pantalla "revisá tu correo".
  if (state && "status" in state && state.status === "check-email") {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="bg-accent text-primary mb-2 flex size-12 items-center justify-center rounded-2xl">
            <MailCheck className="size-6" />
          </div>
          <CardTitle className="text-2xl">Revisá tu correo</CardTitle>
          <CardDescription>
            Te enviamos un mail a <strong>{state.email}</strong> para confirmar
            tu cuenta. Abrí el link y vas a volver automáticamente para terminar.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          <p>
            ¿No te llegó? Revisá spam, o esperá un minuto y fijate de nuevo. El
            link vence en una hora.
          </p>
        </CardContent>
        <CardFooter>
          <Button asChild variant="outline" className="w-full">
            <Link href={withRedirect("/login", redirectedFrom)}>
              Volver a ingresar
            </Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-2xl">{t.title}</CardTitle>
        <CardDescription>{t.description}</CardDescription>
      </CardHeader>
      <form action={formAction}>
        {/* Destino post-auth (la invitación, si el usuario vino de un link). */}
        {redirectedFrom && (
          <input type="hidden" name="redirectedFrom" value={redirectedFrom} />
        )}
        <CardContent className="flex flex-col gap-4">
          {mode === "signup" && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="fullName">Nombre completo</Label>
              <Input
                id="fullName"
                name="fullName"
                type="text"
                autoComplete="name"
                placeholder="Ana Pérez"
              />
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="ana@ejemplo.com"
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              minLength={6}
              required
            />
          </div>
        </CardContent>
        <CardFooter className="mt-6 flex flex-col gap-4">
          <SubmitButton label={t.submit} />
          <p className="text-muted-foreground text-center text-sm">
            {t.footerText}{" "}
            <Link
              href={withRedirect(t.footerLink, redirectedFrom)}
              className="text-primary font-medium hover:underline"
            >
              {t.footerCta}
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
