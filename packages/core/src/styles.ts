/** A named stylesheet. Re-registering a name replaces that sheet in place. */
export interface StyleSheetSpec {
  /** Unique sheet name. */
  name: string;
  /** Sheet contents. */
  css: string;
}

/** Named stylesheets injected into one document or shadow root. */
export interface StyleHost {
  /** Add or replace the sheet `name`. */
  set(name: string, css: string): void;
  /** Remove the sheet `name`, if present. */
  remove(name: string): void;
  /** Remove every sheet this host added. */
  destroy(): void;
}

function supportsConstructable(root: Document | ShadowRoot): boolean {
  try {
    return (
      // jsdom exposes the property without real support; require an iterable.
      typeof (root.adoptedStyleSheets as unknown as Iterable<unknown> | undefined)?.[Symbol.iterator] === "function" &&
      typeof CSSStyleSheet !== "undefined" &&
      typeof CSSStyleSheet.prototype.replaceSync === "function"
    );
  } catch {
    return false;
  }
}

/**
 * Injects sheets via `adoptedStyleSheets` (constructable stylesheets), falling
 * back to `<style>` elements. Sheet order is insertion order; replacing a
 * sheet keeps its slot.
 */
export function createStyleHost(root: Document | ShadowRoot): StyleHost {
  if (supportsConstructable(root)) {
    const sheets = new Map<string, CSSStyleSheet>();
    const sync = () => {
      const ours = new Set<CSSStyleSheet>(sheets.values());
      const foreign = root.adoptedStyleSheets.filter((s) => !ours.has(s) && !owned.has(s));
      owned = ours;
      root.adoptedStyleSheets = [...foreign, ...sheets.values()];
    };
    let owned = new Set<CSSStyleSheet>();
    return {
      set(name, css) {
        const existing = sheets.get(name);
        if (existing) {
          existing.replaceSync(css);
          return;
        }
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(css);
        sheets.set(name, sheet);
        sync();
      },
      remove(name) {
        if (sheets.delete(name)) sync();
      },
      destroy() {
        sheets.clear();
        sync();
      },
    };
  }

  const doc = root instanceof Document ? root : root.ownerDocument;
  const parent: Node = root instanceof Document ? (doc.head ?? doc.documentElement) : root;
  const nodes = new Map<string, HTMLStyleElement>();
  return {
    set(name, css) {
      let node = nodes.get(name);
      if (!node) {
        node = doc.createElement("style");
        node.setAttribute("data-en-sheet", name);
        parent.appendChild(node);
        nodes.set(name, node);
      }
      node.textContent = css;
    },
    remove(name) {
      nodes.get(name)?.remove();
      nodes.delete(name);
    },
    destroy() {
      for (const n of nodes.values()) n.remove();
      nodes.clear();
    },
  };
}

/** Wrap user effect CSS so it sits in the effects sub-layer and user CSS still wins. */
export function wrapEffectCss(css: string): string {
  return `@layer entangled.effects {\n${css}\n}`;
}

let propertyRegistered = false;

/**
 * Register `--en-preview`, `--en-peek` and `--en-source` so they can
 * transition, and `--en-intensity` so `calc()`s of it compute to a number. Done in JS
 * as well as via `@property` in the preset CSS, because `@property` inside
 * constructed stylesheets is not honoured by every engine.
 */
export function registerPreviewProperty(): void {
  if (propertyRegistered) return;
  propertyRegistered = true;
  for (const [name, initialValue] of [
    ["--en-preview", "0"],
    ["--en-peek", "0"],
    ["--en-intensity", "1"],
    ["--en-source", "0"],
  ] as const) {
    try {
      CSS.registerProperty({ name, syntax: "<number>", inherits: true, initialValue });
    } catch {
      // Already registered (e.g. by @property) or unsupported: both fine.
    }
  }
}
