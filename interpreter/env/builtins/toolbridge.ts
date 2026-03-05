import type { VariableSource, Variable } from '@core/types/variable';
import type { NodeFunctionExecutable } from '@core/types/executable';
import { createExecutableVariable } from '@core/types/variable/VariableFactories';
import type { Environment } from '@interpreter/env/Environment';
import { isStructuredValue, asData } from '@interpreter/utils/structured-value';
import { createCallMcpConfig } from '@interpreter/env/executors/call-mcp-config';

const TOOLBRIDGE_SOURCE: VariableSource = {
  directive: 'var',
  syntax: 'reference',
  hasInterpolation: false,
  isMultiLine: false
};

function normalizeToolsArg(value: unknown): unknown[] {
  if (value === undefined || value === null) {
    return [];
  }

  let resolved = value;
  if (isStructuredValue(resolved)) {
    resolved = asData(resolved);
  }

  if (Array.isArray(resolved)) {
    return resolved;
  }

  return [resolved];
}

function normalizeWorkingDirectoryArg(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  let resolved = value;
  if (isStructuredValue(resolved)) {
    resolved = asData(resolved);
  }

  if (typeof resolved === 'string') {
    const trimmed = resolved.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  return undefined;
}

export function createToolbridgeExecutable(env: Environment): Variable {
  const executableDef: NodeFunctionExecutable = {
    type: 'nodeFunction',
    name: 'toolbridge',
    fn: async (toolsArg?: unknown, cwdArg?: unknown) => {
      if (!env.getExecutionContext('exec-invocation')) {
        throw new Error('@toolbridge can only be called inside an exec invocation');
      }

      const callConfig = await createCallMcpConfig({
        tools: normalizeToolsArg(toolsArg),
        env,
        workingDirectory: normalizeWorkingDirectoryArg(cwdArg)
      });

      if (callConfig.mcpConfigPath) {
        env.registerScopeCleanup(callConfig.cleanup);
      }

      return {
        config: callConfig.mcpConfigPath,
        tools: callConfig.toolsCsv,
        mcpAllowedTools: callConfig.mcpAllowedTools,
        inBox: callConfig.inBox
      };
    },
    paramNames: ['tools', 'cwd'],
    paramTypes: {
      tools: 'array',
      cwd: 'string'
    },
    description: 'Resolve per-call MCP tool bridge config from mixed tool inputs',
    sourceDirective: 'exec'
  };

  const variable = createExecutableVariable(
    'toolbridge',
    'code',
    '',
    executableDef.paramNames,
    'js',
    TOOLBRIDGE_SOURCE,
    {
      mx: {
        labels: [],
        taint: [],
        sources: [],
        policy: null
      },
      internal: {
        isSystem: true,
        executableDef
      }
    }
  );

  variable.description = executableDef.description;
  variable.paramTypes = executableDef.paramTypes;
  return variable as Variable;
}
