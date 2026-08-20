import { KeyRound, ShieldCheck, Users } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/rbac/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR, TableWrap } from "@/components/ui/table";
import { MetricStrip } from "@/components/security/metric-strip";
import { ClassificationBadge } from "@/components/security/indicators";
import { RiskPill } from "@/components/security/risk-score";
import { formatRelative } from "@/lib/utils/format";
import { ROLES, ROLE_META, type Role } from "@/lib/engine/taxonomy";
import { PERMISSIONS, ROLE_PERMISSIONS } from "@/lib/rbac/permissions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const [current, users, models] = await Promise.all([
    getCurrentUser(),
    prisma.user.findMany({ orderBy: [{ role: "asc" }, { name: "asc" }] }),
    prisma.llmModel.findMany({ include: { _count: { select: { applications: true, agents: true } } } }),
  ]);

  const byRole = ROLES.map((r) => ({ role: r, count: users.filter((u) => u.role === r).length }));

  // Group permissions by their object so the matrix reads as capabilities
  // rather than a flat list of 30 strings.
  const groups = [...new Set(PERMISSIONS.map((p) => p.split(":")[0]))];

  return (
    <>
      <PageHeader
        title="Settings"
        description="Users, roles and platform configuration. Permissions are enforced server-side on every API route; the console hides controls a role cannot use purely as an affordance."
      />

      <MetricStrip
        className="mb-4"
        metrics={[
          { label: "Users", value: users.length },
          ...byRole.map((r) => ({ label: ROLE_META[r.role].label, value: r.count })),
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="size-3.5 text-ink-4" />
                  Users
                </CardTitle>
                <p className="mt-0.5 text-xs text-ink-3">
                  Clearance determines the highest classification a principal may be shown, and is
                  enforced at retrieval — not at render.
                </p>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <TableWrap className="rounded-none border-0 border-t border-line">
                <Table>
                  <THead>
                    <TR>
                      <TH>Name</TH>
                      <TH>Role</TH>
                      <TH>Department</TH>
                      <TH>Clearance</TH>
                      <TH numeric>Risk</TH>
                      <TH>Last seen</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {users.map((u) => (
                      <TR key={u.id}>
                        <TD>
                          <span className="flex items-center gap-2">
                            <span className="truncate text-ink-2">{u.name}</span>
                            {u.id === current.id && <Badge tone="brand" size="xs">you</Badge>}
                          </span>
                          <span className="block truncate font-mono text-[10px] text-ink-4">
                            {u.email}
                          </span>
                        </TD>
                        <TD>
                          <Badge
                            tone={u.role === "SECURITY_ADMIN" ? "brand" : u.role === "SECURITY_ANALYST" ? "low" : "neutral"}
                            size="xs"
                          >
                            {ROLE_META[u.role as Role].label}
                          </Badge>
                        </TD>
                        <TD className="truncate">{u.department}</TD>
                        <TD><ClassificationBadge classification={u.clearance} /></TD>
                        <TD numeric><RiskPill score={u.riskScore} /></TD>
                        <TD className="text-ink-4">
                          {u.lastLoginAt ? formatRelative(u.lastLoginAt) : "—"}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableWrap>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <KeyRound className="size-3.5 text-ink-4" />
                  Permission matrix
                </CardTitle>
                <p className="mt-0.5 text-xs text-ink-3">
                  What each role may do. Checked server-side by every route that mutates state.
                </p>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <TableWrap className="rounded-none border-0 border-t border-line">
                <Table>
                  <THead>
                    <TR>
                      <TH>Capability</TH>
                      {ROLES.map((r) => (
                        <TH key={r} className="w-32 text-center">
                          {ROLE_META[r].label.replace("Security ", "")}
                        </TH>
                      ))}
                    </TR>
                  </THead>
                  <TBody>
                    {groups.map((group) => {
                      const perms = PERMISSIONS.filter((p) => p.startsWith(`${group}:`));
                      return (
                        <TR key={group}>
                          <TD>
                            <span className="font-medium capitalize text-ink-2">{group}</span>
                            <span className="mt-0.5 block font-mono text-[9px] text-ink-4">
                              {perms.map((p) => p.split(":")[1]).join(", ")}
                            </span>
                          </TD>
                          {ROLES.map((role) => {
                            const granted = perms.filter((p) =>
                              (ROLE_PERMISSIONS[role] as readonly string[]).includes(p),
                            ).length;
                            return (
                              <TD key={role} className="text-center">
                                {granted === perms.length ? (
                                  <Badge tone="allow" size="xs">all</Badge>
                                ) : granted === 0 ? (
                                  <span className="text-ink-4">—</span>
                                ) : (
                                  <Badge tone="medium" size="xs">
                                    {granted}/{perms.length}
                                  </Badge>
                                )}
                              </TD>
                            );
                          })}
                        </TR>
                      );
                    })}
                  </TBody>
                </Table>
              </TableWrap>
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="size-3.5 text-brand" />
                Roles
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {ROLES.map((role) => (
                <div key={role} className="rounded-md border border-line bg-surface-2/40 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-ink-2">{ROLE_META[role].label}</span>
                    <span className="font-mono text-[10px] text-ink-4">
                      {ROLE_PERMISSIONS[role].length} permissions
                    </span>
                  </div>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-ink-3">
                    {ROLE_META[role].description}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Registered models</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1.5">
                {models.map((m) => (
                  <li key={m.id} className="rounded-md border border-line bg-surface-2/40 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-mono text-[11px] text-ink-2">{m.name}</span>
                      <Badge tone="outline" size="xs">tier {m.sensitivityTier}</Badge>
                    </div>
                    <p className="mt-1 flex flex-wrap gap-2 text-[10px] text-ink-4">
                      <span>{m.provider}</span>
                      <span>{m.contextWindow.toLocaleString()} ctx</span>
                      <span>{m._count.applications} apps</span>
                      <span>{m._count.agents} agents</span>
                    </p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>AI automation</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-[11px] leading-relaxed text-ink-3">
                Threat classification, incident summarisation and the analyst assistant use an
                LLM when one is configured. Set <code className="rounded bg-inset px-1 font-mono text-[10px]">OPENAI_API_KEY</code> in{" "}
                <code className="rounded bg-inset px-1 font-mono text-[10px]">.env</code> to enable it.
              </p>
              <p className="mt-2.5 rounded-md border border-line bg-surface-2/50 p-2.5 text-[10px] leading-relaxed text-ink-4">
                Deterministic controls — detection, risk scoring, policy evaluation and blocking —
                never depend on a model being available. AI automation supports the defensive
                workflow; it does not perform enforcement.
              </p>
              <p className="mt-2 flex items-center gap-2">
                <Badge tone={process.env.OPENAI_API_KEY ? "allow" : "neutral"} size="xs">
                  {process.env.OPENAI_API_KEY ? "Model configured" : "No model configured"}
                </Badge>
                {!process.env.OPENAI_API_KEY && (
                  <span className="text-[10px] text-ink-4">Deterministic fallbacks in use</span>
                )}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
