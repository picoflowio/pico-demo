/*
 * Copyright (c) 2026 picoflow.io
 * This software is proprietary and confidential. Unauthorized copying, distribution
 * or modification of this file, via any medium, is strictly prohibited.
 */
import { Module } from '@nestjs/common';
import { FlowModule } from './flow.module.js';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './controllers/health-controller.js';
import { ChatController } from './controllers/chat-controller.js';
@Module({
  imports: [FlowModule, ConfigModule],
  controllers: [ChatController, HealthController],
})
export class AppModule {}
