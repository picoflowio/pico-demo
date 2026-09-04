/*
- Copyright (c) 2026 picoflow.io
- This software is proprietary and confidential. Unauthorized copying, distribution
- or modification of this file, via any medium, is strictly prohibited.
 */
type JsonObject = { [key: string]: string | number };
type NestedObject = { [key: string]: any };

export class GenChart {
  /**
   * Generates an aligned Markdown comparison table from an array of JSON objects.
   *
   * @param jsonObjects - Array of key-value objects representing hotels and feature values.
   * @returns Formatted Markdown table string.
   */
  public static getChart(jsonObjects: JsonObject[]): string {
    if (jsonObjects.length === 0) return '';

    // Ensure all JSON objects have the same keys (optional, but recommended)
    const keys = Object.keys(jsonObjects[0]);

    // Calculate the maximum length for each column
    const columnWidths: number[] = [];
    columnWidths.push('Key'.length); // Add the length for "Key" header
    for (let i = 0; i < jsonObjects.length; i++) {
      columnWidths.push(`JSON ${i + 1}`.length); // Add header for each JSON object
    }

    // Loop through keys and calculate the maximum length of each column (key and values)
    for (const key of keys) {
      const maxKeyLength = key.length;
      let maxValueLength = 0;
      for (const json of jsonObjects) {
        const value = json[key];
        const valueLength = value.toString().length;
        maxValueLength = Math.max(maxValueLength, valueLength);
      }
      const maxColumnLength = Math.max(maxKeyLength, maxValueLength);
      columnWidths[0] = Math.max(columnWidths[0], maxColumnLength); // Update the width for the "Key" column
    }

    // Create the table headers
    let table =
      '| ' +
      'Features'.padEnd(columnWidths[0]) +
      ' | ' +
      jsonObjects
        .map((_, index) => `Hotel ${index + 1}`.padEnd(columnWidths[index + 1]))
        .join(' | ') +
      ' |\n';
    table +=
      '| ' +
      columnWidths.map((width) => '-'.repeat(width)).join(' | ') +
      ' |\n';

    // Add rows for each key and its corresponding values from all JSON objects
    for (const key of keys) {
      const row = jsonObjects
        .map((json) => {
          const value = json[key].toString();
          return value.padEnd(columnWidths[1]); // Pad the value for alignment
        })
        .join(' | ');

      table += `| ${key.padEnd(columnWidths[0])} | ${row} |\n`;
    }

    return table;
  }

  /**
   * Recursively flattens nested object properties into dot-separated paths.
   *
   * @param obj - The nested object to flatten.
   * @param prefix - Accumulated property prefix for recursion.
   * @returns Flattened single-level key-value object.
   */
  public static flattenObject(
    obj: NestedObject,
    prefix: string = '',
  ): NestedObject {
    let result: NestedObject = {};

    for (const key in obj) {
      const value = obj[key];
      const newKey = prefix ? `${prefix}.${key}` : key;

      // If the value is an object, we recursively flatten it
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        if (key !== 'amenities') {
          // Recursively flatten nested objects, excluding 'amenities'
          result = {
            ...result,
            ...GenChart.flattenObject(value, newKey),
          };
        }
      } else {
        // Otherwise, just add the key and value to the result
        result[newKey] = value;
      }
    }

    return result;
  }

  /**
   * Maps an array of ISO dates and an array of numeric rates into a date-to-formatted-currency map.
   *
   * @param dates - Array of date strings.
   * @param values - Array of numeric price values matching the dates.
   * @returns Object mapping each date string to its currency formatted price.
   */
  public static createJsonObject(
    dates: string[],
    values: number[],
  ): { [key: string]: string } {
    const result: { [key: string]: string } = {};

    // Iterate over the dates array and populate the result object with keys from dates and values from values array
    for (let i = 0; i < dates.length; i++) {
      result[dates[i]] = this.formatCurrency(values[i]);
    }

    return result;
  }

  /**
   * Formats a numeric price into a localized currency string.
   *
   * @param amount - Numeric currency amount.
   * @param locale - Locale tag (defaults to 'en-US').
   * @param currency - ISO 4217 currency code (defaults to 'USD').
   * @returns Formatted currency string (e.g. '$120.00').
   */
  public static formatCurrency(
    amount: number,
    locale: string = 'en-US',
    currency: string = 'USD',
  ): string {
    const formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency,
    });

    return formatter.format(amount);
  }

  /**
   * Normalizes amenity booleans across multiple hotel objects into visual checkmark and cross symbols,
   * filling missing keys with cross symbols.
   *
   * @param hotels - Array of hotel objects containing amenity flags.
   * @returns Array of transformed hotel objects with uniform emoji representations.
   */
  public static transAmenities(hotels: object[]) {
    // Step 1: Gather all unique keys from all hotel objects
    const allKeys = new Set<string>();

    hotels.forEach((hotel) => {
      Object.keys(hotel).forEach((key) => allKeys.add(key));
    });

    // Step 2: Transform each hotel object to ensure all keys are present
    return hotels.map((hotel) => {
      const transformedHotel = { ...hotel };

      // For every key in allKeys, ensure the property exists, set to "no" if missing
      allKeys.forEach((key) => {
        if (transformedHotel[key] === undefined) {
          transformedHotel[key] = '❌'; // Set missing properties to "no"
        } else {
          transformedHotel[key] =
            transformedHotel[key] === true
              ? '✅'
              : transformedHotel[key] === false
                ? '❌'
                : transformedHotel[key];
        }
      });

      return transformedHotel;
    });
  }

  /**
   * Transforms an array of room type names into a boolean flag dictionary.
   *
   * @param roomType - Array of available room type strings.
   * @returns Object keyed by room type with `true` values.
   */
  public static transRoomType(roomType: string[]) {
    const obj = roomType.reduce((acc, entry) => {
      acc[entry] = true;
      return acc;
    }, {});
    return obj;
  }
}
