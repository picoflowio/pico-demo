/*
- Copyright (c) 2026 picoflow.io
- This software is proprietary and confidential. Unauthorized copying, distribution
- or modification of this file, via any medium, is strictly prohibited.
 */
import { Flow } from "@picoflow/core";
import { NameStep } from "./name-step.js";
import { AddressStep } from "./address-step.js";
import { DOBStep } from "./dob-step.js";
import { TerminateSessionStep } from "@picoflow/core";
import { Step } from "@picoflow/core";
import { FooLogicStep } from "./foo-logic.js";
import { GooLogicStep } from "./goo-logic.js";
import { WeatherStep } from "./weather-step.js";
import { InContextStep } from "./incontext-step.js";
import { PresidentStep } from "./president-step.js";
import { SessionLogger } from "@picoflow/core";
import { FavoritesStep } from "./favorites-step.js";
import { ConcurStep1 } from "./concur-step1.js";
import { ConcurStep2 } from "./concur-step2.js";
import { SessionType } from "@picoflow/core";
import { ConcurStep3 } from "./concur-step3.js";
import { ConcurStep4 } from "./concur-step4.js";

export class BasicFlow extends Flow {
  protected configModel() {
    return {
      provider: "openai",
      name: "gpt-4o-mini",
      params: { temperature: 0.2 },
      retryAttempts: 3,
    } as const;
  }

  protected initialStep() {
    return this.getContext<boolean>("config.isPresident")
      ? PresidentStep
      : WeatherStep;
  }

  protected defineSteps(): Step[] {
    const isPresident = this.getContext<boolean>("config.isPresident");
    return [
      new WeatherStep(this).useModel({
        provider: "openai",
        name: "gpt-5",
        params: { reasoning: { effort: "low" } },
      }),
      new NameStep(this).useMemory("default"),
      new AddressStep(this).useMemory("default"),
      new DOBStep(this).useMemory("default").useModel({
        provider: "openai",
        name: "gpt-5.1",
        params: { reasoning: { effort: "low" } },
      }),
      new FooLogicStep(this).useMemory("default"),
      new GooLogicStep(this).useMemory("default"),
      new InContextStep(this).useMemory("separate"),
      new ConcurStep1(this),
      new ConcurStep2(this),
      new ConcurStep3(this),
      new ConcurStep4(this),
      new PresidentStep(this).useMemory("president"),
      // new FavoritesStep(this)
      //   .useMemory("favorite")
      //   .useModel({
      //     provider: "nvidia",
      //     name: "nvidia/llama-3.3-nemotron-super-49b-v1.5",
      //     params: { temperature: 0.2 },
      //   }),
      new FavoritesStep(this).useMemory("favorite"),
      new TerminateSessionStep(this).useMemory("temp"),
    ];
  }

  // Migration and session validation hook.
  protected async onRestoreSessionDoc(
    doc: SessionType,
  ): Promise<SessionType | null> {
    //you can call:
    //this.isSessionCurrent(doc)
    //this.sessionIdleMs(doc)
    return super.onRestoreSessionDoc(doc);
  }

  protected async spawnSteps(): Promise<string> {
    const step = await this.goto(PresidentStep);
    const nths = ["10th", "11th", "12th", "13th", "14th", "15th", "16th"];
    await this.concurrentSteps<string>({
      items: nths,
      batchSize: 3,
      onConfig: (item) => {
        return {
          nth: item,
          isPresident: true,
        };
      },
      onBotResponse(item, response) {
        step.saveState({ [item]: response["message"] });
        // console.log(response['message']);
      },
    });

    const msg = `Finished concurrent flow: ${this.id}`;
    new SessionLogger(this.getSessionDoc()).log(msg);
    step.sessionCompleted();
    return msg;
  }

}
