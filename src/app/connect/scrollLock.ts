// Stops the page behind a full-screen layer from scrolling. A counter, not a flag: the full gallery and the enlarged photograph on top of it can both be open at once, and closing the
// top one must not release the lock the one underneath still needs.
let holders = 0;

export function acquireScrollLock(): void {
  if (holders++ === 0) document.documentElement.style.overflow = "hidden";
}

export function releaseScrollLock(): void {
  if (holders > 0 && --holders === 0) document.documentElement.style.overflow = "";
}
