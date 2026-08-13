/*
- Copyright (c) 2026 picoflow.io
- This software is proprietary and confidential. Unauthorized copying, distribution
- or modification of this file, via any medium, is strictly prohibited.
 */
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { fileURLToPath } from 'node:url';
import { PricingEngine } from '../myflow/hotel-flow/backend/pricing-engine.js';
import {
  HOTEL_PRICING_MCP_TOOL,
  HotelPricingSearchRequestSchema,
  HotelPricingSearchResponseSchema,
} from './hotel-pricing-contract.js';

export { HOTEL_PRICING_MCP_TOOL } from './hotel-pricing-contract.js';

export function createHotelPricingMcpServer(): McpServer {
  const server = new McpServer({
    name: 'hotel-pricing-mcp-server',
    version: '1.0.0',
  });

  server.registerTool(
    HOTEL_PRICING_MCP_TOOL,
    {
      title: 'Search Portland hotels',
      description:
        'Search the bundled Portland hotel catalog and calculate nightly and total prices for the requested stay.',
      inputSchema: HotelPricingSearchRequestSchema,
      outputSchema: HotelPricingSearchResponseSchema,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async (request) => {
      const hotels = await PricingEngine.searchHotel(
        new Date(request.startDate),
        new Date(request.endDate),
        request.amenities,
        request.roomTypes,
        request.budget.max ?? undefined,
        request.budget.min ?? undefined,
        request.maxDistanceMiles.airport ?? undefined,
        request.maxDistanceMiles.cityCenter ?? undefined,
      );
      const output = { hotels };

      return {
        structuredContent: output,
        // Keep a text representation for MCP clients that have not adopted
        // structuredContent yet.
        content: [{ type: 'text', text: JSON.stringify(output) }],
      };
    },
  );

  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  serveStdio(createHotelPricingMcpServer);
}
