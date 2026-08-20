import { cn } from "@/lib/utils";

/**
 * DefenSight mark — a shield formed from a scanning aperture. The horizontal
 * sweep line echoes the live-monitoring motif used throughout the console.
 */
export function Logo({ className, size = 22 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={cn("shrink-0", className)}
      aria-hidden="true"
    >
      <path
        d="M12 2.25 20 5.2v6.05c0 4.94-3.28 9.43-8 10.5-4.72-1.07-8-5.56-8-10.5V5.2l8-2.95Z"
        className="fill-brand/12 stroke-brand"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="11" r="3.1" className="stroke-brand" strokeWidth="1.5" />
      <circle cx="12" cy="11" r="1.05" className="fill-brand" />
      <path d="M4.4 11h3.4M16.2 11h3.4" className="stroke-brand/70" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("text-[15px] font-semibold tracking-tight text-ink", className)}>
      Defen<span className="text-brand">Sight</span>
    </span>
  );
}
