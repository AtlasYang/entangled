# Features

How Entangled works, one feature at a time. Each section ends with links to
the [API reference](api/README.md).

## Contents

- [Concepts](#concepts)
- [Preview](#preview)
- [Confirm](#confirm)
- [Changes](#changes)
- [Origin](#origin)
- [Effects](#effects)
- [Regions and channels](#regions-and-channels)
- [Attention](#attention)
- [Habituation](#habituation)
- [Peek](#peek)
- [Foresight](#foresight)
- [Reverse query](#reverse-query)
- [Drag and drop](#drag-and-drop)
- [Runtime modes](#runtime-modes)
- [React](#react)
- [DevTools](#devtools)
- [Guarantees](#guarantees)

---

## Concepts

Entangled draws one graph: **control → key → affected elements**.

| Term | Meaning |
|---|---|
| **Key** | A name for a piece of state: `theme`, `media:42`, `media:*`. Segments are separated by `:`; `*` may only be the whole last segment. |
| **Writer** | A control that changes a key: `data-en-affects="theme"`. |
| **Reader** | An element whose appearance depends on a key: `data-en-by="theme"`. |
| **Global key** | `*`, meaning everything. Drawn by one faint full-screen overlay instead of on each element. A reader on `<html>` or `<body>` is global too. |

```html
<button data-en-affects="notifications">Notifications</button>
<span data-en-by="notifications">3 unread</span>
```

Both attributes take space-separated lists, and an element can be a writer
and a reader at once. Matching works in both directions: a writer of
`media:*` affects a reader of `media:42`, and a reader of `media:*` is
affected by a writer of `media:42`. `media:*` does not match `media` itself.

The runtime watches the DOM, so elements added, removed or changed later
are picked up without any call.

API: [`Key`](api/core.md#key), [`keyMatches`](api/core.md#keymatches),
[`data-en-affects`](api/html.md#data-en-affects),
[`data-en-by`](api/html.md#data-en-by).

---

## Preview

Hovering a writer, or focusing it with the keyboard, highlights its readers
before anything happens.

- **Dwell.** A preview starts after the pointer rests on a control for
  `dwellMs` (120 ms). A pointer passing across a control shows nothing.
- **Keyboard.** `:focus-visible` previews immediately, exactly like hover.
- **Touch.** Touch doesn't preview by default, since there is no hover;
  set `touchPreview: true` to change that.
- **The control itself** is never highlighted by its own preview.

To preview from code, for example while a menu item is highlighted, call
`preview()` and end it with the function it returns:

```ts
import { autoStart } from "entangled-ui/auto";

const runtime = autoStart();
const end = runtime.preview("cart:items");
// later
end();
```

API: [`runtime.preview()`](api/core.md#runtimepreview),
[`dwellMs`](api/core.md#entangledoptions),
[sensors](api/core.md#sensors).

---

## Confirm

After a control is used, what it changed lights up briefly: the
**afterglow**.

- **What lights.** The readers of the control's keys, and with
  `includeWriters` (on by default for sites) the other writers of those
  keys: the interactions that just became available. The control itself
  never lights.
- **When.** Activating a writer confirms it: `click` for buttons and links,
  `change` for form fields. With `profile: "app"`, writers confirm only
  with `data-en-confirm="auto"` or from code.
- **Merging.** Confirms that overlap merge into one afterglow instead of
  restarting it.
- **Late elements.** A confirm whose elements aren't in the DOM yet keeps
  retrying for `waitMs` (250 ms), so a state update followed by `confirm()`
  works even when the framework renders a frame later.

When the effect comes later than the click, an upload for instance, mark the
writer `data-en-confirm="manual"` and confirm when it happens:

```html
<button id="upload" data-en-affects="media:*" data-en-confirm="manual">Upload</button>
```

```ts
import { autoStart } from "entangled-ui/auto";

declare function upload(): Promise<number>;

const runtime = autoStart();
const button = document.querySelector("#upload")!;
button.addEventListener("click", async () => {
  const id = await upload();
  runtime.confirm(`media:${id}`, { source: button, origin: "self" });
});
```

`source` keeps the button from lighting and anchors [regions](#regions-and-channels);
`origin: "self"` says the user caused it, since the click is long past.

API: [`runtime.confirm()`](api/core.md#runtimeconfirm),
[`ConfirmOptions`](api/core.md#confirmoptions),
[`data-en-confirm`](api/html.md#data-en-confirm).

---

## Changes

A key says *what* a control reaches. A **change** also says *how*.

| Kind | Drawn as |
|---|---|
| `modify` | The default look. |
| `add` | A `+` prefix on the chip. |
| `remove` | A dashed outline and a `−` prefix. |
| `disable`, `invalidate` | A dotted outline. |
| `move`, `enable` | The default look, with `data-en-kind` set for your own CSS. |

Every kind is distinguishable without colour, so it survives colour
blindness and forced colours. When several changes reach one element, the
strongest kind wins (`remove` first, `invalidate` last).

Writers declare kinds with `data-en-change`: a bare kind for every key, or
`<kind>:<key>` for one. `data-en-severity="destructive"` draws the preview
in the caution colour.

```html
<button data-en-affects="timeline clip:7" data-en-change="modify remove:clip:7" data-en-severity="destructive">
  Delete clip
</button>
```

From code, `preview()` and `confirm()` take changes wherever they take keys.
A `label` becomes a chip on the reader, during the preview and during the
afterglow. `certainty: "may"` is for changes the control can't be sure of (a
merge, a sync): drawn weaker, with an outlined chip.

```ts
import { autoStart } from "entangled-ui/auto";

const runtime = autoStart();
runtime.confirm([
  { key: "cart:total", label: "+$12" },
  { key: "cart:items", kind: "add" },
  { key: "shipping", certainty: "may" },
]);
```

A reader can word its own chip with `formatReader`, which wins over
`label`.

API: [`Change`](api/core.md#change), [`ChangeKind`](api/core.md#changekind),
[`data-en-change`](api/html.md#data-en-change),
[`runtime.formatReader()`](api/core.md#runtimeformatreader).

---

## Origin

Every confirm has an **origin**, and the afterglow shows it, so people
never have to wonder whether they did something.

| Origin | Set by | Afterglow |
|---|---|---|
| `self` | Inferred within 300 ms of a trusted click or key press. | `--en-color`, regular length. |
| `peer` | You, for example from a realtime sync adapter. | `--en-color-peer` or the actor's colour, longer, with an optional name badge. |
| `system` | Inferred for everything else: timers, server pushes. | `--en-color-system`, longer. |

```ts
import { autoStart } from "entangled-ui/auto";

const runtime = autoStart({ announceRemoteChanges: true });
runtime.confirm("doc:title", {
  origin: "peer",
  actor: { id: "u7", name: "Mina", color: "#e5484d" },
});
```

- **Badge.** Readers marked `data-en-badge` (positioned, no `::before` of
  their own) show the actor's name during a peer afterglow.
- **Bursts.** Remote changes of the same key coalesce into at most one
  afterglow per `coalesceMs` (2 s), and share one attention budget that
  favours what is in the viewport.
- **Orienting.** Remote afterglows start with a short outline that settles
  onto the element, which the eye notices in the periphery.
- **Announcements.** With `announceRemoteChanges`, remote changes are read
  out in a polite live region, at most once per `announceIntervalMs` (3 s).
- **Other input.** For voice commands or gamepads, which the runtime can't
  see, call `markUserIntent()` so the next confirms count as `self`.

API: [`Origin`](api/core.md#origin-1), [`Actor`](api/core.md#actor),
[`announceRemoteChanges`](api/core.md#entangledoptions),
[`data-en-badge`](api/html.md#data-en-badge).

---

## Effects

How a cue looks depends on the element. The runtime picks a preset when the
element is registered:

| Element | Preset | Look |
|---|---|---|
| `<html>`, `<body>`, the key `*` | `veil` | A faint full-screen overlay. |
| `img`, `video`, `picture`, `canvas`, `svg`, `iframe` | `sweep` | A ring and a soft glow. |
| SVG graphics inside an `<svg>` | `stroke` | A glow around the shape. |
| Controls and writer-only elements | `ring` | A two-tone ring outside the box. |
| Everything else | `tint` | A faint wash and a hairline. |

`data-en-effect` picks another one. The surface presets fit common shapes
of interface:

| Preset | For |
|---|---|
| `row` | List, inspector and menu rows. |
| `block` | Timeline clips, cards, tiles. |
| `cell` | Dense grids and tables. |
| `inset` | Hosts that clip their overflow or sit flush against neighbours. |
| `glyph` | Icons, status dots, inline text. |
| `stroke` | Chart marks, diagram edges, SVG handles. |
| `pulse`, `outline` | An expanding ring; a ring without motion. |

```html
<li data-en-by="layer:3" data-en-effect="row"><span data-en-part="label">Background</span></li>
```

**Layered hosts.** An element that is positioned and leaves its `::after`
free can opt in with `data-en-layer`: `ring` becomes a gradient ring and
`sweep` a band of light that crosses media on confirm.

**Customizing.** Change the look with tokens, in plain CSS:

```css
:root {
  --en-color: oklch(0.65 0.2 150);
  --en-duration-confirm: 1200ms;
  --en-dwell: 80ms;
}
```

For a different look altogether, write an effect against the
[Cue Contract](api/css.md#writing-an-effect) and register it with
`registerEffect`.

API: [presets](api/presets.md), [tokens](api/css.md#tokens),
[`runtime.registerEffect()`](api/core.md#runtimeregistereffect).

---

## Regions and channels

**Regions.** A cue far from its cause is easy to miss, because the user is
looking at the control. Mark the large areas of a screen with
`data-en-region`; a cue in a different region from the control that caused
it gets the **far channel**, an outline that closes in on the element.

```html
<aside data-en-region="inspector">
  <button data-en-affects="clip:7">Mute clip</button>
</aside>
<main data-en-region="timeline">
  <div data-en-by="clip:7">Clip 7</div>
</main>
```

**Channels.** Some elements already use a visual channel for their own
state: a selection outline, a status colour, a shadow. `data-en-channel`
tells effects to stay off it.

| Value | Then |
|---|---|
| `outline` | No outlines on the element; `inset` draws with a box-shadow instead. |
| `shadow` | Effects add an outline, since the element's own box-shadow wins. |
| `hue` | Washes stay light, so the element's own colour stays readable. |

To keep an element's own box-shadow alongside effects, set it as
`--en-base-shadow` instead of `box-shadow`.

API: [`data-en-region`](api/html.md#data-en-region),
[`data-en-channel`](api/html.md#data-en-channel),
[host hooks](api/css.md#host-hooks).

---

## Attention

If everything glows, nothing stands out. Four mechanisms keep cues in
proportion.

### Attention budget

One preview or confirm lights at most `maxConcurrentTargets` elements (8):
the highest `data-en-priority` first, then document order. Above three
targets, each one is drawn weaker, so the total weight on screen stays
roughly constant.

### Profiles

A profile sets defaults for a kind of product. Explicit options always win.

| | `site` (default) | `app` |
|---|---|---|
| Runtime mode | `auto` | `js` |
| Confirm on activation | yes | only with `data-en-confirm="auto"` |
| Light other writers on confirm | yes | no |
| Reverse query | Alt | off |
| Habituation | on | off |

### Attention levels

A user setting, switchable at any time and remembered in `localStorage`:

| Level | Cues |
|---|---|
| `off` | None. |
| `minimal` | Destructive previews, remote changes, and confirms that `interrupt`. |
| `standard` | Everything, as configured. The default. |
| `guided` | Everything at full strength, with half the dwell. For learning a screen. |

```ts
import { autoStart } from "entangled-ui/auto";

const runtime = autoStart({ attention: { level: "standard" } });
runtime.setLevel("minimal");
```

In React, `useAttentionLevel()` returns the level and a setter.

### Notify levels

How loudly each confirm is told, per origin and per key pattern. The most
specific pattern wins.

| Level | Afterglow |
|---|---|
| `ignore` | None. |
| `quiet` | Half strength, no orienting outline. |
| `aware` | The default. |
| `interrupt` | Full strength, longer, orienting outline, announced. Never habituates. |

```ts
import { autoStart } from "entangled-ui/auto";

autoStart({
  attention: {
    notify: {
      origins: { system: "quiet" },
      keys: { "billing:*": "interrupt" },
    },
  },
});
```

API: [`AttentionLevel`](api/core.md#attentionlevel),
[`PROFILE_DEFAULTS`](api/core.md#profile_defaults),
[`NotifyOptions`](api/core.md#notifyoptions),
[`useAttentionLevel`](api/react.md#useattentionlevel).

---

## Habituation

Cues fade as someone keeps seeing the same one, and come back after a week
without it. New users get guidance; experienced users get a quiet
interface.

- **Deterministic.** One counter per key and effect family (preview, peek,
  confirm), and a fixed curve: `max(floor, 0.5 ^ (count / 5))`.
- **Only what was seen.** A preview counts once it has fully faded in.
- **Floors.** Previews and your own confirms go down to 20%, Peek to 50%.
- **News doesn't fade.** Peer and system confirms, destructive changes and
  `interrupt` confirms never habituate.
- **Recovery.** A count halves after every seven days without exposure.
- **New versions start over.** A version suffix on a key (`export@2`)
  resets it, so a reworked feature is introduced again.
- **Private.** Only keys, counts and the time of the last exposure are
  stored, in `localStorage` by default. A sync adapter can carry them across
  devices.

```ts
import { autoStart } from "entangled-ui/auto";

const runtime = autoStart({ habituation: { halfLife: 8, recoveryDays: 14 } });
runtime.habituation.reset("export");
```

API: [habituation](api/core.md#habituation),
[`runtime.habituation`](api/core.md#runtimehabituation).

---

## Peek

A preview says *what* will change. Peek shows a little of *how*: while a
control is previewed, 15% of the future state blends into what it affects,
and never more than 35%, so it is never mistaken for the change itself.

### Token Peek

For state that maps to CSS tokens, such as a theme. Register the tokens a
key controls, and mark the writer with the state it would switch to. On
hover, the blend is pure CSS.

```ts
import { autoStart } from "entangled-ui/auto";

const runtime = autoStart();
runtime.definePeekTokens({
  key: "theme",
  tokens: {
    "--bg": { light: "#ffffff", dark: "#0b0d12" },
    "--fg": { light: "#111111", dark: "#e8e8ea" },
  },
});
```

```html
<button data-en-affects="theme" data-en-value="light" data-en-next="dark">Dark mode</button>
```

Only paint-only tokens can peek: colours, and percentages or numbers used
for opacity and filters. Anything else is rejected with a warning.

### Value Peek

For values: a chip such as `−€12` on the readers, after the dwell, without
a render.

```tsx
import { useEntangledState, useEntangledValue } from "entangled-ui/react";

const price = (discount: number) => 120 * (1 - discount / 100);

export function Discount() {
  const [, setDiscount, bind] = useEntangledState("discount", 0, { previewValue: (d) => d + 10 });
  return <button {...bind} onClick={() => setDiscount((d) => d + 10)}>Apply 10%</button>;
}

export function Total() {
  const [d, bind] = useEntangledValue("discount", 0, {
    peekDelta: (cur, next) => `−€${(price(cur) - price(next)).toFixed(2)}`,
  });
  return <strong {...bind} style={{ position: "relative" }}>€{price(d).toFixed(2)}</strong>;
}
```

The chip is drawn on the reader's `::after`, so the reader must be
positioned. For custom rendering, `usePeekValue(key)` returns the value a
previewed writer would set.

API: [`runtime.definePeekTokens()`](api/core.md#runtimedefinepeektokens),
[`PeekTokenDefinition`](api/core.md#peektokendefinition),
[`useEntangledState`](api/react.md#useentangledstate),
[`usePeekValue`](api/react.md#usepeekvalue).

---

## Foresight

Some controls can't declare what they affect ahead of time: Undo changes
whatever the last edit changed, Delete removes whatever is selected. With
**foresight**, a control works it out when it is looked at, after the
dwell, from the app's own pure functions.

`createPlanner` runs an action on a snapshot of your state and diffs the
result; `diffByKey` turns two lists into changes.

```tsx
import { createPlanner, diffByKey } from "entangled-ui";
import { useEntangle, useForesight } from "entangled-ui/react";

interface Item {
  id: string;
  done: boolean;
}
declare const store: { get(): Item[]; set(items: Item[]): void };

const clearDone = (items: Item[]) => items.filter((i) => !i.done);
const diff = (prev: Item[], next: Item[]) =>
  diffByKey(prev, next, { id: (i) => i.id, key: (id) => `item:${id}` });

const plan = createPlanner<Item[], (items: Item[]) => Item[]>({
  current: store.get,
  simulate: (items, action) => action(items),
  diff,
});

export function ClearDone() {
  const en = useEntangle();
  const bind = useForesight("items:clear-done", () => plan(clearDone), { severity: "destructive" });
  return (
    <button
      {...bind}
      onClick={() => {
        const prev = store.get();
        store.set(clearDone(prev));
        en.confirm(diff(prev, store.get()));
      }}
    >
      Clear done
    </button>
  );
}
```

- A plan runs only when the preview starts, never on every pointer move. A
  `revision` function lets it reuse its last result while the state hasn't
  changed.
- Plans slower than 8 ms are reported, in a `foresight` event and in
  DevTools.
- A foreseen control confirms manually: confirm what the action actually
  did. When that differs from what it showed, a `deviation` event says how.

Without React, use `runtime.foresee(el, plan, options)`.

API: [`runtime.foresee()`](api/core.md#runtimeforesee),
[`createPlanner`](api/core.md#createplanner),
[`diffByKey`](api/core.md#diffbykey),
[`useForesight`](api/react.md#useforesight).

---

## Reverse query

The other direction: *what controls this?* Hold Alt (Option on macOS) and
point at or focus any element: the controls that affect it get a dashed
outline. Releasing the key, pressing any other key, or leaving the window
ends it. It never starts while typing in a text field.

`depth: 2` also shows the controls of those controls, when they read keys
themselves. From code, `showSources(el)` does the same until it is
disposed, for a "Why is this here?" button.

```ts
import { autoStart } from "entangled-ui/auto";

declare const total: Element;

const runtime = autoStart({ reverseQuery: { modifier: "Shift", depth: 2 } });
const hide = runtime.showSources(total);
hide();
```

API: [`ReverseQueryOptions`](api/core.md#reversequeryoptions),
[`runtime.showSources()`](api/core.md#runtimeshowsources),
[`runtime.sourcesOf()`](api/core.md#runtimesourcesof).

---

## Drag and drop

While a writer is dragged, what it affects is where it can be dropped, so
that stays highlighted until the drag ends. A writer that is dropped
somewhere other than where it applies names the drop targets' keys in
`data-en-drop`.

```html
<li draggable="true" data-en-affects="track:4" data-en-drop="playlist:*">Track 4</li>
<ol data-en-by="playlist:main">...</ol>
```

```ts
import { defaultSensors, dragSensor } from "entangled-ui";
import { autoStart } from "entangled-ui/auto";

autoStart({ mode: "js", sensors: [...defaultSensors(), dragSensor()] });
```

API: [`dragSensor`](api/core.md#dragsensor),
[`data-en-drop`](api/html.md#data-en-drop).

---

## Runtime modes

The same graph can be drawn two ways.

| Mode | How hover previews run | Trade-off |
|---|---|---|
| `css` | The graph is compiled to `:has()` rules. No JavaScript runs on hover. | Style recalculation grows with document size and the number of writer keys. |
| `js` | Delegated listeners write a few attributes per hover. | Costs 1-3 ms per hover regardless of size, and paints about one frame later. |
| `auto` | Picks `css` while its predicted cost stays under about 4 ms per hover, else `js`. | The default for sites. Switches to `js` for good if the graph outgrows CSS. |

Confirms, chips and change kinds are drawn the same way in both. CSS mode
needs `:has()` and a document root; otherwise the runtime uses JS mode.

`root` accepts a shadow root, to run Entangled inside a web component.
Nothing touches the DOM before `start()`, so the runtime and the React
Provider are safe to create during server rendering.

API: [`EntangledOptions.mode`](api/core.md#entangledoptions),
[`chooseMode`](api/core.md#choosemode),
[CSS compiler](api/core.md#css-compiler).

---

## React

`<EntangledProvider>` owns a runtime for its subtree. Hooks declare writers
and readers as attributes, so hovering never re-renders and everything
renders on the server.

| Hook | Use |
|---|---|
| `useEntangled(declaration)` | Plain attributes for any element. |
| `useEntangledState(key, initial)` | Shared state: the setter stores the value and confirms the key. |
| `useEntangledValue(key, fallback)` | Read shared state, and mark the element as a reader. |
| `useEntangledStore(key, store, selector)` | Read an external store (Zustand, Jotai, Redux, signals). |
| `useEntangledSetter(key, setter)` | Wrap a store's setter so each call confirms. |
| `useEntangle()` | `confirm`, `preview` and the rest, imperatively. |
| `useForesight(key, plan)` | A foreseen control. |
| `usePeekValue(key)` | The value a previewed writer would set. |
| `useAttentionLevel()` | The attention level and a setter. |

```tsx
import { EntangledProvider, useEntangled, useEntangledState, useEntangledValue } from "entangled-ui/react";

function NotificationsSwitch() {
  const [on, setOn, bind] = useEntangledState("notifications", false);
  return (
    <button role="switch" aria-checked={on} {...bind} onClick={() => setOn((v) => !v)}>
      Notifications
    </button>
  );
}

function Badge() {
  const [on, bind] = useEntangledValue("notifications", false);
  return <span {...bind}>{on ? "3 unread" : "Muted"}</span>;
}

function ExportButton() {
  return <button {...useEntangled({ affects: "report" })}>Export</button>;
}

export function App() {
  return (
    <EntangledProvider>
      <NotificationsSwitch />
      <Badge />
      <ExportButton />
    </EntangledProvider>
  );
}
```

When a component can't spread a bind onto an element, wrap it in
`<EntangledNode>`: state hooks inside it register their keys on the node's
element instead.

API: [react.md](api/react.md).

---

## DevTools

A development-only overlay: every key with its writers and readers, lines
from writers to readers, the confirm log, habituation counters and lint
warnings (writers nothing reads, readers nothing writes, keys that keep
going over budget, rejected peek tokens, slow foresight plans).

```ts
import { autoStart } from "entangled-ui/auto";
import { mountDevtools } from "entangled-ui/devtools";

mountDevtools(autoStart());
```

Production builds get a no-op automatically, through the `development`
export condition. Import `entangled-ui/devtools/always` to keep it, on a
staging site for example.

API: [devtools.md](api/devtools.md).

---

## Guarantees

- **Layout never moves.** Effects use paint-only properties: shadows,
  outlines, colours, and `filter` on media. Chips and badges are absolutely
  positioned; the overlay, the announcer and DevTools are fixed. None of
  them take part in layout.
- **No layout reads.** The runtime reads attributes, never geometry. Only
  DevTools measures elements, to draw its lines.
- **Your CSS wins.** Everything lives in `@layer entangled.*`, below any
  unlayered author CSS.
- **Accessible.** Keyboard focus previews like hover. Under
  `prefers-reduced-motion`, effects become still. Under forced colours, they
  become system-colour outlines. The browser's focus ring is never
  replaced. Change kinds never rely on colour alone.
- **Deterministic.** Every cue comes from the graph you declared and the
  functions you passed. Nothing is guessed.
- **Clean teardown.** `destroy()` removes everything the runtime wrote, and
  `start()` can run again.
