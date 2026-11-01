import { COMMERCIAL } from "./commercial";
import { CORPORATE } from "./corporate";
import { EVENTS } from "./events";
import { PERSONAL } from "./personal";
import type { Registry } from "./schema";
import { CONDITIONS, CONTACT, SECTIONS } from "./shared";
import { WEDDINGS } from "./weddings";

export const REGISTRY: Registry = { packages: { ...PERSONAL, ...WEDDINGS, ...EVENTS, ...CORPORATE, ...COMMERCIAL }, sections: SECTIONS, conditions: CONDITIONS, contact: CONTACT };
export { applyEditorialContent, describeReport } from "./merge";
export type { ContentReport } from "./schema";
