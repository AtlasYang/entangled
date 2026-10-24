// @vitest-environment jsdom
import { type EntangledRuntime, type RuntimeEvent, createEntangled, createGraph } from "@entangled-ui/core";
import { afterEach, describe, expect, it } from "vitest";
import { type BudgetStat, type ForesightStat, collectBudget, collectForesight, lint, mountDevtools } from "../src/index.js";
import * as noop from "../src/noop.js";

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

describe("lint: foresight", () => {
  it("flags writers whose foresight plans are routinely slow", () => {
    const stats = new Map<string, ForesightStat>();
    const writer = document.createElement("button");
    writer.setAttribute("data-en-affects", "todo:delete");
    const ev = (slow: boolean, durationMs: number): RuntimeEvent => ({
      type: "foresight",
      time: 0,
      writer,
      changes: [],
      durationMs,
      cached: false,
      slow,
    });
    collectForesight(stats, ev(true, 12));
    collectForesight(stats, ev(false, 1));
    collectForesight(stats, ev(true, 20));
    expect(lint({ snapshot: createGraph<object>().snapshot(), foresight: stats })).toEqual([]);
    collectForesight(stats, ev(true, 9));
    expect(stats.get("todo:delete")).toEqual({ key: "todo:delete", slow: 3, maxMs: 20 });
    expect(lint({ snapshot: createGraph<object>().snapshot(), foresight: stats }).map((w) => w.code)).toEqual(["foresight-slow"]);
    expect(noop.collectForesight()).toBeUndefined();
  });
});

describe("lint", () => {
  const snapshotOf = (writers: Record<string, string[]>, readers: Record<string, string[]>) => {
    const g = createGraph<object>();
    for (const keys of Object.values(writers)) g.addWriter({}, keys);
    for (const keys of Object.values(readers)) g.addReader({}, keys);
    return g.snapshot();
  };

  it("flags writers nothing reads and readers nothing writes, wildcard-aware", () => {
    const snapshot = snapshotOf(
      { a: ["theme"], b: ["media:*"], c: ["export"], d: ["*"] },
      { x: ["theme"], y: ["media:7"], z: ["orphan"] },
    );
    expect(lint({ snapshot }).map((w) => [w.code, w.key])).toEqual([
      ["writer-without-readers", "export"],
      ["reader-without-writers", "orphan"], // a * writer doesn't count
    ]);
  });

  it("flags keys that routinely exceed the attention budget, and rejected peek tokens", () => {
    const stats = new Map<string, BudgetStat & { key: string }>();
    const over = (key: string, candidates: number): RuntimeEvent => ({ type: "budget", time: 0, key, kind: "preview", candidates, shown: 8 });
    for (const c of [20, 24, 22]) collectBudget(stats, over("list:*", c));
    collectBudget(stats, over("once", 30));
    collectBudget(stats, { type: "graph", time: 0 });
    const warnings = lint({
      snapshot: snapshotOf({}, {}),
      budget: stats,
      rejections: [{ key: "density", token: "--gap", reason: "syntax <length> may affect layout" }],
    });
    expect(warnings.map((w) => [w.code, w.key])).toEqual([
      ["over-budget", "list:*"],
      ["peek-rejected", "density"],
    ]);
    expect(warnings[0]!.message).toContain("3 times on preview (up to 24 candidates for 8 slots)");
  });
});

describe("panel", () => {
  let rt: EntangledRuntime | null = null;
  let unmount: (() => void) | null = null;
  afterEach(() => {
    unmount?.();
    rt?.destroy();
    rt = unmount = null;
    document.body.innerHTML = "";
  });
  const boot = () => {
    document.body.innerHTML = `
      <button id="w" data-en-affects="theme"></button>
      <div id="r1" data-en-by="theme"></div><div id="r2" data-en-by="theme"></div>
      <i data-en-by="orphan"></i>`;
    rt = createEntangled({ sensors: [], habituation: false });
    rt.start();
    return rt;
  };
  const shadow = () => document.querySelector("entangled-devtools")!.shadowRoot!;
  const $ = (sel: string) => shadow().querySelector(sel) as HTMLElement;
  const tab = async (id: string) => {
    $(`[data-tab="${id}"]`).click();
    await frame();
  };

  it("mounts one fixed, inert host in a shadow root, and unmounts cleanly", () => {
    unmount = mountDevtools(boot());
    const host = document.querySelector("entangled-devtools") as HTMLElement;
    expect(host.style.position).toBe("fixed");
    expect(host.style.pointerEvents).toBe("none");
    expect(host.hasAttribute("data-en-by")).toBe(false);
    expect(rt!.graph.has(host)).toBe(false);
    unmount();
    unmount = null;
    expect(document.querySelector("entangled-devtools")).toBeNull();
  });

  it("lists keys with counts; selecting one draws writer → reader lines", async () => {
    unmount = mountDevtools(boot(), { open: true });
    const row = $('tr[data-key="theme"]');
    expect([...row.querySelectorAll("td")].map((td) => td.textContent)).toEqual(["theme", "1", "2"]);
    (row.querySelector("button") as HTMLElement).click();
    expect(shadow().querySelectorAll(".lines line")).toHaveLength(2);
    expect(shadow().querySelectorAll(".lines rect.writer")).toHaveLength(1);
    expect(shadow().querySelectorAll(".lines rect.reader")).toHaveLength(2);
  });

  it("logs confirms with origin and actor, lints, and resets habituation", async () => {
    document.body.innerHTML = `<button data-en-affects="theme"></button><div data-en-by="theme"></div><i data-en-by="orphan"></i>`;
    rt = createEntangled({ sensors: [] });
    rt.start();
    unmount = mountDevtools(rt, { open: true });
    rt.confirm("theme", { origin: "peer", actor: { id: "u42", name: "Mina" } });
    await frame();
    await tab("log");
    const entry = $(".log li");
    expect(entry.dataset.origin).toBe("peer");
    expect(entry.textContent).toContain("Mina");
    expect(entry.textContent).toContain("theme");

    await tab("lint");
    expect($('[data-code="reader-without-writers"]').textContent).toContain('"orphan"');
    expect($('[data-tab="lint"] .count').textContent).toBe("1");

    rt.habituation.reset();
    rt.confirm("theme", { origin: "self" });
    await frame();
    await new Promise((r) => setTimeout(r, 250)); // idle processing
    await tab("habituation");
    expect($('tr[data-key="theme"]')).not.toBeNull();
    ($('tr[data-key="theme"] button') as HTMLElement).click();
    expect(rt.habituation.inspect()).toEqual([]);
  });

  it("the production entry has the same API and does nothing", () => {
    const off = noop.mountDevtools(boot());
    expect(document.querySelector("entangled-devtools")).toBeNull();
    expect(noop.lint({ snapshot: rt!.graph.snapshot() })).toEqual([]);
    off();
  });
});
