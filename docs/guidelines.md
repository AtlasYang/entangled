# Guidelines

Entangled makes cues cheap to add, and that is the risk: a screen where
everything glows says nothing. These are the rules the presets follow, and
the ones to follow when you declare keys.

## Declare consequences

A cue sends the eye somewhere. Declare a key only when the user would want
to look there after acting.

- **Declare what a control changes, not what it is near.** A filter button
  affects the list it filters, not the toolbar it sits in.
- **Leave out state that is only context.** A breadcrumb reflects the
  current folder, but nobody needs to look at it after each navigation.
- **Don't cue decoration.** An element that lights on every hover of a
  static control is noise.

## Name keys after state

- **One key per piece of state.** `theme`, `cart:items`, `clip:7`.
- **Use namespaces for collections.** A reader of `clip:7` lights for a
  writer of `clip:*`, and a reader of `clip:*` for a writer of `clip:7`.
  Keep concrete keys for the parts that matter on their own.
- **Use `*` only for what really affects everything**, such as a theme. It
  is drawn as one full-screen veil, never per element.
- **Version keys you rework.** Shipping `export@2` resets habituation for
  `export`, so returning users see the cue again.

## Say how, not only what

A key says what a control reaches. A [change](features.md#changes) also
says how.

- **Give removals, additions and disabling their kind.** They are drawn
  with forms (dashed, dotted, `+` and `−`) that don't rely on colour.
- **Mark irreversible actions `destructive`.** They are drawn in the
  caution colour, never habituate, and still show at the `minimal`
  attention level.
- **Use `certainty: "may"` when the control can't know.** A merge or a sync
  is drawn weaker, with an outlined chip, instead of promising a result.
- **Keep labels short.** A chip is a few characters: `+2.0s`, `−$12`,
  `+3`. Longer text belongs in the interface itself.

## Keep cues in proportion

- **Let the attention budget work.** It caps how many elements light at
  once and weakens them as the count grows. Raise `data-en-priority` on the
  few elements that matter most rather than raising the cap.
- **Narrow keys that keep going over budget.** DevTools lints them: if a
  key reaches dozens of elements on every hover, it is probably too broad.
- **Use notify levels, not custom durations.** Make background updates
  `quiet` and critical ones `interrupt`, per key pattern or origin.
- **Let habituation work.** Your own actions fade as they become familiar;
  remote changes are news and don't.

## Place cues where they are seen

- **Mark regions on screens with distant panels.** A cue in another region
  from its cause gets the far channel, so it isn't missed while the user
  looks at the control.
- **Tell effects which channels an element already uses.** An element that
  shows selection with an outline gets `data-en-channel="outline"`, so the
  effect and the element don't fight over it.
- **Pick the preset that fits the surface.** `row` for rows, `cell` for
  grids, `inset` for anything that clips or sits flush, `glyph` for icons.
  The default ring outside the box is wrong for all of them.

## Writing your own effects

Follow the [Cue Contract](api/css.md#writing-an-effect). The rules that are
easiest to break:

- **Paint only.** Never a property that moves layout, not even for a
  frame.
- **Fade toward transparent.** Scale alpha, width or blur by
  `--en-intensity`, but never mix the cue colour toward another opaque
  colour by intensity: a budgeted effect then turns muddy instead of
  fainter.
- **Idle means untouched.** With no preview and no confirm, the element
  must look exactly as it did without Entangled.

## Anti-patterns

| Anti-pattern | Why it hurts | Instead |
|---|---|---|
| Everything glows | Nothing stands out, and users learn to ignore cues. | Declare consequences only; let the budget cap the rest. |
| Cues on context-only state | The eye is sent somewhere with nothing to learn. | Leave it out of the graph. |
| Colour as the only meaning | Lost to colour blindness and forced colours. | Change kinds: dashed, dotted, `+` and `−`. |
| A cue far from its cause, unmarked | The user is looking at the control and misses it. | `data-en-region` on panels. |
| The element's own outline on a cued element | The effect and the element overwrite each other. | `data-en-channel="outline"`. |
| An element's own `box-shadow` | It hides box-shadow effects. | Move it to `--en-base-shadow`. |
| Confirming before the effect happens | The afterglow lights the old state. | `data-en-confirm="manual"`, and confirm when the change lands. |

## Let users decide

Offer the [attention level](features.md#attention-levels) as a setting.
Someone who knows the screen may want `minimal`, someone learning it
`guided`, and some people `off`.
