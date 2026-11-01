// The persistent portfolio library (candidates, collections, marketing permission, internal approval, use control) depends on migrations
// 0169-0171, which are NOT applied. Nothing may read or write those tables while this is false. It is switched on only after the migrations are
// authorised, applied and verified AND the client permission wording (permissionText.ts) has been approved. Browsing existing job photographs
// (the Final Images and Jobs & Projects views) does not depend on it.
//
// ON for INTERNAL ADMINISTRATION ONLY (management authorisation, 2 Nov 2026; migrations 0168-0171 are applied). It does not authorise client-facing use: client permission requests stay
// blocked by PERMISSION_TEXT_APPROVED = false, the client portal permissions page returns not-found until both are true, and no code path publishes, sends or distributes a photograph.
export const PORTFOLIO_LIBRARY_ENABLED = true;
