/*
- Copyright (c) 2026 picoflow.io
- This software is proprietary and confidential. Unauthorized copying, distribution
- or modification of this file, via any medium, is strictly prohibited.
 */

export type CityTemperature = {
  city: string;
  temperature: number | null;
};

/** Deterministic local fixture used by BasicFlow's tool-batching example. */
export function getCityTemperatures(cities: string[]): CityTemperature[] {
  return cities.map((city) => ({
    city,
    temperature: temperatureForCity(city),
  }));
}

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
