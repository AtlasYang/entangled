# `@entangled-ui/react`

React bindings for React 18 and 19: a Provider that owns a runtime, hooks
that declare writers and readers, and shared state whose setter confirms
what it changed.

```ts
import { EntangledProvider, useEntangledState } from "entangled-ui/react"; // or "@entangled-ui/react"
```

Hovering never re-renders. Declarations become `data-en-*` attributes, so
everything renders on the server.

## Contents

- [Provider](#provider)
- [Declaring writers and readers](#declaring-writers-and-readers)
- [Shared state](#shared-state)
- [External stores](#external-stores)
- [Imperative access](#imperative-access)
- [Peek](#peek)
- [Foresight](#foresight)
- [Attention level](#attention-level)
- [Re-exports](#re-exports)

---

## Provider

### `EntangledProvider`

Owns one runtime for its subtree, created with `presetStyles` and the
options passed as props. Options are read once, on the first render. The
runtime starts in a mount effect and is destroyed on unmount, so the
Provider is safe to render on the server.

```ts sig
function EntangledProvider(props: EntangledProviderProps): JSX.Element;
```

```tsx
import type { ReactNode } from "react";
import { EntangledProvider } from "entangled-ui/react";

export function Root({ children }: { children: ReactNode }) {
  return <EntangledProvider profile="app">{children}</EntangledProvider>;
}
```

### `EntangledProviderProps`

Every [`EntangledOptions`](core.md#entangledoptions) field, plus:

| Prop | Type | Description |
|---|---|---|
| `children` | `ReactNode` | The subtree that can use the hooks. |
| `runtime` | `EntangledRuntime` | Use an existing runtime, for example one shared with non-React code. The Provider starts it if needed and never destroys it. Option props are ignored. |

---

## Declaring writers and readers

### `useEntangled`

Declares what an element writes or reads. Returns memoized attribute
props to spread onto it.

```ts sig
function useEntangled(declaration: EntangledDeclaration): EntangledProps;
```

```tsx
import { useEntangled } from "entangled-ui/react";

export function ExportButton() {
  return <button {...useEntangled({ affects: "report", change: "add" })}>Export</button>;
}

export function Report() {
  return <section {...useEntangled({ by: "report" })}>...</section>;
}
```

### `entangledProps`

The pure mapping behind `useEntangled`, for code outside components.

```ts sig
function entangledProps(declaration: EntangledDeclaration): EntangledProps;
```

```ts
import { entangledProps } from "entangled-ui/react";

entangledProps({ affects: { "clip:7": "remove" }, severity: "destructive" });
// { "data-en-affects": "clip:7", "data-en-change": "remove:clip:7", "data-en-severity": "destructive" }
```

### `EntangledDeclaration`

What an element writes or reads, and how its effects behave. Each field
maps to one attribute in [html.md](html.md).

| Field | Type | Attribute |
|---|---|---|
| `affects` | `Key \| readonly Key[] \| Readonly<Record<Key, ChangeKind>>` | `data-en-affects`; the record form also sets each key's kind in `data-en-change`. |
| `by` | `Key \| readonly Key[]` | `data-en-by` |
| `change` | `ChangeKind` | `data-en-change` (every key). Kinds from the `affects` record win. |
| `severity` | `Severity` | `data-en-severity` |
| `effect` | `string` | `data-en-effect` |
| `priority` | `number` | `data-en-priority` |
| `layer` | `boolean` | `data-en-layer` |
| `badge` | `boolean` | `data-en-badge` |
| `confirm` | `"auto" \| "manual"` | `data-en-confirm` |
| `value` | `string \| number \| boolean` | `data-en-value` |
| `next` | `string \| number \| boolean` | `data-en-next` |
| `drop` | `Key \| readonly Key[]` | `data-en-drop` |
| `channel` | `Channel \| readonly Channel[]` | `data-en-channel` |
| `paint` | `Paint \| readonly Paint[]` | `data-en-paint` |

### `EntangledProps`

The attributes a declaration produces. Lists are space-separated; boolean
flags are `""` when set and absent otherwise.

```ts sig
interface EntangledProps {
  "data-en-affects"?: string;
  "data-en-by"?: string;
  "data-en-effect"?: string;
  "data-en-priority"?: number;
  "data-en-layer"?: "";
  "data-en-badge"?: "";
  "data-en-confirm"?: "manual" | "auto";
  "data-en-value"?: string;
  "data-en-next"?: string;
  "data-en-drop"?: string;
  "data-en-change"?: string;
  "data-en-severity"?: "destructive";
  "data-en-channel"?: string;
  "data-en-paint"?: string;
}
```

### `EntangledBind`

Attributes plus a ref, for one element. Returned by the state hooks and
`useForesight`. When the bind of a state hook is never spread onto an
element, its key is registered on the nearest `<EntangledNode>` instead.

```ts sig
type EntangledBind = EntangledProps & { ref: RefCallback<Element> };
```

### `EntangledNode`

Renders an element with a declaration and acts as a boundary: state hooks
inside it whose bind isn't spread register their keys on this element.
Updates go straight to the DOM attributes, without a re-render. A node that
collects writer keys this way sets `data-en-confirm="manual"`, because the
setters confirm.

```ts sig
const EntangledNode: ForwardRefExoticComponent<EntangledNodeProps & RefAttributes<Element>>;
```

```tsx
import { EntangledNode, useEntangledValue } from "entangled-ui/react";

function Price() {
  const [currency] = useEntangledValue("currency", "EUR");
  return <span>{currency}</span>;
}

export function ProductCard() {
  // The card reads "currency" although Price never spreads its bind.
  return (
    <EntangledNode as="article" by="product:42">
      <Price />
    </EntangledNode>
  );
}
```

### `EntangledNodeProps`

Every `EntangledDeclaration` field and the element's HTML attributes, plus:

| Prop | Type | Default | Description |
|---|---|---|---|
| `as` | `ElementType` | `"div"` | The element to render. |
| `asChild` | `boolean` | `false` | Merge onto the single child element instead of rendering one. |
| `children` | `ReactNode` | | Content; exactly one element with `asChild`. |

**Throws** when `asChild` is set and the child isn't a single element.

---

## Shared state

Each Provider holds a small key-value store. `useEntangledState` writes a
key and confirms its readers; `useEntangledValue` reads it.

### `useEntangledState`

A writer of shared state. Calling the setter stores the value and confirms
`key`, with the bound control as the source (so it is never lit itself).
Setting an equal value (`Object.is`) does nothing. The bind sets
`data-en-confirm="manual"`, since the setter already confirms.

```ts sig
function useEntangledState<T>(
  key: Key,
  initial: T,
  options?: EntangledStateOptions<T>,
): [value: T, setValue: (next: T | ((prev: T) => T), options?: SetOptions) => void, bindWriter: EntangledBind];
```

For Peek, the bind also carries `data-en-value` and, when there is a next
value, `data-en-next` (strings, numbers and booleans only).

```tsx
import { useEntangledState } from "entangled-ui/react";

export function NotificationsSwitch() {
  const [on, setOn, bind] = useEntangledState("notifications", false);
  return (
    <button role="switch" aria-checked={on} {...bind} onClick={() => setOn((v) => !v)}>
      Notifications
    </button>
  );
}
```

### `EntangledStateOptions`

| Field | Type | Description |
|---|---|---|
| `previewValue` | `(current: T) => T` | The value the control would set next, for Peek. Booleans default to the opposite value. |

### `SetOptions`

Options for a setter call: a subset of [`ConfirmOptions`](core.md#confirmoptions).

```ts sig
type SetOptions = Pick<ConfirmOptions, "origin" | "actor" | "announce" | "intensity" | "durationMs" | "notify" | "severity">;
```

For a `peer` change, the bound control isn't used as the source.

```tsx
import { useEntangledState } from "entangled-ui/react";

export function useSharedTitle() {
  const [title, setTitle] = useEntangledState("doc:title", "Untitled");
  const applyRemote = (next: string, by: { id: string; name: string }) =>
    setTitle(next, { origin: "peer", actor: by });
  return [title, applyRemote] as const;
}
```

### `useEntangledValue`

A reader of shared state: the value for `key`, and a bind that marks the
element as depending on it. Re-renders only when the value changes.

```ts sig
function useEntangledValue<T>(key: Key): [value: T | undefined, bindReader: EntangledBind];
function useEntangledValue<T>(key: Key, fallback: T, options?: EntangledValueOptions<T>): [value: T, bindReader: EntangledBind];
```

```tsx
import { useEntangledValue } from "entangled-ui/react";

export function Badge() {
  const [on, bind] = useEntangledValue("notifications", false);
  return <span {...bind}>{on ? "3 unread" : "Muted"}</span>;
}
```

### `EntangledValueOptions`

| Field | Type | Description |
|---|---|---|
| `peekDelta` | `(current: T, next: T) => string \| null` | Value Peek: the chip this element shows while a writer of the key with a next value is previewed. Drawn on `::after`, so the element must be positioned with no `::after` of its own. `null` shows nothing. |

### `ValueStore`

The per-Provider store behind the state hooks.

| Member | Description |
|---|---|
| `has(key)` | Whether `key` has been set. |
| `get(key)` | The value for `key`, or `undefined`. |
| `set(key, value)` | Store a value; `true` when it changed (`Object.is`). |
| `subscribe(key, listener)` | Call `listener` when `key` changes; returns an unsubscribe function. |

### `createValueStore`

An empty `ValueStore`. Each Provider creates its own.

```ts sig
function createValueStore(): ValueStore;
```

---

## External stores

Keep state in Zustand, Jotai, Redux or signals, and let Entangled know which
key it is.

### `useEntangledStore`

A reader for an external store. `selector` must return a stable value
(a primitive or a memoized object), as with any `useSyncExternalStore`
selector.

```ts sig
function useEntangledStore<S, R = S>(
  key: Key,
  store: ExternalStore<S>,
  selector?: (state: S) => R,
): [value: R, bindReader: EntangledBind];
```

### `useEntangledSetter`

Wraps a store's setter so each call confirms `key`. The control that was
just activated is excluded automatically. `options` apply to every call.

```ts sig
function useEntangledSetter<A extends unknown[]>(key: Key, setter: (...args: A) => unknown, options?: SetOptions): (...args: A) => void;
```

```tsx
import { useEntangled, useEntangledSetter, useEntangledStore } from "entangled-ui/react";

interface Cart {
  count: number;
}
declare const cart: {
  subscribe(onChange: () => void): () => void;
  getState(): Cart;
  setState(next: Cart): void;
};
const cartStore = { subscribe: cart.subscribe, getSnapshot: cart.getState };

export function CartCount() {
  const [count, bind] = useEntangledStore("cart:count", cartStore, (s) => s.count);
  return <span {...bind}>{count}</span>;
}

export function AddToCart() {
  const setCart = useEntangledSetter("cart:count", cart.setState);
  return (
    <button {...useEntangled({ affects: "cart:count", confirm: "manual" })} onClick={() => setCart({ count: cart.getState().count + 1 })}>
      Add to cart
    </button>
  );
}
```

### `ExternalStore`

Anything with `subscribe` and `getSnapshot`.

| Member | Description |
|---|---|
| `subscribe(onChange)` | Call `onChange` on every change; returns an unsubscribe function. |
| `getSnapshot()` | The current state. |
| `getServerSnapshot?()` | The state during server rendering and hydration. Defaults to `getSnapshot`. |

---

## Imperative access

### `useEntangle`

The Provider's runtime and its most used methods, as a stable object.

```ts sig
function useEntangle(): EntangleApi;
```

```tsx
import { useEntangle, useEntangled } from "entangled-ui/react";

export function UploadButton({ upload }: { upload: () => Promise<number> }) {
  const en = useEntangle();
  return (
    <button
      {...useEntangled({ affects: "media:*", confirm: "manual" })}
      onClick={async (e) => {
        const button = e.currentTarget;
        const id = await upload();
        en.confirm(`media:${id}`, { source: button, origin: "self" });
      }}
    >
      Upload
    </button>
  );
}
```

The upload finishes long after the click, so the example passes
`origin: "self"`; otherwise the confirm would be inferred as `system`.

### `EntangleApi`

| Member | Same as |
|---|---|
| `confirm(changes, options?)` | `runtime.confirm()` |
| `preview(changes, options?)` | `runtime.preview()` |
| `registerEffect(name, css)` | `runtime.registerEffect()` |
| `definePeekTokens(def)` | `runtime.definePeekTokens()` |
| `setLevel(level)` | `runtime.setLevel()` |
| `foresee(el, plan, options?)` | `runtime.foresee()` |
| `runtime` | The runtime itself. |

---

## Peek

### `usePeekValue`

The value a writer of `key` would set, while it is previewed (after the
dwell); `undefined` otherwise. Only components that call this re-render,
and only inside a transition. What you render with it must not change
layout: reserve its space, or use `visibility` or `opacity`.

```ts sig
function usePeekValue<T>(key: Key): T | undefined;
```

```tsx
import { useEntangledState, usePeekValue } from "entangled-ui/react";

export function Discount() {
  const [, setDiscount, bind] = useEntangledState("discount", 0, { previewValue: (d) => d + 10 });
  return <button {...bind} onClick={() => setDiscount((d) => d + 10)}>Apply 10%</button>;
}

export function DiscountHint() {
  const next = usePeekValue<number>("discount");
  return <small style={{ visibility: next === undefined ? "hidden" : "visible" }}>{next}% off</small>;
}
```

---

## Foresight

### `useForesight`

A writer whose changes are worked out when it is looked at (after the
dwell). `plan` returns what it would change then; `null` previews nothing.
`key` names the control itself. The bind sets `data-en-confirm="manual"`:
confirm what the action actually did once it is done. Spread the bind onto
one element.

```ts sig
function useForesight(key: Key, plan: ForesightPlan, options?: ForeseeOptions): EntangledBind;
```

```tsx
import { useEntangle, useForesight } from "entangled-ui/react";

declare const history: { peek(): string | null; undo(): string | null };

export function UndoButton() {
  const en = useEntangle();
  const bind = useForesight("edit:undo", () => {
    const key = history.peek();
    return key ? [key] : null;
  });
  return (
    <button
      {...bind}
      onClick={() => {
        const key = history.undo();
        if (key) en.confirm(key);
      }}
    >
      Undo
    </button>
  );
}
```

### `foresightProps`

`useForesight` for elements a hook can't reach, such as menu items built
when a menu opens. Relies on React 19 ref cleanup; in React 18, use
`useForesight`. *Experimental.*

```ts sig
function foresightProps(
  runtime: EntangledRuntime,
  key: Key,
  plan: ForesightPlan,
  options?: ForeseeOptions,
): {
  ref: (el: Element | null) => (() => void) | undefined;
  "data-en-affects": string;
  "data-en-confirm": "manual";
  "data-en-severity"?: "destructive";
};
```

---

## Attention level

### `useAttentionLevel`

The runtime's attention level and a setter, for a "Show cues" setting.
Re-renders only when the level changes.

```ts sig
function useAttentionLevel(): [level: AttentionLevel, setLevel: (level: AttentionLevel) => void];
```

```tsx
import type { AttentionLevel } from "entangled-ui/react";
import { useAttentionLevel } from "entangled-ui/react";

export function CueSetting() {
  const [level, setLevel] = useAttentionLevel();
  return (
    <select value={level} onChange={(e) => setLevel(e.target.value as AttentionLevel)}>
      <option value="off">Off</option>
      <option value="minimal">Minimal</option>
      <option value="standard">Standard</option>
      <option value="guided">Guided</option>
    </select>
  );
}
```

---

## Re-exports

These types are re-exported from `@entangled-ui/core`, so React code needs
one import. Each links to its entry in [core.md](core.md).

- [`Actor`](core.md#actor)
- [`AttentionLevel`](core.md#attentionlevel)
- [`Change`](core.md#change)
- [`ChangeInput`](core.md#changeinput)
- [`ChangeKind`](core.md#changekind)
- [`ChangeSet`](core.md#changeset)
- [`Channel`](core.md#channel)
- [`ConfirmOptions`](core.md#confirmoptions)
- [`EntangledOptions`](core.md#entangledoptions)
- [`EntangledRuntime`](core.md#entangledruntime)
- [`ForeseeOptions`](core.md#foreseeoptions)
- [`ForesightPlan`](core.md#foresightplan)
- [`Key`](core.md#key)
- [`NotifyLevel`](core.md#notifylevel)
- [`Origin`](core.md#origin-1)
- [`Paint`](core.md#paint)
- [`PeekTokenDefinition`](core.md#peektokendefinition)
- [`PreviewOptions`](core.md#previewoptions)
- [`Profile`](core.md#profile)
- [`SalienceState`](core.md#saliencestate)
- [`Severity`](core.md#severity)
- [`ValuePeek`](core.md#valuepeek)
- [`WriterResolution`](core.md#writerresolution)
