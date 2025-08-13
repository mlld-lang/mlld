import type { DirectiveNode } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import { getTextContent } from '../utils/type-guard-helpers';

// Import specific evaluators
import { evaluatePath } from './path';
import { evaluateRun } from './run';
import { evaluateImport } from './import';
import { evaluateWhen } from './when';
import { evaluateOutput } from './output';
import { evaluateVar } from './var';
import { evaluateShow } from './show';
import { evaluateExe } from './exe';
import { evaluateForDirective } from './for';

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
  context?: any
): Promise<EvalResult> {
  // Extract trace info and push to stack
  const traceInfo = extractTraceInfo(directive);
  env.pushDirective(
    traceInfo.directive,
    traceInfo.varName,
    directive.location
  );
  
  try {
    // Route based on directive kind
    switch (directive.kind) {
    case 'path':
      return await evaluatePath(directive, env);
      
    case 'run':
      return await evaluateRun(directive, env);
      
    case 'import':
      return await evaluateImport(directive, env);
      
    case 'when':
      return await evaluateWhen(directive as any, env);
      
    case 'output':
      return await evaluateOutput(directive, env);
      
    // New directives
    case 'var':
      return await evaluateVar(directive, env);
      
    case 'show':
      return await evaluateShow(directive, env, context);
      
    case 'exe':
      return await evaluateExe(directive, env);
      
    case 'for':
      return await evaluateForDirective(directive as any, env);
      
    default:
      throw new Error(`Unknown directive kind: ${directive.kind}`);
    }
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
  }
}