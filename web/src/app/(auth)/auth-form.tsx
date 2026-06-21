"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";

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

export function AuthForm({ mode, action }: AuthFormProps) {
  const [state, formAction] = useActionState<AuthState, FormData>(action, null);
  const t = copy[mode];

  // Cada submit devuelve un objeto `state` nuevo; guardamos la última referencia
  // ya notificada para no duplicar el toast en re-renders que no cambian el
  // estado (cada error nuevo, incluso con el mismo texto, es un objeto distinto
  // y se notifica una sola vez).
  const lastNotified = useRef<AuthState>(null);

  useEffect(() => {
    if (state?.error && state !== lastNotified.current) {
      lastNotified.current = state;
      toast.error(state.error);
    }
  }, [state]);

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-2xl">{t.title}</CardTitle>
        <CardDescription>{t.description}</CardDescription>
      </CardHeader>
      <form action={formAction}>
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
              href={t.footerLink}
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
