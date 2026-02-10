import type { WhenExpressionNode } from '@core/types/when';
import { logger } from '@core/utils/logger';

export type ExecutableOperationType = 'sh' | 'node' | 'js' | 'py' | 'prose' | null;

export interface NormalizedExecutableDescriptor {
  execDef: any;
  boundArgs: unknown[];
  baseParamNames: string[];
  paramNames: string[];
  whenExprNode: WhenExpressionNode | null;
  stageLanguage: string | undefined;
  opType: ExecutableOperationType;
}

function resolveExecutableLanguage(commandVar: any, execDef: any): string | undefined {
  if (execDef?.language) {
    return String(execDef.language);
  }
  if (execDef?.type === 'nodeFunction' || execDef?.type === 'nodeClass') {
    return 'node';
  }
  const metadataDef = commandVar?.internal?.executableDef;
  if (metadataDef?.language) {
    return String(metadataDef.language);
  }
  if (commandVar?.value?.language) {
    return String(commandVar.value.language);
  }
  if (commandVar?.language) {
    return String(commandVar.language);
  }
  return undefined;
}

function resolveOpTypeFromLanguage(language?: string): ExecutableOperationType {
  if (!language) {
    return null;
  }
  const normalized = language.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (normalized === 'bash' || normalized === 'sh' || normalized === 'shell') {
    return 'sh';
  }
  if (normalized === 'node' || normalized === 'nodejs') {
    return 'node';
  }
  if (normalized === 'js' || normalized === 'javascript') {
    return 'js';
  }
  if (normalized === 'py' || normalized === 'python') {
    return 'py';
  }
  if (normalized === 'prose') {
    return 'prose';
  }
  return null;
}

function extractExecutableDefinition(commandVar: any): any {
  if (commandVar && commandVar.type === 'executable' && commandVar.value) {
    const storedDef = commandVar.internal?.executableDef;
    let execDef: any;

    if (storedDef) {
      execDef = storedDef;
      if (!execDef.paramNames && commandVar.paramNames) {
        execDef.paramNames = commandVar.paramNames;
      }
    } else {
      const simplifiedValue = commandVar.value;
      if (simplifiedValue.type === 'code') {
        execDef = {
          type: 'code',
          codeTemplate: simplifiedValue.template,
          language: simplifiedValue.language || 'javascript',
          paramNames: commandVar.paramNames || []
        };
      } else if (simplifiedValue.type === 'command') {
        execDef = {
          type: 'command',
          commandTemplate: simplifiedValue.template,
          paramNames: commandVar.paramNames || []
        };
      } else {
        execDef = simplifiedValue;
      }
    }

    if (process.env.MLLD_DEBUG === 'true') {
      logger.debug('Executable definition extracted:', {
        type: execDef?.type,
        hasParamNames: !!execDef?.paramNames,
        hasCommandTemplate: !!execDef?.commandTemplate,
        hasCodeTemplate: !!execDef?.codeTemplate,
        hasTemplateContent: !!execDef?.templateContent,
        hasTemplate: !!execDef?.template,
        language: execDef?.language,
        fromMetadata: !!commandVar.internal?.executableDef
      });
    }

    return execDef;
  }

  if (
    commandVar &&
    (commandVar.type === 'command' || commandVar.type === 'code' || commandVar.type === 'template') &&
    (commandVar.commandTemplate || commandVar.codeTemplate || commandVar.templateContent)
  ) {
    return commandVar;
  }

  const varInfo = {
    type: commandVar?.type,
    hasValue: !!commandVar?.value,
    valueType: commandVar?.value?.type,
    valueKeys: commandVar?.value ? Object.keys(commandVar.value) : [],
    hasCommandTemplate: !!commandVar?.commandTemplate,
    hasCodeTemplate: !!commandVar?.codeTemplate,
    hasTemplateContent: !!commandVar?.templateContent,
    hasTemplate: !!commandVar?.template,
    keys: commandVar ? Object.keys(commandVar) : [],
    valueStructure: commandVar?.value
      ? {
          type: commandVar.value.type,
          hasTemplate: !!commandVar.value.template,
          hasCodeTemplate: !!commandVar.value.codeTemplate,
          hasCommandTemplate: !!commandVar.value.commandTemplate,
          language: commandVar.value.language,
          paramNames: commandVar.value.paramNames
        }
      : null
  };

  throw new Error(`Cannot execute non-executable variable in pipeline: ${JSON.stringify(varInfo, null, 2)}`);
}

export function normalizeExecutableDescriptor(commandVar: any): NormalizedExecutableDescriptor {
  let execDef = extractExecutableDefinition(commandVar);
  let boundArgs: unknown[] = [];
  let baseParamNames: string[] = [];
  let paramNames: string[] = [];

  if (execDef?.type === 'partial') {
    boundArgs = Array.isArray(execDef.boundArgs) ? execDef.boundArgs : [];
    baseParamNames = Array.isArray(execDef.base?.paramNames) ? execDef.base.paramNames : [];
    paramNames = Array.isArray(execDef.paramNames)
      ? execDef.paramNames
      : baseParamNames.slice(boundArgs.length);
    execDef = execDef.base;
  } else {
    baseParamNames = Array.isArray(execDef?.paramNames) ? execDef.paramNames : [];
    paramNames = baseParamNames;
  }

  let whenExprNode: WhenExpressionNode | null = null;
  if (execDef?.language === 'mlld-when' && Array.isArray(execDef.codeTemplate) && execDef.codeTemplate.length > 0) {
    const candidate = execDef.codeTemplate[0];
    if (candidate && candidate.type === 'WhenExpression') {
      whenExprNode = candidate as WhenExpressionNode;
    }
  }

  const stageLanguage = resolveExecutableLanguage(commandVar, execDef);
  const opType = resolveOpTypeFromLanguage(stageLanguage);

  return {
    execDef,
    boundArgs,
    baseParamNames,
    paramNames,
    whenExprNode,
    stageLanguage,
    opType
  };
}
