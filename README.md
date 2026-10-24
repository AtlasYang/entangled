# Entangled

**Show what a control affects, before and after you use it.**

Entangled is a small UI library that makes cause and effect visible:

- **Preview.** Hover or focus a control, and the elements it would change
  are subtly highlighted.
- **Confirm.** Use it, and what changed lights up briefly, along with the
  controls that just became available.

Both come from one graph you declare: *control → state key → affected
elements*. Nothing is inferred or guessed, and every effect is paint-only,
so layout never moves.

## Install

```sh
npm i entangled-ui
```

`entangled-ui` includes every package. React support works with React 18
and 19 and is optional.

## Quick start

Declare what a control affects, and what depends on it:

```html
<button data-en-affects="notifications">Notifications</button>
<span data-en-by="notifications">3 unread</span>
```

Start the runtime:

```ts
import { autoStart } from "entangled-ui/auto";

autoStart();
```

Hover the button and the badge is highlighted. Click it and the badge
lights up briefly. No framework or build step is required.

### With React

```tsx
import { EntangledProvider, useEntangledState, useEntangledValue } from "entangled-ui/react";

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

export function App() {
  return (
    <EntangledProvider>
      <NotificationsSwitch />
      <Badge />
    </EntangledProvider>
  );
}
```

The setter stores the value and confirms every element that reads the key.

## Documentation

| | |
|---|---|
| [Features](docs/features.md) | How everything works, one feature at a time. |
| [Guidelines](docs/guidelines.md) | When to cue, and how loudly. |
| [API reference](docs/api/README.md) | Every export, attribute, token and CSS variable. |
| [Changelog](CHANGELOG.md) | Changes per version. |

## License

[MIT](LICENSE)
