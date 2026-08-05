/*
- Copyright (c) 2026 picoflow.io
- This software is proprietary and confidential. Unauthorized copying, distribution
- or modification of this file, via any medium, is strictly prohibited.
 */
import { Flow } from '@picoflow/core';
import { LogicStep } from '@picoflow/core';
import { LogicResponseType } from '@picoflow/core';
import { go } from '@picoflow/core';
import { FavoritesStep } from './favorites-step.js';

export class GooLogicStep extends LogicStep {
  constructor(flow: Flow) {
    super(flow);
  }

  public async runLogic(): Promise<LogicResponseType> {
    return go(FavoritesStep).withState({ gooData: 'gooValue' });
  }
}
