import { Flow } from '@picoflow/core';
import { LogicStep } from '@picoflow/core';
import { LogicResponseType } from '@picoflow/core';
import { FavoritesStep } from './favorites-step.js';

export class GooLogicStep extends LogicStep {
  constructor(flow: Flow, isActive = false) {
    super(GooLogicStep, flow, isActive);
  }

  public async runLogic(): Promise<LogicResponseType> {
    return { step: FavoritesStep, state: { gooData: 'gooValue' } };
  }
}
