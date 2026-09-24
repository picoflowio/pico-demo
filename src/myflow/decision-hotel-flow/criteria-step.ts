import { Step, go, type Flow, type ToolResponseType } from '@picoflow/core';

export abstract class CriteriaStep extends Step {
  protected constructor(flow: Flow) {
    super(flow);
  }

  public override useTool(): string[] {
    return ['reroute_request'];
  }

  protected advance(): ToolResponseType {
    return go('RouterStep').withState({ mode: 'advance' });
  }

  protected async reroute_request(): Promise<ToolResponseType> {
    return go('RouterStep').withState({ mode: 'request' });
  }
}
