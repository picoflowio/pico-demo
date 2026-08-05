/*
- Copyright (c) 2026 picoflow.io
- This software is proprietary and confidential. Unauthorized copying, distribution
- or modification of this file, via any medium, is strictly prohibited.
 */
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import {
  createBuiltinProviderAdapters,
  createCustomProviderAdapter,
  FlowEngine,
} from "@picoflow/core";
import { HealthController } from "./controllers/health-controller.js";
import { TutorialController } from "./controllers/tutorial-controller.js";
import { AiController } from "./controllers/ai-controller.js";
import { BasicFlow } from "./myflow/basic-flow/basic-flow.js";
import { HotelFlow } from "./myflow/hotel-flow/hotel-flow.js";
import { InvoiceFlow } from "./myflow/invoice-flow/invoice-flow.js";
import { TravelFlow } from "./myflow/travel-flow/travel-flow.js";
import { TutorialFlow } from "./myflow/tutorial-flow/tutorial-flow.js";

@Module({
  imports: [ConfigModule.forRoot()],
  controllers: [TutorialController, AiController, HealthController],
  providers: [
    {
      provide: FlowEngine,
      useFactory: (config: ConfigService) =>
        FlowEngine.create({
          flows: [BasicFlow, HotelFlow, InvoiceFlow, TravelFlow, TutorialFlow],
          //register pre-build providers.
          providers: [
            ...createBuiltinProviderAdapters({
              openai: { apiKey: config.get<string>("OPENAI_API_KEY") },
              google: { apiKey: config.get<string>("GEMINI_API_KEY") },
              anthropic: { apiKey: config.get<string>("ANTHROPIC_API_KEY") },
              kimi: { apiKey: config.get<string>("KIMI_API_KEY") },
              ollama: { baseUrl: config.get<string>("OLLAMA_BASE_URL") },
            }),
            // Application-owned provider registration: DeepSeek has no
            // dedicated PicoFlow helper, so the demo chooses its runtime here.
            createCustomProviderAdapter({
              provider: "deepseek",
              runtimeProvider: "deepseek",
              config: { apiKey: config.get<string>("DEEPSEEK_API_KEY") },
            }),
          ],
        }),
      inject: [ConfigService],
    },
  ],
})
export class AppModule {}
