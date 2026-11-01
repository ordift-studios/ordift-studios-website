// Pure constants shared by the erasure module (server) and its interface (client). No imports, so a client component can use them without pulling server code into the browser bundle.
export const BASES = [{ key: "retention_period_ended", label: "The adopted retention period has ended" }, { key: "data_subject_request", label: "A person asked for erasure" }, { key: "legal_requirement", label: "A legal requirement" }, { key: "other_documented", label: "Other documented reason" }] as const;
export type Basis = (typeof BASES)[number]["key"];
export const REASON_HELP = "10 to 200 characters. Do not include names or other personal details: this log is kept.";
