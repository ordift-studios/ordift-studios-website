// The slideshow's rules, kept pure (no React, no timers, no DOM) so they can be tested exactly.

export const SLIDE_INTERVAL_MS = 3000;     // each photograph stays for 3 seconds
export const FADE_MS = 700;                // cross-fade between photographs

// A "layer" is one photograph on the stage. Moving to another photograph stacks a new layer on top (it fades in) and marks the others as leaving (they fade out); the leaving layers are
// removed once the fade has finished. Because every move simply adds a layer, tapping Next several times quickly never swaps a picture in the middle of a fade.
export type Layer = { key: number; index: number; leaving: boolean; entering: boolean };
export type SlideState = { index: number; layers: Layer[]; nextKey: number };
export type SlideAction = { type: "step"; delta: number; count: number } | { type: "goto"; index: number; count: number } | { type: "prune" };

export const initialSlides = (): SlideState => ({ index: 0, layers: [{ key: 0, index: 0, leaving: false, entering: false }], nextKey: 1 });

const wrap = (i: number, count: number): number => ((i % count) + count) % count;

function moveTo(state: SlideState, target: number): SlideState {
  if (target === state.index) return state;
  const layers = state.layers.map((l) => (l.leaving ? l : { ...l, leaving: true }));
  return { index: target, layers: [...layers, { key: state.nextKey, index: target, leaving: false, entering: true }], nextKey: state.nextKey + 1 };
}

export function slidesReducer(state: SlideState, action: SlideAction): SlideState {
  switch (action.type) {
    case "step":
      return action.count < 2 ? state : moveTo(state, wrap(state.index + action.delta, action.count));
    case "goto":
      return action.count < 1 ? state : moveTo(state, wrap(action.index, action.count));
    case "prune":
      return state.layers.some((l) => l.leaving) ? { ...state, layers: state.layers.filter((l) => !l.leaving) } : state;
  }
}

// Whether the slideshow should be advancing by itself right now. Every reason to hold still is listed here, so each one can be tested on its own:
//   - the visitor paused it, or prefers reduced motion (then it only moves when asked);
//   - it is being pressed or touched, or keyboard focus is inside it (the visitor is interacting). Merely having the mouse over it does NOT hold it: opening the slideshow scrolls it under
//     a mouse pointer that has not moved, which would stall it before it had started;
//   - the page is hidden (another tab or app in front);
//   - the full gallery is open;
//   - there is nothing to advance to.
export type PlaybackConditions = { playing: boolean; reducedMotion: boolean; pressed: boolean; keyboardFocus: boolean; pageHidden: boolean; galleryOpen: boolean; count: number };
export const shouldAutoplay = (c: PlaybackConditions): boolean =>
  c.count > 1 && c.playing && !c.reducedMotion && !c.pressed && !c.keyboardFocus && !c.pageHidden && !c.galleryOpen;

// The photographs worth fetching ahead of time: the one that follows, and the one before (for Previous). Never the current one, never a repeat.
export const neighbours = (index: number, count: number): number[] => {
  if (count < 2) return [];
  return [...new Set([wrap(index + 1, count), wrap(index - 1, count)])].filter((i) => i !== index);
};
