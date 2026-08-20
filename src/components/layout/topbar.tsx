"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as Icons from "lucide-react";
import { Bell, ChevronRight, LogOut, Menu, Search, ShieldCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_INDEX, visibleNav } from "@/lib/nav";
import { ROLE_META, type Role } from "@/lib/engine/taxonomy";
import { Logo, Wordmark } from "./logo";
import { LiveDot } from "@/components/security/indicators";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SessionUser } from "@/lib/rbac/session";

function Icon({ name, className }: { name: string; className?: string }) {
  const C = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name];
  return C ? <C className={className} /> : null;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function Topbar({
  user,
  unreadAlerts = 0,
}: {
  user: SessionUser;
  unreadAlerts?: number;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  // Resolve the current section from the nav model rather than duplicating
  // titles in every page component.
  const base = `/${pathname.split("/").filter(Boolean)[0] ?? ""}`;
  const current = NAV_INDEX[base];
  const isDetail = pathname !== base && pathname !== "/";

  return (
    <>
      <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-line bg-base/85 px-3 backdrop-blur supports-[backdrop-filter]:bg-base/70 sm:px-4">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="rounded p-1.5 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink lg:hidden"
          aria-label="Open navigation"
        >
          <Menu className="size-4.5" />
        </button>

        <Link href="/dashboard" className="flex items-center gap-2 lg:hidden">
          <Logo size={20} />
        </Link>

        <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1.5 md:flex">
          {current && (
            <>
              <Icon name={current.icon} className="size-3.5 shrink-0 text-ink-4" />
              {isDetail ? (
                <Link
                  href={current.href}
                  className="truncate text-xs font-medium text-ink-3 transition-colors hover:text-ink"
                >
                  {current.label}
                </Link>
              ) : (
                <span className="truncate text-xs font-medium text-ink">{current.label}</span>
              )}
              {isDetail && (
                <>
                  <ChevronRight className="size-3 shrink-0 text-ink-4" />
                  <span className="truncate font-mono text-[11px] text-ink-2">
                    {decodeURIComponent(pathname.split("/").filter(Boolean).slice(1).join(" / "))}
                  </span>
                </>
              )}
            </>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <GlobalSearchButton />

          <div className="hidden items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1 sm:flex">
            <LiveDot label="Live" />
          </div>

          <Link
            href="/alerts"
            className="relative rounded p-1.5 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
            aria-label={`Alerts${unreadAlerts ? `, ${unreadAlerts} unread` : ""}`}
          >
            <Bell className="size-4" />
            {unreadAlerts > 0 && (
              <span className="absolute right-0.5 top-0.5 flex size-3.5 items-center justify-center rounded-full bg-critical font-mono text-[9px] font-bold text-white">
                {unreadAlerts > 9 ? "9+" : unreadAlerts}
              </span>
            )}
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-surface-2"
              >
                <span className="flex size-7 items-center justify-center rounded-full border border-brand/30 bg-brand-dim/50 font-mono text-[10px] font-semibold text-brand">
                  {initials(user.name)}
                </span>
                <span className="hidden text-left sm:block">
                  <span className="block text-[11px] font-medium leading-tight text-ink">
                    {user.name}
                  </span>
                  <span className="block text-[10px] leading-tight text-ink-4">
                    {ROLE_META[user.role].label}
                  </span>
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel>Signed in as</DropdownMenuLabel>
              <div className="px-2 pb-2">
                <p className="text-xs font-medium text-ink">{user.name}</p>
                <p className="font-mono text-[10px] text-ink-4">{user.email}</p>
              </div>
              <DropdownMenuSeparator />
              <div className="flex items-start gap-2 px-2 py-2">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-brand" />
                <div>
                  <p className="text-[11px] font-medium text-ink-2">
                    {ROLE_META[user.role].label}
                  </p>
                  <p className="text-[10px] leading-snug text-ink-4">
                    {ROLE_META[user.role].description}
                  </p>
                </div>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/audit">
                  <Icons.ScrollText />
                  My activity
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <Icons.Settings />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive>
                <LogOut />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {mobileOpen && (
        <MobileNav role={user.role} onClose={() => setMobileOpen(false)} pathname={pathname} />
      )}
    </>
  );
}

function GlobalSearchButton() {
  return (
    <button
      type="button"
      className="hidden items-center gap-2 rounded-md border border-line bg-surface px-2.5 py-1.5 text-[11px] text-ink-4 transition-colors hover:border-line-strong hover:text-ink-3 md:flex"
      aria-label="Search"
    >
      <Search className="size-3.5" />
      <span className="pr-6">Search events, agents, incidents…</span>
      <kbd className="rounded border border-line-strong bg-inset px-1 font-mono text-[10px]">
        /
      </kbd>
    </button>
  );
}

function MobileNav({
  role,
  onClose,
  pathname,
}: {
  role: Role;
  onClose: () => void;
  pathname: string;
}) {
  const groups = visibleNav(role);
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-[2px]" onClick={onClose} />
      <div className="absolute left-0 top-0 flex h-full w-64 flex-col border-r border-line bg-surface">
        <div className="flex h-14 items-center justify-between border-b border-line px-3">
          <div className="flex items-center gap-2.5">
            <Logo />
            <Wordmark />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-ink-3 hover:bg-surface-2 hover:text-ink"
            aria-label="Close navigation"
          >
            <X className="size-4" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {groups.map((g) => (
            <div key={g.label} className="mb-4">
              <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-ink-4">
                {g.label}
              </p>
              <ul className="space-y-0.5">
                {g.items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onClose}
                        className={cn(
                          "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-xs font-medium transition-colors",
                          active
                            ? "bg-brand-dim/40 text-ink"
                            : "text-ink-3 hover:bg-surface-2 hover:text-ink-2",
                        )}
                      >
                        <Icon
                          name={item.icon}
                          className={cn("size-4", active && "text-brand")}
                        />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </div>
    </div>
  );
}
