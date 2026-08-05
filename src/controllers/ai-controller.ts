/*
- Copyright (c) 2026 picoflow.io
- This software is proprietary and confidential. Unauthorized copying, distribution
- or modification of this file, via any medium, is strictly prohibited.
 */
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Res,
} from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { ApiResponse, ApiBody, ApiTags, ApiHeader } from "@nestjs/swagger";
import { K } from "@picoflow/core";
import { FlowEngine, HttpContentType } from "@picoflow/core";
import {
  ApiDeleteSessionResponseDto,
  ApiRunResponse400Dto,
  ApiRunResponseDto,
  ApiDeleteSessionResponse400Dto,
  ApiRunBodyDto,
} from "./api-types.js";

@ApiTags("ai")
@Controller("ai")
export class AiController {
  constructor(@Inject(FlowEngine) private flowEngine: FlowEngine) {}
  //.................................................................
  @HttpCode(HttpStatus.OK)
  @Post("run")
  @ApiHeader({
    name: "CHAT_SESSION_ID",
    description: "Chat session identifier",
    required: false,
  })
  @ApiBody({ type: ApiRunBodyDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Bot responded successfully",
    type: ApiRunResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: "Bot encountered problems",
    type: ApiRunResponse400Dto,
  })
  async run(
    // @Req() req: Request,
    @Res() res: FastifyReply,
    @Body(K.message) userMessage: string,
    @Body(K.flowName) flowName: string,
    @Body("config") config: object,
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
    if (result.contentType && result.contentType !== HttpContentType.Plain) {
      return res.type(result.contentType).send(result.message);
    }
    return res.send(result);
  }
  //.................................................................
  @Get("flows")
  @ApiResponse({
    status: HttpStatus.OK,
    description: "List of registered flow names",
    schema: { type: "array", items: { type: "string", example: "BasicFlow" } },
  })
  getFlows() {
    return this.flowEngine.getFlowNames();
  }
  //.................................................................
  @Post("end")
  @ApiHeader({
    name: "CHAT_SESSION_ID",
    description: "Chat session identifier",
    required: true,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Session document deleted successfully",
    type: ApiDeleteSessionResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: "Session document could not be deleted",
    type: ApiDeleteSessionResponse400Dto,
  })
  async deleteSession(
    @Res() res: FastifyReply,
    @Headers(K.ChatSessionID) sessionId?: string,
  ) {
    const result = await this.flowEngine.deleteSession(sessionId);
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
