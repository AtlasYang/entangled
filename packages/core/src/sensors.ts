/**
 * Sensors turn raw input into preview/confirm intents. Each sensor attaches a
 * handful of delegated listeners to the root; none of them read layout.
 */

import { ATTR } from "./dom.js";
import { type Key, splitKeys } from "./key.js";

/** What the runtime hands a sensor on attach. */
export interface SensorContext {
  /** Where to attach listeners. */
  readonly root: Document | ShadowRoot;
  /** Runtime settings relevant to sensors. */
  readonly options: Readonly<{ dwellMs: number; touchPreview: boolean }>;
  /** The registered writer at or above `target`, if any. */
  findWriter(target: EventTarget | null): Element | null;
  /** Start previewing `writer`'s keys. */
  beginPreview(writer: Element): void;
  /** Stop previewing `writer`'s keys. */
  endPreview(writer: Element): void;
  /** The writer was activated (click/change): confirm its keys. */
  activate(writer: Element): void;
  /** Preview `keys` directly, like `runtime.preview`; returns a function that ends it. */
  preview(keys: readonly Key[]): () => void;
}

/** A pluggable input source. */
export interface Sensor {
  /** Identifier, e.g. `"pointer"`. */
  readonly name: string;
  /** Attach listeners; returns a detach function. */
  attach(ctx: SensorContext): () => void;
}

/** Options for `pointerSensor`. */
export interface PointerSensorOptions {
  /**
   * Pointer speed (px/ms) above which a hover counts as pass-through and the
   * dwell timer restarts. Default 1.2 (~1200 px/s).
   */
  maxVelocity?: number;
  /** A pointer idle for this long counts as stationary. Default 60ms. */
  idleMs?: number;
}

const passive: AddEventListenerOptions = { passive: true };

/** Hover preview with dwell time and pointer-velocity filtering. */
export function pointerSensor(opts: PointerSensorOptions = {}): Sensor {
  const maxVelocity = opts.maxVelocity ?? 1.2;
  const idleMs = opts.idleMs ?? 60;
  return {
    name: "pointer",
    attach(ctx) {
      let candidate: Element | null = null;
      let active: Element | null = null;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let lastX = 0;
      let lastY = 0;
      let lastT = 0;
      let speed = 0;

      const clear = () => {
        clearTimeout(timer);
        timer = undefined;
        if (active) ctx.endPreview(active);
        active = null;
        candidate = null;
      };

      const fire = () => {
        timer = undefined;
        if (!candidate) return;
        const moving = performance.now() - lastT < idleMs && speed > maxVelocity;
        if (moving) {
          // Still flying across the control: wait for it to settle.
          timer = setTimeout(fire, ctx.options.dwellMs);
          return;
        }
        active = candidate;
        ctx.beginPreview(active);
      };

      const onMove = (e: PointerEvent) => {
        const dt = e.timeStamp - lastT;
        if (dt > 0) {
          const inst = Math.hypot(e.clientX - lastX, e.clientY - lastY) / dt;
          speed = dt > idleMs ? inst : speed * 0.5 + inst * 0.5;
        }
        lastX = e.clientX;
        lastY = e.clientY;
        lastT = e.timeStamp;
      };

      const onOver = (e: PointerEvent) => {
        if (e.pointerType === "touch" && !ctx.options.touchPreview) return;
        const w = ctx.findWriter(e.target);
        if (w === candidate) return;
        clear();
        if (!w) return;
        candidate = w;
        timer = setTimeout(fire, ctx.options.dwellMs);
      };

      const onOut = (e: PointerEvent) => {
        if (!candidate) return;
        if (ctx.findWriter(e.relatedTarget) === candidate) return;
        clear();
      };

      const root = ctx.root;
      root.addEventListener("pointermove", onMove as EventListener, passive);
      root.addEventListener("pointerover", onOver as EventListener, passive);
      root.addEventListener("pointerout", onOut as EventListener, passive);
      root.addEventListener("pointercancel", clear, passive);
      return () => {
        clear();
        root.removeEventListener("pointermove", onMove as EventListener);
        root.removeEventListener("pointerover", onOver as EventListener);
        root.removeEventListener("pointerout", onOut as EventListener);
        root.removeEventListener("pointercancel", clear);
      };
    },
  };
}

/** `el.matches(":focus-visible")`, or true where the selector is unsupported. */
export function isFocusVisible(el: Element): boolean {
  try {
    return el.matches(":focus-visible");
  } catch {
    return true;
  }
}

/** Keyboard focus (`:focus-visible`) previews exactly like hover, without dwell. */
export function focusSensor(): Sensor {
  return {
    name: "focus",
    attach(ctx) {
      let active: Element | null = null;
      const onIn = (e: FocusEvent) => {
        const target = e.target as Element | null;
        const w = ctx.findWriter(target);
        if (w === active) return;
        if (active) ctx.endPreview(active);
        active = w && target && isFocusVisible(target) ? w : null;
        if (active) ctx.beginPreview(active);
      };
      const onOut = (e: FocusEvent) => {
        if (!active || ctx.findWriter(e.relatedTarget) === active) return;
        ctx.endPreview(active);
        active = null;
      };
      ctx.root.addEventListener("focusin", onIn as EventListener);
      ctx.root.addEventListener("focusout", onOut as EventListener);
      return () => {
        if (active) ctx.endPreview(active);
        ctx.root.removeEventListener("focusin", onIn as EventListener);
        ctx.root.removeEventListener("focusout", onOut as EventListener);
      };
    },
  };
}

const BUTTON_INPUTS = new Set(["button", "submit", "reset", "image"]);

function isValueField(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "SELECT" || tag === "TEXTAREA") return true;
  return tag === "INPUT" && !BUTTON_INPUTS.has((el as HTMLInputElement).type);
}

/**
 * Confirm on activation: `click` for buttons/links, `change` for form fields.
 * Writers with `data-en-confirm="manual"` are skipped (call `confirm()` yourself,
 * e.g. when an upload finishes).
 */
export function activationSensor(): Sensor {
  return {
    name: "activation",
    attach(ctx) {
      const onEvent = (e: Event) => {
        const target = e.target as Element | null;
        const w = ctx.findWriter(target);
        if (!w) return;
        // A checkbox fires both click and change; only count change for fields.
        if (isValueField(target) !== (e.type === "change")) return;
        ctx.activate(w);
      };
      // Capture phase: record the activation before app handlers (e.g. React's
      // root listener) run, so a confirm() they make sees the implicit source.
      const opts: AddEventListenerOptions = { passive: true, capture: true };
      ctx.root.addEventListener("click", onEvent, opts);
      ctx.root.addEventListener("change", onEvent, opts);
      return () => {
        ctx.root.removeEventListener("click", onEvent, opts);
        ctx.root.removeEventListener("change", onEvent, opts);
      };
    },
  };
}

/**
 * Preview while a writer is dragged (HTML drag and drop): what it affects is
 * where it can be dropped, so that stays highlighted, without a dwell, until
 * the drag ends. A writer that drops somewhere other than where it applies
 * names those keys in `data-en-drop`, previewed instead of its own. Opt-in,
 * alongside the defaults: `sensors: [...defaultSensors(), dragSensor()]`.
 * Like the other preview sensors it drives JS mode.
 */
export function dragSensor(): Sensor {
  return {
    name: "drag",
    attach(ctx) {
      let active: Element | null = null;
      let stop: (() => void) | null = null;
      const end = () => {
        if (stop) stop();
        else if (active) ctx.endPreview(active);
        active = null;
        stop = null;
      };
      const onStart = (e: Event) => {
        end();
        active = ctx.findWriter(e.target);
        if (!active) return;
        const drop = splitKeys(active.getAttribute(ATTR.drop));
        if (drop.length) stop = ctx.preview(drop);
        else ctx.beginPreview(active);
      };
      // `dragend` goes to the dragged element, which may have left the DOM by
      // then; a drop, or the first pointer move after the drag, ends it too.
      const onMove = () => {
        if (active) end();
      };
      const root = ctx.root;
      root.addEventListener("dragstart", onStart, passive);
      root.addEventListener("dragend", end, passive);
      root.addEventListener("drop", end, passive);
      root.addEventListener("pointermove", onMove, passive);
      return () => {
        end();
        root.removeEventListener("dragstart", onStart, passive);
        root.removeEventListener("dragend", end, passive);
        root.removeEventListener("drop", end, passive);
        root.removeEventListener("pointermove", onMove, passive);
      };
    },
  };
}

/** Pointer, focus and activation sensors. */
export function defaultSensors(): Sensor[] {
  return [pointerSensor(), focusSensor(), activationSensor()];
}
