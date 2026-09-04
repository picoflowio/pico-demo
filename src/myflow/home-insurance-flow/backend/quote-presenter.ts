import type { QuoteOption, QuoteResult } from "../home-insurance-types.js";

export class QuotePresenter {
  /**
   * Formats complete quote results and package options into a Markdown presentation table.
   *
   * @param result - QuoteResult object containing quote ID, validity, and package options.
   * @returns Formatted Markdown string.
   */
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

  /**
   * Generates a comparative Markdown table for selected quote package options.
   *
   * @param options - Array of QuoteOption packages to compare.
   * @returns Formatted Markdown comparison table string.
   */
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

  /**
   * Formats a single package option into a Markdown table row.
   *
   * @param option - QuoteOption package.
   * @returns Markdown row string.
   */
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

  /**
   * Formats a numeric value into USD currency text.
   *
   * @param value - Dollar amount.
   * @returns Formatted currency string ($0.00).
   */
  private static currency(value: number): string {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
  }
}
