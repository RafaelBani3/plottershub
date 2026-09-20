import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors focus:outline-none focus:ring-1 focus:ring-focus",
  {
    variants: {
      variant: {
        default:
          "border border-border-strong bg-elevated text-foreground",
        secondary:
          "border border-border-subtle bg-secondary/50 text-muted-foreground",
        destructive:
          "border border-destructive/25 bg-destructive/10 text-destructive",
        positive:
          "border border-positive/25 bg-positive/10 text-positive",
        success:
          "border border-positive/25 bg-positive/10 text-positive",
        warning:
          "border border-amber-500/25 bg-amber-500/10 text-amber-400",
        outline:
          "border border-border-subtle text-muted-foreground",
        youtube:
          "border border-red-500/25 bg-red-500/10 text-red-400",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
