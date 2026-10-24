import type { EntangledRuntime, Key } from "@entangled-ui/core";
import { createContext, useContext } from "react";
import type { ValueStore } from "./store.js";

export interface EntangledContextValue {
  runtime: EntangledRuntime;
  values: ValueStore;
}

export const EntangledContext = createContext<EntangledContextValue | null>(null);

export function useEntangledContext(hook: string): EntangledContextValue {
  const ctx = useContext(EntangledContext);
  if (!ctx) throw new Error(`[entangled] ${hook} must be used inside <EntangledProvider>.`);
  return ctx;
}

/** Nearest `<EntangledNode>`: hooks whose bind is not attached register here. */
export interface NodeBoundary {
  add(role: "writer" | "reader", key: Key): () => void;
  element(): Element | null;
}

export const NodeContext = createContext<NodeBoundary | null>(null);
