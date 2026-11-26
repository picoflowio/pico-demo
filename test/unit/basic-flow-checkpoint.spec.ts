import assert from 'node:assert/strict';
import { register } from 'node:module';
import { test } from 'node:test';
import { AIMessage } from '@langchain/core/messages';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';

register('../mock-license-loader.mjs', import.meta.url);

const {
  CHECKPOINT_WRITE_CHANNELS,
  ConfigManager,
  FlowEngine,
  SQLiteSession,
} = await import('@picoflow/core');
const { AppModule } = await import('../../src/app.module.js');
const { BasicFlow } = await import('../../src/myflow/basic-flow/basic-flow.js');

class CheckpointEnabledBasicFlow extends BasicFlow {
  static override get id() {
    return BasicFlow.id;
  }

  protected override configCheckpointing() {
    return { ...super.configCheckpointing(), enabled: true };
  }
}

function createDeterministicOpenAiProvider() {
  return {
    provider: 'openai',
    resolve(selection: { provider: string; name: string }) {
      return {
        provider: selection.provider,
        name: selection.name,
        createInstance() {
          return {
            withStructuredOutput() {
              return {
                invoke: async () => ({
                  title: 'Quantum Drift',
                  genre: 'Sci-Fi',
                  releaseYear: 2028,
                  rating: 9,
                  summary: 'Teens navigate parallel timelines.',
                }),
              };
            },
            invoke: async (messages: Array<{ content?: unknown; type?: string }>) => {
              const systemPrompt = String(messages[0]?.content ?? '');
              const lastHuman = [...messages]
                .reverse()
                .find((m) => m.type === 'human');
              const userText = String(lastHuman?.content ?? '');

              if (systemPrompt.includes('ConcurStep1')) {
                return new AIMessage({
                  content: '',
                  tool_calls: [
                    { id: 'tc-concur1', name: 'complete_concurrent_step1', args: {} },
                  ],
                  usage_metadata: { input_tokens: 8, output_tokens: 4, total_tokens: 12 },
                });
              }
              if (systemPrompt.includes('ConcurStep2')) {
                return new AIMessage({
                  content: 'ConcurStep2 follow-up task is complete.',
                  usage_metadata: { input_tokens: 8, output_tokens: 4, total_tokens: 12 },
                });
              }
              if (systemPrompt.includes('ConcurStep3')) {
                return new AIMessage({
                  content: 'ConcurStep3 follow-up task is complete.',
                  usage_metadata: { input_tokens: 6, output_tokens: 3, total_tokens: 9 },
                });
              }
              if (systemPrompt.includes('ConcurStep4')) {
                return new AIMessage({
                  content: 'ConcurStep4 follow-up task is complete.',
                  usage_metadata: { input_tokens: 6, output_tokens: 3, total_tokens: 9 },
                });
              }
              if (systemPrompt.includes('two city aliases: LA and NYC')) {
                if (userText.includes('LA') && userText.includes('NYC')) {
                  return new AIMessage({
                    content: '',
                    tool_calls: [
                      { id: 'tc-la', name: 'get_weather', args: { cityName: 'LA' } },
                      { id: 'tc-nyc', name: 'get_weather', args: { cityName: 'NYC' } },
                    ],
                    usage_metadata: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
                  });
                }
                return new AIMessage({
                  content: 'Only LA and NYC are supported. Which cities would you like to compare?',
                  usage_metadata: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
                });
              }
              if (systemPrompt.includes('favoriteColor') || systemPrompt.includes('QUESTION_SCHEMA') || systemPrompt.includes('favorite')) {
                if (userText.includes('blue')) {
                  return new AIMessage({
                    content: JSON.stringify({
                      favoriteColor: 'blue',
                      favoriteMovie: 'Star Wars',
                      favoriteSeason: 'summer',
                    }),
                    usage_metadata: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
                  });
                }
                if (userText.includes('green')) {
                  return new AIMessage({
                    content: JSON.stringify({
                      favoriteColor: 'green',
                      favoriteMovie: 'Matrix',
                      favoriteSeason: 'winter',
                    }),
                    usage_metadata: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
                  });
                }
                return new AIMessage({
                  content: 'What are your favorite color, movie, and season?',
                  usage_metadata: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
                });
              }
              if (systemPrompt.includes('full name')) {
                if (userText.includes('John Wick') || userText.includes('Jane Smith')) {
                  const chosen = userText.includes('Jane Smith') ? 'Jane Smith' : 'John Wick';
                  return new AIMessage({
                    content: '',
                    tool_calls: [
                      { id: 'tc-name', name: 'user_name', args: { name: chosen } },
                    ],
                    usage_metadata: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
                  });
                }
                return new AIMessage({
                  content: 'Please provide your full name.',
                  usage_metadata: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
                });
              }
              return new AIMessage({
                content: 'Please provide your date of birth.',
                usage_metadata: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
              });
            },
          };
        },
        useTools(llm: unknown) {
          return llm;
        },
      };
    },
  };
}

test('BasicFlow persists checkpoints, parallel branch writes, and supports HTTP inspect/time-travel/fork/update', async () => {
  // No global checkpointStore or checkpointing config passed:
  // The flow's opt-in enables SQLite checkpointing lazily on the shared DB.
  const sessionStore = new SQLiteSession(':memory:');
  const engine = await FlowEngine.create({
    configManager: new ConfigManager({
      ignoreEnvFile: true,
      environment: {},
      values: { SESSION_STORE: 'SQLITE' },
    }),
    sessionStore,
    flows: [CheckpointEnabledBasicFlow],
    providers: [createDeterministicOpenAiProvider()],
  });
  assert.equal(engine.getCheckpointStore(), undefined);

  let app: NestFastifyApplication | undefined;
  try {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(FlowEngine)
      .useValue(engine)
      .compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    const server = app.getHttpAdapter().getInstance();
    await server.ready();

    // Turn 1: Start BasicFlow (WeatherStep)
    const t1Res = await server.inject({
      method: 'POST',
      url: '/ai/run',
      payload: {
        flowName: BasicFlow.id,
        message: 'Hi',
        config: { myRunData: { source: 'checkpoint-unit-test' } },
      },
    });
    assert.equal(t1Res.statusCode, 200, t1Res.payload);
    const t1 = JSON.parse(t1Res.payload) as { success: boolean; session: string };
    assert.equal(t1.success, true);
    const sessionId = t1.session;

    // Turn 2: WeatherStep -> FooLogicStep -> GooLogicStep -> FavoritesStep
    const t2Res = await server.inject({
      method: 'POST',
      url: '/ai/run',
      headers: { CHAT_SESSION_ID: sessionId },
      payload: { flowName: BasicFlow.id, message: 'Compare LA and NYC' },
    });
    assert.equal(t2Res.statusCode, 200, t2Res.payload);
    const afterWeatherCp = await engine.getCheckpoint(sessionId);
    assert.equal(afterWeatherCp?.checkpoint.session.flow.currentStep, 'FavoritesStep');

    // Turn 3: FavoritesStep -> NameStep
    const t3Res = await server.inject({
      method: 'POST',
      url: '/ai/run',
      headers: { CHAT_SESSION_ID: sessionId },
      payload: {
        flowName: BasicFlow.id,
        message: 'blue, Star Wars, summer',
      },
    });
    assert.equal(t3Res.statusCode, 200, t3Res.payload);

    // Turn 4: NameStep -> InContextStep (parallel ConcurStep1 + ConcurStep2) -> DOBStep
    const t4Res = await server.inject({
      method: 'POST',
      url: '/ai/run',
      headers: { CHAT_SESSION_ID: sessionId },
      payload: { flowName: BasicFlow.id, message: 'John Wick' },
    });
    assert.equal(t4Res.statusCode, 200, t4Res.payload);

    // Verify GET /ai/checkpoints lists step-crossings and parallel root-join
    const listRes = await server.inject({
      method: 'GET',
      url: '/ai/checkpoints',
      headers: { CHAT_SESSION_ID: sessionId },
    });
    assert.equal(listRes.statusCode, 200, listRes.payload);
    const listed = JSON.parse(listRes.payload) as {
      success: boolean;
      checkpoints: Array<{
        checkpoint: { id: string; session: { flow: { currentStep: string; steps: Array<{ name: string; state: Record<string, unknown> }> } } };
        metadata: { source: string; batchId?: string; stepId?: string };
        pendingWrites: Array<{ taskId: string; channel: string }>;
      }>;
    };
    assert.equal(listed.success, true);
    assert.ok(
      listed.checkpoints.some((c) => c.metadata.source === 'step-crossing'),
      'expected step-crossing checkpoints',
    );
    const rootJoin = listed.checkpoints.find(
      (c) =>
        c.metadata.source === 'root-join' &&
        c.metadata.stepId === 'InContextStep',
    );
    assert.ok(rootJoin, 'expected InContextStep root-join checkpoint');
    const batchId = rootJoin.metadata.batchId ?? '';
    assert.match(batchId, /^InContextStep:batch:[0-9]+$/);

    // Verify per-branch writes were persisted on the checkpoint preceding root-join
    const withBranchWrites = listed.checkpoints.find((c) =>
      c.pendingWrites.some(
        (w) =>
          w.taskId === `${batchId}:ConcurStep1` &&
          w.channel === CHECKPOINT_WRITE_CHANNELS.BRANCH_RESULT,
      ),
    );
    assert.ok(withBranchWrites, 'expected ConcurStep1 branch-result write');
    assert.ok(
      withBranchWrites.pendingWrites.some(
        (w) => w.taskId === `${batchId}:ConcurStep2`,
      ),
      'expected ConcurStep2 branch-result write',
    );

    // Verify GET /ai/checkpoints/latest
    const latestRes = await server.inject({
      method: 'GET',
      url: '/ai/checkpoints/latest',
      headers: { CHAT_SESSION_ID: sessionId },
    });
    assert.equal(latestRes.statusCode, 200);
    const latestBody = JSON.parse(latestRes.payload) as {
      checkpoint: { checkpoint: { session: { flow: { currentStep: string } } } };
    };
    assert.equal(latestBody.checkpoint.checkpoint.session.flow.currentStep, 'DOBStep');

    // Time-travel via POST /ai/run back to afterWeatherCp (FavoritesStep) with different favorites!
    const travelRes = await server.inject({
      method: 'POST',
      url: '/ai/run',
      headers: { CHAT_SESSION_ID: sessionId },
      payload: {
        flowName: BasicFlow.id,
        message: 'green, Matrix, winter',
        checkpointId: afterWeatherCp!.checkpoint.id,
      },
    });
    assert.equal(travelRes.statusCode, 200, travelRes.payload);
    const afterTravel = await engine.getCheckpoint(sessionId);
    const favState = afterTravel?.checkpoint.session.flow.steps.find(
      (s) => s.name === 'FavoritesStep',
    )?.state as Record<string, any>;
    assert.equal(favState?.favorites?.favoriteColor, 'green');

    // Fork into a new isolated session via POST /ai/checkpoints/:id/fork
    const forkRes = await server.inject({
      method: 'POST',
      url: `/ai/checkpoints/${afterWeatherCp!.checkpoint.id}/fork`,
      headers: { CHAT_SESSION_ID: sessionId },
      payload: { newSession: true },
    });
    assert.equal(forkRes.statusCode, 200, forkRes.payload);
    const forked = JSON.parse(forkRes.payload) as { success: boolean; session: string };
    assert.equal(forked.success, true);
    assert.notEqual(forked.session, sessionId);

    // Patch state on the forked session via POST /ai/checkpoints/state
    const patchRes = await server.inject({
      method: 'POST',
      url: '/ai/checkpoints/state',
      headers: { CHAT_SESSION_ID: forked.session },
      payload: {
        stepState: { WeatherStep: { note: 'patched-via-http' } },
        asStep: 'operator',
      },
    });
    assert.equal(patchRes.statusCode, 200, patchRes.payload);
    const patched = JSON.parse(patchRes.payload) as {
      checkpoint: {
        metadata: { source: string; stepId: string };
        checkpoint: { session: { flow: { steps: Array<{ name: string; state: Record<string, unknown> }> } } };
      };
    };
    assert.equal(patched.checkpoint.metadata.source, 'update');
    assert.equal(patched.checkpoint.metadata.stepId, 'operator');
    const weatherState = patched.checkpoint.checkpoint.session.flow.steps.find(
      (s) => s.name === 'WeatherStep',
    )?.state;
    assert.equal(weatherState?.note, 'patched-via-http');
  } finally {
    await app?.close();
    await engine.close();
  }
});
