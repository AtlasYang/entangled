import type { Key } from "./key.js";

/**
 * Who caused a change:
 * - `self`: the person using this page (inferred from a recent trusted input event)
 * - `peer`: a collaborator (never inferred: pass it, e.g. from a realtime sync adapter)
 * - `system`: anything else (timers, server pushes, programmatic updates)
 */
export type Origin = "self" | "peer" | "system";

/** Who made a peer change. */
export interface Actor {
  /** Stable identifier. */
  id: string;
  /** Shown by the actor badge and in announcements. */
  name?: string;
  /** Any CSS color; overrides `--en-color-peer` for this actor's confirms. */
  color?: string;
}

/** What `announceRemoteChanges` formats into a live-region message. */
export interface RemoteChange {
  /** Keys that changed. */
  keys: readonly Key[];
  /** `peer` or `system`; `self` for confirms at notify level `interrupt`. */
  origin: Origin;
  /** The peer, when known. */
  actor: Actor | undefined;
}

export const isRemote = (origin: Origin): origin is Exclude<Origin, "self"> => origin !== "self";

/**
 * Trusted input events that count as "the user just did something". Hover and pointer moves don't.
 */
const INTENT_EVENTS = ["pointerdown", "pointerup", "click", "keydown", "keyup", "input", "change"] as const;

export interface IntentTracker {
  /** Record user intent now (also what the trusted-event listeners call). */
  mark(): void;
  /** Whether intent was recorded within the window. */
  recent(): boolean;
  detach(): void;
}

/**
 * Remembers the time of the last trusted pointer/keyboard event. Listeners
 * are passive, capture-phase and only store a timestamp.
 */
export function createIntentTracker(target: EventTarget | null, windowMs: number): IntentTracker {
  let last = -Infinity;
  const onEvent = (e: Event) => {
    if (e.isTrusted) last = performance.now();
  };
  const opts: AddEventListenerOptions = { passive: true, capture: true };
  for (const type of INTENT_EVENTS) target?.addEventListener(type, onEvent, opts);
  return {
    mark() {
      last = performance.now();
    },
    recent: () => performance.now() - last <= windowMs,
    detach() {
      for (const type of INTENT_EVENTS) target?.removeEventListener(type, onEvent, opts);
    },
  };
}

/**
 * Default live-region text: `"<name> updated <keys>"`, falling back to "A
 * collaborator" or "The system"; `"<keys> updated"` for your own changes.
 */
export function defaultAnnouncement({ keys, origin, actor }: RemoteChange): string {
  if (origin === "self") return `${keys.join(", ")} updated`;
  const who = actor?.name ?? (origin === "peer" ? "A collaborator" : "The system");
  return `${who} updated ${keys.join(", ")}`;
}

export interface Announcer {
  say(message: string): void;
  destroy(): void;
}

/**
 * A visually hidden `aria-live="polite"` region, rate limited: at most one
 * message per `intervalMs`; messages arriving in between are folded into one
 * summary when the interval ends.
 */
export function createAnnouncer(doc: Document, parent: Node, intervalMs: number): Announcer {
  const region = doc.createElement("div");
  region.setAttribute("aria-live", "polite");
  region.setAttribute("aria-atomic", "true");
  region.setAttribute("data-en-announcer", "");
  // Fixed and clipped: out of flow, so it can never affect layout or scroll size.
  region.style.cssText =
    "position:fixed;top:0;left:0;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;pointer-events:none;";
  parent.appendChild(region);

  let last = -Infinity;
  let queued: string[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;

  const emit = (text: string) => {
    last = performance.now();
    region.textContent = text;
  };
  const drain = () => {
    timer = undefined;
    if (queued.length === 0) return;
    const latest = queued[queued.length - 1]!;
    const more = queued.length - 1;
    queued = [];
    emit(more ? `${latest}, and ${more} more ${more === 1 ? "change" : "changes"}` : latest);
  };

  return {
    say(message) {
      const wait = last + intervalMs - performance.now();
      if (wait <= 0 && !timer) return emit(message);
      queued.push(message);
      timer ??= setTimeout(drain, Math.max(0, wait));
    },
    destroy() {
      clearTimeout(timer);
      region.remove();
    },
  };
}
