"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, KeyRound, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface DemoAccount {
  name: string;
  email: string;
  department: string;
  clearance: string;
  role: string;
  roleLabel: string;
  roleDescription: string;
}

/**
 * Sign-in form.
 *
 * The three demonstration roles are a row of buttons under the form. Earlier
 * passes listed them as full cards, then as a disclosure holding credential
 * pairs; both pushed the card past the viewport and made the sign-in screen
 * scroll. Switching role is the only thing a reviewer needs here, so the
 * control is three targets and nothing else — the address for each is on the
 * button's title, and the field shows it once selected.
 */
export function LoginForm({
  accounts,
  demoPassword,
}: {
  accounts: DemoAccount[];
  demoPassword: string;
}) {
  const router = useRouter();
  const [email, setEmail] = React.useState(accounts[0]?.email ?? "");
  const [password, setPassword] = React.useState(demoPassword);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Sign-in failed.");
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {/* --------------------------------------------------- role switcher */}
      <div className="border-b border-line pb-4">
        <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-4">
          <KeyRound className="size-3" />
          Sign in as
        </p>

        {/* One button per role, above the fields. Picking a role is the first
            thing a reviewer does here, so it leads rather than trailing the
            form, and the fields below visibly update to match the choice. */}
        <div className="grid grid-cols-3 gap-1.5">
          {accounts.map((account) => {
            const active = email === account.email;
            const short = account.roleLabel.replace("Security ", "");
            return (
              <button
                key={account.email}
                type="button"
                aria-pressed={active}
                title={`${account.email} · ${account.roleDescription}`}
                onClick={() => {
                  setEmail(account.email);
                  setPassword(demoPassword);
                  setError(null);
                }}
                className={cn(
                  "rounded-md border px-2 py-2 text-center transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60",
                  active
                    ? "border-brand/50 bg-brand-dim/40 text-brand"
                    : "border-line bg-surface/60 text-ink-3 hover:border-line-strong hover:bg-surface-2 hover:text-ink",
                )}
              >
                <span className="block text-[11px] font-medium">{short}</span>
                <span
                  className={cn(
                    "mt-1 block h-px w-full transition-colors",
                    active ? "bg-brand/60" : "bg-transparent",
                  )}
                />
              </button>
            );
          })}
        </div>

      </div>
      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
          required
          className="mt-1.5"
        />
      </div>

      <div>
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
          className="mt-1.5"
        />
      </div>

      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-critical/30 bg-critical-dim/30 px-3 py-2 text-[11px] leading-relaxed text-critical"
        >
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          {error}
        </p>
      )}

      <Button type="submit" size="lg" className="w-full ds-glow" loading={busy}>
        Sign in
        <ArrowRight />
      </Button>

    </form>
  );
}

