import Link from "next/link";
import { ArrowLeft, FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function ConsoleNotFound() {
  return (
    <Card className="mx-auto mt-10 max-w-lg p-6 text-center">
      <div className="mx-auto flex size-11 items-center justify-center rounded-full border border-line bg-surface-2">
        <FileQuestion className="size-5 text-ink-4" />
      </div>
      <h1 className="mt-4 text-base font-semibold tracking-tight text-ink">Not found</h1>
      <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-ink-3">
        This record does not exist, or it was removed. Events, incidents and documents are
        retained according to the data retention schedule.
      </p>
      <div className="mt-6 flex items-center justify-center gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link href="/monitor">Open the monitor</Link>
        </Button>
        <Button size="sm" asChild>
          <Link href="/dashboard">
            <ArrowLeft />
            Dashboard
          </Link>
        </Button>
      </div>
    </Card>
  );
}
