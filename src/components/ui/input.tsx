"use client";

import * as React from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

const fieldBase =
  "w-full rounded-md border border-line-strong bg-inset text-ink placeholder:text-ink-4 transition-colors focus:border-brand/60 focus:outline-none focus:ring-1 focus:ring-brand/30 disabled:opacity-50";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(fieldBase, "h-9 px-3 text-sm", className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(fieldBase, "min-h-24 px-3 py-2 text-sm leading-relaxed resize-y", className)}
    {...props}
  />
));
Textarea.displayName = "Textarea";

/** Search field with an icon and a clear affordance — used on every data table. */
export function SearchInput({
  value,
  onValueChange,
  placeholder = "Search…",
  className,
}: {
  value: string;
  onValueChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-4" />
      <input
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder={placeholder}
        className={cn(fieldBase, "h-8 pl-8 pr-8 text-xs")}
      />
      {value && (
        <button
          type="button"
          onClick={() => onValueChange("")}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-4 hover:text-ink"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
