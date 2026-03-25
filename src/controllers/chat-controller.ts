/*
 * Copyright (c) 2026 picoflow.io
 * This software is proprietary and confidential. Unauthorized copying, distribution
 * or modification of this file, via any medium, is strictly prohibited.
 */
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Res,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { ApiResponse, ApiBody, ApiTags, ApiHeader } from '@nestjs/swagger';
import { K } from '@picoflow/core/utils/constants';
import { CoreConfig } from '@picoflow/core';
import { FlowEngine } from '@picoflow/core';
import { Model } from '@picoflow/core/models/model-registry';
import {
  ApiEndResponseDto,
  ApiRunResponse400Dto,
  ApiRunResponseDto,
  ApiEndResponse400Dto,
  ApiRunBodyDto,
} from './api-types';
import { HotelFlow } from 'src/myflow/hotel-flow/hotel-flow';
import { BasicFlow } from 'src/myflow/basic-flow/basic-flow';
import { MedicalFlow } from 'src/myflow/medical-flow/medical-flow';
import { TravelFlow } from 'src/myflow/travel-flow/travel-flow';

@ApiTags('ai')
@Controller('ai')
export class ChatController {
  constructor(private flowEngine: FlowEngine) {
    //register flows
    flowEngine.registerFlows({ BasicFlow, HotelFlow , TravelFlow , MedicalFlow});

    //register models

    flowEngine.registerModel(
      new Model('gpt-5', {
        apiKey: CoreConfig.OpenAIKey,
        maxRetries: CoreConfig.llmRetry,
        reasoning: { effort: 'low' },
      }),
      true,
    );

    flowEngine.registerModel(
      new Model('gpt-4o', {
        temperature: CoreConfig.llmTemperature,
        apiKey: CoreConfig.OpenAIKey,
        maxRetries: CoreConfig.llmRetry,
      }),
      true,
    );
  }
  //.................................................................
  @HttpCode(HttpStatus.OK)
  @Post('run')
  @ApiHeader({
    name: 'CHAT_SESSION_ID',
    description: 'Chat session identifier',
    required: false,
  })
  @ApiBody({ type: ApiRunBodyDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Bot responded successfully',
    type: ApiRunResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Bot encountered problems',
    type: ApiRunResponse400Dto,
  })
  async run(
    @Res() res: FastifyReply,
    @Body(K.message) userMessage: string,
    @Body(K.flowName) flowName: string,
    @Body('config') config: object,
    @Headers(K.ChatSessionID) sessionId?: string,
  ) {
    await this.flowEngine.run(res, flowName, userMessage, sessionId, config);
  }
  //.................................................................
  @Post('end')
  @ApiHeader({
    name: 'CHAT_SESSION_ID',
    description: 'Chat session identifier',
    required: true,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Bot responded successfully',
    type: ApiEndResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Bot encountered problems',
    type: ApiEndResponse400Dto,
  })
  async endChat(
    @Res() res: FastifyReply,
    @Headers(K.ChatSessionID) sessionId?: string,
  ) {
    const result = await this.flowEngine.endChat(sessionId);
    if (!result.success) {
      res.status(HttpStatus.BAD_REQUEST);
    }
    res.send(result);
  }
  //.................................................................
  @Get('flows')
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'List of registered flow names',
    schema: { type: 'array', items: { type: 'string', example: 'BasicFlow' } },
  })
  getFlows() {
    return this.flowEngine.getFlowNames();
  }
}
