import { readFileSync } from "node:fs";
import { z } from "zod";
import { EndorsementSchema } from "../home-insurance-types.js";

const BandSchema = z.object({
  maxYears: z.number().nonnegative(),
  factor: z.number().positive(),
});

const QuoteConfigSchema = z.object({
  carrierName: z.string().min(1),
  rulesVersion: z.string().min(1),
  supportedStates: z.array(z.string().length(2)).min(1),
  quoteValidDays: z.number().int().positive(),
  baseRatePerThousand: z.number().positive(),
  deductibleFactors: z.record(z.string(), z.number().positive()),
  constructionFactors: z.record(z.string(), z.number().positive()),
  occupancyFactors: z.record(z.string(), z.number().positive()),
  homeAgeBands: z.array(BandSchema).min(1),
  roofAgeBands: z.array(BandSchema).min(1),
  claimFactors: z.record(z.string(), z.number().positive()),
  hazardFactors: z.object({
    pool: z.number().positive(),
    trampoline: z.number().positive(),
    woodStove: z.number().positive(),
  }),
  protectionDiscounts: z.object({
    monitoredAlarm: z.number().min(0).max(0.5),
    sprinklerSystem: z.number().min(0).max(0.5),
  }),
  endorsementAnnualFees: z.record(EndorsementSchema, z.number().nonnegative()),
  referralRules: z.object({
    maxDwellingCoverage: z.number().positive(),
    maxRoofAgeYears: z.number().nonnegative(),
    maxClaimsInFiveYears: z.number().int().nonnegative(),
    maxSingleClaimAmount: z.number().nonnegative(),
    minimumYearBuilt: z.number().int(),
  }),
  tiers: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    premiumFactor: z.number().positive(),
    dwellingExtensionPercent: z.number().min(0).max(100),
    minimumLiability: z.number().positive(),
    includedEndorsements: z.array(EndorsementSchema),
  })).min(1),
});

export type QuoteConfig = z.infer<typeof QuoteConfigSchema>;

const rawConfig = JSON.parse(
  readFileSync(new URL("../data/quote-config.json", import.meta.url), "utf8"),
) as unknown;

export const quoteConfig: QuoteConfig = QuoteConfigSchema.parse(rawConfig);
