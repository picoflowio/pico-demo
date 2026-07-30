import {
  CityTemperature,
  handleJsonRpcMessage,
} from './city-temperature-mcp-server.js';

export async function callCityTemperatureMcpTool(
  cities: string[],
): Promise<CityTemperature[]> {
  const response = handleJsonRpcMessage({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'get_city_temperatures',
      arguments: { cities },
    },
  });

  if (response?.error) {
    throw new Error(response.error.message);
  }

  const content = response?.result?.content;
  const text = Array.isArray(content) ? content[0]?.text : undefined;
  if (typeof text !== 'string') {
    throw new Error('City temperature MCP tool returned an invalid response.');
  }

  const parsed = JSON.parse(text) as { temperatures?: CityTemperature[] };
  if (!Array.isArray(parsed.temperatures)) {
    throw new Error('City temperature MCP tool returned no temperatures.');
  }

  return parsed.temperatures;
}
