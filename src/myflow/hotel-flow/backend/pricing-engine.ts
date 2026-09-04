/*
- Copyright (c) 2026 picoflow.io
- This software is proprietary and confidential. Unauthorized copying, distribution
- or modification of this file, via any medium, is strictly prohibited.
 */
import { HotelCatalog } from './hotel-catalog.js';

type HotelPriceEntry = {
  basePrice: number;
  hotelName: string; // Added roomType parameter
};

export type SearchHotelEntry = {
  hotelName: string;
  prices: number[];
  total: number;
};

const US_PUBLIC_HOLIDAYS_2025 = [
  new Date('2025-01-01'), // New Year's Day
  getNthWeekdayOfMonth(2025, 1, 3), // Martin Luther King Jr. Day (Third Monday of January)
  getNthWeekdayOfMonth(2025, 2, 3), // President's Day (Third Monday of February)
  getNthWeekdayOfMonth(2025, 5, 1), // Memorial Day (Last Monday of May)
  new Date('2025-07-04'), // Independence Day
  getNthWeekdayOfMonth(2025, 9, 1), // Labor Day (First Monday of September)
  getNthWeekdayOfMonth(2025, 10, 2), // Columbus Day (Second Monday of October)
  new Date('2025-11-11'), // Veterans Day
  getNthWeekdayOfMonth(2025, 11, 4), // Thanksgiving (Fourth Thursday of November)
  new Date('2025-12-25'), // Christmas Day
];

/**
 * Computes the calendar Date for the nth occurrence of a specific weekday in a given month/year.
 *
 * @param year - Four-digit year.
 * @param month - Calendar month (1 = January, 12 = December).
 * @param nth - Ordinal occurrence of the weekday (e.g. 3 for 3rd Monday).
 * @returns Date object representing the target weekday.
 */
function getNthWeekdayOfMonth(year: number, month: number, nth: number): Date {
  const firstDayOfMonth = new Date(year, month - 1, 1);
  const firstWeekday = firstDayOfMonth.getDay();
  const offset = (7 + nth - firstWeekday) % 7;
  return new Date(year, month - 1, 1 + offset + (nth - 1) * 7);
}

export class PricingEngine {
  /**
   * Calculates the adjusted nightly room rate for a single date based on seasonal multipliers,
   * US public holidays, room type adjustments, and weekend premiums.
   *
   * @param date - The specific calendar date.
   * @param basePrice - Base rate per night for the hotel tier.
   * @param roomType - Room type category ('one bed', 'two beds', 'suite').
   * @returns Calculated nightly price, or null if the calculated price is non-positive.
   */
  private static findPriceOneDay(
    date: Date,
    basePrice: number,
    roomType: string,
  ): number | null {
    const month = date.getMonth(); // Get the month (0 - 11)

    // Base price multiplier based on month
    let priceMultiplier = 1;

    if (month >= 9 && month <= 11) {
      // September to December
      if (month === 9) {
        priceMultiplier = 1.5; // September
      } else if (month >= 9 && month <= 11) {
        priceMultiplier = month === 9 ? 1.5 : 1.2; // Oct-Dec
      }
    } else if (month >= 3 && month <= 5) {
      // March to May
      priceMultiplier = 1.4; // April to May
    } else if (month >= 5 && month <= 8) {
      priceMultiplier = 1.8; // June to August
    } else {
      priceMultiplier = 1.2; // January to March
    }

    // Check if the date falls on a public holiday
    const isPublicHoliday = US_PUBLIC_HOLIDAYS_2025.some((holiday) => {
      return (
        holiday.getDate() === date.getDate() &&
        holiday.getMonth() === date.getMonth()
      );
    });

    // Apply public holiday adjustment (if applicable)
    const holidayMultiplier = isPublicHoliday ? 1.2 : 1;

    // Adjust base price for the room type
    let roomMultiplier = 1;
    switch (roomType) {
      case 'two beds':
        roomMultiplier = 1.6; // 'two beds' increases price by 1.6 times
        break;
      case 'suite':
        roomMultiplier = 2.5; // 'suite' increases price by 2.5 times
        break;
      case 'one bed':
      default:
        // 'one bed' stays the same, no adjustment
        break;
    }

    // Check if the date is a weekend (Saturday or Sunday)
    let weekendMultiplier = 1;
    const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      // Apply a 15% increase for weekends
      weekendMultiplier *= 1.15;
    }

    // Calculate the base price before weekend adjustment
    const adjustedMultiplier =
      priceMultiplier * holidayMultiplier * roomMultiplier * weekendMultiplier;
    const realPrice = basePrice * adjustedMultiplier;

    // Ensure that the basePrice is valid (non-negative and sensible)
    if (realPrice <= 0) {
      return null;
    }

    return realPrice;
  }

  /**
   * Computes an array of nightly prices across a date span for a specified base rate and room type.
   *
   * @param startDate - Beginning of the stay range.
   * @param endDate - End of the stay range.
   * @param basePrice - Base rate per night.
   * @param roomType - Selected room type.
   * @returns Array of nightly prices, or null if pricing cannot be determined.
   */
  public static findPrices(
    startDate: Date,
    endDate: Date,
    basePrice: number,
    roomType: string,
  ): number[] | null {
    const dates = this.enumerateDates(startDate, endDate);

    // Find the base prices for each date
    const basePrices: (number | null)[] = dates.map((date) =>
      PricingEngine.findPriceOneDay(date, basePrice, roomType),
    );

    // Filter out any null values (in case basePrice is invalid for a particular date)
    const validBasePrices = basePrices.filter(
      (price) => price !== null,
    ) as number[];

    // If there are no valid base prices, return null
    if (validBasePrices.length === 0) {
      return null;
    }

    // Find and return the minimum base price
    return validBasePrices;
  }

  /**
   * Generates a sequential array of daily Date instances between start and end dates inclusive.
   *
   * @param startDate - First date.
   * @param endDate - Last date.
   * @returns Array of individual calendar dates.
   */
  private static enumerateDates(startDate: Date, endDate: Date): Date[] {
    // Ensure that startDate is before endDate by swapping if necessary
    if (startDate > endDate) {
      [startDate, endDate] = [endDate, startDate]; // Swap the dates if startDate > endDate
    }

    const dates: Date[] = [];

    const currentDate = new Date(startDate);
    const aEndDate = new Date(endDate);

    // Iterate through each day, inclusive of the endDate
    while (currentDate <= aEndDate) {
      dates.push(new Date(currentDate)); // Add a copy of the current date to the array
      currentDate.setDate(currentDate.getDate() + 1); // Increment the date by 1 day
    }
    return dates;
  }

  /**
   * Filters hotel candidate entries by minimum and maximum nightly budget constraints over the stay duration.
   *
   * @param startDate - Arrival date.
   * @param endDate - Departure date.
   * @param roomType - Desired room type.
   * @param hotels - Candidate hotel price entries.
   * @param maxBudget - Optional maximum allowable nightly rate.
   * @param minBudget - Optional minimum allowable nightly rate.
   * @returns Array of search hotel entries with computed daily prices and total stay cost.
   */
  public static findHotelByBudget(
    startDate: Date,
    endDate: Date,
    roomType: string,
    hotels: HotelPriceEntry[],
    maxBudget?: number,
    minBudget?: number,
  ): SearchHotelEntry[] {
    // const dates = this.enumerateDates(startDate, endDate);

    let filterHotels = hotels.map((entry) => {
      const basePrices = PricingEngine.findPrices(
        startDate,
        endDate,
        entry.basePrice,
        roomType,
      );

      if (!basePrices || basePrices.length === 0) {
        return null;
      }

      const min = Math.min(...basePrices);
      const max = Math.max(...basePrices);

      let isOK = true;
      if (maxBudget && max > maxBudget) {
        isOK = false;
      }

      if (minBudget && min < minBudget) {
        isOK = false;
      }

      if (isOK) {
        return {
          hotelName: entry.hotelName,
          prices: basePrices,
          total: basePrices.reduce((acc, num) => acc + num, 0),
        };
      } else {
        return null;
      }
    });

    filterHotels = filterHotels.filter((entry: SearchHotelEntry) => {
      return entry ? true : false;
    });

    return filterHotels;
  }

  /**
   * Orchestrates catalog searching and price calculation across date ranges and budget parameters.
   *
   * @param startDate - Arrival date.
   * @param endDate - Departure date.
   * @param amenities - List of required amenity keys.
   * @param roomType - Array of acceptable room types.
   * @param maxBudget - Optional max nightly price.
   * @param minBudget - Optional min nightly price.
   * @param airport - Optional max airport distance in miles.
   * @param cityCenter - Optional max city center distance in miles.
   * @returns Matching hotel search entries with pricing.
   */
  public static async searchHotel(
    startDate: Date,
    endDate: Date,
    amenities: string[],
    roomType: string[],
    maxBudget?: number,
    minBudget?: number,
    airport?: number,
    cityCenter?: number,
  ): Promise<SearchHotelEntry[]> {
    const hotels = HotelCatalog.search(
      amenities,
      roomType,
      airport,
      cityCenter,
    ).map((hotel) => {
      return {
        hotelName: hotel.name,
        basePrice: hotel.level,
      };
    });
    const hotelEntries = PricingEngine.findHotelByBudget(
      startDate,
      endDate,
      roomType[0],
      hotels,
      maxBudget,
      minBudget,
    );
    return hotelEntries;
  }

  /**
   * Fetches detailed hotel comparison attributes (amenities, room types, distances) for selected hotel names.
   *
   * @param hotelNames - Array of hotel names to look up.
   * @returns Array of hotel comparison objects.
   */
  public static async fetchHotels(hotelNames: string[]): Promise<object[]> {
    const hotels = HotelCatalog.fetch(hotelNames).map((hotel) => {
      return {
        hotelName: hotel.name,
        amenities: hotel.amenities,
        roomType: hotel.roomType,
        airport: hotel.nearby.airport,
        cityCenter: hotel.nearby.cityCenter,
      };
    });

    return hotels;
  }
}
