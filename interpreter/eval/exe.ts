import type { BaseMlldNode, DirectiveNode, ExeBlockNode, TextNode } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import type { ExecutableDefinition, CommandExecutable, CommandRefExecutable, CodeExecutable, TemplateExecutable, SectionExecutable, ResolverExecutable, PipelineExecutable, ProseExecutable } from '@core/types/executable';
import { interpolate, evaluate } from '../core/interpreter';
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
import { resolveShadowEnvironment, mergeShadowFunctions } from './helpers/shadowEnvResolver';
import { isFileLoadedValue } from '@interpreter/utils/load-content-structured';
import { logger } from '@core/utils/logger';
import { AutoUnwrapManager } from './auto-unwrap-manager';
import { isAugmentedAssignment, isLetAssignment } from '@core/types/when';
import { evaluateAugmentedAssignment, evaluateLetAssignment } from './when';
import { VariableImporter } from './import/VariableImporter';
import * as path from 'path';
import {
  createCapabilityContext,
  makeSecurityDescriptor,
  type DataLabel,
  type CapabilityContext,
  type SecurityDescriptor
} from '@core/types/security';
import { asData, asText, isStructuredValue, extractSecurityDescriptor } from '../utils/structured-value';
import { InterpolationContext } from '../core/interpolation-context';
import { updateVarMxFromDescriptor } from '@core/types/variable/VarMxHelpers';
import { readFileWithPolicy } from '@interpreter/policy/filesystem-policy';
import { maybeAutosignVariable } from './auto-sign';

/**
 * Evaluate an exe block sequentially with local scope for let/+= assignments.
 */
export async function evaluateExeBlock(
  block: ExeBlockNode,
  env: Environment,
  args: Record<string, unknown> = {}
): Promise<EvalResult> {
  let blockEnv = env.createChild();

  if (args && Object.keys(args).length > 0) {
    const importer = new VariableImporter();
    for (const [param, value] of Object.entries(args)) {
      const variable = importer.createVariableFromValue(
        param,
        value,
        'exe-param',
        undefined,
        { env: blockEnv }
      );
      blockEnv.setVariable(param, variable);
    }
  }

  for (const stmt of block.values?.statements ?? []) {
    if (isLetAssignment(stmt)) {
      blockEnv = await evaluateLetAssignment(stmt, blockEnv);
    } else if (isAugmentedAssignment(stmt)) {
      blockEnv = await evaluateAugmentedAssignment(stmt, blockEnv);
    } else {
      const result = await evaluate(stmt, blockEnv);
      blockEnv = result.env || blockEnv;
    }
  }

  let returnValue: unknown = undefined;
  const returnNode = block.values?.return;
  const hasReturnValue = returnNode?.meta?.hasValue !== false;
  if (returnNode && hasReturnValue) {
    const returnNodes = Array.isArray(returnNode.values) ? returnNode.values : [];
    if (returnNodes.length > 0) {
      const returnResult = await evaluate(returnNodes, blockEnv, { isExpression: true });
      returnValue = returnResult.value;
      blockEnv = returnResult.env || blockEnv;
    }
  }

  env.mergeChild(blockEnv);
  return { value: returnValue, env };
}

async function interpolateAndRecord(
  nodes: any,
  env: Environment,
  context: InterpolationContext = InterpolationContext.Default
): Promise<string> {
  const descriptors: SecurityDescriptor[] = [];
  const text = await interpolate(nodes, env, context, {
    collectSecurityDescriptor: descriptor => {
      if (descriptor) {
        descriptors.push(descriptor);
      }
    }
  });
  if (descriptors.length > 0) {
    const merged =
      descriptors.length === 1 ? descriptors[0] : env.mergeSecurityDescriptors(...descriptors);
    env.recordSecurityDescriptor(merged);
  }
  return text;
}

async function resolveExeDescription(raw: unknown, env: Environment): Promise<string | undefined> {
  if (typeof raw === 'string') {
    return raw;
  }
  if (raw && typeof raw === 'object' && 'needsInterpolation' in raw && Array.isArray((raw as any).parts)) {
    return interpolate((raw as any).parts, env, InterpolationContext.Default);
  }
  return undefined;
}

function buildTemplateAstFromContent(content: string): any[] {
  const ast: any[] = [];
  const regex = /@([A-Za-z_][\w\.]*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      ast.push({ type: 'Text', content: content.slice(lastIndex, match.index) });
    }
    ast.push({ type: 'VariableReference', identifier: match[1] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    ast.push({ type: 'Text', content: content.slice(lastIndex) });
  }
  return ast;
}

/**
 * Extract parameter names from the params array.
 * 
 * TODO: Remove workaround when issue #50 is fixed.
 * The grammar currently returns VariableReference nodes for params,
 * but they should be simple strings or Parameter nodes.
 */
function extractParamNames(params: any[]): string[] {
  return params.map(p => {
    // Once fixed, this should just be: return p; (if params are strings)
    // or: return p.name; (if params are Parameter nodes)
    if (typeof p === 'string') {
      return p;
    } else if (p.type === 'VariableReference') {
      // Current workaround for grammar issue #50
      return p.identifier;
    } else if (p.type === 'Parameter') {
      // Future-proofing for when grammar is fixed
      return p.name;
    }
    return '';
  }).filter(Boolean);
}

function extractParamTypes(params: any[]): Record<string, string> {
  const paramTypes: Record<string, string> = {};
  for (const param of params) {
    if (param && typeof param === 'object' && param.type === 'Parameter') {
      const name = param.name;
      const type = param.paramType;
      if (typeof name === 'string' && typeof type === 'string' && type.length > 0) {
        paramTypes[name] = type;
      }
    }
  }
  return paramTypes;
}

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
    // Handle @exec js = { ... }
    const identifierNodes = directive.values?.identifier;
    if (!identifierNodes || !Array.isArray(identifierNodes) || identifierNodes.length === 0) {
      throw new Error('Exec environment directive missing language identifier');
    }
    
    const identifierNode = identifierNodes[0];
    let language: string;
    
    // With improved type consistency, identifierNodes is always VariableReferenceNode[]
    if (identifierNode.type === 'VariableReference' && 'identifier' in identifierNode) {
      language = identifierNode.identifier;
    } else {
      throw new Error('Exec environment language must be a simple string');
    }
    
    const envRefs = directive.values?.environment || [];
    
    // Collect functions to inject
    const shadowFunctions = new Map<string, any>();
    
    // First, set up the shadow environment so it's available for capture
    for (const ref of envRefs) {
      const funcName = ref.identifier;
      const funcVar = env.getVariable(funcName);
      
      if (!funcVar || funcVar.type !== 'executable') {
        throw new Error(`${funcName} is not a defined exec function`);
      }
      
      // Create wrapper function that calls the mlld exec
      const wrapper = createExecWrapper(funcName, funcVar, env);
      
      // For JavaScript shadow functions, create a synchronous wrapper when possible
      let effectiveWrapper = wrapper;
      if (language === 'js' || language === 'javascript') {
        // Only create sync wrapper for JavaScript code (not commands or other types)
        if (funcVar.value.type === 'code' &&
            (funcVar.value.language === 'javascript' || funcVar.value.language === 'js')) {
          // Get the executable definition from internal
          const execDef = (funcVar.internal as any)?.executableDef;
          if (execDef && execDef.type === 'code') {
            // NEW: Pass captured shadow envs through the definition
            (execDef as any).capturedShadowEnvs =
              (funcVar.internal as any)?.capturedShadowEnvs;
            effectiveWrapper = createSyncJsWrapper(funcName, execDef, env);
          }
        }
      }

      // Store the wrapper (sync for JS when possible, async otherwise)
      shadowFunctions.set(funcName, effectiveWrapper);
    }

    // Store in environment FIRST
    env.setShadowEnv(language, shadowFunctions);

    // For Python, also define functions in the PythonShadowEnvironment
    if (language === 'python' || language === 'py') {
      const pythonShadowEnv = env.getOrCreatePythonShadowEnv();
      for (const ref of envRefs) {
        const funcName = ref.identifier;
        const funcVar = env.getVariable(funcName);

        if (funcVar && funcVar.type === 'executable' && funcVar.value.type === 'code') {
          const execDef = (funcVar.internal as any)?.executableDef;
          if (execDef && (execDef.language === 'python' || execDef.language === 'py')) {
            // Extract the code from the template
            const codeTemplate = execDef.codeTemplate;
            if (codeTemplate && Array.isArray(codeTemplate)) {
              const code = codeTemplate.map((node: any) => {
                if (node.type === 'Text') return node.content;
                return '';
              }).join('');

              // Define the function in Python shadow environment
              const paramNames = execDef.paramNames || [];
              await pythonShadowEnv.addFunction(funcName, code, paramNames);
            }
          }
        }
      }
    }
    
    // NOW retroactively update all the executables in the shadow environment
    // to capture the complete shadow environment (including each other)
    if (env.hasShadowEnvs()) {
      const capturedEnvs = env.captureAllShadowEnvs();
      
      
      // Update each function variable's metadata to include the captured shadow envs
      for (const ref of envRefs) {
        const funcName = ref.identifier;
        const funcVar = env.getVariable(funcName);
        
        if (funcVar && funcVar.type === 'executable') {
          // Update internal metadata to include captured shadow environments
          funcVar.internal = {
            ...(funcVar.internal ?? {}),
            capturedShadowEnvs: capturedEnvs
          };
          // Also update the executableDef if it exists
          const execDef = (funcVar.internal as any)?.executableDef;
          if (execDef) {
            (execDef as any).capturedShadowEnvs = capturedEnvs;
          }
        }
      }
    }
    
    return {
      value: null,
      env
    };
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

        if (isIdentity || shouldTemplateFromRef) {
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
    const pathNodes = directive.values?.path;
    if (!pathNodes || !Array.isArray(pathNodes) || pathNodes.length === 0) {
      throw new Error('Exec template-file directive missing path');
    }
    // Evaluate path nodes to resolve any variable references
    const evaluatedPath = await interpolate(pathNodes, env);
    const filePath = String(evaluatedPath);
    
    // Determine template style by extension
    const ext = path.extname(filePath).toLowerCase();
    if (ext !== '.att' && ext !== '.mtt') {
      throw new Error(`Unsupported template file extension for ${filePath}. Use .att (@var) or .mtt ({{var}}).`);
    }
    
    // Read file content relative to current env and parse with template body rules
    const fileContent = await readFileWithPolicy(env, filePath, sourceLocation ?? undefined);
    const { parseSync } = await import('@grammar/parser');
    const startRule = ext === '.mtt' ? 'TemplateBodyMtt' : 'TemplateBodyAtt';
    let templateNodes: any[];
    try {
      templateNodes = parseSync(fileContent, { startRule });
    } catch (err: any) {
      // Fallback to legacy parsing when start rules are unavailable in the bundled parser
      try {
        let normalized = fileContent;
        if (ext === '.mtt') {
          // Preserve mustache-style placeholders for YAML and content; normalize simple {{var}} to @var
          normalized = normalized.replace(/{{\s*([A-Za-z_][\w\.]*)\s*}}/g, '@$1');
        }
        templateNodes = buildTemplateAstFromContent(normalized);
      } catch (fallbackErr: any) {
        throw new Error(`Failed to parse template file ${filePath}: ${err.message}`);
      }
    }
    
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

/**
 * Create a synchronous wrapper for JavaScript shadow functions
 * This allows simple JS expressions to be called without await
 */
function createSyncJsWrapper(
  funcName: string,
  definition: CodeExecutable,
  env: Environment
): Function {
  return function(...args: any[]) {
    // Get parameter names from the definition
    const params = definition.paramNames || [];
    
    // Create a child environment for parameter substitution
    const execEnv = env.createChild();
    
    // Build params object for code execution
    const codeParams: Record<string, any> = {};
    for (let i = 0; i < params.length; i++) {
      const paramName = params[i];
      let argValue = args[i];
      
      // Always add the parameter, even if undefined
      // This ensures JS code can reference all declared parameters
      if (argValue !== undefined) {
        // Auto-unwrap without async shelf (sync context)
        if (isStructuredValue(argValue)) {
          argValue = asData(argValue);
        } else if (isFileLoadedValue(argValue)) {
          // Handle LoadContentResult format
          argValue = argValue.content;
        }

        // Try to parse numeric values (same logic as async wrapper)
        if (typeof argValue === 'string') {
          const numValue = Number(argValue);
          if (!isNaN(numValue) && argValue.trim() !== '') {
            // If it's a valid number, use the numeric value
            argValue = numValue;
          }
        }
      }
      
      // Set the parameter value (will be undefined if not provided)
      codeParams[paramName] = argValue;
    }
    
    // Get the code template
    const codeTemplate = definition.codeTemplate;
    if (!codeTemplate) {
      throw new Error(`Function ${funcName} has no code template`);
    }
    
    // For synchronous execution, we need to evaluate the code directly
    // Since this is for 'js' (not 'node'), we can use the in-process execution
    let code: string;
    try {
      // Simple interpolation for Text nodes
      code = codeTemplate.map(node => {
        if (node.type === 'Text') {
          return node.content;
        }
        // For now, only support simple text templates
        throw new Error(`Synchronous shadow functions only support simple code templates`);
      }).join('');
    } catch (error) {
      throw new Error(`Cannot create synchronous wrapper for ${funcName}: ${error.message}`);
    }
    
    // OLD CODE TO REPLACE:
    // const shadowEnv = env.getShadowEnv('js') || env.getShadowEnv('javascript');
    
    // NEW CODE:
    // Resolve shadow environment with capture support
    const capturedEnvs = (definition as any).capturedShadowEnvs;
    const shadowEnv = resolveShadowEnvironment('js', capturedEnvs, env);
    
    // OLD CODE TO REPLACE:
    // const shadowFunctions: Record<string, any> = {};
    // const shadowNames: string[] = [];
    // const shadowValues: any[] = [];
    // 
    // if (shadowEnv) {
    //   for (const [name, func] of shadowEnv) {
    //     if (!codeParams[name]) { // Don't override parameters
    //       shadowFunctions[name] = func;
    //       shadowNames.push(name);
    //       shadowValues.push(func);
    //     }
    //   }
    // }
    
    // NEW CODE:
    // Merge shadow functions (avoiding parameter conflicts)
    const paramSet = new Set(Object.keys(codeParams));
    const { names: shadowNames, values: shadowValues } = 
      mergeShadowFunctions(shadowEnv, undefined, paramSet);
    
    // Rest of the function remains the same...
    const allParamNames = [...Object.keys(codeParams), ...shadowNames];
    const allParamValues = [...Object.values(codeParams), ...shadowValues];
    
    // Build function body
    let functionBody = code;
    const trimmedCode = code.trim();
    
    // Check if this is an expression that should be returned
    const isExpression = (
      (!code.includes('return') && !code.includes(';')) ||
      (trimmedCode.startsWith('(') && trimmedCode.endsWith(')'))
    );
    
    if (isExpression) {
      functionBody = `return (${functionBody})`;
    }
    
    // Create and execute the function with shadow functions in scope
    const fn = new Function(...allParamNames, functionBody);
    return fn(...allParamValues);
  };
}

/**
 * Create a wrapper function that bridges JS function calls to mlld exec invocations
 */
function createExecWrapper(
  execName: string, 
  execVar: ExecutableVariable,
  env: Environment
): Function {
  return async function(...args: any[]) {
    // Get the executable definition from internal
    const definition = (execVar.internal as any)?.executableDef;
    if (!definition) {
      throw new Error(`Executable ${execName} has no definition in metadata`);
    }
    
    // Get parameter names from the definition
    const params = definition.paramNames || [];
    
    // Create a child environment for parameter substitution
    const execEnv = env.createChild();
    
    // Bind arguments to parameters
    for (let i = 0; i < params.length; i++) {
      const paramName = params[i];
      const argValue = args[i];
      if (argValue !== undefined) {
        // For template interpolation, we need string representation
        const stringValue =
          typeof argValue === 'string'
            ? argValue
            : argValue === null || argValue === undefined
              ? String(argValue)
              : typeof argValue === 'object'
                ? (isStructuredValue(argValue) ? asText(argValue) : JSON.stringify(argValue))
                : String(argValue);
        
        const paramVar = createSimpleTextVariable(
          paramName,
          stringValue,
          {
            directive: 'var',
            syntax: 'quoted',
            hasInterpolation: false,
            isMultiLine: false
          },
          {
            internal: {
              isSystem: true,
              isParameter: true
            }
          }
        );
        execEnv.setParameterVariable(paramName, paramVar);
      }
    }
    
    let result: string;
    
    if (definition.type === 'command') {
      // Execute command with interpolated template
      const commandTemplate = definition.commandTemplate;
      if (!commandTemplate) {
        throw new Error(`Command ${execName} has no command template`);
      }
      
      // Interpolate the command template with parameters
      const command = await interpolateAndRecord(
        commandTemplate,
        execEnv,
        InterpolationContext.ShellCommand
      );
      
      // Build environment variables from parameters for shell execution
      const envVars: Record<string, string> = {};
      for (let i = 0; i < params.length; i++) {
        const paramName = params[i];
        const argValue = args[i];
        if (argValue !== undefined) {
          envVars[paramName] = String(argValue);
        }
      }
      
      // Execute the command with environment variables
      result = await execEnv.executeCommand(command, { env: envVars });
    } else if (definition.type === 'code') {
      // Execute code with interpolated template
      const codeTemplate = definition.codeTemplate;
      if (!codeTemplate) {
        throw new Error(`Code command ${execName} has no code template`);
      }
      
      // Interpolate the code template with parameters
      const code = await interpolateAndRecord(codeTemplate, execEnv);
      
      // Build params object for code execution
      const codeParams: Record<string, any> = {};
      for (let i = 0; i < params.length; i++) {
        const paramName = params[i];
        let argValue = args[i];
        
        // Always add the parameter, even if undefined
        // This ensures Node.js code can reference all declared parameters
        if (argValue !== undefined) {
          // Ensure we await any promises in arguments
          argValue = argValue instanceof Promise ? await argValue : argValue;
          
          // Auto-unwrap LoadContentResult objects
          argValue = AutoUnwrapManager.unwrap(argValue);
          
          // Try to parse numeric values
          if (typeof argValue === 'string') {
            const numValue = Number(argValue);
            if (!isNaN(numValue) && argValue.trim() !== '') {
              // If it's a valid number, use the numeric value
              argValue = numValue;
            }
          }
        }
        
        // Set the parameter value (will be undefined if not provided)
        codeParams[paramName] = argValue;
      }
      
      // NEW CODE: Pass captured shadow environments to executors
      // Get captured shadow environments from executable internal
      const capturedEnvs = (execVar.internal as any)?.capturedShadowEnvs;
      
      
      // For JS/Node execution, pass captured envs through params
      // Using __ prefix following mlld's internal property pattern
      if (capturedEnvs && (definition.language === 'js' || definition.language === 'javascript' || 
                           definition.language === 'node' || definition.language === 'nodejs')) {
        (codeParams as any).__capturedShadowEnvs = capturedEnvs;
      }
      
      // Debug logging
      // Note: Don't use console.log in exec functions as it's captured
      // if (process.env.MLLD_DEBUG) {
      //   console.log(`Executing ${execName} with:`, { code, params: codeParams });
      // }
      
      // Execute the code with parameters
      result = await execEnv.executeCode(
        code,
        definition.language || 'javascript',
        codeParams
      );
    } else if (definition.type === 'template') {
      // Execute template with interpolated content
      const templateNodes = definition.template;
      if (!templateNodes) {
        throw new Error(`Template ${execName} has no template content`);
      }
      
      // Interpolate the template with parameters
      result = await interpolateAndRecord(templateNodes, execEnv);
    } else if (definition.type === 'data') {
      const { evaluateDataValue } = await import('./data-value-evaluator');
      const dataValue = await evaluateDataValue(definition.dataTemplate as any, execEnv);
      try {
        return JSON.parse(JSON.stringify(dataValue));
      } catch {
        return dataValue;
      }
    } else if (definition.type === 'section') {
      // Extract section from file
      throw new Error(`Section executables cannot be invoked from shadow environments yet`);
    } else if (definition.type === 'resolver') {
      // Invoke resolver
      throw new Error(`Resolver executables cannot be invoked from shadow environments yet`);
    } else if (definition.type === 'commandRef') {
      // Handle command references
      throw new Error(`Command reference executables cannot be invoked from shadow environments yet`);
    } else {
      throw new Error(`Unknown command type: ${definition.type}`);
    }
    
    // Try to parse result as JSON for better JS integration
    try {
      return JSON.parse(result);
    } catch {
      return result; // Return as string if not JSON
    }
  };
}
