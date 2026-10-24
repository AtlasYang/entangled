import type { Key } from "@entangled-ui/core";
import {
  Children,
  type ElementType,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
  type Ref,
  cloneElement,
  forwardRef,
  isValidElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  version,
} from "react";
import { type NodeBoundary, NodeContext } from "./context.js";
import { type EntangledDeclaration, useEntangled } from "./hooks.js";

/** An `EntangledDeclaration` plus HTML attributes for the rendered element. */
export interface EntangledNodeProps extends EntangledDeclaration, Omit<HTMLAttributes<HTMLElement>, "children"> {
  /** Content; with `asChild`, exactly one element. */
  children?: ReactNode;
  /** Merge onto the single child element instead of rendering a wrapper. */
  asChild?: boolean;
  /** Wrapper element when not `asChild`. Default `"div"`. */
  as?: ElementType;
}

// useLayoutEffect warns during SSR in React 18; effects never run there anyway.
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const REACT_19 = Number.parseInt(version, 10) >= 19;

function childRef(child: ReactElement): Ref<unknown> | undefined {
  // React 19 moved `ref` into props and warns on `element.ref`.
  return REACT_19
    ? (child.props as { ref?: Ref<unknown> }).ref
    : (child as unknown as { ref?: Ref<unknown> }).ref;
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") ref(value);
  else if (ref && typeof ref === "object") (ref as { current: T | null }).current = value;
}

type Counts = Map<Key, number>;

const bump = (m: Counts, k: Key, d: 1 | -1) => {
  const n = (m.get(k) ?? 0) + d;
  if (n > 0) m.set(k, n);
  else m.delete(k);
};

const union = (declared: string | undefined, auto: Counts) => {
  const keys = new Set(declared ? declared.split(/\s+/).filter(Boolean) : []);
  for (const k of auto.keys()) keys.add(k);
  return [...keys].join(" ");
};

/**
 * Boundary for automatic association: `useEntangledState` / `useEntangledValue`
 * calls inside it whose bind isn't spread onto an element register their key
 * on this node's element. Updates go straight to DOM attributes, with no re-render.
 */
export const EntangledNode = forwardRef<Element, EntangledNodeProps>(function EntangledNode(
  {
    asChild,
    as: Tag = "div",
    affects,
    by,
    effect,
    priority,
    layer,
    badge,
    confirm,
    value,
    next,
    drop,
    channel,
    paint,
    change,
    severity,
    children,
    ...rest
  },
  forwardedRef,
) {
  const declared = useEntangled({
    affects,
    by,
    effect,
    priority,
    layer,
    badge,
    confirm,
    value,
    next,
    drop,
    channel,
    paint,
    change,
    severity,
  });
  const el = useRef<Element | null>(null);
  const auto = useRef({ writer: new Map() as Counts, reader: new Map() as Counts });
  const declaredRef = useRef(declared);
  declaredRef.current = declared;

  const sync = useCallback(() => {
    const node = el.current;
    if (!node) return;
    const d = declaredRef.current;
    const set = (attr: string, value: string) => {
      if (value) {
        if (node.getAttribute(attr) !== value) node.setAttribute(attr, value);
      } else node.removeAttribute(attr);
    };
    set("data-en-affects", union(d["data-en-affects"], auto.current.writer));
    set("data-en-by", union(d["data-en-by"], auto.current.reader));
    // Auto writers confirm through their setter; avoid double confirms.
    if (auto.current.writer.size > 0) set("data-en-confirm", "manual");
    else set("data-en-confirm", d["data-en-confirm"] ?? "");
  }, []);

  // React writes the declared attributes; re-apply the union after each commit.
  useIsomorphicLayoutEffect(sync);

  const boundary = useMemo<NodeBoundary>(
    () => ({
      add(role, key) {
        bump(auto.current[role], key, 1);
        sync();
        return () => {
          bump(auto.current[role], key, -1);
          sync();
        };
      },
      element: () => el.current,
    }),
    [sync],
  );

  const only = asChild ? Children.only(children) : null;
  const innerRef = only && isValidElement(only) ? childRef(only) : undefined;
  const setRef = useCallback(
    (node: Element | null) => {
      el.current = node;
      assignRef(forwardedRef, node);
      assignRef(innerRef, node);
    },
    [forwardedRef, innerRef],
  );

  let rendered: ReactNode;
  if (asChild) {
    if (!isValidElement(only)) throw new Error("[entangled] <EntangledNode asChild> needs a single element child.");
    rendered = cloneElement(only as ReactElement<Record<string, unknown>>, { ...rest, ...declared, ref: setRef });
  } else {
    rendered = (
      <Tag {...rest} {...declared} ref={setRef}>
        {children}
      </Tag>
    );
  }
  return <NodeContext.Provider value={boundary}>{rendered}</NodeContext.Provider>;
});
