import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="bg-muted/30 flex min-h-svh flex-col items-center justify-center gap-6 p-6">
      <Link href="/" className="text-2xl font-semibold tracking-tight">
        CuidaVoz <span aria-hidden>💜</span>
      </Link>
      {children}
    </div>
  );
}
