import type { Key } from "@entangled-ui/core";

/** Per-Provider key-to-value store backing `useEntangledState` / `useEntangledValue`. */
export interface ValueStore {
  /** Whether `key` has been set. */
  has(key: Key): boolean;
  /** The value for `key`, or `undefined`. */
  get(key: Key): unknown;
  /** Returns true when the value actually changed (`Object.is`). */
  set(key: Key, value: unknown): boolean;
  /** Call `listener` when `key` changes; returns an unsubscribe function. */
  subscribe(key: Key, listener: () => void): () => void;
}

/** An empty `ValueStore`. Each `<EntangledProvider>` creates its own. */
export function createValueStore(): ValueStore {
  const values = new Map<Key, unknown>();
  const listeners = new Map<Key, Set<() => void>>();
  return {
    has: (key) => values.has(key),
    get: (key) => values.get(key),
    set(key, value) {
      if (values.has(key) && Object.is(values.get(key), value)) return false;
      values.set(key, value);
      listeners.get(key)?.forEach((l) => l());
      return true;
    },
    subscribe(key, listener) {
      let set = listeners.get(key);
      if (!set) listeners.set(key, (set = new Set()));
      set.add(listener);
      return () => {
        set.delete(listener);
        if (set.size === 0) listeners.delete(key);
      };
    },
  };
}
