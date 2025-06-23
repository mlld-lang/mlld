import type { DirectiveNode } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';

// Import specific evaluators
import { evaluateText } from './text';
import { evaluateData } from './data';
import { evaluatePath } from './path';
import { evaluateRun } from './run';
import { evaluateExec } from './exec';
import { evaluateAdd } from './add';
import { evaluateImport } from './import';
import { evaluateWhen } from './when';
import { evaluateOutput } from './output';
// New evaluators
import { evaluateVar } from './var';
import { evaluateShow } from './show';
import { evaluateExe } from './exe';

/**
 * Extract trace information from a directive
 */
function extractTraceInfo(directive: DirectiveNode): {
  directive: string;
  varName?: string;
} {
  const info: { directive: string; varName?: string } = {
    directive: `@${directive.kind}`
  };
  
  // Extract variable/exec names based on directive type
  switch (directive.kind) {
    case 'text':
    case 'data':
    case 'path':
    case 'var':
      // @text varName = ... or @var varName = ...
      const identifier = directive.values?.identifier?.[0] || directive.values?.identifier;
      if (identifier?.type === 'Text' && 'content' in identifier) {
        info.varName = identifier.content;
      } else if (identifier?.type === 'VariableReference' && 'identifier' in identifier) {
        info.varName = identifier.identifier;
      }
      break;
      
    case 'run':
      // @run @execName or @run [command]
      if (directive.subtype === 'runExec') {
        const execId = directive.values?.identifier?.[0];
        if (execId?.type === 'Text' && 'content' in execId) {
          info.varName = `@${execId.content}`;
        }
      }
      break;
      
    case 'exec':
    case 'exe':
      // @exec funcName(...) = ... or @exe funcName(...) = ...
      const execName = directive.values?.name?.[0];
      if (execName?.type === 'Text' && 'content' in execName) {
        info.varName = execName.content;
      }
      break;
      
    case 'foreach':
      // foreach @template(@items)
      const template = directive.values?.template?.[0];
      if (template?.type === 'Text' && 'content' in template) {
        info.varName = template.content;
      }
      break;
      
    case 'import':
      // @import { ... } from "path"
      const importPath = directive.values?.path?.[0];
      if (importPath?.type === 'Text' && 'content' in importPath) {
        // Show just the filename for cleaner trace
        const pathContent = importPath.content;
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
  env: Environment
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
    case 'text':
      return await evaluateText(directive, env);
      
    case 'data':
      return await evaluateData(directive, env);
      
    case 'path':
      return await evaluatePath(directive, env);
      
    case 'run':
      return await evaluateRun(directive, env);
      
    case 'exec':
      return await evaluateExec(directive, env);
      
    case 'add':
      return await evaluateAdd(directive, env);
      
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
      return await evaluateShow(directive, env);
      
    case 'exe':
      return await evaluateExe(directive, env);
      
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