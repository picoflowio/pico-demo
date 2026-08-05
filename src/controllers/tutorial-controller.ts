/*
- Copyright (c) 2026 picoflow.io
- This software is proprietary and confidential. Unauthorized copying, distribution
- or modification of this file, via any medium, is strictly prohibited.
 */
import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Res,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { K } from '@picoflow/core';
import { FlowEngine } from '@picoflow/core';

@Controller('ai')
export class TutorialController {
  constructor(@Inject(FlowEngine) private flowEngine: FlowEngine) {}
  //.................................................................
  @HttpCode(HttpStatus.OK)
  @Post('chat')
  async chat(
    @Res() res: FastifyReply,
    @Body(K.message) userMessage: string,
    @Body(K.flowName) flowName: string,
    @Body('config') config: object,
    @Headers(K.ChatSessionID) sessionId?: string,
  ) {
    const result = await this.flowEngine.run({
      flowName,
      userMessage,
      sessionId,
      config,
    });
    if (result.session) {
      res.header(K.ChatSessionID, result.session);
    }
    if (!result.success) {
      res.status(HttpStatus.BAD_REQUEST);
    }
    return res.send(result);
  }
}
