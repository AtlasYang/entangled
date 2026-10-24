import type { EntangledRuntime, Key, RuntimeEvent } from "@entangled-ui/core";
import { type BudgetStat, type ForesightStat, type LintWarning, collectBudget, collectForesight, lint } from "./lint.js";
import { devtoolsCss } from "./styles.js";

/** Options for `mountDevtools`. */
export interface DevtoolsOptions {
  /** Open the panel right away. Default false (a small toggle button). */
  open?: boolean;
  /** Where the toggle sits. Default `"bottom-right"`. */
  position?: "bottom-right" | "bottom-left";
  /** Entries (confirms and notes) kept in the log. Default 50. */
  logSize?: number;
}

type Tab = "keys" | "log" | "habituation" | "lint";
const TABS: ReadonlyArray<[Tab, string]> = [
  ["keys", "Keys"],
  ["log", "Log"],
  ["habituation", "Habituation"],
  ["lint", "Lint"],
];

type LogEntry =
  | { type: "confirm"; time: number; keys: readonly Key[]; origin: string; actor?: string; shown: number }
  /** Anything else worth a line: level switches, slow foresight plans, deviations. */
  | { type: "note"; time: number; text: string };

const SVG = "http://www.w3.org/2000/svg";

/** How the log names a writer: its accessible label, else its text, else its tag. */
const writerLabel = (el: Element) => el.getAttribute("aria-label") ?? (el.textContent?.trim().slice(0, 32) || el.tagName.toLowerCase());
const TAG = "entangled-devtools";

/** Build an element tree without innerHTML (app strings are never parsed as markup). */
function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, string | number | boolean | ((e: Event) => void)> = {},
  ...children: Array<Node | string | null | false>
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (typeof v === "function") el.addEventListener(k.slice(2), v as EventListener);
    else if (v === false) continue;
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, String(v));
  }
  for (const c of children) if (c !== null && c !== false) el.append(c);
  return el;
}

const clock = (t: number) => {
  const d = new Date(performance.timeOrigin + t);
  return `${d.toLocaleTimeString("en-GB")}.${String(d.getMilliseconds()).padStart(3, "0")}`;
};

/**
 * Mount the DevTools overlay for `runtime`. Returns an unmount function.
 *
 * Everything lives in one `position: fixed` host with a shadow root, so it
 * never takes part in the app's layout and the app's CSS can't reach it.
 * Unlike the runtime, DevTools may read layout (`getBoundingClientRect`) to
 * draw connection lines; it is never part of a production build.
 */
export function mountDevtools(runtime: EntangledRuntime, options: DevtoolsOptions = {}): () => void {
  if (typeof document === "undefined") return () => {};
  const logSize = options.logSize ?? 50;
  const host = document.createElement(TAG);
  host.setAttribute("aria-label", "Entangled DevTools");
  // Inline, so the host can never affect layout even before the shadow styles apply.
  host.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:none;contain:strict;";
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = devtoolsCss;

  let open = options.open ?? false;
  let tab: Tab = "keys";
  let selected: Key | null = null;
  const log: LogEntry[] = [];
  const budget = new Map<string, BudgetStat & { key: Key }>();
  const foresight = new Map<Key, ForesightStat>();
  let frame = 0;
  let linesFrame = 0;

  const lines = document.createElementNS(SVG, "svg");
  lines.setAttribute("class", "lines");
  lines.setAttribute("aria-hidden", "true");
  const toggle = h("button", { class: "toggle", type: "button", "aria-expanded": String(open), onclick: () => setOpen(!open) }, "en");
  const body = h("div", { class: "body" });
  const tabs = h("div", { class: "tabs", role: "tablist" });
  const querying = h("span", { class: "query", hidden: true }, "query");
  const panel = h(
    "section",
    { class: "panel", "aria-label": "Entangled DevTools" },
    h("header", {}, h("strong", {}, "Entangled"), h("span", { class: "mode" }), querying, h("button", { class: "close", type: "button", "aria-label": "Close", onclick: () => setOpen(false) }, "×")),
    tabs,
    body,
  );
  const root = h("div", { class: `root ${options.position ?? "bottom-right"}` }, toggle, panel);
  shadow.append(style, lines, root);

  function setOpen(next: boolean) {
    open = next;
    toggle.setAttribute("aria-expanded", String(open));
    panel.hidden = !open;
    if (!open) select(null);
    render();
  }

  function select(key: Key | null) {
    selected = key;
    drawLines();
    render();
  }

  /**
   * Writer and reader boxes for the selected key, with a line from every writer to every reader.
   */
  function drawLines() {
    cancelAnimationFrame(linesFrame);
    lines.replaceChildren();
    if (!selected) return;
    const writers = [...runtime.graph.writersOf(selected)].filter((el) => el.isConnected);
    const readers = [...runtime.graph.readersOf(selected)].filter((el) => el.isConnected);
    const rect = (el: Element) => el.getBoundingClientRect();
    const center = (r: DOMRect) => [r.left + r.width / 2, r.top + r.height / 2] as const;
    const box = (r: DOMRect, cls: string) => {
      const b = document.createElementNS(SVG, "rect");
      b.setAttribute("class", cls);
      for (const [k, v] of Object.entries({ x: r.left, y: r.top, width: r.width, height: r.height, rx: 4 })) b.setAttribute(k, String(v));
      lines.append(b);
    };
    const wr = writers.map(rect);
    const rr = readers.map(rect);
    for (const w of wr) {
      for (const r of rr) {
        const [x1, y1] = center(w);
        const [x2, y2] = center(r);
        const l = document.createElementNS(SVG, "line");
        for (const [k, v] of Object.entries({ x1, y1, x2, y2 })) l.setAttribute(k, String(v));
        l.setAttribute("class", "link");
        lines.append(l);
      }
    }
    wr.forEach((r) => box(r, "writer"));
    rr.forEach((r) => box(r, "reader"));
  }
  const redrawLines = () => {
    if (!selected || linesFrame) return;
    linesFrame = requestAnimationFrame(() => {
      linesFrame = 0;
      drawLines();
    });
  };

  function keysView() {
    const { writerKeys, readerKeys, writerCounts, readerCounts } = runtime.graph.snapshot();
    const keys = [...new Set([...writerKeys, ...readerKeys])].sort();
    if (keys.length === 0) return h("p", { class: "empty" }, "No keys registered yet.");
    const rows = keys.map((key) =>
      h(
        "tr",
        { class: key === selected ? "selected" : "", "data-key": key },
        h(
          "td",
          {},
          h("button", { type: "button", class: "key", "aria-pressed": String(key === selected), onclick: () => select(key === selected ? null : key) }, key),
        ),
        h("td", { class: "num", title: "writers" }, String(writerCounts[key] ?? 0)),
        h("td", { class: "num", title: "readers" }, String(readerCounts[key] ?? 0)),
      ),
    );
    return h(
      "table",
      {},
      h("thead", {}, h("tr", {}, h("th", {}, "Key"), h("th", { class: "num" }, "W"), h("th", { class: "num" }, "R"))),
      h("tbody", {}, ...rows),
    );
  }

  function logView() {
    if (log.length === 0) return h("p", { class: "empty" }, "No confirms yet. Use a control.");
    return h(
      "ol",
      { class: "log" },
      ...log.map((e) =>
        e.type === "note" ? h("li", { class: "note" }, h("time", {}, clock(e.time)), h("span", {}, e.text)) : h(
          "li",
          { "data-origin": e.origin },
          h("time", {}, clock(e.time)),
          h("span", { class: `origin ${e.origin}` }, e.origin),
          e.actor ? h("span", { class: "actor" }, e.actor) : null,
          h("code", {}, e.keys.join(" ")),
          h("span", { class: "muted" }, `${e.shown} lit`),
        ),
      ),
    );
  }

  function habituationView() {
    if (!runtime.habituation.enabled) return h("p", { class: "empty" }, "Habituation is off.");
    const records = runtime.habituation.inspect();
    const reset = (key?: Key) => () => {
      runtime.habituation.reset(key);
      render();
    };
    return h(
      "div",
      {},
      records.length === 0
        ? h("p", { class: "empty" }, "Nothing seen yet: every effect is at full strength.")
        : h(
            "table",
            {},
            h("thead", {}, h("tr", {}, h("th", {}, "Key"), h("th", {}, "Kind"), h("th", { class: "num" }, "Seen"), h("th", { class: "num" }, "×"), h("th", {}))),
            h(
              "tbody",
              {},
              ...records.map((r) =>
                h(
                  "tr",
                  { "data-key": r.key },
                  h("td", {}, h("code", {}, r.key)),
                  h("td", {}, r.kind),
                  h("td", { class: "num" }, String(Math.round(r.count * 10) / 10)),
                  h("td", { class: "num" }, r.multiplier.toFixed(2)),
                  h("td", {}, h("button", { type: "button", class: "small", onclick: reset(r.key) }, "Reset")),
                ),
              ),
            ),
          ),
      h("button", { type: "button", class: "small reset-all", onclick: reset() }, "Reset all"),
    );
  }

  function lintView() {
    const warnings: LintWarning[] = lint({ snapshot: runtime.graph.snapshot(), budget, foresight, rejections: runtime.peekRejections });
    if (warnings.length === 0) return h("p", { class: "empty ok" }, "No issues.");
    return h(
      "ul",
      { class: "lint" },
      ...warnings.map((w) => h("li", { "data-code": w.code }, h("code", {}, w.code), " ", w.message)),
    );
  }

  function render() {
    cancelAnimationFrame(frame);
    frame = 0;
    root.classList.toggle("is-open", open);
    panel.hidden = !open;
    if (!open) return;
    (panel.querySelector(".mode") as HTMLElement).textContent = `${runtime.mode} mode`;
    const warnings = lint({ snapshot: runtime.graph.snapshot(), budget, foresight, rejections: runtime.peekRejections }).length;
    tabs.replaceChildren(
      ...TABS.map(([id, label]) =>
        h(
          "button",
          { type: "button", role: "tab", "aria-selected": String(id === tab), "data-tab": id, onclick: () => ((tab = id), render()) },
          label,
          id === "lint" && warnings > 0 ? h("span", { class: "count" }, String(warnings)) : null,
        ),
      ),
    );
    body.replaceChildren(tab === "keys" ? keysView() : tab === "log" ? logView() : tab === "habituation" ? habituationView() : lintView());
  }
  const scheduleRender = () => {
    if (!open || frame) return;
    frame = requestAnimationFrame(render);
  };

  const off = runtime.onEvent((e: RuntimeEvent) => {
    const add = (entry: LogEntry) => {
      log.unshift(entry);
      log.length = Math.min(log.length, logSize);
    };
    if (e.type === "confirm") {
      add({ type: "confirm", time: e.time, keys: e.keys, origin: e.origin, actor: e.actor?.name ?? e.actor?.id, shown: e.shown });
    } else if (e.type === "level") add({ type: "note", time: e.time, text: `level ${e.previous} → ${e.level}` });
    else if (e.type === "foresight") {
      collectForesight(foresight, e);
      if (e.slow) add({ type: "note", time: e.time, text: `slow foresight ${e.durationMs.toFixed(1)} ms · ${writerLabel(e.writer)}` });
    } else if (e.type === "deviation") {
      const text = `deviation · ${writerLabel(e.writer)} · +${e.unexpected.length} unexpected · −${e.missing.length} missing · ${e.mismatched.length} mismatched`;
      add({ type: "note", time: e.time, text });
    } else if (e.type === "budget") collectBudget(budget, e);
    else if (e.type === "query") querying.hidden = !e.active;
    else if (e.type === "graph") redrawLines();
    scheduleRender();
  });
  addEventListener("scroll", redrawLines, { passive: true, capture: true });
  addEventListener("resize", redrawLines, { passive: true });

  document.body.append(host);
  setOpen(open);

  return () => {
    off();
    removeEventListener("scroll", redrawLines, { capture: true });
    removeEventListener("resize", redrawLines);
    cancelAnimationFrame(frame);
    cancelAnimationFrame(linesFrame);
    host.remove();
  };
}
