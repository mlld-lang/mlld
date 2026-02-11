import type { BaseMlldNode, DirectiveNode, ExeBlockNode, TextNode } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import type { ExecutableDefinition, CommandExecutable, CommandRefExecutable, CodeExecutable, TemplateExecutable, SectionExecutable, ResolverExecutable, PipelineExecutable, ProseExecutable } from '@core/types/executable';
import { evaluate } from '../core/interpreter';
import { astLocationToSourceLocation } from '@core/types';
import {
  createExecutableVariable,
  createSimpleTextVariable,
  createArrayVariable,
  createObjectVariable,
  createPrimitiveVariable,
  createStructuredValueVariable,
  VariableMetadataUtils,
  type VariableSource,
  type VariableFactoryInitOptions
} from '@core/types/variable';
// import { ExecParameterConflictError } from '@core/errors/ExecParameterConflictError'; // Removed - parameter shadowing is allowed
import { logger } from '@core/utils/logger';
import {
  createCapabilityContext,
  makeSecurityDescriptor,
  type DataLabel,
  type CapabilityContext
} from '@core/types/security';
import { isStructuredValue, extractSecurityDescriptor } from '../utils/structured-value';
import { updateVarMxFromDescriptor } from '@core/types/variable/VarMxHelpers';
import { maybeAutosignVariable } from './auto-sign';
import {
  extractParamNames,
  extractParamTypes,
  interpolateAndRecord,
  parseTemplateFileNodes,
  resolveExeDescription
} from './exe/definition-helpers';
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


    if (directive.subtype === 'exeCommand') {
      const params = directive.values?.params || [];
    const paramNames = extractParamNames(params);
    const withClause = directive.values?.withClause;

    if (directive.meta?.isPipelineOnly && withClause?.pipeline) {
      executableDef = {
        type: 'pipeline',
        pipeline: withClause.pipeline,
        format: withClause.format,
        parallelCap: withClause.parallel,
        delayMs: withClause.delayMs,
        paramNames,
        sourceDirective: 'exec'
      } satisfies PipelineExecutable;
    } else {
      const commandRef = directive.values?.commandRef;
      if (commandRef) {
        /**
         * Handle executable defined as a reference to another symbol
         * WHY: The RHS may be a simple variable reference (identity), or a true command reference.
         *      We preserve identity bodies as templates at compile-time to avoid runtime ambiguity.
         */
        let refName: string | undefined;
        const commandRefNodes = Array.isArray(commandRef) ? commandRef : [commandRef];
        const execInvocation = (directive.values as any)?.execInvocation;
        const hasExecInvocation =
          execInvocation && typeof execInvocation === 'object' && (execInvocation as any).type === 'ExecInvocation';
        const invocationHasObject =
          hasExecInvocation &&
          (((execInvocation as any).commandRef?.objectSource) || ((execInvocation as any).commandRef?.objectReference));
        const invocationHasFields =
          hasExecInvocation && Array.isArray((execInvocation as any).fields) && (execInvocation as any).fields.length > 0;
        const shouldUseInvocationAst = invocationHasObject || invocationHasFields;
        try {
          const refCandidate = commandRefNodes[0];
          if (refCandidate && typeof refCandidate === 'object') {
            if ('type' in refCandidate && (refCandidate as any).type === 'VariableReference' && 'identifier' in (refCandidate as any)) {
              refName = (refCandidate as any).identifier as string;
            } else if ('name' in refCandidate && typeof (refCandidate as any).name === 'string') {
              refName = (refCandidate as any).name as string;
            }
          }
        } catch {}

        if (!refName) {
          refName = await interpolateAndRecord(commandRef as any, env);
        }

        const args = directive.values?.args || [];
        const refCandidate = commandRefNodes[0];
        const isVariableRef =
          refCandidate &&
          typeof refCandidate === 'object' &&
          'type' in refCandidate &&
          ((refCandidate as any).type === 'VariableReference' || (refCandidate as any).type === 'VariableReferenceWithTail');
        const refFields = isVariableRef ? (refCandidate as any).fields : undefined;
        const refPipes = isVariableRef ? (refCandidate as any).pipes : undefined;
        const shouldTemplateFromRef =
          isVariableRef &&
          (((refCandidate as any).type === 'VariableReferenceWithTail') ||
            (Array.isArray(refFields) && refFields.length > 0) ||
            (Array.isArray(refPipes) && refPipes.length > 0));
        const isIdentity =
          !shouldTemplateFromRef &&
          isVariableRef &&
          commandRefNodes.length === 1 &&
          paramNames.length >= 1 &&
          args.length === 0 &&
          typeof refName === 'string' &&
          refName.length > 0 &&
          refName === paramNames[0];

        if (shouldUseInvocationAst && hasExecInvocation) {
          executableDef = {
            type: 'commandRef',
            commandRef: refName || '',
            commandArgs: args,
            withClause,
            paramNames,
            sourceDirective: 'exec',
            commandRefAst: execInvocation
          } satisfies CommandRefExecutable;
        } else if (isIdentity || shouldTemplateFromRef) {
          executableDef = {
            type: 'template',
            template: isIdentity
              ? [{ type: 'VariableReference', identifier: refName }]
              : commandRefNodes,
            paramNames,
            sourceDirective: 'exec'
          } satisfies TemplateExecutable;
          if (withClause) {
            (executableDef as any).withClause = withClause;
          }
        } else {
          executableDef = {
            type: 'commandRef',
            commandRef: refName,
            commandArgs: args,
            withClause,
            paramNames,
            sourceDirective: 'exec'
          } satisfies CommandRefExecutable;
        }
      } else {
        const commandNodes = directive.values?.command;
        if (!commandNodes) {
          throw new Error('Exec command directive missing command');
        }

        const workingDir = (directive.values as any)?.workingDir;
        const workingDirMeta = (directive.meta as any)?.workingDirMeta || (directive.values as any)?.workingDirMeta;
        executableDef = {
          type: 'command',
          commandTemplate: commandNodes,
          withClause,
          paramNames,
          sourceDirective: 'exec',
          ...(workingDir ? { workingDir } : {}),
          ...(workingDirMeta ? { workingDirMeta } : {})
        } satisfies CommandExecutable;
      }
    }
    
  } else if (directive.subtype === 'exeData') {
    const dataNodes = directive.values?.data;
    if (!dataNodes) {
      throw new Error('Exec data directive missing data content');
    }
    const params = directive.values?.params || [];
    const paramNames = extractParamNames(params);
    executableDef = {
      type: 'data',
      dataTemplate: dataNodes,
      paramNames,
      sourceDirective: 'exec'
    };
  } else if (directive.subtype === 'exeValue') {
    const valueNode = directive.values?.value;
    if (!valueNode) {
      throw new Error('Exec value directive missing value');
    }
    const valueResult = await evaluate(valueNode as any, env, { isExpression: true });
    const resolvedValue = valueResult.value;
    const resolvedDescriptor = extractSecurityDescriptor(resolvedValue, {
      recursive: true,
      mergeArrayElements: true
    });
    const combinedDescriptor =
      resolvedDescriptor && descriptor
        ? env.mergeSecurityDescriptors(resolvedDescriptor, descriptor)
        : resolvedDescriptor || descriptor;
    const location = astLocationToSourceLocation(directive.location, env.getCurrentFilePath());
    const source: VariableSource = {
      directive: 'var',
      syntax: 'reference',
      hasInterpolation: false,
      isMultiLine: false
    };
    const options: VariableFactoryInitOptions = {
      mx: { definedAt: location },
      internal: {}
    };
    const metadata = VariableMetadataUtils.applySecurityMetadata(undefined, {
      labels: securityLabels,
      existingDescriptor: combinedDescriptor,
      capability: capabilityContext
    });
    if (metadata?.security) {
      updateVarMxFromDescriptor(options.mx ?? (options.mx = {}), metadata.security);
    }
    if (metadata) {
      options.metadata = metadata;
    }

    let variable;
    if (resolvedValue && typeof resolvedValue === 'object' && (resolvedValue as any).__executable) {
      const execDef = (resolvedValue as any).executableDef ?? (resolvedValue as any).value;
      variable = createExecutableVariable(
        identifier,
        'command',
        '',
        execDef?.paramNames || [],
        undefined,
        source,
        {
          ...options,
          internal: { ...(options.internal ?? {}), executableDef: execDef }
        }
      );
    } else if (isStructuredValue(resolvedValue)) {
      variable = createStructuredValueVariable(identifier, resolvedValue, source, options);
    } else if (typeof resolvedValue === 'number' || typeof resolvedValue === 'boolean' || resolvedValue === null) {
      variable = createPrimitiveVariable(identifier, resolvedValue, source, options);
    } else if (Array.isArray(resolvedValue)) {
      variable = createArrayVariable(identifier, resolvedValue, false, source, options);
    } else if (resolvedValue && typeof resolvedValue === 'object') {
      variable = createObjectVariable(identifier, resolvedValue as Record<string, unknown>, false, source, options);
    } else {
      variable = createSimpleTextVariable(identifier, String(resolvedValue ?? ''), source, options);
    }

    env.setVariable(identifier, variable);
    return { value: resolvedValue, env };
  } else if (directive.subtype === 'exeCode') {
    /**
     * Handle code executable definitions
     * WHY: Code executables run language-specific code (JS, Python, etc) with
     * parameter binding and shadow environment access.
     * GOTCHA: The code template is stored as AST nodes for lazy interpolation -
     * parameters are only substituted at execution time, not definition time.
     * CONTEXT: Enables patterns like /exe @transform(data) = js {@data.map(x => x * 2)}
     */
    const codeNodes = directive.values?.code;
    if (!codeNodes) {
      throw new Error('Exec code directive missing code');
    }
    
    // Get parameter names if any
    const params = directive.values?.params || [];
    const paramNames = extractParamNames(params);
    const withClause = directive.values?.withClause;
    
    // Parameters are allowed to shadow outer scope variables
    
    // Language is stored in meta, not raw
    const language = directive.meta?.language || 'javascript';
    
    // Store the code template (not interpolated yet)
    const workingDir = (directive.values as any)?.workingDir;
    const workingDirMeta = (directive.meta as any)?.workingDirMeta || (directive.values as any)?.workingDirMeta;
    executableDef = {
      type: 'code',
      codeTemplate: codeNodes,
      language,
      paramNames,
      sourceDirective: 'exec',
      ...(withClause ? { withClause } : {}),
      ...(workingDir ? { workingDir } : {}),
      ...(workingDirMeta ? { workingDirMeta } : {})
    } satisfies CodeExecutable;
    
  } else if (directive.subtype === 'exeResolver') {
    // Handle resolver executable: @exec name(params) = @resolver/path { @payload }
    const resolverNodes = directive.values?.resolver;
    if (!resolverNodes) {
      throw new Error('Exec resolver directive missing resolver path');
    }
    
    // Get the resolver path (it's a literal string, not interpolated)
    const resolverPath = await interpolateAndRecord(resolverNodes, env);
    
    // Get parameter names if any
    const params = directive.values?.params || [];
    const paramNames = extractParamNames(params);
    
    // Parameters are allowed to shadow outer scope variables
    
    // Get payload nodes if present
    const payloadNodes = directive.values?.payload;
    
    // Special case: If resolver is "run", this is likely a grammar parsing issue
    // where "@exec name() = @run [command]" was parsed as execResolver instead of execCommand
    if (resolverPath === 'run') {
      // Look for command content immediately following in the AST
      // This is a workaround for a grammar issue
      throw new Error('Grammar parsing issue: @exec with @run should be parsed as execCommand, not execResolver');
    }
    
    // Create resolver executable definition
    executableDef = {
      type: 'resolver',
      resolverPath,
      payloadTemplate: payloadNodes,
      paramNames,
      sourceDirective: 'exec'
    } satisfies ResolverExecutable;
    
  } else if (directive.subtype === 'exeTemplate') {
    /**
     * Handle template executable definitions
     * WHY: Template executables provide simple text interpolation with parameter
     * substitution, useful for generating formatted output without code execution.
     * GOTCHA: Templates use double square brackets [[...]] syntax and support full
     * mlld interpolation including nested directives.
     * CONTEXT: Common for report generation, formatted messages, and string templates
     * Example: /exe @greeting(name) = [[Hello, @name!]]
     */
    const templateNodes = directive.values?.template;
    if (!templateNodes) {
      throw new Error('Exec template directive missing template');
    }
    
    // Get parameter names if any
    const params = directive.values?.params || [];
    const paramNames = extractParamNames(params);
    
    // Parameters are allowed to shadow outer scope variables
    
    // Create template executable definition
    executableDef = {
      type: 'template',
      template: templateNodes,
      paramNames,
      sourceDirective: 'exec'
    } satisfies TemplateExecutable;
    
  } else if (directive.subtype === 'exeTemplateFile') {
    // Handle template executable loaded from external file by extension
    // Syntax: /exe @name(params) = template "path/to/file.att|.mtt"
    const templateNodes = await parseTemplateFileNodes(
      directive.values?.path,
      env,
      sourceLocation ?? undefined
    );
    
    // Get parameter names if any
    const params = directive.values?.params || [];
    const paramNames = extractParamNames(params);
    
    executableDef = {
      type: 'template',
      template: templateNodes,
      paramNames,
      sourceDirective: 'exec'
    } satisfies TemplateExecutable;
    
  } else if (directive.subtype === 'exeSection') {
    // Handle section exec: @exec name(file, section) = [@file # @section]
    const pathNodes = directive.values?.path;
    const sectionNodes = directive.values?.section;
    if (!pathNodes || !sectionNodes) {
      throw new Error('Exec section directive missing path or section');
    }
    
    // Get parameter names if any
    const params = directive.values?.params || [];
    const paramNames = extractParamNames(params);
    
    // Parameters are allowed to shadow outer scope variables
    
    // Get rename nodes if present
    const renameNodes = directive.values?.rename;
    
    // Create section executable definition
    executableDef = {
      type: 'section',
      pathTemplate: pathNodes,
      sectionTemplate: sectionNodes,
      renameTemplate: renameNodes,
      paramNames,
      sourceDirective: 'exec'
    } satisfies SectionExecutable;
    
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

  } else if (directive.subtype === 'exeProse' || directive.subtype === 'exeProseFile' || directive.subtype === 'exeProseTemplate') {
    // Handle prose executable: prose:@config { ... } or prose:@config "file.prose"
    const configRefNodes = directive.values?.configRef;
    if (!configRefNodes || !Array.isArray(configRefNodes) || configRefNodes.length === 0) {
      throw new Error('Prose executable missing config reference');
    }

    // Get parameter names if any
    const params = directive.values?.params || [];
    const paramNames = extractParamNames(params);

    const contentType = directive.values?.contentType as 'inline' | 'file' | 'template';

    if (contentType === 'inline') {
      // Inline prose: prose:@config { session "..." }
      const contentNodes = directive.values?.content;
      if (!contentNodes) {
        throw new Error('Inline prose executable missing content');
      }
      executableDef = {
        type: 'prose',
        configRef: configRefNodes,
        contentType: 'inline',
        contentTemplate: contentNodes,
        paramNames,
        sourceDirective: 'exec'
      } satisfies ProseExecutable;
    } else {
      // File-based prose: prose:@config "file.prose" or prose:@config template "file.prose.att"
      const pathNodes = directive.values?.path;
      if (!pathNodes || !Array.isArray(pathNodes) || pathNodes.length === 0) {
        throw new Error('File-based prose executable missing path');
      }
      executableDef = {
        type: 'prose',
        configRef: configRefNodes,
        contentType,
        pathTemplate: pathNodes,
        paramNames,
        sourceDirective: 'exec'
      } satisfies ProseExecutable;
    }

    if (process.env.DEBUG_EXEC) {
      logger.debug('Creating exe prose:', {
        identifier,
        paramNames,
        contentType,
        hasConfig: true
      });
    }

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
