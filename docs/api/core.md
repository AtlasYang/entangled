# `@entangled-ui/core`

The framework-agnostic runtime: the writer/reader graph, key matching, the
JS and CSS-compiled runtimes, sensors, and the pure helpers behind every
feature.

```ts
import { createEntangled } from "entangled-ui"; // or "@entangled-ui/core"
import { autoStart } from "entangled-ui/auto"; // or "@entangled-ui/core/auto"
```

`@entangled-ui/core/auto` re-exports everything in `@entangled-ui/core` and
adds [`autoStart`](#autostart).

## Contents

- [Runtime](#runtime)
- [Keys](#keys)
- [Changes](#changes)
- [Origin](#origin)
- [Attention](#attention)
- [Foresight](#foresight)
- [Peek](#peek)
- [Habituation](#habituation)
- [Reverse query](#reverse-query)
- [Graph](#graph)
- [Attention budget](#attention-budget)
- [Sensors](#sensors)
- [DOM contract](#dom-contract)
- [Stylesheets](#stylesheets)
- [CSS compiler](#css-compiler)
- [Mode selection](#mode-selection)

---

## Runtime

### `createEntangled`

Creates a runtime. Nothing touches the DOM until `start()`, so it is safe to
call during server rendering.

```ts sig
function createEntangled(options?: EntangledOptions): EntangledRuntime;
```

```ts
import { createEntangled } from "entangled-ui";
import { presetStyles } from "entangled-ui/presets";

const runtime = createEntangled({ styles: presetStyles });
runtime.start();
```

Without `styles`, nothing is drawn: pass `presetStyles`, load
`entangled-ui/entangled.css`, or register your own effects.

### `autoStart`

Creates a runtime with `presetStyles`, starts it and returns it. Exported
from `@entangled-ui/core/auto` only. Importing the module has no side
effects; calling the function does.

```ts sig
function autoStart(options?: EntangledOptions): EntangledRuntime;
```

```ts
import { autoStart } from "entangled-ui/auto";

const runtime = autoStart({ profile: "app" });
```

### `EntangledOptions`

Options for `createEntangled`, `autoStart` and `<EntangledProvider>`. Every
field is optional. "By profile" means the default comes from
[`PROFILE_DEFAULTS`](#profile_defaults); an explicit value always wins.

| Option | Type | Default | Description |
|---|---|---|---|
| `profile` | `Profile` | `"site"` | A set of defaults for a kind of product. |
| `mode` | `"css" \| "js" \| "auto"` | by profile | How preview is driven. See [Runtime modes](../features.md#runtime-modes). `"css"` falls back to `"js"` without `:has()` or with a shadow root. |
| `includeWriters` | `boolean` | by profile | Default for `ConfirmOptions.includeWriters`. |
| `attention` | `AttentionOptions` | | Attention level and notify levels. |
| `foresight` | `{ budgetMs?: number; deviationWindowMs?: number }` | `8`, `1000` | Plans slower than `budgetMs` are reported as slow. A self confirm within `deviationWindowMs` of activating a foreseen writer is compared with what it showed. |
| `root` | `Document \| ShadowRoot` | `document` | Where to listen, scan and inject styles. Resolved at `start()`. |
| `dwellMs` | `number` | `120` | Hover time before a preview starts. |
| `confirmMs` | `number` | `--en-duration-confirm` (`900`) | Afterglow length for `self` changes. |
| `remoteConfirmMs` | `number` | `1.8 * confirmMs` | Afterglow length for `peer` and `system` changes. |
| `originWindowMs` | `number` | `300` | A confirm this soon after trusted user input counts as `self`. |
| `coalesceMs` | `number` | `2000` | Confirms of the same key and origin within this window merge into one afterglow. |
| `announceRemoteChanges` | `boolean \| (change: RemoteChange) => string \| null` | `false` | Announce `peer` and `system` changes in a polite live region. A function formats the message; `null` stays silent. |
| `announceIntervalMs` | `number` | `3000` | Minimum time between announcements. Messages in between are folded into one. |
| `peek` | `{ amount?: number; maxAmount?: number; maxGlobalNodes?: number; tokens?: readonly PeekTokenDefinition[] }` | `0.15`, `0.35`, `4000` | Peek settings. `amount` sets `--en-peek-amount`, `maxAmount` caps it (never above `0.35`). A global Token Peek is skipped on documents with more than `maxGlobalNodes` elements. `tokens` are registered at `start()`. |
| `habituation` | `false \| HabituationOptions` | by profile | Habituation settings, or `false` to disable it. |
| `reverseQuery` | `false \| ReverseQueryOptions` | by profile | Reverse query settings, or `false` to disable it. |
| `maxConcurrentTargets` | `number` | `8` | Attention budget: the most elements one preview or confirm lights. |
| `respectReducedMotion` | `boolean` | `true` | Use the motionless fallback under `prefers-reduced-motion`. `false` sets `data-en-motion="full"` on `<html>`. |
| `touchPreview` | `boolean` | `false` | Let touch pointers preview. Also drops the `(hover: hover)` gate on compiled rules. |
| `unstyled` | `boolean` | `false` | Skip `styles`. `registerEffect` still works. |
| `styles` | `readonly StyleSheetSpec[]` | `[]` | Stylesheets to inject, usually `presetStyles`. |
| `observe` | `boolean` | `true` | Watch the DOM for `data-en-*` changes. |
| `sensors` | `readonly Sensor[]` | by mode | Input sources. JS mode: pointer, focus and activation. CSS mode: activation only, plus pointer and focus once a feature needs them. |
| `autoModeLimits` | `AutoModeLimits` | `AUTO_MODE_LIMITS` | Thresholds for `mode: "auto"`. |
| `onInvalidKey` | `(token: string, el: Element) => void` | `console.warn` | Called for each malformed key in a `data-en-*` attribute. |

### `EntangledRuntime`

The object `createEntangled` returns.

```ts sig
interface EntangledRuntime {
  readonly graph: Graph<Element>;
  readonly mode: Mode;
  readonly started: boolean;
  readonly profile: Profile;
  readonly level: AttentionLevel;
  readonly querying: boolean;
  readonly peekRejections: readonly PeekRejection[];
  readonly habituation: { readonly enabled: boolean; reset(key?: Key): void; inspect(): HabituationRecord[] };
  start(): void;
  destroy(): void;
  setLevel(level: AttentionLevel): void;
  confirm(changes: ChangeInput, options?: ConfirmOptions): void;
  preview(changes: ChangeInput, options?: PreviewOptions): () => void;
  markUserIntent(): void;
  foresee(el: Element, plan: ForesightPlan, options?: ForeseeOptions): () => void;
  definePeekTokens(def: PeekTokenDefinition): () => void;
  peekWriter(el: Element, peek: ValuePeekWriter): () => void;
  peekReader(el: Element, delta: (current: unknown, next: unknown) => string | null): () => void;
  formatReader(el: Element, format: (change: Change, phase: FormatPhase) => string | null): () => void;
  onPeek(key: Key, listener: (next: unknown) => void): () => void;
  sourcesOf(el: Element): Element[];
  showSources(el: Element): () => void;
  onEvent(listener: (event: RuntimeEvent) => void): () => void;
  registerEffect(name: string, css: string): void;
  getState(el: Element): SalienceState;
}
```

Every method that returns a function returns its disposer: call it to undo
the registration. Disposers are idempotent.

#### `runtime.graph`

The writer/reader [`Graph`](#graph), kept in sync with `data-en-*`
attributes while the runtime is started.

#### `runtime.mode`

The resolved [`Mode`](#mode). Decided at `start()`; `"js"` before that. With
`mode: "auto"`, it can change from `"css"` to `"js"` once, when the graph
outgrows the CSS limits.

#### `runtime.started`

`true` between `start()` and `destroy()`.

#### `runtime.profile`

The resolved [`Profile`](#profile).

#### `runtime.level`

The current [`AttentionLevel`](#attentionlevel).

#### `runtime.setLevel()`

Switches the attention level now. Works before and after `start()`. The
level is stored in `localStorage` unless `attention.persist` is `false`; a
level set before `start()` wins over the stored one. Invalid levels are
ignored with a warning. Emits a `level` event.

```ts sig
setLevel(level: AttentionLevel): void;
```

#### `runtime.start()`

Attaches listeners, injects styles, scans the DOM and resolves the mode.
Does nothing without a DOM, or when already started.

#### `runtime.destroy()`

Detaches everything and removes what the runtime wrote to the DOM.
Habituation counts are saved first. `start()` can be called again.

#### `runtime.confirm()`

Shows an afterglow on what changed: the readers of each key and, unless
`includeWriters` is `false`, its other writers. Applied on the next frame.
Ignored before `start()` and at level `off`.

```ts sig
confirm(changes: ChangeInput, options?: ConfirmOptions): void;
```

**Throws** `InvalidKeyError` for a malformed key, `TypeError` for an unknown
change kind.

```ts
import { createEntangled } from "entangled-ui";

const runtime = createEntangled();
runtime.start();

runtime.confirm("cart:items");
runtime.confirm([{ key: "cart:total", label: "+$12" }], { origin: "self" });
```

#### `runtime.preview()`

Previews keys or changes from code until the returned function is called.
Ignored at level `off`; at `minimal`, only destructive previews show.

```ts sig
preview(changes: ChangeInput, options?: PreviewOptions): () => void;
```

**Throws** `InvalidKeyError` for a malformed key.

```ts
import { createEntangled } from "entangled-ui";

const runtime = createEntangled();
const end = runtime.preview([{ key: "clip:7", kind: "remove" }], { severity: "destructive" });
end();
```

#### `runtime.markUserIntent()`

Counts confirms in the next `originWindowMs` as `self`. Use it for input the
trusted-event listeners can't see: voice commands, gamepads, native bridges.

#### `runtime.foresee()`

Registers a writer whose changes are worked out when it is looked at.
`plan` runs as its preview starts (after the dwell, never on `pointerover`)
and returns what activating it would change now; `null` previews nothing.
The element still needs `data-en-affects` (any key that names it) so input
finds it, and usually `data-en-confirm="manual"`.

```ts sig
foresee(el: Element, plan: ForesightPlan, options?: ForeseeOptions): () => void;
```

A plan that throws previews nothing and logs a warning. Each run emits a
`foresight` event.

```ts
import { createEntangled } from "entangled-ui";

declare const undoButton: HTMLButtonElement;
declare const lastEdit: () => string | null;

const runtime = createEntangled();
runtime.foresee(undoButton, () => {
  const key = lastEdit();
  return key ? [{ key, kind: "modify" }] : null;
});
```

#### `runtime.definePeekTokens()`

Registers Token Peek tokens for a key. While a writer of the key whose
`data-en-next` names a state is previewed, each token blends a little
toward that state's value, in pure CSS. Tokens that could affect layout are
rejected with a warning and listed in `peekRejections`.

```ts sig
definePeekTokens(def: PeekTokenDefinition): () => void;
```

**Throws** `PeekTokenError` when the key is a wildcard.

```ts
import { createEntangled } from "entangled-ui";

const runtime = createEntangled();
runtime.definePeekTokens({
  key: "theme",
  tokens: {
    "--bg": { light: "#ffffff", dark: "#0b0d12" },
    "--fg": { light: "#111111", dark: "#e8e8ea" },
  },
});
```

#### `runtime.peekRejections`

Tokens `definePeekTokens` refused, with the reason. See
[`PeekRejection`](#peekrejection).

#### `runtime.peekWriter()`

Gives a writer a Value Peek: its current value and the value it would set.
Both are read when its preview starts, after the dwell.

```ts sig
peekWriter(el: Element, peek: ValuePeekWriter): () => void;
```

#### `runtime.peekReader()`

How a reader formats a Value Peek. While a writer of its key with a Value
Peek is previewed, the returned text is written to `data-en-delta` and drawn
as a chip. `null` shows nothing. `formatReader` and `Change.label` take
precedence.

```ts sig
peekReader(el: Element, delta: (current: unknown, next: unknown) => string | null): () => void;
```

#### `runtime.formatReader()`

How a reader words a change as its chip, during a preview (`phase:
"preview"`) or an afterglow (`phase: "confirm"`). Wins over `Change.label`
and `peekReader`; `null` falls back to them.

```ts sig
formatReader(el: Element, format: (change: Change, phase: FormatPhase) => string | null): () => void;
```

```ts
import { createEntangled } from "entangled-ui";

declare const total: HTMLElement;

const runtime = createEntangled();
runtime.formatReader(total, (change, phase) =>
  change.kind === "remove" ? (phase === "preview" ? "will clear" : "cleared") : null,
);
```

#### `runtime.onPeek()`

Calls `listener` with a writer's would-be value when a preview of `key`
starts, and with `undefined` when it ends. Only writers with a Value Peek
report a value.

```ts sig
onPeek(key: Key, listener: (next: unknown) => void): () => void;
```

#### `runtime.sourcesOf()`

The writers that affect `el`, up to `reverseQuery.depth` hops. Never
includes `el` itself, nor writers that only match through `*`.

```ts sig
sourcesOf(el: Element): Element[];
```

#### `runtime.showSources()`

Shows the writers that affect `el`, as a reverse query does, until the
returned function is called. Works whether or not `reverseQuery` is enabled.

```ts sig
showSources(el: Element): () => void;
```

#### `runtime.querying`

`true` while the reverse-query modifier is held.

#### `runtime.onEvent()`

Subscribes to [`RuntimeEvent`](#runtimeevent)s. DevTools is built on this.

```ts sig
onEvent(listener: (event: RuntimeEvent) => void): () => void;
```

#### `runtime.habituation`

Access to habituation counters.

| Member | Description |
|---|---|
| `enabled` | `false` when habituation is disabled. |
| `reset(key?)` | Forget the counts for `key` (every effect kind), or for every key. |
| `inspect()` | Every stored counter as a [`HabituationRecord`](#habituationrecord). Empty when disabled. |

#### `runtime.registerEffect()`

Adds or replaces an effect preset. The CSS is wrapped in
`@layer entangled.effects`; select the host with `[data-en-fx="<name>"]`
and follow the [Cue Contract](css.md#writing-an-effect).

```ts sig
registerEffect(name: string, css: string): void;
```

```ts
import { createEntangled } from "entangled-ui";

const runtime = createEntangled();
runtime.registerEffect(
  "halo",
  `[data-en-fx="halo"] {
    text-shadow: 0 0 calc(var(--en-preview) * 8px)
      color-mix(in oklab, var(--en-fx-color) calc(var(--en-preview) * var(--en-intensity) * 100%), transparent);
  }`,
);
```

#### `runtime.getState()`

What the runtime last applied to `el`. Reflects JS-driven state only:
previews drawn by compiled CSS don't appear here.

```ts sig
getState(el: Element): SalienceState;
```

### `ConfirmOptions`

Options for `runtime.confirm()`.

| Field | Type | Default | Description |
|---|---|---|---|
| `durationMs` | `number` | `confirmMs` or `remoteConfirmMs` | Afterglow length. |
| `intensity` | `number` | `1` | Strength (0-1) before the attention budget. |
| `includeWriters` | `boolean` | `EntangledOptions.includeWriters` | Also light the key's other writers: the interactions that just became available. |
| `source` | `Element \| null` | inferred | The control that caused the change; never lit itself, and used for regions. When omitted, the writer activated within the last second is used if it writes a matching key (not for `peer` changes). `null` disables the inference. |
| `waitMs` | `number` | `250` | If nothing matches yet, keep retrying each frame for this long. Covers elements a framework renders after the next frame. |
| `origin` | `Origin` | inferred | Who caused the change: `self` within `originWindowMs` of trusted input, otherwise `system`. |
| `actor` | `Actor` | | The collaborator behind a `peer` change. |
| `announce` | `string \| false` | | Live-region text for this confirm, or `false` for none. Needs `announceRemoteChanges`. |
| `notify` | `NotifyLevel` | resolved | Override the notify level for this confirm. |
| `severity` | `Severity` | | `"destructive"`: never habituates. |

### `PreviewOptions`

Options for `runtime.preview()`.

| Field | Type | Description |
|---|---|---|
| `peek` | `ValuePeek` | A Value Peek for the previewed readers' `peekReader` chips. |
| `severity` | `Severity` | `"destructive"`: drawn in the caution tone, and shown at level `minimal`. |
| `source` | `Element \| null` | The control this preview is for. Used for regions. |

### `SalienceState`

What `runtime.getState()` returns.

| Field | Type | Description |
|---|---|---|
| `state` | `Salience` | A confirm wins over a preview of the same element. |
| `intensity` | `number` | 0-1, after the attention budget and habituation. |
| `key` | `Key \| null` | The key that made the element salient. |
| `origin` | `Origin \| null` | Who caused the change, while confirming. |
| `source` | `boolean` | Shown as a source by a reverse query or `showSources`. |
| `kind` | `ChangeKind \| null` | The change kind drawn; `null` for `modify` or idle. |
| `label` | `string \| null` | The chip text shown, if any. |

### `Salience`

```ts sig
type Salience = "idle" | "preview" | "confirm";
```

### `Mode`

How preview is driven: compiled CSS rules, or JavaScript listeners.

```ts sig
type Mode = "css" | "js";
```

### `RuntimeEvent`

Events delivered to `runtime.onEvent()` listeners. Every event has `type`
and `time` (a `performance.now()` timestamp).

| `type` | Fields | When |
|---|---|---|
| `"confirm"` | `keys`, `changes`, `origin`, `actor`, `shown` | A confirm was applied. `shown` counts the elements lit. |
| `"budget"` | `key`, `kind` (`"preview" \| "confirm"`), `candidates`, `shown` | A preview or confirm reached more elements than the attention budget allows. |
| `"graph"` | | The graph changed. |
| `"query"` | `active` | A reverse query started or ended. |
| `"level"` | `level`, `previous` | The attention level changed. |
| `"foresight"` | `writer`, `changes`, `durationMs`, `cached`, `slow` | A foresight plan ran, or its cached result was reused. |
| `"deviation"` | `writer`, `foreseen`, `actual`, `unexpected`, `missing`, `mismatched` | What a foreseen writer confirmed differed from what it showed. *Experimental.* |

### `ValuePeek`

A Value Peek given as values.

| Field | Type | Description |
|---|---|---|
| `current` | `unknown` | The value now. |
| `next` | `unknown` | The value after the change. |

### `ValuePeekWriter`

A Value Peek given as functions, read when the preview starts. See
`runtime.peekWriter()`.

| Field | Type | Description |
|---|---|---|
| `current` | `() => unknown` | The value now. |
| `next` | `() => unknown` | The value the writer would set if activated. |

### `WriterResolution`

A foresight result given as keys, with a Value Peek for the readers'
chips. Use it when a plan knows the values involved, not only the keys.

| Field | Type | Description |
|---|---|---|
| `keys` | `readonly Key[]` | The keys the writer affects now. |
| `peek` | `ValuePeek` | Optional Value Peek for its readers. |

---

## Keys

### `Key`

A string naming a piece of state: segments separated by `:`. A segment is a
non-empty run of characters other than whitespace, `:` and `*`. A `*` may
only be the whole last segment.

```ts sig
type Key = string;
```

| Key | Meaning |
|---|---|
| `theme` | One piece of state. |
| `media:42` | One item of a collection. |
| `media:*` | Every key strictly below `media`. |
| `*` | Everything (the global key). |

### `GLOBAL_KEY`

The reserved key `"*"`.

```ts sig
const GLOBAL_KEY: "*";
```

### `ParsedKey`

The result of `parseKey`.

| Field | Type | Description |
|---|---|---|
| `raw` | `Key` | The key as given. |
| `segments` | `readonly string[]` | Concrete segments: `["media"]` for `media:*`, `[]` for `*`. |
| `wildcard` | `boolean` | Ends in `*` (also true for `*`). |
| `global` | `boolean` | The key is `*`. |

### `parseKey`

Parses and validates a key. Results are cached.

```ts sig
function parseKey(key: Key): ParsedKey;
```

**Throws** `InvalidKeyError` for a malformed key.

### `isValidKey`

`true` when `key` is well formed.

```ts sig
function isValidKey(key: string): boolean;
```

### `keyMatches`

Whether two keys refer to overlapping state. Symmetric: the argument order
doesn't matter.

```ts sig
function keyMatches(a: Key, b: Key): boolean;
```

- `*` matches every key.
- A concrete key matches only itself.
- `ns:*` matches every key strictly below `ns` (`ns:a`, `ns:a:b`, `ns:a:*`),
  but not `ns`.

```ts
import { keyMatches } from "entangled-ui";

keyMatches("media:*", "media:42"); // true
keyMatches("media:*", "media"); // false
keyMatches("theme", "*"); // true
```

### `splitKeys`

Splits a space-separated attribute value into distinct valid keys. Invalid
tokens are dropped and passed to `onInvalid`.

```ts sig
function splitKeys(value: string | null | undefined, onInvalid?: (token: string) => void): Key[];
```

### `InvalidKeyError`

Thrown by `parseKey` and every API that validates keys. `name` is
`"InvalidKeyError"`.

```ts sig
class InvalidKeyError extends Error {
  constructor(key: string, reason: string);
}
```

---

## Changes

### `ChangeKind`

What happens to the thing a key names.

```ts sig
type ChangeKind = "add" | "remove" | "move" | "modify" | "enable" | "disable" | "invalidate";
```

### `Change`

One change a control would make (preview) or made (confirm).

| Field | Type | Default | Description |
|---|---|---|---|
| `key` | `Key` | | The key whose readers the change reaches. |
| `kind` | `ChangeKind` | `"modify"` | How it changes. |
| `label` | `string` | | Chip text, such as `"+2.0s"`. |
| `from` | `unknown` | | Previous value, for formatters. |
| `to` | `unknown` | | New value, for formatters. |
| `certainty` | `"will" \| "may"` | `"will"` | `"may"` when the control can't know for sure. Drawn weaker. |

### `ChangeSet`

```ts sig
type ChangeSet = readonly Change[];
```

### `ChangeInput`

What `preview()` and `confirm()` accept: a key, or a list of keys and
changes.

```ts sig
type ChangeInput = Key | ReadonlyArray<Key | Change>;
```

### `FormatPhase`

Whether a chip describes a change a reader would see or one it saw.

```ts sig
type FormatPhase = "preview" | "confirm";
```

### `CHANGE_KINDS`

Every kind, in precedence order (highest first).

```ts sig
const CHANGE_KINDS: readonly ChangeKind[]; // remove, add, disable, enable, move, modify, invalidate
```

### `changeRank`

The precedence of a kind, from `remove` (7) down to `invalidate` (1).
`undefined` ranks as `modify` (2). When several changes reach one element,
the highest rank is drawn.

```ts sig
const changeRank: (kind: ChangeKind | undefined) => number;
```

### `toChanges`

Normalizes a `ChangeInput` into changes.

```ts sig
function toChanges(input: ChangeInput): Change[];
```

**Throws** `InvalidKeyError` for a malformed key, `TypeError` for an unknown
kind.

### `parseChangeAttr`

Parses a `data-en-change` value against a writer's keys. Each token is a
bare kind (every key) or `<kind>:<key>` (one key). Returns one change per
writer key. Bad tokens are passed to `onInvalid`.

```ts sig
function parseChangeAttr(value: string | null, writerKeys: readonly Key[], onInvalid?: (token: string) => void): Change[];
```

```ts
import { parseChangeAttr } from "entangled-ui";

parseChangeAttr("modify remove:clip:7", ["timeline", "clip:7"]);
// [{ key: "timeline", kind: "modify" }, { key: "clip:7", kind: "remove" }]
```

---

## Origin

### `Origin`

Who caused a change.

```ts sig
type Origin = "self" | "peer" | "system";
```

| Origin | Meaning | How it is set |
|---|---|---|
| `self` | The person using the page. | Inferred within `originWindowMs` of a trusted pointer or keyboard event. |
| `peer` | A collaborator. | Never inferred: pass it. |
| `system` | Anything else: timers, server pushes. | Inferred otherwise. |

### `Actor`

The collaborator behind a `peer` change.

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Stable identifier. |
| `name` | `string` | Shown by the actor badge and in announcements. |
| `color` | `string` | Any CSS colour. Overrides `--en-color-peer` for this actor. |

### `RemoteChange`

What an `announceRemoteChanges` formatter receives.

| Field | Type | Description |
|---|---|---|
| `keys` | `readonly Key[]` | The keys that changed. |
| `origin` | `Origin` | `peer` or `system`; `self` for confirms at notify level `interrupt`. |
| `actor` | `Actor \| undefined` | The collaborator, when known. |

### `defaultAnnouncement`

The default live-region text: `"<name> updated <keys>"`, with "A
collaborator" or "The system" when there is no name, and
`"<keys> updated"` for `self`.

```ts sig
function defaultAnnouncement(change: RemoteChange): string;
```

---

## Attention

### `Profile`

A set of defaults for a kind of product.

```ts sig
type Profile = "site" | "app";
```

- `"site"`: content pages and marketing sites.
- `"app"`: dense tools, where controls confirm manually.

### `ProfileDefaults`

What a profile sets when the matching option is omitted.

| Field | Type | Description |
|---|---|---|
| `mode` | `"css" \| "js" \| "auto"` | Runtime mode. |
| `includeWriters` | `boolean` | Default for `ConfirmOptions.includeWriters`. |
| `autoConfirm` | `boolean` | Writers without `data-en-confirm` confirm on activation. |
| `reverseQuery` | `false \| ReverseQueryOptions` | Reverse query settings. |
| `habituation` | `boolean` | Habituation on or off. |

### `PROFILE_DEFAULTS`

```ts sig
const PROFILE_DEFAULTS: Readonly<Record<Profile, ProfileDefaults>>;
```

| | `site` | `app` |
|---|---|---|
| `mode` | `"auto"` | `"js"` |
| `includeWriters` | `true` | `false` |
| `autoConfirm` | `true` | `false` |
| `reverseQuery` | `{ modifier: "Alt", depth: 1 }` | `false` |
| `habituation` | `true` | `false` |

### `AttentionLevel`

How much the page cues. A user setting, switchable at runtime.

```ts sig
type AttentionLevel = "off" | "minimal" | "standard" | "guided";
```

| Level | Behavior |
|---|---|
| `off` | Nothing previews or confirms. Listeners are detached; the graph and styles stay, so switching back is instant. |
| `minimal` | Only destructive previews. Your own confirms are dropped unless they `interrupt`; remote confirms still show. No Token Peek. |
| `standard` | Everything, as configured. |
| `guided` | Half the dwell, no habituation, and `quiet` confirms shown as `aware`. For learning a screen. |

### `ATTENTION_LEVELS`

Every level, from least to most cueing.

```ts sig
const ATTENTION_LEVELS: readonly AttentionLevel[]; // off, minimal, standard, guided
```

### `AttentionOptions`

The `attention` option.

| Field | Type | Default | Description |
|---|---|---|---|
| `level` | `AttentionLevel` | `"standard"` | The level when nothing is stored. |
| `persist` | `boolean \| { storageKey?: string }` | `true` | Store `setLevel()` in `localStorage`, under `"entangled:attention"` by default. |
| `notify` | `NotifyOptions` | | Notify levels for confirms. |

### `NotifyLevel`

How a confirm is told.

```ts sig
type NotifyLevel = "ignore" | "quiet" | "aware" | "interrupt";
```

| Level | Behavior |
|---|---|
| `ignore` | Not shown. |
| `quiet` | Half intensity, no orienting stage. |
| `aware` | The default. Remote confirms get the longer duration and are announced. |
| `interrupt` | Full intensity, longer duration, the orienting stage, announced. Never habituates. |

### `NotifyOptions`

Notify levels per origin and per key pattern.

| Field | Type | Description |
|---|---|---|
| `origins` | `Partial<Record<Origin, NotifyLevel>>` | Per origin. Unset origins are `"aware"`. |
| `keys` | `Readonly<Record<Key, NotifyLevel \| Partial<Record<Origin, NotifyLevel>>>>` | Per key pattern; wildcards allowed. The most specific matching pattern wins. The per-origin object form is *experimental*. |

```ts
import { createEntangled } from "entangled-ui";

createEntangled({
  attention: {
    notify: {
      origins: { system: "quiet" },
      keys: { "billing:*": "interrupt", "presence:*": { peer: "ignore" } },
    },
  },
});
```

### `createNotifyResolver`

Builds the function the runtime uses to resolve a notify level: the most
specific matching key pattern (exact, then longer wildcards, then `*`), then
the origin's level, then `"aware"`. Results are memoized.

```ts sig
function createNotifyResolver(notify?: NotifyOptions): (key: Key, origin: Origin) => NotifyLevel;
```

### `Severity`

A change that can't easily be taken back. Drawn in the caution tone, never
habituates, and shown at level `minimal`.

```ts sig
type Severity = "destructive";
```

---

## Foresight

### `ForesightPlan`

Works out, when a writer is looked at, what activating it would change.

```ts sig
type ForesightPlan = () => ForesightResult;
```

### `ForesightResult`

What a plan may return. `null`, `undefined` or an empty list previews
nothing.

```ts sig
type ForesightResult = ChangeInput | WriterResolution | null | undefined;
```

### `ForeseeOptions`

Options for `runtime.foresee()` and `useForesight()`.

| Field | Type | Default | Description |
|---|---|---|---|
| `severity` | `Severity` | | Draw the preview in the caution tone. |
| `revision` | `() => unknown` | | Reuse the last result while this returns the same value (`Object.is`). |
| `budgetMs` | `number` | `foresight.budgetMs` (`8`) | Plans slower than this are reported as `slow`. |
| `deviation` | `boolean` | `true` | Compare what was shown with what is then confirmed. |

### `PlannerSpec`

The three functions `createPlanner` needs.

| Field | Type | Description |
|---|---|---|
| `current` | `() => S` | The state now, as an immutable snapshot. |
| `simulate` | `(state: S, action: A) => S \| undefined` | Apply `action` without side effects; `undefined` when it can't apply. |
| `diff` | `(prev: S, next: S) => ChangeSet` | What changed between two states. |

### `createPlanner`

Turns a pure transition and a diff into a plan for any action. The returned
function gives the changes the action would make now, or `null` when it
can't apply, changes nothing, or `simulate` throws.

```ts sig
function createPlanner<S, A>(spec: PlannerSpec<S, A>): (action: A) => ChangeSet | null;
```

```ts
import { createPlanner, diffByKey } from "entangled-ui";

interface Todo {
  id: string;
  done: boolean;
}
type Action = { type: "clear-done" };

let todos: Todo[] = [];
const reduce = (state: Todo[], action: Action): Todo[] =>
  action.type === "clear-done" ? state.filter((t) => !t.done) : state;

const plan = createPlanner<Todo[], Action>({
  current: () => todos,
  simulate: reduce,
  diff: (prev, next) => diffByKey(prev, next, { id: (t) => t.id, key: (id) => `todo:${id}` }),
});

plan({ type: "clear-done" }); // [{ key: "todo:3", kind: "remove", ... }] or null
```

### `DiffByKeyOptions`

How `diffByKey` identifies and compares items.

| Field | Type | Default | Description |
|---|---|---|---|
| `id` | `(item: T) => string` | | A stable identity per item. |
| `key` | `(id: string) => Key` | | The key an item's readers use. |
| `moved` | `(prev: T, next: T, prevIndex: number, nextIndex: number) => boolean` | never | Whether an item counts as moved. |
| `modified` | `(prev: T, next: T) => boolean` | `!Object.is(prev, next)` | Whether an item counts as modified. |
| `label` | `(kind: ChangeKind, prev: T \| undefined, next: T \| undefined) => string \| undefined` | | Chip text for a change. |

### `diffByKey`

The changes between two lists of items with ids: removals first (in the old
order), then additions, moves and modifications (in the new order). For
duplicate ids, the first occurrence wins.

```ts sig
function diffByKey<T>(prev: readonly T[], next: readonly T[], options: DiffByKeyOptions<T>): Change[];
```

---

## Peek

### `PeekTokenDefinition`

Token Peek tokens for one key, as passed to `definePeekTokens` or
`peek.tokens`.

| Field | Type | Default | Description |
|---|---|---|---|
| `key` | `Key` | | A concrete key. |
| `tokens` | `Readonly<Record<string, Readonly<Record<string, string>> \| PeekTokenSpec>>` | | Custom property name to values per state. A plain map means `<color>`. |
| `initial` | `string` | first state | The state before any writer reports one with `data-en-value`. |
| `scope` | `"auto" \| "global" \| "readers"` | `"auto"` | Where the tokens live: `:root`, or the key's readers. `"auto"` is global when a reader is `<html>`/`<body>` or the key has no readers. |

### `PeekTokenSpec`

The full form of one token.

| Field | Type | Default | Description |
|---|---|---|---|
| `syntax` | `string` | `"<color>"` | `"<color>"`, `"<percentage>"` or `"<number>"`. Anything else is rejected. |
| `values` | `Readonly<Record<string, string>>` | | The token's value per state. At least two. |
| `layout` | `boolean` | | Set when the token feeds anything that affects layout; the token is then rejected. |

### `PeekSyntax`

The paint-only syntaxes a token may have.

```ts sig
type PeekSyntax = "<color>" | "<percentage>" | "<number>";
```

### `PeekToken`

An accepted token.

| Field | Type | Description |
|---|---|---|
| `name` | `string` | The custom property, such as `--bg`. |
| `syntax` | `PeekSyntax` | Its registered syntax. |
| `values` | `Readonly<Record<string, string>>` | Its value per state. |

### `PeekTokenSet`

A validated definition.

| Field | Type | Description |
|---|---|---|
| `key` | `Key` | The key. |
| `tokens` | `readonly PeekToken[]` | The accepted tokens. |
| `states` | `readonly string[]` | Every state named by any token, in first-seen order. |
| `initial` | `string \| undefined` | As defined. |
| `scope` | `"auto" \| "global" \| "readers"` | As defined. |

### `PeekRejection`

A token that was refused.

| Field | Type | Description |
|---|---|---|
| `key` | `Key` | The definition's key. |
| `token` | `string` | The token name. |
| `reason` | `string` | Why it was refused. |

### `PeekTokenError`

Thrown when a definition's key can't peek (a wildcard). `name` is
`"PeekTokenError"`.

```ts sig
class PeekTokenError extends Error {
  constructor(message: string);
}
```

### `validatePeekTokens`

Validates a definition. Token problems never throw: refused tokens are
returned in `rejected`.

```ts sig
function validatePeekTokens(def: PeekTokenDefinition): { set: PeekTokenSet; rejected: PeekRejection[] };
```

**Throws** `PeekTokenError` for a wildcard key.

A token is rejected when its name isn't a custom property, it is flagged
`layout`, its syntax isn't paint-only, it has fewer than two states, or a
value doesn't parse for its syntax or contains `;`, `{`, `}`, `<`, `>` or
`/*`.

### `PeekCompileEntry`

One key's input to `compilePeekCss`.

| Field | Type | Default | Description |
|---|---|---|---|
| `set` | `PeekTokenSet` | | Validated tokens. |
| `scope` | `"global" \| "readers"` | | The resolved scope. |
| `current` | `string` | `set.initial`, else the first state | The key's current state. |
| `peek` | `boolean` | `true` | `false` emits only the current values, with no blend on hover. |

### `PeekCompileOptions`

| Field | Type | Default | Description |
|---|---|---|---|
| `maxAmount` | `number` | `PEEK_MAX_AMOUNT` | Upper bound for `--en-peek-amount`, itself capped at `PEEK_MAX_AMOUNT`. |
| `gateHover` | `boolean` | `true` | Wrap hover rules in `@media (hover: hover)`. |
| `layer` | `string` | `"entangled.state"` | Cascade layer for the rules. |
| `habituation` | `boolean` | `false` | Scale each key's blend by `--en-pint-<key>`. |

### `compilePeekCss`

Compiles Token Peek rules. Pure and deterministic. Per token: an
`@property` registration, the current value on the scope, and the token as
a blend toward the next state. Per state: one hover and one focus rule keyed
on the writer's `data-en-next`.

```ts sig
function compilePeekCss(entries: readonly PeekCompileEntry[], options?: PeekCompileOptions): string;
```

### `peekTokensByState`

Pivots tokens grouped by state into the per-token map `tokens` expects.
Useful with theme objects such as Tailwind's.

```ts sig
function peekTokensByState(states: Readonly<Record<string, Readonly<Record<string, string>>>>): Record<string, Record<string, string>>;
```

```ts
import { peekTokensByState } from "entangled-ui";

peekTokensByState({ light: { "--bg": "#fff" }, dark: { "--bg": "#000" } });
// { "--bg": { light: "#fff", dark: "#000" } }
```

### `peekVars`

The internal base and next properties for a token: `--bg` becomes
`--en-base-bg` and `--en-next-bg`.

```ts sig
const peekVars: (token: string) => { base: string; next: string };
```

### `PEEK_AMOUNT`

The default blend toward the next state: `0.15`.

```ts sig
const PEEK_AMOUNT: 0.15;
```

### `PEEK_MAX_AMOUNT`

The hard cap on the blend: `0.35`. A peek must never be mistaken for the
change itself.

```ts sig
const PEEK_MAX_AMOUNT: 0.35;
```

### `PEEK_MAX_GLOBAL_NODES`

The default `peek.maxGlobalNodes`: `4000`. A global peek restyles the whole
document; above this many elements the blend is skipped and only the
current values apply.

```ts sig
const PEEK_MAX_GLOBAL_NODES: 4000;
```

---

## Habituation

Effects weaken as the same user keeps seeing them, and recover after a
period of non-use. The multiplier is
`max(floor, 0.5 ^ (count / halfLife))`.

### `EffectKind`

The effect families that habituate independently.

```ts sig
type EffectKind = "preview" | "peek" | "confirm";
```

### `HabituationConfig`

Resolved habituation settings.

| Field | Type | Default | Description |
|---|---|---|---|
| `halfLife` | `number` | `5` | Exposures after which an effect is at half strength. |
| `floors` | `Record<EffectKind, number>` | `{ preview: 0.2, peek: 0.5, confirm: 0.2 }` | The lowest multiplier per kind. |
| `recoveryDays` | `number` | `7` | The stored count halves after each this many days without exposure. |
| `store` | `HabituationStore` | `localStorageHabituationStore()` | Where counts live. |

### `HabituationOptions`

`HabituationConfig` with every field optional. `floors` merge per kind.

```ts sig
type HabituationOptions = Partial<Omit<HabituationConfig, "floors">> & { floors?: Partial<Record<EffectKind, number>> };
```

### `HABITUATION_DEFAULTS`

```ts sig
const HABITUATION_DEFAULTS: Readonly<Omit<HabituationConfig, "store">>;
```

### `HabituationEntry`

One stored counter.

| Field | Type | Description |
|---|---|---|
| `v` | `string` | Feature version (`""` when unversioned). |
| `n` | `number` | Exposure count, fractional after recovery. |
| `t` | `number` | Last exposure, ms since the epoch. |

### `HabituationStore`

Pluggable persistence. Every method must be synchronous and must not throw.

| Member | Description |
|---|---|
| `get(id)` | Read one counter. |
| `set(id, entry)` | Write one counter. |
| `reset(id?)` | Remove one counter, or all. |
| `keys?()` | Every stored id. Optional; used by `inspect()`. |
| `flush?()` | Write anything pending. Optional; called on `destroy()` and `pagehide`. |

### `HabituationSyncAdapter`

Cross-device sync, implemented by the app. `load` seeds the local store
once; `save` receives every debounced write. Merging keeps the higher count
and the later exposure; for different versions, the newer entry wins.

| Member | Type |
|---|---|
| `load()` | `Record<string, HabituationEntry> \| Promise<Record<string, HabituationEntry>>` |
| `save(entries)` | `(entries: Record<string, HabituationEntry>) => void` |

### `HabituationRecord`

One counter, as `inspect()` reports it.

| Field | Type | Description |
|---|---|---|
| `key` | `Key` | The key, with its version suffix if any (`export@2`). |
| `kind` | `EffectKind` | The effect family. |
| `origin` | `Origin` | Set for `confirm`: only `self` confirms habituate. |
| `count` | `number` | Exposures, after recovery. |
| `multiplier` | `number` | The current multiplier (0-1). |
| `lastSeen` | `number` | Last exposure, ms since the epoch. |

### `Habituation`

A tracker over one store, as `createHabituation` returns it.

| Member | Description |
|---|---|
| `config` | The resolved `HabituationConfig`. |
| `multiplier(key, kind, origin?)` | The current multiplier for an effect of `key`. |
| `expose(key, kind, origin?)` | Count one fully shown exposure; returns the new multiplier. |
| `reset(key?)` | Forget one key (every kind), or everything. |
| `inspect()` | Every known counter, sorted by key then kind. |
| `flush()` | Persist pending writes now. |

Peer and system confirms never habituate: `multiplier` and `expose` return
`1` for them.

### `createHabituation`

Creates a tracker. `now` is injectable for tests.

```ts sig
function createHabituation(options?: HabituationOptions, now?: () => number): Habituation;
```

### `habituationMultiplier`

`max(floor, 0.5 ^ (n / halfLife))`, rounded to three decimals; `1` when
`n` or `halfLife` isn't positive.

```ts sig
function habituationMultiplier(n: number, halfLife: number, floor: number): number;
```

### `recoveredCount`

A counter's count after recovery: halved once per full `recoveryDays` since
the last exposure.

```ts sig
function recoveredCount(entry: HabituationEntry, now: number, recoveryDays: number): number;
```

### `parseVersionedKey`

Splits a feature version off a key. Shipping `export@3` after `export@2`
starts `export` over.

```ts sig
function parseVersionedKey(key: Key): { base: string; version: string };
```

```ts
import { parseVersionedKey } from "entangled-ui";

parseVersionedKey("export@2"); // { base: "export", version: "2" }
parseVersionedKey("export"); // { base: "export", version: "" }
```

### `habituationVar`

The root custom property that carries a key's multiplier for CSS-driven
effects: `media:42` becomes `--en-int-media_3a_42` (`--en-pint-` for peek).

```ts sig
function habituationVar(key: Key, kind: "preview" | "peek"): string;
```

### `memoryHabituationStore`

A store that doesn't persist. For tests and server rendering.

```ts sig
function memoryHabituationStore(): HabituationStore;
```

### `localStorageHabituationStore`

The default store: `localStorage` with a versioned schema and debounced
writes. When storage is unavailable it keeps working in memory. Nothing
touches storage until the first access.

```ts sig
function localStorageHabituationStore(options?: LocalStorageStoreOptions): HabituationStore & { flush(): void };
```

### `LocalStorageStoreOptions`

| Field | Type | Default | Description |
|---|---|---|---|
| `storageKey` | `string` | `"entangled:habituation"` | The `localStorage` key. |
| `debounceMs` | `number` | `1000` | How long writes are batched. |
| `sync` | `HabituationSyncAdapter` | | Optional cross-device sync. |

```ts
import { type HabituationEntry, createEntangled, localStorageHabituationStore } from "entangled-ui";

declare const api: {
  load(): Promise<Record<string, HabituationEntry>>;
  save(entries: Record<string, HabituationEntry>): void;
};

createEntangled({
  habituation: {
    halfLife: 8,
    store: localStorageHabituationStore({ sync: { load: () => api.load(), save: (e) => api.save(e) } }),
  },
});
```

---

## Reverse query

### `QueryModifier`

The key that starts a reverse query while held.

```ts sig
type QueryModifier = "Alt" | "Shift" | "Control" | "Meta";
```

### `ReverseQueryOptions`

| Field | Type | Default | Description |
|---|---|---|---|
| `modifier` | `QueryModifier` | `"Alt"` | The key to hold (Option on macOS). |
| `depth` | `number` | `1` | `1`: direct writers. `2`: also the writers of keys those writers read. |

### `sourcesOf`

The writers that affect `reader` in `graph`, up to `depth` hops. Never
includes `reader`, nor writers that only match through `*`. No DOM access.

```ts sig
function sourcesOf(graph: Graph<Element>, reader: Element, depth?: number): Set<Element>;
```

### `reverseReach`

For the CSS compiler: each reader key mapped to the writer keys whose
writers show as its sources, up to `depth`.

```ts sig
function reverseReach(graph: Graph<Element>, depth?: number): Record<Key, Key[]>;
```

### `compileReverseCss`

Compiles reverse-query rules from `reverseReach` output: per reader key, a
hover and a focus rule that set `--en-source: 1` on its writers, gated on
`:root[data-en-query]`. Pure.

```ts sig
function compileReverseCss(reach: Readonly<Record<Key, readonly Key[]>>, options?: { gateHover?: boolean; layer?: string }): string;
```

### `isEditable`

Whether `el` is somewhere typing happens. A reverse query never starts
while focus is in one.

```ts sig
function isEditable(el: Element | null): boolean;
```

---

## Graph

### `createGraph`

Creates an empty graph. Nodes are opaque (`Element` by default). Lookups
cost O(segments) per key and never scan nodes.

```ts sig
function createGraph<N = Element>(): Graph<N>;
```

```ts
import { createGraph } from "entangled-ui";

const graph = createGraph<string>();
graph.addWriter("theme-toggle", ["theme"]);
graph.addReader("page", ["theme"]);
graph.readersOf("theme"); // Set { "page" }
```

### `Graph`

Writer and reader nodes indexed by key, with wildcard-aware lookups.

| Member | Description |
|---|---|
| `addWriter(node, keys, options?)` | Register `node` as a writer of `keys`. Returns an idempotent disposer. |
| `addReader(node, keys, options?)` | Register `node` as a reader of `keys`. |
| `readersOf(key)` | Readers whose keys match `key`. Cached until the next mutation. |
| `writersOf(key)` | Writers whose keys match `key`. |
| `keysOf(node, role?)` | The keys `node` is registered under; without `role`, both roles. |
| `optionsOf(node, role)` | The options of `node`'s latest registration in `role`. |
| `has(node, role?)` | Whether `node` is registered. |
| `size(role)` | The number of distinct nodes in `role`. |
| `subscribe(listener)` | Receive mutations as `GraphChange` batches, once per microtask. An add and remove in the same tick cancel out. |
| `snapshot()` | Current keys and counts as a `GraphSnapshot`. |

`addWriter` and `addReader` validate every key before mutating and throw
`InvalidKeyError` for a malformed one.

### `Role`

```ts sig
type Role = "writer" | "reader";
```

### `NodeOptions`

| Field | Type | Description |
|---|---|---|
| `effect` | `string` | Effect preset override. |
| `priority` | `number` | Attention-budget priority. Higher wins; ties keep document order. |

### `GraphChange`

One registration or disposal.

| Field | Type | Description |
|---|---|---|
| `type` | `"add" \| "remove"` | Register or dispose. |
| `role` | `Role` | The side registered on. |
| `node` | `N` | The node. |
| `keys` | `readonly Key[]` | The distinct keys of this registration. |
| `options` | `NodeOptions` | The options passed. |

### `GraphSnapshot`

Plain data, and the input to the CSS compiler.

| Field | Type | Description |
|---|---|---|
| `writerKeys` | `Key[]` | Distinct writer keys, sorted. |
| `readerKeys` | `Key[]` | Distinct reader keys, sorted. |
| `writerCounts` | `Record<Key, number>` | Writer nodes per writer key. |
| `readerCounts` | `Record<Key, number>` | Reader nodes per reader key. |

---

## Attention budget

If everything glows, nothing stands out. The budget caps how many elements
one preview or confirm lights, and lowers their intensity as the number
grows.

### `allocateBudget`

Selects up to `maxTargets` candidates by priority (ties keep input order)
and gives them all the same scaled intensity. Pass candidates in document
order to get "the first N on the page".

```ts sig
function allocateBudget<T>(candidates: readonly BudgetCandidate<T>[], options: BudgetOptions): BudgetResult<T>;
```

```ts
import { allocateBudget } from "entangled-ui";

const { active, overflow } = allocateBudget(
  [{ target: "a" }, { target: "b", priority: 1 }, { target: "c" }],
  { maxTargets: 2 },
);
// active: [{ target: "a", intensity: 1 }, { target: "b", intensity: 1 }], overflow: ["c"]
```

### `budgetIntensity`

The per-target intensity for `count` targets: full up to
`fullIntensityCount`, then `sqrt(full / count)`, never below
`minIntensity`.

```ts sig
function budgetIntensity(count: number, options?: Omit<BudgetOptions, "maxTargets">): number;
```

### `selectTop`

The `k` smallest items under `compare`, in order, with O(n log k)
comparisons. Stable.

```ts sig
function selectTop<T>(items: Iterable<T>, k: number, compare: (a: T, b: T) => number): T[];
```

### `BudgetOptions`

| Field | Type | Default | Description |
|---|---|---|---|
| `maxTargets` | `number` | | The most targets shown at once. |
| `fullIntensityCount` | `number` | `3` | Up to this many targets render at full intensity. |
| `minIntensity` | `number` | `0.35` | The lowest intensity, as a fraction of `intensity`. |
| `intensity` | `number` | `1` | The requested intensity before scaling. |

### `BudgetCandidate`

| Field | Type | Default | Description |
|---|---|---|---|
| `target` | `T` | | The element or value to light. |
| `priority` | `number` | `0` | Higher wins. |

### `BudgetResult`

| Field | Type | Description |
|---|---|---|
| `active` | `Array<{ target: T; intensity: number }>` | Selected targets, in input order. |
| `overflow` | `T[]` | Candidates dropped by the cap, in input order. |

---

## Sensors

Sensors turn input into preview and confirm intents. Each attaches a few
passive, delegated listeners to the root and never reads layout.

### `Sensor`

| Member | Description |
|---|---|
| `name` | Identifier, such as `"pointer"`. |
| `attach(ctx)` | Attach listeners; returns a detach function. |

### `SensorContext`

What the runtime gives a sensor.

| Member | Description |
|---|---|
| `root` | Where to attach listeners. |
| `options` | `{ dwellMs, touchPreview }`, read live. |
| `findWriter(target)` | The registered writer at or above `target`, or `null`. |
| `beginPreview(writer)` | Start previewing a writer's keys. |
| `endPreview(writer)` | Stop previewing them. |
| `activate(writer)` | The writer was activated: confirm it if it confirms on activation. |
| `preview(keys)` | Preview keys directly; returns a function that ends it. |

```ts
import { type Sensor, createEntangled, defaultSensors } from "entangled-ui";

const longPress: Sensor = {
  name: "long-press",
  attach(ctx) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let writer: Element | null = null;
    const down = (e: Event) => {
      writer = ctx.findWriter(e.target);
      if (writer) timer = setTimeout(() => writer && ctx.beginPreview(writer), 400);
    };
    const up = () => {
      clearTimeout(timer);
      if (writer) ctx.endPreview(writer);
      writer = null;
    };
    ctx.root.addEventListener("pointerdown", down);
    ctx.root.addEventListener("pointerup", up);
    return () => {
      up();
      ctx.root.removeEventListener("pointerdown", down);
      ctx.root.removeEventListener("pointerup", up);
    };
  },
};

createEntangled({ sensors: [...defaultSensors(), longPress] });
```

### `pointerSensor`

Hover preview after the dwell. A pointer moving faster than `maxVelocity`
restarts the dwell, so passing across a control previews nothing. Touch is
ignored unless `touchPreview` is set.

```ts sig
function pointerSensor(options?: PointerSensorOptions): Sensor;
```

### `PointerSensorOptions`

| Field | Type | Default | Description |
|---|---|---|---|
| `maxVelocity` | `number` | `1.2` | Pointer speed (px/ms) above which a hover counts as passing through. |
| `idleMs` | `number` | `60` | A pointer idle this long counts as stationary. |

### `focusSensor`

Keyboard focus (`:focus-visible`) previews like hover, without a dwell.

```ts sig
function focusSensor(): Sensor;
```

### `activationSensor`

Confirms on activation: `click` for buttons and links, `change` for form
fields. Listens in the capture phase, so a `confirm()` in an app handler
already sees the activated writer as its source.

```ts sig
function activationSensor(): Sensor;
```

### `dragSensor`

Previews while a writer is dragged (HTML drag and drop), without a dwell,
until the drag ends. A writer with `data-en-drop` previews those keys
instead of its own. Opt-in, and meant for JS mode: in CSS mode only
`data-en-drop` previews show.

```ts sig
function dragSensor(): Sensor;
```

```ts
import { createEntangled, defaultSensors, dragSensor } from "entangled-ui";

createEntangled({ mode: "js", sensors: [...defaultSensors(), dragSensor()] });
```

### `defaultSensors`

`[pointerSensor(), focusSensor(), activationSensor()]`.

```ts sig
function defaultSensors(): Sensor[];
```

### `isFocusVisible`

`el.matches(":focus-visible")`, or `true` where the selector is unsupported.

```ts sig
function isFocusVisible(el: Element): boolean;
```

---

## DOM contract

### `ATTR`

Every `data-en-*` attribute name, keyed by a short name
(`ATTR.affects === "data-en-affects"`). See [html.md](html.md) for what each
one does.

```ts sig
const ATTR: {
  readonly affects: "data-en-affects";
  readonly by: "data-en-by";
  // ...one entry per attribute in html.md
};
```

### `VARS`

The custom properties the runtime writes inline.

| Field | Property |
|---|---|
| `preview` | `--en-preview` |
| `intensity` | `--en-intensity` |
| `durationConfirm` | `--en-duration-confirm` |
| `actorColor` | `--en-actor-color` |
| `source` | `--en-source` |

### `NODE_SELECTOR`

Matches every writer and reader: `[data-en-affects],[data-en-by]`.

```ts sig
const NODE_SELECTOR: string;
```

### `WRITER_SELECTOR`

Matches every writer: `[data-en-affects]`.

```ts sig
const WRITER_SELECTOR: string;
```

### `Channel`

A visual channel a host already uses for itself, which effects avoid.

```ts sig
type Channel = "hue" | "outline" | "shadow";
```

### `Paint`

An SVG paint the `stroke` preset may colour.

```ts sig
type Paint = "stroke" | "fill";
```

### `resolveEffect`

Picks the effect preset for an element. In order: `data-en-effect`; `veil`
for `<html>` and `<body>`; `sweep` for media (`img`, `video`, `picture`,
`canvas`, `svg`, `iframe`); `stroke` for SVG graphics inside an `<svg>`;
`ring` for controls and writer-only elements; `tint` otherwise.

```ts sig
function resolveEffect(el: Element, writerOnly: boolean): string;
```

### `isGlobalSurface`

`true` for `<html>` and `<body>`: depending on them means the whole screen
is affected.

```ts sig
function isGlobalSurface(el: Element): boolean;
```

### `isMediaElement`

`true` for `img`, `video`, `picture`, `canvas`, `svg` and `iframe`.

```ts sig
function isMediaElement(el: Element): boolean;
```

### `routesToOverlay`

Whether a reader is drawn by the global overlay instead of on its own box:
`<html>`, `<body>`, or effect `veil`.

```ts sig
function routesToOverlay(el: Element, effect: string | undefined): boolean;
```

---

## Stylesheets

### `StyleSheetSpec`

A named stylesheet.

| Field | Type | Description |
|---|---|---|
| `name` | `string` | Unique name. Setting a name again replaces that sheet in place. |
| `css` | `string` | The sheet's CSS. |

### `StyleHost`

Named stylesheets in one document or shadow root.

| Member | Description |
|---|---|
| `set(name, css)` | Add or replace the sheet `name`. |
| `remove(name)` | Remove the sheet `name`. |
| `destroy()` | Remove every sheet this host added. |

### `createStyleHost`

Creates a style host. Uses constructable stylesheets (`adoptedStyleSheets`)
where supported, otherwise `<style data-en-sheet="<name>">` elements. Sheets
keep insertion order; replacing one keeps its slot.

```ts sig
function createStyleHost(root: Document | ShadowRoot): StyleHost;
```

---

## CSS compiler

In CSS mode the graph is compiled to rules, so hover and focus preview run
with no JavaScript. These functions are pure and can also run at build time.

### `compileGraphCss`

Compiles writer keys into preview rules: one hover and one focus-visible
rule per writer key, independent of how many readers exist.

```ts sig
function compileGraphCss(input: CompileInput, options?: CompileOptions): string;
```

Differences from JS mode, inherent to CSS:

- Hovering a writer nested inside another writer previews both.
- There is no pointer-velocity filter; the dwell alone filters pass-through
  hovers.

```ts
import { compileGraphCss } from "entangled-ui";

const css = compileGraphCss({ writerKeys: ["theme"], readerKeys: ["theme"] });
```

### `CompileInput`

Plain data: `graph.snapshot()` satisfies the required part.

| Field | Type | Description |
|---|---|---|
| `writerKeys` | `readonly Key[]` | Distinct writer keys. |
| `readerKeys` | `readonly Key[]` | Distinct reader keys. When given, selectors for tokens no reader uses are left out. |
| `overlayKeys` | `readonly Key[]` | Reader keys drawn by the global overlay. |
| `intensities` | `Readonly<Record<Key, number>>` | Per writer key intensity after the budget. Default `1`. |
| `overflowKeys` | `readonly Key[]` | Writer keys with readers over budget. Default: assume any. |
| `selfKeys` | `readonly Key[]` | Writer keys where a writer is also its own reader. Default: assume any. |

### `CompileOptions`

| Field | Type | Default | Description |
|---|---|---|---|
| `gateHover` | `boolean` | `true` | Wrap hover rules in `@media (hover: hover)`, so a tap doesn't leave a sticky preview. |
| `layer` | `string` | `"entangled.state"` | Cascade layer for the rules. |
| `habituation` | `boolean` | `false` | Scale intensity by `--en-int-<key>` on the root. |

### `readerSelectors`

The selectors for readers that a writer of `key` affects, mirroring
`keyMatches` in O(segments) selectors. With `present`, selectors for tokens
no reader uses are left out.

```ts sig
function readerSelectors(key: Key, present?: ReaderPresence): string[];
```

### `ReaderPresence`

| Field | Type | Description |
|---|---|---|
| `tokens` | `ReadonlySet<string>` | Reader keys as written in `data-en-by`. |
| `namespaces` | `ReadonlySet<string>` | Namespace tokens as written in `data-en-ns`. |

### `readerPresence`

Builds a `ReaderPresence` from the distinct reader keys.

```ts sig
function readerPresence(readerKeys: readonly Key[]): ReaderPresence;
```

### `namespaceTokens`

The namespaces a reader key contributes to `data-en-ns`: `a:b:c` gives
`["a", "a:b"]`, `a:b:*` gives `["a", "a:b"]`.

```ts sig
function namespaceTokens(key: Key): string[];
```

### `cssString`

Escapes a value as a double-quoted CSS string for attribute selectors.

```ts sig
function cssString(value: string): string;
```

---

## Mode selection

With `mode: "auto"`, CSS mode is chosen while its predicted cost per hover
stays within about a quarter of a frame (4 ms). In CSS mode each hover
invalidates `:root:has()` rules, and the style recalculation grows with the
document size and the number of writer keys. JS mode costs 1-3 ms per hover
regardless of size, but paints about one frame later.

### `chooseMode`

`"css"` when `:has()` works, the root is a document, and both limits hold;
otherwise `"js"`.

```ts sig
function chooseMode(input: AutoModeInput, limits?: AutoModeLimits): Mode;
```

### `weightedDomNodes`

`domNodes * (1 + writerKeys / keyWeight)`: the predicted CSS-mode hover
cost in node units.

```ts sig
function weightedDomNodes(input: AutoModeInput, limits?: AutoModeLimits): number;
```

### `AutoModeInput`

| Field | Type | Description |
|---|---|---|
| `cssCapable` | `boolean` | `:has()` is supported and the root is a document. |
| `writerKeys` | `number` | Distinct writer keys in the graph. |
| `domNodes` | `number` | Elements in the document. |

### `AutoModeLimits`

| Field | Type | Description |
|---|---|---|
| `maxWriterKeys` | `number` | Hard cap on writer keys for CSS mode. |
| `maxWeightedDomNodes` | `number` | Cap on `weightedDomNodes`. |
| `keyWeight` | `number` | Writer keys that double the per-node cost. |

### `AUTO_MODE_LIMITS`

The default limits.

```ts sig
const AUTO_MODE_LIMITS: Readonly<AutoModeLimits>; // { maxWriterKeys: 64, maxWeightedDomNodes: 1100, keyWeight: 20 }
```
