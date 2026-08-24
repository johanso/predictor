import { redirect } from "next/navigation";
import { getAccount } from "@/lib/auth/server";
import { LoginForm } from "@/components/auth/LoginForm";
import { Card } from "@/components/ui/Card";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getAccount()) redirect("/");

  const { next } = await searchParams;
  // Only same-origin paths, so ?next= cannot be used to bounce anyone off-site.
  const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6 py-16">
      <div>
        <h1 className="text-2xl font-semibold uppercase tracking-tight text-ink">Predictor</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Introduce el código de tu casa de apuestas. Cada casa lleva su propia banca y sus
          propias estadísticas.
        </p>
      </div>

      <Card>
        <LoginForm next={target} />
      </Card>
    </main>
  );
}
