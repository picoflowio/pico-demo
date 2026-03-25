/*
 * Copyright (c) 2026 picoflow.io
 * This software is proprietary and confidential. Unauthorized copying, distribution
 * or modification of this file, via any medium, is strictly prohibited.
 */
import { Container, CosmosClient } from '@azure/cosmos';
import { CoreConfig } from '@picoflow/core';

export class CosmoDB {
  private client: CosmosClient;
  constructor() {
    const endpoint = CoreConfig.cosmoDbUrl;
    const key = CoreConfig.cosmoDbKey;
    this.client = new CosmosClient({ endpoint, key });
  }

  private async getContainer(): Promise<Container> {
    const { database } = await this.client.databases.createIfNotExists({
      id: CoreConfig.cosmoDbId,
    });
    const { container } = await database.containers.createIfNotExists({
      id: 'hotels', // Assuming the container for hotels is named 'hotels'
    });
    return container;
  }

  async searchHotels(
    amenities: string[],
    roomType: string[],
    airport?: number,
    cityCenter?: number,
  ): Promise<object[]> {
    const container = await this.getContainer();
    const conditions: string[] = [];

    if (amenities && amenities.length > 0) {
      amenities.forEach((amenity) => {
        conditions.push(`c.amenities.${amenity} = true`);
      });
    }

    if (roomType && roomType.length > 0) {
      const roomTypesString = roomType.map((rt) => `'${rt}'`).join(', ');
      conditions.push(`ARRAY_CONTAINS(c.roomType, ${roomTypesString})`);
    }

    if (airport != null) {
      conditions.push(`c.nearby.airport < ${airport}`);
    }

    if (cityCenter != null) {
      conditions.push(`c.nearby.cityCenter < ${cityCenter}`);
    }

    let query = 'SELECT * FROM c';
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    try {
      const { resources } = await container.items.query(query).fetchAll();
      return resources;
    } catch (ex) {
      console.log(ex);
      throw ex;
    }
  }

  async fetchHotels(hotelNames: string[]): Promise<object[]> {
    const container = await this.getContainer();
    if (!hotelNames || hotelNames.length === 0) {
      return [];
    }

    const hotelNamesString = hotelNames.map((name) => `'${name}'`).join(', ');
    const query = `SELECT * FROM c WHERE c.name IN (${hotelNamesString})`;

    try {
      const { resources } = await container.items.query(query).fetchAll();
      return resources;
    } catch (ex) {
      console.log(ex);
      throw ex;
    }
  }
}
