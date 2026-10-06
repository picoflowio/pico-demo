/*
- Copyright (c) 2026 picoflow.io
- This software is proprietary and confidential. Unauthorized copying, distribution
- or modification of this file, via any medium, is strictly prohibited.
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Agent, setGlobalDispatcher } from 'undici';

// Long LLM calls can exceed fetch's 300s default.
const llmHttpTimeoutMs = Number(process.env.LLM_HTTP_TIMEOUT_MS ?? 1_200_000);
setGlobalDispatcher(
  new Agent({
    headersTimeout: llmHttpTimeoutMs,
    bodyTimeout: llmHttpTimeoutMs,
  }),
);

const __dirname = dirname(fileURLToPath(import.meta.url));

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );
  app.enableShutdownHooks();

  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type, Accept, Authorization, CHAT_SESSION_ID',
    exposedHeaders: 'CHAT_SESSION_ID',
  });

  app.useStaticAssets({
    root: join(__dirname, '..', 'public'),
    prefix: '/public/',
  });

  // Create Swagger documents
  const config = new DocumentBuilder()
    .setTitle('Chat Flow API')
    .setDescription('API documentation for Chat Flow')
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  await app.listen(8000, '0.0.0.0');
}
bootstrap();
