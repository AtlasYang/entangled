// @vitest-environment jsdom
import { type EntangledRuntime, createEntangled } from "@entangled-ui/core";
import { StrictMode, act, createRef, forwardRef, version } from "react";
import { version as domVersion } from "react-dom";
import { type Root, createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  EntangledNode,
  EntangledProvider,
  useEntangle,
  useEntangled,
  useEntangledSetter,
  useEntangledState,
  useEntangledStore,
  useEntangledValue,
  usePeekValue,
  useAttentionLevel,
  entangledProps,
  useForesight,
  foresightProps,
} from "../src/index.js";

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const $ = (sel: string) => document.querySelector(sel) as HTMLElement;
const state = (sel: string) => $(sel).getAttribute("data-en-state");

let root: Root | null = null;
let container: HTMLElement;

async function render(ui: React.ReactNode) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(ui));
}

/** Let MutationObserver records, the runtime frame, and React all settle. */
async function settle() {
  await act(async () => {
    await Promise.resolve();
    await frame();
    await frame();
  });
}

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  localStorage.clear(); // habituation counts persist there
});

it("runs against a matching react/react-dom pair", () => {
  expect(domVersion).toBe(version);
  expect(version).toMatch(/^1[89]\./); // the "react18" project runs this suite on 18.x

});

describe("useEntangled", () => {
  function Toggle() {
    return <button {...useEntangled({ affects: ["theme", "media:*"], effect: "pulse", layer: true, drop: ["slot:a", "slot:b"] })}>t</button>;
  }

  it("renders plain data attributes, including on the server", () => {
    const html = renderToString(<Toggle />);
    expect(html).toContain('data-en-affects="theme media:*"');
    expect(html).toContain('data-en-effect="pulse"');
    expect(html).toContain('data-en-layer=""');
    expect(html).toContain('data-en-drop="slot:a slot:b"');
  });

  it("registers through the Provider's runtime and cleans up on unmount", async () => {
    await render(
      <EntangledProvider>
        <Toggle />
      </EntangledProvider>,
    );
    expect(document.querySelector("[data-en-overlay]")).not.toBeNull();
    expect($("button").getAttribute("data-en-fx")).toBe("pulse");
    await act(async () => root!.unmount());
    root = null;
    expect(document.querySelector("[data-en-overlay]")).toBeNull();
  });
});

describe("useEntangledState / useEntangledValue", () => {
  const renders: Record<string, number> = {};
  const count = (name: string) => (renders[name] = (renders[name] ?? 0) + 1);

  function Switch() {
    count("switch");
    const [on, setOn, bind] = useEntangledState("notifications", false);
    return (
      <button id="switch" role="switch" aria-checked={on} {...bind} onClick={() => setOn((v) => !v)}>
        {String(on)}
      </button>
    );
  }
  function Badge() {
    count("badge");
    const [on, bind] = useEntangledValue("notifications", false);
    return (
      <span id="badge" {...bind}>
        {on ? "on" : "off"}
      </span>
    );
  }
  function Unrelated() {
    count("unrelated");
    return <p id="unrelated">static</p>;
  }
  const App = () => (
    <EntangledProvider>
      <Switch />
      <Badge />
      <Unrelated />
    </EntangledProvider>
  );

  it("shares state by key and confirms readers when the setter runs", async () => {
    await render(<App />);
    expect($("#switch").getAttribute("data-en-affects")).toBe("notifications");
    expect($("#switch").getAttribute("data-en-confirm")).toBe("manual");
    expect($("#badge").getAttribute("data-en-by")).toBe("notifications");
    await act(async () => $("#switch").click());
    expect($("#badge").textContent).toBe("on");
    await settle();
    expect(state("#badge")).toBe("confirm");
    expect(state("#switch")).toBeNull(); // the source never confirms itself
    expect(state("#unrelated")).toBeNull();
  });

  it("passes origin and actor through the setter", async () => {
    let set!: (v: boolean, o?: import("../src/index.js").SetOptions) => void;
    function Remote() {
      const [, s] = useEntangledState("notifications", false);
      set = s;
      return null;
    }
    await render(
      <EntangledProvider>
        <Switch />
        <Badge />
        <Remote />
      </EntangledProvider>,
    );
    await act(async () => set(true, { origin: "peer", actor: { id: "u42", name: "Mina", color: "#7c5cff" } }));
    await settle();
    expect(state("#badge")).toBe("confirm");
    expect($("#badge").getAttribute("data-en-origin")).toBe("peer");
    expect($("#badge").getAttribute("data-en-actor")).toBe("Mina");
    // Not the user's doing: the switch they could use is highlighted too.
    expect(state("#switch")).toBe("confirm");
    await act(async () => set(false)); // no recent user input: inferred as system
    await settle();
    expect($("#badge").getAttribute("data-en-origin")).toBe("system");
  });

  it("does not confirm when the value is unchanged", async () => {
    let set!: (v: boolean) => void;
    function Setter() {
      const [, s] = useEntangledState("k", false);
      set = s;
      return null;
    }
    function Reader() {
      const [, bind] = useEntangledValue("k");
      return <i id="reader" {...bind} />;
    }
    await render(
      <EntangledProvider>
        <Setter />
        <Reader />
      </EntangledProvider>,
    );
    await settle();
    await act(async () => set(false));
    await settle();
    expect(state("#reader")).toBeNull();
  });

  it("previews without a single React re-render", async () => {
    let api!: ReturnType<typeof useEntangle>;
    function Grab() {
      api = useEntangle();
      return null;
    }
    await render(
      <EntangledProvider>
        <Grab />
        <Switch />
        <Badge />
        <Unrelated />
      </EntangledProvider>,
    );
    await settle();
    const before = { ...renders };
    const end = api.preview("notifications");
    await settle();
    expect(state("#badge")).toBe("preview");
    end();
    await settle();
    expect(state("#badge")).toBeNull();
    expect(renders).toEqual(before);
  });

  it("useForesight accepts a WriterResolution, resolves what it affects when previewed, and confirms manually", async () => {
    let target = "clip:a";
    function Undo() {
      return <button id="undo" {...useForesight("edit:undo", () => ({ keys: [target] }))} />;
    }
    await render(
      <StrictMode>
        <EntangledProvider dwellMs={10} habituation={false}>
          <Undo />
          <div id="a" data-en-by="clip:a" />
          <div id="b" data-en-by="clip:b" />
          <p id="out" />
        </EntangledProvider>
      </StrictMode>,
    );
    await settle();
    expect($("#undo").getAttribute("data-en-affects")).toBe("edit:undo");
    expect($("#undo").getAttribute("data-en-confirm")).toBe("manual");
    const hover = async (on: boolean) => {
      $(on ? "#undo" : "#undo").dispatchEvent(
        new MouseEvent(on ? "pointerover" : "pointerout", { bubbles: true, relatedTarget: on ? null : $("#out") }),
      );
      await act(async () => {
        await new Promise((r) => setTimeout(r, 40));
      });
      await settle();
    };
    await hover(true);
    expect(state("#a")).toBe("preview");
    await hover(false);
    target = "clip:b"; // the latest resolver runs, without a render
    await hover(true);
    expect(state("#a")).toBeNull();
    expect(state("#b")).toBe("preview");
  });

  it("works under StrictMode double effects", async () => {
    await render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    expect(document.querySelectorAll("[data-en-overlay]")).toHaveLength(1);
    await act(async () => $("#switch").click());
    await settle();
    expect(state("#badge")).toBe("confirm");
  });

  it("throws a helpful error outside a Provider", () => {
    const err = console.error;
    console.error = () => {};
    try {
      expect(() => renderToString(<Badge />)).toThrow(/inside <EntangledProvider>/);
    } finally {
      console.error = err;
    }
  });
});

describe("<EntangledNode>", () => {
  function Clock() {
    // No bind spread: associates with the nearest EntangledNode.
    const [h24] = useEntangledValue("clock", false);
    return <span>{h24 ? "17:00" : "5:00 PM"}</span>;
  }

  it("collects unbound hook keys onto its element without re-rendering", async () => {
    function App({ show }: { show: boolean }) {
      return (
        <EntangledProvider>
          <EntangledNode id="card" by="summary">
            {show && <Clock />}
          </EntangledNode>
        </EntangledProvider>
      );
    }
    await render(<App show />);
    await settle();
    expect($("#card").getAttribute("data-en-by")).toBe("summary clock");
    await act(async () => root!.render(<App show={false} />));
    expect($("#card").getAttribute("data-en-by")).toBe("summary");
  });

  it("ignores hooks whose bind is attached", async () => {
    function Bound() {
      const [, bind] = useEntangledValue("bound");
      return <em id="bound" {...bind} />;
    }
    await render(
      <EntangledProvider>
        <EntangledNode id="node">
          <Bound />
        </EntangledNode>
      </EntangledProvider>,
    );
    await settle();
    expect($("#node").hasAttribute("data-en-by")).toBe(false);
    expect($("#bound").getAttribute("data-en-by")).toBe("bound");
  });

  it("asChild merges onto the child and preserves both refs", async () => {
    const Card = forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>((props, ref) => (
      <article {...props} ref={ref} />
    ));
    const outer = createRef<Element>();
    const inner = createRef<HTMLElement>();
    await render(
      <EntangledProvider>
        <EntangledNode asChild ref={outer} effect="tint">
          <Card id="c" ref={inner}>
            <Clock />
          </Card>
        </EntangledNode>
      </EntangledProvider>,
    );
    await settle();
    expect(container.firstElementChild?.tagName).toBe("ARTICLE"); // no wrapper
    expect($("#c").getAttribute("data-en-by")).toBe("clock");
    expect($("#c").getAttribute("data-en-effect")).toBe("tint");
    expect(outer.current).toBe($("#c"));
    expect(inner.current).toBe($("#c"));
  });

  it("confirms the node when an auto-associated writer sets state", async () => {
    function Writer() {
      const [, set] = useEntangledState("density", "comfy");
      return (
        <button id="w" onClick={() => set("compact")}>
          w
        </button>
      );
    }
    function Reader() {
      const [d, bind] = useEntangledValue("density", "comfy");
      return (
        <p id="r" {...bind}>
          {d}
        </p>
      );
    }
    await render(
      <EntangledProvider>
        <EntangledNode id="node">
          <Writer />
        </EntangledNode>
        <Reader />
      </EntangledProvider>,
    );
    await settle();
    expect($("#node").getAttribute("data-en-affects")).toBe("density");
    expect($("#node").getAttribute("data-en-confirm")).toBe("manual");
    await act(async () => $("#w").click());
    await settle();
    expect(state("#r")).toBe("confirm");
    expect(state("#node")).toBeNull();
  });
});

describe("external stores", () => {
  function createCounterStore() {
    let value = 0;
    const listeners = new Set<() => void>();
    return {
      subscribe: (l: () => void) => (listeners.add(l), () => listeners.delete(l)),
      getSnapshot: () => value,
      inc: () => {
        value++;
        listeners.forEach((l) => l());
      },
    };
  }

  it("reads via useEntangledStore and confirms via useEntangledSetter", async () => {
    const store = createCounterStore();
    function View() {
      const [n, bind] = useEntangledStore("count", store, (v) => v * 10);
      return (
        <output id="out" {...bind}>
          {n}
        </output>
      );
    }
    function Inc() {
      const inc = useEntangledSetter("count", store.inc);
      return (
        <button id="inc" {...useEntangled({ affects: "count", confirm: "manual" })} onClick={inc}>
          +
        </button>
      );
    }
    await render(
      <EntangledProvider>
        <View />
        <Inc />
      </EntangledProvider>,
    );
    await act(async () => $("#inc").click());
    expect($("#out").textContent).toBe("10");
    await settle();
    expect(state("#out")).toBe("confirm");
    expect(state("#inc")).toBeNull(); // implicit source: the clicked writer
  });
});

describe("peek", () => {
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  const renders: Record<string, number> = {};
  const count = (name: string) => (renders[name] = (renders[name] ?? 0) + 1);
  const euros = (n: number) => `${n < 0 ? "−" : "+"}€${Math.abs(n)}`;
  const priceWith = (d: number) => 120 - 120 * (d / 100);

  function Discount() {
    const [d, setD, bind] = useEntangledState("discount", 0, { previewValue: (cur) => cur + 10 });
    return (
      <button id="discount" {...bind} onClick={() => setD((v) => v + 10)}>
        {d}%
      </button>
    );
  }
  function Price() {
    count("price");
    const [d, bind] = useEntangledValue("discount", 0, {
      peekDelta: (cur, next) => euros(priceWith(next) - priceWith(cur)),
    });
    return (
      <output id="price" {...bind}>
        €{priceWith(d)}
      </output>
    );
  }
  function WouldPay() {
    count("would");
    const next = usePeekValue<number>("discount");
    return <span id="would">{next === undefined ? "" : `€${priceWith(next)}`}</span>;
  }
  function Flag() {
    const [on, , bind] = useEntangledState("flag", false);
    return <button id="flag" {...bind}>{String(on)}</button>;
  }

  it("writes data-en-value/data-en-next from the state, booleans flipping by default", async () => {
    await render(
      <EntangledProvider>
        <Discount />
        <Flag />
      </EntangledProvider>,
    );
    expect($("#discount").getAttribute("data-en-value")).toBe("0");
    expect($("#discount").getAttribute("data-en-next")).toBe("10");
    expect($("#flag").getAttribute("data-en-value")).toBe("false");
    expect($("#flag").getAttribute("data-en-next")).toBe("true");
    await act(async () => $("#discount").click());
    expect($("#discount").getAttribute("data-en-next")).toBe("20");
  });

  it("shows the reader's delta after the dwell with no reader render, and feeds usePeekValue", async () => {
    await render(
      <EntangledProvider dwellMs={10}>
        <Discount />
        <Price />
        <WouldPay />
      </EntangledProvider>,
    );
    const before = { price: renders.price, would: renders.would };
    await act(async () => {
      $("#discount").dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
      await sleep(40);
    });
    await settle();
    expect($("#price").getAttribute("data-en-delta")).toBe("−€12");
    expect(renders.price).toBe(before.price); // the chip is DOM-only
    expect($("#would").textContent).toBe("€108");
    expect(renders.would).toBeGreaterThan(before.would!);
    await act(async () => {
      $("#discount").dispatchEvent(new MouseEvent("pointerout", { bubbles: true, relatedTarget: document.body }));
    });
    await settle();
    expect($("#price").hasAttribute("data-en-delta")).toBe(false);
    expect($("#would").textContent).toBe("");
  });

  it("definePeekTokens is available from useEntangle", async () => {
    let api!: ReturnType<typeof useEntangle>;
    function Grab() {
      api = useEntangle();
      return null;
    }
    await render(
      <EntangledProvider>
        <Grab />
      </EntangledProvider>,
    );
    const off = api.definePeekTokens({ key: "theme", tokens: { "--bg": { light: "white", dark: "black" } } });
    await act(async () => Promise.resolve());
    expect(document.querySelector('style[data-en-sheet="peek"]')?.textContent).toContain("--bg");
    off();
  });
});

describe("foresight", () => {
  const hover = async (id: string, on: boolean) => {
    $(id).dispatchEvent(new MouseEvent(on ? "pointerover" : "pointerout", { bubbles: true, relatedTarget: on ? null : $("#out") }));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 40));
    });
    await settle();
  };

  it("useForesight registers, previews changes after the dwell, and unregisters on unmount", async () => {
    let plans = 0;
    let rt: EntangledRuntime | null = null;
    function Delete({ show }: { show: boolean }) {
      rt = useEntangle().runtime;
      const bind = useForesight("todo:delete", () => (plans++, [{ key: "todo:a", kind: "remove" }]), { severity: "destructive" });
      return show ? <button id="del" {...bind} /> : null;
    }
    const ui = (show: boolean) => (
      <EntangledProvider dwellMs={10} habituation={false}>
        <Delete show={show} />
        <div id="a" data-en-by="todo:a" />
        <p id="out" />
      </EntangledProvider>
    );
    await render(ui(true));
    await settle();
    expect($("#del").getAttribute("data-en-severity")).toBe("destructive");
    expect($("#del").getAttribute("data-en-confirm")).toBe("manual");
    expect(plans).toBe(0);
    await hover("#del", true);
    expect(plans).toBe(1);
    expect($("#a").getAttribute("data-en-kind")).toBe("remove");
    expect($("#a").getAttribute("data-en-tone")).toBe("caution");
    await hover("#del", false);
    const el = $("#del");
    await act(async () => root!.render(ui(false)));
    // Unregistered: the same element, back in the DOM as a plain writer, runs no plan.
    container.append(el);
    await settle();
    expect(rt!.graph.has(el, "writer")).toBe(true);
    await hover("#del", true);
    expect(plans).toBe(1);
  });

  it.skipIf(!/^19\./.test(version))("foresightProps registers through a ref with cleanup (React 19)", async () => {
    let plans = 0;
    let rt: EntangledRuntime | null = null;
    function Grab() {
      rt = useEntangle().runtime;
      return null;
    }
    function Item({ runtime }: { runtime: EntangledRuntime | null }) {
      return runtime ? <button id="item" {...foresightProps(runtime, "menu:x", () => (plans++, ["todo:a"]))} /> : null;
    }
    const ui = (show: boolean) => (
      <EntangledProvider dwellMs={10} habituation={false}>
        <Grab />
        {show ? <Item runtime={rt} /> : null}
        <div id="a" data-en-by="todo:a" />
        <p id="out" />
      </EntangledProvider>
    );
    await render(ui(false));
    await act(async () => root!.render(ui(true)));
    await settle();
    await hover("#item", true);
    expect(plans).toBe(1);
    expect(state("#a")).toBe("preview");
    await hover("#item", false);
    const el = $("#item");
    await act(async () => root!.render(ui(false)));
    container.append(el);
    await settle();
    await hover("#item", true);
    expect(plans).toBe(1);
  });
});

describe("attention", () => {
  it('entangledProps({ confirm: "auto" }) emits data-en-confirm="auto"', () => {
    expect(entangledProps({ affects: "k", confirm: "auto" })).toEqual({ "data-en-affects": "k", "data-en-confirm": "auto" });
    expect(entangledProps({ affects: "k", confirm: "manual" })["data-en-confirm"]).toBe("manual");
  });

  it("entangledProps: the record form of affects gives per-key kinds; change, severity, channel and paint", () => {
    expect(entangledProps({ affects: { "cart:items": "add", "cart:total": "modify" }, change: "modify" })).toEqual({
      "data-en-affects": "cart:items cart:total",
      "data-en-change": "modify add:cart:items modify:cart:total",
    });
    expect(entangledProps({ affects: "clip:7", change: "remove", severity: "destructive" })).toEqual({
      "data-en-affects": "clip:7",
      "data-en-change": "remove",
      "data-en-severity": "destructive",
    });
    expect(entangledProps({ by: "clip:7", channel: ["hue", "outline"], paint: "stroke" })).toEqual({
      "data-en-by": "clip:7",
      "data-en-channel": "hue outline",
      "data-en-paint": "stroke",
    });
  });

  it("useAttentionLevel re-renders on setLevel and sees a stored level", async () => {
    localStorage.setItem("entangled:attention", "minimal");
    let set: ((l: "off" | "minimal" | "standard" | "guided") => void) | null = null;
    function Level() {
      const [level, setLevel] = useAttentionLevel();
      set = setLevel;
      return <output id="level">{level}</output>;
    }
    await render(
      <EntangledProvider sensors={[]}>
        <Level />
      </EntangledProvider>,
    );
    await settle();
    expect($("#level").textContent).toBe("minimal");
    await act(async () => set!("guided"));
    expect($("#level").textContent).toBe("guided");
    expect(document.documentElement.dataset.enLevel).toBe("guided");
  });
});

describe("bring your own runtime", () => {
  it("starts an external runtime but leaves its lifecycle to the owner", async () => {
    const rt: EntangledRuntime = createEntangled({ sensors: [] });
    await render(
      <EntangledProvider runtime={rt}>
        <i />
      </EntangledProvider>,
    );
    expect(rt.started).toBe(true);
    await act(async () => root!.unmount());
    root = null;
    expect(rt.started).toBe(true);
    rt.destroy();
  });
});
