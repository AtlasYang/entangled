import { type Key, joinSegments, parseKey } from "./key.js";

/** Which side of the graph a node is registered on. */
export type Role = "writer" | "reader";

/** Per-registration options. */
export interface NodeOptions {
  /** Effect preset override (otherwise picked by role/element type). */
  effect?: string;
  /** Attention-budget ordering; higher wins. Ties keep document order. */
  priority?: number;
}

/** One registration or disposal, as delivered to `subscribe` listeners. */
export interface GraphChange<N = unknown> {
  /** `add` on register, `remove` on dispose. */
  type: "add" | "remove";
  /** Side the node was registered on. */
  role: Role;
  /** The registered node. */
  node: N;
  /** Distinct keys of this registration. */
  keys: readonly Key[];
  /** Options passed at registration. */
  options: NodeOptions;
}

/** Plain-data view of the graph: the input to the CSS compiler. */
export interface GraphSnapshot {
  /** Distinct writer keys, sorted. */
  writerKeys: Key[];
  /** Distinct reader keys, sorted. */
  readerKeys: Key[];
  /** Number of reader nodes registered per reader key. */
  readerCounts: Record<Key, number>;
  /** Number of writer nodes registered per writer key. */
  writerCounts: Record<Key, number>;
}

/** Writer and reader nodes indexed by key, with wildcard-aware lookups. */
export interface Graph<N = Element> {
  /** Register `node` as a writer of `keys`. O(segments) per key; returns an idempotent dispose. */
  addWriter(node: N, keys: readonly Key[], options?: NodeOptions): () => void;
  /** Register `node` as a reader of `keys`. */
  addReader(node: N, keys: readonly Key[], options?: NodeOptions): () => void;
  /** Readers whose keys match `key` (wildcard-aware). Cached until the next mutation. */
  readersOf(key: Key): ReadonlySet<N>;
  /** Writers whose keys match `key` (wildcard-aware). */
  writersOf(key: Key): ReadonlySet<N>;
  /** Keys `node` is registered under. Without `role`, the union of both roles. */
  keysOf(node: N, role?: Role): readonly Key[];
  /** Options of `node`'s latest registration in `role`. */
  optionsOf(node: N, role: Role): NodeOptions | undefined;
  /** Whether `node` is registered (in `role`, or in either). */
  has(node: N, role?: Role): boolean;
  /** Number of distinct nodes registered in `role`. */
  size(role: Role): number;
  /** Receive mutations, coalesced and delivered once per microtask. */
  subscribe(listener: (batch: readonly GraphChange<N>[]) => void): () => void;
  /** Current keys and counts as plain data. */
  snapshot(): GraphSnapshot;
}

/** Multiset: node -> registration count. */
type Bag<N> = Map<N, number>;

function bagAdd<K, N>(map: Map<K, Bag<N>>, key: K, node: N): void {
  let bag = map.get(key);
  if (!bag) map.set(key, (bag = new Map()));
  bag.set(node, (bag.get(node) ?? 0) + 1);
}

function bagRemove<K, N>(map: Map<K, Bag<N>>, key: K, node: N): void {
  const bag = map.get(key);
  if (!bag) return;
  const n = (bag.get(node) ?? 0) - 1;
  if (n > 0) bag.set(node, n);
  else {
    bag.delete(node);
    if (bag.size === 0) map.delete(key);
  }
}

const EMPTY: ReadonlySet<never> = new Set();
const GLOBAL_SLOT = "";

/**
 * Index for one role. Lookups never scan nodes: every key is registered under
 * a constant number of buckets (one per segment), and queries touch at most
 * one bucket per segment.
 *
 * - `exact`: concrete key -> nodes
 * - `wild`: wildcard prefix (`media` for `media:*`) -> nodes
 * - `under`: namespace -> nodes with a key strictly inside it (concrete keys
 *   register their proper prefixes; wildcards register every prefix of theirs)
 * - `global`: nodes registered under `*`
 */
class RoleIndex<N> {
  readonly exact = new Map<string, Bag<N>>();
  readonly wild = new Map<string, Bag<N>>();
  readonly under = new Map<string, Bag<N>>();
  readonly global = new Map<string, Bag<N>>();
  readonly nodeKeys = new Map<N, Map<Key, number>>();
  readonly nodeOptions = new Map<N, NodeOptions>();
  readonly keyNodes = new Map<Key, Bag<N>>();
  private cache = new Map<Key, ReadonlySet<N>>();

  add(node: N, key: Key): void {
    const p = parseKey(key);
    if (p.global) bagAdd(this.global, GLOBAL_SLOT, node);
    else if (p.wildcard) {
      bagAdd(this.wild, joinSegments(p.segments), node);
      for (let i = 1; i <= p.segments.length; i++) bagAdd(this.under, joinSegments(p.segments, i), node);
    } else {
      bagAdd(this.exact, key, node);
      for (let i = 1; i < p.segments.length; i++) bagAdd(this.under, joinSegments(p.segments, i), node);
    }
    let keys = this.nodeKeys.get(node);
    if (!keys) this.nodeKeys.set(node, (keys = new Map()));
    keys.set(key, (keys.get(key) ?? 0) + 1);
    bagAdd(this.keyNodes, key, node);
    this.cache.clear();
  }

  remove(node: N, key: Key): void {
    const p = parseKey(key);
    if (p.global) bagRemove(this.global, GLOBAL_SLOT, node);
    else if (p.wildcard) {
      bagRemove(this.wild, joinSegments(p.segments), node);
      for (let i = 1; i <= p.segments.length; i++) bagRemove(this.under, joinSegments(p.segments, i), node);
    } else {
      bagRemove(this.exact, key, node);
      for (let i = 1; i < p.segments.length; i++) bagRemove(this.under, joinSegments(p.segments, i), node);
    }
    const keys = this.nodeKeys.get(node);
    if (keys) {
      const n = (keys.get(key) ?? 0) - 1;
      if (n > 0) keys.set(key, n);
      else keys.delete(key);
      if (keys.size === 0) {
        this.nodeKeys.delete(node);
        this.nodeOptions.delete(node);
      }
    }
    bagRemove(this.keyNodes, key, node);
    this.cache.clear();
  }

  query(key: Key): ReadonlySet<N> {
    const hit = this.cache.get(key);
    if (hit) return hit;
    const p = parseKey(key);
    let out: Set<N>;
    if (p.global) {
      out = new Set(this.nodeKeys.keys());
    } else {
      out = new Set();
      const merge = (bag: Bag<N> | undefined) => {
        if (bag) for (const n of bag.keys()) out.add(n);
      };
      merge(this.global.get(GLOBAL_SLOT));
      if (p.wildcard) {
        merge(this.under.get(joinSegments(p.segments)));
        for (let i = 1; i <= p.segments.length; i++) merge(this.wild.get(joinSegments(p.segments, i)));
      } else {
        merge(this.exact.get(key));
        for (let i = 1; i < p.segments.length; i++) merge(this.wild.get(joinSegments(p.segments, i)));
      }
    }
    const result: ReadonlySet<N> = out.size === 0 ? (EMPTY as ReadonlySet<N>) : out;
    this.cache.set(key, result);
    return result;
  }
}

/** Create an empty graph. Nodes are opaque (`Element` by default). */
export function createGraph<N = Element>(): Graph<N> {
  const roles: Record<Role, RoleIndex<N>> = { writer: new RoleIndex(), reader: new RoleIndex() };
  const listeners = new Set<(batch: readonly GraphChange<N>[]) => void>();
  // Keyed by +id for adds and -id for removes so an add+remove in the same
  // tick cancels out without scanning.
  let pending = new Map<number, GraphChange<N>>();
  let scheduled = false;
  let nextId = 1;

  const flush = () => {
    scheduled = false;
    if (pending.size === 0) return;
    const batch = [...pending.values()];
    pending = new Map();
    for (const l of [...listeners]) l(batch);
  };

  const enqueue = (slot: number, change: GraphChange<N>) => {
    if (listeners.size === 0) return;
    if (slot < 0 && pending.delete(-slot)) return;
    pending.set(slot, change);
    if (!scheduled) {
      scheduled = true;
      queueMicrotask(flush);
    }
  };

  const register = (role: Role, node: N, keys: readonly Key[], options: NodeOptions = {}) => {
    const unique = [...new Set(keys)];
    for (const k of unique) parseKey(k); // validate everything before mutating
    const index = roles[role];
    for (const k of unique) index.add(node, k);
    if (unique.length > 0) index.nodeOptions.set(node, options);
    const id = nextId++;
    enqueue(id, { type: "add", role, node, keys: unique, options });
    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      for (const k of unique) index.remove(node, k);
      enqueue(-id, { type: "remove", role, node, keys: unique, options });
    };
  };

  const countsOf = (index: RoleIndex<N>): [Key[], Record<Key, number>] => {
    // Return the sorted key list separately: object key order puts
    // integer-like keys (e.g. "42") first regardless of insertion order.
    const keys = [...index.keyNodes.keys()].sort();
    const counts: Record<Key, number> = {};
    for (const k of keys) counts[k] = index.keyNodes.get(k)!.size;
    return [keys, counts];
  };

  return {
    addWriter: (node, keys, options) => register("writer", node, keys, options),
    addReader: (node, keys, options) => register("reader", node, keys, options),
    readersOf: (key) => roles.reader.query(key),
    writersOf: (key) => roles.writer.query(key),
    keysOf(node, role) {
      if (role) return [...(roles[role].nodeKeys.get(node)?.keys() ?? [])];
      return [
        ...new Set([
          ...(roles.writer.nodeKeys.get(node)?.keys() ?? []),
          ...(roles.reader.nodeKeys.get(node)?.keys() ?? []),
        ]),
      ];
    },
    optionsOf: (node, role) => roles[role].nodeOptions.get(node),
    has: (node, role) =>
      role ? roles[role].nodeKeys.has(node) : roles.writer.nodeKeys.has(node) || roles.reader.nodeKeys.has(node),
    size: (role) => roles[role].nodeKeys.size,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    snapshot() {
      const [writerKeys, writerCounts] = countsOf(roles.writer);
      const [readerKeys, readerCounts] = countsOf(roles.reader);
      return { writerKeys, readerKeys, writerCounts, readerCounts };
    },
  };
}
