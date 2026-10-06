import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import { Container, CosmosClient, Databases } from '@azure/cosmos';
import type { ConfigService } from '@nestjs/config';
import { MongoClient, type Db } from 'mongodb';
import { FlowEngine } from '@picoflow/core';
import { AppModule } from '../../src/app.module.js';
import { HotelLanggraph, type LazyHotelLanggraph } from '../../src/myflow/hotel-langgraph/hotel-langgraph.js';

type EngineProvider = { provide: unknown; useFactory: (config: ConfigService) => Promise<FlowEngine> };
const providers = Reflect.getMetadata('providers', AppModule) as EngineProvider[];
const provider = providers.find(entry => entry.provide === FlowEngine)!;
function config(values: Record<string, string>): ConfigService {
  return {
    get: (key: string, fallback?: string) => values[key] ?? fallback,
    getOrThrow: (key: string) => {
      const value = values[key];
      if (value === undefined) throw new Error(key + ' is required.');
      return value;
    },
  } as ConfigService;
}

test('configures memory inline without initializing unused databases', async () => {
  assert(provider);
  const engine = await provider.useFactory(config({ SESSION_STORE: 'MEMORY' }));
  assert(engine.getFlowNames().includes('BasicFlow'));
  await engine.close();
});

test('validates connection URLs explicitly in the application callbacks', async () => {
  await assert.rejects(provider.useFactory(config({
    SESSION_STORE: 'MONGO', MONGODB_NAME: 'test', MONGODB_COLLECTION: 'sessions',
  })), /MONGODB_URL/);
  await assert.rejects(provider.useFactory(config({
    SESSION_STORE: 'COSMO', COSMODB_ID: 'test', COSMODB_SESSION_ID: 'sessions',
  })), /COSMODB_URL/);
});

test('closes the inline Mongo client on shutdown and failed initialization', async () => {
  let closes = 0;
  let failConnect = false;
  const connect = mock.method(MongoClient.prototype, 'connect', async function(this: MongoClient) {
    if (failConnect) throw new Error('connect failed');
    return this;
  });
  const database = mock.method(MongoClient.prototype, 'db', () => ({ collection: () => ({}) }) as unknown as Db);
  const close = mock.method(MongoClient.prototype, 'close', async () => { closes += 1; });
  try {
    const settings = config({
      SESSION_STORE: 'MONGO', MONGODB_URL: 'mongodb://localhost:27017',
      MONGODB_NAME: 'test', MONGODB_COLLECTION: 'sessions',
    });
    await (await provider.useFactory(settings)).close();
    assert.equal(closes, 1);
    failConnect = true;
    await assert.rejects(provider.useFactory(settings), /connect failed/);
    assert.equal(closes, 2);
  } finally {
    connect.mock.restore();
    database.mock.restore();
    close.mock.restore();
  }
});

test('accepts Cosmos key, service-principal, and default Azure credentials inline', async () => {
  let closes = 0;
  const originalDispose = CosmosClient.prototype.dispose;
  const dispose = mock.method(CosmosClient.prototype, 'dispose', function(this: CosmosClient) {
    closes += 1;
    originalDispose.call(this);
  });
  const provision = mock.method(Databases.prototype, 'createIfNotExists', async () => { throw new Error('unexpected provisioning'); });
  const read = mock.method(Container.prototype, 'read', async () => ({ resource: { partitionKey: { paths: ['/id'] } } }));
  try {
    const settings = {
      SESSION_STORE: 'COSMO', COSMODB_URL: 'https://example.documents.azure.com',
      COSMODB_ID: 'test', COSMODB_SESSION_ID: 'sessions', COSMOS_CREATE_IF_NOT_EXISTS: 'false',
    };
    for (const credentials of [
      { COSMODB_KEY: 'test-key' },
      {
        AZURE_TENANT_ID: '00000000-0000-0000-0000-000000000000',
        COSMO_DB_CLIENT_ID: '00000000-0000-0000-0000-000000000001',
        COSMO_DB_CLIENT_SECRET: 'test-secret',
      },
      {},
    ]) {
      await (await provider.useFactory(config({ ...settings, ...credentials }))).close();
    }
    assert.equal(closes, 3);
    assert.equal(provision.mock.callCount(), 0);
    await assert.rejects(provider.useFactory(config({
      ...settings, COSMO_DB_CLIENT_ID: 'incomplete',
    })), /service principal requires/);
  } finally {
    dispose.mock.restore();
    provision.mock.restore();
    read.mock.restore();
  }
});

test('application shutdown closes the FlowEngine and comparison graph', async () => {
  let engineCloses = 0;
  let comparisonCloses = 0;
  const module = new AppModule(
    { close: async () => { engineCloses += 1; } } as FlowEngine,
    { close: async () => { comparisonCloses += 1; } } as never,
  );
  await module.onApplicationShutdown();
  assert.equal(engineCloses, 1);
  assert.equal(comparisonCloses, 1);
});

test('unused comparison graph does not initialize its unsupported session store', async () => {
  const initialize = mock.method(HotelLanggraph, 'createFromEnvironment', async () => {
    throw new Error('unsupported comparison session store');
  });
  try {
    const comparisonProvider = providers.find(entry => entry.provide === HotelLanggraph)!;
    const graph = comparisonProvider.useFactory(config({ SESSION_STORE: 'COSMO' })) as unknown as LazyHotelLanggraph;
    await graph.close();
    assert.equal(initialize.mock.callCount(), 0);
    await assert.rejects(graph.run({ userMessage: 'Hi' }), /unsupported comparison session store/);
    assert.equal(initialize.mock.callCount(), 1);
  } finally {
    initialize.mock.restore();
  }
});
