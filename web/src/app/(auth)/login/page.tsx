import type { Metadata } from "next";

import { AuthForm } from "../auth-form";
import { login } from "../actions";

export const metadata: Metadata = {
  title: "Ingresar · CuidaVoz",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectedFrom?: string; notice?: string }>;
}) {
  const { redirectedFrom, notice } = await searchParams;
  return (
    <AuthForm
      mode="login"
      action={login}
      redirectedFrom={redirectedFrom}
      notice={notice}
    />
  );
}
