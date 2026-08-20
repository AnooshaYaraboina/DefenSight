import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { readSession, pruneExpiredSessions } from "@/lib/rbac/auth";
import { LoginForm } from "@/components/layout/login-form";
import { Logo, Wordmark } from "@/components/layout/logo";
import { ROLE_META, type Role } from "@/lib/engine/taxonomy";
import { DEMO_PASSWORD } from "../../../scripts/seed/organization";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  const existing = await readSession();
  if (existing) redirect("/dashboard");

  await pruneExpiredSessions();

  // One representative account per role, so a reviewer can see RBAC change what
  // is visible and permitted rather than only reading about it.
  const accounts = await Promise.all(
    (["SECURITY_ADMIN", "SECURITY_ANALYST", "VIEWER"] as Role[]).map(async (role) => {
      const user = await prisma.user.findFirst({
        where: { role },
        select: { name: true, email: true, department: true, clearance: true },
        orderBy: { name: "asc" },
      });
      return user ? { ...user, role } : null;
    }),
  );

  return (
    <div className="ds-noise relative flex min-h-dvh items-center justify-center overflow-hidden bg-base px-5 py-10">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0">
        <div className="ds-grid-bg absolute inset-0 opacity-40" />
        <div
          className="ds-aurora absolute -top-64 left-1/2 h-[38rem] w-[56rem] -translate-x-1/2 blur-[110px]"
          style={{ background: "radial-gradient(ellipse 60% 50% at 50% 50%, color-mix(in oklab, var(--color-brand) 45%, transparent) 0%, transparent 70%)" }}
        />
        <div
          className="absolute inset-0"
          style={{ background: "radial-gradient(ellipse 80% 55% at 50% 35%, transparent 25%, var(--color-base) 100%)" }}
        />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center text-center">
          <Logo size={34} />
          <Wordmark className="mt-3 text-xl" />
          <p className="mt-2 text-xs text-ink-3">AI Security Defense &amp; Monitoring</p>
        </div>

        <div className="ds-glass rounded-panel p-6">
          <LoginForm
            accounts={accounts.filter((a): a is NonNullable<typeof a> => a !== null).map((a) => ({
              ...a,
              roleLabel: ROLE_META[a.role].label,
              roleDescription: ROLE_META[a.role].description,
            }))}
            demoPassword={DEMO_PASSWORD}
          />
        </div>

        <p className="mt-5 text-center text-[10px] leading-relaxed text-ink-4">
          Sessions are signed and server-side revocable. Every sign-in, failed attempt and
          sign-out is written to the audit log.
        </p>
      </div>
    </div>
  );
}
