/*
 * Created on Sun Mar 16 2025
 *
 * Copyright (c) 2025 picoflow.io
 * This software is proprietary and confidential. Unauthorized copying, distribution
 * or modification of this file, via any medium, is strictly prohibited.
 */
import { NameStep } from './name-step';
import { AddressStep } from './address-step';
import { DOBStep } from './dob-step';
import { FooLogicStep } from './foo-logic';
import { GooLogicStep } from './goo-logic';
import { WeatherStep } from './weather-step';
import { InContextStep } from './incontext-step';
import { PresidentStep } from './president-step';
import { FavoritesStep } from './favorites-step';
import { Flow, Step, EndStep, SessionLogger } from '@picoflow/core';

export class BasicFlow extends Flow {
  public constructor() {
    super(BasicFlow);
    this.useModel('gpt-4o');
  }

  protected defineSteps(): Step[] {
    const isPresident = this.getContext<boolean>('config.isPresident');

    const model = 'gpt-4o-mini';
    return [
      new WeatherStep(this, !isPresident).useModel(model),
      new NameStep(this).useModel(model).useMemory('default'),
      new AddressStep(this).useModel(model).useMemory('default'),
      new DOBStep(this).useModel(model).useMemory('default'),
      new FooLogicStep(this).useMemory('default'),
      new GooLogicStep(this).useMemory('default'),
      new InContextStep(this).useMemory('separate'),
      new PresidentStep(this, isPresident).useMemory('president'),
      new FavoritesStep(this, false).useMemory('favorite'),
      new EndStep(this).useModel(model).useMemory('temp'),
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
}
