/*
- Copyright (c) 2026 picoflow.io
- This software is proprietary and confidential. Unauthorized copying, distribution
- or modification of this file, via any medium, is strictly prohibited.
 */

export type CityTemperature = {
  city: string;
  temperature: number | null;
};

/**
 * Resolves fixture temperature values for a list of city names/aliases.
 *
 * @param cities - Array of city alias strings (e.g., 'LA', 'NYC').
 * @returns Array of objects mapping each city to its numeric temperature or null if unsupported.
 */
export function getCityTemperatures(cities: string[]): CityTemperature[] {
  return cities.map((city) => ({
    city,
    temperature: temperatureForCity(city),
  }));
}

/**
 * Returns static mock temperature data for supported city aliases.
 *
 * @param city - City name or alias string.
 * @returns Temperature in Fahrenheit, or null if the city is not recognized.
 */
function temperatureForCity(city: string): number | null {
  const normalized = city.trim().toLowerCase();
  if (normalized === 'nyc') {
    return 83;
  }
  if (normalized === 'la') {
    return 72;
  }
  return null;
}
