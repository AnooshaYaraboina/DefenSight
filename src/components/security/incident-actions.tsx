"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { MessageSquarePlus, ShieldCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { INCIDENT_STATUS_META, INCIDENT_TRANSITIONS, type IncidentStatus } from "@/lib/engine/taxonomy";

/**
 * Incident response controls (§17).
 *
 * Only transitions the lifecycle actually permits are offered, and each one
 * confirms before it fires — a status change is a claim about the state of a
 * live threat, not a UI preference.
 */
export function IncidentActions({
  incidentId,
  status,
  analysts,
  assignedToId,
}: {
  incidentId: string;
  status: IncidentStatus;
  analysts: Array<{ id: string; name: string }>;
  assignedToId?: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [noteOpen, setNoteOpen] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [pendingStatus, setPendingStatus] = React.useState<IncidentStatus | null>(null);
  const [resolution, setResolution] = React.useState("");

  const allowed = INCIDENT_TRANSITIONS[status];

  async function patch(body: Record<string, unknown>, successMessage: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/incidents/${incidentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Update failed");
      toast.success(successMessage);
      router.refresh();
    } catch (error) {
      toast.error("Could not update incident", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(false);
      setPendingStatus(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={assignedToId ?? "__none"}
        onValueChange={(v) => patch({ assignedToId: v === "__none" ? null : v }, "Assignment updated")}
      >
        <SelectTrigger size="sm" className="w-44">
          <SelectValue placeholder="Assign analyst" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none">Unassigned</SelectItem>
          {analysts.map((a) => (
            <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button variant="outline" size="sm" onClick={() => setNoteOpen(true)}>
        <MessageSquarePlus />
        Add note
      </Button>

      {allowed.map((next) => (
        <Button
          key={next}
          size="sm"
          variant={next === "RESOLVED" ? "success" : next === "CONTAINED" ? "primary" : "secondary"}
          disabled={busy}
          onClick={() => setPendingStatus(next)}
        >
          <ShieldCheck />
          {next === "INVESTIGATING" ? "Start investigating" : `Mark ${INCIDENT_STATUS_META[next].label.toLowerCase()}`}
        </Button>
      ))}

      <ConfirmDialog
        open={pendingStatus !== null}
        onOpenChange={(o) => !o && setPendingStatus(null)}
        title={pendingStatus ? `Move to ${INCIDENT_STATUS_META[pendingStatus].label}?` : ""}
        destructive={pendingStatus === "RESOLVED"}
        confirmLabel={pendingStatus ? `Mark ${INCIDENT_STATUS_META[pendingStatus].label.toLowerCase()}` : "Confirm"}
        description={
          <div className="space-y-2.5">
            <p>{pendingStatus && INCIDENT_STATUS_META[pendingStatus].description}</p>
            {pendingStatus === "RESOLVED" && (
              <div>
                <label htmlFor="resolution" className="mb-1 block text-[11px] text-ink-3">
                  Resolution summary — recorded on the case and in the audit log.
                </label>
                <Textarea
                  id="resolution"
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  placeholder="What was found, what was done, and what stops it recurring."
                  className="min-h-20"
                />
              </div>
            )}
          </div>
        }
        onConfirm={() =>
          patch(
            {
              status: pendingStatus,
              ...(pendingStatus === "RESOLVED" && resolution ? { resolution } : {}),
            },
            `Incident marked ${pendingStatus?.toLowerCase()}`,
          )
        }
      />

      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Add investigation note</DialogTitle>
            <DialogDescription>
              Notes append to the incident timeline and the audit log.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What did you find?"
              className="min-h-28"
              autoFocus
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setNoteOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              loading={busy}
              disabled={!note.trim()}
              onClick={async () => {
                await patch({ note }, "Note added to timeline");
                setNote("");
                setNoteOpen(false);
              }}
            >
              <UserPlus />
              Add note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
