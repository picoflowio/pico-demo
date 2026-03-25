/*
 * Copyright (c) 2026 picoflow.io
 * This software is proprietary and confidential. Unauthorized copying, distribution
 * or modification of this file, via any medium, is strictly prohibited.
 */
import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';

@Controller('healthcheck')
export class HealthController {
  @Get()
  @HttpCode(HttpStatus.OK)
  check() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
