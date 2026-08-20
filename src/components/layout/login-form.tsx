"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, KeyRound, ShieldCheck, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

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
 * Lists one account per role. This is a demonstration deployment, and the
 * three-role requirement is only meaningful if a reviewer can actually sign in
 * as each and watch the console change — a permission matrix nobody can
 * exercise proves nothing.
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
        <p className="flex items-start gap-2 rounded-md border border-critical/30 bg-critical-dim/30 px-3 py-2 text-[11px] leading-relaxed text-critical">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          {error}
        </p>
      )}

      <Button type="submit" size="lg" className="w-full ds-glow" loading={busy}>
        Sign in
        <ArrowRight />
      </Button>

      <div className="border-t border-line pt-4">
        <p className="mb-2.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-4">
          <KeyRound className="size-3" />
          Sign in as
        </p>
        <ul className="space-y-1.5">
          {accounts.map((account) => (
            <li key={account.email}>
              <button
                type="button"
                onClick={() => {
                  setEmail(account.email);
                  setPassword(demoPassword);
                  setError(null);
                }}
                className={cn(
                  "w-full rounded-md border px-2.5 py-2 text-left transition-colors",
                  email === account.email
                    ? "border-brand/40 bg-brand-dim/30"
                    : "border-line bg-surface/60 hover:border-line-strong hover:bg-surface-2",
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-[11px] font-medium text-ink-2">
                    {account.name}
                  </span>
                  <Badge
                    tone={
                      account.role === "SECURITY_ADMIN" ? "brand"
                        : account.role === "SECURITY_ANALYST" ? "low" : "neutral"
                    }
                    size="xs"
                  >
                    {account.roleLabel.replace("Security ", "")}
                  </Badge>
                </span>
                <span className="mt-0.5 block truncate text-[10px] leading-snug text-ink-4">
                  {account.roleDescription}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-2.5 flex items-center gap-1.5 text-[10px] text-ink-4">
          <ShieldCheck className="size-3 text-brand" />
          Each role sees a different console. Try the viewer to watch controls disappear.
        </p>
      </div>
    </form>
  );
}
