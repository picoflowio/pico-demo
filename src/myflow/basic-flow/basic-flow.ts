/*
 *
 * Copyright (c) 2026 picoflow.io
 * This software is proprietary and confidential. Unauthorized copying, distribution
 * or modification of this file, via any medium, is strictly prohibited.
 */
import { Flow } from '@picoflow/core';
import { NameStep } from './name-step';
import { AddressStep } from './address-step';
import { DOBStep } from './dob-step';
import { EndStep } from '@picoflow/core';
import { Step } from '@picoflow/core';
import { FooLogicStep } from './foo-logic';
import { GooLogicStep } from './goo-logic';
import { WeatherStep } from './weather-step';
import { InContextStep } from './incontext-step';
import { PresidentStep } from './president-step';
import { SessionLogger } from '@picoflow/core';
import { FavoritesStep } from './favorites-step';
import { ConcurStep1 } from './concur-step1';
import { ConcurStep2 } from './concur-step2';
import { SessionType } from '@picoflow/core';
import { ConcurStep3 } from './concur-step3';
import { ConcurStep4 } from './concur-step4';

export class BasicFlow extends Flow {
  public constructor() {
    super(BasicFlow);
    this.useModel('gpt-4o');
    // this.useModel('claude-opus-4-6');
    // this.useModel('nvidia-deepseek-v4-pro');
    // this.useModel('nvidia-nemotron-3');
    // this.useModel('gemini-2.5-flash');
  }

  protected defineSteps(): Step[] {
    const isPresident = this.getContext<boolean>('config.isPresident');
    return [
      new WeatherStep(this, !isPresident),
      new NameStep(this).useMemory('default'),
      new AddressStep(this).useMemory('default'),
      new DOBStep(this).useMemory('default'),
      new FooLogicStep(this).useMemory('default'),
      new GooLogicStep(this).useMemory('default'),
      new InContextStep(this).useMemory('separate').useModel('gpt-5.1', {
        reasoning: { effort: 'low' },
      }),
      new ConcurStep1(this),
      new ConcurStep2(this),
      new ConcurStep3(this),
      new ConcurStep4(this),
      new PresidentStep(this, isPresident).useMemory('president'),
      new FavoritesStep(this).useMemory('favorite'),
      new EndStep(this).useMemory('temp'),
    ];
  }

  protected async spawnSteps(): Promise<string> {
    const step = await this.activate(PresidentStep);
    const nths = ['10th', '11th', '12th', '13th', '14th', '15th', '16th'];
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
        step.saveState({ [item]: response['message'] });
        // console.log(response['message']);
      },
    });

    const msg = `Finished concurrent flow: ${this.name}`;
    new SessionLogger(this.getSessionDoc()).log(msg);
    step.sessionCompleted();
    return msg;
  }

  protected async onSessionDoc(
    sessionDoc: SessionType,
    isNew: boolean,
  ): Promise<boolean> {
    if (sessionDoc.version < 1.14) {
      return false;
    } else {
      return isNew;
    }
  }
}
