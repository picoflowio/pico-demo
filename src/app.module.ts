import { DecisionHotelFlow } from './myflow/decision-hotel-flow/decision-hotel-flow.js';
/*
- Copyright (c) 2026 picoflow.io
- This software is proprietary and confidential. Unauthorized copying, distribution
- or modification of this file, via any medium, is strictly prohibited.
 */
import { Inject, Module, type OnApplicationShutdown } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { CosmosClient } from "@azure/cosmos";
import { ClientSecretCredential, DefaultAzureCredential } from "@azure/identity";
import { MongoClient } from "mongodb";
import { DecisionProvider, ModelProvider, FlowEngine } from "@picoflow/core";
import { HealthController } from "./controllers/health-controller.js";
import { TutorialController } from "./controllers/tutorial-controller.js";
import { AiController } from "./controllers/ai-controller.js";
import { BasicFlow } from "./myflow/basic-flow/basic-flow.js";
import { HotelFlow } from "./myflow/hotel-flow/hotel-flow.js";
import { InvoiceFlow } from "./myflow/invoice-flow/invoice-flow.js";
import { SupportFlow } from "./myflow/support-flow/support-flow.js";
import { HomeInsuranceQuoteFlow } from "./myflow/home-insurance-flow/home-insurance-flow.js";
import { EmployeeBenefitsFlow } from "./myflow/employee-benefits-flow/employee-benefits-flow.js";
import { HotelLanggraph, type LazyHotelLanggraph } from "./myflow/hotel-langgraph/hotel-langgraph.js";
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
          configManager: config,
          sessionClients: {
            // Customize MongoDB / DocumentDB credentials, TLS, and connection options here.
            mongodb: () => {
              const url = config.getOrThrow<string>("MONGODB_URL");
              const tlsCAFile = config.get<string>("MONGODB_TLS_CA_FILE");
              return new MongoClient(url, tlsCAFile ? { tlsCAFile } : {});
            },
            cosmos: () => {
              const endpoint = config.get<string>("COSMODB_URL")
                || config.get<string>("COSMO_ENDPOINT") || config.get<string>("COSMOS_ENDPOINT");
              if (!endpoint) throw new Error("COSMODB_URL, COSMO_ENDPOINT, or COSMOS_ENDPOINT is required.");
              const key = config.get<string>("COSMODB_KEY") || config.get<string>("COSMOS_KEY");
              if (key) return new CosmosClient({ endpoint, key });
              const tenantId = config.get<string>("AZURE_TENANT_ID");
              const clientId = config.get<string>("COSMO_DB_CLIENT_ID");
              const clientSecret = config.get<string>("COSMO_DB_CLIENT_SECRET");
              if (clientId || clientSecret) {
                if (!tenantId || !clientId || !clientSecret) {
                  throw new Error("Cosmos service principal requires AZURE_TENANT_ID, COSMO_DB_CLIENT_ID, and COSMO_DB_CLIENT_SECRET.");
                }
                return new CosmosClient({
                  endpoint,
                  aadCredentials: new ClientSecretCredential(tenantId, clientId, clientSecret),
                });
              }
              return new CosmosClient({ endpoint, aadCredentials: new DefaultAzureCredential() });
            },
          },
          flows: [
            BasicFlow,
            HotelFlow,
            InvoiceFlow,
            SupportFlow,
            DecisionHotelFlow,
            HomeInsuranceQuoteFlow,
            EmployeeBenefitsFlow,
          ],
          decisionProviders: DecisionProvider.create({
            openai: { apiKey: config.get<string>("OPENAI_API_KEY") },
            typesafe: { apiKey: config.get<string>("TYPESAFE_API_KEY") },
            google: { apiKey: config.get<string>("GEMINI_API_KEY") },
          }),
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
      useFactory: () => HotelLanggraph.createLazyFromEnvironment(),
    },
  ],
})
export class AppModule implements OnApplicationShutdown {
  constructor(
    @Inject(FlowEngine) private readonly flowEngine: FlowEngine,
    @Inject(HotelLanggraph) private readonly hotelLanggraph: HotelLanggraph | LazyHotelLanggraph,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await Promise.all([
      this.flowEngine.close(),
      this.hotelLanggraph.close(),
      closeHotelPricingMcpClient(),
    ]);
  }
}
