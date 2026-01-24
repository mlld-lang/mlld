import { randomUUID } from 'crypto';
import type { ExecInvocation, TextNode, VariableReferenceNode, CommandReference, LiteralNode } from '@core/types';
import type { DataValue, DataObjectEntry } from '@core/types/var';
import type { ExecutableVariable, Variable } from '@core/types/variable';
import type { ToolCollection, ToolDefinition } from '@core/types/tools';
import type { Environment } from '@interpreter/env/Environment';
import { evaluateExecInvocation } from '@interpreter/eval/exec-invocation';
import { mcpNameToMlldName } from './SchemaGenerator';
import { asText, isStructuredValue } from '@interpreter/utils/structured-value';
import { makeSecurityDescriptor, type SecurityDescriptor } from '@core/types/security';

export interface FunctionRouterOptions {
  environment: Environment;
  toolCollection?: ToolCollection;
}

interface ExecResult {
  value: unknown;
}

type SyntheticCommandReference = Omit<CommandReference, 'identifier' | 'args'> & {
  identifier: VariableReferenceNode[];
  args?: DataValue[];
  name: string;
};

export class FunctionRouter {
  private readonly environment: Environment;
  private readonly toolCollection?: ToolCollection;

  constructor(options: FunctionRouterOptions) {
    this.environment = options.environment;
    this.toolCollection = options.toolCollection;
  }

  async executeFunction(toolName: string, args: Record<string, unknown>): Promise<string> {
    const toolKey = mcpNameToMlldName(toolName);
    if (this.toolCollection) {
      const definition = this.toolCollection[toolKey];
      if (!definition?.mlld) {
        throw new Error(`Tool '${toolName}' not found`);
      }
      const execName = definition.mlld;
      const variable = this.environment.getVariable(execName) as Variable | undefined;

      if (!variable || variable.type !== 'executable') {
        throw new Error(`Tool '${toolName}' not found`);
      }

      const execVar = variable as ExecutableVariable;
      const resolvedArgs = this.resolveToolArgs(execVar, args, definition, toolName);
      const invocation = this.buildInvocation(execName, execVar, resolvedArgs, toolName, definition.labels);
      const result = (await evaluateExecInvocation(invocation, this.environment)) as ExecResult;

      return this.serializeResult(result.value);
    }

    const execName = toolKey;
    const variable = this.environment.getVariable(execName) as Variable | undefined;

    if (!variable || variable.type !== 'executable') {
      throw new Error(`Tool '${toolName}' not found`);
    }

    const execVar = variable as ExecutableVariable;
    const invocation = this.buildInvocation(execName, execVar, args, toolName);
    const result = (await evaluateExecInvocation(invocation, this.environment)) as ExecResult;

    return this.serializeResult(result.value);
  }

  private buildInvocation(
    name: string,
    execVar: ExecutableVariable,
    args: Record<string, unknown>,
    toolName?: string,
    toolLabels?: string[]
  ): ExecInvocation {
    const location = this.createLocation();
    const identifierNode = this.createVariableReferenceNode(name, location);
    const argNodes = this.createArgumentNodes(execVar, args, location);

    const commandRef: SyntheticCommandReference = {
      type: 'CommandReference',
      nodeId: randomUUID(),
      location,
      identifier: [identifierNode],
      name,
      args: argNodes,
    };

    const mcpSecurityDescriptor = this.createMcpSecurityDescriptor(toolName ?? name);

    return {
      type: 'ExecInvocation',
      nodeId: randomUUID(),
      location,
      commandRef,
      meta: {
        mcpSecurity: mcpSecurityDescriptor,
        ...(toolLabels && toolLabels.length > 0 ? { mcpToolLabels: toolLabels } : {})
      }
    } as ExecInvocation;
  }

  private createMcpSecurityDescriptor(toolName: string): SecurityDescriptor {
    return makeSecurityDescriptor({
      taint: ['src:mcp'],
      sources: [`mcp:${toolName}`]
    });
  }

  private resolveToolArgs(
    execVar: ExecutableVariable,
    args: Record<string, unknown>,
    definition: ToolDefinition,
    toolName: string
  ): Record<string, unknown> {
    const paramNames = Array.isArray(execVar.paramNames) ? execVar.paramNames : [];
    const bound =
      definition.bind && typeof definition.bind === 'object' && !Array.isArray(definition.bind)
        ? definition.bind
        : undefined;
    const boundKeys = bound ? Object.keys(bound) : [];
    const hasExpose = Array.isArray(definition.expose);
    const exposed = hasExpose
      ? definition.expose!
      : paramNames.filter(param => !boundKeys.includes(param));
    const exposedSet = new Set(exposed);

    for (const key of Object.keys(args)) {
      if (!exposedSet.has(key)) {
        throw new Error(`Parameter '${key}' is not exposed by tool '${toolName}'`);
      }
      if (bound && Object.prototype.hasOwnProperty.call(bound, key)) {
        throw new Error(`Parameter '${key}' is bound by tool '${toolName}'`);
      }
    }

    if (exposed.length > 0) {
      const missing = exposed.filter(key => !Object.prototype.hasOwnProperty.call(args, key));
      if (missing.length > 0) {
        throw new Error(`Tool '${toolName}' requires parameters: ${missing.join(', ')}`);
      }
    }

    if (!bound || boundKeys.length === 0) {
      return args;
    }

    return { ...bound, ...args };
  }

  private createArgumentNodes(
    execVar: ExecutableVariable,
    args: Record<string, unknown>,
    location: ExecInvocation['location']
  ): DataValue[] {
    const params = Array.isArray(execVar.paramNames) ? execVar.paramNames : [];
    if (params.length === 0) {
      return [];
    }

    let lastProvidedIndex = -1;
    for (let i = params.length - 1; i >= 0; i--) {
      if (Object.prototype.hasOwnProperty.call(args, params[i])) {
        lastProvidedIndex = i;
        break;
      }
    }

    if (lastProvidedIndex === -1) {
      return [];
    }

    const nodes: DataValue[] = [];
    for (let i = 0; i <= lastProvidedIndex; i++) {
      const paramName = params[i];
      if (!Object.prototype.hasOwnProperty.call(args, paramName)) {
        throw new Error(`Parameter '${paramName}' is required`);
      }
      nodes.push(this.createDataValue(args[paramName], location));
    }
    return nodes;
  }

  private createVariableReferenceNode(
    name: string,
    location: ExecInvocation['location']
  ): VariableReferenceNode {
    return {
      type: 'VariableReference',
      nodeId: randomUUID(),
      location,
      identifier: name,
      valueType: 'varIdentifier',
    } as VariableReferenceNode;
  }

  private createTextNode(value: string, location: ExecInvocation['location']): TextNode {
    return {
      type: 'Text',
      nodeId: randomUUID(),
      location,
      content: value,
    } as TextNode;
  }

  private createLiteralNode(value: LiteralNode['value'], location: ExecInvocation['location']): LiteralNode {
    return {
      type: 'Literal',
      nodeId: randomUUID(),
      location,
      value
    } as LiteralNode;
  }

  private createDataValue(value: unknown, location: ExecInvocation['location']): DataValue {
    if (value === undefined) {
      return this.createTextNode('undefined', location);
    }
    if (value === null) {
      return this.createLiteralNode(null, location);
    }
    if (typeof value === 'string') {
      return this.createTextNode(value, location);
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return this.createLiteralNode(value, location);
    }
    if (Array.isArray(value)) {
      return {
        type: 'array',
        items: value.map(item => this.createDataValue(item, location))
      };
    }
    if (value && typeof value === 'object') {
      const entries: DataObjectEntry[] = Object.entries(value as Record<string, unknown>).map(
        ([key, entryValue]) => ({
          type: 'pair',
          key,
          value: this.createDataValue(entryValue, location)
        })
      );
      return { type: 'object', entries };
    }
    return this.createTextNode(String(value), location);
  }

  private createLocation(): ExecInvocation['location'] {
    return {
      start: { line: 1, column: 1, offset: 0 },
      end: { line: 1, column: 1, offset: 0 },
    };
  }

  private serializeResult(value: unknown): string {
    if (isStructuredValue(value)) {
      return asText(value);
    }

    if (value === null || value === undefined) {
      return '';
    }

    if (typeof value === 'string') {
      return value;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    if (Buffer.isBuffer(value)) {
      return value.toString('base64');
    }

    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
}
