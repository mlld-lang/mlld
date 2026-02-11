import type { DirectiveNode } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import type { ExecutableDefinition } from '@core/types/executable';
import { astLocationToSourceLocation } from '@core/types';
import {
  createExecutableVariable,
  VariableMetadataUtils,
  type VariableSource
} from '@core/types/variable';
// import { ExecParameterConflictError } from '@core/errors/ExecParameterConflictError'; // Removed - parameter shadowing is allowed
import {
  createCapabilityContext,
  makeSecurityDescriptor,
  type DataLabel,
  type CapabilityContext
} from '@core/types/security';
import { maybeAutosignVariable } from './auto-sign';
import {
  extractParamTypes,
  resolveExeDescription
} from './exe/definition-helpers';
import { buildCoreExecutableFamily } from './exe/core-definition-builders';
import { buildControlFlowExecutableDefinition } from './exe/control-flow-definition-builders';
import { handleExeEnvironmentDeclaration } from './exe/environment-declaration';
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
  
  const securityLabels = (directive.meta?.securityLabels || directive.values?.securityLabels) as DataLabel[] | undefined;
  const descriptor = makeSecurityDescriptor({ labels: securityLabels });
  const capabilityContext: CapabilityContext = createCapabilityContext({
    kind: 'exe',
    descriptor,
    metadata: {
      identifier,
      filePath: env.getCurrentFilePath()
    },
    operation: {
      kind: 'exe',
      identifier,
      location: directive.location
    }
  });

  let executableDef: ExecutableDefinition;
  const coreBuildResult = await buildCoreExecutableFamily({
    directive,
    env,
    sourceLocation: sourceLocation ?? undefined,
    identifier,
    securityLabels,
    descriptor,
    capabilityContext
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
  
  // Create variable source metadata
  const source: VariableSource = {
    directive: 'var', // exe directives create variables in the new system
    syntax: 'code', // Default to code syntax
    hasInterpolation: false,
    isMultiLine: false
  };
  
  // Adjust syntax based on executable type
  if (executableDef.type === 'command' || executableDef.type === 'commandRef' || executableDef.type === 'pipeline') {
    source.syntax = 'command';
  } else if (executableDef.type === 'template') {
    source.syntax = 'template';
  } else if (executableDef.type === 'data') {
    source.syntax = 'object';
  } else if (executableDef.type === 'prose') {
    source.syntax = 'prose';
  }
  
  // Extract language for code executables
  const language = executableDef.type === 'code' 
    ? (executableDef.language as 'js' | 'node' | 'python' | 'sh' | undefined)
    : undefined;
  
  /**
   * Create the executable variable
   * WHY: Executable variables wrap command/code/template definitions with parameter
   * metadata, enabling them to be invoked like functions with argument binding.
   * GOTCHA: The variable.value.template is set AFTER creation because the executable
   * definition structure varies by type (commandTemplate vs codeTemplate vs template).
   * CONTEXT: These variables are used by /run directives, pipelines, and anywhere
   * a parameterized executable can be invoked.
   */
  const location = astLocationToSourceLocation(directive.location, env.getCurrentFilePath());
  
    // CONTEXT: Shadow environments may be present; capture them for later execution
  
  const metadata: Record<string, any> = {
    definedAt: location,
    executableDef
  };
  if (description !== undefined) {
    metadata.description = description;
  }

  if (env.hasShadowEnvs()) {
    metadata.capturedShadowEnvs = env.captureAllShadowEnvs();
  }

    // Only capture module environment when we're evaluating a module for import
    if (env.getIsImporting()) {
      metadata.capturedModuleEnv = env.captureModuleEnvironment();
    }

    const executableTypeForVariable =
      executableDef.type === 'code'
        ? 'code'
        : executableDef.type === 'data'
          ? 'data'
          : 'command';

  let executableDescriptor = descriptor;
  if (executableDef.type === 'command') {
    const commandTaintDescriptor = makeSecurityDescriptor({ taint: ['src:exec'] });
    executableDescriptor = executableDescriptor
      ? env.mergeSecurityDescriptors(executableDescriptor, commandTaintDescriptor)
      : commandTaintDescriptor;
  }

  const metadataWithSecurity = VariableMetadataUtils.applySecurityMetadata(metadata, {
      existingDescriptor: executableDescriptor,
      capability: capabilityContext
    });

    const variable = createExecutableVariable(
      identifier,
      executableTypeForVariable,
      '', // Template will be filled from executableDef
      executableDef.paramNames || [],
      language,
      source,
      {
        metadata: metadataWithSecurity,
        internal: {
          executableDef
        }
      }
    );
    if (Object.keys(paramTypes).length > 0) {
      variable.paramTypes = paramTypes;
    }
    if (description !== undefined) {
      variable.description = description;
    }

    // Set the actual template/command content
    if (executableDef.type === 'command') {
      variable.value.template = executableDef.commandTemplate;
    } else if (executableDef.type === 'code') {
      variable.value.template = executableDef.codeTemplate;
    } else if (executableDef.type === 'template') {
      variable.value.template = executableDef.template;
    } else if (executableDef.type === 'data') {
      (variable.value as any).template = executableDef.dataTemplate;
    }
    
    env.setVariable(identifier, variable);
    await maybeAutosignVariable(identifier, variable, env);
    
    // Return the executable definition (no output for variable definitions)
    return { value: executableDef, env };
}
