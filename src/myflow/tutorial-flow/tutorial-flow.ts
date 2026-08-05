/*
- Copyright (c) 2026 picoflow.io
- This software is proprietary and confidential. Unauthorized copying, distribution
- or modification of this file, via any medium, is strictly prohibited.
 */
import { Flow } from '@picoflow/core';
import { Step } from '@picoflow/core';
import { HelloStep } from './hello-step.js';
import { TerminateSessionStep } from '@picoflow/core';
export class TutorialFlow extends Flow {
  protected configModel() {
    return { provider: 'google', name: 'gemini-2.0-flash' } as const;
  }

  protected defineSteps(): Step[] {
    return [
      new HelloStep(this).useMemory('default'),
      new TerminateSessionStep(this).useMemory('end'),
    ];
  }
}
