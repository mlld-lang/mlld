import type { DirectiveNode } from '@core/types';
import { astLocationToSourceLocation } from '@core/types';
import type { Environment } from '@interpreter/env/Environment';
import type { EvalResult } from '@interpreter/core/interpreter';
import type { ExecutableDefinition } from '@core/types/executable';
import {
  createExecutableVariable,
  VariableMetadataUtils,
  type VariableSource
} from '@core/types/variable';
import {
  createCapabilityContext,
  makeSecurityDescriptor,
  type DataLabel,
  type CapabilityContext,
  type SecurityDescriptor
} from '@core/types/security';
import { maybeAutosignVariable } from '../auto-sign';

export interface ExeSecurityContext {
  securityLabels?: DataLabel[];
  descriptor: SecurityDescriptor;
  capabilityContext: CapabilityContext;
}

export interface MaterializeExecutableVariableInput {
  directive: DirectiveNode;
  env: Environment;
  identifier: string;
  executableDef: ExecutableDefinition;
  descriptor: SecurityDescriptor;
  capabilityContext: CapabilityContext;
}

export function createExeSecurityContext(
  directive: DirectiveNode,
  env: Environment,
  identifier: string
): ExeSecurityContext {
  const securityLabels = (directive.meta?.securityLabels ||
    directive.values?.securityLabels) as DataLabel[] | undefined;
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

  return {
    securityLabels,
    descriptor,
    capabilityContext
  };
}

export async function materializeExecutableVariable(
  input: MaterializeExecutableVariableInput
): Promise<EvalResult> {
  const { directive, env, identifier, executableDef, descriptor, capabilityContext } = input;
  const source = buildVariableSource(executableDef);
  const language = resolveCodeExecutableLanguage(executableDef);
  const location = astLocationToSourceLocation(
    directive.location,
    env.getCurrentFilePath()
  );
  const description = (executableDef as any).description;

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
  if (env.getIsImporting()) {
    metadata.capturedModuleEnv = env.captureModuleEnvironment();
  }

  const descriptorWithCommandTaint = addCommandDescriptorTaint(executableDef, descriptor, env);
  const metadataWithSecurity = VariableMetadataUtils.applySecurityMetadata(metadata, {
    existingDescriptor: descriptorWithCommandTaint,
    capability: capabilityContext
  });

  const variable = createExecutableVariable(
    identifier,
    resolveExecutableTypeForVariable(executableDef),
    '',
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

  const paramTypes = (executableDef as any).paramTypes;
  if (
    paramTypes &&
    typeof paramTypes === 'object' &&
    !Array.isArray(paramTypes) &&
    Object.keys(paramTypes).length > 0
  ) {
    variable.paramTypes = paramTypes;
  }
  if (description !== undefined) {
    variable.description = description;
  }

  assignExecutableContent(variable, executableDef);
  env.setVariable(identifier, variable);
  await maybeAutosignVariable(identifier, variable, env);

  return { value: executableDef, env };
}

function buildVariableSource(executableDef: ExecutableDefinition): VariableSource {
  const source: VariableSource = {
    directive: 'var',
    syntax: 'code',
    hasInterpolation: false,
    isMultiLine: false
  };

  if (
    executableDef.type === 'command' ||
    executableDef.type === 'commandRef' ||
    executableDef.type === 'pipeline'
  ) {
    source.syntax = 'command';
  } else if (executableDef.type === 'template') {
    source.syntax = 'template';
  } else if (executableDef.type === 'data') {
    source.syntax = 'object';
  } else if (executableDef.type === 'prose') {
    source.syntax = 'prose';
  }

  return source;
}

function resolveExecutableTypeForVariable(executableDef: ExecutableDefinition): 'command' | 'code' | 'data' {
  if (executableDef.type === 'code') {
    return 'code';
  }
  if (executableDef.type === 'data') {
    return 'data';
  }
  return 'command';
}

function resolveCodeExecutableLanguage(
  executableDef: ExecutableDefinition
): 'js' | 'node' | 'python' | 'sh' | undefined {
  if (executableDef.type !== 'code') {
    return undefined;
  }
  return executableDef.language as 'js' | 'node' | 'python' | 'sh' | undefined;
}

function addCommandDescriptorTaint(
  executableDef: ExecutableDefinition,
  descriptor: SecurityDescriptor,
  env: Environment
): SecurityDescriptor {
  if (executableDef.type !== 'command') {
    return descriptor;
  }

  const commandTaintDescriptor = makeSecurityDescriptor({ taint: ['src:exec'] });
  return env.mergeSecurityDescriptors(descriptor, commandTaintDescriptor);
}

function assignExecutableContent(variable: any, executableDef: ExecutableDefinition): void {
  if (executableDef.type === 'command') {
    variable.value.template = executableDef.commandTemplate;
  } else if (executableDef.type === 'code') {
    variable.value.template = executableDef.codeTemplate;
  } else if (executableDef.type === 'template') {
    variable.value.template = executableDef.template;
  } else if (executableDef.type === 'data') {
    variable.value.template = executableDef.dataTemplate;
  }
}
