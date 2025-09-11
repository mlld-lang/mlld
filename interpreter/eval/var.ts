import type { DirectiveNode, VarValue, VariableNodeArray } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import { interpolate } from '../core/interpreter';
import { InterpolationContext } from '../core/interpolation-context';
import { astLocationToSourceLocation } from '@core/types';
import { logger } from '@core/utils/logger';
import { applyHeaderTransform } from './show';
import { 
  Variable,
  VariableSource,
  createSimpleTextVariable,
  createInterpolatedTextVariable,
  createTemplateVariable,
  createArrayVariable,
  createObjectVariable,
  createFileContentVariable,
  createSectionContentVariable,
  createComputedVariable,
  createCommandResultVariable
} from '@core/types/variable';

/**
 * Create VariableSource metadata based on the value node type
 */
function createVariableSource(valueNode: VarValue | undefined, directive: DirectiveNode): VariableSource {
  const baseSource: VariableSource = {
    directive: 'var',
    syntax: 'quoted', // default
    hasInterpolation: false,
    isMultiLine: false
  };

  // Handle primitive values (numbers, booleans, null)
  if (typeof valueNode === 'number' || typeof valueNode === 'boolean' || valueNode === null) {
    // For primitives, use the directive metadata to determine syntax
    if (directive.meta?.primitiveType) {
      baseSource.syntax = 'quoted'; // Primitives are treated like quoted values
    }
    return baseSource;
  }
  
  // Determine syntax type based on AST node
  if (valueNode.type === 'array') {
    baseSource.syntax = 'array';
    baseSource.wrapperType = 'brackets';
  } else if (valueNode.type === 'object') {
    baseSource.syntax = 'object';
    baseSource.wrapperType = 'brackets';
  } else if (valueNode.type === 'command') {
    baseSource.syntax = 'command';
    baseSource.wrapperType = 'brackets';
  } else if (valueNode.type === 'code') {
    baseSource.syntax = 'code';
    baseSource.wrapperType = 'brackets';
  } else if (valueNode.type === 'path') {
    baseSource.syntax = 'path';
    baseSource.wrapperType = 'brackets';
  } else if (valueNode.type === 'section') {
    baseSource.syntax = 'path'; // sections are path-based
    baseSource.wrapperType = 'brackets';
  } else if (valueNode.type === 'VariableReference') {
    baseSource.syntax = 'reference';
  } else if (directive.meta?.wrapperType) {
    // Use wrapper type from directive metadata
    baseSource.wrapperType = directive.meta.wrapperType;
    if (directive.meta.wrapperType === 'singleQuote') {
      baseSource.syntax = 'quoted';
      baseSource.hasInterpolation = false;
    } else if (directive.meta.wrapperType === 'doubleQuote' || directive.meta.wrapperType === 'backtick' || directive.meta.wrapperType === 'doubleColon') {
      baseSource.syntax = 'template';
      baseSource.hasInterpolation = true; // Assume interpolation for these types
    } else if (directive.meta.wrapperType === 'tripleColon') {
      baseSource.syntax = 'template';
      baseSource.hasInterpolation = true; // Triple colon uses {{var}} interpolation
    }
  }

  // Multi-line content is determined during evaluation, not from raw AST
  // The isMultiLine property will be set based on the evaluated content

  return baseSource;
}

/**
 * Evaluate @var directives.
 * This is the unified variable assignment directive that replaces @text and @data.
 * Type is inferred from the RHS syntax.
 */
export async function evaluateVar(
  directive: DirectiveNode,
  env: Environment
): Promise<EvalResult> {
  // Extract identifier from array
  const identifierNodes = directive.values?.identifier as VariableNodeArray | undefined;
  if (!identifierNodes || !Array.isArray(identifierNodes) || identifierNodes.length === 0) {
    throw new Error('Var directive missing identifier');
  }
  
  const identifierNode = identifierNodes[0];
  if (!identifierNode || typeof identifierNode !== 'object' || !('identifier' in identifierNode)) {
    throw new Error('Invalid identifier node structure');
  }
  const identifier = identifierNode.identifier;
  if (!identifier || typeof identifier !== 'string') {
    throw new Error('Var directive identifier must be a simple variable name');
  }

  // Get the value node - this contains type information from the parser
  const valueNodes = directive.values?.value;
  
  // Debug: Log the value structure
  if (process.env.MLLD_DEBUG === 'true') {
    console.log(`\n=== Processing @${identifier} ===`);
    if (Array.isArray(valueNodes) && valueNodes.length > 0) {
      console.log('  Value node type:', valueNodes[0].type);
      console.log('  Has directive.values.withClause?', !!directive.values?.withClause);
      console.log('  Has directive.meta.withClause?', !!directive.meta?.withClause);
      if (directive.values?.withClause || directive.meta?.withClause) {
        const wc = directive.values?.withClause || directive.meta?.withClause;
        console.log('  Pipeline:', wc.pipeline?.map((p: any) => p.rawIdentifier).join(' | '));
      }
    }
  }
  if (!valueNodes || !Array.isArray(valueNodes) || valueNodes.length === 0) {
    throw new Error('Var directive missing value');
  }
  
  // For templates with multiple nodes (e.g., ::text {{var}}::), we need the whole array
  const valueNode = valueNodes.length === 1 ? valueNodes[0] : valueNodes;

  if (process.env.MLLD_DEBUG === 'true') {
    console.error('[var.ts] Extracted valueNode:', {
      identifier,
      type: valueNode?.type,
      isArray: Array.isArray(valueNode),
      hasWithClause: !!(valueNode?.withClause),
      hasPipeline: !!(valueNode?.withClause?.pipeline)
    });
  }

  // Type-based routing based on the AST structure
  let resolvedValue: any;
  const templateAst: any = null; // Store AST for templates that need lazy interpolation
  
  // Check for primitive values first (numbers, booleans, null)
  if (typeof valueNode === 'number' || typeof valueNode === 'boolean' || valueNode === null) {
    // Direct primitive values from the grammar
    resolvedValue = valueNode;
    
  } else if (valueNode.type === 'Literal') {
    // Handle literal nodes (booleans, numbers, strings)
    resolvedValue = valueNode.value;
    
  } else if (valueNode.type === 'array') {
    // Array literal: [1, 2, 3] or [,]
    
    // Check if this array has complex items that need lazy evaluation
    const isComplex = hasComplexArrayItems(valueNode.items || valueNode.elements || []);
    
    if (isComplex) {
      // For complex arrays, store the AST node for lazy evaluation
      if (process.env.MLLD_DEBUG === 'true') {
        logger.debug('var.ts: Storing complex array AST for lazy evaluation:', {
          identifier,
          valueNode
        });
      }
      resolvedValue = valueNode;
    } else {
      // Process simple array items immediately
      const processedItems = [];
      for (const item of (valueNode.items || [])) {
        if (item && typeof item === 'object') {
          if ('content' in item && Array.isArray(item.content)) {
            // This is wrapped content (like from a string literal)
            const interpolated = await interpolate(item.content, env);
            processedItems.push(interpolated);
          } else if (item.type === 'Text' && 'content' in item) {
            // Direct text content
            processedItems.push(item.content);
          } else if (typeof item === 'object' && item.type) {
            // Other node types - evaluate them
            const evaluated = await evaluateArrayItem(item, env);
            processedItems.push(evaluated);
          } else {
            // Primitive values
            processedItems.push(item);
          }
        } else {
          // Direct primitive value
          processedItems.push(item);
        }
      }
      resolvedValue = processedItems;
    }
    
  } else if (valueNode.type === 'object') {
    // Object literal: { "key": "value" }
    
    // Check if this object has complex values that need lazy evaluation
    const isComplex = hasComplexValues(valueNode.properties);
    
    if (isComplex) {
      // For complex objects, store the AST node for lazy evaluation
      resolvedValue = valueNode;
    } else {
      // Process simple object properties immediately
      const processedObject: Record<string, any> = {};
      if (valueNode.properties) {
        // Debug logging for Phase 2
        if (identifier === 'complex') {
          logger.debug('Processing object properties for @complex:', {
            propertyKeys: Object.keys(valueNode.properties),
            users: valueNode.properties.users
          });
        }
        
        for (const [key, propValue] of Object.entries(valueNode.properties)) {
          // Each property value might need interpolation
          if (propValue && typeof propValue === 'object' && 'content' in propValue && Array.isArray(propValue.content)) {
            // Handle wrapped string content (quotes, backticks, etc.)
            processedObject[key] = await interpolate(propValue.content as any, env);
          } else if (propValue && typeof propValue === 'object' && propValue.type === 'array') {
            // Handle array values in objects
            const processedArray = [];
            
            // Debug logging for Phase 2
            if (identifier === 'complex' && key === 'users') {
              logger.debug('Processing users array items:', {
                itemCount: (propValue.items || []).length,
                firstItem: propValue.items?.[0]
              });
            }
            
            for (const item of (propValue.items || [])) {
              const evaluated = await evaluateArrayItem(item, env);
              processedArray.push(evaluated);
            }
            processedObject[key] = processedArray;
          } else if (propValue && typeof propValue === 'object' && propValue.type === 'object') {
            // Handle nested objects recursively
            const nestedObj: Record<string, any> = {};
            if (propValue.properties) {
              for (const [nestedKey, nestedValue] of Object.entries(propValue.properties)) {
                nestedObj[nestedKey] = await evaluateArrayItem(nestedValue, env);
              }
            }
            processedObject[key] = nestedObj;
          } else if (propValue && typeof propValue === 'object' && propValue.type) {
            // Handle other node types (load-content, VariableReference, etc.)
            processedObject[key] = await evaluateArrayItem(propValue, env);
          } else {
            // For primitive types (numbers, booleans, null, strings), use as-is
            processedObject[key] = propValue;
          }
        }
      }
      resolvedValue = processedObject;
    }
    
  } else if (valueNode.type === 'section') {
    // Section extraction: [file.md # Section]
    const filePath = await interpolate(valueNode.path, env);
    const sectionName = await interpolate(valueNode.section, env);
    
    // Read file and extract section
    const fileContent = await env.readFile(filePath);
    const { llmxmlInstance } = await import('../utils/llmxml-instance');
    
    try {
      resolvedValue = await llmxmlInstance.getSection(fileContent, sectionName, {
        includeNested: true,
        includeTitle: true
      });
    } catch (error) {
      // Fallback to basic extraction
      resolvedValue = extractSection(fileContent, sectionName);
    }
    
    // Check if we have an asSection modifier in the withClause
    if (directive.values?.withClause?.asSection) {
      const newHeader = await interpolate(directive.values.withClause.asSection, env);
      resolvedValue = applyHeaderTransform(resolvedValue, newHeader);
    }
    
  } else if (valueNode.type === 'load-content') {
    // Content loader: <file.md> or <file.md # Section>
    const { processContentLoader } = await import('./content-loader');
    
    // Pass the withClause to the content loader if it has asSection
    if (directive.values?.withClause?.asSection) {
      // Add the asSection to the load-content options
      if (!valueNode.options) {
        valueNode.options = {};
      }
      if (!valueNode.options.section) {
        valueNode.options.section = {};
      }
      valueNode.options.section.renamed = {
        type: 'rename-template',
        parts: directive.values.withClause.asSection
      };
    }
    
    resolvedValue = await processContentLoader(valueNode, env);
    
  } else if (valueNode.type === 'path') {
    // Path dereference: [README.md]
    const filePath = await interpolate(valueNode.segments, env);
    resolvedValue = await env.readFile(filePath);
    
  } else if (valueNode.type === 'code') {
    // Code execution: run js { ... } or js { ... }
    const { evaluateCodeExecution } = await import('./code-execution');
    const result = await evaluateCodeExecution(valueNode, env);
    resolvedValue = result.value;
    
    // Infer variable type from result
    
  } else if (valueNode.type === 'command') {
    // Shell command: run { echo "hello" }
    
    // Check if we have parsed command nodes (new) or raw string (legacy)
    if (Array.isArray(valueNode.command)) {
      // New: command is an array of AST nodes that need interpolation
      const interpolatedCommand = await interpolate(valueNode.command, env, InterpolationContext.ShellCommand);
      resolvedValue = await env.executeCommand(interpolatedCommand);
    } else {
      // Legacy: command is a raw string (for backward compatibility)
      resolvedValue = await env.executeCommand(valueNode.command);
    }
    
    // Apply automatic JSON parsing for shell command output
    const { processCommandOutput } = await import('@interpreter/utils/json-auto-parser');
    resolvedValue = processCommandOutput(resolvedValue);
    
  } else if (valueNode.type === 'VariableReference') {
    // Variable reference: @otherVar
    if (process.env.MLLD_DEBUG === 'true') {
      console.log('Processing VariableReference in var.ts:', {
        identifier,
        varIdentifier: valueNode.identifier,
        hasFields: !!(valueNode.fields && valueNode.fields.length > 0),
        fields: valueNode.fields?.map(f => f.value)
      });
    }
    
    const sourceVar = env.getVariable(valueNode.identifier);
    if (!sourceVar) {
      throw new Error(`Variable not found: ${valueNode.identifier}`);
    }
    
    // Copy the variable type from source - preserve Variables!
    const { resolveVariable, ResolutionContext } = await import('@interpreter/utils/variable-resolution');
    const { accessField } = await import('../utils/field-access');
    
    /**
     * Preserve Variable wrapper when copying variable references
     * WHY: Variable copies need to maintain metadata and type information
     *      for proper Variable flow through the system
     */
    const resolvedVar = await resolveVariable(sourceVar, env, ResolutionContext.VariableCopy);
    
    // Handle field access if present
    if (valueNode.fields && valueNode.fields.length > 0) {
      // resolvedVar is already properly resolved with ResolutionContext.VariableCopy
      // No need to extract again - field access will handle extraction if needed
      
      // Use enhanced field access to preserve context
      const fieldResult = await accessField(resolvedVar, valueNode.fields[0], { 
        preserveContext: true,
        env 
      });
      let currentResult = fieldResult as any;
      
      // Apply remaining fields if any
      for (let i = 1; i < valueNode.fields.length; i++) {
        currentResult = await accessField(currentResult.value, valueNode.fields[i], { 
          preserveContext: true, 
          parentPath: currentResult.accessPath,
          env 
        });
      }
      
      resolvedValue = currentResult.value;
      
      // Check if the accessed field is an executable variable
      if (resolvedValue && typeof resolvedValue === 'object' && 
          resolvedValue.type === 'executable') {
        // Preserve the executable variable
        env.setVariable(identifier, resolvedValue);
        return {
          value: resolvedValue,
          env,
          stdout: '',
          stderr: '',
          exitCode: 0
        };
      }
      
      // IMPORTANT: When we have field access, the resolvedValue is the field value
      // We should NOT fall through to the duplicate VariableReference handling below
    } else {
      // No field access - use the resolved Variable directly
      resolvedValue = resolvedVar;
    }
    
    // Apply condensed pipes if present (e.g., @var|@transform)
    if (valueNode.pipes && valueNode.pipes.length > 0) {
      // Use unified pipeline processor for condensed pipes
      const { processPipeline } = await import('./pipeline/unified-processor');
      
      // Process through unified pipeline (handles condensed pipe conversion)
      const result = await processPipeline({
        value: resolvedValue,
        env,
        node: valueNode,
        identifier,
        location: directive.location
      });
      
      resolvedValue = result;
    }
    
  } else if (Array.isArray(valueNode)) {
    // For backtick templates, we should extract the text content directly
    // Check if this is a simple text array (backtick template)
    if (valueNode.length === 1 && valueNode[0].type === 'Text' && directive.meta?.wrapperType === 'backtick') {
        resolvedValue = valueNode[0].content;
    } else if (directive.meta?.wrapperType === 'doubleColon' || directive.meta?.wrapperType === 'tripleColon') {
      // For double/triple colon templates, handle interpolation based on type
      if (directive.meta?.wrapperType === 'tripleColon') {
        // Triple colon uses {{var}} interpolation - store AST for lazy evaluation
        resolvedValue = valueNode; // Store the AST array as the value
        logger.debug('Storing template AST for triple-colon template', {
          identifier,
          ast: valueNode
        });
      } else {
        // Double colon uses @var interpolation - interpolate now
        resolvedValue = await interpolate(valueNode, env);
      }
    } else {
      // Template or string content - need to interpolate
        resolvedValue = await interpolate(valueNode, env);
    }
    
  } else if (valueNode.type === 'Text' && 'content' in valueNode) {
    // Simple text content
    resolvedValue = valueNode.content;
    
  } else if (valueNode && valueNode.type === 'foreach') {
    // Handle foreach expressions
    const { evaluateForeachCommand } = await import('./foreach');
    resolvedValue = await evaluateForeachCommand(valueNode, env);
    
  } else if (valueNode && valueNode.type === 'ExecInvocation') {
    // Handle exec function invocations: @getConfig(), @transform(@data)
    if (process.env.MLLD_DEBUG === 'true') {
      console.error('[var.ts] Processing ExecInvocation:', {
        hasWithClause: !!valueNode.withClause,
        hasPipeline: !!(valueNode.withClause?.pipeline)
      });
    }
    const { evaluateExecInvocation } = await import('./exec-invocation');
    const result = await evaluateExecInvocation(valueNode, env);
    resolvedValue = result.value;
    
    // Infer variable type from result
    
  } else if (valueNode && valueNode.type === 'VariableReferenceWithTail') {
    // Variable with tail modifiers (e.g., @var @result = @data with { pipeline: [@transform] })
    if (process.env.MLLD_DEBUG === 'true') {
      console.log('Processing VariableReferenceWithTail in var.ts');
    }
    const varWithTail = valueNode;
    const sourceVar = env.getVariable(varWithTail.variable.identifier);
    if (!sourceVar) {
      throw new Error(`Variable not found: ${varWithTail.variable.identifier}`);
    }
    
    // Get the base value - preserve Variable for field access
    const { resolveVariable, ResolutionContext } = await import('@interpreter/utils/variable-resolution');
    const { accessFields } = await import('../utils/field-access');
    
    // Determine appropriate context based on what operations will be performed
    const needsPipelineExtraction = varWithTail.withClause && varWithTail.withClause.pipeline;
    const hasFieldAccess = varWithTail.variable.fields && varWithTail.variable.fields.length > 0;
    
    // Use appropriate resolution context
    const context = needsPipelineExtraction && !hasFieldAccess 
      ? ResolutionContext.PipelineInput 
      : ResolutionContext.FieldAccess;
    
    const resolvedVar = await resolveVariable(sourceVar, env, context);
    let result = resolvedVar;
    
    // Apply field access if present
    if (varWithTail.variable.fields && varWithTail.variable.fields.length > 0) {
      // Use enhanced field access to track context
      const fieldResult = await accessFields(resolvedVar, varWithTail.variable.fields, { 
        preserveContext: true,
        env 
      });
      result = (fieldResult as any).value;
    }
    
    // Apply pipeline if present
    if (varWithTail.withClause && varWithTail.withClause.pipeline) {
      const { processPipeline } = await import('./pipeline/unified-processor');
      
      // Process through unified pipeline
      result = await processPipeline({
        value: result,
        env,
        node: varWithTail,
        identifier: varWithTail.identifier,
        location: directive.location
      });
    }
    
    resolvedValue = result;
    
  } else if (valueNode && (valueNode.type === 'BinaryExpression' || valueNode.type === 'TernaryExpression' || valueNode.type === 'UnaryExpression')) {
    // Handle expression nodes
    const { evaluateUnifiedExpression } = await import('./expressions');
    const result = await evaluateUnifiedExpression(valueNode, env);
    resolvedValue = result;
    
  } else if (valueNode && valueNode.type === 'ForExpression') {
    // Handle for expressions: for @item in @collection => expression
    
    // Import and evaluate the for expression
    const { evaluateForExpression } = await import('./for');
    const forResult = await evaluateForExpression(valueNode, env);
    
    // The result is already an ArrayVariable
    env.setVariable(identifier, forResult);
    return { value: forResult, env };
    
  } else {
    // Default case - try to interpolate as text
    if (process.env.MLLD_DEBUG === 'true') {
      logger.debug('var.ts: Default case for valueNode:', { valueNode });
    }
    resolvedValue = await interpolate([valueNode], env);
  }

  // Create and store the appropriate variable type
  const location = astLocationToSourceLocation(directive.location, env.getCurrentFilePath());
  const source = createVariableSource(valueNode, directive);
  const metadata: any = { definedAt: location };
  
  // Mark if value came from a function for pipeline retryability
  if (valueNode && (
    valueNode.type === 'ExecInvocation' || 
    valueNode.type === 'command' || 
    valueNode.type === 'code'
  )) {
    metadata.isRetryable = true;
    metadata.sourceFunction = valueNode; // Store the AST node for re-execution
  }

  let variable: Variable;

  if (process.env.MLLD_DEBUG === 'true') {
    console.log('Creating variable:', {
      identifier,
      valueNodeType: valueNode?.type,
      resolvedValue,
      resolvedValueType: typeof resolvedValue
    });
  }

  // Check if resolvedValue is already a Variable that we should preserve
  const { isVariable } = await import('../utils/variable-resolution');
  if (isVariable(resolvedValue)) {
    // Preserve the existing Variable (e.g., when copying an executable)
    // Update its name and metadata to reflect the new assignment
    if (process.env.MLLD_DEBUG === 'true') {
      console.log('Preserving existing Variable:', {
        identifier,
        resolvedValueType: resolvedValue.type,
        resolvedValueName: resolvedValue.name
      });
    }
    variable = {
      ...resolvedValue,
      name: identifier,
      metadata: {
        ...resolvedValue.metadata,
        ...metadata
      }
    };
  } else if (typeof valueNode === 'number' || typeof valueNode === 'boolean' || valueNode === null) {
    // Direct primitive values - we need to preserve their types
    const { createPrimitiveVariable } = await import('@core/types/variable');
    variable = createPrimitiveVariable(
      identifier,
      valueNode, // Use the actual primitive value
      source,
      metadata
    );
    
  } else if (valueNode.type === 'array') {
    const isComplex = hasComplexArrayItems(valueNode.items || valueNode.elements || []);
    
    // Debug logging
    if (process.env.MLLD_DEBUG === 'true') {
      logger.debug('var.ts: Creating array variable:', {
        identifier,
        isComplex,
        resolvedValueType: typeof resolvedValue,
        resolvedValueIsArray: Array.isArray(resolvedValue),
        resolvedValue
      });
    }
    
    variable = createArrayVariable(identifier, resolvedValue, isComplex, source, metadata);
    
  } else if (valueNode.type === 'object') {
    const isComplex = hasComplexValues(valueNode.properties);
    variable = createObjectVariable(identifier, resolvedValue, isComplex, source, metadata);
    
  } else if (valueNode.type === 'command') {
    variable = createCommandResultVariable(identifier, resolvedValue, valueNode.command, source, 
      undefined, undefined, metadata);
    
  } else if (valueNode.type === 'code') {
    // Need to get source code from the value node
    const sourceCode = valueNode.code || ''; // TODO: Verify how to extract source code
    variable = createComputedVariable(identifier, resolvedValue, 
      valueNode.language || 'js', sourceCode, source, metadata);
    
  } else if (valueNode.type === 'path') {
    const filePath = await interpolate(valueNode.segments, env);
    variable = createFileContentVariable(identifier, resolvedValue, filePath, source, metadata);
    
  } else if (valueNode.type === 'section') {
    const filePath = await interpolate(valueNode.path, env);
    const sectionName = await interpolate(valueNode.section, env);
    variable = createSectionContentVariable(identifier, resolvedValue, filePath, 
      sectionName, 'hash', source, metadata);
    
  } else if (valueNode.type === 'VariableReference') {
    // For VariableReference nodes, create variable based on resolved value type
    // This handles cases like @user.name where resolvedValue is the field value
    if (typeof resolvedValue === 'string') {
      variable = createSimpleTextVariable(identifier, resolvedValue, source, metadata);
    } else if (typeof resolvedValue === 'number' || typeof resolvedValue === 'boolean' || resolvedValue === null) {
      const { createPrimitiveVariable } = await import('@core/types/variable');
      variable = createPrimitiveVariable(identifier, resolvedValue, source, metadata);
    } else if (Array.isArray(resolvedValue)) {
      variable = createArrayVariable(identifier, resolvedValue, false, source, metadata);
    } else if (typeof resolvedValue === 'object' && resolvedValue !== null) {
      variable = createObjectVariable(identifier, resolvedValue, false, source, metadata);
    } else {
      // Fallback to text
      variable = createSimpleTextVariable(identifier, String(resolvedValue), source, metadata);
    }
    
  } else if (valueNode.type === 'load-content') {
    // Handle load-content nodes from <file.md> syntax
    const { source: contentSource, options } = valueNode;
    
    // Import type guards for LoadContentResult
    const { isLoadContentResult, isLoadContentResultArray, isLoadContentResultURL } = await import('@core/types/load-content');
    
    if (isLoadContentResult(resolvedValue)) {
      // Single file with metadata - store as object variable
      // Mark as NOT complex so it doesn't get re-evaluated
      variable = createObjectVariable(identifier, resolvedValue, false, source, metadata);
    } else if (isLoadContentResultArray(resolvedValue)) {
      // Array of files from glob pattern - store as array variable
      // Check if this array has been tagged with __variable metadata
      const taggedVariable = (resolvedValue as any).__variable;
      if (taggedVariable && taggedVariable.metadata) {
        // Use the metadata from the tagged variable, which includes custom behaviors
        variable = createArrayVariable(identifier, resolvedValue, true, source, {
          ...metadata,
          ...taggedVariable.metadata
        });
        
        /**
         * Re-apply special behaviors to arrays with custom toString/content getters
         * WHY: LoadContentResultArray and RenamedContentArray have behaviors (toString, content getter)
         *      that must be preserved for proper output formatting in templates and display
         * GOTCHA: The behaviors are lost during Variable creation and must be re-applied
         * CONTEXT: This happens when arrays are created from content loading operations
         */
        const { extractVariableValue } = await import('../utils/variable-migration');
        const valueWithBehaviors = extractVariableValue(variable);
        variable.value = valueWithBehaviors;
      } else {
        variable = createArrayVariable(identifier, resolvedValue, true, source, metadata);
      }
    } else if (Array.isArray(resolvedValue) && resolvedValue.every(item => typeof item === 'string')) {
      // Array of strings from transformed content - store as simple array
      // Check if this array has been tagged with __variable metadata
      const taggedVariable = (resolvedValue as any).__variable;
      if (taggedVariable && taggedVariable.metadata) {
        // Use the metadata from the tagged variable, which includes custom behaviors
        variable = createArrayVariable(identifier, resolvedValue, false, source, {
          ...metadata,
          ...taggedVariable.metadata
        });
        
        /**
         * Re-apply special behaviors to string arrays from content operations
         * WHY: RenamedContentArray and similar types have custom toString() methods
         *      that enable proper concatenation behavior in templates
         * GOTCHA: Arrays tagged with __variable metadata require behavior restoration
         * CONTEXT: String arrays from glob patterns or renamed content operations
         */
        const { extractVariableValue } = await import('../utils/variable-migration');
        const valueWithBehaviors = extractVariableValue(variable);
        variable.value = valueWithBehaviors;
      } else {
        variable = createArrayVariable(identifier, resolvedValue, false, source, metadata);
      }
    } else if (typeof resolvedValue === 'string') {
      // Backward compatibility - plain string (e.g., from section extraction)
      if (contentSource.type === 'path') {
        const filePath = contentSource.raw || '';
        
        if (options?.section) {
          // Section extraction case
          const sectionName = options.section.identifier.content || '';
          variable = createSectionContentVariable(identifier, resolvedValue, filePath, 
            sectionName, 'hash', source, metadata);
        } else {
          // Whole file case
          variable = createFileContentVariable(identifier, resolvedValue, filePath, source, metadata);
        }
      } else if (contentSource.type === 'url') {
        // URL content
        const url = contentSource.raw || '';
        variable = createFileContentVariable(identifier, resolvedValue, url, source, metadata);
      } else {
        // Default to simple text
        variable = createSimpleTextVariable(identifier, String(resolvedValue), source, metadata);
      }
    } else {
      // Fallback - shouldn't happen
      variable = createSimpleTextVariable(identifier, String(resolvedValue), source, metadata);
    }
    
  } else if (valueNode.type === 'foreach') {
    // Foreach expressions always return arrays
    const isComplex = false; // foreach results are typically simple values
    variable = createArrayVariable(identifier, resolvedValue, isComplex, source, metadata);
    
  } else if (valueNode.type === 'ExecInvocation') {
    // Exec invocations can return any type
    if (typeof resolvedValue === 'object' && resolvedValue !== null) {
      if (Array.isArray(resolvedValue)) {
        variable = createArrayVariable(identifier, resolvedValue, false, source, metadata);
      } else {
        variable = createObjectVariable(identifier, resolvedValue, false, source, metadata);
      }
    } else {
      variable = createSimpleTextVariable(identifier, String(resolvedValue), source, metadata);
    }
    
  } else if (valueNode.type === 'VariableReferenceWithTail') {
    // Variable with tail modifiers - create based on resolved type
    if (typeof resolvedValue === 'object' && resolvedValue !== null) {
      if (Array.isArray(resolvedValue)) {
        variable = createArrayVariable(identifier, resolvedValue, false, source, metadata);
      } else {
        variable = createObjectVariable(identifier, resolvedValue, false, source, metadata);
      }
    } else {
      variable = createSimpleTextVariable(identifier, String(resolvedValue), source, metadata);
    }
    
  } else if (directive.meta?.expressionType) {
    // Expression results - create primitive variables for boolean/number results
    if (typeof resolvedValue === 'boolean' || typeof resolvedValue === 'number' || resolvedValue === null) {
      const { createPrimitiveVariable } = await import('@core/types/variable');
      variable = createPrimitiveVariable(identifier, resolvedValue, source, metadata);
    } else {
      // Expression returned non-primitive (e.g., string comparison)
      variable = createSimpleTextVariable(identifier, String(resolvedValue), source, metadata);
    }
    
  } else if (valueNode.type === 'Literal') {
    // Literal nodes - DON'T create variable yet, let it fall through to pipeline processing
    // The variable will be created after checking for pipelines
    
  } else {
    // Text variables - need to determine specific type
    const strValue = String(resolvedValue);
    
    if (directive.meta?.wrapperType === 'singleQuote') {
      variable = createSimpleTextVariable(identifier, strValue, source, metadata);
    } else if (directive.meta?.isTemplateContent || directive.meta?.wrapperType === 'backtick' || directive.meta?.wrapperType === 'doubleQuote' || directive.meta?.wrapperType === 'doubleColon' || directive.meta?.wrapperType === 'tripleColon') {
      // Template variable
      let templateType: 'backtick' | 'doubleColon' | 'tripleColon' = 'backtick';
      if (directive.meta?.wrapperType === 'doubleColon') {
        templateType = 'doubleColon';
      } else if (directive.meta?.wrapperType === 'tripleColon') {
        templateType = 'tripleColon';
      }
      
      // For triple-colon templates, the value is the AST array, not a string
      const templateValue = directive.meta?.wrapperType === 'tripleColon' && Array.isArray(resolvedValue) 
        ? resolvedValue as any // Pass the AST array
        : strValue; // For other templates, use the string value
      variable = createTemplateVariable(identifier, templateValue, undefined, templateType as any, source, metadata);
    } else if (directive.meta?.wrapperType === 'doubleQuote' || source.hasInterpolation) {
      // Interpolated text - need to track interpolation points
      // For now, create without interpolation points - TODO: extract these from AST
      variable = createInterpolatedTextVariable(identifier, strValue, [], source, metadata);
    } else {
      // Default to simple text
      variable = createSimpleTextVariable(identifier, strValue, source, metadata);
    }
  }

  // Use unified pipeline processor
  const { processPipeline } = await import('./pipeline/unified-processor');
  
  // Create variable if not already created (for Literal nodes)
  if (!variable) {
    if (valueNode && valueNode.type === 'Literal') {
      if (typeof resolvedValue === 'boolean' || typeof resolvedValue === 'number' || resolvedValue === null) {
        const { createPrimitiveVariable } = await import('@core/types/variable');
        variable = createPrimitiveVariable(identifier, resolvedValue, source, metadata);
      } else {
        variable = createSimpleTextVariable(identifier, String(resolvedValue), source, metadata);
      }
    } else {
      variable = createSimpleTextVariable(identifier, String(resolvedValue), source, metadata);
    }
  }
  
  // Skip pipeline processing if:
  // 1. This is an ExecInvocation with a withClause (already processed by evaluateExecInvocation)
  // 2. This is a VariableReference with pipes (already processed above around line 406)
  // 3. This is a load-content node with pipes (already processed by content-loader)
  let result = variable;
  const skipPipeline = (valueNode && valueNode.type === 'ExecInvocation' && valueNode.withClause) ||
                       (valueNode && valueNode.type === 'VariableReference' && valueNode.pipes) ||
                       (valueNode && valueNode.type === 'load-content' && valueNode.pipes);
  
  if (!skipPipeline) {
    if (process.env.MLLD_DEBUG === 'true') {
      console.error('[var.ts] Calling processPipeline:', {
        identifier,
        variableType: variable.type,
        hasMetadata: !!variable.metadata,
        isRetryable: variable.metadata?.isRetryable || false,
        hasSourceFunction: !!(variable.metadata?.sourceFunction),
        sourceNodeType: variable.metadata?.sourceFunction?.type
      });
    }
    // Process through unified pipeline (handles detection, validation, execution)
    result = await processPipeline({
      value: variable,
      env,
      node: valueNode,
      directive,
      identifier,
      location: directive.location,
      isRetryable: variable.metadata?.isRetryable || false
    });
  }
  
  // If pipeline was executed, result will be a string
  // Create new variable with the result
  if (typeof result === 'string' && result !== variable.value) {
    variable = createSimpleTextVariable(identifier, result, source, metadata);
  }
  
  env.setVariable(identifier, variable);
  
  // Debug logging for primitive values
  if (process.env.MLLD_DEBUG === 'true' && identifier === 'sum') {
    logger.debug('Setting variable @sum:', {
      identifier,
      resolvedValue,
      valueType: typeof resolvedValue,
      variableType: variable.type,
      variableValue: variable.value
    });
  }

  // Return empty string - var directives don't produce output
  return { value: '', env };
}

/**
 * Check if an object has complex values that need lazy evaluation
 */
function hasComplexValues(properties: any): boolean {
  if (!properties) return false;
  
  for (const value of Object.values(properties)) {
    if (value && typeof value === 'object') {
      if ('type' in value && (
        value.type === 'code' || 
        value.type === 'command' || 
        value.type === 'VariableReference' ||
        value.type === 'path' ||
        value.type === 'section' ||
        value.type === 'runExec' ||
        value.type === 'ExecInvocation' ||
        value.type === 'load-content'
      )) {
        return true;
      }
      // Check if it's a nested object with complex values
      if (value.type === 'object' && hasComplexValues(value.properties)) {
        return true;
      }
      // Check if it's an array with complex items
      if (value.type === 'array' && hasComplexArrayItems(value.items || value.elements || [])) {
        return true;
      }
      // Check plain objects (without type field) recursively
      if (!value.type && typeof value === 'object' && !Array.isArray(value)) {
        if (hasComplexValues(value)) {
          return true;
        }
      }
    }
  }
  
  return false;
}

/**
 * Check if array items contain complex values
 */
function hasComplexArrayItems(items: any[]): boolean {
  if (!items || !Array.isArray(items) || items.length === 0) return false;
  
  for (const item of items) {
    if (item && typeof item === 'object') {
      if ('type' in item && (
        item.type === 'code' || 
        item.type === 'command' || 
        item.type === 'VariableReference' ||
        item.type === 'array' ||
        item.type === 'object' ||
        item.type === 'path' ||
        item.type === 'section' ||
        item.type === 'load-content' ||
        item.type === 'ExecInvocation'
      )) {
        return true;
      }
      // Check nested arrays and objects
      if (Array.isArray(item) && hasComplexArrayItems(item)) {
        return true;
      }
      if (item.constructor === Object && hasComplexValues(item)) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Evaluate an array item based on its type
 * This function evaluates items that will be stored in arrays, preserving Variables
 * instead of extracting their values immediately.
 */
async function evaluateArrayItem(item: any, env: Environment): Promise<any> {
  if (!item || typeof item !== 'object') {
    return item;
  }

  // Debug logging for Phase 2
  if (process.env.MLLD_DEBUG === 'true' && item.type === 'object') {
    logger.debug('evaluateArrayItem processing object:', {
      hasProperties: !!item.properties,
      propertyKeys: item.properties ? Object.keys(item.properties) : [],
      sampleProperty: item.properties?.name
    });
  }

  // Handle wrapped content first (e.g., quoted strings in arrays)
  // This includes strings in objects: {"name": "alice"} where "alice" becomes
  // {content: [{type: 'Text', content: 'alice'}], wrapperType: 'doubleQuote'}
  if ('content' in item && Array.isArray(item.content) && 'wrapperType' in item) {
    return await interpolate(item.content, env);
  }

  // Also handle the case where we just have content array without wrapperType
  if ('content' in item && Array.isArray(item.content)) {
    return await interpolate(item.content, env);
  }
  
  // Handle raw Text nodes that may appear in objects
  if (item.type === 'Text' && 'content' in item) {
    return item.content;
  }

  // Handle objects without explicit type property (plain objects from parser)
  if (!item.type && typeof item === 'object' && item.constructor === Object) {
    const nestedObj: Record<string, any> = {};
    for (const [key, value] of Object.entries(item)) {
      // Skip internal properties
      if (key === 'wrapperType' || key === 'nodeId' || key === 'location') {
        continue;
      }
      nestedObj[key] = await evaluateArrayItem(value, env);
    }
    return nestedObj;
  }

  switch (item.type) {
    case 'array':
      // Nested array
      const nestedItems = [];
      for (const nestedItem of (item.items || [])) {
        nestedItems.push(await evaluateArrayItem(nestedItem, env));
      }
      return nestedItems;

    case 'object':
      // Object in array
      const processedObject: Record<string, any> = {};
      if (item.properties) {
        for (const [key, propValue] of Object.entries(item.properties)) {
          processedObject[key] = await evaluateArrayItem(propValue, env);
        }
      }
      return processedObject;

    case 'VariableReference':
      // Variable reference in array - PRESERVE THE VARIABLE!
      const variable = env.getVariable(item.identifier);
      if (!variable) {
        throw new Error(`Variable not found: ${item.identifier}`);
      }
      
      /**
       * Preserve Variable wrapper when storing in array elements
       * WHY: Array elements should maintain Variable metadata to enable proper
       *      Variable flow through data structures
       */
      const { resolveVariable, ResolutionContext } = await import('@interpreter/utils/variable-resolution');
      return await resolveVariable(variable, env, ResolutionContext.ArrayElement);

    case 'path':
      // Path node in array - read the file content
      const { interpolate: pathInterpolate } = await import('../core/interpreter');
      const filePath = await pathInterpolate(item.segments || [item], env);
      const fileContent = await env.readFile(filePath);
      return fileContent;

    case 'SectionExtraction':
      // Section extraction in array
      const sectionName = await interpolate(item.section, env);
      const sectionFilePath = await interpolate(item.path.segments || [item.path], env);
      const sectionFileContent = await env.readFile(sectionFilePath);
      
      // Use standard section extraction
      const { extractSection } = await import('./show');
      return extractSection(sectionFileContent, sectionName);

    case 'load-content':
      // Load content node in array - use the content loader
      const { processContentLoader } = await import('./content-loader');
      const loadResult = await processContentLoader(item, env);
      
      // Check if this is a LoadContentResult and return its content
      const { isLoadContentResult } = await import('@core/types/load-content');
      if (isLoadContentResult(loadResult)) {
        return loadResult.content;
      }
      
      return loadResult;

    default:
      // Handle plain objects without type property
      if (!item.type && typeof item === 'object' && item.constructor === Object) {
        // This is a plain object with properties that might have wrapped content
        const plainObj: Record<string, any> = {};
        for (const [key, value] of Object.entries(item)) {
          // Skip internal properties
          if (key === 'wrapperType' || key === 'nodeId' || key === 'location') {
            continue;
          }
          plainObj[key] = await evaluateArrayItem(value, env);
        }
        return plainObj;
      }
      
      // Try to interpolate as a node array
      return await interpolate([item], env);
  }
}

/**
 * Basic section extraction fallback
 */
function extractSection(content: string, sectionName: string): string {
  const lines = content.split('\n');
  const sectionRegex = new RegExp(`^#+\\s+${sectionName}\\s*$`, 'i');
  
  let inSection = false;
  let sectionLevel = 0;
  const sectionLines: string[] = [];
  
  for (const line of lines) {
    if (!inSection && sectionRegex.test(line)) {
      inSection = true;
      sectionLevel = line.match(/^#+/)?.[0].length || 0;
      sectionLines.push(line); // Include the header
      continue;
    }
    
    if (inSection) {
      const headerMatch = line.match(/^(#+)\\s+/);
      if (headerMatch && headerMatch[1].length <= sectionLevel) {
        break;
      }
      sectionLines.push(line);
    }
  }
  
  return sectionLines.join('\n').trim();
}