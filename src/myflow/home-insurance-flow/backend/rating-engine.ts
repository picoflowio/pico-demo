import { createHash } from "node:crypto";
import { quoteConfig } from "./quote-config.js";
import type {
  CoveragePreferences,
  Endorsement,
  PropertyProfile,
  Qualification,
  QuoteOption,
  QuoteResult,
  RiskProfile,
} from "../home-insurance-types.js";

export type QuoteApplication = {
  qualification: Qualification;
  property: PropertyProfile;
  risk: RiskProfile;
  coverage: CoveragePreferences;
};

export class RatingEngine {
  /**
   * Evaluates underwriting eligibility and calculates premium options for a home insurance quote application.
   *
   * @param application - Fully populated QuoteApplication object.
   * @param currentDate - Effective pricing date.
   * @returns Complete QuoteResult with decision status, reason codes, quote ID, and package options.
   */
  public static quote(application: QuoteApplication, currentDate: Date): QuoteResult {
    const reasonCodes = this.evaluate(application, currentDate);
    const decision = reasonCodes.includes("UNSUPPORTED_STATE")
      ? "unsupported"
      : reasonCodes.length > 0
        ? "referral"
        : "eligible";
    const quoteId = this.quoteId(application, currentDate);
    const generatedAt = currentDate.toISOString();
    const validThroughDate = new Date(currentDate);
    validThroughDate.setUTCDate(validThroughDate.getUTCDate() + quoteConfig.quoteValidDays);

    return {
      decision,
      reasonCodes,
      quoteId,
      rulesVersion: quoteConfig.rulesVersion,
      generatedAt,
      validThrough: validThroughDate.toISOString().slice(0, 10),
      options: decision === "eligible" ? this.createOptions(application, currentDate) : [],
    };
  }

  /**
   * Applies underwriting rules to identify referrals, state exclusions, and hazard flags.
   *
   * @param application - QuoteApplication data.
   * @param currentDate - Effective date for claim history calculation.
   * @returns Array of unique underwriting reason codes.
   */
  private static evaluate(application: QuoteApplication, currentDate: Date): string[] {
    const reasons: string[] = [];
    const { qualification, property, risk, coverage } = application;
    if (!quoteConfig.supportedStates.includes(qualification.state)) reasons.push("UNSUPPORTED_STATE");
    if (coverage.dwellingCoverage > quoteConfig.referralRules.maxDwellingCoverage) reasons.push("HIGH_DWELLING_LIMIT");
    if (property.roofAgeYears > quoteConfig.referralRules.maxRoofAgeYears) reasons.push("ROOF_AGE_REVIEW");
    if (property.yearBuilt < quoteConfig.referralRules.minimumYearBuilt) reasons.push("HISTORIC_HOME_REVIEW");
    const cutoffYear = currentDate.getUTCFullYear() - 5;
    const recentClaims = risk.claims.filter((claim) => claim.year >= cutoffYear);
    if (recentClaims.length > quoteConfig.referralRules.maxClaimsInFiveYears) reasons.push("CLAIMS_FREQUENCY_REVIEW");
    if (recentClaims.some((claim) => claim.amount > quoteConfig.referralRules.maxSingleClaimAmount)) reasons.push("LARGE_CLAIM_REVIEW");
    return [...new Set(reasons)];
  }

  /**
   * Computes actuarial premium calculations across all configured insurance package tiers (Standard, Plus, Premium).
   *
   * @param application - Quote application attributes.
   * @param currentDate - Reference date for building age determination.
   * @returns Array of calculated QuoteOption tiers.
   */
  private static createOptions(application: QuoteApplication, currentDate: Date): QuoteOption[] {
    const { qualification, property, risk, coverage } = application;
    const homeAge = Math.max(0, currentDate.getUTCFullYear() - property.yearBuilt);
    const homeFactor = this.bandFactor(homeAge, quoteConfig.homeAgeBands);
    const roofFactor = this.bandFactor(property.roofAgeYears, quoteConfig.roofAgeBands);
    const constructionFactor = quoteConfig.constructionFactors[property.construction];
    const occupancyFactor = quoteConfig.occupancyFactors[qualification.occupancy];
    const deductibleFactor = quoteConfig.deductibleFactors[String(coverage.deductible)];
    const claimFactor = quoteConfig.claimFactors[String(Math.min(risk.claims.length, 2))];
    if (!constructionFactor || !occupancyFactor || !deductibleFactor || !claimFactor) {
      throw new Error("Quote configuration is missing an application factor.");
    }
    let hazardFactor = 1;
    if (risk.hazards.pool) hazardFactor *= quoteConfig.hazardFactors.pool;
    if (risk.hazards.trampoline) hazardFactor *= quoteConfig.hazardFactors.trampoline;
    if (risk.hazards.woodStove) hazardFactor *= quoteConfig.hazardFactors.woodStove;
    let protectionFactor = 1;
    if (risk.protections.monitoredAlarm) protectionFactor -= quoteConfig.protectionDiscounts.monitoredAlarm;
    if (risk.protections.sprinklerSystem) protectionFactor -= quoteConfig.protectionDiscounts.sprinklerSystem;

    const baseAnnual =
      (coverage.dwellingCoverage / 1000) *
      quoteConfig.baseRatePerThousand *
      homeFactor *
      roofFactor *
      constructionFactor *
      occupancyFactor *
      deductibleFactor *
      claimFactor *
      hazardFactor *
      protectionFactor;

    return quoteConfig.tiers.map((tier) => {
      const endorsements = this.mergeEndorsements(coverage.endorsements, tier.includedEndorsements);
      const fees = endorsements.reduce(
        (total, endorsement) => total + quoteConfig.endorsementAnnualFees[endorsement],
        0,
      );
      const annualPremium = this.money(baseAnnual * tier.premiumFactor + fees);
      return {
        id: tier.id,
        name: tier.name,
        annualPremium,
        monthlyPremium: this.money(annualPremium / 12),
        dwellingCoverage: coverage.dwellingCoverage,
        dwellingExtensionPercent: tier.dwellingExtensionPercent,
        deductible: coverage.deductible,
        liabilityLimit: Math.max(coverage.liabilityLimit, tier.minimumLiability),
        endorsements,
      };
    });
  }

  /**
   * Looks up the risk multiplier associated with an age band (e.g. roof age or home age).
   *
   * @param value - Age in years.
   * @param bands - Array of age thresholds and corresponding rating factors.
   * @returns Matched rating multiplier.
   */
  private static bandFactor(value: number, bands: Array<{ maxYears: number; factor: number }>): number {
    return bands.find((band) => value <= band.maxYears)?.factor ?? bands[bands.length - 1]!.factor;
  }

  /**
   * Merges multiple endorsement arrays into a deduplicated list of unique endorsements.
   *
   * @param groups - Multiple arrays of Endorsement enum values.
   * @returns Deduplicated Endorsement array.
   */
  private static mergeEndorsements(...groups: Endorsement[][]): Endorsement[] {
    return [...new Set(groups.flat())];
  }

  /**
   * Rounds a numerical monetary value to two decimal places with epsilon correction.
   *
   * @param value - Floating point number.
   * @returns Currency value rounded to cents.
   */
  private static money(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  /**
   * Generates a deterministic, unique Quote ID (e.g. `EHI-20260904-ABCD1234`) based on hash of the application.
   *
   * @param application - QuoteApplication data to hash.
   * @param currentDate - Effective date.
   * @returns Formatted quote ID string.
   */
  private static quoteId(application: QuoteApplication, currentDate: Date): string {
    const digest = createHash("sha256")
      .update(JSON.stringify(application))
      .digest("hex")
      .slice(0, 8)
      .toUpperCase();
    return `EHI-${currentDate.toISOString().slice(0, 10).replaceAll("-", "")}-${digest}`;
  }
}
