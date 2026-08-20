"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as Icons from "lucide-react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { visibleNav, type NavItem } from "@/lib/nav";
import type { Role } from "@/lib/engine/taxonomy";
import { Logo, Wordmark } from "./logo";
import { Tooltip } from "@/components/ui/tooltip";
import { LiveDot } from "@/components/security/indicators";

export interface NavBadgeCounts {
  activeThreats?: number;
  openIncidents?: number;
  pendingApprovals?: number;
  unreadAlerts?: number;
}

function Icon({ name, className }: { name: string; className?: string }) {
  const C = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name];
  return C ? <C className={className} /> : <Icons.Circle className={className} />;
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({
  role,
  badges = {},
}: {
  role: Role;
  badges?: NavBadgeCounts;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = React.useState(false);

  // Persist the collapse preference so the console remembers how the analyst
  // likes to work between sessions.
  React.useEffect(() => {
    const saved = localStorage.getItem("defensight:sidebar-collapsed");
    if (saved === "1") setCollapsed(true);
  }, []);
  React.useEffect(() => {
    localStorage.setItem("defensight:sidebar-collapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  const groups = React.useMemo(() => visibleNav(role), [role]);

  return (
    <aside
      className={cn(
        "sticky top-0 z-30 hidden h-dvh shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-200 lg:flex",
        collapsed ? "w-[3.75rem]" : "w-56",
      )}
    >
      <div
        className={cn(
          "flex h-14 shrink-0 items-center gap-2.5 border-b border-line px-3",
          collapsed && "justify-center px-0",
        )}
      >
        <Link href="/dashboard" className="flex items-center gap-2.5" aria-label="DefenSight home">
          <Logo />
          {!collapsed && <Wordmark />}
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-3">
        {groups.map((group) => (
          <div key={group.label} className="mb-4 last:mb-0">
            {!collapsed && (
              <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-ink-4">
                {group.label}
              </p>
            )}
            {collapsed && <div className="mx-2 mb-2 h-px bg-line" />}
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.href}>
                  <NavLink
                    item={item}
                    active={isActive(pathname, item.href)}
                    collapsed={collapsed}
                    count={item.badge ? badges[item.badge] : undefined}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-line p-2">
        {!collapsed && (
          <div className="mb-2 flex items-center justify-between rounded-md bg-surface-2 px-2.5 py-2">
            <div className="min-w-0">
              <p className="truncate text-[11px] font-medium text-ink-2">Defense Engine</p>
              <p className="text-[10px] text-ink-4">All controls active</p>
            </div>
            <LiveDot />
          </div>
        )}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[11px] text-ink-4 transition-colors hover:bg-surface-2 hover:text-ink-2",
            collapsed && "justify-center px-0",
          )}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeftOpen className="size-4" />
          ) : (
            <>
              <PanelLeftClose className="size-4" />
              Collapse
            </>
          )}
        </button>
      </div>
    </aside>
  );
}

function NavLink({
  item,
  active,
  collapsed,
  count,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  count?: number;
}) {
  const link = (
    <Link
      href={item.href}
      className={cn(
        "group relative flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
        collapsed && "justify-center px-0 py-2",
        active
          ? "bg-brand-dim/40 text-ink"
          : "text-ink-3 hover:bg-surface-2 hover:text-ink-2",
      )}
    >
      {active && (
        <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r bg-brand" />
      )}
      <Icon name={item.icon} className={cn("size-4 shrink-0", active && "text-brand")} />
      {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
      {!collapsed && count !== undefined && count > 0 && (
        <span className="rounded bg-critical-dim px-1 font-mono text-[10px] font-semibold text-critical tabular">
          {count > 99 ? "99+" : count}
        </span>
      )}
      {collapsed && count !== undefined && count > 0 && (
        <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-critical" />
      )}
    </Link>
  );

  if (!collapsed) return link;
  return (
    <Tooltip
      side="right"
      content={
        <div>
          <p className="font-medium text-ink">{item.label}</p>
          <p className="text-ink-3">{item.description}</p>
        </div>
      }
    >
      {link}
    </Tooltip>
  );
}
