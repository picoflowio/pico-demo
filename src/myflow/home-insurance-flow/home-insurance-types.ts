import { z } from "zod";

export const QualificationSchema = z.object({
  state: z.string().length(2).transform((value) => value.toUpperCase()),
  zip: z.string().regex(/^\d{5}$/),
  purchaseStatus: z.enum(["own", "buying", "refinancing"]),
  occupancy: z.enum(["primary", "secondary", "rental"]),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const PropertyProfileSchema = z.object({
  dwellingType: z.enum(["single_family", "townhome", "duplex"]),
  yearBuilt: z.number().int().min(1800).max(2100),
  squareFeet: z.number().int().min(400).max(15000),
  stories: z.number().min(1).max(4),
  construction: z.enum(["wood_frame", "masonry", "mixed"]),
  roofMaterial: z.enum(["composition", "metal", "tile"]),
  roofAgeYears: z.number().int().min(0).max(75),
  plumbingUpdatedYear: z.number().int().min(1800).max(2100).nullable(),
  electricalUpdatedYear: z.number().int().min(1800).max(2100).nullable(),
  hvacUpdatedYear: z.number().int().min(1800).max(2100).nullable(),
});

export const ClaimSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  type: z.enum(["water", "fire", "wind", "theft", "liability", "other"]),
  amount: z.number().min(0).max(10000000),
});

export const RiskProfileSchema = z.object({
  claims: z.array(ClaimSchema).max(10),
  hazards: z.object({
    pool: z.boolean(),
    trampoline: z.boolean(),
    woodStove: z.boolean(),
  }),
  protections: z.object({
    smokeAlarms: z.boolean(),
    burglarAlarm: z.boolean(),
    monitoredAlarm: z.boolean(),
    sprinklerSystem: z.boolean(),
  }),
});

export const EndorsementSchema = z.enum([
  "water_backup",
  "identity_theft",
  "equipment_breakdown",
]);

export const CoveragePreferencesSchema = z.object({
  dwellingCoverage: z.number().int().min(100000).max(2000000),
  deductible: z.union([z.literal(1000), z.literal(2500), z.literal(5000)]),
  liabilityLimit: z.union([
    z.literal(100000),
    z.literal(300000),
    z.literal(500000),
    z.literal(1000000),
  ]),
  endorsements: z.array(EndorsementSchema),
});

export const ContactRequestSchema = z.object({
  consentToContact: z.boolean(),
  name: z.string().trim().min(1).max(120).nullable(),
  email: z.string().email().nullable(),
  phone: z.string().trim().min(7).max(30).nullable(),
  propertyAddress: z.string().trim().min(5).max(240).nullable(),
});

export type Qualification = z.infer<typeof QualificationSchema>;
export type PropertyProfile = z.infer<typeof PropertyProfileSchema>;
export type RiskProfile = z.infer<typeof RiskProfileSchema>;
export type CoveragePreferences = z.infer<typeof CoveragePreferencesSchema>;
export type ContactRequest = z.infer<typeof ContactRequestSchema>;
export type Endorsement = z.infer<typeof EndorsementSchema>;

export type QuoteOption = {
  id: string;
  name: string;
  annualPremium: number;
  monthlyPremium: number;
  dwellingCoverage: number;
  dwellingExtensionPercent: number;
  deductible: number;
  liabilityLimit: number;
  endorsements: Endorsement[];
};

export type QuoteResult = {
  decision: "eligible" | "referral" | "unsupported";
  reasonCodes: string[];
  quoteId: string;
  rulesVersion: string;
  generatedAt: string;
  validThrough: string;
  options: QuoteOption[];
};
