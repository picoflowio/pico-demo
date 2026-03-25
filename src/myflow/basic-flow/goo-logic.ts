
import { LogicStep, Flow, LogicResponseType } from '@picoflow/core';
import { FavoritesStep } from './favorites-step';

export class GooLogicStep extends LogicStep {
  constructor(flow: Flow, isActive = false) {
    super(GooLogicStep, flow, isActive);
  }

  public async runLogic(): Promise<LogicResponseType> {
    return { step: FavoritesStep, state: { gooData: 'gooValue' } };
  }
}
