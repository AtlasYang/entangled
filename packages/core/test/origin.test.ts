// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { type EntangledOptions, type EntangledRuntime, createEntangled } from "../src/index.js";

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const $ = (sel: string) => document.querySelector(sel) as HTMLElement;
const overlay = () => $("[data-en-overlay]");

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
  delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
});

/** Every value `attr` takes on `el`, in order, including removals (`null`). */
function recordAttr(el: Element, attr: string) {
  const seen: Array<string | null> = [];
  new MutationObserver((records) => {
    for (const r of records) seen.push((r.target as Element).getAttribute(attr));
  }).observe(el, { attributes: true, attributeFilter: [attr] });
  return seen;
}

describe("origin inference", () => {
  it("is system without recent user input, self right after it, system again once the window passes", async () => {
    const r = boot(`<div id="a" data-en-by="k"></div>`, { originWindowMs: 40, confirmMs: 30, coalesceMs: 0 });
    r.confirm("k");
    await frame();
    expect($("#a").dataset.enOrigin).toBe("system");
    expect(r.getState($("#a")).origin).toBe("system");

    await sleep(80);
    r.markUserIntent();
    r.confirm("k");
    await frame();
    expect($("#a").dataset.enOrigin).toBe("self");

    await sleep(80);
    r.confirm("k");
    await frame();
    expect($("#a").dataset.enOrigin).toBe("system");
  });

  it("never infers peer, and an explicit origin always wins", async () => {
    const r = boot(`<div id="a" data-en-by="k"></div><div id="b" data-en-by="j"></div>`);
    r.markUserIntent();
    r.confirm("k", { origin: "peer" });
    r.confirm("j", { origin: "system" });
    await frame();
    expect($("#a").dataset.enOrigin).toBe("peer");
    expect($("#b").dataset.enOrigin).toBe("system");
  });

  it("clears the origin when the confirm ends, back to plain preview", async () => {
    const r = boot(`<div id="a" data-en-by="k"></div>`, { remoteConfirmMs: 30 });
    r.preview("k");
    r.confirm("k", { origin: "peer" });
    await frame();
    expect($("#a").dataset.enOrigin).toBe("peer");
    await sleep(60);
    await frame();
    expect($("#a").dataset.enState).toBe("preview");
    expect($("#a").hasAttribute("data-en-origin")).toBe(false);
    expect(r.getState($("#a")).origin).toBeNull();
  });
});

describe("origin visuals", () => {
  it("marks readers and the overlay, with the actor's name and color", async () => {
    const r = boot(`<div id="a" data-en-by="doc:title"></div>`);
    r.confirm(["doc:title", "*"], { origin: "peer", actor: { id: "u42", name: "Mina", color: "#7c5cff" } });
    await frame();
    for (const el of [$("#a"), overlay()]) {
      expect(el.dataset.enOrigin).toBe("peer");
      expect(el.dataset.enActor).toBe("Mina");
      expect(el.style.getPropertyValue("--en-actor-color")).toBe("#7c5cff");
    }
  });

  it("falls back to the actor id and leaves no trace after expiry", async () => {
    const r = boot(`<div id="a" data-en-by="k"></div>`, { remoteConfirmMs: 30 });
    r.confirm("k", { origin: "peer", actor: { id: "u7" } });
    await frame();
    expect($("#a").dataset.enActor).toBe("u7");
    expect($("#a").style.getPropertyValue("--en-actor-color")).toBe("");
    await sleep(60);
    await frame();
    expect($("#a").hasAttribute("data-en-actor")).toBe(false);
    expect($("#a").hasAttribute("data-en-origin")).toBe(false);
    expect($("#a").hasAttribute("style")).toBe(false);
  });

  it("gives remote confirms a longer duration than self ones", async () => {
    const r = boot(`<div id="a" data-en-by="a"></div><div id="b" data-en-by="b"></div><div id="c" data-en-by="c"></div>`, {
      confirmMs: 100,
    });
    r.confirm("a", { origin: "self" });
    r.confirm("b", { origin: "peer" });
    r.confirm("c", { origin: "system", durationMs: 50 });
    await frame();
    expect($("#a").style.getPropertyValue("--en-duration-confirm")).toBe(""); // the token
    // 1.8 x confirmMs
    expect($("#b").style.getPropertyValue("--en-duration-confirm")).toBe("180ms");
    expect($("#c").style.getPropertyValue("--en-duration-confirm")).toBe("50ms"); // explicit wins
    await sleep(130);
    await frame();
    expect($("#a").hasAttribute("data-en-state")).toBe(false);
    expect($("#b").dataset.enState).toBe("confirm");
  });

  it("does not exclude the last-clicked control from a peer change", async () => {
    document.body.innerHTML = `<button id="w" data-en-affects="k">go</button><div id="r" data-en-by="k"></div>`;
    rt = createEntangled({ dwellMs: 0 }); // with the activation sensor
    rt.start();
    $("#w").setAttribute("data-en-confirm", "manual");
    await Promise.resolve();
    $("#w").click();
    rt.confirm("k", { origin: "peer" });
    await frame();
    expect($("#w").dataset.enState).toBe("confirm"); // newly available for the user
    expect($("#r").dataset.enState).toBe("confirm");
  });
});

describe("burst coalescing", () => {
  it("merges confirms into the running afterglow without replaying it", async () => {
    const r = boot(`<div id="a" data-en-by="k"></div>`, { remoteConfirmMs: 80 });
    const states = recordAttr($("#a"), "data-en-state");
    r.confirm("k", { origin: "peer", intensity: 0.5 });
    await frame();
    await sleep(40);
    r.confirm("k", { origin: "peer", intensity: 0.9 });
    await frame();
    await sleep(60); // past the first one's end: extended
    await frame();
    expect($("#a").dataset.enState).toBe("confirm");
    expect($("#a").style.getPropertyValue("--en-intensity")).toBe("0.9");
    expect(states).toEqual(["confirm"]); // never left the state: no replay
  });

  it("absorbs remote confirms of the same key that arrive after the afterglow faded, within the window", async () => {
    const r = boot(`<div id="a" data-en-by="k"></div>`, { remoteConfirmMs: 20, coalesceMs: 150 });
    r.confirm("k", { origin: "system" });
    await frame();
    await sleep(50);
    await frame();
    expect($("#a").hasAttribute("data-en-state")).toBe(false);
    r.confirm("k", { origin: "system" });
    await frame();
    expect($("#a").hasAttribute("data-en-state")).toBe(false); // absorbed
    r.confirm("k", { origin: "peer" }); // different origin: news of its own
    await frame();
    expect($("#a").dataset.enOrigin).toBe("peer");
    await sleep(160);
    r.confirm("k", { origin: "system" });
    await frame();
    expect($("#a").dataset.enOrigin).toBe("system"); // window over: glows again
  });

  it("never absorbs the user's own confirms", async () => {
    const r = boot(`<div id="a" data-en-by="k"></div>`, { confirmMs: 20, coalesceMs: 1000 });
    r.confirm("k", { origin: "self" });
    await frame();
    await sleep(50);
    await frame();
    r.confirm("k", { origin: "self" });
    await frame();
    expect($("#a").dataset.enState).toBe("confirm");
  });

  it("replays a still-lit afterglow once the window is over, or when the origin changes", async () => {
    const r = boot(`<div id="a" data-en-by="k"></div>`, { remoteConfirmMs: 1000, coalesceMs: 30 });
    const states = recordAttr($("#a"), "data-en-state");
    r.confirm("k", { origin: "system" });
    await frame();
    await sleep(60);
    r.confirm("k", { origin: "system" });
    await frame();
    await frame();
    expect(states).toEqual(["confirm", null, "confirm"]);
    r.confirm("k", { origin: "peer" });
    await frame();
    await frame();
    expect(states).toEqual(["confirm", null, "confirm", null, "confirm"]);
    expect($("#a").dataset.enOrigin).toBe("peer");
  });
});

describe("remote attention budget", () => {
  it("keeps the most recent remote afterglows when bursts overlap", async () => {
    const r = boot(
      `<i id="a1" data-en-by="a"></i><i id="a2" data-en-by="a"></i><i id="b1" data-en-by="b"></i><i id="b2" data-en-by="b"></i>`,
      { maxConcurrentTargets: 2 },
    );
    r.confirm("a", { origin: "peer" });
    await frame();
    await sleep(5);
    r.confirm("b", { origin: "peer" });
    await frame();
    const lit = [...document.querySelectorAll("[data-en-state]")].map((e) => e.id);
    expect(lit).toEqual(["b1", "b2"]);
  });

  it("does not cap self confirms against remote ones", async () => {
    const r = boot(`<i id="a1" data-en-by="a"></i><i id="a2" data-en-by="a"></i><i id="b1" data-en-by="b"></i>`, {
      maxConcurrentTargets: 2,
    });
    r.confirm("a", { origin: "self" });
    await frame();
    r.confirm("b", { origin: "peer" });
    await frame();
    expect(document.querySelectorAll("[data-en-state]")).toHaveLength(3);
  });

  it("prefers readers in the viewport when a remote confirm is over budget", async () => {
    const hidden = new Set(["r1"]);
    (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = class {
      constructor(private cb: (entries: Array<{ target: Element; isIntersecting: boolean }>) => void) {}
      observe(target: Element) {
        this.cb([{ target, isIntersecting: !hidden.has(target.id) }]);
      }
      unobserve() {}
      disconnect() {}
    };
    const r = boot(`<i id="r1" data-en-by="k"></i><i id="r2" data-en-by="k"></i><i id="r3" data-en-by="k"></i>`, {
      maxConcurrentTargets: 2,
    });
    r.confirm("k", { origin: "system" });
    await frame();
    expect([...document.querySelectorAll("[data-en-state]")].map((e) => e.id)).toEqual(["r2", "r3"]);
  });
});

describe("announcements", () => {
  const region = () => document.querySelector("[data-en-announcer]");

  it("are off by default", () => {
    boot(``);
    expect(region()).toBeNull();
  });

  it("announce remote changes politely, rate limited, and never self ones", async () => {
    const r = boot(`<div data-en-by="doc:title"></div>`, { announceRemoteChanges: true, announceIntervalMs: 50 });
    expect(region()!.getAttribute("aria-live")).toBe("polite");
    r.confirm("doc:title", { origin: "self" });
    expect(region()!.textContent).toBe("");
    r.confirm("doc:title", { origin: "peer", actor: { id: "u42", name: "Mina" } });
    expect(region()!.textContent).toBe("Mina updated doc:title");
    r.confirm("doc:status", { origin: "peer" });
    r.confirm("doc:owner", { origin: "system" });
    r.confirm("doc:owner", { origin: "system", announce: false });
    expect(region()!.textContent).toBe("Mina updated doc:title");
    await sleep(80);
    expect(region()!.textContent).toBe("The system updated doc:owner, and 1 more change");
  });

  it("use a custom formatter and per-confirm text", () => {
    const r = boot(``, { announceRemoteChanges: ({ keys, origin }) => (origin === "system" ? null : `${keys[0]} changed`) });
    r.confirm("cart", { origin: "system" });
    expect(region()!.textContent).toBe("");
    r.confirm("cart", { origin: "peer" });
    expect(region()!.textContent).toBe("cart changed");
    r.destroy();
    expect(region()).toBeNull();
    boot(``, { announceRemoteChanges: true, announceIntervalMs: 0 });
    rt!.confirm("cart", { origin: "peer", announce: "Your cart was updated on another device" });
    expect(region()!.textContent).toBe("Your cart was updated on another device");
  });
});
