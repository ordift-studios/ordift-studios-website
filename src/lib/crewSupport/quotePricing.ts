// Crew Support quote proposal (Phase 2). Pure: turns a request's crew
// requirements into proposed quotation lines from GOVERNED selling rates
// only. Where no governed rate exists the line is a clearly marked manual
// placeholder with NO price — nothing is estimated or invented. Crew cost
// is never an input and never appears here.

export type GovernedRate = { titleId: string; unitBasis: "hour" | "half_day" | "full_day"; priceUsd: number };
export type ProposalRequirement = { id: string; titleId: string | null; roleLabel: string; quantity: number };

export type ProposedLine = {
  requirementId: string | null;
  serviceItem: string;
  description: string;
  quantity: number;
  unitBasis: string;
  sellingRate: number;
  sourceType: "pricing" | "manual";
  sourceReference: string | null;
  governedUnitPrice: number | null;
  noGovernedRate: boolean;
};

export function inclusiveDays(startDate: string, endDate: string): number {
  const ms = Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`);
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
}

export function proposeQuoteLines(params: {
  requirements: ProposalRequirement[];
  days: number;
  rates: GovernedRate[];
  marketName: string;
  urgent: boolean;
  urgentUpliftPercent: number | null;
}): ProposedLine[] {
  const lines: ProposedLine[] = params.requirements.map((req) => {
    const rate = req.titleId ? params.rates.find((r) => r.titleId === req.titleId && r.unitBasis === "full_day") : undefined;
    const description = `${req.quantity} × ${req.roleLabel}, ${params.days} day${params.days === 1 ? "" : "s"}`;
    if (rate) {
      return {
        requirementId: req.id,
        serviceItem: req.roleLabel,
        description,
        quantity: req.quantity * params.days,
        unitBasis: "full_day",
        sellingRate: rate.priceUsd,
        sourceType: "pricing",
        sourceReference: `Crew Support Rates: ${req.roleLabel}, ${params.marketName}, full day`,
        governedUnitPrice: rate.priceUsd,
        noGovernedRate: false,
      };
    }
    return {
      requirementId: req.id,
      serviceItem: req.roleLabel,
      description,
      quantity: req.quantity * params.days,
      unitBasis: "full_day",
      sellingRate: 0,
      sourceType: "manual",
      sourceReference: null,
      governedUnitPrice: null,
      noGovernedRate: true,
    };
  });

  const governedSubtotal = lines.filter((l) => l.sourceType === "pricing").reduce((sum, l) => sum + l.quantity * l.sellingRate, 0);
  if (params.urgent && params.urgentUpliftPercent && governedSubtotal > 0) {
    const uplift = Math.round(governedSubtotal * (params.urgentUpliftPercent / 100) * 100) / 100;
    lines.push({
      requirementId: null,
      serviceItem: "Urgent request uplift",
      description: `${params.urgentUpliftPercent}% on crew fees`,
      quantity: 1,
      unitBasis: "item",
      sellingRate: uplift,
      sourceType: "pricing",
      sourceReference: `Crew Support Modifiers: urgent uplift ${params.urgentUpliftPercent}%, ${params.marketName}`,
      governedUnitPrice: uplift,
      noGovernedRate: false,
    });
  }
  return lines;
}
