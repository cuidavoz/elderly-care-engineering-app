import Link from "next/link";

import { Logo } from "@/components/logo";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="bg-muted/30 flex min-h-svh flex-col items-center justify-center gap-6 p-6">
      <Link href="/">
        <Logo className="gap-2.5" markClassName="size-8" />
      </Link>
      {children}
    </div>
  );
}
