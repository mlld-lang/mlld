import type { PipelineCommand } from '@core/types';
import type { StructuredValue } from '@interpreter/utils/structured-value';
import { isStructuredValue, wrapStructured, asData } from '@interpreter/utils/structured-value';
import { safeJSONStringify } from './helpers';

export interface WhileProcessorAdaptation {
  command: PipelineCommand;
  input: {
    structured: StructuredValue;
    text: string;
  };
}

export class PipelineWhileStageAdapter {
  adaptProcessor(
    processor: any,
    value: StructuredValue | unknown
  ): WhileProcessorAdaptation {
    return {
      command: this.buildProcessorCommand(processor),
      input: this.normalizeInput(value)
    };
  }

  buildProcessorCommand(processor: any): PipelineCommand {
    if (processor?.type === 'ExecInvocation') {
      const ref = processor.commandRef || {};
      const identifier = Array.isArray(ref.identifier)
        ? ref.identifier
        : ref.identifier
          ? [ref.identifier]
          : [];
      const rawIdentifier =
        ref.name ||
        (Array.isArray(ref.identifier)
          ? ref.identifier.map((id: any) => id.identifier || id.content || '').find(Boolean)
          : ref.identifier) ||
        'while-processor';
      const rawArgs = (ref.args || []).map((arg: any) => {
        if (arg && typeof arg === 'object') {
          if ('content' in arg && typeof (arg as any).content === 'string') {
            return (arg as any).content;
          }
          if ((arg as any).identifier) {
            return `@${(arg as any).identifier}`;
          }
        }
        return '';
      });
      const command: PipelineCommand & { stream?: boolean } = {
        identifier,
        args: ref.args || [],
        fields: ref.fields || [],
        rawIdentifier,
        rawArgs,
        meta: {}
      };
      if (processor.withClause && processor.withClause.stream !== undefined) {
        command.stream = processor.withClause.stream;
      }
      return command;
    }

    if (processor?.type === 'VariableReferenceWithTail') {
      const variable = (processor as any).variable || processor;
      const rawIdentifier = variable?.identifier || 'while-processor';
      return {
        identifier: variable ? [variable] : [],
        args: [],
        fields: variable?.fields || [],
        rawIdentifier,
        rawArgs: []
      };
    }

    if (processor?.type === 'VariableReference') {
      return {
        identifier: [processor],
        args: [],
        fields: processor.fields || [],
        rawIdentifier: processor.identifier || 'while-processor',
        rawArgs: []
      };
    }

    const fallbackId =
      (processor && typeof processor === 'object' && 'identifier' in processor && (processor as any).identifier) ||
      (processor && typeof processor === 'object' && 'rawIdentifier' in processor && (processor as any).rawIdentifier) ||
      'while-processor';
    return {
      identifier: [],
      args: [],
      fields: [],
      rawIdentifier: fallbackId as string,
      rawArgs: []
    };
  }

  normalizeInput(value: StructuredValue | unknown): { structured: StructuredValue; text: string } {
    if (isStructuredValue(value)) {
      const textValue = value.text ?? safeJSONStringify(asData(value));
      return { structured: value, text: textValue };
    }

    const textValue = typeof value === 'string' ? value : safeJSONStringify(value);
    const kind: StructuredValue['type'] =
      Array.isArray(value) ? 'array' : typeof value === 'object' && value !== null ? 'object' : 'text';
    const structured = wrapStructured(value as any, kind, textValue);
    return { structured, text: textValue };
  }
}
