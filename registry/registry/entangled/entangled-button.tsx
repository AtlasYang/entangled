import { type EntangledDeclaration, useEntangled } from "@entangled-ui/react";
import * as React from "react";
import { cn } from "@/lib/utils";

const variants = {
  default: "bg-primary text-primary-foreground hover:bg-primary/90",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
  ghost: "hover:bg-accent hover:text-accent-foreground",
} as const;

const sizes = {
  default: "h-9 px-4 py-2",
  sm: "h-8 px-3 text-xs",
  lg: "h-10 px-6",
} as const;

/** Button attributes plus the Entangled declaration fields it forwards. */
export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    Pick<EntangledDeclaration, "affects" | "by" | "effect" | "priority" | "confirm"> {
  /** Visual style. Default `"default"`. */
  variant?: keyof typeof variants;
  /** Height and padding. Default `"default"`. */
  size?: keyof typeof sizes;
}

/**
 * A shadcn-style button that declares what it affects. Hovering or focusing
 * it previews those elements; it gets a gradient ring when a confirm
 * targets a key it writes ("this is now available").
 *
 * Layered host: `relative`, no own `::after`, so the gradient-ring preset can
 * draw on a decorative pseudo-element without touching layout.
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "default", size = "default", affects, by, effect, priority, confirm, ...props },
  ref,
) {
  const en = useEntangled({ affects, by, effect, priority, confirm, layer: true });
  return (
    <button
      ref={ref}
      className={cn(
        "relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium",
        "transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        "disabled:pointer-events-none disabled:opacity-50 [--en-radius:calc(var(--radius)-2px)]",
        variants[variant],
        sizes[size],
        className,
      )}
      {...en}
      {...props}
    />
  );
});
