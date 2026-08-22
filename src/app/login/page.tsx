import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { readSession, pruneExpiredSessions } from "@/lib/rbac/auth";
import { LoginForm } from "@/components/layout/login-form";
import { LogoLockup } from "@/components/layout/logo";
import { ROLE_META, type Role } from "@/lib/engine/taxonomy";
import { DEMO_PASSWORD, DEMO_ACCOUNTS } from "../../../scripts/seed/organization";

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
      const select = { name: true, email: true, department: true, clearance: true };
      // Prefer the documented address for the role; fall back to any user with
      // that role so the screen still works against a differently seeded db.
      const user =
        (await prisma.user.findFirst({
          where: { role, email: DEMO_ACCOUNTS[role] },
          select,
        })) ??
        (await prisma.user.findFirst({ where: { role }, select, orderBy: { name: "asc" } }));
      return user ? { ...user, role } : null;
    }),
  );

  return (
    <div className="ds-noise relative flex min-h-dvh items-center justify-center overflow-hidden bg-base px-5 py-8">
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

      <div className="relative z-10 w-full max-w-[24rem]">
        <div className="mb-6 flex flex-col items-center text-center">
          {/* The full lockup rather than mark-plus-text: it already carries the
              wordmark and the tagline, and at this size the faceted D reads. */}
          <LogoLockup size={92} />
        </div>

        {/* A lit top edge on the card, so the panel reads as a surface catching
            light rather than a box drawn on the page. */}
        <div className="ds-glass relative overflow-hidden rounded-panel p-6">
          <span
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-px"
            style={{
              background:
                "linear-gradient(to right, transparent, color-mix(in oklab, var(--color-brand) 70%, transparent), transparent)",
            }}
          />
          <LoginForm
            accounts={accounts.filter((a): a is NonNullable<typeof a> => a !== null).map((a) => ({
              ...a,
              roleLabel: ROLE_META[a.role].label,
              roleDescription: ROLE_META[a.role].description,
            }))}
            demoPassword={DEMO_PASSWORD}
          />
        </div>
      </div>
    </div>
  );
}
