/*
- Copyright (c) 2026 picoflow.io
- This software is proprietary and confidential. Unauthorized copying, distribution
- or modification of this file, via any medium, is strictly prohibited.
 */
import { Inject, Module, type OnApplicationShutdown } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ModelProvider, FlowEngine } from "@picoflow/core";
import { HealthController } from "./controllers/health-controller.js";
import { TutorialController } from "./controllers/tutorial-controller.js";
import { AiController } from "./controllers/ai-controller.js";
import { BasicFlow } from "./myflow/basic-flow/basic-flow.js";
import { HotelFlow } from "./myflow/hotel-flow/hotel-flow.js";
import { InvoiceFlow } from "./myflow/invoice-flow/invoice-flow.js";
import { SupportFlow } from "./myflow/support-flow/support-flow.js";
import { HomeInsuranceQuoteFlow } from "./myflow/home-insurance-flow/home-insurance-flow.js";
import { EmployeeBenefitsFlow } from "./myflow/employee-benefits-flow/employee-benefits-flow.js";
import { HotelLanggraph } from "./myflow/hotel-langgraph/hotel-langgraph.js";
import { AiLanggraphController } from "./controllers/ai-langgraph-controller.js";
import { closeHotelPricingMcpClient } from "./tools/hotel-pricing-mcp-client.js";

@Module({
  imports: [ConfigModule.forRoot()],
  controllers: [TutorialController, AiController, AiLanggraphController, HealthController],
  providers: [
    {
      provide: FlowEngine,
      useFactory: (config: ConfigService) =>
        FlowEngine.create({
          flows: [
            BasicFlow,
            HotelFlow,
            InvoiceFlow,
            SupportFlow,
            HomeInsuranceQuoteFlow,
            EmployeeBenefitsFlow,
          ],
          //register pre-build providers, only specify what you use.
          providers: [
            ...ModelProvider.createBuiltinAdapters({
              openai: { apiKey: config.get<string>("OPENAI_API_KEY") },
              google: { apiKey: config.get<string>("GEMINI_API_KEY") },
              anthropic: { apiKey: config.get<string>("ANTHROPIC_API_KEY") },
              // moonshot: { apiKey: config.get<string>("MOONSHOT_API_KEY") },
              // zai: { apiKey: config.get<string>("ZAI_API_KEY") },
              // deepseek: { apiKey: config.get<string>("DEEPSEEK_API_KEY") },
              // openrouter: { apiKey: config.get<string>("OPENROUTER_API_KEY") },
              // ollama: { baseUrl: config.get<string>("OLLAMA_BASE_URL") },
            }),
            // NVIDIA uses an OpenAI-compatible endpoint, but remains an
            // application-owned integration rather than a PicoFlow built-in.
            ModelProvider.createCustomAdapter({
              provider: "nvidia",
              runtimeProvider: "openai",
              config: {
                apiKey: config.get<string>("NVIDIA_API_KEY"),
                configuration: {
                  baseURL: "https://integrate.api.nvidia.com/v1",
                },
              },
            }),
          ],
        }),
      inject: [ConfigService],
    },
    {
      provide: HotelLanggraph,
      useFactory: () => HotelLanggraph.createFromEnvironment(),
    },
  ],
})
export class AppModule implements OnApplicationShutdown {
  constructor(
    @Inject(HotelLanggraph) private readonly hotelLanggraph: HotelLanggraph,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await Promise.all([
      this.hotelLanggraph.close(),
      closeHotelPricingMcpClient(),
    ]);
  }
}
