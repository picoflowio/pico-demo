import { Flow } from '@picoflow/core';
import { LogicStep } from '@picoflow/core';
import { GooLogicStep } from './goo-logic';
import { LogicResponseType } from '@picoflow/core';

export class FooLogicStep extends LogicStep {
  constructor(flow: Flow, isActive = false) {
    super(FooLogicStep, flow, isActive);
  }

  public async runLogic(): Promise<LogicResponseType> {
    return { step: GooLogicStep, state: { fooData: 'fooValue' } };
  }
}
