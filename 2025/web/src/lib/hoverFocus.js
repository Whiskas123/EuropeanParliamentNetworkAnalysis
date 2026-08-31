"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { familyOf } from "./families.js";

/**
 * What the cursor is pointing at, as a temporary dim over the network.
 *
 * The display panel already has one way to say "dim everything except": a
 * group or a country, chosen from a picker, kept in the URL. Every figure in
 * the sidebar is *about* some slice of the chamber — a pair of groups in the
 * matrix, a delegation on a dial, the four families in a winning coalition —
 * and pointing at one of them is the same question asked with the mouse. So
 * the answer is the same fading, borrowed for as long as the cursor stays.
 *
 * Three things follow from it being the same fading and not a new one.
 *
 * **It is never written to the URL.** A dim you chose is part of the view and
 * travels with the link; a dim that lasts as long as a hover is not a view.
 * The exports read the settings dim for the same reason: a printed sheet
 * cannot be hovering anything.
 *
 * **It replaces the settings dim rather than intersecting it.** A reader with
 * "everything except the Greens" set who points at the EPP-Renew cell is
 * asking about the EPP and Renew, and intersecting the two would answer with
 * an empty network. The chosen dim comes back untouched when the cursor
 * leaves.
 *
 * **It dims nothing when it would dim everything.** The coalition panel counts
 * the whole chamber even when the network on screen is one country, so a
 * family can be hovered that has no node here. Fading all 21 Portuguese MEPs
 * to say "no Greens" is a worse answer than not fading.
 *
 * ## Why a store rather than ordinary state
 *
 * The hover has to reach the canvas, and the shortest path — state on the page
 * component — re-renders the entire sidebar on every mouse movement between
 * two rows of a list. The panels are not cheap (the group panel walks every
 * MEP's group history), and none of them care where the cursor is. So the
 * value lives in a tiny store, the canvas subscribes to it, and everything
 * that only *sets* the focus reads a stable setter and never re-renders at
 * all.
 */

const HoverFocusContext = createContext(null);

/** A selector matches a node when every field it names matches. */
function matchesSelector(node, selector) {
  if (!selector) return false;
  if (selector.mep && node.id !== selector.mep) return false;
  if (selector.group && node.groupId !== selector.group) return false;
  if (selector.country && node.country !== selector.country) return false;
  if (selector.family && familyOf(node.groupId) !== selector.family) {
    return false;
  }
  return true;
}

/** A stable name for a set of selectors, so re-entering the same row is free. */
function keyOf(selectors) {
  return selectors
    .map((s) =>
      [s.mep || "", s.group || "", s.country || "", s.family || ""].join("~")
    )
    .join("|");
}

function createStore() {
  let focus = null;
  // Which component set the current focus. A component that unmounts while the
  // cursor is inside it — a list collapsing under the mouse, a panel swapped
  // out by a click — never gets its mouseleave, and the network would stay
  // dimmed with nothing on screen explaining why.
  let owner = null;
  const listeners = new Set();

  const emit = () => listeners.forEach((listener) => listener());

  return {
    get: () => focus,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(token, selectors) {
      const list = (selectors || []).filter(Boolean);
      const next = list.length ? { key: keyOf(list), selectors: list } : null;
      if (focus?.key === next?.key) {
        owner = next ? token : owner;
        return;
      }
      focus = next;
      owner = next ? token : null;
      emit();
    },
    clear(token) {
      // Only the component that set it may take it away: leaving one row for
      // the next fires the new row's enter before the old row's leave in some
      // orders, and a blind clear would cancel the arrival.
      if (owner !== token || focus === null) return;
      focus = null;
      owner = null;
      emit();
    },
  };
}

export function HoverFocusProvider({ children }) {
  // State with a lazy initialiser rather than a ref: the store is created once
  // and never replaced, and reading a ref during render is the one thing that
  // is not allowed to be.
  const [store] = useState(createStore);
  return (
    <HoverFocusContext.Provider value={store}>
      {children}
    </HoverFocusContext.Provider>
  );
}

/**
 * The setter side. Stable for the life of the component, so a panel that only
 * points at things never re-renders when the pointing changes.
 *
 * @returns {{on: function, set: function, clear: function}} `on(selectors)`
 *   returns the handler props to spread on a row; `set` and `clear` are there
 *   for anything that has to drive the focus from somewhere other than a hover.
 */
export function useHoverFocus() {
  const store = useContext(HoverFocusContext);
  // An identity for this component instance, and nothing else: the store hands
  // the focus back only to whoever set it.
  const [token] = useState(() => ({}));

  useEffect(() => () => store && store.clear(token), [store, token]);

  return useMemo(() => {
    const set = (selectors) => store && store.set(token, selectors);
    const clear = () => store && store.clear(token);
    return {
      set,
      clear,
      on: (selectors) => ({
        onMouseEnter: () => set(selectors),
        onMouseLeave: clear,
        // Keyboard reaches the same rows through the same buttons, and a
        // reader tabbing through a list should see what they have landed on.
        onFocus: () => set(selectors),
        onBlur: clear,
      }),
    };
  }, [store, token]);
}

/** The reader side: the current focus, or null. Only the canvas needs it. */
export function useHoverFocusValue() {
  const store = useContext(HoverFocusContext);
  return useSyncExternalStore(
    store ? store.subscribe : noopSubscribe,
    store ? store.get : noopGet,
    noopGet
  );
}

const noopSubscribe = () => () => {};
const noopGet = () => null;

/**
 * The focus as a dim the canvas already knows how to draw.
 *
 * Resolved to a set of MEP ids rather than carried as selectors, so the canvas
 * and the edge shading go on asking `isEmphasised` one question and there is
 * only ever one implementation of what "emphasised" means.
 *
 * @param {{key: string, selectors: Object[]}|null} focus
 * @param {{nodes: Object[]}|null} graphData
 * @returns {{type: "members", value: string, members: Set<string>}|null}
 */
export function focusDim(focus, graphData) {
  if (!focus || !graphData) return null;
  const members = new Set();
  for (const node of graphData.nodes || []) {
    if (focus.selectors.some((selector) => matchesSelector(node, selector))) {
      members.add(node.id);
    }
  }
  // Nothing here answers to it — see the note at the top.
  if (members.size === 0) return null;
  return { type: "members", value: `hover-${focus.key}`, members };
}
