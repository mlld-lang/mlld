import type { StructuredValue } from '@interpreter/utils/structured-value';
import { wrapStructured } from '@interpreter/utils/structured-value';
import { buildPipelineStructuredValue } from '@interpreter/utils/pipeline-input';

export class StageOutputCache {
  private structuredOutputs: Map<number, StructuredValue> = new Map();
  private initialOutput?: StructuredValue;
  private finalOutput?: StructuredValue;
  private lastStageIndex: number = -1;

  initialize(initialOutput: StructuredValue): void {
    this.structuredOutputs.clear();
    this.initialOutput = initialOutput;
    this.finalOutput = initialOutput;
    this.lastStageIndex = -1;
  }

  updateInitialOutput(initialOutput: StructuredValue): void {
    this.initialOutput = initialOutput;
    this.finalOutput = initialOutput;
  }

  getInitialOutput(): StructuredValue | undefined {
    return this.initialOutput;
  }

  get(stageIndex: number, fallbackText: string = ''): StructuredValue {
    if (stageIndex < 0) {
      if (!this.initialOutput) {
        this.initialOutput = wrapStructured(fallbackText, 'text', fallbackText);
      }
      return this.initialOutput;
    }

    const cached = this.structuredOutputs.get(stageIndex);
    if (cached) {
      return cached;
    }

    const wrapper = buildPipelineStructuredValue(fallbackText, 'text');
    this.structuredOutputs.set(stageIndex, wrapper);
    return wrapper;
  }

  peek(stageIndex: number): StructuredValue | undefined {
    if (stageIndex < 0) {
      return this.initialOutput;
    }
    return this.structuredOutputs.get(stageIndex);
  }

  set(stageIndex: number, value: StructuredValue): void {
    this.structuredOutputs.set(stageIndex, value);
    this.finalOutput = value;
    this.lastStageIndex = stageIndex;
  }

  clearFrom(startStage: number): void {
    const keys = Array.from(this.structuredOutputs.keys());
    for (const key of keys) {
      if (key >= startStage) {
        this.structuredOutputs.delete(key);
      }
    }
  }

  getFinal(): StructuredValue {
    if (this.finalOutput) {
      return this.finalOutput;
    }
    if (this.lastStageIndex >= 0) {
      return this.get(this.lastStageIndex, this.initialOutput?.text ?? '');
    }
    if (this.initialOutput) {
      return this.initialOutput;
    }
    return wrapStructured('', 'text', '');
  }

  entries(): Array<[number, StructuredValue]> {
    return Array.from(this.structuredOutputs.entries());
  }
}
