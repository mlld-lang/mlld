import type { DirectiveNode, SourceLocation } from '@core/types';
import { astLocationToSourceLocation } from '@core/types';
import type { Environment } from '@interpreter/env/Environment';
import type { EvalResult } from '@interpreter/core/interpreter';
import { evaluate } from '@interpreter/core/interpreter';
import type {
  ExecutableDefinition,
  CommandExecutable,
  CommandRefExecutable,
  CodeExecutable,
  TemplateExecutable,
  SectionExecutable,
  ResolverExecutable,
  PipelineExecutable,
  ProseExecutable
} from '@core/types/executable';
import type {
  CapabilityContext,
  DataLabel,
  SecurityDescriptor
} from '@core/types/security';
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
import { updateVarMxFromDescriptor } from '@core/types/variable/VarMxHelpers';
import {
  isStructuredValue,
  extractSecurityDescriptor
} from '@interpreter/utils/structured-value';
import {
  extractParamNames,
  interpolateAndRecord,
  parseTemplateFileNodes
} from './definition-helpers';

export interface CoreDefinitionBuildContext {
  directive: DirectiveNode;
  env: Environment;
  sourceLocation?: SourceLocation;
  identifier: string;
  securityLabels?: DataLabel[];
  descriptor: SecurityDescriptor;
  capabilityContext: CapabilityContext;
}

export type CoreDefinitionBuildResult =
  | { kind: 'definition'; executableDef: ExecutableDefinition }
  | { kind: 'evalResult'; result: EvalResult }
  | null;

export async function buildCoreExecutableFamily(
  context: CoreDefinitionBuildContext
): Promise<CoreDefinitionBuildResult> {
  const { directive, env } = context;

  if (directive.subtype === 'exeCommand') {
    return {
      kind: 'definition',
      executableDef: await buildCommandExecutableDefinition(context)
    };
  }

  if (directive.subtype === 'exeData') {
    return {
      kind: 'definition',
      executableDef: buildDataExecutableDefinition(context)
    };
  }

  if (directive.subtype === 'exeValue') {
    return {
      kind: 'evalResult',
      result: await evaluateExeValueDirective(context)
    };
  }

  if (directive.subtype === 'exeCode') {
    return {
      kind: 'definition',
      executableDef: buildCodeExecutableDefinition(context)
    };
  }

  if (directive.subtype === 'exeResolver') {
    return {
      kind: 'definition',
      executableDef: await buildResolverExecutableDefinition(context)
    };
  }

  if (directive.subtype === 'exeTemplate') {
    return {
      kind: 'definition',
      executableDef: buildTemplateExecutableDefinition(context)
    };
  }

  if (directive.subtype === 'exeTemplateFile') {
    return {
      kind: 'definition',
      executableDef: await buildTemplateFileExecutableDefinition(context)
    };
  }

  if (directive.subtype === 'exeSection') {
    return {
      kind: 'definition',
      executableDef: buildSectionExecutableDefinition(context)
    };
  }

  if (
    directive.subtype === 'exeProse' ||
    directive.subtype === 'exeProseFile' ||
    directive.subtype === 'exeProseTemplate'
  ) {
    return {
      kind: 'definition',
      executableDef: buildProseExecutableDefinition(context)
    };
  }

  return null;
}

async function buildCommandExecutableDefinition(
  context: CoreDefinitionBuildContext
): Promise<ExecutableDefinition> {
  const { directive, env } = context;
  const params = directive.values?.params || [];
  const paramNames = extractParamNames(params);
  const withClause = directive.values?.withClause;

  if (directive.meta?.isPipelineOnly && withClause?.pipeline) {
    return {
      type: 'pipeline',
      pipeline: withClause.pipeline,
      format: withClause.format,
      parallelCap: withClause.parallel,
      delayMs: withClause.delayMs,
      paramNames,
      sourceDirective: 'exec'
    } satisfies PipelineExecutable;
  }

  const commandRef = directive.values?.commandRef;
  if (commandRef) {
    let refName: string | undefined;
    const commandRefNodes = Array.isArray(commandRef) ? commandRef : [commandRef];
    const execInvocation = (directive.values as any)?.execInvocation;
    const hasExecInvocation =
      execInvocation &&
      typeof execInvocation === 'object' &&
      (execInvocation as any).type === 'ExecInvocation';
    const invocationHasObject =
      hasExecInvocation &&
      (((execInvocation as any).commandRef?.objectSource) ||
        (execInvocation as any).commandRef?.objectReference);
    const invocationHasFields =
      hasExecInvocation &&
      Array.isArray((execInvocation as any).fields) &&
      (execInvocation as any).fields.length > 0;
    const shouldUseInvocationAst = invocationHasObject || invocationHasFields;

    try {
      const refCandidate = commandRefNodes[0];
      if (refCandidate && typeof refCandidate === 'object') {
        if (
          'type' in refCandidate &&
          (refCandidate as any).type === 'VariableReference' &&
          'identifier' in (refCandidate as any)
        ) {
          refName = (refCandidate as any).identifier as string;
        } else if (
          'name' in refCandidate &&
          typeof (refCandidate as any).name === 'string'
        ) {
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
      ((refCandidate as any).type === 'VariableReference' ||
        (refCandidate as any).type === 'VariableReferenceWithTail');
    const refFields = isVariableRef ? (refCandidate as any).fields : undefined;
    const refPipes = isVariableRef ? (refCandidate as any).pipes : undefined;
    const shouldTemplateFromRef =
      isVariableRef &&
      ((refCandidate as any).type === 'VariableReferenceWithTail' ||
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
      return {
        type: 'commandRef',
        commandRef: refName || '',
        commandArgs: args,
        withClause,
        paramNames,
        sourceDirective: 'exec',
        commandRefAst: execInvocation
      } satisfies CommandRefExecutable;
    }

    if (isIdentity || shouldTemplateFromRef) {
      const executableDef = {
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
      return executableDef;
    }

    return {
      type: 'commandRef',
      commandRef: refName,
      commandArgs: args,
      withClause,
      paramNames,
      sourceDirective: 'exec'
    } satisfies CommandRefExecutable;
  }

  const commandNodes = directive.values?.command;
  if (!commandNodes) {
    throw new Error('Exec command directive missing command');
  }

  const workingDir = (directive.values as any)?.workingDir;
  const workingDirMeta =
    (directive.meta as any)?.workingDirMeta ||
    (directive.values as any)?.workingDirMeta;

  return {
    type: 'command',
    commandTemplate: commandNodes,
    withClause,
    paramNames,
    sourceDirective: 'exec',
    ...(workingDir ? { workingDir } : {}),
    ...(workingDirMeta ? { workingDirMeta } : {})
  } satisfies CommandExecutable;
}

function buildDataExecutableDefinition(
  context: CoreDefinitionBuildContext
): ExecutableDefinition {
  const { directive } = context;
  const dataNodes = directive.values?.data;
  if (!dataNodes) {
    throw new Error('Exec data directive missing data content');
  }
  const params = directive.values?.params || [];
  const paramNames = extractParamNames(params);
  return {
    type: 'data',
    dataTemplate: dataNodes,
    paramNames,
    sourceDirective: 'exec'
  };
}

async function evaluateExeValueDirective(
  context: CoreDefinitionBuildContext
): Promise<EvalResult> {
  const {
    directive,
    env,
    sourceLocation,
    identifier,
    securityLabels,
    descriptor,
    capabilityContext
  } = context;
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
  const location =
    sourceLocation ??
    astLocationToSourceLocation(directive.location, env.getCurrentFilePath());
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
  } else if (
    typeof resolvedValue === 'number' ||
    typeof resolvedValue === 'boolean' ||
    resolvedValue === null
  ) {
    variable = createPrimitiveVariable(identifier, resolvedValue, source, options);
  } else if (Array.isArray(resolvedValue)) {
    variable = createArrayVariable(identifier, resolvedValue, false, source, options);
  } else if (resolvedValue && typeof resolvedValue === 'object') {
    variable = createObjectVariable(
      identifier,
      resolvedValue as Record<string, unknown>,
      false,
      source,
      options
    );
  } else {
    variable = createSimpleTextVariable(
      identifier,
      String(resolvedValue ?? ''),
      source,
      options
    );
  }

  env.setVariable(identifier, variable);
  return { value: resolvedValue, env };
}

function buildCodeExecutableDefinition(
  context: CoreDefinitionBuildContext
): ExecutableDefinition {
  const { directive } = context;
  const codeNodes = directive.values?.code;
  if (!codeNodes) {
    throw new Error('Exec code directive missing code');
  }

  const params = directive.values?.params || [];
  const paramNames = extractParamNames(params);
  const withClause = directive.values?.withClause;
  const language = directive.meta?.language || 'javascript';
  const workingDir = (directive.values as any)?.workingDir;
  const workingDirMeta =
    (directive.meta as any)?.workingDirMeta ||
    (directive.values as any)?.workingDirMeta;

  return {
    type: 'code',
    codeTemplate: codeNodes,
    language,
    paramNames,
    sourceDirective: 'exec',
    ...(withClause ? { withClause } : {}),
    ...(workingDir ? { workingDir } : {}),
    ...(workingDirMeta ? { workingDirMeta } : {})
  } satisfies CodeExecutable;
}

async function buildResolverExecutableDefinition(
  context: CoreDefinitionBuildContext
): Promise<ExecutableDefinition> {
  const { directive, env } = context;
  const resolverNodes = directive.values?.resolver;
  if (!resolverNodes) {
    throw new Error('Exec resolver directive missing resolver path');
  }

  const resolverPath = await interpolateAndRecord(resolverNodes, env);
  const params = directive.values?.params || [];
  const paramNames = extractParamNames(params);
  const payloadNodes = directive.values?.payload;

  if (resolverPath === 'run') {
    throw new Error(
      'Grammar parsing issue: @exec with @run should be parsed as execCommand, not execResolver'
    );
  }

  return {
    type: 'resolver',
    resolverPath,
    payloadTemplate: payloadNodes,
    paramNames,
    sourceDirective: 'exec'
  } satisfies ResolverExecutable;
}

function buildTemplateExecutableDefinition(
  context: CoreDefinitionBuildContext
): ExecutableDefinition {
  const { directive } = context;
  const templateNodes = directive.values?.template;
  if (!templateNodes) {
    throw new Error('Exec template directive missing template');
  }

  const params = directive.values?.params || [];
  const paramNames = extractParamNames(params);

  return {
    type: 'template',
    template: templateNodes,
    paramNames,
    sourceDirective: 'exec'
  } satisfies TemplateExecutable;
}

async function buildTemplateFileExecutableDefinition(
  context: CoreDefinitionBuildContext
): Promise<ExecutableDefinition> {
  const { directive, env, sourceLocation } = context;
  const templateNodes = await parseTemplateFileNodes(
    directive.values?.path,
    env,
    sourceLocation ?? undefined
  );

  const params = directive.values?.params || [];
  const paramNames = extractParamNames(params);

  return {
    type: 'template',
    template: templateNodes,
    paramNames,
    sourceDirective: 'exec'
  } satisfies TemplateExecutable;
}

function buildSectionExecutableDefinition(
  context: CoreDefinitionBuildContext
): ExecutableDefinition {
  const { directive } = context;
  const pathNodes = directive.values?.path;
  const sectionNodes = directive.values?.section;
  if (!pathNodes || !sectionNodes) {
    throw new Error('Exec section directive missing path or section');
  }

  const params = directive.values?.params || [];
  const paramNames = extractParamNames(params);
  const renameNodes = directive.values?.rename;

  return {
    type: 'section',
    pathTemplate: pathNodes,
    sectionTemplate: sectionNodes,
    renameTemplate: renameNodes,
    paramNames,
    sourceDirective: 'exec'
  } satisfies SectionExecutable;
}

function buildProseExecutableDefinition(
  context: CoreDefinitionBuildContext
): ExecutableDefinition {
  const { directive } = context;
  const configRefNodes = directive.values?.configRef;
  if (!configRefNodes || !Array.isArray(configRefNodes) || configRefNodes.length === 0) {
    throw new Error('Prose executable missing config reference');
  }

  const params = directive.values?.params || [];
  const paramNames = extractParamNames(params);
  const contentType = directive.values?.contentType as 'inline' | 'file' | 'template';

  if (contentType === 'inline') {
    const contentNodes = directive.values?.content;
    if (!contentNodes) {
      throw new Error('Inline prose executable missing content');
    }

    return {
      type: 'prose',
      configRef: configRefNodes,
      contentType: 'inline',
      contentTemplate: contentNodes,
      paramNames,
      sourceDirective: 'exec'
    } satisfies ProseExecutable;
  }

  const pathNodes = directive.values?.path;
  if (!pathNodes || !Array.isArray(pathNodes) || pathNodes.length === 0) {
    throw new Error('File-based prose executable missing path');
  }

  return {
    type: 'prose',
    configRef: configRefNodes,
    contentType,
    pathTemplate: pathNodes,
    paramNames,
    sourceDirective: 'exec'
  } satisfies ProseExecutable;
}
