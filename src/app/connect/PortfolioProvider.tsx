"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { ConnectImage } from "./gallery";

// Shares one small piece of state between the View Portfolio button (in the main options) and the slideshow section further down the page: whether the visitor has asked to see the portfolio.
// Nothing about the photographs is loaded or rendered until they do, so the page opens quickly and the slideshow starts from the first photograph when requested. `token` increases on every
// request, so tapping View Portfolio again scrolls back to the slideshow and starts it again.
type PortfolioState = { images: ConnectImage[]; revealed: boolean; token: number; open: () => void };

const PortfolioContext = createContext<PortfolioState | null>(null);

export function PortfolioProvider({ images, children }: { images: ConnectImage[]; children: ReactNode }) {
  const [token, setToken] = useState(0);
  const open = useCallback(() => setToken((t) => t + 1), []);
  const value = useMemo<PortfolioState>(() => ({ images, revealed: token > 0, token, open }), [images, token, open]);
  return <PortfolioContext.Provider value={value}>{children}</PortfolioContext.Provider>;
}

export function usePortfolio(): PortfolioState {
  const ctx = useContext(PortfolioContext);
  if (!ctx) throw new Error("usePortfolio must be used inside <PortfolioProvider>");
  return ctx;
}
