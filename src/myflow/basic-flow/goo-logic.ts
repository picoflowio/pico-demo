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
  /**
   * Initializes the GooLogicStep with the parent Flow instance.
   *
   * @param flow - The Flow instance orchestrating this logic step.
   */
  constructor(flow: Flow) {
    super(flow);
  }

  /**
   * Executes secondary logic processing, persisting step output to state
   * and transitioning to `FavoritesStep`.
   *
   * @returns Response directing navigation to `FavoritesStep` along with state data.
   */
  public override async runLogic(): Promise<LogicResponseType> {
    return go(FavoritesStep).withState({ gooData: 'gooValue' });
  }
}
