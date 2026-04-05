import type { DirectiveNode } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import type { ExecutableDefinition } from '@core/types/executable';
import { astLocationToSourceLocation } from '@core/types';
import {
  extractParamTypes,
  resolveExeExactPayloadArgs,
  resolveExeCorrelateControlArgs,
  resolveExeControlArgs,
  resolveExeDescription,
  resolveExeUpdateArgs,
  validateExecutableAuthorizationMetadata
} from './exe/definition-helpers';
import { buildCoreExecutableFamily } from './exe/core-definition-builders';
import { buildControlFlowExecutableDefinition } from './exe/control-flow-definition-builders';
import { handleExeEnvironmentDeclaration } from './exe/environment-declaration';
import {
  createExeSecurityContext,
  materializeExecutableVariable
} from './exe/variable-assembly';
import { getWithClauseField } from '@interpreter/utils/with-clause';
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

  const rawControlArgs = getWithClauseField(directive.values?.withClause, 'controlArgs');
  const controlArgs = await resolveExeControlArgs(rawControlArgs, env, executableDef.paramNames);
  if (controlArgs !== undefined) {
    executableDef.controlArgs = controlArgs;
  }

  const rawUpdateArgs = getWithClauseField(directive.values?.withClause, 'updateArgs');
  const updateArgs = await resolveExeUpdateArgs(rawUpdateArgs, env, executableDef.paramNames);
  if (updateArgs !== undefined) {
    executableDef.updateArgs = updateArgs;
  }

  const rawExactPayloadArgs = getWithClauseField(directive.values?.withClause, 'exactPayloadArgs');
  const exactPayloadArgs = await resolveExeExactPayloadArgs(rawExactPayloadArgs, env, executableDef.paramNames);
  if (exactPayloadArgs !== undefined) {
    executableDef.exactPayloadArgs = exactPayloadArgs;
  }

  validateExecutableAuthorizationMetadata({
    controlArgs: executableDef.controlArgs,
    updateArgs: executableDef.updateArgs,
    exactPayloadArgs: executableDef.exactPayloadArgs
  });

  const rawCorrelateControlArgs = getWithClauseField(directive.values?.withClause, 'correlateControlArgs');
  const correlateControlArgs = await resolveExeCorrelateControlArgs(rawCorrelateControlArgs, env);
  if (correlateControlArgs !== undefined) {
    executableDef.correlateControlArgs = correlateControlArgs;
  }

  const rawDescription = getWithClauseField(directive.values?.withClause, 'description');
  const description = await resolveExeDescription(rawDescription, env);
  if (description !== undefined) {
    executableDef.description = description;
  }

  const outputRecordNode = directive.values?.outputRecord?.[0];
  const outputRecord =
    outputRecordNode && outputRecordNode.type === 'VariableReference'
      ? outputRecordNode.identifier
      : typeof (directive.raw as any)?.outputRecord === 'string'
        ? (directive.raw as any).outputRecord
        : undefined;
  if (outputRecord) {
    executableDef.outputRecord = outputRecord;
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
