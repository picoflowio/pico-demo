/*
- Copyright (c) 2026 picoflow.io
- This software is proprietary and confidential. Unauthorized copying, distribution
- or modification of this file, via any medium, is strictly prohibited.
 */
import { Flow } from '@picoflow/core';
import { LogicStep } from '@picoflow/core';
import { GooLogicStep } from './goo-logic.js';
import { LogicResponseType } from '@picoflow/core';
import { go } from '@picoflow/core';

export class FooLogicStep extends LogicStep {
  constructor(flow: Flow) {
    super(flow);
  }

  public async runLogic(): Promise<LogicResponseType> {
    return go(GooLogicStep).withState({ fooData: 'fooValue' });
  }
}
