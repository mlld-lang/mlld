import type { DirectiveNode } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult, EvaluationContext } from '../core/interpreter';
import { getTextContent } from '../utils/type-guard-helpers';
import type { OperationContext, PipelineContextSnapshot } from '../env/ContextManager';
import type { PolicyDirectiveNode } from '@core/types/policy';
import { extractDirectiveInputs } from './directive-inputs';
import { getGuardTransformedInputs, handleGuardDecision } from '../hooks/hook-decision-handler';
import type { Variable } from '@core/types/variable';
import { isVariable } from '../utils/variable-resolution';

// Import specific evaluators
import { evaluatePath } from './path';
import { evaluateRun } from './run';
import { evaluateImport } from './import';
import { evaluateWhen } from './when';
import { evaluateOutput } from './output';
import { evaluateAppend } from './append';
import { evaluateVar, prepareVarAssignment, type VarAssignmentResult } from './var';
import { evaluateShow } from './show';
import { evaluateExe } from './exe';
import { evaluateForDirective } from './for';
import { evaluateLoopDirective } from './loop';
import { evaluateExport } from './export';
import { evaluateGuard } from './guard';
import { evaluateNeeds, evaluateWants } from './needs';
import { clearDirectiveReplay } from './directive-replay';
import { runWithGuardRetry } from '../hooks/guard-retry-runner';
import { extractSecurityDescriptor } from '../utils/structured-value';
import { updateVarMxFromDescriptor } from '@core/types/variable/VarMxHelpers';
import { evaluatePolicy } from './policy';
import { getOperationLabels, getOperationSources, parseCommand } from '@core/policy/operation-labels';

/**
 * Extract trace information from a directive
 */
function extractTraceInfo(directive: DirectiveNode): {
  directive: string;
  varName?: string;
} {
  const info: { directive: string; varName?: string } = {
    directive: `/${directive.kind}`
  };
  
  // Extract variable/exec names based on directive type
  switch (directive.kind) {
    case 'path':
    case 'var':
      // /path @varName = ... or /var @varName = ...
      const identifierNodes = directive.values?.identifier;
      if (identifierNodes && Array.isArray(identifierNodes) && identifierNodes.length > 0) {
        const identifier = identifierNodes[0];
        if (identifier?.type === 'Text' && 'content' in identifier) {
          info.varName = identifier.content;
        } else if (identifier?.type === 'VariableReference' && 'identifier' in identifier) {
          info.varName = identifier.identifier;
        }
      }
      break;
      
    case 'run':
      // /run @execName or /run [command]
      if (directive.subtype === 'runExec') {
        const execId = directive.values?.identifier?.[0];
        if (execId?.type === 'Text' && 'content' in execId) {
          info.varName = `@${execId.content}`;
        }
      }
      break;
      
    case 'exec':
    case 'exe':
      // /exec @funcName(...) = ... or /exe @funcName(...) = ...
      const execName = directive.values?.name?.[0];
      const execNameContent = getTextContent(execName);
      if (execNameContent) {
        info.varName = execNameContent;
      }
      break;
      
    case 'foreach':
      // foreach @template(@items)
      const template = directive.values?.template?.[0];
      const templateContent = getTextContent(template);
      if (templateContent) {
        info.varName = templateContent;
      }
      break;
      
    case 'import':
      // /import { ... } from "path"
      const importPath = directive.values?.path?.[0];
      const pathContent = getTextContent(importPath);
      if (pathContent) {
        // Show just the filename for cleaner trace
        info.varName = pathContent.split('/').pop()?.replace(/\.mld$/, '');
      }
      break;

    case 'export':
      // /export { name, other }
      const firstExport = directive.values?.exports?.[0];
      if (firstExport && typeof firstExport.identifier === 'string') {
        info.varName = firstExport.identifier;
      }
      break;

    case 'policy':
      const policyNameNode = (directive.values as any)?.name?.[0];
      const policyName = getTextContent(policyNameNode);
      if (policyName) {
        info.varName = policyName;
      }
      break;
  }
  
  return info;
}

/**
 * Main directive evaluation router.
 * Routes to specific evaluators based on directive kind.
 */
export async function evaluateDirective(
  directive: DirectiveNode,
  env: Environment,
  context?: EvaluationContext
): Promise<EvalResult> {
  // Extract trace info and push to stack
  const traceInfo = extractTraceInfo(directive);
  env.pushDirective(
    traceInfo.directive,
    traceInfo.varName,
    directive.location
  );

  const hookManager = env.getHookManager();
  const operationContext = buildOperationContext(directive, traceInfo);

  try {
    const executeOnce = async (): Promise<EvalResult> => {
      return await env.withOpContext(operationContext, async () => {
        let extractedInputs: readonly unknown[] = [];
        let precomputedVarAssignment: VarAssignmentResult | undefined;

        if (directive.kind === 'var') {
          precomputedVarAssignment = await prepareVarAssignment(directive, env);
          extractedInputs = [precomputedVarAssignment.variable];
        } else {
          extractedInputs = await extractDirectiveInputs(directive, env);
        }
        const preDecision = await hookManager.runPre(
          directive,
          extractedInputs,
          env,
          operationContext
        );
        const transformedInputs = getGuardTransformedInputs(preDecision, extractedInputs);
        if (precomputedVarAssignment && transformedInputs && transformedInputs[0]) {
          const firstTransformed = transformedInputs[0];
          if (isVariable(firstTransformed)) {
            precomputedVarAssignment = {
              ...precomputedVarAssignment,
              variable: firstTransformed as Variable
            };
          }
        }

        const resolvedInputs = transformedInputs ?? extractedInputs;
        await handleGuardDecision(preDecision, directive, env, operationContext);

        const mergedContext = mergeEvaluationContext(
          context,
          resolvedInputs,
          operationContext,
          precomputedVarAssignment
        );

        let result = await dispatchDirective(directive, env, mergedContext);
        result = await hookManager.runPost(directive, result, resolvedInputs, env, operationContext);

        if (directive.kind === 'var' && precomputedVarAssignment && (result as any).__guardTransformed) {
          const targetVar = env.getVariable(precomputedVarAssignment.identifier) ?? {
            ...precomputedVarAssignment.variable
          };

          if (isVariable(result.value)) {
            const replacement = result.value as Variable;
            targetVar.value = (replacement as any).value ?? replacement;
            targetVar.mx = {
              ...(targetVar.mx ?? {}),
              ...(replacement.mx ?? {})
            };
          } else {
            targetVar.value = result.value;
            const descriptor = extractSecurityDescriptor(result.value, {
              recursive: true,
              mergeArrayElements: true
            });
            if (descriptor) {
              const mx = (targetVar.mx ?? (targetVar.mx = {} as any)) as Record<string, unknown>;
              updateVarMxFromDescriptor(mx, descriptor);
              if ('mxCache' in mx) {
                delete (mx as any).mxCache;
              }
            }
          }
        }
        return result;
      });
    };

    const sourceRetryable =
      (operationContext.metadata &&
        typeof (operationContext.metadata as any).sourceRetryable === 'boolean' &&
        (operationContext.metadata as any).sourceRetryable === true) ||
      false;

    return await runWithGuardRetry({
      env,
      operationContext,
      sourceRetryable,
      execute: executeOnce
    });
  } catch (error) {
    // Enhance errors with directive trace
    const trace = env.getDirectiveTrace();
    
    // Check if this is an import parse error
    if (error && typeof error === 'object' && 'importParseError' in error) {
      const parseError = (error as any).importParseError;
      // Mark the current import directive as failed
      env.markLastDirectiveFailed(
        `${parseError.file}.mld failed to parse at line ${parseError.line}: ${parseError.message}`
      );
    }
    
    if (trace.length > 0) {
      if (error && typeof error === 'object') {
        // For MlldError objects with details property
        if ('details' in error && typeof error.details === 'object') {
          if (!error.details.directiveTrace) {
            error.details = {
              ...error.details,
              directiveTrace: trace
            };
          }
        } 
        // For regular Error objects, add a custom property
        else if (error instanceof Error) {
          (error as any).mlldTrace = trace;
        }
      }
    }
    throw error;
  } finally {
    // Always pop the directive from the trace
    env.popDirective();
    clearDirectiveReplay(directive);
  }
}

function mergeEvaluationContext(
  baseContext: EvaluationContext | undefined,
  extractedInputs: readonly unknown[],
  operationContext: OperationContext,
  precomputedVarAssignment?: VarAssignmentResult
): EvaluationContext {
  const extra: EvaluationContext = {
    extractedInputs,
    operationContext,
    precomputedVarAssignment
  };
  return baseContext ? { ...baseContext, ...extra } : extra;
}

function buildOperationContext(
  directive: DirectiveNode,
  traceInfo: { directive: string; varName?: string }
): OperationContext {
  const labels = (directive.meta?.securityLabels || directive.values?.securityLabels) as string[] | undefined;
  const baseMetadata: Record<string, unknown> = {
    trace: traceInfo.directive
  };
  const streamingEnabled = readStreamFlag(directive);
  const context: OperationContext = {
    type: directive.kind,
    subtype: directive.subtype,
    labels,
    name: traceInfo.varName,
    location: directive.location ?? null,
    metadata: streamingEnabled ? { ...baseMetadata, streaming: true } : baseMetadata
  };

  switch (directive.kind) {
    case 'run':
      applyRunMetadata(context, directive);
      break;
    case 'import':
      applyImportMetadata(context, directive);
      break;
    case 'output':
    case 'append':
      applyOutputMetadata(context, directive);
      break;
    case 'var':
      applyVarMetadata(context, directive);
      break;
    case 'show':
    case 'stream':
      applyShowMetadata(context, directive);
      break;
  }

  applyOperationLabels(context, directive);

  return context;
}

async function dispatchDirective(
  directive: DirectiveNode,
  env: Environment,
  evaluationContext?: EvaluationContext
): Promise<EvalResult> {
  switch (directive.kind) {
    case 'path':
      return await evaluatePath(directive, env);

    case 'run':
      return await evaluateRun(directive, env, [], evaluationContext);

    case 'import':
      return await evaluateImport(directive, env);

    case 'when':
      return await evaluateWhen(directive as any, env);

    case 'output':
      return await evaluateOutput(directive, env, evaluationContext);

    case 'append':
      return await evaluateAppend(directive, env, evaluationContext);

    case 'var':
      return await evaluateVar(directive, env, evaluationContext);

    case 'show':
      return await evaluateShow(directive, env, evaluationContext);
    case 'stream':
      return await evaluateShow(directive, env, evaluationContext);

    case 'exe':
      return await evaluateExe(directive, env);

    case 'for':
      return await evaluateForDirective(directive as any, env);

    case 'loop':
      return await evaluateLoopDirective(directive as any, env);

    case 'export':
      return await evaluateExport(directive as any, env);

    case 'guard':
      return await evaluateGuard(directive, env);

    case 'needs':
      return await evaluateNeeds(directive, env);

    case 'wants':
      return await evaluateWants(directive, env);

    case 'policy':
      return await evaluatePolicy(directive as PolicyDirectiveNode, env);

    default:
      throw new Error(`Unknown directive kind: ${directive.kind}`);
  }
}

function applyRunMetadata(context: OperationContext, directive: DirectiveNode): void {
  const metadata: Record<string, unknown> = { ...(context.metadata ?? {}) };
  metadata.runSubtype = directive.subtype;
  const language = directive.meta?.language;
  if (typeof language === 'string' && language.length > 0) {
    metadata.language = language;
  }

  if (directive.subtype === 'runCommand') {
    const nodes = directive.values?.identifier || directive.values?.command;
    const preview = summarizeNodes(nodes);
    if (preview) {
      context.command = preview;
      metadata.commandPreview = preview;
    }
  } else if (directive.subtype === 'runExec') {
    const execNode = directive.values?.identifier?.[0];
    const execName = execNode ? getTextContent(execNode) : undefined;
    if (execName) {
      context.command = `@${execName}`;
      metadata.execName = execName;
    }
  }

  context.metadata = metadata;
}

function applyImportMetadata(context: OperationContext, directive: DirectiveNode): void {
  const metadata: Record<string, unknown> = { ...(context.metadata ?? {}) };
  const pathNode = directive.values?.path?.[0];
  const path = pathNode ? getTextContent(pathNode) : undefined;
  if (path) {
    context.target = path;
  }
  context.metadata = metadata;
}

function applyOutputMetadata(context: OperationContext, directive: DirectiveNode): void {
  const metadata: Record<string, unknown> = { ...(context.metadata ?? {}) };
  const pathNode =
    directive.values?.path?.[0] ||
    directive.values?.target?.path?.[0] ||
    (Array.isArray(directive.values?.target)
      ? directive.values.target[0]?.path?.[0]
      : undefined);
  const path = pathNode ? getTextContent(pathNode) : undefined;
  if (path) {
    context.target = path;
  }
  const targetType = directive.meta?.targetType;
  if (targetType) {
    metadata.outputTargetType = targetType;
  }
  context.metadata = metadata;
}

function applyVarMetadata(context: OperationContext, directive: DirectiveNode): void {
  const metadata: Record<string, unknown> = { ...(context.metadata ?? {}) };
  const identifierNodes = directive.values?.identifier;
  const varName = identifierNodes && identifierNodes[0] ? getTextContent(identifierNodes[0]) : undefined;
  if (varName) {
    context.target = varName;
  }
  metadata.sourceRetryable = true;
  context.metadata = metadata;
}

function applyShowMetadata(context: OperationContext, directive: DirectiveNode): void {
  const metadata: Record<string, unknown> = { ...(context.metadata ?? {}) };
  metadata.showSubtype = directive.subtype;
  metadata.sourceRetryable = true;
  context.metadata = metadata;
}

function applyOperationLabels(context: OperationContext, directive: DirectiveNode): void {
  if (directive.kind === 'run') {
    const runSubtype = directive.subtype;
    if (runSubtype === 'runCommand') {
      const commandPreview = context.command;
      const parsed = commandPreview ? parseCommand(commandPreview) : {};
      context.opLabels = getOperationLabels({
        type: 'cmd',
        command: parsed.command,
        subcommand: parsed.subcommand
      });
      const sources = parsed.command
        ? getOperationSources({ type: 'cmd', command: parsed.command, subcommand: parsed.subcommand })
        : [];
      if (sources.length > 0) {
        context.sources = sources;
      }
      return;
    }

    if (runSubtype === 'runCode') {
      const language =
        typeof context.metadata === 'object' && context.metadata
          ? (context.metadata as Record<string, unknown>).language
          : undefined;
      const opType = mapLanguageToOpType(language);
      if (opType) {
        context.opLabels = getOperationLabels({ type: opType });
        context.sources = getOperationSources({ type: opType });
      }
      return;
    }

    return;
  }

  const opType = mapDirectiveToOpType(directive.kind);
  if (!opType) {
    return;
  }

  context.opLabels = getOperationLabels({ type: opType });
  context.sources = getOperationSources({ type: opType });
}

function mapDirectiveToOpType(kind: string): ReturnType<typeof mapLanguageToOpType> | null {
  switch (kind) {
    case 'show':
      return 'show';
    case 'output':
      return 'output';
    case 'log':
      return 'log';
    case 'append':
      return 'append';
    case 'stream':
      return 'stream';
    default:
      return null;
  }
}

function mapLanguageToOpType(language: unknown): ReturnType<typeof mapDirectiveToOpType> | null {
  if (typeof language !== 'string') {
    return null;
  }
  const normalized = language.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (normalized === 'bash' || normalized === 'sh' || normalized === 'shell') {
    return 'sh';
  }
  if (normalized === 'node' || normalized === 'nodejs') {
    return 'node';
  }
  if (normalized === 'js' || normalized === 'javascript') {
    return 'js';
  }
  if (normalized === 'py' || normalized === 'python') {
    return 'py';
  }
  if (normalized === 'prose') {
    return 'prose';
  }
  return null;
}

function readStreamFlag(directive: DirectiveNode): boolean {
  const candidates = [
    (directive.values as any)?.withClause?.stream,
    (directive.values as any)?.invocation?.withClause?.stream,
    (directive.values as any)?.execInvocation?.withClause?.stream,
    directive.meta?.withClause?.stream
  ];

  return candidates.some(value => value === true || value === 'true');
}

function summarizeNodes(nodes: unknown): string | undefined {
  if (!nodes) {
    return undefined;
  }
  const array = Array.isArray(nodes) ? nodes : [nodes];
  const parts = array
    .map(node => (typeof node === 'string' ? node : getTextContent(node as any) ?? ''))
    .join('');
  const preview = parts.trim();
  if (!preview) {
    return undefined;
  }
  return preview.length > 120 ? `${preview.slice(0, 117)}...` : preview;
}
