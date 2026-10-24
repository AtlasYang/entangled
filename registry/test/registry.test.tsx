// @vitest-environment jsdom
import { EntangledProvider, useEntangle, useEntangledValue } from "@entangled-ui/react";
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { Button } from "../registry/entangled/entangled-button";
import { MediaCard } from "../registry/entangled/entangled-media-card";
import { Switch } from "../registry/entangled/entangled-switch";
import { ThemeToggle } from "../registry/entangled/entangled-theme-toggle";

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const $ = (sel: string) => document.querySelector(sel) as HTMLElement;
const state = (sel: string) => $(sel).getAttribute("data-en-state");
let root: Root | null = null;
let api!: ReturnType<typeof useEntangle>;

function Grab() {
  api = useEntangle();
  return null;
}

async function render(ui: React.ReactNode) {
  const el = document.createElement("div");
  document.body.append(el);
  root = createRoot(el);
  await act(async () =>
    root!.render(
      <EntangledProvider mode="js">
        <Grab />
        {ui}
      </EntangledProvider>,
    ),
  );
}
const settle = () =>
  act(async () => {
    await Promise.resolve();
    await frame();
    await frame();
  });

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  document.documentElement.classList.remove("dark");
});

describe("Button", () => {
  it("declares its keys as a layered host and rings on confirm", async () => {
    await render(
      <Button id="b" affects="export" variant="outline">
        Export
      </Button>,
    );
    expect($("#b").getAttribute("data-en-affects")).toBe("export");
    expect($("#b").hasAttribute("data-en-layer")).toBe(true);
    expect($("#b").className).toContain("relative");
    expect($("#b").getAttribute("data-en-fx")).toBe("ring");
    api.confirm("export", { source: null });
    await settle();
    expect(state("#b")).toBe("confirm");
  });
});

describe("Switch", () => {
  function Badge() {
    const [on, bind] = useEntangledValue("wifi", false);
    return (
      <span id="badge" {...bind}>
        {on ? "on" : "off"}
      </span>
    );
  }

  it("shares state by key and confirms its readers, not itself", async () => {
    const changes: boolean[] = [];
    await render(
      <>
        <Switch id="s" stateKey="wifi" aria-label="Wi-Fi" onCheckedChange={(v) => changes.push(v)} />
        <Badge />
      </>,
    );
    expect($("#s").getAttribute("aria-checked")).toBe("false");
    await act(async () => $("#s").click());
    expect($("#s").getAttribute("aria-checked")).toBe("true");
    expect($("#badge").textContent).toBe("on");
    expect(changes).toEqual([true]);
    await settle();
    expect(state("#badge")).toBe("confirm");
    expect(state("#s")).toBeNull();
  });
});

describe("ThemeToggle", () => {
  function Swatch() {
    const [theme, bind] = useEntangledValue("theme", "light");
    return <i id="swatch" data-theme={theme} {...bind} />;
  }

  it("writes theme and the global key, toggles .dark and confirms the veil", async () => {
    await render(
      <>
        <ThemeToggle id="t" />
        <Swatch />
      </>,
    );
    expect($("#t").getAttribute("data-en-affects")).toBe("theme *");
    await act(async () => $("#t").click());
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect($("#swatch").dataset.theme).toBe("dark");
    expect($("#t").getAttribute("aria-label")).toBe("Switch to light theme");
    await settle();
    expect(state("[data-en-overlay]")).toBe("confirm");
    expect(state("#swatch")).toBe("confirm");
    expect(state("#t")).toBeNull();
  });

  it("previews the veil on hover-equivalent preview", async () => {
    await render(<ThemeToggle id="t" />);
    const end = api.preview("*");
    await settle();
    expect(state("[data-en-overlay]")).toBe("preview");
    end();
  });
});

describe("MediaCard", () => {
  it("sweeps the image and rings its Edit button when the media confirms", async () => {
    await render(
      <>
        <MediaCard id="m7" mediaId={7} src="data:," alt="Sunset" onEdit={() => {}} />
        <MediaCard id="m8" mediaId={8} src="data:," alt="Harbour" onEdit={() => {}} />
      </>,
    );
    const edit = "#m7 button";
    expect($("#m7").getAttribute("data-en-by")).toBe("media:7");
    expect($("#m7").getAttribute("data-en-fx")).toBe("sweep");
    expect($(edit).getAttribute("data-en-affects")).toBe("media:7");
    api.confirm("media:7", { source: null });
    await settle();
    expect(state("#m7")).toBe("confirm");
    expect(state(edit)).toBe("confirm");
    expect(state("#m8")).toBeNull();
    expect(state("#m8 button")).toBeNull();
  });

  it("omits the Edit button without onEdit", async () => {
    await render(<MediaCard id="m" mediaId={1} src="data:," alt="x" />);
    expect($("#m button")).toBeNull();
  });
});
