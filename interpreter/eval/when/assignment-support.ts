import { astLocationToSourceLocation } from '@core/types';
import type { Environment } from '@interpreter/env/Environment';
import type { Variable } from '@core/types/variable';
import type { LetAssignmentNode, AugmentedAssignmentNode } from '@core/types/when';
import { VariableRedefinitionError } from '@core/errors/VariableRedefinitionError';
import { MlldWhenExpressionError } from '@core/errors';
import { VariableImporter } from '@interpreter/eval/import/VariableImporter';
import { evaluate, interpolate } from '@interpreter/core/interpreter';
import { InterpolationContext } from '@interpreter/core/interpolation-context';
import { isVariable, extractVariableValue } from '@interpreter/utils/variable-resolution';
import { combineValues } from '@interpreter/utils/value-combine';

export async function evaluateAssignmentValue(
  entry: LetAssignmentNode | AugmentedAssignmentNode,
  env: Environment
): Promise<unknown> {
  let value: unknown;
  const tail = (entry as any).withClause;
  let handledByRunEvaluator = false;
  const wrapperType = (entry as any).meta?.wrapperType;
  const firstValue = Array.isArray(entry.value) && entry.value.length > 0 ? entry.value[0] : entry.value;

  if (firstValue && typeof firstValue === 'object' && (firstValue as any).type === 'code') {
    const { evaluateCodeExecution } = await import('@interpreter/eval/code-execution');
    const result = await evaluateCodeExecution(firstValue as any, env);
    value = result.value;
  }

  if (firstValue && typeof firstValue === 'object' && (firstValue as any).type === 'command') {
    const commandNode: any = firstValue;

    if (tail) {
      const { evaluateRun } = await import('@interpreter/eval/run');
      const runDirective: any = {
        type: 'Directive',
        nodeId: (entry as any).nodeId ? `${(entry as any).nodeId}-run` : undefined,
        location: entry.location,
        kind: 'run',
        subtype: 'runCommand',
        source: 'command',
        values: {
          command: commandNode.command,
          withClause: tail
        },
        raw: {
          command: Array.isArray(commandNode.command) ? (commandNode.meta?.raw || '') : String(commandNode.command),
          withClause: tail
        },
        meta: {
          isDataValue: true
        }
      };
      const result = await evaluateRun(runDirective, env);
      value = result.value;
      handledByRunEvaluator = true;
    } else {
      if (Array.isArray(commandNode.command)) {
        const interpolatedCommand = await interpolate(
          commandNode.command,
          env,
          InterpolationContext.ShellCommand
        );
        value = await env.executeCommand(interpolatedCommand);
      } else {
        value = await env.executeCommand(commandNode.command);
      }

      const { processCommandOutput } = await import('@interpreter/utils/json-auto-parser');
      value = processCommandOutput(value);
    }
  }

  if (wrapperType && Array.isArray(entry.value)) {
    if (wrapperType === 'tripleColon') {
      value = entry.value;
    } else if (
      wrapperType === 'backtick' &&
      entry.value.length === 1 &&
      (entry.value[0] as any).type === 'Text'
    ) {
      value = (entry.value[0] as any).content;
    } else {
      value = await interpolate(entry.value, env);
    }
  }

  const isRawPrimitive = firstValue === null ||
    typeof firstValue === 'number' ||
    typeof firstValue === 'boolean' ||
    (typeof firstValue === 'string' && !('type' in (firstValue as any)));

  if (value === undefined) {
    if (isRawPrimitive) {
      value = (entry.value as any[]).length === 1 ? firstValue : entry.value;
    } else {
      const valueResult = await evaluate(entry.value, env, { isExpression: true });
      value = valueResult.value;
    }
  }

  if (tail && !handledByRunEvaluator) {
    const { processPipeline } = await import('@interpreter/eval/pipeline/unified-processor');
    value = await processPipeline({
      value,
      env,
      node: entry,
      identifier: entry.identifier,
      location: entry.location
    });
  }

  return value;
}

export function findIsolationRoot(env: Environment): Environment | undefined {
  let current: Environment | undefined = env;
  while (current) {
    if ((current as any).__parallelIsolationRoot === current) {
      return current;
    }
    current = current.getParent();
  }
  return undefined;
}

export function findVariableOwner(env: Environment, name: string): Environment | undefined {
  let current: Environment | undefined = env;
  while (current) {
    if (current.getCurrentVariables().has(name)) return current;
    current = current.getParent();
  }
  return undefined;
}

export function isDescendantEnvironment(env: Environment, ancestor: Environment): boolean {
  let current: Environment | undefined = env;
  while (current) {
    if (current === ancestor) return true;
    current = current.getParent();
  }
  return false;
}

/**
 * Helper to evaluate a let assignment and return updated environment
 */
export async function evaluateLetAssignment(
  entry: LetAssignmentNode,
  env: Environment
): Promise<Environment> {
  const existingOwner = findVariableOwner(env, entry.identifier);
  if (existingOwner) {
    const existingVariable = existingOwner.getVariable(entry.identifier);
    const existingImportPath = existingVariable?.mx?.importPath;
    const existingIsBlockScoped = existingImportPath === 'let' || existingImportPath === 'exe-param';
    const existingIsImported = existingVariable?.mx?.isImported === true;
    const whenExpressionContext = env.getExecutionContext<{ allowLetShadowing?: boolean }>('when-expression');
    const allowShadowing = whenExpressionContext?.allowLetShadowing === true;
    if (!existingIsBlockScoped && !existingIsImported && !allowShadowing) {
      const existingLocation = existingVariable?.mx?.definedAt ?? existingVariable?.definedAt;
      const newLocation = astLocationToSourceLocation(entry.location, env.getCurrentFilePath());
      if (existingLocation && newLocation) {
        throw VariableRedefinitionError.forSameFile(entry.identifier, existingLocation, newLocation);
      }
      throw new VariableRedefinitionError(
        `Variable '${entry.identifier}' is already defined and cannot be redefined`,
        {
          context: {
            variableName: entry.identifier,
            existingLocation,
            newLocation,
            filePath: newLocation?.filePath
          }
        }
      );
    }
  }

  const value = await evaluateAssignmentValue(entry, env);

  let variable: Variable;

  // If value is already a Variable (e.g., from for-expression), reuse it with updated name
  if (isVariable(value)) {
    variable = {
      ...value,
      name: entry.identifier,
      // Ensure mx is present with required fields
      mx: value.mx ?? { labels: [], taint: [], sources: [] }
    };
  } else {
    const importer = new VariableImporter();
    variable = importer.createVariableFromValue(
      entry.identifier,
      value,
      'let',
      undefined,
      { env }
    );
  }

  const newEnv = env.createChild();
  newEnv.setVariable(entry.identifier, variable);
  return newEnv;
}

/**
 * Helper to evaluate an augmented assignment and return updated environment
 */
export async function evaluateAugmentedAssignment(
  entry: AugmentedAssignmentNode,
  env: Environment
): Promise<Environment> {
  const isolationRoot = findIsolationRoot(env);
  // Get existing variable - must exist
  const existing = env.getVariable(entry.identifier);
  if (!existing) {
    const location = astLocationToSourceLocation(entry.location, env.getCurrentFilePath());
    throw new MlldWhenExpressionError(
      `Cannot use += on undefined variable @${entry.identifier}. ` +
      `Use "let @${entry.identifier} = ..." first.`,
      location,
      location?.filePath ? { filePath: location.filePath, sourceContent: env.getSource(location.filePath) } : undefined,
      { env }
    );
  }

  if (isolationRoot) {
    const owner = findVariableOwner(env, entry.identifier);
    if (!owner || !isDescendantEnvironment(owner, isolationRoot)) {
      const location = astLocationToSourceLocation(entry.location, env.getCurrentFilePath());
      throw new MlldWhenExpressionError(
        `Parallel for block cannot mutate outer variable @${entry.identifier}.`,
        location,
        location?.filePath ? { filePath: location.filePath, sourceContent: env.getSource(location.filePath) } : undefined,
        { env }
      );
    }
  }

  // Evaluate the RHS value
  const rhsValue = await evaluateAssignmentValue(entry, env);

  // Get current value of the variable
  const existingValue = await extractVariableValue(existing, env);

  // Combine values using the += semantics
  const combined = combineValues(existingValue, rhsValue, entry.identifier);

  // Update variable in local scope (use updateVariable to bypass redefinition check)
  const importer = new VariableImporter();
  const updatedVar = importer.createVariableFromValue(
    entry.identifier,
    combined,
    'let',
    undefined,
    { env }
  );

  // Update the variable in the owning environment (current scope or ancestor)
  let targetEnv: Environment | undefined = env;
  while (targetEnv && !targetEnv.getCurrentVariables().has(entry.identifier)) {
    targetEnv = targetEnv.getParent();
  }
  (targetEnv ?? env).updateVariable(entry.identifier, updatedVar);
  return env;
}
