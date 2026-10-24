// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type EntangledOptions,
  type EntangledRuntime,
  type RuntimeEvent,
  PROFILE_DEFAULTS,
  activationSensor,
  createEntangled,
  createNotifyResolver,
  memoryHabituationStore,
  pointerSensor,
} from "../src/index.js";

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const $ = (sel: string) => document.querySelector(sel) as HTMLElement;
const root = () => document.documentElement;
const pointer = (type: string, target: Element, related: Element | null = null) =>
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, relatedTarget: related }));

let rt: EntangledRuntime | null = null;
const boot = (html: string, opts: EntangledOptions = {}) => {
  document.body.innerHTML = html;
  rt = createEntangled({ sensors: [], habituation: false, attention: { persist: false }, ...opts });
  rt.start();
  return rt;
};

beforeEach(() => localStorage.clear());
afterEach(() => {
  rt?.destroy();
  rt = null;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("profiles", () => {
  const click = (el: Element) => el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  const HTML = `<button id="w" data-en-affects="k"></button><button id="a" data-en-affects="k" data-en-confirm="auto"></button><div id="r" data-en-by="k"></div>`;

  it("site auto-confirms a plain writer on click; app only with data-en-confirm=auto", async () => {
    let r = boot(HTML, { sensors: [activationSensor()] });
    expect(r.profile).toBe("site");
    click($("#w"));
    await frame();
    expect($("#r").dataset.enState).toBe("confirm");
    r.destroy();

    r = boot(HTML, { profile: "app", sensors: [activationSensor()] });
    expect(r.profile).toBe("app");
    click($("#w"));
    await frame();
    expect($("#r").hasAttribute("data-en-state")).toBe(false);
    click($("#a"));
    await frame();
    expect($("#r").dataset.enState).toBe("confirm");
  });

  it("explicit options override profile values", () => {
    expect(PROFILE_DEFAULTS.app).toMatchObject({ mode: "js", includeWriters: false, reverseQuery: false, habituation: false });
    document.body.innerHTML = "";
    rt = createEntangled({ profile: "app", sensors: [], habituation: { store: memoryHabituationStore() }, mode: "js" });
    expect(rt.habituation.enabled).toBe(true);
    const site = createEntangled({ sensors: [] });
    expect(site.habituation.enabled).toBe(true);
    expect(createEntangled({ profile: "app", sensors: [] }).habituation.enabled).toBe(false);
  });

  it("includeWriters defaults by profile; a per-confirm override wins", async () => {
    const html = `<button id="w2" data-en-affects="k"></button><div id="r" data-en-by="k"></div>`;
    let r = boot(html);
    r.confirm("k", { source: null });
    await frame();
    expect($("#w2").dataset.enState).toBe("confirm");
    r.destroy();
    r = boot(html, { profile: "app" });
    r.confirm("k", { source: null });
    await frame();
    expect($("#w2").hasAttribute("data-en-state")).toBe(false);
    expect($("#r").dataset.enState).toBe("confirm");
    r.confirm("k", { source: null, includeWriters: true, origin: "system" });
    await frame();
    expect($("#w2").dataset.enState).toBe("confirm");
    r.destroy();
    r = boot(html, { profile: "app", includeWriters: true });
    r.confirm("k", { source: null });
    await frame();
    expect($("#w2").dataset.enState).toBe("confirm");
  });
});

describe("notify resolver", () => {
  it("exact > longer wildcard > shorter wildcard > * > origins > aware", () => {
    const resolve = createNotifyResolver({
      origins: { system: "quiet" },
      keys: { "*": "ignore", "doc:*": "aware", "doc:sec:*": "interrupt", "doc:sec:title": "quiet" },
    });
    expect(resolve("doc:sec:title", "self")).toBe("quiet");
    expect(resolve("doc:sec:body", "self")).toBe("interrupt");
    expect(resolve("doc:owner", "self")).toBe("aware");
    expect(resolve("other", "self")).toBe("ignore");
    const plain = createNotifyResolver({ origins: { system: "quiet" } });
    expect(plain("x", "system")).toBe("quiet");
    expect(plain("x", "peer")).toBe("aware");
    expect(createNotifyResolver()("x", "self")).toBe("aware");
  });

  it("object values fall through when the origin is missing", () => {
    const resolve = createNotifyResolver({ origins: { peer: "interrupt" }, keys: { autosave: { self: "quiet" } } });
    expect(resolve("autosave", "self")).toBe("quiet");
    expect(resolve("autosave", "peer")).toBe("interrupt");
    expect(resolve("autosave", "system")).toBe("aware");
  });
});

describe("notify levels", () => {
  const HTML = `<div id="r" data-en-by="k"></div>`;

  it("ignore draws nothing but still emits the confirm event", async () => {
    const r = boot(HTML, { attention: { persist: false, notify: { keys: { k: "ignore" } } } });
    const events: RuntimeEvent[] = [];
    r.onEvent((e) => events.push(e));
    r.confirm("k", { origin: "self" });
    await frame();
    expect($("#r").hasAttribute("data-en-state")).toBe(false);
    expect(events.map((e) => e.type)).toContain("confirm");
  });

  it("quiet halves the intensity and uses confirmMs for a system confirm", async () => {
    const r = boot(HTML, { confirmMs: 500, attention: { persist: false, notify: { keys: { k: "quiet" } } } });
    r.confirm("k", { origin: "system" });
    await frame();
    expect($("#r").dataset.enState).toBe("confirm");
    expect($("#r").dataset.enNotify).toBe("quiet");
    expect($("#r").style.getPropertyValue("--en-intensity")).toBe("0.5");
    expect($("#r").style.getPropertyValue("--en-duration-confirm")).toBe("");
  });

  it("interrupt: full intensity, data-en-notify, remoteConfirmMs for self, announced", async () => {
    const r = boot(`<div id="r" data-en-by="k"></div><div data-en-by="k"></div>`, {
      remoteConfirmMs: 1500,
      maxConcurrentTargets: 1,
      announceRemoteChanges: true,
      attention: { persist: false, notify: { keys: { k: "interrupt" } } },
    });
    r.confirm("k", { origin: "self" });
    await frame();
    expect($("#r").dataset.enNotify).toBe("interrupt");
    expect($("#r").style.getPropertyValue("--en-intensity")).toBe("1");
    expect($("#r").style.getPropertyValue("--en-duration-confirm")).toBe("1500ms");
    expect(document.querySelector("[data-en-announcer]")!.textContent).toBe("k updated");
  });

  it("an aware confirm has no data-en-notify, and a per-confirm notify wins", async () => {
    const r = boot(HTML);
    r.confirm("k", { origin: "self" });
    await frame();
    expect($("#r").dataset.enState).toBe("confirm");
    expect($("#r").hasAttribute("data-en-notify")).toBe(false);
    r.confirm("k", { origin: "system", notify: "ignore" });
    await frame();
    expect($("#r").dataset.enOrigin).toBe("self");
  });
});

describe("attention levels", () => {
  const HTML = `<button id="w" data-en-affects="k"></button><div id="r" data-en-by="k"></div><p id="out"></p>`;

  it("off suspends: confirm is a no-op, sensors detached, overlay kept; standard brings hover back", async () => {
    const r = boot(HTML, { sensors: [pointerSensor()], dwellMs: 0 });
    r.setLevel("off");
    expect(root().dataset.enLevel).toBe("off");
    r.confirm("k");
    pointer("pointerover", $("#w"));
    await sleep(20);
    await frame();
    expect(document.querySelectorAll("[data-en-state]")).toHaveLength(0);
    expect(document.querySelector("[data-en-overlay]")).not.toBeNull();
    pointer("pointerout", $("#w"), $("#out"));
    r.setLevel("standard");
    pointer("pointerover", $("#w"));
    await sleep(20);
    await frame();
    expect($("#r").dataset.enState).toBe("preview");
  });

  it("off clears what is showing", async () => {
    const r = boot(HTML);
    r.preview("k");
    await frame();
    expect($("#r").dataset.enState).toBe("preview");
    r.setLevel("off");
    expect($("#r").hasAttribute("data-en-state")).toBe(false);
  });

  it("minimal: self confirms dropped, system shown, only destructive previews, no peek blend", async () => {
    const r = boot(HTML);
    r.setLevel("minimal");
    expect(root().style.getPropertyValue("--en-peek-amount")).toBe("0");
    r.confirm("k", { origin: "self" });
    await frame();
    expect($("#r").hasAttribute("data-en-state")).toBe(false);
    r.confirm("k", { origin: "system" });
    await frame();
    expect($("#r").dataset.enState).toBe("confirm");
    r.setLevel("standard");
    await sleep(0);
    expect(root().style.getPropertyValue("--en-peek-amount")).toBe("");
  });

  it("minimal: a non-destructive preview is not drawn, a destructive one is", async () => {
    const r = boot(HTML);
    r.setLevel("minimal");
    const end = r.preview("k");
    await frame();
    expect($("#r").hasAttribute("data-en-state")).toBe(false);
    end();
    r.preview("k", { severity: "destructive" });
    await frame();
    expect($("#r").dataset.enState).toBe("preview");
  });

  it("guided halves the dwell on the root and bypasses habituation", async () => {
    const r = boot(HTML, { dwellMs: 200, habituation: { store: memoryHabituationStore() } });
    expect(root().style.getPropertyValue("--en-dwell")).toBe("200ms");
    r.setLevel("guided");
    expect(root().style.getPropertyValue("--en-dwell")).toBe("100ms");
    for (let i = 0; i < 6; i++) {
      r.confirm("k", { origin: "self" });
      await frame();
      await sleep(5);
    }
    r.confirm("k", { origin: "self", durationMs: 50 });
    await frame();
    expect($("#r").style.getPropertyValue("--en-intensity")).toBe("1");
    r.setLevel("standard");
    expect(root().style.getPropertyValue("--en-dwell")).toBe("200ms");
  });

  it("emits a level event", () => {
    const r = boot(HTML);
    const events: RuntimeEvent[] = [];
    r.onEvent((e) => events.push(e));
    r.setLevel("guided");
    r.setLevel("guided");
    expect(events).toEqual([{ type: "level", time: expect.any(Number), level: "guided", previous: "standard" }]);
  });

  it("ignores invalid levels", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = boot(HTML);
    r.setLevel("loud" as never);
    r.setLevel("loud" as never);
    expect(r.level).toBe("standard");
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe("level persistence", () => {
  const start = (opts: EntangledOptions = {}) => {
    const r = createEntangled({ sensors: [], habituation: false, ...opts });
    r.start();
    return r;
  };

  it("setLevel stores; a runtime started afterwards reads it", () => {
    let r = start();
    r.setLevel("minimal");
    expect(localStorage.getItem("entangled:attention")).toBe("minimal");
    r.destroy();
    r = start();
    expect(r.level).toBe("minimal");
    expect(root().dataset.enLevel).toBe("minimal");
    r.destroy();
    r = start({ attention: { persist: { storageKey: "other" } } });
    expect(r.level).toBe("standard");
    r.destroy();
  });

  it("persist: false neither reads nor writes", () => {
    localStorage.setItem("entangled:attention", "off");
    const r = start({ attention: { persist: false, level: "guided" } });
    expect(r.level).toBe("guided");
    r.setLevel("minimal");
    expect(localStorage.getItem("entangled:attention")).toBe("off");
    r.destroy();
  });

  it("setLevel before start() wins over storage", () => {
    localStorage.setItem("entangled:attention", "off");
    const r = createEntangled({ sensors: [], habituation: false });
    r.setLevel("guided");
    r.start();
    expect(r.level).toBe("guided");
    r.destroy();
  });

  it("storage that throws is ignored", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    const r = start();
    expect(r.level).toBe("standard");
    r.setLevel("off");
    expect(r.level).toBe("off");
    r.destroy();
  });
});

describe("showSources", () => {
  const HTML = `<button id="w" data-en-affects="k"></button><button id="x" data-en-affects="other"></button><div id="r" data-en-by="k"></div>`;

  it("shows the writers that affect an element until disposed", async () => {
    const r = boot(HTML);
    const hide = r.showSources($("#r"));
    await frame();
    expect($("#w").style.getPropertyValue("--en-source")).toBe("1");
    expect($("#x").style.getPropertyValue("--en-source")).toBe("");
    expect(root().hasAttribute("data-en-query")).toBe(true);
    expect(r.getState($("#w")).source).toBe(true);
    hide();
    await frame();
    expect($("#w").style.getPropertyValue("--en-source")).toBe("");
    expect(root().hasAttribute("data-en-query")).toBe(false);
  });

  it("works with reverseQuery: false and in the app profile", async () => {
    const r = boot(HTML, { reverseQuery: false, profile: "app" });
    r.showSources($("#r"));
    await frame();
    expect($("#w").style.getPropertyValue("--en-source")).toBe("1");
  });
});
