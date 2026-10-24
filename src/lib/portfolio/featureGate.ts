// The persistent portfolio library (candidates, collections, marketing permission, internal approval, use control) depends on migrations
// 0169-0171, which are NOT applied. Nothing may read or write those tables while this is false. It is switched on only after the migrations are
// authorised, applied and verified AND the client permission wording (permissionText.ts) has been approved. Browsing existing job photographs
// (the Final Images and Jobs & Projects views) does not depend on it.
export const PORTFOLIO_LIBRARY_ENABLED = false;
