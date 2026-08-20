"use client";

import * as React from "react";
import Link from "next/link";
import { AlertOctagon, ArrowLeft, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * Console error boundary (§25).
 *
 * Says what failed and offers a way forward. It deliberately does not render
 * the raw error message: on a security console the stack could name internal
 * hosts, table names or query shapes, and this page is reachable by any signed-
 * in role. The digest is shown instead so an operator can correlate it with the
 * server log.
 */
export default function ConsoleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error("[DefenSight] console error:", error);
  }, [error]);

  return (
    <Card className="mx-auto mt-10 max-w-lg border-critical/30 p-6 text-center">
      <div className="mx-auto flex size-11 items-center justify-center rounded-full border border-critical/30 bg-critical-dim">
        <AlertOctagon className="size-5 text-critical" />
      </div>

      <h1 className="mt-4 text-base font-semibold tracking-tight text-ink">
        This view could not be loaded
      </h1>
      <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-ink-3">
        The security data behind this page failed to load. Monitoring and enforcement are
        unaffected — the pipeline runs independently of the console.
      </p>

      {error.digest && (
        <p className="mt-3 font-mono text-[10px] text-ink-4">
          Reference: {error.digest}
        </p>
      )}

      <div className="mt-6 flex items-center justify-center gap-2">
        <Button size="sm" onClick={reset}>
          <RefreshCw />
          Try again
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href="/dashboard">
            <ArrowLeft />
            Back to dashboard
          </Link>
        </Button>
      </div>
    </Card>
  );
}
