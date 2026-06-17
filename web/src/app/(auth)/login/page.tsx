import type { Metadata } from "next";

import { AuthForm } from "../auth-form";
import { login } from "../actions";

export const metadata: Metadata = {
  title: "Ingresar · CuidaVoz",
};

export default function LoginPage() {
  return <AuthForm mode="login" action={login} />;
}
