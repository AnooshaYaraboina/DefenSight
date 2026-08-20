"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-all duration-150 disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 select-none",
  {
    variants: {
      variant: {
        primary:
          "bg-brand text-brand-ink hover:bg-brand/90 active:bg-brand/80 shadow-[0_1px_0_0_rgba(255,255,255,0.12)_inset]",
        secondary:
          "bg-surface-2 text-ink border border-line-strong hover:bg-elevated hover:border-ink-4",
        outline:
          "border border-line-strong text-ink-2 hover:text-ink hover:bg-surface-2 hover:border-ink-4",
        ghost: "text-ink-2 hover:text-ink hover:bg-surface-2",
        danger:
          "bg-critical text-white hover:bg-critical/90 active:bg-critical/80",
        dangerOutline:
          "border border-critical/40 text-critical hover:bg-critical-dim hover:border-critical/70",
        success: "bg-allow text-[#04210f] hover:bg-allow/90",
        link: "text-brand underline-offset-4 hover:underline p-0 h-auto",
      },
      size: {
        xs: "h-6 px-2 text-[11px] [&_svg]:size-3",
        sm: "h-8 px-3 text-xs [&_svg]:size-3.5",
        md: "h-9 px-4 text-sm [&_svg]:size-4",
        lg: "h-11 px-6 text-sm [&_svg]:size-4",
        icon: "size-9 [&_svg]:size-4",
        iconSm: "size-7 [&_svg]:size-3.5",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 className="animate-spin" />
            {children}
          </>
        ) : (
          children
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
