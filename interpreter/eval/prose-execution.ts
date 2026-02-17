/**
 * Prose Execution Handler
 *
 * Handles execution of prose executables (prose:@config { ... }).
 * Prose blocks are executed by:
 * 1. Resolving the config reference for model settings
 * 2. Interpolating variables in the prose content
 * 3. Wrapping with skill injection prompt
 * 4. Executing via the model executor
 *
 * The skill name is configurable via config.skillName (default: "prose").
 * This allows users to use custom interpreters instead of OpenProse.
 */

import type { Environment } from '../env/Environment';
import type { ProseExecutable } from '@core/types/executable';
import { interpolate } from '../core/interpreter';
import { InterpolationContext } from '../core/interpolation-context';
import { createSimpleTextVariable, isExecutableVariable } from '@core/types/variable';
import type { Variable } from '@core/types/variable';
import { logger } from '@core/utils/logger';
import { MlldSecurityError } from '@core/errors';
import { evaluateExecInvocation } from './exec-invocation';
import type { ExecInvocation, CommandReference } from '@core/types';
import { readFileWithPolicy } from '@interpreter/policy/filesystem-policy';
import {
  maskPlainMlldTemplateFences,
  restorePlainMlldTemplateFenceText,
  restorePlainMlldTemplateFences
} from '@interpreter/eval/template-fence-literals';

/**
 * Build the skill injection prompt for a given skill name
 * Default skill is "prose" (OpenProse), but users can specify custom interpreters
 */
function buildSkillInjectionPrompt(skills: string[]): string {
  const runSkill = skills.find(s => s.includes('run')) || skills[0];

  return `Run /${runSkill} with this program:

`;
}

function buildSkillInjectionEnd(skills: string[]): string {
  return `

Return only the output. If the skill is unavailable, respond: ERROR: SKILLS_NOT_FOUND`;
}

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

  // Extract and validate config values
  const config = extractProseConfig(configVar, configVarName, env);

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
    // Also handles .prose.att and .prose.mtt with auto-detection
    if (!definition.pathTemplate) {
      throw new Error('File-based prose executable missing path');
    }
    const filePath = await interpolate(
      definition.pathTemplate,
      proseEnv,
      InterpolationContext.Default
    );

    let fileContent: string;
    try {
      fileContent = await readFileWithPolicy(env, filePath);
    } catch (err: any) {
      if (err instanceof MlldSecurityError) {
        throw err;
      }
      throw new Error(
        `Failed to read prose file "${filePath}": ${err.message || err}`
      );
    }

    // Check for template extensions (.prose.att or .prose.mtt)
    const lowerPath = filePath.toLowerCase();
    if (lowerPath.endsWith('.prose.att')) {
      // ATT-style template: @var interpolation
      proseContent = await parseAndInterpolateTemplate(fileContent, 'att', proseEnv);
    } else if (lowerPath.endsWith('.prose.mtt')) {
      // MTT-style template: {{var}} interpolation
      proseContent = await parseAndInterpolateTemplate(fileContent, 'mtt', proseEnv);
    } else {
      // Plain .prose file - still interpolate @vars for convenience
      proseContent = await interpolateProseTemplate(fileContent, proseEnv);
    }
  } else if (definition.contentType === 'template') {
    // Explicit template prose: prose:@config template "file.prose.att"
    if (!definition.pathTemplate) {
      throw new Error('Template prose executable missing path');
    }
    const filePath = await interpolate(
      definition.pathTemplate,
      proseEnv,
      InterpolationContext.Default
    );

    let fileContent: string;
    try {
      fileContent = await readFileWithPolicy(env, filePath);
    } catch (err: any) {
      if (err instanceof MlldSecurityError) {
        throw err;
      }
      throw new Error(
        `Failed to read prose template "${filePath}": ${err.message || err}`
      );
    }

    // Detect template style from extension
    const lowerPath = filePath.toLowerCase();
    const templateStyle = lowerPath.endsWith('.mtt') ? 'mtt' : 'att';
    proseContent = await parseAndInterpolateTemplate(fileContent, templateStyle, proseEnv);
  } else {
    throw new Error(`Unknown prose content type: ${definition.contentType}`);
  }

  // 4. Validate prose content is not empty
  if (!proseContent || proseContent.trim() === '') {
    const source = definition.contentType === 'inline' ? 'inline block' :
                   definition.contentType === 'file' ? 'file' : 'template';
    throw new Error(
      `Prose ${source} is empty. Prose content must contain at least one instruction.`
    );
  }

  // 5. Construct the skill-injected prompt
  // Use custom prompts if provided, otherwise build from skills list
  const skillPrompt = config.skillPrompt || buildSkillInjectionPrompt(config.skills);
  const skillPromptEnd = config.skillPromptEnd || buildSkillInjectionEnd(config.skills);
  const fullPrompt = skillPrompt + proseContent + skillPromptEnd;

  // 6. Execute via model executor
  const result = await invokeModelExecutor(fullPrompt, config, env);

  // 7. Check for skills-not-found error
  if (result.includes('ERROR: SKILLS_NOT_FOUND:')) {
    throw new Error(
      `Prose execution failed: OpenProse skills not available. ` +
        `Skills must be installed AND approved. Required skills: ${config.skills.join(', ')}`
    );
  }

  return result;
}

/**
 * Extract and validate prose configuration from a config variable
 * The model field must be an executable Variable (e.g., @opus from @mlld/claude)
 */
function extractProseConfig(configVar: any, configVarName: string, env: Environment): ProseConfig {
  const value = configVar.value;

  // Handle null/undefined
  if (value === null || value === undefined) {
    throw new Error(
      `Prose config @${configVarName} is ${value === null ? 'null' : 'undefined'}. ` +
      `Expected an object with { model: @executor, skillName?: string }.`
    );
  }

  // Handle object config
  if (typeof value === 'object' && !Array.isArray(value)) {
    // Validate model is present
    if (!value.model) {
      throw new Error(
        `Prose config @${configVarName} missing required 'model' field. ` +
        `Expected: { model: @opus } where @opus is an executable from @mlld/claude.`
      );
    }

    // Model should be a Variable (executable)
    let modelVar: Variable;
    let modelName: string;

    if (isExecutableVariable(value.model)) {
      // model is directly an executable Variable
      modelVar = value.model;
      modelName = modelVar.name || 'model';
    } else if (typeof value.model === 'string') {
      // model is a string reference to an executable (e.g., "opus")
      // Look it up in the environment
      const resolved = env.getVariable(value.model);
      if (!resolved) {
        throw new Error(
          `Prose config @${configVarName}.model references unknown variable @${value.model}. ` +
          `Import an executor like: import { @opus } from @mlld/claude`
        );
      }
      if (!isExecutableVariable(resolved)) {
        throw new Error(
          `Prose config @${configVarName}.model must be an executable, but @${value.model} is not. ` +
          `Use an executor like @opus from @mlld/claude.`
        );
      }
      modelVar = resolved;
      modelName = value.model;
    } else {
      throw new Error(
        `Prose config @${configVarName}.model must be an executable (like @opus from @mlld/claude), ` +
        `got ${typeof value.model}.`
      );
    }

    // Validate skills if provided
    if (value.skills !== undefined && !Array.isArray(value.skills)) {
      throw new Error(
        `Prose config @${configVarName}.skills must be an array, got ${typeof value.skills}.`
      );
    }

    // Default skills for OpenProse plugin
    const defaultSkills = [
      'open-prose:prose-boot',
      'open-prose:prose-compile',
      'open-prose:prose-run'
    ];

    return {
      model: modelVar,
      modelName,
      cwd: value.cwd,
      skills: value.skills || defaultSkills,
      skillPrompt: value.skillPrompt,
      skillPromptEnd: value.skillPromptEnd,
      maxTokens: value.maxTokens,
      temperature: value.temperature
    };
  }

  // Handle executable variable directly (shorthand: prose:@opus)
  if (isExecutableVariable(configVar)) {
    return {
      model: configVar,
      modelName: configVar.name || configVarName,
      skills: [
        'open-prose:prose-boot',
        'open-prose:prose-compile',
        'open-prose:prose-run'
      ]
    };
  }

  // Handle arrays and other types
  if (Array.isArray(value)) {
    throw new Error(
      `Prose config @${configVarName} is an array. ` +
      `Expected: { model: @opus } where @opus is an executable.`
    );
  }

  throw new Error(
    `Prose config @${configVarName} has invalid type '${typeof value}'. ` +
    `Expected an object with { model: @executor } or an executable directly.`
  );
}

interface ProseConfig {
  model: Variable;  // Executable variable (e.g., @opus from @mlld/claude)
  modelName: string;  // Name of the executable for error messages
  cwd?: string;
  skills: string[];  // Skills needed for prose execution (e.g., ["open-prose:prose-run"])
  skillPrompt?: string;
  skillPromptEnd?: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Parse and interpolate a prose template using the proper grammar parser
 * Supports both ATT (@var) and MTT ({{var}}) styles
 */
async function parseAndInterpolateTemplate(
  templateContent: string,
  style: 'att' | 'mtt',
  env: Environment
): Promise<string> {
  const { maskedContent, literalBlocks } = maskPlainMlldTemplateFences(templateContent);
  const { parseSync } = await import('@grammar/parser');
  const startRule = style === 'mtt' ? 'TemplateBodyMtt' : 'TemplateBodyAtt';

  let templateNodes: any[];
  try {
    templateNodes = parseSync(maskedContent, { startRule });
  } catch (parseErr: any) {
    // Fallback to simple interpolation if parser fails
    if (style === 'mtt') {
      // Normalize {{var}} to @var for fallback interpolation
      const normalized = maskedContent.replace(/{{\s*([A-Za-z_][\w.]*)\s*}}/g, '@$1');
      const interpolated = await interpolateProseTemplate(normalized, env);
      return restorePlainMlldTemplateFenceText(interpolated, literalBlocks);
    }
    const interpolated = await interpolateProseTemplate(maskedContent, env);
    return restorePlainMlldTemplateFenceText(interpolated, literalBlocks);
  }

  // Interpolate the parsed template nodes
  templateNodes = restorePlainMlldTemplateFences(templateNodes, literalBlocks);
  return interpolate(templateNodes, env, InterpolationContext.Default);
}

/**
 * Interpolate a prose template file with ATT-style variables (@var)
 * Simple fallback interpolation when parser is not available
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
 * Invoke the model executor with the wrapped prose prompt.
 *
 * The model executor (e.g., @opus from @mlld/claude) takes a prompt parameter
 * and returns the LLM's response.
 */
async function invokeModelExecutor(
  prompt: string,
  config: ProseConfig,
  env: Environment
): Promise<string> {
  const modelVar = config.model;
  const modelName = config.modelName;

  if (!isExecutableVariable(modelVar)) {
    throw new Error(
      `Prose config model is not an executable. ` +
      `Expected an executor like @opus from @mlld/claude.`
    );
  }

  // Construct an ExecInvocation node to call the model executor with the prompt
  // The executor signature is: exe @opus(prompt) = @prompt | cmd { claude -p ... }
  const commandRef: CommandReference = {
    type: 'CommandReference',
    identifier: modelName,
    args: [
      {
        type: 'VariableReference',
        identifier: '__prose_prompt__',
        location: null
      } as any
    ]
  };

  const invocation: ExecInvocation = {
    type: 'ExecInvocation',
    commandRef,
    location: null
  };

  // Set up the prompt as a temporary variable
  const execEnv = env.createChild();
  execEnv.setVariable('__prose_prompt__', createSimpleTextVariable('__prose_prompt__', prompt));

  // Also make the model executor available by the name we're calling
  // (in case it was passed as an object field rather than directly in scope)
  if (!execEnv.getVariable(modelName)) {
    execEnv.setVariable(modelName, modelVar);
  }

  try {
    const result = await evaluateExecInvocation(invocation, execEnv);

    // Extract the string value from the result
    if (typeof result.value === 'string') {
      return result.value;
    }
    if (result.value && typeof result.value === 'object' && 'value' in result.value) {
      return String((result.value as any).value);
    }
    return String(result.value ?? '');
  } catch (err: any) {
    throw new Error(
      `Prose execution via @${modelName} failed: ${err.message || err}`
    );
  }
}
