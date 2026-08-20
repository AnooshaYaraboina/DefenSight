"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

/**
 * Quarantine control (§11).
 *
 * Releasing a document is the consequential direction — it puts content back
 * into every future retrieval — so it confirms with an explicit warning rather
 * than toggling silently.
 */
export function QuarantineToggle({
  documentId,
  quarantined,
  title,
}: {
  documentId: string;
  quarantined: boolean;
  title: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  async function apply() {
    const res = await fetch("/api/rag/quarantine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId, quarantined: !quarantined }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error("Could not update quarantine", { description: data.error });
      return;
    }
    toast.success(quarantined ? "Document released" : "Document quarantined");
    router.refresh();
  }

  return (
    <>
      <Button
        size="sm"
        variant={quarantined ? "outline" : "dangerOutline"}
        onClick={() => setOpen(true)}
      >
        {quarantined ? <ShieldCheck /> : <ShieldOff />}
        {quarantined ? "Release from quarantine" : "Quarantine document"}
      </Button>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        destructive={quarantined}
        title={quarantined ? "Release this document?" : "Quarantine this document?"}
        confirmLabel={quarantined ? "Release" : "Quarantine"}
        onConfirm={apply}
        description={
          quarantined ? (
            <>
              <p>
                <span className="font-medium text-ink">{title}</span> will become available to
                retrieval again and can reach a model context on the next matching query.
              </p>
              <p className="mt-2">
                Release only after confirming the content is safe. The scanner flagged it for a
                reason, and that reason is recorded on the document.
              </p>
            </>
          ) : (
            <p>
              <span className="font-medium text-ink">{title}</span> will be withheld from every
              retrieval immediately. Existing indexes keep the entry, but the gateway refuses to
              deliver it.
            </p>
          )
        }
      />
    </>
  );
}
