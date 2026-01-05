/**
 * Prose Execution Handler
 *
 * Handles execution of prose executables (prose:@config { ... }).
 * Prose blocks are executed by:
 * 1. Resolving the config reference for model settings
 * 2. Interpolating variables in the prose content
 * 3. Wrapping with skill injection prompt
 * 4. Executing via the model executor
 */

import type { Environment } from '../env/Environment';
import type { ProseExecutable } from '@core/types/executable';
import { interpolate } from '../core/interpreter';
import { InterpolationContext } from '../core/interpolation-context';
import { createSimpleTextVariable } from '@core/types/variable';
import { logger } from '@core/utils/logger';

/**
 * Default skill injection prompt for prose execution
 */
const PROSE_SKILL_INJECTION = `You have access to the OpenProse skill for processing structured prose documents.

When you receive a prose document (content between <PROSE> tags), you should:
1. Parse and interpret the OpenProse syntax
2. Execute the instructions within the prose
3. Return the result as specified by the prose document

If you cannot process the prose content (e.g., OpenProse is not available), respond with:
ERROR: SKILL_NOT_FOUND: prose

<PROSE>
`;

const PROSE_SKILL_INJECTION_END = `
</PROSE>

Process the above prose document and return the result.`;

/**
 * Execute a prose executable
 *
 * @param definition - The prose executable definition
 * @param args - Arguments passed to the executable
 * @param env - The execution environment
 * @returns The result of prose execution
 */
export async function executeProseExecutable(
  definition: ProseExecutable,
  args: Record<string, string>,
  env: Environment
): Promise<string> {
  if (process.env.DEBUG_EXEC) {
    logger.debug('Executing prose executable:', {
      contentType: definition.contentType,
      hasConfig: !!definition.configRef,
      paramNames: definition.paramNames
    });
  }

  // 1. Resolve the config reference
  const configRef = definition.configRef;
  if (!configRef || configRef.length === 0) {
    throw new Error('Prose executable missing config reference');
  }

  const configRefNode = configRef[0];
  let configVarName: string;
  if (configRefNode.type === 'VariableReference') {
    configVarName = (configRefNode as any).identifier;
  } else if (configRefNode.type === 'Text') {
    configVarName = (configRefNode as any).content;
  } else {
    throw new Error('Invalid config reference in prose executable');
  }

  const configVar = env.getVariable(configVarName);
  if (!configVar) {
    throw new Error(`Prose config not found: @${configVarName}`);
  }

  // Extract config values
  const config = extractProseConfig(configVar);

  // 2. Create parameter environment
  const proseEnv = env.createChild();
  for (const [key, value] of Object.entries(args)) {
    proseEnv.setParameterVariable(key, createSimpleTextVariable(key, value));
  }

  // 3. Get the prose content based on content type
  let proseContent: string;

  if (definition.contentType === 'inline') {
    // Inline prose: prose:@config { session "..." }
    if (!definition.contentTemplate) {
      throw new Error('Inline prose executable missing content');
    }
    proseContent = await interpolate(
      definition.contentTemplate,
      proseEnv,
      InterpolationContext.Default
    );
  } else if (definition.contentType === 'file') {
    // File-based prose: prose:@config "file.prose"
    if (!definition.pathTemplate) {
      throw new Error('File-based prose executable missing path');
    }
    const filePath = await interpolate(
      definition.pathTemplate,
      proseEnv,
      InterpolationContext.Default
    );
    proseContent = await env.readFile(filePath);
  } else if (definition.contentType === 'template') {
    // Template prose: prose:@config template "file.prose.att"
    if (!definition.pathTemplate) {
      throw new Error('Template prose executable missing path');
    }
    const filePath = await interpolate(
      definition.pathTemplate,
      proseEnv,
      InterpolationContext.Default
    );
    const templateContent = await env.readFile(filePath);

    // Parse template with ATT syntax (@ variable interpolation)
    proseContent = await interpolateProseTemplate(templateContent, proseEnv);
  } else {
    throw new Error(`Unknown prose content type: ${definition.contentType}`);
  }

  // 4. Construct the skill-injected prompt
  const skillPrompt = config.skillPrompt || PROSE_SKILL_INJECTION;
  const skillPromptEnd = config.skillPromptEnd || PROSE_SKILL_INJECTION_END;
  const fullPrompt = skillPrompt + proseContent + skillPromptEnd;

  if (process.env.DEBUG_EXEC) {
    logger.debug('Prose prompt constructed:', {
      contentLength: proseContent.length,
      fullPromptLength: fullPrompt.length,
      model: config.model
    });
  }

  // 5. Execute via model
  const result = await executeProseViaModel(fullPrompt, config, env);

  // 6. Check for skill-not-found error
  if (result.includes('ERROR: SKILL_NOT_FOUND: prose')) {
    throw new Error(
      'Prose execution failed: OpenProse skill not available. ' +
        'Ensure the model has access to the prose skill or install @mlld/prose module.'
    );
  }

  return result;
}

/**
 * Extract prose configuration from a config variable
 */
function extractProseConfig(configVar: any): ProseConfig {
  // Config can be an object with model, cwd, skillName, etc.
  const value = configVar.value;

  if (typeof value === 'object' && value !== null) {
    return {
      model: value.model || 'default',
      cwd: value.cwd,
      skillName: value.skillName || 'prose',
      skillPrompt: value.skillPrompt,
      skillPromptEnd: value.skillPromptEnd,
      maxTokens: value.maxTokens,
      temperature: value.temperature
    };
  }

  // If config is a string, treat it as model name
  if (typeof value === 'string') {
    return {
      model: value,
      skillName: 'prose'
    };
  }

  // Default config
  return {
    model: 'default',
    skillName: 'prose'
  };
}

interface ProseConfig {
  model: string;
  cwd?: string;
  skillName: string;
  skillPrompt?: string;
  skillPromptEnd?: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Interpolate a prose template file with ATT-style variables (@var)
 */
async function interpolateProseTemplate(
  templateContent: string,
  env: Environment
): Promise<string> {
  // Simple ATT interpolation - replace @varName with variable values
  const regex = /@([a-zA-Z_][\w.]*)/g;
  let result = templateContent;
  let match: RegExpExecArray | null;

  const seen = new Set<string>();
  while ((match = regex.exec(templateContent)) !== null) {
    const varPath = match[1];
    if (seen.has(varPath)) continue;
    seen.add(varPath);

    // Split by dots for nested access
    const parts = varPath.split('.');
    const varName = parts[0];
    const variable = env.getVariable(varName);

    if (variable) {
      let value = variable.value;
      // Navigate nested fields
      for (let i = 1; i < parts.length; i++) {
        if (value && typeof value === 'object') {
          value = (value as any)[parts[i]];
        } else {
          value = undefined;
          break;
        }
      }

      if (value !== undefined) {
        const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
        result = result.replace(new RegExp(`@${varPath.replace('.', '\\.')}`, 'g'), stringValue);
      }
    }
  }

  return result;
}

/**
 * Execute prose content via model
 *
 * For now, prose execution requires an external LLM provider.
 * Without one, we return a placeholder showing the prose was parsed successfully.
 */
async function executeProseViaModel(
  prompt: string,
  config: ProseConfig,
  env: Environment
): Promise<string> {
  // Check if the environment has an LLM executor registered
  // For now, this is a placeholder that shows the prose was parsed
  // In future versions, this will integrate with @mlld/claude or other LLM modules

  // Check for registered prose executor
  const proseExecutor = (env as any).getProseExecutor?.();
  if (proseExecutor) {
    return proseExecutor.execute(prompt, config);
  }

  // No LLM provider available - return debug output showing the prose was parsed
  logger.warn(
    'Prose execution skipped - no LLM provider configured. ' +
      'Install @mlld/claude or @mlld/prose module for actual execution.'
  );

  return `[PROSE PARSED - No LLM provider configured]
Model: ${config.model}
Skill: ${config.skillName}
Content length: ${prompt.length} chars`;
}
