/*
 * Copyright (c) 2026 picoflow.io
 * This software is proprietary and confidential. Unauthorized copying, distribution
 * or modification of this file, via any medium, is strictly prohibited.
 */
import { MongoClient } from 'mongodb';
import { CoreConfig } from '@picoflow/core';

export class MongoDB {
  private client;
  constructor() {
    this.client = new MongoClient(CoreConfig.mongoURL);
  }

  async searchHotels(
    amenities: string[],
    roomType: string[],
    airport?: number,
    cityCenter?: number,
  ): Promise<object[]> {
    const db = this.client.db(CoreConfig.mongoDB);
    const collection = db.collection('hotels');

    let realAmenities = {};
    // Only build realAmenities filter if amenities array is not empty
    if (amenities.length > 0) {
      realAmenities = amenities.reduce((acc, item) => {
        const newKey = `amenities.${item}`;
        acc[newKey] = true;
        return acc;
      }, {});
    }

    // Only build roomType filter if roomType array is not empty
    let roomTypeFilter = {};
    if (roomType.length > 0) {
      roomTypeFilter = {
        roomType: { $in: [...roomType] },
      };
    }

    // Only build airport filter if airport is not null
    let airportFilter = {};
    if (airport != null) {
      airportFilter = {
        'nearby.airport': { $lt: airport },
      };
    }

    // Only build cityCenter filter if cityCenter is not null
    let cityCenterFilter = {};
    if (cityCenter != null) {
      cityCenterFilter = {
        'nearby.cityCenter': { $lt: cityCenter },
      };
    }

    try {
      const docs = await collection
        .find({
          $and: [
            // Only include the realAmenities filter if amenities array is not empty
            ...(Object.keys(realAmenities).length > 0
              ? [{ ...realAmenities }]
              : []),

            // Only include the roomType filter if roomType array is not empty
            ...(Object.keys(roomTypeFilter).length > 0 ? [roomTypeFilter] : []),

            // Only include the airport filter if airport is not null
            ...(Object.keys(airportFilter).length > 0 ? [airportFilter] : []),

            // Only include the cityCenter filter if cityCenter is not null
            ...(Object.keys(cityCenterFilter).length > 0
              ? [cityCenterFilter]
              : []),
          ],
        })
        .toArray();
      return docs;
    } catch (ex) {
      console.log(ex);
      throw ex;
    }
  }

  async fetchHotels(hotelNames: string[]): Promise<object[]> {
    const db = this.client.db(CoreConfig.mongoDB);
    const collection = db.collection('hotels');
    try {
      const docs = await collection
        .find({ name: { $in: hotelNames } })
        .toArray();
      return docs;
    } catch (ex) {
      console.log(ex);
      throw ex;
    }
  }
}
