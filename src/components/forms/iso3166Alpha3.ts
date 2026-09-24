import type { CountryCode } from "libphonenumber-js";

// ISO 3166-1 alpha-2 → alpha-3 code mapping (2026-09-25) — display-only.
//
// Why this exists as a small hand-maintained table rather than another
// npm dependency: libphonenumber-js (the authoritative country/dial-
// code/validation source this app already uses) only exposes alpha-2
// codes — there is no alpha-3 anywhere in its metadata, and no other
// country dataset already exists in this project to borrow from. The
// alternative was adding a second, heavier country-database package
// just for a three-letter code translation, which the Founder's own
// instruction explicitly asked to avoid ("do not introduce another
// country dataset unnecessarily"). Unlike a full country list (names,
// dial codes, flags — the actual risk a handwritten version would
// carry), the ISO 3166-1 alpha-2↔alpha-3 mapping is a frozen
// international standard that essentially never changes; this is a
// pure code-format translation layer, not a second source of country
// truth. libphonenumber-js's getCountries()/getCountryCallingCode()
// remain the ONLY source for which countries exist, their names
// (via Intl.DisplayNames), and their dial codes — this table changes
// nothing about validation, E.164 output, or country existence: it is
// consulted ONLY to shorten the closed-selector label, and any code
// missing from it safely falls back to the real ISO alpha-2 value
// (getAlpha3() never throws and never hides a country).
const ALPHA2_TO_ALPHA3: Partial<Record<CountryCode, string>> = {
  AD: "AND", AE: "ARE", AF: "AFG", AG: "ATG", AI: "AIA", AL: "ALB", AM: "ARM",
  AO: "AGO", AR: "ARG", AS: "ASM", AT: "AUT", AU: "AUS", AW: "ABW", AX: "ALA",
  AZ: "AZE", BA: "BIH", BB: "BRB", BD: "BGD", BE: "BEL", BF: "BFA", BG: "BGR",
  BH: "BHR", BI: "BDI", BJ: "BEN", BL: "BLM", BM: "BMU", BN: "BRN", BO: "BOL",
  BQ: "BES", BR: "BRA", BS: "BHS", BT: "BTN", BW: "BWA", BY: "BLR", BZ: "BLZ",
  CA: "CAN", CC: "CCK", CD: "COD", CF: "CAF", CG: "COG", CH: "CHE", CI: "CIV",
  CK: "COK", CL: "CHL", CM: "CMR", CN: "CHN", CO: "COL", CR: "CRI", CU: "CUB",
  CV: "CPV", CW: "CUW", CX: "CXR", CY: "CYP", CZ: "CZE", DE: "DEU", DJ: "DJI",
  DK: "DNK", DM: "DMA", DO: "DOM", DZ: "DZA", EC: "ECU", EE: "EST", EG: "EGY",
  EH: "ESH", ER: "ERI", ES: "ESP", ET: "ETH", FI: "FIN", FJ: "FJI", FK: "FLK",
  FM: "FSM", FO: "FRO", FR: "FRA", GA: "GAB", GB: "GBR", GD: "GRD", GE: "GEO",
  GF: "GUF", GG: "GGY", GH: "GHA", GI: "GIB", GL: "GRL", GM: "GMB", GN: "GIN",
  GP: "GLP", GQ: "GNQ", GR: "GRC", GT: "GTM", GU: "GUM", GW: "GNB", GY: "GUY",
  HK: "HKG", HN: "HND", HR: "HRV", HT: "HTI", HU: "HUN", ID: "IDN", IE: "IRL",
  IL: "ISR", IM: "IMN", IN: "IND", IO: "IOT", IQ: "IRQ", IR: "IRN", IS: "ISL",
  IT: "ITA", JE: "JEY", JM: "JAM", JO: "JOR", JP: "JPN", KE: "KEN", KG: "KGZ",
  KH: "KHM", KI: "KIR", KM: "COM", KN: "KNA", KP: "PRK", KR: "KOR", KW: "KWT",
  KY: "CYM", KZ: "KAZ", LA: "LAO", LB: "LBN", LC: "LCA", LI: "LIE", LK: "LKA",
  LR: "LBR", LS: "LSO", LT: "LTU", LU: "LUX", LV: "LVA", LY: "LBY", MA: "MAR",
  MC: "MCO", MD: "MDA", ME: "MNE", MF: "MAF", MG: "MDG", MH: "MHL", MK: "MKD",
  ML: "MLI", MM: "MMR", MN: "MNG", MO: "MAC", MP: "MNP", MQ: "MTQ", MR: "MRT",
  MS: "MSR", MT: "MLT", MU: "MUS", MV: "MDV", MW: "MWI", MX: "MEX", MY: "MYS",
  MZ: "MOZ", NA: "NAM", NC: "NCL", NE: "NER", NF: "NFK", NG: "NGA", NI: "NIC",
  NL: "NLD", NO: "NOR", NP: "NPL", NR: "NRU", NU: "NIU", NZ: "NZL", OM: "OMN",
  PA: "PAN", PE: "PER", PF: "PYF", PG: "PNG", PH: "PHL", PK: "PAK", PL: "POL",
  PM: "SPM", PR: "PRI", PS: "PSE", PT: "PRT", PW: "PLW", PY: "PRY", QA: "QAT",
  RE: "REU", RO: "ROU", RS: "SRB", RU: "RUS", RW: "RWA", SA: "SAU", SB: "SLB",
  SC: "SYC", SD: "SDN", SE: "SWE", SG: "SGP", SH: "SHN", SI: "SVN", SJ: "SJM",
  SK: "SVK", SL: "SLE", SM: "SMR", SN: "SEN", SO: "SOM", SR: "SUR", SS: "SSD",
  ST: "STP", SV: "SLV", SX: "SXM", SY: "SYR", SZ: "SWZ", TC: "TCA", TD: "TCD",
  TG: "TGO", TH: "THA", TJ: "TJK", TK: "TKL", TL: "TLS", TM: "TKM", TN: "TUN",
  TO: "TON", TR: "TUR", TT: "TTO", TV: "TUV", TW: "TWN", TZ: "TZA", UA: "UKR",
  UG: "UGA", US: "USA", UY: "URY", UZ: "UZB", VA: "VAT", VC: "VCT", VE: "VEN",
  VG: "VGB", VI: "VIR", VN: "VNM", VU: "VUT", WF: "WLF", WS: "WSM", XK: "XKX",
  YE: "YEM", YT: "MYT", ZA: "ZAF", ZM: "ZMB", ZW: "ZWE",
};

/** Best-effort ISO 3166-1 alpha-3 for display; falls back to the real alpha-2 code (never blank, never throws) for the handful of ITU-only calling-code territories (e.g. AC, TA) with no ISO alpha-3. */
export function getAlpha3(countryCode: CountryCode): string {
  return ALPHA2_TO_ALPHA3[countryCode] ?? countryCode;
}
