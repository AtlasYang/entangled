// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  type EntangledOptions,
  type EntangledRuntime,
  type RuntimeEvent,
  compileReverseCss,
  createEntangled,
  createGraph,
  isEditable,
  reverseReach,
  sourcesOf,
} from "../src/index.js";

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const $ = (sel: string) => document.querySelector(sel) as HTMLElement;
const el = (id: string) => Object.assign(document.createElement("div"), { id });
const ids = (els: Iterable<Element>) => [...els].map((e) => e.id).sort();

describe("sourcesOf", () => {
  it("finds the writers of every key a reader reads, wildcard-aware, never * writers or the reader itself", () => {
    const g = createGraph<Element>();
    const [reader, theme, theme2, global, upload, edit] = ["r", "theme", "theme2", "global", "upload", "edit"].map(el);
    g.addReader(reader!, ["theme", "media:4"]);
    g.addWriter(reader!, ["theme"]); // also a writer: still not its own source
    g.addWriter(theme!, ["theme"]);
    g.addWriter(theme2!, ["theme", "density"]);
    g.addWriter(global!, ["*"]);
    g.addWriter(upload!, ["media:*"]);
    g.addWriter(edit!, ["media:5"]);
    expect(ids(sourcesOf(g, reader!))).toEqual(["theme", "theme2", "upload"]);
  });

  it("follows writers of writers up to the depth, and survives cycles", () => {
    const g = createGraph<Element>();
    const [r, w, v, u] = ["r", "w", "v", "u"].map(el);
    g.addReader(r!, ["x"]);
    g.addWriter(w!, ["x"]);
    g.addReader(w!, ["y"]); // w's own state depends on y...
    g.addWriter(v!, ["y"]); // ...which v controls
    g.addReader(v!, ["x"]); // cycle back to x
    g.addWriter(u!, ["z"]);
    expect(ids(sourcesOf(g, r!, 1))).toEqual(["w"]);
    expect(ids(sourcesOf(g, r!, 2))).toEqual(["v", "w"]);
    expect(ids(sourcesOf(g, r!, 5))).toEqual(["v", "w"]);
    expect(reverseReach(g, 1)).toEqual({ x: ["x"], y: ["y"] });
    expect(reverseReach(g, 2)).toEqual({ x: ["x", "y"], y: ["x", "y"] });
  });
});

describe("compileReverseCss", () => {
  it("one hover and one focus rule per reader key, gated on data-en-query", () => {
    expect(compileReverseCss({ theme: ["theme"], "media:4": ["media:*", "media:4"] })).toMatchSnapshot();
  });
});

describe("isEditable", () => {
  it("is true where typing happens", () => {
    document.body.innerHTML = `<input id="t"><input id="c" type="checkbox"><textarea id="a"></textarea><div contenteditable id="e"><b id="in"></b></div><button id="b"></button>`;
    expect(["t", "c", "a", "e", "in", "b"].map((id) => isEditable($(`#${id}`)))).toEqual([true, false, true, true, true, false]);
    expect(isEditable(null)).toBe(false);
  });
});

let rt: EntangledRuntime | null = null;
afterEach(() => {
  rt?.destroy();
  rt = null;
  document.body.innerHTML = "";
});
const HTML = `
  <button id="theme" data-en-affects="theme"></button>
  <button id="density" data-en-affects="density"></button>
  <section id="card" data-en-by="theme"><span id="inner">x</span></section>
  <input id="field">`;
const boot = (opts: EntangledOptions = {}) => {
  document.body.innerHTML = HTML;
  rt = createEntangled({ sensors: [], habituation: false, ...opts });
  rt.start();
  return rt;
};
const key = (type: "keydown" | "keyup", k = "Alt") => document.dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true }));
const over = (target: Element) => target.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
const source = (id: string) => $(`#${id}`).style.getPropertyValue("--en-source");

describe("reverse query in the runtime", () => {
  it("JS mode: modifier + hover marks the controls that affect the element, release clears", async () => {
    const r = boot();
    key("keydown");
    expect(document.documentElement.hasAttribute("data-en-query")).toBe(true);
    expect(r.querying).toBe(true);
    over($("#inner")); // inside the reader
    await frame();
    expect(source("theme")).toBe("1");
    expect(source("density")).toBe("");
    expect(r.getState($("#theme")).source).toBe(true);
    key("keyup");
    await frame();
    expect(document.documentElement.hasAttribute("data-en-query")).toBe(false);
    expect(source("theme")).toBe("");
    expect($("#theme").hasAttribute("style")).toBe(false);
  });

  it("clears when the window loses focus or another key is pressed", async () => {
    const r = boot();
    key("keydown");
    over($("#card"));
    await frame();
    window.dispatchEvent(new Event("blur"));
    await frame();
    expect(r.querying).toBe(false);
    expect(source("theme")).toBe("");
    key("keydown");
    key("keydown", "Tab"); // Alt+Tab, Alt+F...: a shortcut, not an inspection
    expect(r.querying).toBe(false);
  });

  it("is ignored while typing in an editable field", () => {
    const r = boot();
    $("#field").focus();
    key("keydown");
    expect(r.querying).toBe(false);
    expect(document.documentElement.hasAttribute("data-en-query")).toBe(false);
  });

  it("honours the configured modifier, and can be disabled", () => {
    const r = boot({ reverseQuery: { modifier: "Shift" } });
    key("keydown");
    expect(r.querying).toBe(false);
    key("keydown", "Shift");
    expect(r.querying).toBe(true);
    r.destroy();
    expect(document.documentElement.hasAttribute("data-en-query")).toBe(false);
    const off = boot({ reverseQuery: false });
    key("keydown");
    expect(off.querying).toBe(false);
  });

  it("CSS mode: JS only toggles data-en-query and injects the compiled rules while held", () => {
    const g = globalThis as { CSS?: unknown };
    const prev = g.CSS;
    g.CSS = { supports: (q: string) => q.includes(":has"), registerProperty: () => {} };
    try {
      const r = boot({ mode: "css" });
      const sheet = () => document.querySelector('style[data-en-sheet="reverse"]')?.textContent ?? null;
      expect(sheet()).toBeNull();
      key("keydown");
      expect(sheet()).toContain(':root[data-en-query]:has([data-en-by~="theme"]:hover) [data-en-affects~="theme"]');
      over($("#card"));
      expect(source("theme")).toBe(""); // no JS writes: CSS does it
      key("keyup");
      expect(sheet()).toBeNull();
      expect(r.sourcesOf($("#card")).map((e) => e.id)).toEqual(["theme"]);
    } finally {
      g.CSS = prev;
    }
  });
});

describe("runtime events", () => {
  it("reports confirms, budget overflows, graph changes and queries", async () => {
    const readers = Array.from({ length: 5 }, (_, i) => `<i data-en-by="list:${i}"></i>`).join("");
    document.body.innerHTML = `<button id="w" data-en-affects="list:*"></button>${readers}`;
    rt = createEntangled({ sensors: [], habituation: false, maxConcurrentTargets: 2 });
    rt.start();
    const events: RuntimeEvent[] = [];
    const off = rt.onEvent((e) => events.push(e));
    rt.confirm("list:*", { origin: "peer", actor: { id: "u1", name: "Mina" } });
    rt.preview("list:*");
    await frame();
    document.body.append(document.createElement("i"));
    document.body.lastElementChild!.setAttribute("data-en-by", "list:9");
    await Promise.resolve();
    await Promise.resolve();
    key("keydown");
    key("keyup");
    off();
    expect(events.map((e) => e.type)).toEqual(["confirm", "budget", "budget", "graph", "query", "query"]);
    expect(events[0]).toMatchObject({ keys: ["list:*"], origin: "peer", actor: { name: "Mina" }, shown: 2 });
    // A peer's confirm also counts the writer: it's newly available to you.
    expect(events[1]).toMatchObject({ kind: "confirm", key: "list:*", candidates: 6, shown: 2 });
    expect(events[2]).toMatchObject({ kind: "preview", key: "list:*", candidates: 5, shown: 2 });
  });
});
