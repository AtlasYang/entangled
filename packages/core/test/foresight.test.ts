// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type EntangledOptions,
  type EntangledRuntime,
  type RuntimeEvent,
  activationSensor,
  createEntangled,
  createPlanner,
  diffByKey,
  pointerSensor,
} from "../src/index.js";
import { compareForesight } from "../src/foresight.js";

describe("createPlanner", () => {
  type S = { n: number };
  const make = (simulate: (s: S, a: number) => S | undefined) =>
    createPlanner<S, number>({
      current: () => state,
      simulate,
      diff: (p, n) => (p.n === n.n ? [] : [{ key: "n", kind: "modify", from: p.n, to: n.n }]),
    });
  let state: S = { n: 1 };

  it("returns null when the action can't apply, changes nothing, or simulate throws", () => {
    expect(make(() => undefined)(1)).toBeNull();
    expect(make((s) => s)(1)).toBeNull();
    expect(
      make(() => {
        throw new Error("no");
      })(1),
    ).toBeNull();
    expect(make((s) => ({ ...s }))(1)).toBeNull(); // empty diff
  });

  it("otherwise returns the diff", () => {
    state = { n: 1 };
    expect(make((s, a) => ({ n: s.n + a }))(2)).toEqual([{ key: "n", kind: "modify", from: 1, to: 3 }]);
  });
});

describe("diffByKey", () => {
  type T = { id: string; v: number };
  const o = { id: (t: T) => t.id, key: (id: string) => `todo:${id}` };
  const a = { id: "a", v: 1 };
  const b = { id: "b", v: 1 };
  const c = { id: "c", v: 1 };

  it("add / remove / modify / unchanged, removals first", () => {
    const b2 = { id: "b", v: 2 };
    expect(diffByKey([a, b], [b2, c], o)).toEqual([
      { key: "todo:a", kind: "remove", from: a },
      { key: "todo:b", kind: "modify", from: b, to: b2 },
      { key: "todo:c", kind: "add", to: c },
    ]);
    expect(diffByKey([a, b], [a, b], o)).toEqual([]);
  });

  it("moves with `moved`, labels, and a custom `modified`", () => {
    const out = diffByKey([a, b, c], [c, a, b], {
      ...o,
      moved: (_p, _n, pi, ni) => pi !== ni,
      label: (kind, _p, _n) => (kind === "move" ? "moved" : undefined),
    });
    expect(out.map((x) => [x.key, x.kind, x.label])).toEqual([
      ["todo:c", "move", "moved"],
      ["todo:a", "move", "moved"],
      ["todo:b", "move", "moved"],
    ]);
    expect(diffByKey([a], [{ id: "a", v: 9 }], { ...o, modified: () => false })).toEqual([]);
  });

  it("duplicate ids: the first occurrence wins", () => {
    const a2 = { id: "a", v: 2 };
    expect(diffByKey([a, a2], [a], o)).toEqual([]);
    expect(diffByKey([a], [a2, a], o)).toEqual([{ key: "todo:a", kind: "modify", from: a, to: a2 }]);
  });
});

describe("compareForesight", () => {
  it("unexpected, missing (removals exempt) and mismatched", () => {
    const r = compareForesight(
      [{ key: "a", kind: "remove" }, { key: "b" }, { key: "c", kind: "add" }],
      [{ key: "c", kind: "modify" }, { key: "d" }],
    );
    expect(r.missing).toEqual([{ key: "b" }]);
    expect(r.unexpected).toEqual([{ key: "d" }]);
    expect(r.mismatched).toEqual([{ foreseen: { key: "c", kind: "add" }, actual: { key: "c", kind: "modify" } }]);
  });
});

describe("runtime.foresee", () => {
  const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  const $ = (sel: string) => document.querySelector(sel) as HTMLElement;
  const pointer = (type: string, target: Element, related: Element | null = null) =>
    target.dispatchEvent(new MouseEvent(type, { bubbles: true, relatedTarget: related }));
  const HTML = `<button id="w" data-en-affects="act" data-en-confirm="manual"></button>
    <div id="a" data-en-by="todo:a"></div><div id="b" data-en-by="todo:b"></div><p id="out"></p>`;
  let rt: EntangledRuntime | null = null;
  const boot = (opts: EntangledOptions = {}) => {
    document.body.innerHTML = HTML;
    rt = createEntangled({ sensors: [pointerSensor(), activationSensor()], habituation: false, dwellMs: 40, attention: { persist: false }, ...opts });
    rt.start();
    return rt;
  };
  const events = (r: EntangledRuntime) => {
    const out: RuntimeEvent[] = [];
    r.onEvent((e) => out.push(e));
    return out;
  };
  async function hover() {
    pointer("pointerover", $("#w"));
    await sleep(60);
    await frame();
  }
  async function leave() {
    pointer("pointerout", $("#w"), $("#out"));
    await frame();
  }
  afterEach(() => {
    rt?.destroy();
    rt = null;
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("runs the plan only after the dwell, never on pointerover", async () => {
    const r = boot();
    const plan = vi.fn(() => [{ key: "todo:a", kind: "remove" as const }]);
    r.foresee($("#w"), plan);
    pointer("pointerover", $("#w"));
    await sleep(10);
    expect(plan).not.toHaveBeenCalled();
    await sleep(50);
    await frame();
    expect(plan).toHaveBeenCalledTimes(1);
    expect($("#a").dataset.enKind).toBe("remove");
    expect($("#b").hasAttribute("data-en-state")).toBe(false);
  });

  it("reuses the last result while the revision holds", async () => {
    const r = boot();
    const log = events(r);
    let rev = 1;
    const plan = vi.fn(() => ["todo:a"]);
    r.foresee($("#w"), plan, { revision: () => rev });
    await hover();
    await leave();
    await hover();
    expect(plan).toHaveBeenCalledTimes(1);
    expect(log.filter((e) => e.type === "foresight").map((e) => (e as { cached: boolean }).cached)).toEqual([false, true]);
    await leave();
    rev = 2;
    await hover();
    expect(plan).toHaveBeenCalledTimes(2);
  });

  it("reports slow plans", async () => {
    const r = boot();
    const log = events(r);
    r.foresee($("#w"), () => ["todo:a"], { budgetMs: -1 });
    await hover();
    expect(log.find((e) => e.type === "foresight")).toMatchObject({ slow: true, cached: false, changes: [{ key: "todo:a" }] });
  });

  it("a throwing plan previews nothing and warns", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = boot();
    r.foresee($("#w"), () => {
      throw new Error("boom");
    });
    await hover();
    expect(document.querySelectorAll("[data-en-state]")).toHaveLength(0);
    expect(warn).toHaveBeenCalled();
  });

  it("accepts a WriterResolution", async () => {
    const r = boot();
    r.foresee($("#w"), () => ({ keys: ["todo:b"] }));
    await hover();
    expect($("#b").dataset.enState).toBe("preview");
  });

  it("severity: destructive draws the caution tone", async () => {
    const r = boot();
    r.foresee($("#w"), () => ["todo:a"], { severity: "destructive" });
    await hover();
    expect($("#a").dataset.enTone).toBe("caution");
  });

  describe("deviation", () => {
    const click = () => $("#w").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const setup = (o: { deviation?: boolean } = {}) => {
      const r = boot({ foresight: { deviationWindowMs: 50 } });
      const log = events(r);
      r.foresee($("#w"), () => [{ key: "todo:a", kind: "remove" }, { key: "todo:b", kind: "modify" }], o);
      return { r, log, deviations: () => log.filter((e) => e.type === "deviation") };
    };

    it("a matching self confirm emits nothing", async () => {
      const { r, deviations } = setup();
      await hover();
      click();
      r.confirm([{ key: "todo:b", kind: "modify" }], { origin: "self" });
      await sleep(80);
      expect(deviations()).toEqual([]);
    });

    it("unexpected, missing and mismatched", async () => {
      const { r, deviations } = setup();
      await hover();
      click();
      r.confirm([{ key: "todo:c" }], { origin: "self" });
      await sleep(80);
      expect(deviations()).toHaveLength(1);
      expect(deviations()[0]).toMatchObject({ unexpected: [{ key: "todo:c" }], missing: [{ key: "todo:b" }], mismatched: [] });
      await leave();
      await hover();
      click();
      r.confirm([{ key: "todo:b", kind: "add" }], { origin: "self" });
      await sleep(80);
      expect(deviations()[1]).toMatchObject({ mismatched: [{ foreseen: { key: "todo:b" }, actual: { key: "todo:b", kind: "add" } }] });
    });

    it("deviation: false emits nothing; confirms after the window don't count", async () => {
      const off = setup({ deviation: false });
      await hover();
      click();
      off.r.confirm("todo:c", { origin: "self" });
      await sleep(80);
      expect(off.deviations()).toEqual([]);
      off.r.destroy();
      const on = setup();
      await hover();
      click();
      await sleep(80);
      on.r.confirm("todo:b", { origin: "self" });
      expect(on.deviations()).toHaveLength(1);
      expect(on.deviations()[0]).toMatchObject({ missing: [{ key: "todo:b" }], actual: [] });
    });
  });
});
