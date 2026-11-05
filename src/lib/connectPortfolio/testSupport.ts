import { MemoryStore } from "./memoryStore";
import type { Deps } from "./service";
import type { UploadRef } from "./model";
import type { ImageAssetInfo } from "./store";

// Shared helpers for the manager's tests (not used by the application).
export const hex = (n: number) => n.toString(16).padStart(40, "0");
export const upload = (n = 1, over: Partial<UploadRef> = {}): UploadRef => ({
  assetId: `image-${hex(n)}-2000x1500-jpg`, url: `https://cdn.sanity.io/images/proj/prod/${hex(n)}-2000x1500.jpg`, width: 2000, height: 1500, color: "#334455", filename: `photo-${n}.jpg`, ...over,
});
export const asset = (n = 1, over: Partial<ImageAssetInfo> = {}): ImageAssetInfo => ({ ...upload(n), mimeType: "image/jpeg", ...over });
export const ALT = "A woman in a red dress poses on a rocky outcrop against a clear blue sky";

export function testDeps(store = new MemoryStore()): Deps & { store: MemoryStore } {
  let k = 0, r = 0, t = 0;
  return { store, newKey: () => `u-key-${++k}`, newRevisionId: () => `connectPortfolioRevision.test-${++r}`, now: () => new Date(Date.UTC(2026, 10, 5, 10, 0, ++t)).toISOString() };
}
export const register = (store: MemoryStore, n: number, over: Partial<ImageAssetInfo> = {}) => { const a = asset(n, over); store.assets.set(a.assetId, a); return a; };
