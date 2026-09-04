type ChartRow = Record<string, string | number>;

export class GenChart {
  /**
   * Generates a Markdown comparison table string from an array of hotel attribute row objects.
   *
   * @param hotels - Array of objects mapping feature names to display values.
   * @returns Formatted Markdown table.
   */
  static getChart(hotels: ChartRow[]): string {
    if (hotels.length === 0) return "";
    const keys = Object.keys(hotels[0] ?? {});
    const rows = [
      `| Features | ${hotels.map((_, index) => `Hotel ${index + 1}`).join(" | ")} |`,
      `| --- | ${hotels.map(() => "---").join(" | ")} |`,
      ...keys.map(
        (key) =>
          `| ${key} | ${hotels.map((hotel) => String(hotel[key] ?? "")).join(" | ")} |`,
      ),
    ];
    return rows.join("\n");
  }

  /**
   * Formats a numeric price into localized currency text.
   *
   * @param amount - Numeric amount to format.
   * @param locale - Formatting locale string (default 'en-US').
   * @param currency - ISO currency code (default 'USD').
   * @returns Formatted currency string.
   */
  static formatCurrency(
    amount: number,
    locale = "en-US",
    currency = "USD",
  ): string {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(
      amount,
    );
  }

  /**
   * Transforms boolean amenity/room attributes into visual check/cross symbols across all hotels.
   *
   * @param hotels - Array of hotel records with boolean or string attributes.
   * @returns Array of transformed rows suitable for chart rendering.
   */
  static comparisonRows(
    hotels: Array<Record<string, string | number | boolean>>,
  ): ChartRow[] {
    const keys = new Set(hotels.flatMap((hotel) => Object.keys(hotel)));
    return hotels.map((hotel) =>
      Object.fromEntries(
        [...keys].map((key) => {
          const value = hotel[key];
          return [
            key,
            value === undefined
              ? "❌"
              : value === true
                ? "✅"
                : value === false
                  ? "❌"
                  : value,
          ];
        }),
      ) as ChartRow,
    );
  }

  /**
   * Converts an array of room types into a boolean dictionary keyed by room type.
   *
   * @param roomTypes - Array of available room type names.
   * @returns Record with room type keys mapped to true.
   */
  static roomTypes(roomTypes: string[]): Record<string, boolean> {
    return Object.fromEntries(roomTypes.map((roomType) => [roomType, true]));
  }
}
