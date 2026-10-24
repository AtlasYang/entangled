import { type EntangledOptions, type EntangledRuntime, createEntangled } from "@entangled-ui/core";
import { presetStyles } from "@entangled-ui/presets";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { EntangledContext } from "./context.js";
import { createValueStore } from "./store.js";

/** Runtime options (read once, on first render) plus an optional external runtime. */
export interface EntangledProviderProps extends EntangledOptions {
  /** The subtree that can use Entangled hooks. */
  children?: ReactNode;
  /**
   * Bring your own runtime (e.g. shared with non-React code). The Provider
   * starts it if needed but never destroys it.
   */
  runtime?: EntangledRuntime;
}

/**
 * Owns one runtime for the subtree. Options are read once, on first render.
 * Nothing touches the DOM until the mount effect, so this is SSR-safe.
 */
export function EntangledProvider({ children, runtime: external, ...options }: EntangledProviderProps) {
  const [runtime] = useState(() => external ?? createEntangled({ styles: presetStyles, ...options }));
  const [values] = useState(createValueStore);

  useEffect(() => {
    runtime.start();
    if (!external) return () => runtime.destroy();
  }, [runtime, external]);

  const ctx = useMemo(() => ({ runtime, values }), [runtime, values]);
  return <EntangledContext.Provider value={ctx}>{children}</EntangledContext.Provider>;
}
