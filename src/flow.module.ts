/*
 * Copyright (c) 2026 picoflow.io
 * This software is proprietary and confidential. Unauthorized copying, distribution
 * or modification of this file, via any medium, is strictly prohibited.
 */
import { Module } from '@nestjs/common';
import { FlowEngine } from '@picoflow/core';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule.forRoot()],
  providers: [FlowEngine],
  exports: [FlowEngine, ConfigModule],
})
export class FlowModule {}
