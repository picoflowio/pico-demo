import type { HotelSearchResult } from "../hotel-types.js";
import { HotelCatalog } from "./hotel-catalog.js";

type HotelPriceEntry = {
  basePrice: number;
  hotelName: string;
};

const US_PUBLIC_HOLIDAYS = [
  new Date(2025, 0, 1),
  nthWeekdayOfMonth(2025, 0, 1, 3),
  nthWeekdayOfMonth(2025, 1, 1, 3),
  lastWeekdayOfMonth(2025, 4, 1),
  new Date(2025, 6, 4),
  nthWeekdayOfMonth(2025, 8, 1, 1),
  nthWeekdayOfMonth(2025, 9, 1, 2),
  new Date(2025, 10, 11),
  nthWeekdayOfMonth(2025, 10, 4, 4),
  new Date(2025, 11, 25),
];

/** Pricing rules and catalog queries ported from the reference HotelFlow. */
export class PricingEngine {
  /**
   * Searches the hotel catalog matching amenities and room types, calculating stay costs and filtering by budget.
   *
   * @param startDate - Arrival date.
   * @param endDate - Departure date.
   * @param amenities - Array of required amenity keys.
   * @param roomTypes - Array of acceptable room types.
   * @param maxBudget - Optional maximum nightly rate.
   * @param minBudget - Optional minimum nightly rate.
   * @param airport - Optional max airport distance in miles.
   * @param cityCenter - Optional max city center distance in miles.
   * @returns Array of hotel search results with calculated prices and total.
   */
  static searchHotel(
    startDate: Date,
    endDate: Date,
    amenities: string[],
    roomTypes: string[],
    maxBudget?: number,
    minBudget?: number,
    airport?: number,
    cityCenter?: number,
  ): HotelSearchResult[] {
    const hotels = HotelCatalog.search(
      amenities,
      roomTypes,
      airport,
      cityCenter,
    ).map((hotel) => ({
      hotelName: hotel.name,
      basePrice: hotel.level,
    }));

    return this.findHotelByBudget(
      startDate,
      endDate,
      roomTypes[0],
      hotels,
      maxBudget,
      minBudget,
    );
  }

  /**
   * Retrieves hotel attributes (amenities, room types, distances) for comparison.
   *
   * @param names - Array of hotel names.
   * @returns Array of hotel attribute records.
   */
  static fetchHotels(names: string[]) {
    return HotelCatalog.fetch(names).map((hotel) => ({
      hotelName: hotel.name,
      amenities: hotel.amenities,
      roomType: hotel.roomType,
      airport: hotel.nearby.airport,
      cityCenter: hotel.nearby.cityCenter,
    }));
  }

  /**
   * Evaluates nightly prices across candidate hotels and excludes those exceeding budget limits.
   *
   * @param startDate - Start date of the stay.
   * @param endDate - End date of the stay.
   * @param roomType - Selected room type string.
   * @param hotels - Candidate hotel price entries.
   * @param maxBudget - Optional maximum allowable nightly price.
   * @param minBudget - Optional minimum allowable nightly price.
   * @returns Array of qualifying hotel search results.
   */
  static findHotelByBudget(
    startDate: Date,
    endDate: Date,
    roomType: string | undefined,
    hotels: HotelPriceEntry[],
    maxBudget?: number,
    minBudget?: number,
  ): HotelSearchResult[] {
    return hotels.flatMap((hotel) => {
      const prices = this.findPrices(
        startDate,
        endDate,
        hotel.basePrice,
        roomType,
      );
      if (prices.length === 0) return [];

      const min = Math.min(...prices);
      const max = Math.max(...prices);
      if (maxBudget !== undefined && max > maxBudget) return [];
      if (minBudget !== undefined && min < minBudget) return [];
      return [
        {
          hotelName: hotel.hotelName,
          prices,
          total: prices.reduce((sum, price) => sum + price, 0),
        },
      ];
    });
  }

  /**
   * Computes the nightly rates across a date span for a hotel's base tier and room type.
   *
   * @param startDate - Check-in date.
   * @param endDate - Check-out date.
   * @param basePrice - Base rate per night.
   * @param roomType - Selected room type.
   * @returns Array of nightly prices.
   */
  static findPrices(
    startDate: Date,
    endDate: Date,
    basePrice: number,
    roomType?: string,
  ): number[] {
    return enumerateDates(startDate, endDate).flatMap((date) => {
      const price = this.findPriceOneDay(date, basePrice, roomType);
      return price === null ? [] : [price];
    });
  }

  /**
   * Generates ISO date strings (YYYY-MM-DD) for each day between start and end dates.
   *
   * @param startDate - Check-in date.
   * @param endDate - Check-out date.
   * @returns Array of formatted date strings.
   */
  static enumerateDateStrings(startDate: Date, endDate: Date): string[] {
    return enumerateDates(startDate, endDate).map((date) =>
      date.toISOString().slice(0, 10),
    );
  }

  /**
   * Calculates the adjusted rate for a single date factoring seasonal demand, holidays, weekends, and room tiers.
   *
   * @param date - The specific calendar date.
   * @param basePrice - Hotel tier base price.
   * @param roomType - Optional room type multiplier.
   * @returns Calculated price or null if invalid.
   */
  private static findPriceOneDay(
    date: Date,
    basePrice: number,
    roomType?: string,
  ): number | null {
    const month = date.getUTCMonth();
    let priceMultiplier = 1.2;
    if (month === 9) priceMultiplier = 1.5;
    else if (month >= 3 && month <= 5) priceMultiplier = 1.4;
    else if (month >= 6 && month <= 8) priceMultiplier = 1.8;

    const isPublicHoliday = US_PUBLIC_HOLIDAYS.some(
      (holiday) =>
        holiday.getMonth() === month &&
        holiday.getDate() === date.getUTCDate(),
    );
    const holidayMultiplier = isPublicHoliday ? 1.2 : 1;
    const roomMultiplier =
      roomType === "two beds" ? 1.6 : roomType === "suite" ? 2.5 : 1;
    const weekday = date.getUTCDay();
    const weekendMultiplier = weekday === 0 || weekday === 6 ? 1.15 : 1;
    const price =
      basePrice *
      priceMultiplier *
      holidayMultiplier *
      roomMultiplier *
      weekendMultiplier;
    return price > 0 ? price : null;
  }
}

/**
 * Returns an array of Date objects covering all days between two dates inclusive.
 *
 * @param startDate - Start date.
 * @param endDate - End date.
 * @returns Array of dates in sequential order.
 */
function enumerateDates(startDate: Date, endDate: Date): Date[] {
  let start = new Date(startDate);
  let end = new Date(endDate);
  if (!isValidDate(start) || !isValidDate(end)) return [];
  if (start > end) [start, end] = [end, start];

  const dates: Date[] = [];
  const current = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()),
  );
  const last = new Date(
    Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()),
  );
  while (current <= last) {
    dates.push(new Date(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

/**
 * Verifies if a Date object is valid (non-NaN).
 *
 * @param date - Date to check.
 * @returns True if valid date.
 */
function isValidDate(date: Date): boolean {
  return !Number.isNaN(date.getTime());
}

/**
 * Computes the calendar Date for the nth occurrence of a weekday in a given month/year.
 *
 * @param year - Four-digit year.
 * @param month - Zero-indexed month (0 = January).
 * @param weekday - Zero-indexed day of week (0 = Sunday, 1 = Monday).
 * @param nth - 1-indexed occurrence count.
 * @returns Computed Date object.
 */
function nthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number,
  nth: number,
): Date {
  const first = new Date(year, month, 1);
  const offset = (7 + weekday - first.getDay()) % 7;
  return new Date(year, month, 1 + offset + (nth - 1) * 7);
}

/**
 * Computes the calendar Date for the last occurrence of a weekday in a given month/year.
 *
 * @param year - Four-digit year.
 * @param month - Zero-indexed month (0 = January).
 * @param weekday - Zero-indexed day of week.
 * @returns Computed Date object.
 */
function lastWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number,
): Date {
  const last = new Date(year, month + 1, 0);
  last.setDate(last.getDate() - ((7 + last.getDay() - weekday) % 7));
  return last;
}
