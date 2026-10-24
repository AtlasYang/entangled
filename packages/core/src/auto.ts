import { presetStyles } from "@entangled-ui/presets";
import { type EntangledOptions, type EntangledRuntime, createEntangled } from "./runtime.js";

/**
 * Batteries-included entry for attribute-only use: presets injected, started
 * immediately. Importing this module has no side effects; calling it does.
 */
export function autoStart(options: EntangledOptions = {}): EntangledRuntime {
  const runtime = createEntangled({ styles: presetStyles, ...options });
  runtime.start();
  return runtime;
}

export * from "./index.js";
