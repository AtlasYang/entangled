# HTML attributes

Every `data-en-*` attribute. **Author** attributes are the ones you write;
the runtime watches them and picks up changes. **Runtime** attributes are
written by the runtime for CSS to select on; don't set them yourself.

The React declaration fields map one to one onto the author attributes (see
[`EntangledDeclaration`](react.md#entangleddeclaration)). `ATTR` in
[core](core.md#attr) holds every name.

## Contents

| Attribute | Kind | On | Summary |
|---|---|---|---|
| [`data-en-affects`](#data-en-affects) | author | writers | Keys this control changes. |
| [`data-en-by`](#data-en-by) | author | readers | Keys this element depends on. |
| [`data-en-confirm`](#data-en-confirm) | author | writers | Confirm on activation or not. |
| [`data-en-change`](#data-en-change) | author | writers | How each key changes. |
| [`data-en-severity`](#data-en-severity) | author | writers | Marks a destructive change. |
| [`data-en-effect`](#data-en-effect) | author | any | Effect preset override. |
| [`data-en-priority`](#data-en-priority) | author | any | Attention-budget priority. |
| [`data-en-layer`](#data-en-layer) | author | any | Unlocks layered effects. |
| [`data-en-badge`](#data-en-badge) | author | readers | Shows the actor of a peer change. |
| [`data-en-channel`](#data-en-channel) | author | readers | Visual channels the host already uses. |
| [`data-en-paint`](#data-en-paint) | author | SVG readers | SVG paints the `stroke` preset may colour. |
| [`data-en-part`](#data-en-part) | author | reader descendants | A part a preset restyles. |
| [`data-en-region`](#data-en-region) | author | containers | Names a region. |
| [`data-en-value`](#data-en-value) | author | writers | Current state, for Token Peek. |
| [`data-en-next`](#data-en-next) | author | writers | Next state, for Token Peek. |
| [`data-en-drop`](#data-en-drop) | author | draggable writers | Keys previewed while dragged. |
| [`data-en-fx`](#data-en-fx) | runtime | writers, readers | The resolved preset. |
| [`data-en-state`](#data-en-state) | runtime | salient elements | `preview` or `confirm`. |
| [`data-en-origin`](#data-en-origin) | runtime | confirming elements | Who caused the change. |
| [`data-en-actor`](#data-en-actor) | runtime | confirming elements | The actor's name. |
| [`data-en-notify`](#data-en-notify) | runtime | confirming elements | `quiet` or `interrupt`. |
| [`data-en-kind`](#data-en-kind) | runtime | salient elements | The change kind drawn. |
| [`data-en-certainty`](#data-en-certainty) | runtime | salient elements | `may` for uncertain changes. |
| [`data-en-tone`](#data-en-tone) | runtime | salient elements | `caution` for destructive previews. |
| [`data-en-far`](#data-en-far) | runtime | salient elements | The cue is in another region than its cause. |
| [`data-en-delta`](#data-en-delta) | runtime | readers | Chip text. |
| [`data-en-ns`](#data-en-ns) | runtime | readers | Namespaces, for CSS-mode matching. |
| [`data-en-over`](#data-en-over) | runtime | readers | Writer keys this reader is over budget for. |
| [`data-en-overlay`](#data-en-overlay) | runtime | the overlay | Marks the global overlay. |
| [`data-en-level`](#data-en-level) | runtime | `<html>` | The attention level. |
| [`data-en-query`](#data-en-query) | runtime | `<html>` | A reverse query is active. |
| [`data-en-motion`](#data-en-motion) | runtime, author | `<html>`, containers | Opts out of the reduced-motion fallback. |
| [`data-en-sheet`](#data-en-sheet) | runtime | `<style>` | Names an injected sheet. |
| [`data-en-announcer`](#data-en-announcer) | runtime | live region | Marks the announcer. |

---

## Author attributes

### `data-en-affects`

Space-separated [keys](core.md#key) this control changes. Makes the element
a writer: hovering or focusing it previews the readers of those keys, and
activating it may confirm them. Invalid keys are dropped and reported
through `onInvalidKey`.

```html
<button data-en-affects="theme density">Compact dark mode</button>
```

### `data-en-by`

Space-separated keys this element's appearance depends on. Makes the
element a reader. An element can be both a writer and a reader. On `<html>`
or `<body>`, it is drawn by the global overlay.

```html
<span data-en-by="notifications">3 unread</span>
```

### `data-en-confirm`

Whether activating the writer confirms its keys.

| Value | Behavior |
|---|---|
| absent | Confirms on activation with `profile: "site"`; doesn't with `profile: "app"`. |
| `manual` | Never confirms on activation. Call `confirm()` when the effect happens. |
| `auto` | Confirms on activation, whatever the profile. |

Activation is `click` for buttons and links, and `change` for form fields.

### `data-en-change`

How the writer's keys change, as space-separated tokens. A bare kind applies
to every key; `<kind>:<key>` applies to one of the writer's keys and wins
over a bare kind. Kinds: `add`, `remove`, `move`, `modify`, `enable`,
`disable`, `invalidate`. Invalid tokens are reported through `onInvalidKey`.

```html
<button data-en-affects="timeline clip:7" data-en-change="modify remove:clip:7">Delete clip</button>
```

### `data-en-severity`

`destructive` marks a change that is hard to take back: its preview is drawn
in the caution tone and still shows at the `minimal` attention level.

```html
<button data-en-affects="project" data-en-change="remove" data-en-severity="destructive">Delete project</button>
```

### `data-en-effect`

The [preset](presets.md#presets) to draw this element with, overriding the
automatic choice. Any name registered with `registerEffect` works too.

```html
<li data-en-by="inbox:42" data-en-effect="row">...</li>
```

### `data-en-priority`

A number. When a preview or confirm reaches more elements than the attention
budget allows, higher priorities are kept first; ties keep document order.

### `data-en-layer`

Declares that the host is positioned and leaves its `::after` (and, for
`block`, its `::before`) to Entangled. Unlocks the layered variants of
`ring`, `sweep`, `pulse` and `block`.

```html
<div class="card" style="position: relative" data-en-by="media:42" data-en-layer>...</div>
```

### `data-en-badge`

Declares that the host is positioned and leaves its `::before` to
Entangled. During a confirm with an `actor`, the actor's name shows as a
badge in the top-right corner.

### `data-en-channel`

Space-separated visual channels the host already uses for its own states,
which effects then avoid.

| Value | Effect |
|---|---|
| `hue` | The host's colour means something (a status, a label colour): washes use a light mix of the cue colour and `--en-wash-light`, so that colour stays readable. |
| `outline` | The host uses `outline` (for selection, say): effects don't draw outlines on it, and `inset` uses a box-shadow instead. |
| `shadow` | The host uses `box-shadow`: effects add an outline instead. |

### `data-en-paint`

On SVG readers drawn by the `stroke` preset: `stroke`, `fill` or both, the
paints the preset may colour. Without it, the preset only adds a glow. Move
the element's own colours to `--en-stroke-base`, `--en-fill-base` and
`--en-stroke-width-base`, because author `stroke`/`fill` CSS overrides SVG
presentation attributes.

```html
<path data-en-by="series:revenue" data-en-paint="stroke" style="--en-stroke-base: #888" d="..." />
```

### `data-en-part`

Marks a part of a reader that some presets restyle. The only part is
`label`, which the `row` preset colours. A host that colours the label
itself moves that colour to `--en-label-base`.

```html
<li data-en-by="layer:3" data-en-effect="row"><span data-en-part="label">Background</span></li>
```

### `data-en-region`

Names a region: a panel, a sidebar, a canvas. A cue in a different region
from its cause is drawn with the far channel (`data-en-far`): an outline
that closes in, so the eye finds it.

```html
<aside data-en-region="inspector">...</aside>
<main data-en-region="canvas">...</main>
```

### `data-en-value`

The writer's current state, for Token Peek. Update it when the value
changes.

### `data-en-next`

The state the writer would switch to, for Token Peek. While the writer is
previewed, the key's peek tokens blend toward that state. Update it when
the value changes, never on hover.

```html
<button data-en-affects="theme" data-en-value="light" data-en-next="dark">Dark mode</button>
```

### `data-en-drop`

Space-separated keys a dragged writer previews instead of its own, for a
writer that is dropped somewhere other than where it applies. Needs
[`dragSensor`](core.md#dragsensor).

```html
<li draggable="true" data-en-affects="track:4" data-en-drop="playlist:*">Track 4</li>
```

---

## Runtime attributes

### `data-en-fx`

The resolved preset name, set when an element is registered (never on the
hover path). Every effect selects on it.

### `data-en-state`

`preview` while a JS-drawn preview shows, `confirm` while an afterglow runs.
Compiled CSS-mode previews don't set it.

### `data-en-origin`

`self`, `peer` or `system` while confirming: who caused the change.

### `data-en-actor`

While confirming a change with an `actor`: the actor's name, or its id.

### `data-en-notify`

While confirming at notify level `quiet` or `interrupt`. Absent for `aware`.

### `data-en-kind`

The change kind drawn on a salient element, when it isn't `modify`.

### `data-en-certainty`

`may` while drawing an uncertain change.

### `data-en-tone`

`caution` while previewing a destructive change.

### `data-en-far`

Present while a cue is in a different region from its cause.

`data-en-kind`, `data-en-certainty`, `data-en-tone` and `data-en-far` are
sticky: they stay after the effect ends, so their CSS fades out with it, and
are replaced by the next preview or confirm of the element.

### `data-en-delta`

The chip text shown on a reader: a `Change.label`, a `formatReader` result
or a Value Peek. The presets draw it on `::after`.

### `data-en-ns`

CSS mode only: the namespaces a reader's keys live in, so compiled rules can
match wildcards (`media:42` gives `media`).

### `data-en-over`

CSS mode only: the writer keys for which this reader is beyond the attention
budget, so their compiled rules skip it.

### `data-en-overlay`

Marks the single global overlay element the runtime adds while started. It
draws `veil` for global impact.

### `data-en-level`

The current attention level, on `<html>`.

### `data-en-query`

Present on `<html>` while a reverse query is held or `showSources` is
active.

### `data-en-motion`

`full` opts out of the reduced-motion fallback. The runtime sets it on
`<html>` when `respectReducedMotion` is `false`; set it on a container to
opt out one subtree.

### `data-en-sheet`

On the `<style>` elements the runtime injects where constructable
stylesheets aren't supported. Its value is the sheet name.

### `data-en-announcer`

Marks the visually hidden live region used by `announceRemoteChanges`.
