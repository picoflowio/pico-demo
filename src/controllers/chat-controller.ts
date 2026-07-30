/*
 *
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
import { ApiResponse, ApiBody, ApiTags, ApiHeader } from '@nestjs/swagger';
import { CoreConfig, FlowEngine, K } from '@picoflow/core';
import { Model } from '@picoflow/core/models/model-registry';
import { HotelFlow } from '../myflow/hotel-flow/hotel-flow.js';
import { MedicalFlow } from '../myflow/medical-flow/medical-flow.js';
import {
  ApiEndResponseDto,
  ApiRunResponse400Dto,
  ApiRunResponseDto,
  ApiEndResponse400Dto,
  ApiRunBodyDto,
} from './api-types.js';
import { TravelFlow } from '../myflow/travel-flow/travel-flow.js';
import { BasicFlow } from '../myflow/basic-flow/basic-flow.js';

type FlowEngineReply = Parameters<FlowEngine['run']>[0];

@ApiTags('ai')
@Controller('ai')
export class ChatController {
  constructor(private flowEngine: FlowEngine) {
    //register flows
    flowEngine.registerFlows({ BasicFlow, HotelFlow, TravelFlow, MedicalFlow });
    flowEngine.registerModel(
      new Model('gpt-5.1', {
        apiKey: CoreConfig.OpenAIKey,
        maxRetries: CoreConfig.llmRetry,
        reasoning: { effort: 'low' },
        useResponsesApi: true,
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
    // @Req() req: Request,
    @Res() res: FlowEngineReply,
    @Body(K.message) userMessage: string,
    @Body(K.flowName) flowName: string,
    @Body('config') config: object,
    @Headers(K.ChatSessionID) sessionId?: string,
  ) {
    await this.flowEngine.run(res, flowName, userMessage, sessionId, config);
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
    @Res() res: FlowEngineReply,
    @Headers(K.ChatSessionID) sessionId?: string,
  ) {
    const result = await this.flowEngine.endChat(sessionId);
    if (!result.success) {
      res.status(HttpStatus.BAD_REQUEST);
    }
    res.send(result);
  }
  //.................................................................
  // @Post('test')
  // async test(
  //   @Body('maxBudget') maxBudget: number,
  //   @Body('minBudget') minBudget: number,
  // ) {
  //   const startDate = new Date('7/01/2025');
  //   const endDate = new Date('7/06/2025');
  //   const roomType = ['one bed'];
  //   const amenities = ['freeWiFi', 'freeParking'];
  //   const hotelEntries = await PricingEngine.searchHotel(
  //     startDate,
  //     endDate,
  //     amenities,
  //     roomType,
  //     maxBudget,
  //     minBudget,
  //   );
  //   console.log(hotelEntries);
  //   return { success: true };
  // }
}
