# entangled-ui

**Show what a control affects, before and after you use it.**

One install for every Entangled package:

```sh
npm i entangled-ui
```

| Import | Same as |
|---|---|
| `entangled-ui` | `@entangled-ui/core` |
| `entangled-ui/auto` | `@entangled-ui/core/auto` |
| `entangled-ui/react` | `@entangled-ui/react` (React 18 or 19) |
| `entangled-ui/presets` | `@entangled-ui/presets` |
| `entangled-ui/devtools` | `@entangled-ui/devtools` (`/devtools/always` too) |
| `entangled-ui/entangled.css`, `entangled-ui/tokens.json` | the files of `@entangled-ui/presets` |

```html
<button data-en-affects="notifications">Notifications</button>
<span data-en-by="notifications">3 unread</span>
```

```ts
import { autoStart } from "entangled-ui/auto";

autoStart();
```

Guides and the API reference: <https://github.com/AtlasYang/entangled#readme>.

## License

MIT
