/*
- Copyright (c) 2026 picoflow.io
- This software is proprietary and confidential. Unauthorized copying, distribution
- or modification of this file, via any medium, is strictly prohibited.
 */
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { fileURLToPath } from 'node:url';
import {
  HOTEL_PRICING_MCP_TOOL,
  HotelPricingSearchRequestSchema,
  HotelPricingSearchResponseSchema,
  type HotelPricingSearchRequest,
  type HotelPricingSearchResponse,
} from './hotel-pricing-contract.js';

const MCP_TIMEOUT_MS = 10_000;

let clientPromise: Promise<Client> | undefined;

export async function searchHotelsViaMcp(
  request: HotelPricingSearchRequest,
): Promise<HotelPricingSearchResponse['hotels']> {
  const validatedRequest = HotelPricingSearchRequestSchema.parse(request);
  const client = await getClient();
  const result = await client.callTool(
    {
      name: HOTEL_PRICING_MCP_TOOL,
      arguments: validatedRequest,
    },
    { timeout: MCP_TIMEOUT_MS },
  );

  if (result.isError) {
    throw new Error(`Hotel pricing MCP error: ${readMcpError(result.content)}`);
  }

  const parsed = HotelPricingSearchResponseSchema.safeParse(
    result.structuredContent,
  );
  if (!parsed.success) {
    throw new Error('Hotel pricing MCP returned an invalid structured result.');
  }

  return parsed.data.hotels;
}

export async function closeHotelPricingMcpClient(): Promise<void> {
  const activeClient = clientPromise;
  clientPromise = undefined;
  if (activeClient) {
    await (await activeClient).close();
  }
}

async function getClient(): Promise<Client> {
  clientPromise ??= connectClient();
  try {
    return await clientPromise;
  } catch (error) {
    clientPromise = undefined;
    throw error;
  }
}

async function connectClient(): Promise<Client> {
  const client = new Client({
    name: 'picoflow-hotel-flow',
    version: '1.0.0',
  });
  const transport = new StdioClientTransport(getServerParameters());
  await client.connect(transport);
  return client;
}

function getServerParameters(): ConstructorParameters<
  typeof StdioClientTransport
>[0] {
  const currentFile = fileURLToPath(import.meta.url);
  if (currentFile.endsWith('.ts')) {
    return {
      command: process.execPath,
      args: [
        '--import',
        'tsx',
        fileURLToPath(new URL('./hotel-pricing-mcp-server.ts', import.meta.url)),
      ],
      stderr: 'pipe',
    };
  }

  return {
    command: process.execPath,
    args: [
      fileURLToPath(new URL('./hotel-pricing-mcp-server.js', import.meta.url)),
    ],
    stderr: 'pipe',
  };
}

function readMcpError(content: unknown): string {
  if (Array.isArray(content)) {
    const text = content.find(
      (item): item is { type: 'text'; text: string } =>
        typeof item === 'object' &&
        item !== null &&
        'type' in item &&
        item.type === 'text' &&
        'text' in item &&
        typeof item.text === 'string',
    );
    if (text) {
      return text.text;
    }
  }
  return 'unknown tool failure';
}
