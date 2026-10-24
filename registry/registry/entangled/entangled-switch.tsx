import { type Key, useEntangledState } from "@entangled-ui/react";
import * as React from "react";
import { cn } from "@/lib/utils";

/** Button attributes plus the shared state key. */
export interface SwitchProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "value"> {
  /** Shared state key. Elements using `useEntangledValue(stateKey)` are this switch's readers. */
  stateKey: Key;
  /** Initial value while `stateKey` has no value yet. Default false. */
  defaultChecked?: boolean;
  /** Called with the new value after the user toggles it. */
  onCheckedChange?: (checked: boolean) => void;
}

/**
 * A switch whose value lives in Entangled state under `stateKey`. Hovering
 * or focusing it previews exactly the elements that read that key; toggling
 * it confirms them.
 *
 * @example
 *   <Switch stateKey="notifications" aria-label="Notifications" />
 *   const [on, bind] = useEntangledValue("notifications", false);
 *   <Badge {...bind}>{on ? "On" : "Off"}</Badge>
 */
export function Switch({ stateKey, defaultChecked = false, onCheckedChange, className, onClick, ...props }: SwitchProps) {
  const [checked, setChecked, bind] = useEntangledState(stateKey, defaultChecked);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-state={checked ? "checked" : "unchecked"}
      className={cn(
        "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-primary" : "bg-input",
        className,
      )}
      {...bind}
      {...props}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented) return;
        const next = !checked;
        setChecked(next);
        onCheckedChange?.(next);
      }}
    >
      <span
        className={cn(
          "pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform",
          checked ? "translate-x-4" : "translate-x-0",
        )}
      />
    </button>
  );
}
