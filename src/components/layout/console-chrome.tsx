"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Topbar } from "@/components/layout/topbar";
import type { SessionUser } from "@/lib/rbac/session";

/**
 * Console chrome, or the absence of it.
 *
 * Every screen gets the breadcrumb topbar and a padded main. The war room gets
 * neither: it carries its own status rail, and it has a height budget to hit —
 * 56px of topbar plus 40px of padding is the difference between fitting a
 * laptop viewport and scrolling.
 *
 * This is a client component only because the decision needs the pathname. The
 * user and badges are still fetched once on the server and passed through, so
 * nothing extra is requested.
 */
export function ConsoleChrome({
  user,
  unreadAlerts,
  children,
}: {
  user: SessionUser;
  unreadAlerts: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  if (pathname === "/dashboard") {
    return <div className="flex min-w-0 flex-1 flex-col">{children}</div>;
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <Topbar user={user} unreadAlerts={unreadAlerts} />
      <main className="flex-1 px-3 py-5 sm:px-5 lg:px-6">{children}</main>
    </div>
  );
}
