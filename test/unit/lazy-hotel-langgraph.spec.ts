import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test, mock } from 'node:test';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { FlowEngine } from '@picoflow/core';
import { AppModule } from '../../src/app.module.js';
import { HotelLanggraph, LazyHotelLanggraph } from '../../src/myflow/hotel-langgraph/hotel-langgraph.js';
import { MemoryHotelSessionStore } from '../../src/myflow/hotel-langgraph/hotel-session-store.js';
import { hotelTestModelFactory } from '../hotel-langgraph/hotel-langgraph-test-model.js';

test('lazy Nest provider exposes stored state after the 14-turn hotel scenario', async () => {
  const store = new MemoryHotelSessionStore();
  const close = mock.method(store, 'close', async () => {});
  const initialize = mock.method(HotelLanggraph, 'createFromEnvironment', async () =>
    new HotelLanggraph(hotelTestModelFactory, store),
  );
  let app: NestFastifyApplication | undefined;
  try {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(FlowEngine)
      .useValue({ close: async () => {} })
      .compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    const server = app.getHttpAdapter().getInstance();
    await server.ready();
    const graph = app.get<LazyHotelLanggraph>(HotelLanggraph);
    assert(graph instanceof LazyHotelLanggraph);
    assert.equal(initialize.mock.callCount(), 0);
    assert.equal(graph.sessionStoreKind, undefined);

    const scenario = JSON.parse(readFileSync(
      new URL('../hotel-langgraph/hotel-langgraph.scenario.json', import.meta.url), 'utf8',
    )) as { turns: Array<{ input: string; completed: boolean }> };
    assert.equal(scenario.turns.length, 14);
    let sessionId: string | undefined;
    for (const turn of scenario.turns) {
      const response = await server.inject({
        method: 'POST', url: '/ai-langgraph/run',
        headers: { 'content-type': 'application/json', ...(sessionId ? { SESSION_ID: sessionId } : {}) },
        payload: { graphName: 'HotelLanggraph', message: turn.input },
      });
      assert.equal(response.statusCode, 200, response.payload);
      const body = JSON.parse(response.payload);
      assert.equal(body.success, true);
      assert.equal(body.completed, turn.completed);
      sessionId ??= body.session;
      assert.equal(body.session, sessionId);
      assert.equal(response.headers.session_id, sessionId);
    }

    assert(sessionId);
    assert.equal(graph.sessionStoreKind, 'memory');
    assert.equal(await graph.hasSession(sessionId), true);
    const state = await graph.getSessionState(sessionId);
    assert(state, 'final session state must be readable through the lazy provider');
    assert.equal(state.phase, 'terminal');
    assert.equal(state.completed, true);
    assert.equal(state.criteria?.cDate.start, '2027-08-01');
    assert.equal(state.criteria?.cDate.end, '2027-08-08');
    assert.deepEqual(state.criteria?.cRoomType, ['two beds']);
    assert.deepEqual(state.criteria?.cAmenities, ['freeWiFi', 'freeParking']);
    assert.equal(state.bookedHotel, 'Hampton Inn Sherwood Portland');
    assert.equal(state.hotelFound[7]?.hotelName, state.bookedHotel, 'booked property must match hotel number 8');
    assert.equal(state.confirmationNumber?.toString().length, 6);
    assert.equal((await graph.deleteSession(sessionId)).status, 200);
    assert.equal(await graph.hasSession(sessionId), false);
    assert.equal(await graph.getSessionState(sessionId), undefined);
    assert.equal(initialize.mock.callCount(), 1);
  } finally {
    try {
      await app?.close();
      if (app) assert.equal(close.mock.callCount(), 1);
    } finally {
      initialize.mock.restore();
      close.mock.restore();
    }
  }
});
