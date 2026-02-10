import type { SourceLocation } from '@core/types';
import type { Variable } from '@core/types/variable';
import { createObjectVariable } from '@core/types/variable';
import type { IVariableManager } from '../VariableManager';

export interface ImportBindingInfo {
  source: string;
  location?: SourceLocation;
}

type VariableStore = Pick<
  IVariableManager,
  'setVariable' | 'setParameterVariable' | 'updateVariable' | 'getVariable' | 'getVariableValue' | 'hasVariable'
>;

export class VariableFacade {
  constructor(
    private readonly variableStore: VariableStore,
    private readonly importBindings: Map<string, ImportBindingInfo>
  ) {}

  getImportBinding(name: string): ImportBindingInfo | undefined {
    return this.importBindings.get(name);
  }

  setImportBinding(name: string, info: ImportBindingInfo): void {
    this.importBindings.set(name, info);
  }

  setVariable(name: string, variable: Variable): void {
    this.variableStore.setVariable(name, variable);
  }

  setParameterVariable(name: string, variable: Variable): void {
    this.variableStore.setParameterVariable(name, variable);
  }

  updateVariable(name: string, variable: Variable): void {
    this.variableStore.updateVariable(name, variable);
  }

  getVariable(name: string): Variable | undefined {
    return this.variableStore.getVariable(name);
  }

  getVariableValue(name: string): any {
    return this.variableStore.getVariableValue(name);
  }

  hasVariable(name: string): boolean {
    return this.variableStore.hasVariable(name);
  }

  getTransform(name: string, builtins: Record<string, Function>): Function | undefined {
    if (builtins[name]) {
      return builtins[name];
    }

    const variable = this.getVariable(name);
    if (variable && typeof variable === 'object' && '__executable' in variable) {
      return variable;
    }

    return undefined;
  }

  setFrontmatter(data: Record<string, unknown>): void {
    const frontmatterVariable = createObjectVariable(
      'frontmatter',
      data,
      true,
      {
        directive: 'var',
        syntax: 'object',
        hasInterpolation: false,
        isMultiLine: false
      },
      {
        mx: {
          source: 'frontmatter',
          definedAt: { line: 0, column: 0, filePath: '<frontmatter>' }
        },
        internal: {
          isSystem: true,
          immutable: true
        }
      }
    );

    this.variableStore.setVariable('fm', frontmatterVariable);
    this.variableStore.setVariable('frontmatter', frontmatterVariable);
  }
}
