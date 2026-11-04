import { describe, expect, it } from "vitest";
import { FADE_MS, SLIDE_INTERVAL_MS, initialSlides, neighbours, shouldAutoplay, slidesReducer, type PlaybackConditions, type SlideState } from "./slideshowModel";

const N = 15;
const step = (s: SlideState, delta: number) => slidesReducer(s, { type: "step", delta, count: N });

describe("the slideshow's timing constants", () => {
  it("advances every 3 seconds with a 0.7 second cross-fade", () => {
    expect(SLIDE_INTERVAL_MS).toBe(3000);
    expect(FADE_MS).toBe(700);
  });
});

describe("moving through the photographs", () => {
  it("starts on the first photograph with a single, fully visible layer", () => {
    const s = initialSlides();
    expect(s.index).toBe(0);
    expect(s.layers).toEqual([{ key: 0, index: 0, leaving: false, entering: false }]);
  });
  it("cycles continuously through all 15 and comes back to the first", () => {
    let s = initialSlides();
    const seen: number[] = [];
    for (let i = 0; i < 15; i++) { s = step(s, 1); s = slidesReducer(s, { type: "prune" }); seen.push(s.index); }
    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 0]);
    expect(new Set(seen).size).toBe(15);
  });
  it("Previous from the first goes to the last, and Next from the last goes to the first", () => {
    expect(step(initialSlides(), -1).index).toBe(14);
    expect(step({ ...initialSlides(), index: 14 }, 1).index).toBe(0);
  });
  it("a move adds a new layer that is entering and marks the old one as leaving; pruning removes the leaving layers", () => {
    const moved = step(initialSlides(), 1);
    expect(moved.layers.map((l) => [l.index, l.leaving, l.entering])).toEqual([[0, true, false], [1, false, true]]);
    const pruned = slidesReducer(moved, { type: "prune" });
    expect(pruned.layers.map((l) => l.index)).toEqual([1]);
    expect(slidesReducer(pruned, { type: "prune" })).toBe(pruned);                         // nothing to remove: same state
  });
  it("quick successive moves stack layers with unique keys and never reuse or swap one that is still fading", () => {
    let s = initialSlides();
    for (let i = 0; i < 4; i++) s = step(s, 1);
    expect(s.layers.map((l) => l.index)).toEqual([0, 1, 2, 3, 4]);
    expect(new Set(s.layers.map((l) => l.key)).size).toBe(5);
    expect(s.layers.filter((l) => !l.leaving).map((l) => l.index)).toEqual([4]);          // exactly one current layer
    expect(slidesReducer(s, { type: "prune" }).layers.map((l) => l.index)).toEqual([4]);
  });
  it("goto jumps to any photograph (wrapping), and moving to the photograph already shown changes nothing", () => {
    const s = initialSlides();
    expect(slidesReducer(s, { type: "goto", index: 7, count: N }).index).toBe(7);
    expect(slidesReducer(s, { type: "goto", index: 17, count: N }).index).toBe(2);
    expect(slidesReducer(s, { type: "goto", index: 0, count: N })).toBe(s);
  });
  it("with one photograph or none there is nothing to move to", () => {
    const s = initialSlides();
    expect(slidesReducer(s, { type: "step", delta: 1, count: 1 })).toBe(s);
    expect(slidesReducer(s, { type: "step", delta: 1, count: 0 })).toBe(s);
  });
});

describe("when the slideshow advances by itself", () => {
  const base: PlaybackConditions = { playing: true, reducedMotion: false, pressed: false, keyboardFocus: false, pageHidden: false, galleryOpen: false, count: N };
  it("advances when nothing is holding it still", () => expect(shouldAutoplay(base)).toBe(true));
  it("does not depend on the mouse pointer: nothing in the conditions describes hovering", () => expect(Object.keys(base)).not.toContain("hovering"));
  it.each([
    ["the visitor paused it", { playing: false }],
    ["reduced motion is requested", { reducedMotion: true }],
    ["it is being pressed or touched", { pressed: true }],
    ["keyboard focus is inside it", { keyboardFocus: true }],
    ["the page is hidden", { pageHidden: true }],
    ["the full gallery is open", { galleryOpen: true }],
    ["there is only one photograph", { count: 1 }],
    ["there are no photographs", { count: 0 }],
  ] as [string, Partial<PlaybackConditions>][])("holds still when %s", (_why, over) => expect(shouldAutoplay({ ...base, ...over })).toBe(false));
});

describe("fetching ahead", () => {
  it("fetches the next and the previous photograph, wrapping at the ends, and never the current one", () => {
    expect(neighbours(0, N)).toEqual([1, 14]);
    expect(neighbours(7, N)).toEqual([8, 6]);
    expect(neighbours(14, N)).toEqual([0, 13]);
    expect(neighbours(0, 2)).toEqual([1]);
    expect(neighbours(0, 1)).toEqual([]);
  });
});
