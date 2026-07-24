// Configurable budget ranges — approved 2026-07-23. Deliberately no
// currency symbols or fixed amounts: pricing structure hasn't been
// approved yet, and Ghana/Qatar projects will likely need different
// currencies and brackets anyway. This file is the one place to edit
// once real ranges are approved (or move to Sanity `siteSettings` once
// the CMS is wired — same shape, same import site).

export const BUDGET_RANGES = [
  { value: "small", label: "Small project" },
  { value: "standard", label: "Standard project" },
  { value: "large", label: "Large / campaign project" },
  { value: "other", label: "Other / not sure yet" },
] as const;

export type BudgetRangeValue = (typeof BUDGET_RANGES)[number]["value"];

export function isBudgetRangeValue(value: string): value is BudgetRangeValue {
  return BUDGET_RANGES.some((b) => b.value === value);
}

export function budgetRangeLabel(value: string): string {
  return BUDGET_RANGES.find((b) => b.value === value)?.label ?? value;
}
