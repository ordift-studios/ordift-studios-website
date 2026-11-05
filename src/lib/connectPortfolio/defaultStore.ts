import { client } from "@/sanity/lib/client";
import { createSanityStore } from "./sanityStore";
import type { PortfolioStore } from "./store";

// The one place the real content service is attached. Server-only (the client holds the write token).
let store: PortfolioStore | null = null;
export const getStore = (): PortfolioStore => (store ??= createSanityStore(client));
