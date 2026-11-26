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
  Param,
  Post,
  Query,
  Res,
} from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { ApiResponse, ApiBody, ApiTags, ApiHeader } from "@nestjs/swagger";
import {
  K,
  FlowEngine,
  HttpContentType,
  type CheckpointSource,
  type CheckpointTuple,
  type JsonObject,
} from "@picoflow/core";
import {
  ApiDeleteSessionResponseDto,
  ApiRunResponse400Dto,
  ApiRunResponseDto,
  ApiDeleteSessionResponse400Dto,
  ApiRunBodyDto,
  ApiForkCheckpointBodyDto,
  ApiUpdateCheckpointStateBodyDto,
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
    @Body("checkpointId") checkpointId?: string,
    @Headers(K.ChatSessionID) sessionId?: string,
  ) {
    const result = await this.flowEngine.run({
      flowName,
      userMessage,
      sessionId,
      config,
      ...(checkpointId ? { checkpointId } : {}),
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
  @Get("checkpoints")
  @ApiHeader({
    name: "CHAT_SESSION_ID",
    description: "Chat session identifier",
    required: true,
  })
  async listCheckpoints(
    @Res() res: FastifyReply,
    @Headers(K.ChatSessionID) sessionId?: string,
    @Query("limit") limit?: string,
    @Query("before") beforeCheckpointId?: string,
    @Query("source") source?: CheckpointSource,
    @Query("stepId") stepId?: string,
  ) {
    if (!sessionId) {
      return res
        .status(HttpStatus.BAD_REQUEST)
        .send({ success: false, message: "CHAT_SESSION_ID header is required." });
    }
    try {
      const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
      const filter: { source?: CheckpointSource; stepId?: string } = {};
      if (source) filter.source = source;
      if (stepId) filter.stepId = stepId;
      const checkpoints: CheckpointTuple[] = [];
      for await (const tuple of this.flowEngine.getCheckpointHistory(sessionId, {
        ...(parsedLimit && Number.isInteger(parsedLimit) && parsedLimit > 0
          ? { limit: parsedLimit }
          : {}),
        ...(beforeCheckpointId ? { beforeCheckpointId } : {}),
        ...(Object.keys(filter).length > 0 ? { filter } : {}),
      })) {
        checkpoints.push(tuple);
      }
      return res.send({ success: true, session: sessionId, checkpoints });
    } catch (error) {
      return res.status(HttpStatus.BAD_REQUEST).send({
        success: false,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  //.................................................................
  @Get("checkpoints/:checkpointId")
  @ApiHeader({
    name: "CHAT_SESSION_ID",
    description: "Chat session identifier",
    required: true,
  })
  async getCheckpoint(
    @Res() res: FastifyReply,
    @Param("checkpointId") checkpointId: string,
    @Headers(K.ChatSessionID) sessionId?: string,
  ) {
    if (!sessionId) {
      return res
        .status(HttpStatus.BAD_REQUEST)
        .send({ success: false, message: "CHAT_SESSION_ID header is required." });
    }
    try {
      const tuple = await this.flowEngine.getCheckpoint(
        sessionId,
        checkpointId === "latest" ? undefined : checkpointId,
      );
      if (!tuple) {
        return res
          .status(HttpStatus.NOT_FOUND)
          .send({ success: false, message: "Checkpoint not found." });
      }
      return res.send({ success: true, session: sessionId, checkpoint: tuple });
    } catch (error) {
      return res.status(HttpStatus.BAD_REQUEST).send({
        success: false,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  //.................................................................
  @Post("checkpoints/:checkpointId/fork")
  @HttpCode(HttpStatus.OK)
  @ApiHeader({
    name: "CHAT_SESSION_ID",
    description: "Chat session identifier",
    required: true,
  })
  @ApiBody({ type: ApiForkCheckpointBodyDto, required: false })
  async forkCheckpoint(
    @Res() res: FastifyReply,
    @Param("checkpointId") checkpointId: string,
    @Body() body?: ApiForkCheckpointBodyDto,
    @Headers(K.ChatSessionID) sessionId?: string,
  ) {
    if (!sessionId) {
      return res
        .status(HttpStatus.BAD_REQUEST)
        .send({ success: false, message: "CHAT_SESSION_ID header is required." });
    }
    try {
      const forked = await this.flowEngine.forkFromCheckpoint(
        sessionId,
        checkpointId,
        { ...(body?.newSession !== undefined ? { newSession: body.newSession } : {}) },
      );
      res.header(K.ChatSessionID, forked.sessionId);
      return res.send({
        success: true,
        session: forked.sessionId,
        checkpoint: forked.checkpoint,
      });
    } catch (error) {
      return res.status(HttpStatus.BAD_REQUEST).send({
        success: false,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  //.................................................................
  @Post("checkpoints/state")
  @HttpCode(HttpStatus.OK)
  @ApiHeader({
    name: "CHAT_SESSION_ID",
    description: "Chat session identifier",
    required: true,
  })
  @ApiBody({ type: ApiUpdateCheckpointStateBodyDto })
  async updateCheckpointState(
    @Res() res: FastifyReply,
    @Body() body: ApiUpdateCheckpointStateBodyDto,
    @Headers(K.ChatSessionID) sessionId?: string,
  ) {
    if (!sessionId) {
      return res
        .status(HttpStatus.BAD_REQUEST)
        .send({ success: false, message: "CHAT_SESSION_ID header is required." });
    }
    try {
      const updated = await this.flowEngine.updateSessionState(
        sessionId,
        {
          ...(body?.currentStep !== undefined
            ? { currentStep: body.currentStep }
            : {}),
          ...(body?.context !== undefined
            ? { context: body.context as JsonObject }
            : {}),
          ...(body?.stepState !== undefined
            ? { stepState: body.stepState as Record<string, JsonObject> }
            : {}),
        },
        {
          ...(body?.checkpointId ? { checkpointId: body.checkpointId } : {}),
          ...(body?.asStep ? { asStep: body.asStep } : {}),
        },
      );
      return res.send({
        success: true,
        session: sessionId,
        checkpoint: updated,
      });
    } catch (error) {
      return res.status(HttpStatus.BAD_REQUEST).send({
        success: false,
        message: error instanceof Error ? error.message : String(error),
      });
    }
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
