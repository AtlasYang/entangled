import { useEntangle, useEntangledState } from "@entangled-ui/react";
import * as React from "react";
import { cn } from "@/lib/utils";

/** Value of the `theme` state key. */
export type Theme = "light" | "dark";

/** Button attributes plus the initial theme and a change callback. */
export interface ThemeToggleProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  /** Initial theme while the `theme` key has no value yet. Default `"light"`. */
  defaultTheme?: Theme;
  /** Called with the new theme after the user toggles it. */
  onThemeChange?: (theme: Theme) => void;
}

/**
 * Light/dark toggle. The theme affects the whole screen, so it writes the
 * global key `*` as well as `theme`: hovering shows a faint full-screen veil,
 * switching confirms with one. Elements reading `useEntangledValue("theme")`
 * are previewed individually too.
 *
 * Applies shadcn's `dark` class on `<html>`.
 */
export function ThemeToggle({ defaultTheme = "light", onThemeChange, className, onClick, ...props }: ThemeToggleProps) {
  const [theme, setTheme, bind] = useEntangledState<Theme>("theme", defaultTheme);
  const en = useEntangle();
  const button = React.useRef<HTMLButtonElement | null>(null);

  React.useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const dark = theme === "dark";
  return (
    <button
      type="button"
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      aria-pressed={dark}
      className={cn(
        "relative inline-flex h-9 w-9 items-center justify-center rounded-md border border-input bg-background",
        "hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        className,
      )}
      {...bind}
      ref={(el) => {
        button.current = el;
        bind.ref(el);
      }}
      data-en-affects="theme *"
      {...props}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented) return;
        const next: Theme = dark ? "light" : "dark";
        setTheme(next); // confirms readers of "theme"
        en.confirm("*", { source: button.current }); // and the global veil
        onThemeChange?.(next);
      }}
    >
      {dark ? <MoonIcon /> : <SunIcon />}
    </button>
  );
}

const iconProps = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

function SunIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg {...iconProps}>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}
