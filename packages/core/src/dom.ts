import type { Graph, NodeOptions } from "./graph.js";
import { namespaceTokens } from "./compiler.js";
import { type Key, splitKeys } from "./key.js";

/** DOM contract shared by every runtime mode and every effect preset. */
export const ATTR = {
  /** Author: keys this control writes. */
  affects: "data-en-affects",
  /** Author: keys this element's appearance depends on. */
  by: "data-en-by",
  /** Author: effect preset override. */
  effect: "data-en-effect",
  /** Author: attention-budget priority (number, higher wins). */
  priority: "data-en-priority",
  /**
   * Author: `"manual"` disables confirm-on-activation for a writer; `"auto"`
   * enables it where the profile doesn't (`profile: "app"`).
   */
  confirm: "data-en-confirm",
  /**
   * Author (drag): keys a dragged writer previews instead of its own, when it drops elsewhere than
   * it applies.
   */
  drop: "data-en-drop",
  /** Author (Peek): a writer's current state value. Update it when the value changes. */
  value: "data-en-value",
  /**
   * Author (Peek): the state this writer would switch to. Update it when the value changes, never
   * on hover.
   */
  next: "data-en-next",
  /** Author: host is positioned and has no own `::after`; unlocks layered effects. */
  layer: "data-en-layer",
  /**
   * Author: host is positioned and has no own `::before`; shows the actor badge on peer confirms.
   */
  badge: "data-en-badge",
  /**
   * Author (writers): how each key changes, e.g. `remove` or `add:cart:items` (see
   * `parseChangeAttr`).
   */
  change: "data-en-change",
  /**
   * Author (writers): `"destructive"` draws previews in the caution tone and lets them through
   * `minimal`.
   */
  severity: "data-en-severity",
  /**
   * Author (containers): names a region (panel, sidebar, canvas); cues crossing regions get the far
   * channel.
   */
  region: "data-en-region",
  /**
   * Author (readers): `hue outline shadow`, the visual channels the host already uses, which
   * effects avoid.
   */
  channel: "data-en-channel",
  /** Author (SVG readers): `stroke fill`, the SVG paints the `stroke` preset may colour. */
  paint: "data-en-paint",
  /** Author (reader descendants): `label`, a part some presets restyle (the `row` label). */
  part: "data-en-part",
  /** Runtime: resolved effect preset (set at registration, never on the hover path). */
  fx: "data-en-fx",
  /** Runtime: `"preview" | "confirm"` while an element is salient. */
  state: "data-en-state",
  /** Runtime: `"self" | "peer" | "system"` while confirming: who caused the change. */
  origin: "data-en-origin",
  /** Runtime: the actor's name (or id) while confirming a change they made. */
  actor: "data-en-actor",
  /** Runtime: marks the single global overlay element. */
  overlay: "data-en-overlay",
  /** Runtime: `"full"` on the document element opts out of the reduced-motion fallback. */
  motion: "data-en-motion",
  /** Runtime (CSS mode): namespaces a reader's keys live in, for wildcard matching. */
  ns: "data-en-ns",
  /** Runtime (CSS mode): writer keys for which this reader is over the attention budget. */
  over: "data-en-over",
  /** Runtime: on the document element while a reverse query is active (the modifier is held). */
  query: "data-en-query",
  /** Runtime (Value Peek): the formatted change this reader would see, while previewing. */
  delta: "data-en-delta",
  /**
   * Runtime: `"quiet" | "interrupt"` while confirming at that notify level (absent for `aware`).
   */
  notify: "data-en-notify",
  /** Runtime: the attention level, on the document element. */
  level: "data-en-level",
  /** Runtime (sticky): present while a cue is far from its cause (another region). */
  far: "data-en-far",
  /** Runtime (sticky): the change kind drawn on a salient element, when not `modify`. */
  kind: "data-en-kind",
  /** Runtime (sticky): `"may"` when the change is uncertain. */
  certainty: "data-en-certainty",
  /** Runtime (sticky): `"caution"` while previewing a destructive change. */
  tone: "data-en-tone",
} as const;

/** A visual channel a host already uses for itself (`data-en-channel`), which effects avoid. */
export type Channel = "hue" | "outline" | "shadow";
/** An SVG paint the `stroke` preset may colour (`data-en-paint`). */
export type Paint = "stroke" | "fill";

/** Custom properties the runtime sets inline on salient elements. */
export const VARS = {
  /** `1` while an element previews. */
  preview: "--en-preview",
  /** Effect strength (0-1) after the attention budget and habituation. */
  intensity: "--en-intensity",
  /** Confirm duration, e.g. `900ms`. */
  durationConfirm: "--en-duration-confirm",
  /** The actor's color on peer confirms. */
  actorColor: "--en-actor-color",
  /** `1` on writers shown as sources during a reverse query. */
  source: "--en-source",
} as const;

/** Matches every writer or reader. */
export const NODE_SELECTOR = `[${ATTR.affects}],[${ATTR.by}]`;
/** Matches every writer. */
export const WRITER_SELECTOR = `[${ATTR.affects}]`;

const MEDIA_TAGS = new Set(["IMG", "VIDEO", "PICTURE", "CANVAS", "SVG", "IFRAME"]);
const CONTROL_TAGS = new Set(["BUTTON", "INPUT", "SELECT", "TEXTAREA", "A", "SUMMARY"]);
const CONTROL_ROLES = new Set([
  "button",
  "switch",
  "checkbox",
  "radio",
  "tab",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "slider",
  "link",
  "combobox",
  "spinbutton",
]);

/** `<html>` and `<body>`: depending on them means the whole screen is affected. */
export function isGlobalSurface(el: Element): boolean {
  const doc = el.ownerDocument;
  return el === doc.documentElement || el === doc.body;
}

/**
 * Media elements (`img`, `video`, `svg`, ...): self-contained boxes, so a paint-only `filter` can't
 * affect layout.
 */
export function isMediaElement(el: Element): boolean {
  return MEDIA_TAGS.has(el.tagName.toUpperCase());
}

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Pick the effect preset: `data-en-effect` if set, else `veil` for `<html>`/`<body>`,
 * `sweep` for media, `stroke` for SVG graphics inside an `<svg>`, `ring` for
 * controls and writer-only elements, `tint` otherwise.
 */
export function resolveEffect(el: Element, writerOnly: boolean): string {
  const explicit = el.getAttribute(ATTR.effect)?.trim();
  if (explicit) return explicit;
  if (isGlobalSurface(el)) return "veil";
  if (isMediaElement(el)) return "sweep";
  // No CSS boxes inside SVG graphics: box-shadow draws nothing there.
  if (el.namespaceURI === SVG_NS && el.localName !== "svg") return "stroke";
  const role = el.getAttribute("role");
  if (writerOnly || CONTROL_TAGS.has(el.tagName.toUpperCase()) || (role && CONTROL_ROLES.has(role))) return "ring";
  return "tint";
}

export interface DomBindingOptions {
  /** Maintain `data-en-ns` on readers (CSS-compiled mode). */
  namespaces?: boolean;
  onInvalidKey?: (token: string, el: Element) => void;
  /**
   * A registered element carries `data-en-value`/`data-en-next` (on scan, and whenever they
   * change).
   */
  onPeekAttr?: (el: Element) => void;
  /**
   * A registered writer was synced: on scan, and whenever one of its observed
   * attributes changed (`data-en-change`/`data-en-severity` among them).
   */
  onWriterAttr?: (el: Element) => void;
}

/** Readers drawn by the overlay instead of on their own box. */
export function routesToOverlay(el: Element, effect: string | undefined): boolean {
  return isGlobalSurface(el) || effect === "veil";
}

interface Registration {
  affects: string | null;
  by: string | null;
  effect: string | null;
  priority: string | null;
  dispose: () => void;
}

const OBSERVED = [ATTR.affects, ATTR.by, ATTR.effect, ATTR.priority, ATTR.value, ATTR.next, ATTR.change, ATTR.severity];

/**
 * Mirrors `data-en-*` attributes in a subtree into the graph. All DOM reads
 * here are attribute reads; nothing touches layout.
 */
export class DomBinding {
  private readonly regs = new Map<Element, Registration>();
  private observer: MutationObserver | null = null;
  /** Readers whose effect is drawn by the global overlay. */
  readonly overlayReaders = new Set<Element>();

  constructor(
    private readonly root: Document | ShadowRoot,
    private readonly graph: Graph<Element>,
    private options: DomBindingOptions = {},
  ) {}

  start(observe: boolean): void {
    this.root.querySelectorAll(NODE_SELECTOR).forEach((el) => this.sync(el));
    if (observe && typeof MutationObserver !== "undefined") {
      this.observer = new MutationObserver((records) => this.onMutations(records));
      this.observer.observe(this.root, { subtree: true, childList: true, attributes: true, attributeFilter: OBSERVED });
    }
  }

  /** Toggle `data-en-ns` maintenance (CSS mode), updating every registered reader. */
  setNamespaces(on: boolean): void {
    if (Boolean(this.options.namespaces) === on) return;
    this.options = { ...this.options, namespaces: on };
    for (const el of this.regs.keys()) {
      if (on) this.writeNamespaces(el, this.graph.keysOf(el, "reader"));
      else el.removeAttribute(ATTR.ns);
    }
  }

  private writeNamespaces(el: Element, readerKeys: readonly Key[]): void {
    const ns = [...new Set(readerKeys.flatMap(namespaceTokens))].join(" ");
    if (!ns) el.removeAttribute(ATTR.ns);
    else if (el.getAttribute(ATTR.ns) !== ns) el.setAttribute(ATTR.ns, ns);
  }

  /** Synchronously apply pending mutations (used before confirms so new nodes are seen). */
  flush(): void {
    const records = this.observer?.takeRecords();
    if (records?.length) this.onMutations(records);
  }

  destroy(): void {
    this.observer?.disconnect();
    this.observer = null;
    for (const [el, reg] of this.regs) {
      reg.dispose();
      el.removeAttribute(ATTR.fx);
      el.removeAttribute(ATTR.ns);
    }
    this.regs.clear();
    this.overlayReaders.clear();
  }

  private onMutations(records: MutationRecord[]): void {
    const touched = new Set<Element>();
    const collect = (node: Node) => {
      if (!(node instanceof Element)) return;
      if (node.matches(NODE_SELECTOR) || this.regs.has(node)) touched.add(node);
      node.querySelectorAll(NODE_SELECTOR).forEach((el) => touched.add(el));
    };
    for (const r of records) {
      if (r.type === "attributes") touched.add(r.target as Element);
      else {
        // Attributes stripped before removal arrive as attribute records, so
        // a selector walk of each subtree finds every registration involved.
        r.addedNodes.forEach(collect);
        r.removedNodes.forEach(collect);
      }
    }
    for (const el of touched) this.sync(el);
  }

  /** Reconcile one element's registration, peek and change attributes with the DOM. */
  sync(el: Element): void {
    this.syncRegistration(el);
    if (this.options.onPeekAttr && this.regs.has(el) && (el.hasAttribute(ATTR.value) || el.hasAttribute(ATTR.next))) {
      this.options.onPeekAttr(el);
    }
    if (this.options.onWriterAttr && this.regs.get(el)?.affects != null) this.options.onWriterAttr(el);
  }

  private syncRegistration(el: Element): void {
    const prev = this.regs.get(el);
    const attached = el.isConnected && this.root.contains(el);
    const affects = attached ? el.getAttribute(ATTR.affects) : null;
    const by = attached ? el.getAttribute(ATTR.by) : null;
    const effect = el.getAttribute(ATTR.effect);
    const priority = el.getAttribute(ATTR.priority);
    if (prev && prev.affects === affects && prev.by === by && prev.effect === effect && prev.priority === priority) {
      return;
    }
    prev?.dispose();
    this.regs.delete(el);
    this.overlayReaders.delete(el);
    if (affects === null && by === null) {
      if (prev) {
        el.removeAttribute(ATTR.fx);
        el.removeAttribute(ATTR.ns);
      }
      return;
    }
    const invalid = (t: string) => this.options.onInvalidKey?.(t, el);
    const writerKeys: Key[] = splitKeys(affects, invalid);
    const readerKeys: Key[] = splitKeys(by, invalid);
    const options: NodeOptions = {};
    const p = priority === null ? NaN : Number(priority);
    if (Number.isFinite(p)) options.priority = p;
    const fx = isGlobalSurface(el) ? null : resolveEffect(el, readerKeys.length === 0);
    if (fx) options.effect = fx;
    const disposers = [
      writerKeys.length ? this.graph.addWriter(el, writerKeys, options) : null,
      readerKeys.length ? this.graph.addReader(el, readerKeys, options) : null,
    ];
    if (fx && el.getAttribute(ATTR.fx) !== fx) el.setAttribute(ATTR.fx, fx);
    if (readerKeys.length && routesToOverlay(el, fx ?? undefined)) this.overlayReaders.add(el);
    if (this.options.namespaces) this.writeNamespaces(el, readerKeys);
    this.regs.set(el, {
      affects,
      by,
      effect,
      priority,
      dispose: () => disposers.forEach((d) => d?.()),
    });
  }
}
