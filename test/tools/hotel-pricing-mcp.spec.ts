/*
- Copyright (c) 2026 picoflow.io
- This software is proprietary and confidential. Unauthorized copying, distribution
- or modification of this file, via any medium, is strictly prohibited.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import {
  HOTEL_PRICING_MCP_TOOL,
  HotelPricingSearchRequestSchema,
} from '../../src/tools/hotel-pricing-contract.js';
import {
  closeHotelPricingMcpClient,
  searchHotelsViaMcp,
} from '../../src/tools/hotel-pricing-mcp-client.js';
import { createHotelPricingMcpServer } from '../../src/tools/hotel-pricing-mcp-server.js';

test('hotel pricing MCP exposes and serves typed hotel searches', async () => {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const server = createHotelPricingMcpServer();
  const client = new Client({
    name: 'hotel-pricing-mcp-test',
    version: '1.0.0',
  });

  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const { tools } = await client.listTools();
    assert.ok(
      tools.some((tool) => tool.name === HOTEL_PRICING_MCP_TOOL),
      'Expected search_hotels to be advertised by the MCP server',
    );

    const request = HotelPricingSearchRequestSchema.parse({
      startDate: '2027-08-01',
      endDate: '2027-08-08',
      amenities: ['freeWiFi', 'freeParking'],
      roomTypes: ['two beds'],
      budget: { min: null, max: 700 },
      maxDistanceMiles: { airport: null, cityCenter: null },
    });
    const result = await client.callTool({
      name: HOTEL_PRICING_MCP_TOOL,
      arguments: request,
    });

    assert.notEqual(result.isError, true);
    assert.ok(result.structuredContent);
    const output = result.structuredContent as {
      hotels: Array<{ hotelName: string; prices: number[]; total: number }>;
    };
    assert.ok(output.hotels.length > 0);
    assert.ok(output.hotels.every((hotel) => hotel.prices.length === 8));
    assert.ok(output.hotels.every((hotel) => hotel.total > 0));
  } finally {
    await client.close();
    await server.close();
  }
});

test('hotel pricing MCP rejects invalid tool arguments', async () => {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const server = createHotelPricingMcpServer();
  const client = new Client({
    name: 'hotel-pricing-mcp-test',
    version: '1.0.0',
  });

  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const result = await client.callTool({
      name: HOTEL_PRICING_MCP_TOOL,
      arguments: { startDate: '2027-08-01' },
    });
    assert.equal(result.isError, true);
  } finally {
    await client.close();
    await server.close();
  }
});

test('hotel pricing MCP client reaches the local stdio service', async () => {
  try {
    const hotels = await searchHotelsViaMcp({
      startDate: '2027-08-01',
      endDate: '2027-08-08',
      amenities: ['freeWiFi'],
      roomTypes: ['one bed'],
      budget: { min: null, max: 700 },
      maxDistanceMiles: { airport: null, cityCenter: null },
    });

    assert.ok(hotels.length > 0);
  } finally {
    await closeHotelPricingMcpClient();
  }
});
