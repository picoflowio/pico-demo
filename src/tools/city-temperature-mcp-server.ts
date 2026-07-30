import * as readline from 'node:readline';
import { pathToFileURL } from 'node:url';

type JsonRpcId = string | number | null;

type JsonRpcRequest = {
  jsonrpc: '2.0';
  id?: JsonRpcId;
  method: string;
  params?: Record<string, any>;
};

type JsonRpcResponse = {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result?: Record<string, any>;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
};

export type CityTemperature = {
  city: string;
  temperature: number | null;
};

const TOOL_NAME = 'get_city_temperatures';
const DEFAULT_PROTOCOL_VERSION = '2024-11-05';

export function getCityTemperatures(cities: string[]): CityTemperature[] {
  return cities.map((city) => ({
    city,
    temperature: temperatureForCity(city),
  }));
}

export function handleJsonRpcMessage(
  message: unknown,
): JsonRpcResponse | undefined {
  if (!isJsonRpcRequest(message)) {
    const id = isRecord(message) && 'id' in message ? message.id : null;
    return jsonRpcError(toJsonRpcId(id), -32600, 'Invalid Request');
  }

  if (!('id' in message)) {
    return undefined;
  }

  switch (message.method) {
    case 'initialize':
      return jsonRpcResult(message.id, {
        protocolVersion:
          typeof message.params?.protocolVersion === 'string'
            ? message.params.protocolVersion
            : DEFAULT_PROTOCOL_VERSION,
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: 'city-temperature-mcp-server',
          version: '0.1.0',
        },
      });

    case 'ping':
      return jsonRpcResult(message.id, {});

    case 'tools/list':
      return jsonRpcResult(message.id, {
        tools: [
          {
            name: TOOL_NAME,
            description:
              'Return temperatures for city abbreviations. NYC returns 83, LA returns 72, and other city names return null.',
            inputSchema: {
              type: 'object',
              properties: {
                cities: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'City names or abbreviations to look up.',
                },
              },
              required: ['cities'],
              additionalProperties: false,
            },
          },
        ],
      });

    case 'tools/call':
      return handleToolCall(message);

    case 'resources/list':
      return jsonRpcResult(message.id, { resources: [] });

    case 'prompts/list':
      return jsonRpcResult(message.id, { prompts: [] });

    default:
      return jsonRpcError(
        message.id,
        -32601,
        `Method not found: ${message.method}`,
      );
  }
}

export function startCityTemperatureMcpServer(): void {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
    terminal: false,
  });

  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    try {
      const response = handleJsonRpcMessage(JSON.parse(trimmed));
      if (response) {
        process.stdout.write(`${JSON.stringify(response)}\n`);
      }
    } catch (error) {
      const response = jsonRpcError(null, -32700, 'Parse error', {
        message: error instanceof Error ? error.message : String(error),
      });
      process.stdout.write(`${JSON.stringify(response)}\n`);
    }
  });
}

function handleToolCall(request: JsonRpcRequest): JsonRpcResponse {
  const name = request.params?.name;
  const args = request.params?.arguments;

  if (name !== TOOL_NAME) {
    return jsonRpcError(request.id, -32602, `Unknown tool: ${name}`);
  }

  if (
    !isRecord(args) ||
    !Array.isArray(args.cities) ||
    !args.cities.every((city) => typeof city === 'string')
  ) {
    return jsonRpcError(
      request.id,
      -32602,
      'Tool arguments must include cities as an array of strings.',
    );
  }

  const temperatures = getCityTemperatures(args.cities);
  return jsonRpcResult(request.id, {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ temperatures }, null, 2),
      },
    ],
  });
}

function temperatureForCity(city: string): number | null {
  const normalized = city.trim().toLowerCase();
  if (normalized === 'nyc') {
    return 83;
  }
  if (normalized === 'la') {
    return 72;
  }
  return null;
}

function isJsonRpcRequest(message: unknown): message is JsonRpcRequest {
  return (
    isRecord(message) &&
    message.jsonrpc === '2.0' &&
    typeof message.method === 'string' &&
    (!('id' in message) || isJsonRpcId(message.id))
  );
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isJsonRpcId(value: unknown): value is JsonRpcId {
  return (
    typeof value === 'string' || typeof value === 'number' || value === null
  );
}

function toJsonRpcId(value: unknown): JsonRpcId {
  return isJsonRpcId(value) ? value : null;
}

function jsonRpcResult(
  id: JsonRpcId,
  result: Record<string, any>,
): JsonRpcResponse {
  return {
    jsonrpc: '2.0',
    id,
    result,
  };
}

function jsonRpcError(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
      ...(data === undefined ? {} : { data }),
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startCityTemperatureMcpServer();
}
