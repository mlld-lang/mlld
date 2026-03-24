import { randomUUID } from 'crypto';
import type { ExecInvocation, TextNode, VariableReferenceNode, CommandReference, LiteralNode } from '@core/types';
import type { DataValue, DataObjectEntry } from '@core/types/var';
import type { ExecutableVariable, Variable } from '@core/types/variable';
import type { ToolCollection, ToolDefinition } from '@core/types/tools';
import type { SecurityDescriptor } from '@core/types/security';
import type { Environment } from '@interpreter/env/Environment';
import { evaluateExecInvocation } from '@interpreter/eval/exec-invocation';
import { normalizeExecutableDescriptor } from '@interpreter/eval/pipeline/command-execution/normalize-executable';
import { mcpNameToMlldName, mlldNameToMCPName } from '@core/mcp/names';
import { normalizeSecurityDescriptor } from '@core/types/security';
import { asData, asText, extractSecurityDescriptor, isStructuredValue } from '@interpreter/utils/structured-value';
import { extractVariableValue, isVariable } from '@interpreter/utils/variable-resolution';
import { PolicyEnforcer } from '@interpreter/policy/PolicyEnforcer';
import { descriptorToInputTaint } from '@interpreter/policy/label-flow-utils';

export interface FunctionRouterOptions {
  environment: Environment;
  toolCollection?: ToolCollection;
  toolNames?: string[];
  toolNamesAreMcp?: boolean;
  conversationDescriptor?: SecurityDescriptor;
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
  private conversationDescriptor?: SecurityDescriptor;

  constructor(options: FunctionRouterOptions) {
    this.environment = options.environment;
    this.toolCollection = options.toolCollection;
    this.toolNames = options.toolNames;
    this.toolNamesAreMcp = options.toolNamesAreMcp ?? false;
    this.conversationDescriptor = normalizeSecurityDescriptor(options.conversationDescriptor);
    if (this.toolCollection) {
      this.toolKeyByMcpName = this.buildToolKeyMap(this.toolCollection);
      this.toolNamesMcp = Object.keys(this.toolCollection).map(name => mlldNameToMCPName(name));
    } else if (this.toolNames && this.toolNames.length > 0) {
      this.toolKeyByMcpName = this.buildToolNameKeyMap(this.toolNames, this.toolNamesAreMcp);
      this.toolNamesMcp = this.toolNamesAreMcp
        ? [...this.toolNames]
        : this.toolNames.map(name => mlldNameToMCPName(name));
    } else {
      this.toolKeyByMcpName = undefined;
      this.toolNamesMcp = [];
    }
  }

  async executeFunction(toolName: string, args: Record<string, unknown>): Promise<string> {
    this.syncToolsAvailability();
    this.ensureToolExists(toolName);
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
      const toolCallSecurity = this.buildToolCallSecurityDescriptor();
      if (this.toolCollection) {
        const definition = this.toolCollection[toolKey];
        if (!definition?.mlld) {
          throw this.createToolNotFoundError(toolName);
        }
        const execName = definition.mlld;
        const variable = this.environment.getVariable(execName) as Variable | undefined;

        if (!variable || variable.type !== 'executable') {
          throw this.createToolNotFoundError(toolName);
      }

      const execVar = this.normalizeExecutableVariable(variable as ExecutableVariable);
      const resolvedArgs = await this.resolveToolArgs(execVar, args, definition, toolName);
      const invocation = this.buildInvocation(
        execName,
        execVar,
        resolvedArgs,
        toolKey,
        definition.labels,
        this.shouldUseObjectArgs(execVar),
        toolCallSecurity
      );
      const result = (await evaluateExecInvocation(invocation, this.environment)) as ExecResult;
      this.mergeConversationDescriptor(
        extractSecurityDescriptor(result.value, { recursive: true, mergeArrayElements: true })
      );

        this.environment.recordToolCall({
          ...callRecord,
          ok: true,
          result: this.toTrackedToolResult(result.value)
        });
        return this.serializeResult(result.value);
      }

      const execName = toolKey;
      const variable = this.environment.getVariable(execName) as Variable | undefined;

      if (!variable || variable.type !== 'executable') {
        throw this.createToolNotFoundError(toolName);
      }

      const execVar = this.normalizeExecutableVariable(variable as ExecutableVariable);
      const invocation = this.buildInvocation(
        execName,
        execVar,
        args,
        toolName,
        undefined,
        this.shouldUseObjectArgs(execVar),
        toolCallSecurity
      );
      const result = (await evaluateExecInvocation(invocation, this.environment)) as ExecResult;
      this.mergeConversationDescriptor(
        extractSecurityDescriptor(result.value, { recursive: true, mergeArrayElements: true })
      );

      this.environment.recordToolCall({
        ...callRecord,
        ok: true,
        result: this.toTrackedToolResult(result.value)
      });
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

  private buildToolNameKeyMap(toolNames: string[], areMcp: boolean): Map<string, string> {
    const map = new Map<string, string>();
    for (const name of toolNames) {
      const mcpName = areMcp ? name : mlldNameToMCPName(name);
      map.set(mcpName, name);
      map.set(name, name);
    }
    return map;
  }

  private ensureToolExists(toolName: string): void {
    if (this.toolNamesMcp.length === 0) {
      return;
    }

    if (!this.toolNamesMcp.includes(toolName)) {
      throw this.createToolNotFoundError(toolName);
    }
  }

  private createToolNotFoundError(toolName: string): Error {
    const suggestion = this.findToolNameSuggestion(toolName);
    if (suggestion) {
      return new Error(`Tool not found: '${toolName}'. Did you mean '${suggestion}'?`);
    }
    return new Error(`Tool not found: '${toolName}'`);
  }

  private findToolNameSuggestion(toolName: string): string | null {
    if (this.toolNamesMcp.length === 0) {
      return null;
    }

    const directSnake = mlldNameToMCPName(toolName);
    if (directSnake !== toolName && this.toolNamesMcp.includes(directSnake)) {
      return directSnake;
    }

    const camelCandidate = mcpNameToMlldName(toolName);
    const snakeFromCamel = mlldNameToMCPName(camelCandidate);
    if (snakeFromCamel !== toolName && this.toolNamesMcp.includes(snakeFromCamel)) {
      return snakeFromCamel;
    }

    return null;
  }

  private normalizeExecutableVariable(execVar: ExecutableVariable): ExecutableVariable {
    const { execDef } = normalizeExecutableDescriptor(execVar as any);
    if (!execDef || execDef === execVar.internal?.executableDef) {
      return execVar;
    }

    return {
      ...execVar,
      value: execDef,
      internal: {
        ...(execVar.internal ?? {}),
        executableDef: execDef
      }
    };
  }

  private buildInvocation(
    name: string,
    execVar: ExecutableVariable,
    args: Record<string, unknown>,
    operationName: string,
    toolLabels?: string[],
    argsAsObject?: boolean,
    inputSecurityDescriptor?: SecurityDescriptor
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

    return {
      type: 'ExecInvocation',
      nodeId: randomUUID(),
      location,
      commandRef,
      meta: {
        toolCallTracking: 'router',
        toolOperationName: operationName,
        ...(toolLabels && toolLabels.length > 0 ? { mcpToolLabels: toolLabels } : {}),
        ...(inputSecurityDescriptor ? { inputSecurityDescriptor } : {})
      }
    } as ExecInvocation;
  }

  private buildToolCallSecurityDescriptor(): SecurityDescriptor | undefined {
    if (!this.conversationDescriptor) {
      return undefined;
    }
    const policyEnforcer = new PolicyEnforcer(this.environment.getPolicySummary());
    return (
      policyEnforcer.applyOutputPolicyLabels(this.conversationDescriptor, {
        inputTaint: descriptorToInputTaint(this.conversationDescriptor),
        exeLabels: ['llm']
      }) ?? this.conversationDescriptor
    );
  }

  private mergeConversationDescriptor(descriptor: SecurityDescriptor | undefined): void {
    const normalized = normalizeSecurityDescriptor(descriptor);
    if (!normalized) {
      return;
    }
    this.conversationDescriptor = this.conversationDescriptor
      ? this.environment.mergeSecurityDescriptors(this.conversationDescriptor, normalized)
      : normalized;
  }

  private shouldUseObjectArgs(execVar: ExecutableVariable): boolean {
    return execVar.internal?.mcpTool?.argumentMode === 'object';
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
    const optionalSet = new Set(Array.isArray(definition.optional) ? definition.optional : []);
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
      const required = exposed.filter(key => !optionalSet.has(key));
      const missing = required.filter(key => !Object.prototype.hasOwnProperty.call(args, key));
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

  private toTrackedToolResult(value: unknown): unknown {
    if (isStructuredValue(value)) {
      return asData(value);
    }
    return value;
  }
}
