"use client";

import * as React from "react";
import { Download, Mail, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * Download or email a report.
 *
 * The recipient is deliberately not offered as a field. The server reads the
 * signed-in analyst's address from their session, so there is nothing here to
 * type — and no way to point a report at someone else's mailbox.
 */
export function ReportActions({
  endpoint,
  filename,
  label = "report",
  size = "sm",
}: {
  /** Base API path. GET downloads, POST emails. */
  endpoint: string;
  filename: string;
  label?: string;
  size?: "xs" | "sm" | "md";
}) {
  const [downloading, setDownloading] = React.useState(false);
  const [sending, setSending] = React.useState(false);

  async function download() {
    setDownloading(true);
    try {
      const res = await fetch(endpoint);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Could not build the report.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      /* Revoked on the next tick — revoking immediately races the download in
         Safari and the file arrives empty. */
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("Report downloaded");
    } catch (error) {
      toast.error("Download failed", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setDownloading(false);
    }
  }

  async function email() {
    setSending(true);
    try {
      const res = await fetch(endpoint, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Delivery failed.");
      toast.success(`Sent to ${body.to}`, {
        description: `The ${label} is attached. Check your inbox.`,
      });
    } catch (error) {
      toast.error("Could not send the report", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size={size} onClick={download} disabled={downloading || sending}>
        {downloading ? <Loader2 className="animate-spin" /> : <Download />}
        PDF
      </Button>
      <Button variant="secondary" size={size} onClick={email} disabled={downloading || sending}>
        {sending ? <Loader2 className="animate-spin" /> : <Mail />}
        Email me
      </Button>
    </div>
  );
}
