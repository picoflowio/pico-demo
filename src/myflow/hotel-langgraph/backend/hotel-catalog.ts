import { readFileSync } from "node:fs";

export type Hotel = {
  name: string;
  amenities: Record<string, boolean>;
  level: number;
  roomType: string[];
  nearby: {
    airport?: number;
    cityCenter?: number;
  };
};

const hotels = JSON.parse(
  readFileSync(new URL("../data/hotels.json", import.meta.url), "utf8"),
) as Hotel[];

/** Local catalog used by this self-contained demo graph. */
export class HotelCatalog {
  /**
   * Filters the hotel catalog by required amenities, room type options, and proximity thresholds.
   *
   * @param amenities - Array of required amenity keys.
   * @param roomTypes - Array of desired room types.
   * @param airport - Optional maximum airport distance in miles.
   * @param cityCenter - Optional maximum city center distance in miles.
   * @returns Array of matching Hotel objects.
   */
  static search(
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
        airport === undefined || (hotel.nearby.airport ?? Infinity) < airport;
      const nearCityCenter =
        cityCenter === undefined ||
        (hotel.nearby.cityCenter ?? Infinity) < cityCenter;
      return hasAmenities && hasRoomType && nearAirport && nearCityCenter;
    });
  }

  /**
   * Looks up full hotel records from the catalog for an array of hotel names.
   *
   * @param names - Array of hotel names to retrieve.
   * @returns Array of found Hotel objects.
   */
  static fetch(names: string[]): Hotel[] {
    const byName = new Map(hotels.map((hotel) => [hotel.name, hotel]));
    return names.flatMap((name) => {
      const hotel = byName.get(name);
      return hotel ? [hotel] : [];
    });
  }
}
