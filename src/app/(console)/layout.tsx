import * as React from "react";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { getCurrentUser } from "@/lib/rbac/session";
import { getNavBadges } from "@/lib/queries/events";

/**
 * Console shell. Everything inside the (console) route group renders with the
 * persistent sidebar and topbar, so navigation never re-mounts and the live
 * event connection survives route changes.
 */
export default async function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, badges] = await Promise.all([getCurrentUser(), getNavBadges()]);

  return (
    <TooltipProvider delayDuration={250}>
      <div className="flex min-h-dvh">
        <Sidebar role={user.role} badges={badges} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar user={user} unreadAlerts={badges.unreadAlerts} />
          <main className="flex-1 px-3 py-5 sm:px-5 lg:px-6">{children}</main>
        </div>
      </div>
      <Toaster
        position="bottom-right"
        theme="dark"
        toastOptions={{
          classNames: {
            toast:
              "!bg-elevated !border-line-strong !text-ink !rounded-md !shadow-xl !shadow-black/50",
            description: "!text-ink-3",
            actionButton: "!bg-brand !text-brand-ink",
          },
        }}
      />
    </TooltipProvider>
  );
}
