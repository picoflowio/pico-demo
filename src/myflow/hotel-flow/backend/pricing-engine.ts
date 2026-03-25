/*
 * Copyright (c) 2026 picoflow.io
 * This software is proprietary and confidential. Unauthorized copying, distribution
 * or modification of this file, via any medium, is strictly prohibited.
 */
import { CoreConfig } from '@picoflow/core';
import { MongoDB } from './mongo';
import { get } from 'lodash';
import { CosmoDB } from './cosmo';

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

// Helper function to get the nth weekday of a month (e.g., 3rd Monday of January)
function getNthWeekdayOfMonth(year: number, month: number, nth: number): Date {
  const firstDayOfMonth = new Date(year, month - 1, 1);
  const firstWeekday = firstDayOfMonth.getDay();
  const offset = (7 + nth - firstWeekday) % 7;
  return new Date(year, month - 1, 1 + offset + (nth - 1) * 7);
}

export class PricingEngine {
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

      if (!basePrices && basePrices.length > 0) {
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
    let docs;
    if (CoreConfig.documentDB === 'MONGO') {
      const mongo = new MongoDB();
      docs = await mongo.searchHotels(amenities, roomType, airport, cityCenter);
    } else if (CoreConfig.documentDB === 'COSMO') {
      const cosmo = new CosmoDB();
      docs = await cosmo.searchHotels(amenities, roomType, airport, cityCenter);
    }

    const hotels = docs.map((doc) => {
      return {
        hotelName: doc['name'],
        basePrice: doc['level'],
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

  public static async fetchHotels(hotelNames: string[]): Promise<object[]> {
    let docs;
    if (CoreConfig.documentDB === 'MONGO') {
      const mongo = new MongoDB();
      docs = await mongo.fetchHotels(hotelNames);
    } else if (CoreConfig.documentDB === 'COSMO') {
      const cosmo = new CosmoDB();
      docs = await cosmo.fetchHotels(hotelNames);
    }

    const hotels = docs.map((doc) => {
      return {
        hotelName: doc['name'],
        amenities: doc['amenities'],
        roomType: doc['roomType'],
        airport: get(doc, 'nearby.airport'),
        cityCenter: get(doc, 'nearby.cityCenter'),
      };
    });

    return hotels;
  }
}
