"use client";

import * as React from "react";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "./button";

/**
 * Confirmation gate for actions that change security state — quarantining a
 * document, approving a tool call, disabling a guardrail. The assessment (§25)
 * requires confirmation dialogs; more importantly, a security console should
 * never let a destructive control change happen on a single stray click.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  destructive,
  children,
}: {
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  destructive?: boolean;
  children?: React.ReactNode;
}) {
  const [busy, setBusy] = React.useState(false);

  async function handleConfirm(e: React.MouseEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await onConfirm();
      onOpenChange?.(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      {children && (
        <AlertDialogPrimitive.Trigger asChild>{children}</AlertDialogPrimitive.Trigger>
      )}
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-[2px]" />
        <AlertDialogPrimitive.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2",
            "rounded-panel border border-line-strong bg-surface p-5 shadow-2xl shadow-black/60",
          )}
        >
          <div className="flex gap-3">
            <div
              className={cn(
                "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
                destructive ? "bg-critical-dim text-critical" : "bg-brand-dim/60 text-brand",
              )}
            >
              <AlertTriangle className="size-4" />
            </div>
            <div className="min-w-0">
              <AlertDialogPrimitive.Title className="text-sm font-semibold text-ink">
                {title}
              </AlertDialogPrimitive.Title>
              <AlertDialogPrimitive.Description asChild>
                <div className="mt-1.5 text-xs leading-relaxed text-ink-2">{description}</div>
              </AlertDialogPrimitive.Description>
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <AlertDialogPrimitive.Cancel
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
            >
              {cancelLabel}
            </AlertDialogPrimitive.Cancel>
            <AlertDialogPrimitive.Action
              onClick={handleConfirm}
              disabled={busy}
              className={cn(
                buttonVariants({
                  variant: destructive ? "danger" : "primary",
                  size: "sm",
                }),
              )}
            >
              {busy ? "Working…" : confirmLabel}
            </AlertDialogPrimitive.Action>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}
