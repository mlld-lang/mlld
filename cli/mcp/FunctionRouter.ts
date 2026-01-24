import { randomUUID } from 'crypto';
import type { ExecInvocation, TextNode, VariableReferenceNode, CommandReference, LiteralNode } from '@core/types';
import type { DataValue, DataObjectEntry } from '@core/types/var';
import type { ExecutableVariable, Variable } from '@core/types/variable';
import type { ToolCollection, ToolDefinition } from '@core/types/tools';
import type { Environment } from '@interpreter/env/Environment';
import { evaluateExecInvocation } from '@interpreter/eval/exec-invocation';
import { mcpNameToMlldName, mlldNameToMCPName } from '@core/mcp/names';
import { asData, asText, isStructuredValue } from '@interpreter/utils/structured-value';
import { extractVariableValue, isVariable } from '@interpreter/utils/variable-resolution';
import { makeSecurityDescriptor, type SecurityDescriptor } from '@core/types/security';

export interface FunctionRouterOptions {
  environment: Environment;
  toolCollection?: ToolCollection;
  toolNames?: string[];
  toolNamesAreMcp?: boolean;
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
  private readonly toolNames?: string[];
  private readonly toolNamesMcp: string[];
  private readonly toolKeyByMcpName?: Map<string, string>;
  private readonly toolNamesAreMcp: boolean;

  constructor(options: FunctionRouterOptions) {
    this.environment = options.environment;
    this.toolCollection = options.toolCollection;
    this.toolNames = options.toolNames;
    this.toolNamesAreMcp = options.toolNamesAreMcp ?? false;
    this.toolKeyByMcpName = this.toolCollection ? this.buildToolKeyMap(this.toolCollection) : undefined;
    if (this.toolCollection) {
      this.toolNamesMcp = Object.keys(this.toolCollection).map(name => mlldNameToMCPName(name));
    } else if (this.toolNames && this.toolNames.length > 0) {
      this.toolNamesMcp = this.toolNamesAreMcp
        ? [...this.toolNames]
        : this.toolNames.map(name => mlldNameToMCPName(name));
    } else {
      this.toolNamesMcp = [];
    }
  }

  async executeFunction(toolName: string, args: Record<string, unknown>): Promise<string> {
    this.syncToolsAvailability();
    const toolKey = this.resolveToolKey(toolName);
    if (!this.environment.isToolAllowed(toolKey, toolName)) {
      throw new Error(`Tool '${toolName}' not available`);
    }
    const callRecord = {
      name: toolName,
      arguments: { ...args },
      timestamp: Date.now()
    };

    try {
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
      const resolvedArgs = await this.resolveToolArgs(execVar, args, definition, toolName);
      const invocation = this.buildInvocation(
        execName,
        execVar,
        resolvedArgs,
        toolKey,
        definition.labels,
        this.shouldUseObjectArgs(execVar)
      );
      const result = (await evaluateExecInvocation(invocation, this.environment)) as ExecResult;

        this.environment.recordToolCall({ ...callRecord, ok: true });
        return this.serializeResult(result.value);
      }

      const execName = toolKey;
      const variable = this.environment.getVariable(execName) as Variable | undefined;

      if (!variable || variable.type !== 'executable') {
        throw new Error(`Tool '${toolName}' not found`);
      }

      const execVar = variable as ExecutableVariable;
      const invocation = this.buildInvocation(
        execName,
        execVar,
        args,
        toolKey,
        undefined,
        this.shouldUseObjectArgs(execVar)
      );
      const result = (await evaluateExecInvocation(invocation, this.environment)) as ExecResult;

      this.environment.recordToolCall({ ...callRecord, ok: true });
      return this.serializeResult(result.value);
    } catch (error) {
      this.environment.recordToolCall({
        ...callRecord,
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  private syncToolsAvailability(): void {
    if (!this.toolNamesMcp || this.toolNamesMcp.length === 0) {
      return;
    }
    const allowed: string[] = [];
    const denied: string[] = [];
    for (const mcpName of this.toolNamesMcp) {
      const toolKey = this.resolveToolKey(mcpName);
      if (this.environment.isToolAllowed(toolKey, mcpName)) {
        allowed.push(mcpName);
      } else {
        denied.push(mcpName);
      }
    }
    this.environment.setToolsAvailability(allowed, denied);
  }

  private resolveToolKey(toolName: string): string {
    if (this.toolKeyByMcpName) {
      return this.toolKeyByMcpName.get(toolName)
        ?? this.toolKeyByMcpName.get(mlldNameToMCPName(toolName))
        ?? mcpNameToMlldName(toolName);
    }
    return mcpNameToMlldName(toolName);
  }

  private buildToolKeyMap(collection: ToolCollection): Map<string, string> {
    const map = new Map<string, string>();
    for (const key of Object.keys(collection)) {
      const mcpName = mlldNameToMCPName(key);
      map.set(mcpName, key);
      map.set(key, key);
    }
    return map;
  }

  private buildInvocation(
    name: string,
    execVar: ExecutableVariable,
    args: Record<string, unknown>,
    sourceName?: string,
    toolLabels?: string[],
    argsAsObject?: boolean
  ): ExecInvocation {
    const location = this.createLocation();
    const identifierNode = this.createVariableReferenceNode(name, location);
    const argNodes = argsAsObject
      ? [this.createDataValue(args, location)]
      : this.createArgumentNodes(execVar, args, location);

    const commandRef: SyntheticCommandReference = {
      type: 'CommandReference',
      nodeId: randomUUID(),
      location,
      identifier: [identifierNode],
      name,
      args: argNodes,
    };

    const mcpSecurityDescriptor = this.createMcpSecurityDescriptor(sourceName ?? name);

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

  private shouldUseObjectArgs(execVar: ExecutableVariable): boolean {
    return execVar.internal?.mcpTool?.argumentMode === 'object';
  }

  private createMcpSecurityDescriptor(toolName: string): SecurityDescriptor {
    return makeSecurityDescriptor({
      taint: ['src:mcp'],
      sources: [`mcp:${toolName}`]
    });
  }

  private async resolveToolArgs(
    execVar: ExecutableVariable,
    args: Record<string, unknown>,
    definition: ToolDefinition,
    toolName: string
  ): Promise<Record<string, unknown>> {
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

    const extractedBound: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(bound)) {
      extractedBound[key] = await this.resolveBoundValue(value);
    }

    return { ...extractedBound, ...args };
  }

  private async resolveBoundValue(value: unknown): Promise<unknown> {
    if (isVariable(value)) {
      return await extractVariableValue(value, this.environment);
    }
    if (isStructuredValue(value)) {
      return asData(value);
    }
    if (Array.isArray(value)) {
      const items = [];
      for (const item of value) {
        items.push(await this.resolveBoundValue(item));
      }
      return items;
    }
    if (this.isPlainObject(value)) {
      const result: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(value)) {
        result[key] = await this.resolveBoundValue(entry);
      }
      return result;
    }
    return value;
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
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
