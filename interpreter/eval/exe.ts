import type { BaseMlldNode, DirectiveNode, ExeBlockNode, TextNode } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import type { ExecutableDefinition, CodeExecutable } from '@core/types/executable';
import { astLocationToSourceLocation } from '@core/types';
import {
  createExecutableVariable,
  VariableMetadataUtils,
  type VariableSource
} from '@core/types/variable';
// import { ExecParameterConflictError } from '@core/errors/ExecParameterConflictError'; // Removed - parameter shadowing is allowed
import { logger } from '@core/utils/logger';
import {
  createCapabilityContext,
  makeSecurityDescriptor,
  type DataLabel,
  type CapabilityContext
} from '@core/types/security';
import { maybeAutosignVariable } from './auto-sign';
import {
  extractParamNames,
  extractParamTypes,
  resolveExeDescription
} from './exe/definition-helpers';
import { buildCoreExecutableFamily } from './exe/core-definition-builders';
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
  } else if (directive.subtype === 'exeWhen') {
    // Handle when expression executable: @exe name(params) = when: [...]
    const contentNodes = directive.values?.content;
    if (!contentNodes || !Array.isArray(contentNodes) || contentNodes.length === 0) {
      throw new Error('Exec when directive missing when expression');
    }
    
    const whenExprNode = contentNodes[0];
    if (!whenExprNode || whenExprNode.type !== 'WhenExpression') {
      throw new Error('Exec when directive content must be a WhenExpression');
    }
    
    // Get parameter names if any
    const params = directive.values?.params || [];
    const paramNames = extractParamNames(params);
    
    // Parameters are allowed to shadow outer scope variables
    
    if (process.env.DEBUG_EXEC) {
      logger.debug('Creating exe when expression:', { 
        identifier,
        paramNames,
        conditionCount: whenExprNode.conditions?.length
      });
    }
    
    // Create a special executable that evaluates the when expression
    // We'll treat this as a code executable with special handling
    executableDef = {
      type: 'code',
      codeTemplate: contentNodes, // Store the WhenExpression node
      language: 'mlld-when', // Special language marker
      paramNames,
      sourceDirective: 'exec'
    } satisfies CodeExecutable;
    
  } else if (directive.subtype === 'exeForeach') {
    // Handle foreach expression executable: @exe name(params) = foreach @cmd(@arrays)
    const contentNodes = directive.values?.content;
    if (!contentNodes || !Array.isArray(contentNodes) || contentNodes.length === 0) {
      throw new Error('Exec foreach directive missing foreach expression');
    }
    
    const foreachNode = contentNodes[0];
    // Basic shape check
    if (!foreachNode || (foreachNode.type !== 'foreach-command' && (foreachNode.value?.type !== 'foreach'))) {
      throw new Error('Exec foreach directive content must be a ForeachCommandExpression');
    }
    
    // Get parameter names if any
    const params = directive.values?.params || [];
    const paramNames = extractParamNames(params);
    
    if (process.env.DEBUG_EXEC) {
      logger.debug('Creating exe foreach expression:', { 
        identifier,
        paramNames
      });
    }
    
    // Create a special executable that evaluates the foreach expression
    executableDef = {
      type: 'code',
      codeTemplate: contentNodes, // Store the Foreach AST node
      language: 'mlld-foreach', // Special language marker
      paramNames,
      sourceDirective: 'exec'
    } satisfies CodeExecutable;
  
  } else if (directive.subtype === 'exeFor') {
    // Handle for expression executable: @exe name(params) = for @var in @collection => expression
    const contentNodes = directive.values?.content;
    if (!contentNodes || !Array.isArray(contentNodes) || contentNodes.length === 0) {
      throw new Error('Exec for directive missing for expression');
    }
    
    const forExprNode = contentNodes[0];
    if (!forExprNode || forExprNode.type !== 'ForExpression') {
      throw new Error('Exec for directive content must be a ForExpression');
    }
    
    // Get parameter names if any
    const params = directive.values?.params || [];
    const paramNames = extractParamNames(params);
    
    // Parameters are allowed to shadow outer scope variables
    
    if (process.env.DEBUG_EXEC) {
      logger.debug('Creating exe for expression:', { 
        identifier,
        paramNames,
        variable: forExprNode.variable?.identifier
      });
    }
    
    // Create a special executable that evaluates the for expression
    // We'll treat this as a code executable with special handling
    executableDef = {
      type: 'code',
      codeTemplate: contentNodes, // Store the ForExpression node
      language: 'mlld-for', // Special language marker
      paramNames,
      sourceDirective: 'exec'
    } satisfies CodeExecutable;

  } else if (directive.subtype === 'exeLoop') {
    // Handle loop expression executable: @exe name(params) = loop(...) [ ... ]
    const contentNodes = directive.values?.content;
    if (!contentNodes || !Array.isArray(contentNodes) || contentNodes.length === 0) {
      throw new Error('Exec loop directive missing loop expression');
    }

    const loopExprNode = contentNodes[0];
    if (!loopExprNode || loopExprNode.type !== 'LoopExpression') {
      throw new Error('Exec loop directive content must be a LoopExpression');
    }

    const params = directive.values?.params || [];
    const paramNames = extractParamNames(params);

    if (process.env.DEBUG_EXEC) {
      logger.debug('Creating exe loop expression:', {
        identifier,
        paramNames
      });
    }

    executableDef = {
      type: 'code',
      codeTemplate: contentNodes,
      language: 'mlld-loop',
      paramNames,
      sourceDirective: 'exec'
    } satisfies CodeExecutable;

  } else if (directive.subtype === 'exeBlock') {
    const statements = (directive.values as any)?.statements || [];
    const returnStmt = (directive.values as any)?.return;
    
    const params = directive.values?.params || [];
    const paramNames = extractParamNames(params);

    const blockNode: ExeBlockNode = {
      type: 'ExeBlock',
      nodeId: directive.nodeId,
      values: {
        statements,
        ...(returnStmt ? { return: returnStmt } : {})
      },
      meta: {
        statementCount: (directive.meta as any)?.statementCount ?? statements.length,
        hasReturn: (directive.meta as any)?.hasReturn ?? Boolean(returnStmt)
      },
      location: directive.location
    };

    executableDef = {
      type: 'code',
      codeTemplate: [blockNode],
      language: 'mlld-exe-block',
      paramNames,
      sourceDirective: 'exec'
    } satisfies CodeExecutable;

  } else {
    throw new Error(`Unsupported exec subtype: ${directive.subtype}`);
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
