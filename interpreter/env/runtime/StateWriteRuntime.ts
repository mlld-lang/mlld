import { createObjectVariable } from '@core/types/variable';
import type { DataLabel } from '@core/types/security';
import type { StateWrite } from '@core/types/state';
import type { DynamicModuleResolver } from '@core/resolvers';
import type { IVariableManager } from '../VariableManager';
import { logger } from '@core/utils/logger';

type StateVariableStore = Pick<IVariableManager, 'hasVariable' | 'setVariable' | 'updateVariable'>;

export class StateWriteRuntime {
  private stateWrites: StateWrite[] = [];
  private stateWriteIndex = 0;
  private stateSnapshot?: Record<string, any>;
  private stateResolver?: DynamicModuleResolver;
  private stateLabels: DataLabel[] = [];

  constructor(private readonly variableStore: StateVariableStore) {}

  registerDynamicStateSnapshot(
    snapshot: Record<string, any>,
    resolver: DynamicModuleResolver,
    source?: string
  ): void {
    this.stateSnapshot = snapshot;
    this.stateResolver = resolver;
    const labels: DataLabel[] = ['src:dynamic'];
    if (source) {
      labels.push(`src:${source}` as DataLabel);
    }
    this.stateLabels = labels;
    this.refreshStateVariable();
  }

  recordStateWrite(write: Omit<StateWrite, 'index' | 'timestamp'> & { index?: number; timestamp?: string }): void {
    const entry: StateWrite = {
      ...write,
      index: write.index ?? this.stateWriteIndex++,
      timestamp: write.timestamp ?? new Date().toISOString()
    };
    this.stateWrites.push(entry);
    this.applyStateWriteToSnapshot(entry);
  }

  getStateWrites(): StateWrite[] {
    return this.stateWrites;
  }

  private applyStateWriteToSnapshot(write: StateWrite): void {
    if (!this.stateSnapshot) {
      return;
    }

    const pathParts = (write.path || '').split('.').filter(Boolean);
    if (pathParts.length === 0) {
      return;
    }

    let target: any = this.stateSnapshot;
    for (let i = 0; i < pathParts.length - 1; i += 1) {
      const key = pathParts[i];
      if (typeof target[key] !== 'object' || target[key] === null) {
        target[key] = {};
      }
      target = target[key];
    }

    const lastKey = pathParts[pathParts.length - 1];
    target[lastKey] = write.value;
    this.refreshStateVariable();
  }

  private refreshStateVariable(): void {
    if (!this.stateSnapshot) {
      return;
    }

    const stateVar = createObjectVariable(
      'state',
      this.stateSnapshot,
      true,
      {
        directive: 'var',
        syntax: 'object',
        hasInterpolation: false,
        isMultiLine: false
      }
    );

    if (this.stateLabels.length > 0) {
      stateVar.mx.labels = [...this.stateLabels];
      stateVar.mx.taint = [...this.stateLabels];
      stateVar.mx.sources = [...this.stateLabels];
    }

    stateVar.internal = {
      ...(stateVar.internal ?? {}),
      isReserved: true,
      isSystem: true
    };

    if (this.variableStore.hasVariable('state')) {
      this.variableStore.updateVariable('state', stateVar);
    } else {
      this.variableStore.setVariable('state', stateVar);
    }

    if (this.stateResolver) {
      try {
        this.stateResolver.updateModule('@state', this.stateSnapshot);
      } catch (error) {
        logger.warn('Failed to update dynamic @state module after state write', { error });
      }
    }
  }
}
