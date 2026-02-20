import type { DirectiveNode } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import type { ExecutableDefinition } from '@core/types/executable';
import { astLocationToSourceLocation } from '@core/types';
// import { ExecParameterConflictError } from '@core/errors/ExecParameterConflictError'; // Removed - parameter shadowing is allowed
import {
  extractParamTypes,
  resolveExeDescription
} from './exe/definition-helpers';
import { buildCoreExecutableFamily } from './exe/core-definition-builders';
import { buildControlFlowExecutableDefinition } from './exe/control-flow-definition-builders';
import { handleExeEnvironmentDeclaration } from './exe/environment-declaration';
import {
  createExeSecurityContext,
  materializeExecutableVariable
} from './exe/variable-assembly';
export { evaluateExeBlock } from './exe/block-execution';
export type { ExeBlockOptions } from './exe/block-execution';

// Parameter conflict checking removed - parameters are allowed to shadow outer scope variables
// This is consistent with standard function parameter behavior and mlld's immutability model

/**
 * Evaluate @exec directives.
 * Defines executable commands/code but doesn't run them.
 * 
 * Ported from ExecDirectiveHandler.
 */
export async function evaluateExe(
  directive: DirectiveNode,
  env: Environment
): Promise<EvalResult> {
  const sourceLocation = astLocationToSourceLocation(
    directive.location,
    env.getCurrentFilePath()
  );
  // Handle environment declaration first
  if (directive.subtype === 'environment') {
    return handleExeEnvironmentDeclaration(directive, env);
  }
  
  // Extract identifier - this is a command name, not content to interpolate
  const identifierNodes = directive.values?.identifier;
  if (!identifierNodes || !Array.isArray(identifierNodes) || identifierNodes.length === 0) {
    throw new Error('Exec directive missing identifier');
  }
  
  // For exec directives, extract the command name
  const identifierNode = identifierNodes[0];
  let identifier: string;
  
  // With improved type consistency, identifierNodes is always VariableReferenceNode[]
  if (identifierNode.type === 'VariableReference' && 'identifier' in identifierNode) {
    identifier = identifierNode.identifier;
  } else {
    throw new Error('Exec directive identifier must be a simple command name');
  }
  const securityContext = createExeSecurityContext(directive, env, identifier);

  let executableDef: ExecutableDefinition;
  const coreBuildResult = await buildCoreExecutableFamily({
    directive,
    env,
    sourceLocation: sourceLocation ?? undefined,
    identifier,
    securityLabels: securityContext.securityLabels,
    descriptor: securityContext.descriptor,
    capabilityContext: securityContext.capabilityContext
  });

  if (coreBuildResult?.kind === 'evalResult') {
    return coreBuildResult.result;
  }

  if (coreBuildResult?.kind === 'definition') {
    executableDef = coreBuildResult.executableDef;
  } else {
    const controlFlowExecutableDef = buildControlFlowExecutableDefinition(
      directive,
      identifier
    );
    if (!controlFlowExecutableDef) {
      throw new Error(`Unsupported exec subtype: ${directive.subtype}`);
    }
    executableDef = controlFlowExecutableDef;
  }
  
  const paramTypes = extractParamTypes(directive.values?.params || []);
  if (Object.keys(paramTypes).length > 0) {
    executableDef.paramTypes = paramTypes;
  }

  const description = await resolveExeDescription(directive.values?.withClause?.description, env);
  if (description !== undefined) {
    executableDef.description = description;
  }

  return materializeExecutableVariable({
    directive,
    env,
    identifier,
    executableDef,
    descriptor: securityContext.descriptor,
    capabilityContext: securityContext.capabilityContext
  });
}
