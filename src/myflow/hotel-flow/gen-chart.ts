/*
 * Copyright (c) 2026 picoflow.io
 * This software is proprietary and confidential. Unauthorized copying, distribution
 * or modification of this file, via any medium, is strictly prohibited.
 */
type JsonObject = { [key: string]: string | number };
type NestedObject = { [key: string]: any };

export class GenChart {
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

  public static transRoomType(roomType: string[]) {
    const obj = roomType.reduce((acc, entry) => {
      acc[entry] = true;
      return acc;
    }, {});
    return obj;
  }
}
