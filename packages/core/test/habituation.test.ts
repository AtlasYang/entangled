// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type EntangledOptions,
  type EntangledRuntime,
  type HabituationEntry,
  createEntangled,
  createHabituation,
  habituationMultiplier,
  habituationVar,
  localStorageHabituationStore,
  memoryHabituationStore,
  parseVersionedKey,
  recoveredCount,
} from "../src/index.js";

const DAY = 86_400_000;
const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const $ = (sel: string) => document.querySelector(sel) as HTMLElement;

beforeEach(() => localStorage.clear());

describe("curve", () => {
  it("halves every halfLife exposures, down to the floor", () => {
    expect(habituationMultiplier(0, 5, 0.2)).toBe(1);
    expect(habituationMultiplier(5, 5, 0.2)).toBe(0.5);
    expect(habituationMultiplier(10, 5, 0.2)).toBe(0.25);
    expect(habituationMultiplier(1, 5, 0.2)).toBe(0.871);
    expect(habituationMultiplier(40, 5, 0.2)).toBe(0.2);
    expect(habituationMultiplier(40, 5, 0.5)).toBe(0.5); // peek is informational
  });

  it("recovers: the count halves after each full recovery period without exposure", () => {
    const e: HabituationEntry = { v: "", n: 12, t: 0 };
    expect(recoveredCount(e, 6.9 * DAY, 7)).toBe(12);
    expect(recoveredCount(e, 7 * DAY, 7)).toBe(6);
    expect(recoveredCount(e, 15 * DAY, 7)).toBe(3);
  });

  it("splits feature versions off keys", () => {
    expect(parseVersionedKey("export@2")).toEqual({ base: "export", version: "2" });
    expect(parseVersionedKey("media:42@v3")).toEqual({ base: "media:42", version: "v3" });
    expect(parseVersionedKey("export")).toEqual({ base: "export", version: "" });
    expect(parseVersionedKey("user@host:x")).toEqual({ base: "user@host:x", version: "" });
    expect(parseVersionedKey("@x")).toEqual({ base: "@x", version: "" });
  });

  it("names CSS variables safely and without collisions", () => {
    expect(habituationVar("theme", "preview")).toBe("--en-int-theme");
    expect(habituationVar("media:42", "peek")).toBe("--en-pint-media_3a_42");
    expect(habituationVar("a_b", "preview")).not.toBe(habituationVar("a:b", "preview"));
  });
});

describe("createHabituation", () => {
  let now = 1_000_000;
  const clock = () => now;
  const make = () => createHabituation({ store: memoryHabituationStore() }, clock);

  it("decays per key and kind, with per-kind floors", () => {
    const h = make();
    for (let i = 0; i < 5; i++) h.expose("theme", "preview");
    expect(h.multiplier("theme", "preview")).toBe(0.5);
    expect(h.multiplier("theme", "peek")).toBe(1);
    expect(h.multiplier("density", "preview")).toBe(1);
    for (let i = 0; i < 50; i++) h.expose("theme", "peek");
    expect(h.multiplier("theme", "peek")).toBe(0.5);
  });

  it("never habituates remote confirms: they are news", () => {
    const h = make();
    for (let i = 0; i < 10; i++) {
      expect(h.expose("doc", "confirm", "peer")).toBe(1);
      h.expose("doc", "confirm", "system");
    }
    expect(h.multiplier("doc", "confirm", "peer")).toBe(1);
    expect(h.multiplier("doc", "confirm", "system")).toBe(1);
    for (let i = 0; i < 5; i++) h.expose("doc", "confirm", "self");
    expect(h.multiplier("doc", "confirm", "self")).toBe(0.5);
  });

  it("recovers after time without exposure", () => {
    const h = make();
    for (let i = 0; i < 10; i++) h.expose("k", "preview");
    expect(h.multiplier("k", "preview")).toBe(0.25);
    now += 7 * DAY;
    expect(h.multiplier("k", "preview")).toBe(0.5);
    h.expose("k", "preview"); // 5 + 1, and the clock restarts
    now += 6 * DAY;
    expect(h.multiplier("k", "preview")).toBe(habituationMultiplier(6, 5, 0.2));
  });

  it("a new feature version starts over", () => {
    const h = make();
    for (let i = 0; i < 5; i++) h.expose("export@1", "preview");
    expect(h.multiplier("export@1", "preview")).toBe(0.5);
    expect(h.multiplier("export@2", "preview")).toBe(1);
    h.expose("export@2", "preview");
    expect(h.multiplier("export@2", "preview")).toBe(0.871);
  });

  it("resets one key or everything, and inspects", () => {
    const h = make();
    h.expose("a", "preview");
    h.expose("a", "confirm", "self");
    h.expose("b@2", "peek");
    expect(h.inspect()).toEqual([
      { key: "a", kind: "confirm", origin: "self", count: 1, multiplier: 0.871, lastSeen: now },
      { key: "a", kind: "preview", count: 1, multiplier: 0.871, lastSeen: now },
      { key: "b@2", kind: "peek", count: 1, multiplier: 0.871, lastSeen: now },
    ]);
    h.reset("a");
    expect(h.inspect().map((r) => r.key)).toEqual(["b@2"]);
    h.reset();
    expect(h.inspect()).toEqual([]);
  });
});

describe("localStorage store", () => {
  afterEach(() => vi.restoreAllMocks());

  it("persists a versioned schema with debounced writes", async () => {
    const store = localStorageHabituationStore({ debounceMs: 10 });
    store.set("preview:theme", { v: "", n: 3, t: 5 });
    store.set("preview:theme", { v: "", n: 4, t: 6 });
    expect(localStorage.getItem("entangled:habituation")).toBeNull(); // not yet
    await sleep(30);
    expect(JSON.parse(localStorage.getItem("entangled:habituation")!)).toEqual({ v: 1, entries: { "preview:theme": ["", 4, 6] } });
    expect(localStorageHabituationStore().get("preview:theme")).toEqual({ v: "", n: 4, t: 6 });
  });

  it("starts fresh on corrupt data or another schema version", () => {
    localStorage.setItem("entangled:habituation", "{not json");
    expect([...localStorageHabituationStore().keys!()]).toEqual([]);
    localStorage.setItem("entangled:habituation", JSON.stringify({ v: 99, entries: { "preview:x": ["", 1, 1] } }));
    expect(localStorageHabituationStore().get("preview:x")).toBeUndefined();
  });

  it("keeps working in memory when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    const store = localStorageHabituationStore({ debounceMs: 0 });
    const h = createHabituation({ store });
    for (let i = 0; i < 5; i++) h.expose("k", "preview");
    expect(() => store.flush()).not.toThrow();
    expect(h.multiplier("k", "preview")).toBe(0.5);
  });

  it("seeds from a sync adapter and hands it every write", () => {
    const save = vi.fn();
    const store = localStorageHabituationStore({
      debounceMs: 0,
      sync: { load: () => ({ "preview:k": { v: "", n: 7, t: 1 } }), save },
    });
    store.set("preview:j", { v: "", n: 1, t: 2 });
    expect(store.get("preview:k")).toEqual({ v: "", n: 7, t: 1 });
    store.flush();
    expect(save).toHaveBeenCalledWith({ "preview:k": { v: "", n: 7, t: 1 }, "preview:j": { v: "", n: 1, t: 2 } });
  });
});

describe("runtime", () => {
  let rt: EntangledRuntime | null = null;
  afterEach(() => {
    rt?.destroy();
    rt = null;
    document.body.innerHTML = "";
  });
  const pointer = (type: string, target: Element, related: Element | null = null) =>
    target.dispatchEvent(new MouseEvent(type, { bubbles: true, relatedTarget: related }));
  const HTML = `<button id="w" data-en-affects="k"></button><div id="r" data-en-by="k"></div><p id="out"></p>`;
  const boot = (opts: EntangledOptions = {}) => {
    document.body.innerHTML = HTML;
    rt = createEntangled({ dwellMs: 0, habituation: { store: memoryHabituationStore() }, ...opts });
    rt.start();
    return rt;
  };
  /** One fully shown hover: past the dwell and the preview's fade-in (180ms). */
  async function hover() {
    pointer("pointerover", $("#w"));
    await sleep(200);
    await frame();
    const intensity = Number($("#r").style.getPropertyValue("--en-intensity"));
    pointer("pointerout", $("#w"), $("#out"));
    await frame();
    return intensity;
  }
  const settle = () => sleep(250); // idle processing (setTimeout fallback in jsdom)

  it("JS mode: previews quiet down across repeated hovers", async () => {
    const r = boot();
    expect(await hover()).toBe(1);
    await settle();
    expect(await hover()).toBe(0.871);
    await settle();
    expect(await hover()).toBe(habituationMultiplier(2, 5, 0.2));
    expect(r.habituation.inspect()).toMatchObject([{ key: "k", kind: "preview", count: 2 }]);
    r.habituation.reset("k");
    expect(await hover()).toBe(1);
  });

  it("does not count hovers that end before the preview was fully shown", async () => {
    const r = boot();
    pointer("pointerover", $("#w"));
    await frame();
    pointer("pointerout", $("#w"), $("#out"));
    await settle();
    expect(r.habituation.inspect()).toEqual([]);
  });

  it("your own confirms quiet down; remote ones never do", async () => {
    const r = boot({ confirmMs: 10, remoteConfirmMs: 10, coalesceMs: 0 });
    for (let i = 0; i < 5; i++) {
      r.confirm("k", { origin: "self" });
      await frame();
      await sleep(20);
      await frame();
    }
    await settle();
    r.confirm("k", { origin: "self" });
    await frame();
    expect($("#r").style.getPropertyValue("--en-intensity")).toBe("0.5");
    await sleep(20);
    await frame();
    r.confirm("k", { origin: "peer" });
    await frame();
    expect($("#r").style.getPropertyValue("--en-intensity")).toBe("1");
  });

  it("destructive self confirms don't count exposures", async () => {
    const r = boot({ confirmMs: 10, coalesceMs: 0 });
    for (let i = 0; i < 3; i++) {
      r.confirm("k", { origin: "self", severity: "destructive" });
      await frame();
      await sleep(20);
      await frame();
    }
    await settle();
    expect(r.habituation.inspect()).toEqual([]);
  });

  it("CSS mode: compiled rules read root variables, set off the hover path", async () => {
    const g = globalThis as { CSS?: unknown };
    const prev = g.CSS;
    g.CSS = { supports: (q: string) => q.includes(":has"), registerProperty: () => {} };
    try {
      const r = boot({ mode: "css" });
      expect(r.mode).toBe("css");
      const compiled = document.querySelector('style[data-en-sheet="compiled"]')!.textContent!;
      expect(compiled).toContain("--en-intensity: calc(1 * var(--en-int-k, 1));");
      const root = document.documentElement.style;
      pointer("pointerover", $("#w"));
      await sleep(200);
      expect(root.getPropertyValue("--en-int-k")).toBe(""); // nothing written while hovering
      pointer("pointerout", $("#w"), $("#out"));
      await settle();
      expect(root.getPropertyValue("--en-int-k")).toBe("0.871");
      r.habituation.reset();
      expect(root.getPropertyValue("--en-int-k")).toBe("");
    } finally {
      g.CSS = prev;
    }
  });

  it("can be disabled", async () => {
    const r = boot({ habituation: false });
    await hover();
    await settle();
    expect(await hover()).toBe(1);
    expect(r.habituation.enabled).toBe(false);
    expect(r.habituation.inspect()).toEqual([]);
  });

  it("persists across runtimes through the default store", async () => {
    document.body.innerHTML = HTML;
    rt = createEntangled({ dwellMs: 0 });
    rt.start();
    await hover();
    rt.destroy(); // processes and flushes pending exposures
    rt = createEntangled({ dwellMs: 0 });
    rt.start();
    expect(rt.habituation.inspect()).toMatchObject([{ key: "k", kind: "preview", count: 1 }]);
  });
});
