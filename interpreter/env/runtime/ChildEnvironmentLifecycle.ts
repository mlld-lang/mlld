import type { MlldNode } from '@core/types';
import type { DirectiveTrace } from '@core/types/trace';
import type { Variable } from '@core/types/variable';
import type { PathContext } from '@core/services/PathContextService';
import type { StreamingOptions } from '@interpreter/eval/pipeline/streaming-options';

interface VariableWriteStore {
  setVariable(name: string, variable: Variable): void;
}

interface ChildEnvironmentState {
  allowAbsolutePaths: boolean;
  initialNodeCount: number;
  streamingOptions: StreamingOptions;
  provenanceEnabled: boolean;
  moduleIsolated: boolean;
  traceEnabled: boolean;
  directiveTrace: DirectiveTrace[];
  setAllowedTools(allowedTools: Set<string>): void;
}

interface ParentEnvironmentState {
  allowAbsolutePaths: boolean;
  nodes: MlldNode[];
  streamingOptions: StreamingOptions;
  provenanceEnabled: boolean;
  moduleIsolated: boolean;
  traceEnabled: boolean;
  directiveTrace: DirectiveTrace[];
  allowedTools?: Set<string>;
}

interface ChildInheritanceOptions {
  includeInitialNodeCount?: boolean;
  includeModuleIsolation?: boolean;
  includeTraceInheritance?: boolean;
}

export class ChildEnvironmentLifecycle {
  resolveChildContext(
    pathContext: PathContext | undefined,
    basePath: string,
    newBasePath?: string
  ): PathContext | string {
    if (!pathContext) {
      return newBasePath || basePath;
    }

    if (!newBasePath) {
      return pathContext;
    }

    return {
      ...pathContext,
      fileDirectory: newBasePath,
      executionDirectory: newBasePath
    };
  }

  applyChildInheritance(
    child: ChildEnvironmentState,
    parent: ParentEnvironmentState,
    options: ChildInheritanceOptions = {}
  ): void {
    child.allowAbsolutePaths = parent.allowAbsolutePaths;
    child.streamingOptions = { ...parent.streamingOptions };
    child.provenanceEnabled = parent.provenanceEnabled;

    if (options.includeInitialNodeCount) {
      child.initialNodeCount = parent.nodes.length;
    }

    if (options.includeModuleIsolation) {
      child.moduleIsolated = parent.moduleIsolated;
    }

    if (options.includeTraceInheritance) {
      child.traceEnabled = parent.traceEnabled;
      child.directiveTrace = parent.directiveTrace;
    }

    if (parent.allowedTools) {
      child.setAllowedTools(parent.allowedTools);
    }
  }

  mergeChildVariables(
    target: VariableWriteStore,
    childVariables: Iterable<[string, Variable]>
  ): void {
    for (const [name, variable] of childVariables) {
      if (this.isMergeScopedBinding(variable)) {
        continue;
      }
      target.setVariable(name, variable);
    }
  }

  mergeChildNodes(parentNodes: MlldNode[], childNodes: MlldNode[]): void {
    parentNodes.push(...childNodes);
  }

  private isMergeScopedBinding(variable: Variable): boolean {
    const importPath = variable.mx?.importPath;
    return importPath === 'let' || importPath === 'exe-param';
  }
}
