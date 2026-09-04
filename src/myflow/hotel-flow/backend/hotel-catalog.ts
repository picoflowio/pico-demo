/*
- Copyright (c) 2026 picoflow.io
- This software is proprietary and confidential. Unauthorized copying, distribution
- or modification of this file, via any medium, is strictly prohibited.
 */
import { readFileSync } from 'node:fs';

export type Hotel = {
  name: string;
  address: string;
  amenities: Record<string, boolean>;
  level: number;
  roomType: string[];
  nearby: {
    airport?: number;
    cityCenter?: number;
  };
};

const hotels = JSON.parse(
  readFileSync(new URL('../data/hotels.json', import.meta.url), 'utf8'),
) as Hotel[];

/** Local, read-only hotel catalog for this self-contained demo flow. */
export class HotelCatalog {
  /**
   * Filters the hotel catalog by required amenities, desired room types, and maximum distance thresholds.
   *
   * @param amenities - Array of amenity keys that must all be true for the hotel.
   * @param roomTypes - Array of acceptable room types (matches if any room type matches).
   * @param airport - Optional maximum distance to the airport in miles.
   * @param cityCenter - Optional maximum distance to the city center in miles.
   * @returns Array of matching Hotel objects.
   */
  public static search(
    amenities: string[],
    roomTypes: string[],
    airport?: number,
    cityCenter?: number,
  ): Hotel[] {
    return hotels.filter((hotel) => {
      const hasAmenities = amenities.every(
        (amenity) => hotel.amenities[amenity] === true,
      );
      const hasRoomType =
        roomTypes.length === 0 ||
        roomTypes.some((roomType) => hotel.roomType.includes(roomType));
      const nearAirport =
        airport == null || (hotel.nearby.airport ?? Infinity) < airport;
      const nearCityCenter =
        cityCenter == null ||
        (hotel.nearby.cityCenter ?? Infinity) < cityCenter;

      return hasAmenities && hasRoomType && nearAirport && nearCityCenter;
    });
  }

  /**
   * Looks up full hotel catalog details for an array of hotel names.
   *
   * @param names - Array of hotel names to retrieve.
   * @returns Array of found Hotel objects matching the specified names.
   */
  public static fetch(names: string[]): Hotel[] {
    const byName = new Map(hotels.map((hotel) => [hotel.name, hotel]));
    return names.flatMap((name) => {
      const hotel = byName.get(name);
      return hotel ? [hotel] : [];
    });
  }
}
