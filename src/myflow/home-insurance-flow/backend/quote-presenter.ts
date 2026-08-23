import type { QuoteOption, QuoteResult } from "../home-insurance-types.js";

export class QuotePresenter {
  public static options(result: QuoteResult): string {
    const lines = [
      `### Preliminary home insurance quote ${result.quoteId}`,
      "",
      "| Option | Annual premium | Monthly estimate | Dwelling | Extension | Deductible | Liability | Endorsements |",
      "| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
      ...result.options.map((option) => this.row(option)),
      "",
      `Valid through ${result.validThrough} under demo rules ${result.rulesVersion}. This is a non-binding estimate, not proof of insurance or an offer to bind coverage.`,
      "You can compare options, change the deductible, or select an option for an agent follow-up.",
    ];
    return lines.join("\n");
  }

  public static comparison(options: QuoteOption[]): string {
    return [
      "### Quote comparison",
      "",
      "| Option | Annual premium | Monthly estimate | Deductible | Liability | Extension | Endorsements |",
      "| --- | ---: | ---: | ---: | ---: | ---: | --- |",
      ...options.map((option) => [
        `| ${option.name} (${option.id})`,
        this.currency(option.annualPremium),
        this.currency(option.monthlyPremium),
        this.currency(option.deductible),
        this.currency(option.liabilityLimit),
        `${option.dwellingExtensionPercent}%`,
        `${option.endorsements.length > 0 ? option.endorsements.join(", ") : "None"} |`,
      ].join(" | ")),
      "",
      "Would you like to select one, compare different options, or change the deductible?",
    ].join("\n");
  }

  private static row(option: QuoteOption): string {
    return [
      `| ${option.name} (${option.id})`,
      this.currency(option.annualPremium),
      this.currency(option.monthlyPremium),
      this.currency(option.dwellingCoverage),
      `${option.dwellingExtensionPercent}%`,
      this.currency(option.deductible),
      this.currency(option.liabilityLimit),
      `${option.endorsements.length > 0 ? option.endorsements.join(", ") : "None"} |`,
    ].join(" | ");
  }

  private static currency(value: number): string {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
  }
}
