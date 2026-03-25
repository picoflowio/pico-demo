import { EndStep, Flow, Step } from '@picoflow/core';
import { SymptomsStep } from './symptoms-step';
import { BookingStep } from './booking-step';

export class MedicalFlow extends Flow {
  public constructor() {
    super(MedicalFlow);
    // set default model for the flow (required by @picoflow/core v12)
    this.useModel('gpt-4o');
  }

  protected defineSteps(): Step[] {
    return [
      new SymptomsStep(this, true).useModelParams<'gpt-4o'>({
        temperature: 0.5,
      }),
      new BookingStep(this, false),
      new EndStep(this).useMemory('end'),
    ];
  }
}
