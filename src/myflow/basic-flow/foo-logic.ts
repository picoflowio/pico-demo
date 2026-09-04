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
  /**
   * Initializes the FooLogicStep with the parent Flow instance.
   *
   * @param flow - The Flow instance orchestrating this logic step.
   */
  constructor(flow: Flow) {
    super(flow);
  }

  /**
   * Executes deterministic non-conversational business logic,
   * setting arbitrary state and transitioning forward to `GooLogicStep`.
   *
   * @returns Response instructing the engine to navigate to `GooLogicStep` with initial payload.
   */
  public override async runLogic(): Promise<LogicResponseType> {
    return go(GooLogicStep).withState({ fooData: 'fooValue' });
  }
}
