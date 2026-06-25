import type { Metadata } from "next";

import { AuthForm } from "../auth-form";
import { signup } from "../actions";

export const metadata: Metadata = {
  title: "Crear cuenta · CuidaVoz",
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectedFrom?: string }>;
}) {
  const { redirectedFrom } = await searchParams;
  return (
    <AuthForm mode="signup" action={signup} redirectedFrom={redirectedFrom} />
  );
}
