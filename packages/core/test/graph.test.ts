import { describe, expect, it, vi } from "vitest";
import { type GraphChange, createGraph, keyMatches } from "../src/index.js";

const node = (name: string) => ({ name });
type Node = ReturnType<typeof node>;
const names = (s: ReadonlySet<Node>) => [...s].map((n) => n.name).sort();
const tick = () => new Promise<void>((r) => queueMicrotask(r));

describe("graph registration", () => {
  it("indexes readers and writers by exact key", () => {
    const g = createGraph<Node>();
    const btn = node("btn");
    const main = node("main");
    g.addWriter(btn, ["theme"]);
    g.addReader(main, ["theme"]);
    expect(names(g.readersOf("theme"))).toEqual(["main"]);
    expect(names(g.writersOf("theme"))).toEqual(["btn"]);
    expect(g.readersOf("other").size).toBe(0);
  });

  it("dispose is idempotent and removes the node", () => {
    const g = createGraph<Node>();
    const a = node("a");
    const off = g.addReader(a, ["theme"]);
    off();
    off();
    expect(g.readersOf("theme").size).toBe(0);
    expect(g.has(a)).toBe(false);
    expect(g.size("reader")).toBe(0);
  });

  it("ref-counts the same node registered twice", () => {
    const g = createGraph<Node>();
    const a = node("a");
    const off1 = g.addReader(a, ["theme"]);
    const off2 = g.addReader(a, ["theme"]);
    off1();
    expect(names(g.readersOf("theme"))).toEqual(["a"]);
    off2();
    expect(g.readersOf("theme").size).toBe(0);
  });

  it("validates all keys before mutating", () => {
    const g = createGraph<Node>();
    expect(() => g.addReader(node("a"), ["theme", "bad key"])).toThrow();
    expect(g.readersOf("theme").size).toBe(0);
  });

  it("tracks keys and options per node and role", () => {
    const g = createGraph<Node>();
    const a = node("a");
    g.addWriter(a, ["theme"], { priority: 2 });
    g.addReader(a, ["media:1", "theme"], { effect: "tint" });
    expect(g.keysOf(a, "writer")).toEqual(["theme"]);
    expect([...g.keysOf(a)].sort()).toEqual(["media:1", "theme"]);
    expect(g.optionsOf(a, "writer")).toEqual({ priority: 2 });
    expect(g.optionsOf(a, "reader")).toEqual({ effect: "tint" });
  });

  it("invalidates cached query results on mutation", () => {
    const g = createGraph<Node>();
    g.addReader(node("a"), ["theme"]);
    const first = g.readersOf("theme");
    expect(g.readersOf("theme")).toBe(first); // cached
    g.addReader(node("b"), ["theme"]);
    expect(names(g.readersOf("theme"))).toEqual(["a", "b"]);
  });
});

describe("wildcard queries", () => {
  const g = createGraph<Node>();
  const readers: Record<string, string> = {
    m42: "media:42",
    m43: "media:43",
    m42thumb: "media:42:thumb",
    mAll: "media:*",
    m42All: "media:42:*",
    mediaRoot: "media",
    other: "mediaX:1",
    global: "*",
    theme: "theme",
  };
  for (const [name, key] of Object.entries(readers)) g.addReader(node(name), [key]);

  // The index must agree with the reference matcher for every query.
  it.each(["media:42", "media:*", "media:42:*", "media", "theme", "*", "media:42:thumb", "nope:*"])(
    "readersOf(%s) agrees with keyMatches",
    (q) => {
      const expected = Object.entries(readers)
        .filter(([, k]) => keyMatches(q, k))
        .map(([n]) => n)
        .sort();
      expect(names(g.readersOf(q))).toEqual(expected);
    },
  );
});

describe("randomized agreement with keyMatches", () => {
  it("index matches brute force over a random graph", () => {
    let seed = 7;
    const rand = (n: number) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n);
    const seg = () => ["a", "b", "c"][rand(3)]!;
    const randKey = () => {
      if (rand(20) === 0) return "*";
      const len = 1 + rand(3);
      const parts = Array.from({ length: len }, seg);
      if (rand(3) === 0) parts.push("*");
      return parts.join(":");
    };
    const g = createGraph<Node>();
    const regs: Array<{ n: Node; k: string; off: () => void }> = [];
    for (let i = 0; i < 300; i++) {
      const n = node(`n${i}`);
      const k = randKey();
      regs.push({ n, k, off: g.addReader(n, [k]) });
    }
    // Remove a third to exercise removal paths.
    const live = regs.filter((r, i) => (i % 3 === 0 ? (r.off(), false) : true));
    for (let i = 0; i < 200; i++) {
      const q = randKey();
      const expected = live.filter((r) => keyMatches(q, r.k)).map((r) => r.n.name).sort();
      expect(names(g.readersOf(q))).toEqual(expected);
    }
  });
});

describe("microtask batching", () => {
  it("delivers one coalesced batch per microtask", async () => {
    const g = createGraph<Node>();
    const listener = vi.fn<(b: readonly GraphChange<Node>[]) => void>();
    g.subscribe(listener);
    g.addWriter(node("a"), ["theme"]);
    g.addReader(node("b"), ["theme"]);
    expect(listener).not.toHaveBeenCalled();
    await tick();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]![0].map((c) => `${c.type}:${c.role}:${c.node.name}`)).toEqual([
      "add:writer:a",
      "add:reader:b",
    ]);
  });

  it("cancels an add and remove within the same tick", async () => {
    const g = createGraph<Node>();
    const listener = vi.fn();
    g.subscribe(listener);
    g.addReader(node("a"), ["theme"])();
    await tick();
    expect(listener).not.toHaveBeenCalled();
  });

  it("reports removes across ticks", async () => {
    const g = createGraph<Node>();
    const listener = vi.fn<(b: readonly GraphChange<Node>[]) => void>();
    g.subscribe(listener);
    const off = g.addReader(node("a"), ["theme"]);
    await tick();
    off();
    await tick();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls[1]![0][0]).toMatchObject({ type: "remove", keys: ["theme"] });
  });

  it("indexes synchronously even though notifications are batched", () => {
    const g = createGraph<Node>();
    g.subscribe(() => {});
    g.addReader(node("a"), ["theme"]);
    expect(g.readersOf("theme").size).toBe(1);
  });
});

describe("snapshot", () => {
  it("is plain sorted data with per-key counts", () => {
    const g = createGraph<Node>();
    g.addWriter(node("w"), ["theme", "media:*"]);
    g.addReader(node("r1"), ["media:42"]);
    g.addReader(node("r2"), ["media:42", "42"]);
    expect(g.snapshot()).toEqual({
      writerKeys: ["media:*", "theme"],
      readerKeys: ["42", "media:42"],
      writerCounts: { "media:*": 1, theme: 1 },
      readerCounts: { "42": 1, "media:42": 2 },
    });
  });
});

describe("scaling", () => {
  it("query cost does not depend on unrelated node count", () => {
    const g = createGraph<Node>();
    for (let i = 0; i < 20000; i++) g.addReader(node(`n${i}`), [`media:${i}`]);
    g.addReader(node("t"), ["theme"]);
    expect(names(g.readersOf("theme"))).toEqual(["t"]);
    expect(g.readersOf("media:*").size).toBe(20000);
    expect(g.readersOf("media:19999").size).toBe(1);
  });
});
