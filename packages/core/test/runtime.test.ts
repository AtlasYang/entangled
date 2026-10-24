// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  type EntangledOptions,
  type EntangledRuntime,
  type RuntimeEvent,
  chooseMode,
  createEntangled,
  dragSensor,
  pointerSensor,
} from "../src/index.js";

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const $ = (sel: string) => document.querySelector(sel) as HTMLElement;

let rt: EntangledRuntime | null = null;
const boot = (html: string, opts: EntangledOptions = {}) => {
  document.body.innerHTML = html;
  rt = createEntangled({ sensors: [], habituation: false, ...opts });
  rt.start();
  return rt;
};

afterEach(() => {
  rt?.destroy();
  rt = null;
  document.body.innerHTML = "";
  document.body.removeAttribute("data-en-by");
});

describe("attribute registration", () => {
  it("mirrors data-en-* into the graph and resolves effects by role", () => {
    const r = boot(`
      <button id="w" data-en-affects="theme">t</button>
      <div id="d" data-en-by="theme"></div>
      <img id="i" data-en-by="media:1">
      <section id="s" data-en-by="theme" data-en-effect="pulse"></section>
      <span id="x" data-en-affects="theme"></span>`);
    expect(r.graph.readersOf("theme").size).toBe(2);
    expect(r.graph.writersOf("theme").size).toBe(2);
    expect($("#w").dataset.enFx).toBe("ring");
    expect($("#d").dataset.enFx).toBe("tint");
    expect($("#i").dataset.enFx).toBe("sweep");
    expect($("#s").dataset.enFx).toBe("pulse");
    expect($("#x").dataset.enFx).toBe("ring"); // writer-only, so treated as a control
  });

  it("follows DOM additions, attribute changes and removals", async () => {
    const r = boot(`<div id="host"></div>`);
    const el = document.createElement("div");
    el.setAttribute("data-en-by", "theme");
    $("#host").append(el);
    await Promise.resolve();
    expect(r.graph.readersOf("theme").has(el)).toBe(true);
    el.setAttribute("data-en-by", "media:2");
    await Promise.resolve();
    expect(r.graph.readersOf("theme").size).toBe(0);
    expect(r.graph.readersOf("media:*").has(el)).toBe(true);
    el.remove();
    await Promise.resolve();
    expect(r.graph.readersOf("media:*").size).toBe(0);
  });

  it("drops invalid tokens and reports them", () => {
    const bad: string[] = [];
    const r = boot(`<div data-en-by="theme bad:*:x"></div>`, { onInvalidKey: (t) => bad.push(t) });
    expect(bad).toEqual(["bad:*:x"]);
    expect(r.graph.readersOf("theme").size).toBe(1);
  });
});

describe("preview", () => {
  it("marks only matching readers and cleans up after itself", async () => {
    const r = boot(`
      <div id="a" data-en-by="theme"></div>
      <div id="b" data-en-by="other"></div>`);
    const end = r.preview("theme");
    await frame();
    expect($("#a").dataset.enState).toBe("preview");
    expect($("#a").style.getPropertyValue("--en-preview")).toBe("1");
    expect($("#b").hasAttribute("data-en-state")).toBe(false);
    expect(r.getState($("#a"))).toEqual({ state: "preview", intensity: 1, key: "theme", origin: null, source: false, kind: null, label: null });
    end();
    await frame();
    expect($("#a").hasAttribute("data-en-state")).toBe(false);
    expect($("#a").hasAttribute("style")).toBe(false); // no leftover empty style attr
    expect(r.getState($("#a")).state).toBe("idle");
  });

  it("routes global surfaces and `*` to the single overlay", async () => {
    document.body.setAttribute("data-en-by", "theme");
    const r = boot(``);
    const overlay = document.querySelector("[data-en-overlay]") as HTMLElement;
    expect(overlay.getAttribute("aria-hidden")).toBe("true");
    expect(overlay.style.position).toBe("fixed");
    expect(overlay.style.pointerEvents).toBe("none");
    const end = r.preview("theme");
    await frame();
    expect(overlay.dataset.enState).toBe("preview");
    expect(document.body.hasAttribute("data-en-state")).toBe(false);
    end();
    r.preview("*");
    await frame();
    expect(overlay.dataset.enState).toBe("preview");
  });

  it("enforces the attention budget", async () => {
    const html = Array.from({ length: 20 }, (_, i) => `<div data-en-by="list:${i}"></div>`).join("");
    const r = boot(html, { maxConcurrentTargets: 5 });
    r.preview("list:*");
    await frame();
    const lit = [...document.querySelectorAll<HTMLElement>("[data-en-state]")];
    expect(lit).toHaveLength(5);
    expect(lit[0]).toBe(document.querySelector("[data-en-by]")); // document order
    const intensity = Number(lit[0]!.style.getPropertyValue("--en-intensity"));
    expect(intensity).toBeGreaterThan(0.35);
    expect(intensity).toBeLessThan(1);
  });

  it("honours data-en-priority over document order", async () => {
    const r = boot(
      `<div id="a" data-en-by="k"></div><div id="b" data-en-by="k"></div><div id="c" data-en-by="k" data-en-priority="5"></div>`,
      { maxConcurrentTargets: 1 },
    );
    r.preview("k");
    await frame();
    expect($("#c").dataset.enState).toBe("preview");
    expect($("#a").hasAttribute("data-en-state")).toBe(false);
  });
});

describe("confirm", () => {
  it("highlights readers and other writers but not the source, then expires", async () => {
    const r = boot(
      `<button id="upload" data-en-affects="media:*">Upload</button>
       <img id="img" data-en-by="media:42">
       <button id="edit" data-en-affects="media:42">Edit</button>
       <div id="other" data-en-by="theme"></div>`,
      { confirmMs: 60 },
    );
    r.confirm("media:42", { source: $("#upload") });
    await frame();
    expect($("#img").dataset.enState).toBe("confirm");
    expect($("#edit").dataset.enState).toBe("confirm");
    expect($("#upload").hasAttribute("data-en-state")).toBe(false);
    expect($("#other").hasAttribute("data-en-state")).toBe(false);
    await sleep(120);
    await frame();
    expect($("#img").hasAttribute("data-en-state")).toBe(false);
  });

  it("does not treat writers of `*` as writers of every key", async () => {
    const r = boot(`
      <button id="theme" data-en-affects="theme *"></button>
      <button id="edit" data-en-affects="media:1"></button>
      <img id="img" data-en-by="media:1">`);
    r.confirm("media:1", { source: null });
    await frame();
    expect($("#edit").dataset.enState).toBe("confirm");
    expect($("#img").dataset.enState).toBe("confirm");
    expect($("#theme").hasAttribute("data-en-state")).toBe(false);
    r.confirm("theme", { source: null });
    await frame();
    expect($("#theme").dataset.enState).toBe("confirm"); // via its non-global key
  });

  it("sees elements inserted right before the confirm", async () => {
    const r = boot(`<div id="grid"></div>`);
    $("#grid").innerHTML = `<img id="new" data-en-by="media:7">`;
    r.confirm("media:7");
    await frame();
    expect($("#new").dataset.enState).toBe("confirm");
  });

  it("waits briefly for elements a framework commits after the next frame", async () => {
    const r = boot(`<div id="list"></div>`);
    r.confirm("row:9");
    await frame(); // nothing matches yet: still pending, not dropped
    $("#list").innerHTML = `<p id="late" data-en-by="row:9"></p>`;
    await frame();
    await frame();
    expect($("#late").dataset.enState).toBe("confirm");
  });

  it("gives up after waitMs", async () => {
    const r = boot(`<div id="list"></div>`);
    r.confirm("row:9", { waitMs: 30 });
    await sleep(80);
    $("#list").innerHTML = `<p id="late" data-en-by="row:9"></p>`;
    await frame();
    await frame();
    expect($("#late").hasAttribute("data-en-state")).toBe(false);
  });

  it("merges overlapping confirms by extending them", async () => {
    const r = boot(`<div id="a" data-en-by="k"></div>`, { confirmMs: 80 });
    r.confirm("k", { intensity: 0.5, origin: "self" });
    await sleep(50);
    r.confirm("k", { intensity: 0.8, origin: "self" });
    await sleep(60); // 110ms after the first confirm: past its own end
    await frame();
    expect($("#a").dataset.enState).toBe("confirm");
    expect($("#a").style.getPropertyValue("--en-intensity")).toBe("0.8");
    await sleep(60);
    await frame();
    expect($("#a").hasAttribute("data-en-state")).toBe(false);
  });

  it("returns to preview when a confirm ends while still previewing", async () => {
    const r = boot(`<div id="a" data-en-by="k"></div>`, { confirmMs: 40 });
    r.preview("k");
    r.confirm("k");
    await frame();
    expect($("#a").dataset.enState).toBe("confirm");
    await sleep(80);
    await frame();
    expect($("#a").dataset.enState).toBe("preview");
  });
});

describe("sensors", () => {
  const withSensors = (html: string, opts: EntangledOptions = {}) => {
    document.body.innerHTML = html;
    rt = createEntangled({ dwellMs: 30, habituation: false, ...opts });
    rt.start();
    return rt;
  };
  const pointer = (type: string, target: Element, related: Element | null = null) =>
    target.dispatchEvent(new MouseEvent(type, { bubbles: true, relatedTarget: related }));

  it("previews after dwell via delegated pointer events and clears on leave", async () => {
    withSensors(`<button id="w" data-en-affects="k"><span id="inner">x</span></button><div id="r" data-en-by="k"></div><p id="out"></p>`);
    pointer("pointerover", $("#inner"));
    await frame();
    expect($("#r").hasAttribute("data-en-state")).toBe(false); // dwell not elapsed
    await sleep(60);
    await frame();
    expect($("#r").dataset.enState).toBe("preview");
    pointer("pointerout", $("#inner"), $("#w")); // moving within the writer keeps it
    await frame();
    expect($("#r").dataset.enState).toBe("preview");
    pointer("pointerout", $("#w"), $("#out"));
    await frame();
    expect($("#r").hasAttribute("data-en-state")).toBe(false);
  });

  it("cancels a pass-through hover", async () => {
    withSensors(`<button id="w" data-en-affects="k"></button><div id="r" data-en-by="k"></div><p id="out"></p>`);
    pointer("pointerover", $("#w"));
    await sleep(10);
    pointer("pointerout", $("#w"), $("#out"));
    await sleep(60);
    await frame();
    expect($("#r").hasAttribute("data-en-state")).toBe(false);
  });

  it("previews a dragged writer's targets until the drag ends, without a dwell", async () => {
    withSensors(`<div id="w" draggable="true" data-en-affects="slot:*"><span id="grip">x</span></div>
      <div id="a" data-en-by="slot:1"></div><div id="b" data-en-by="slot:2"></div><div id="c" data-en-by="other"></div>`, {
      mode: "js",
      sensors: [dragSensor()],
    });
    const drag = (type: string, target: Element) => target.dispatchEvent(new Event(type, { bubbles: true }));
    drag("dragstart", $("#grip"));
    await frame();
    expect($("#a").dataset.enState).toBe("preview");
    expect($("#b").dataset.enState).toBe("preview");
    expect($("#c").hasAttribute("data-en-state")).toBe(false);
    drag("drop", $("#b"));
    await frame();
    expect($("#a").hasAttribute("data-en-state")).toBe(false);

    drag("dragstart", $("#w"));
    await frame();
    expect($("#a").dataset.enState).toBe("preview");
    drag("dragend", $("#w"));
    await frame();
    expect($("#a").hasAttribute("data-en-state")).toBe(false);

    // Dropping elsewhere than it applies: data-en-drop is previewed instead of its own keys.
    $("#w").setAttribute("data-en-drop", "other");
    drag("dragstart", $("#w"));
    await frame();
    expect($("#c").dataset.enState).toBe("preview");
    expect($("#a").hasAttribute("data-en-state")).toBe(false);
    drag("dragend", $("#w"));
    await frame();
    expect($("#c").hasAttribute("data-en-state")).toBe(false);
    $("#w").removeAttribute("data-en-drop");

    // A dragged element that left the DOM never gets its dragend: the next pointer move ends the
    // drag.
    drag("dragstart", $("#w"));
    await frame();
    $("#w").remove();
    pointer("pointermove", document.body);
    await frame();
    expect($("#a").hasAttribute("data-en-state")).toBe(false);
  });

  it("a foreseen writer previews what it resolves to when its preview starts, with its Value Peek", async () => {
    const en = withSensors(`<button id="w" data-en-affects="edit:undo" data-en-confirm="manual"></button>
      <div id="a" data-en-by="clip:a"></div><div id="b" data-en-by="clip:b"></div><p id="out"></p>`, { mode: "js" });
    let target: string[] | null = ["clip:b"];
    let calls = 0;
    en.foresee($("#w"), () => {
      calls++;
      return target && { keys: target, peek: { current: 0, next: -2 } };
    });
    en.peekReader($("#b"), (cur, next) => `${(next as number) - (cur as number)}s`);
    expect(calls).toBe(0); // not before it's looked at
    pointer("pointerover", $("#w"));
    await sleep(60);
    await frame();
    expect(calls).toBe(1);
    expect($("#b").dataset.enState).toBe("preview");
    expect($("#b").dataset.enDelta).toBe("-2s");
    expect($("#a").hasAttribute("data-en-state")).toBe(false);
    pointer("pointerout", $("#w"), $("#out"));
    await frame();
    expect($("#b").hasAttribute("data-en-state")).toBe(false);
    expect($("#b").hasAttribute("data-en-delta")).toBe(false);
    // Resolved afresh each time: what it affects now, not what it did last time.
    target = ["clip:a"];
    pointer("pointerover", $("#w"));
    await sleep(60);
    await frame();
    expect($("#a").dataset.enState).toBe("preview");
    expect($("#b").hasAttribute("data-en-state")).toBe(false);
    pointer("pointerout", $("#w"), $("#out"));
    await frame();
    // And `null` previews nothing.
    target = null;
    pointer("pointerover", $("#w"));
    await sleep(60);
    await frame();
    expect(calls).toBe(3);
    expect($("#a").hasAttribute("data-en-state") || $("#b").hasAttribute("data-en-state")).toBe(false);
  });

  it("a programmatic preview carries a Value Peek to its readers", async () => {
    const en = withSensors(`<div id="r" data-en-by="k"></div>`, { mode: "js" });
    en.peekReader($("#r"), (_, next) => (next as Map<string, string>).get("r") ?? null);
    const end = en.preview("k", { peek: { current: null, next: new Map([["r", "+5s"]]) } });
    await frame();
    expect($("#r").dataset.enDelta).toBe("+5s");
    end();
    await frame();
    expect($("#r").hasAttribute("data-en-delta")).toBe(false);
  });

  it("confirms on click unless the writer is manual", async () => {
    withSensors(`
      <button id="w" data-en-affects="k">go</button>
      <button id="m" data-en-affects="j" data-en-confirm="manual">go</button>
      <div id="r" data-en-by="k"></div><div id="q" data-en-by="j"></div>`);
    $("#w").click();
    $("#m").click();
    await frame();
    expect($("#r").dataset.enState).toBe("confirm");
    expect($("#q").hasAttribute("data-en-state")).toBe(false);
  });

  it("treats the just-activated writer as the implicit confirm source", async () => {
    const r = withSensors(`
      <button id="w" data-en-affects="k" data-en-confirm="manual">go</button>
      <button id="other" data-en-affects="k">alt</button>
      <div id="r" data-en-by="k"></div>`);
    $("#w").click();
    r.confirm("k");
    await frame();
    expect($("#r").dataset.enState).toBe("confirm");
    expect($("#other").dataset.enState).toBe("confirm");
    expect($("#w").hasAttribute("data-en-state")).toBe(false);
    r.confirm("k", { source: null }); // explicit null opts out
    await frame();
    expect($("#w").dataset.enState).toBe("confirm");
  });

  it("confirms form fields on change, not click", async () => {
    withSensors(`<input id="c" type="checkbox" data-en-affects="k"><div id="r" data-en-by="k"></div>`);
    $("#c").dispatchEvent(new Event("change", { bubbles: true }));
    await frame();
    expect($("#r").dataset.enState).toBe("confirm");
  });
});

describe("lifecycle", () => {
  it("does nothing to the DOM until start()", () => {
    document.body.innerHTML = `<div id="a" data-en-by="k"></div>`;
    const r = createEntangled();
    r.confirm("k");
    expect($("#a").hasAttribute("data-en-fx")).toBe(false);
    expect(document.querySelector("[data-en-overlay]")).toBeNull();
    expect(r.started).toBe(false);
  });

  it("destroy() removes every trace", async () => {
    const r = boot(`<div id="a" data-en-by="k"></div>`, { respectReducedMotion: false, confirmMs: 500 });
    r.preview("k");
    await frame();
    r.destroy();
    expect($("#a").hasAttribute("data-en-state")).toBe(false);
    expect($("#a").hasAttribute("data-en-fx")).toBe(false);
    expect(document.querySelector("[data-en-overlay]")).toBeNull();
    expect(document.documentElement.hasAttribute("data-en-motion")).toBe(false);
    expect(document.documentElement.style.getPropertyValue("--en-duration-confirm")).toBe("");
    expect(r.graph.size("reader")).toBe(0);
  });

  it("injects and replaces named sheets", () => {
    const r = boot(``, { styles: [{ name: "effect:ring", css: ".a{}" }] });
    r.registerEffect("ring", ".b{}");
    r.registerEffect("glow", ".c{}");
    const sheets = [...document.querySelectorAll("style[data-en-sheet]"), ...(document.adoptedStyleSheets ?? [])];
    expect(sheets).toHaveLength(2);
  });
});

describe("css-compiled mode", () => {
  const g = globalThis as { CSS?: unknown };
  const withHas = (fn: () => Promise<void> | void) => async () => {
    const prev = g.CSS;
    g.CSS = { supports: (q: string) => q.includes(":has"), registerProperty: () => {} };
    try {
      await fn();
    } finally {
      g.CSS = prev;
    }
  };
  const compiled = () => document.querySelector('style[data-en-sheet="compiled"]')?.textContent ?? "";

  it(
    "falls back to js without :has() support",
    withHas(() => {
      (g.CSS as { supports: () => boolean }).supports = () => false;
      expect(boot(``, { mode: "css" }).mode).toBe("js");
    }),
  );

  it(
    "compiles writer keys and marks reader namespaces",
    withHas(() => {
      const r = boot(
        `<button data-en-affects="media:*"></button>
         <img id="i" data-en-by="media:42">
         <div id="t" data-en-by="theme"></div>`,
        { mode: "css" },
      );
      expect(r.mode).toBe("css");
      expect($("#i").getAttribute("data-en-ns")).toBe("media");
      expect($("#t").hasAttribute("data-en-ns")).toBe(false);
      expect(compiled()).toContain('[data-en-affects~="media:*"]:hover');
      expect(compiled()).not.toContain('"theme"'); // no writer for theme
    }),
  );

  it(
    "recompiles in a batch when writers appear",
    withHas(async () => {
      boot(`<div data-en-by="theme"></div>`, { mode: "css" });
      const b = document.createElement("button");
      b.setAttribute("data-en-affects", "theme");
      document.body.append(b);
      await Promise.resolve();
      await Promise.resolve();
      expect(compiled()).toContain('[data-en-affects~="theme"]:hover');
    }),
  );

  it(
    "settles the attention budget at graph-change time",
    withHas(() => {
      const readers = Array.from({ length: 6 }, (_, i) => `<i data-en-by="list:${i}"></i>`).join("");
      boot(`<button data-en-affects="list:*"></button>${readers}`, { mode: "css", maxConcurrentTargets: 4 });
      const over = [...document.querySelectorAll("[data-en-over]")];
      expect(over).toHaveLength(2);
      expect(over.every((el) => el.getAttribute("data-en-over") === "list:*")).toBe(true);
      expect(compiled()).toContain(`--en-intensity: ${Math.round(Math.sqrt(3 / 4) * 1000) / 1000}`);
    }),
  );

  it(
    "routes global readers to an overlay rule",
    withHas(() => {
      document.body.setAttribute("data-en-by", "theme");
      boot(`<button data-en-affects="theme"></button>`, { mode: "css" });
      expect(compiled()).toMatch(/"theme"\]:hover\) \[data-en-overlay\]/);
    }),
  );

  it(
    "does not attach hover listeners, but still confirms on click",
    withHas(async () => {
      document.body.innerHTML = `<button id="w" data-en-affects="k"></button><div id="r" data-en-by="k"></div>`;
      rt = createEntangled({ mode: "css", dwellMs: 0, habituation: false });
      rt.start();
      $("#w").dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
      await sleep(20);
      await frame();
      expect($("#r").hasAttribute("data-en-state")).toBe(false);
      $("#w").click();
      await frame();
      expect($("#r").getAttribute("data-en-state")).toBe("confirm");
    }),
  );

  it(
    "destroy() removes compiled artefacts",
    withHas(() => {
      const readers = Array.from({ length: 3 }, (_, i) => `<i data-en-by="l:${i}"></i>`).join("");
      const r = boot(`<button data-en-affects="l:*"></button>${readers}`, { mode: "css", maxConcurrentTargets: 1 });
      r.destroy();
      expect(document.querySelector("[data-en-over], [data-en-ns]")).toBeNull();
      expect(compiled()).toBe("");
      expect(r.mode).toBe("js");
    }),
  );
});

describe("auto mode", () => {
  const g = globalThis as { CSS?: unknown };
  const withHas = (fn: () => Promise<void> | void) => async () => {
    const prev = g.CSS;
    g.CSS = { supports: (q: string) => q.includes(":has"), registerProperty: () => {} };
    try {
      await fn();
    } finally {
      g.CSS = prev;
    }
  };
  const limits = { maxWriterKeys: 2, maxWeightedDomNodes: 1000, keyWeight: 1 };

  it("chooseMode applies capability, the key cap and the weighted-size budget", () => {
    expect(chooseMode({ cssCapable: false, writerKeys: 0, domNodes: 0 }, limits)).toBe("js");
    // Weighted size 500 x 2.
    expect(chooseMode({ cssCapable: true, writerKeys: 1, domNodes: 500 }, limits)).toBe("css");
    expect(chooseMode({ cssCapable: true, writerKeys: 1, domNodes: 501 }, limits)).toBe("js");
    expect(chooseMode({ cssCapable: true, writerKeys: 3, domNodes: 10 }, limits)).toBe("js");
  });

  it("default limits match the benchmark crossover", () => {
    const pick = (writerKeys: number, domNodes: number) => chooseMode({ cssCapable: true, writerKeys, domNodes });
    expect(pick(3, 400)).toBe("css"); // small settings page
    expect(pick(16, 300)).toBe("css");
    expect(pick(16, 750)).toBe("js"); // measured 3.8ms: borderline, stay conservative
    expect(pick(1, 3000)).toBe("js");
    expect(pick(65, 10)).toBe("js"); // hard key cap
  });

  it(
    "decides after the initial scan",
    withHas(() => {
      const few = boot(`<button data-en-affects="a"></button><i data-en-by="a"></i>`, { autoModeLimits: limits });
      expect(few.mode).toBe("css");
      expect(document.querySelector("[data-en-by]")).not.toBeNull();
      few.destroy();
      const many = boot(
        `<button data-en-affects="a"></button><button data-en-affects="b"></button><button data-en-affects="c"></button>`,
        { autoModeLimits: limits },
      );
      expect(many.mode).toBe("js");
    }),
  );

  it(
    "downgrades to js for good when the graph outgrows the limits",
    withHas(async () => {
      document.body.innerHTML = `<button data-en-affects="a"></button><i id="r" data-en-by="m:1"></i>`;
      rt = createEntangled({ autoModeLimits: limits, dwellMs: 0, habituation: false });
      rt.start();
      expect(rt.mode).toBe("css");
      expect($("#r").getAttribute("data-en-ns")).toBe("m");
      document.body.insertAdjacentHTML("beforeend", `<button data-en-affects="b"></button><button id="c" data-en-affects="c m:*"></button>`);
      await Promise.resolve();
      await Promise.resolve();
      expect(rt.mode).toBe("js");
      expect($("#r").hasAttribute("data-en-ns")).toBe(false);
      expect(document.querySelector('style[data-en-sheet="compiled"]')).toBeNull();
      // JS sensors are now attached: hovering a writer previews.
      $("#c").dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
      await sleep(20);
      await frame();
      expect($("#r").getAttribute("data-en-state")).toBe("preview");
    }),
  );

  it(
    "never overrides an explicit mode",
    withHas(async () => {
      document.body.innerHTML = `<button data-en-affects="a"></button>`;
      rt = createEntangled({ mode: "css", autoModeLimits: limits });
      rt.start();
      document.body.insertAdjacentHTML("beforeend", `<b data-en-affects="b"></b><b data-en-affects="c"></b>`);
      await Promise.resolve();
      await Promise.resolve();
      expect(rt.mode).toBe("css");
    }),
  );
});

describe("surfaces", () => {
  it("SVG graphics default to the stroke effect; the <svg> root stays sweep", () => {
    boot(`<svg id="s" data-en-by="x"><circle id="c" data-en-by="x"/><g><path id="p" data-en-by="x"/></g></svg>`);
    expect(document.querySelector("#c")!.getAttribute("data-en-fx")).toBe("stroke");
    expect(document.querySelector("#p")!.getAttribute("data-en-fx")).toBe("stroke");
    expect(document.querySelector("#s")!.getAttribute("data-en-fx")).toBe("sweep");
  });

  const REGIONS = `
    <section data-en-region="a"><button id="w" data-en-affects="k"></button><div id="near" data-en-by="k"></div></section>
    <section data-en-region="b"><div id="far" data-en-by="k"></div></section>`;

  it("far: a preview from one region marks readers in another, and the attribute outlives clear()", async () => {
    const r = boot(REGIONS, { mode: "js" });
    const end = r.preview("k", { source: $("#w") });
    await frame();
    expect($("#far").hasAttribute("data-en-far")).toBe(true);
    expect($("#near").hasAttribute("data-en-far")).toBe(false);
    end();
    await frame();
    expect($("#far").hasAttribute("data-en-state")).toBe(false);
    expect($("#far").hasAttribute("data-en-far")).toBe(true); // sticky: fades with the effect
    r.preview("k");
    await frame();
    expect($("#far").hasAttribute("data-en-far")).toBe(false); // replaced on the next salience
    r.destroy();
  });

  it("far: a confirm with a source does the same; without regions nothing is far", async () => {
    let r = boot(REGIONS, { mode: "js" });
    r.confirm("k", { source: $("#w") });
    await frame();
    expect($("#far").hasAttribute("data-en-far")).toBe(true);
    expect($("#near").hasAttribute("data-en-far")).toBe(false);
    r.destroy();
    expect($("#far").hasAttribute("data-en-far")).toBe(false);
    r = boot(`<button id="w" data-en-affects="k"></button><div id="x" data-en-by="k"></div>`, { mode: "js" });
    r.confirm("k", { source: $("#w") });
    await frame();
    expect($("#x").hasAttribute("data-en-far")).toBe(false);
  });
});

describe("changes", () => {
  const pointer = (type: string, target: Element, related: Element | null = null) =>
    target.dispatchEvent(new MouseEvent(type, { bubbles: true, relatedTarget: related }));

  it("a reader reached by several changes draws the highest-ranked kind", async () => {
    const r = boot(`<div id="r" data-en-by="a b"></div>`);
    r.preview([{ key: "a", kind: "modify" }, { key: "b", kind: "remove" }]);
    await frame();
    expect($("#r").dataset.enKind).toBe("remove");
    expect(r.getState($("#r"))).toMatchObject({ state: "preview", kind: "remove", key: "b" });
  });

  it("a static writer's data-en-change and data-en-severity reach its readers on hover", async () => {
    const r = boot(
      `<button id="w" data-en-affects="clip:7" data-en-change="remove" data-en-severity="destructive"></button>
       <div id="r" data-en-by="clip:7"></div><p id="out"></p>`,
      { sensors: [pointerSensor()], dwellMs: 0 },
    );
    pointer("pointerover", $("#w"));
    await sleep(10);
    await frame();
    expect($("#r").dataset.enKind).toBe("remove");
    expect($("#r").dataset.enTone).toBe("caution");
    pointer("pointerout", $("#w"), $("#out"));
    await frame();
    expect(r.getState($("#r")).state).toBe("idle");
  });

  it("labels become chips; formatReader wins over label; peekReader still works", async () => {
    const r = boot(`<div id="r" data-en-by="cart"></div><div id="s" data-en-by="cart"></div>`);
    const end = r.preview([{ key: "cart", label: "−€12" }]);
    await frame();
    expect($("#r").dataset.enDelta).toBe("−€12");
    expect(r.getState($("#r")).label).toBe("−€12");
    const off = r.formatReader($("#s"), (c, phase) => `${phase}:${c.key}`);
    end();
    r.preview([{ key: "cart", label: "−€12" }]);
    await frame();
    expect($("#s").dataset.enDelta).toBe("preview:cart");
    off();
    expect($("#s").hasAttribute("data-en-delta")).toBe(false);
    r.destroy();
    const r2 = boot(`<div id="r" data-en-by="n"></div>`);
    r2.peekReader($("#r"), (cur, next) => `${cur}→${next}`);
    r2.preview("n", { peek: { current: 1, next: 2 } });
    await frame();
    expect($("#r").dataset.enDelta).toBe("1→2");
  });

  it("a labelled confirm shows its chip while confirming, then removes it", async () => {
    const r = boot(`<div id="r" data-en-by="count"></div>`);
    r.confirm([{ key: "count", kind: "modify", label: "was 3" }], { durationMs: 40, origin: "system" });
    await frame();
    expect($("#r").dataset.enState).toBe("confirm");
    expect($("#r").dataset.enDelta).toBe("was 3");
    await sleep(60);
    await frame();
    expect($("#r").hasAttribute("data-en-state")).toBe(false);
    expect($("#r").hasAttribute("data-en-delta")).toBe(false);
  });

  it("sticky form attributes survive clear(), are replaced on the next salience and removed by destroy()", async () => {
    const r = boot(`<div id="r" data-en-by="k"></div>`);
    const end = r.preview([{ key: "k", kind: "disable", certainty: "may" }], { severity: "destructive" });
    await frame();
    expect($("#r").dataset.enKind).toBe("disable");
    expect($("#r").dataset.enCertainty).toBe("may");
    expect($("#r").dataset.enTone).toBe("caution");
    end();
    await frame();
    expect($("#r").hasAttribute("data-en-state")).toBe(false);
    expect($("#r").dataset.enKind).toBe("disable"); // fades with the effect
    r.preview([{ key: "k", kind: "add" }]);
    await frame();
    expect($("#r").dataset.enKind).toBe("add");
    expect($("#r").hasAttribute("data-en-certainty")).toBe(false);
    expect($("#r").hasAttribute("data-en-tone")).toBe(false);
    r.destroy();
    expect($("#r").hasAttribute("data-en-kind")).toBe(false);
  });

  it("invalid keys and kinds throw synchronously", () => {
    const r = boot(``);
    expect(() => r.preview("a:*:b")).toThrow();
    expect(() => r.confirm([{ key: "a", kind: "nope" as never }])).toThrow(TypeError);
  });

  it("the confirm event carries the changes", async () => {
    const r = boot(`<div data-en-by="k"></div>`);
    const events: RuntimeEvent[] = [];
    r.onEvent((e) => events.push(e));
    r.confirm([{ key: "k", kind: "add" }]);
    await frame();
    expect(events.find((e) => e.type === "confirm")).toMatchObject({ keys: ["k"], changes: [{ key: "k", kind: "add" }] });
  });
});

describe("changes in CSS mode", () => {
  const g = globalThis as { CSS?: unknown };
  it("a data-en-change writer attaches hover sensors lazily and its reader gets data-en-kind on hover", async () => {
    const prev = g.CSS;
    g.CSS = { supports: (q: string) => q.includes(":has"), registerProperty: () => {} };
    try {
      const r = boot(
        `<button id="w" data-en-affects="k" data-en-change="remove"></button><div id="r" data-en-by="k"></div>`,
        { mode: "css", sensors: undefined, dwellMs: 0 },
      );
      expect(r.mode).toBe("css");
      $("#w").dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
      await sleep(10);
      await frame();
      expect($("#r").dataset.enKind).toBe("remove");
      expect($("#r").style.getPropertyValue("--en-preview")).toBe("1");
    } finally {
      g.CSS = prev;
    }
  });
});
