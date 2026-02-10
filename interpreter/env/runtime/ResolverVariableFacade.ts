import type { ResolverManager } from '@core/resolvers';
import { MlldInterpreterError } from '@core/errors';
import { makeSecurityDescriptor, type DataLabel } from '@core/types/security';
import {
  createSimpleTextVariable,
  createObjectVariable,
  type Variable,
  type VariableSource
} from '@core/types/variable';
import { updateVarMxFromDescriptor } from '@core/types/variable/VarMxHelpers';

type ResolverCache = {
  getResolverVariable(name: string): Variable | undefined;
  setResolverVariable(name: string, variable: Variable): void;
};

type ResolverExecutor = Pick<ResolverManager, 'resolve'>;

export interface ResolverVariableResolveOptions {
  resolverManager?: ResolverExecutor;
  debugValue: string;
}

export class ResolverVariableFacade {
  constructor(
    private readonly cache: ResolverCache,
    private readonly reservedNames: Set<string>
  ) {}

  async resolve(
    name: string,
    options: ResolverVariableResolveOptions
  ): Promise<Variable | undefined> {
    if (!this.reservedNames.has(name)) {
      return undefined;
    }

    if (name === 'keychain') {
      throw new MlldInterpreterError(
        'Direct keychain access is not available. Use policy.auth with using auth:*.',
        { code: 'KEYCHAIN_DIRECT_ACCESS_DENIED' }
      );
    }

    if (name === 'debug') {
      return this.createDebugVariable(options.debugValue);
    }

    const cached = this.cache.getResolverVariable(name);
    if (cached?.internal?.needsResolution === false) {
      return cached;
    }

    if (!options.resolverManager) {
      return this.createPendingResolverVariable(name);
    }

    try {
      const resolverContent = await options.resolverManager.resolve(`@${name}`, { context: 'variable' });
      const resolvedVar = this.convertResolverContent(name, resolverContent);
      this.projectSecurityMetadata(resolvedVar, resolverContent);
      this.cache.setResolverVariable(name, resolvedVar);
      return resolvedVar;
    } catch (error) {
      console.warn(`Failed to resolve variable @${name}: ${(error as Error).message}`);
      return undefined;
    }
  }

  private createDebugVariable(debugValue: string): Variable {
    const debugSource: VariableSource = {
      directive: 'var',
      syntax: 'object',
      hasInterpolation: false,
      isMultiLine: false
    };
    return createObjectVariable(
      'debug',
      debugValue,
      false,
      debugSource,
      {
        mx: {
          definedAt: { line: 0, column: 0, filePath: '<reserved>' }
        },
        internal: {
          isReserved: true
        }
      }
    );
  }

  private createPendingResolverVariable(name: string): Variable {
    const placeholderSource: VariableSource = {
      directive: 'var',
      syntax: 'quoted',
      hasInterpolation: false,
      isMultiLine: false
    };
    return createSimpleTextVariable(
      name,
      `@${name}`,
      placeholderSource,
      {
        mx: {
          definedAt: { line: 0, column: 0, filePath: '<resolver>' }
        },
        internal: {
          isReserved: true,
          isResolver: true,
          resolverName: name,
          needsResolution: true
        }
      }
    );
  }

  private convertResolverContent(name: string, resolverContent: any): Variable {
    let varType: 'text' | 'data' = 'text';
    let varValue: any = resolverContent.content.content;

    if (resolverContent.content.contentType === 'data') {
      varType = 'data';
      if (typeof varValue === 'string') {
        try {
          varValue = JSON.parse(varValue);
        } catch {
          // Keep raw value when JSON parsing fails.
        }
      }
    }

    const resolverSource: VariableSource = {
      directive: 'var',
      syntax: varType === 'data' ? 'object' : 'quoted',
      hasInterpolation: false,
      isMultiLine: false
    };

    return varType === 'data'
      ? createObjectVariable(name, varValue, true, resolverSource, {
          mx: {
            definedAt: { line: 0, column: 0, filePath: '<resolver>' }
          },
          internal: {
            isReserved: true,
            isResolver: true,
            resolverName: name,
            needsResolution: false
          }
        })
      : createSimpleTextVariable(name, varValue, resolverSource, {
          mx: {
            definedAt: { line: 0, column: 0, filePath: '<resolver>' }
          },
          internal: {
            isReserved: true,
            isResolver: true,
            resolverName: name,
            needsResolution: false
          }
        });
  }

  private projectSecurityMetadata(variable: Variable, resolverContent: any): void {
    const resolverMx = resolverContent.content.mx ?? resolverContent.content.metadata;
    const resolverLabels =
      resolverMx && Array.isArray((resolverMx as any).labels)
        ? ((resolverMx as any).labels as DataLabel[])
        : undefined;
    const resolverTaint =
      resolverMx && Array.isArray((resolverMx as any).taint)
        ? ((resolverMx as any).taint as DataLabel[])
        : undefined;
    const resolverSources =
      resolverMx && typeof (resolverMx as any).source === 'string'
        ? ([(resolverMx as any).source] as string[])
        : undefined;

    if (!resolverLabels && !resolverTaint && !resolverSources) {
      return;
    }

    const descriptor = makeSecurityDescriptor({
      labels: resolverLabels,
      taint: resolverTaint,
      sources: resolverSources
    });

    if (!variable.mx) {
      variable.mx = {} as any;
    }
    updateVarMxFromDescriptor(variable.mx, descriptor);
    if ((variable.mx as any).mxCache) {
      delete (variable.mx as any).mxCache;
    }
  }
}
