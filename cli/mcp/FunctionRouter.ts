import { randomUUID } from 'crypto';
import type { ExecInvocation, TextNode, VariableReferenceNode, CommandReference, LiteralNode } from '@core/types';
import type { DataValue, DataObjectEntry } from '@core/types/var';
import type { ExecutableVariable, Variable } from '@core/types/variable';
import type { ToolCollection, ToolDefinition } from '@core/types/tools';
import type { SecurityDescriptor } from '@core/types/security';
import type { Environment } from '@interpreter/env/Environment';
import { evaluateExecInvocation } from '@interpreter/eval/exec-invocation';
import {
  hasDisplayProjectionTarget,
  renderDisplayProjection
} from '@interpreter/eval/records/display-projection';
import { normalizeExecutableDescriptor } from '@interpreter/eval/pipeline/command-execution/normalize-executable';
import { mcpNameToMlldName, mlldNameToMCPName } from '@core/mcp/names';
import {
  isAttestationLabel,
  makeSecurityDescriptor,
  normalizeSecurityDescriptor
} from '@core/types/security';
import {
  isFactSourceHandle,
  type FactSourceHandle
} from '@core/types/handle';
import { isFactProofLabel } from '@interpreter/security/proof-claims';
import { asData, asText, extractSecurityDescriptor, isStructuredValue } from '@interpreter/utils/structured-value';
import { extractVariableValue, isVariable } from '@interpreter/utils/variable-resolution';
import { PolicyEnforcer } from '@interpreter/policy/PolicyEnforcer';
import { descriptorToInputTaint } from '@interpreter/policy/label-flow-utils';
import {
  getCapturedModuleEnv,
  sealCapturedModuleEnv
} from '@interpreter/eval/import/variable-importer/executable/CapturedModuleEnvKeychain';

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

function isPositiveProofLabel(label: string): boolean {
  return isFactProofLabel(label) || isAttestationLabel(label);
}

export class FunctionRouter {
  private readonly environment: Environment;
  private readonly toolCollection?: ToolCollection;
  private readonly toolNames?: string[];
  private readonly toolNamesMcp: string[];
  private readonly toolKeyByMcpName?: Map<string, string>;
  private readonly toolNamesAreMcp: boolean;
  private conversationTaint?: SecurityDescriptor;

  constructor(options: FunctionRouterOptions) {
    this.environment = options.environment;
    this.toolCollection = options.toolCollection;
    this.toolNames = options.toolNames;
    this.toolNamesAreMcp = options.toolNamesAreMcp ?? false;
    this.conversationTaint = this.toConversationTaintDescriptor(options.conversationDescriptor);
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
      const invocationSecurity = this.buildInvocationSecurity(execVar, resolvedArgs, this.shouldUseObjectArgs(execVar));
      const invocation = this.buildInvocation(
        execName,
        execVar,
        resolvedArgs,
        toolKey,
        definition.labels,
        this.shouldUseObjectArgs(execVar),
        invocationSecurity.inputSecurityDescriptor,
        invocationSecurity.argSecurityDescriptors,
        invocationSecurity.argFactSourceDescriptors
      );
      const result = (await evaluateExecInvocation(invocation, this.environment)) as ExecResult;
      this.recordToolResultSecurity(result.value);

        this.environment.recordToolCall({
          ...callRecord,
          ok: true,
          result: this.toTrackedToolResult(result.value)
        });
        return await this.serializeResult(result.value);
      }

      const execName = toolKey;
      const variable = this.environment.getVariable(execName) as Variable | undefined;

      if (!variable || variable.type !== 'executable') {
        throw this.createToolNotFoundError(toolName);
      }

      const execVar = this.normalizeExecutableVariable(variable as ExecutableVariable);
      const invocationSecurity = this.buildInvocationSecurity(execVar, args, this.shouldUseObjectArgs(execVar));
      const invocation = this.buildInvocation(
        execName,
        execVar,
        args,
        toolName,
        undefined,
        this.shouldUseObjectArgs(execVar),
        invocationSecurity.inputSecurityDescriptor,
        invocationSecurity.argSecurityDescriptors,
        invocationSecurity.argFactSourceDescriptors
      );
      const result = (await evaluateExecInvocation(invocation, this.environment)) as ExecResult;
      this.recordToolResultSecurity(result.value);

      this.environment.recordToolCall({
        ...callRecord,
        ok: true,
        result: this.toTrackedToolResult(result.value)
      });
      return await this.serializeResult(result.value);
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

    const capturedModuleEnv =
      getCapturedModuleEnv(execVar.internal) ?? getCapturedModuleEnv(execVar);
    const internal: Record<string, unknown> = {
      ...(execVar.internal ?? {}),
      executableDef: execDef
    };

    if (capturedModuleEnv !== undefined) {
      sealCapturedModuleEnv(internal, capturedModuleEnv);
    }

    const normalized: ExecutableVariable = {
      ...execVar,
      value: execDef,
      internal: internal as ExecutableVariable['internal']
    };

    if (capturedModuleEnv !== undefined) {
      sealCapturedModuleEnv(normalized, capturedModuleEnv);
    }

    return normalized;
  }

  private buildInvocation(
    name: string,
    execVar: ExecutableVariable,
    args: Record<string, unknown>,
    operationName: string,
    toolLabels?: string[],
    argsAsObject?: boolean,
    inputSecurityDescriptor?: SecurityDescriptor,
    argSecurityDescriptors?: readonly (SecurityDescriptor | undefined)[],
    argFactSourceDescriptors?: readonly (readonly FactSourceHandle[] | undefined)[]
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
        ...(inputSecurityDescriptor ? { inputSecurityDescriptor } : {}),
        ...(argSecurityDescriptors?.some(Boolean) ? { argSecurityDescriptors } : {}),
        ...(argFactSourceDescriptors?.some(entry => Array.isArray(entry) && entry.length > 0)
          ? { argFactSourceDescriptors }
          : {})
      }
    } as ExecInvocation;
  }

  private buildToolCallSecurityDescriptor(): SecurityDescriptor | undefined {
    if (!this.conversationTaint) {
      return undefined;
    }
    const policyEnforcer = new PolicyEnforcer(this.environment.getPolicySummary());
    return (
      policyEnforcer.applyOutputPolicyLabels(this.conversationTaint, {
        inputTaint: descriptorToInputTaint(this.conversationTaint),
        exeLabels: ['llm']
      }) ?? this.conversationTaint
    );
  }

  private toConversationTaintDescriptor(
    descriptor: SecurityDescriptor | undefined
  ): SecurityDescriptor | undefined {
    const normalized = normalizeSecurityDescriptor(descriptor);
    if (!normalized) {
      return undefined;
    }
    const labels = normalized.labels.filter(label => !isPositiveProofLabel(label));
    const taint = descriptorToInputTaint(normalized)
      .filter(label => !isPositiveProofLabel(label));
    return makeSecurityDescriptor({
      labels,
      taint,
      sources: normalized.sources,
      tools: normalized.tools,
      policyContext: normalized.policyContext ?? undefined
    });
  }

  private recordToolResultSecurity(value: unknown): void {
    const descriptor = extractSecurityDescriptor(value, {
      recursive: true,
      mergeArrayElements: true
    });
    const normalizedTaintDescriptor = this.toConversationTaintDescriptor(descriptor);
    if (normalizedTaintDescriptor) {
      this.conversationTaint = this.conversationTaint
        ? this.environment.mergeSecurityDescriptors(this.conversationTaint, normalizedTaintDescriptor)
        : normalizedTaintDescriptor;
    }
  }

  private buildInvocationSecurity(
    execVar: ExecutableVariable,
    args: Record<string, unknown>,
    argsAsObject: boolean | undefined
  ): {
    inputSecurityDescriptor?: SecurityDescriptor;
    argSecurityDescriptors?: readonly (SecurityDescriptor | undefined)[];
    argFactSourceDescriptors?: readonly (readonly FactSourceHandle[] | undefined)[];
  } {
    const baseDescriptor = this.buildToolCallSecurityDescriptor();
    const argSecurityDescriptors = argsAsObject
      ? [this.buildValueSecurityDescriptor(args, baseDescriptor)]
      : this.buildArgumentSecurityDescriptorList(execVar, args, baseDescriptor);
    const argFactSourceDescriptors = argsAsObject
      ? [this.collectValueFactsources(args)]
      : this.buildArgumentFactSourceList(execVar, args);
    const presentDescriptors = argSecurityDescriptors.filter(
      (descriptor): descriptor is SecurityDescriptor => Boolean(descriptor)
    );
    const inputSecurityDescriptor =
      presentDescriptors.length === 0
        ? undefined
        : presentDescriptors.length === 1
          ? presentDescriptors[0]
          : this.environment.mergeSecurityDescriptors(...presentDescriptors);
    return {
      ...(inputSecurityDescriptor ? { inputSecurityDescriptor } : {}),
      ...(presentDescriptors.length > 0 ? { argSecurityDescriptors } : {}),
      ...(argFactSourceDescriptors.some(entry => Array.isArray(entry) && entry.length > 0)
        ? { argFactSourceDescriptors }
        : {})
    };
  }

  private buildArgumentFactSourceList(
    execVar: ExecutableVariable,
    args: Record<string, unknown>
  ): Array<readonly FactSourceHandle[] | undefined> {
    const params = Array.isArray(execVar.paramNames) ? execVar.paramNames : [];
    if (params.length === 0) {
      return [];
    }

    let lastProvidedIndex = -1;
    for (let i = params.length - 1; i >= 0; i -= 1) {
      if (Object.prototype.hasOwnProperty.call(args, params[i])) {
        lastProvidedIndex = i;
        break;
      }
    }
    if (lastProvidedIndex === -1) {
      return [];
    }

    const factsources: Array<readonly FactSourceHandle[] | undefined> = [];
    for (let index = 0; index <= lastProvidedIndex; index += 1) {
      factsources.push(this.collectValueFactsources(args[params[index]]));
    }
    return factsources;
  }

  private collectValueFactsources(
    value: unknown,
    seen = new Set<unknown>()
  ): readonly FactSourceHandle[] | undefined {
    const collected: FactSourceHandle[] = [];
    const pushFactsources = (candidate: unknown): void => {
      if (!Array.isArray(candidate)) {
        return;
      }
      for (const handle of candidate) {
        if (isFactSourceHandle(handle)) {
          collected.push({
            ...handle,
            ...(Array.isArray(handle.tiers) ? { tiers: Object.freeze([...handle.tiers]) } : {})
          });
        }
      }
    };

    const visit = (candidate: unknown): void => {
      if (!candidate || typeof candidate !== 'object') {
        return;
      }
      if (seen.has(candidate)) {
        return;
      }
      seen.add(candidate);

      if (isVariable(candidate)) {
        pushFactsources(candidate.mx?.factsources);
      }

      if (isStructuredValue(candidate)) {
        pushFactsources(candidate.metadata?.factsources);
        pushFactsources(candidate.mx?.factsources);
        visit(candidate.data);
        return;
      }

      const carrier = candidate as {
        mx?: { factsources?: readonly unknown[] };
        metadata?: { factsources?: readonly unknown[] };
      };
      pushFactsources(carrier.mx?.factsources);
      pushFactsources(carrier.metadata?.factsources);

      if (Array.isArray(candidate)) {
        for (const item of candidate) {
          visit(item);
        }
        return;
      }

      if (this.isPlainObject(candidate)) {
        for (const entry of Object.values(candidate)) {
          visit(entry);
        }
      }
    };

    visit(value);
    if (collected.length === 0) {
      return undefined;
    }

    const unique = new Map<string, FactSourceHandle>();
    for (const handle of collected) {
      const key =
        handle.instanceKey
          ? `${handle.sourceRef}:instance:${handle.instanceKey}`
          : handle.coercionId && handle.position !== undefined
            ? `${handle.sourceRef}:coercion:${handle.coercionId}:${handle.position}`
            : `${handle.ref}:unknown`;
      unique.set(key, handle);
    }
    return Array.from(unique.values());
  }

  private buildArgumentSecurityDescriptorList(
    execVar: ExecutableVariable,
    args: Record<string, unknown>,
    baseDescriptor?: SecurityDescriptor
  ): Array<SecurityDescriptor | undefined> {
    const params = Array.isArray(execVar.paramNames) ? execVar.paramNames : [];
    if (params.length === 0) {
      return [];
    }

    let lastProvidedIndex = -1;
    for (let i = params.length - 1; i >= 0; i -= 1) {
      if (Object.prototype.hasOwnProperty.call(args, params[i])) {
        lastProvidedIndex = i;
        break;
      }
    }
    if (lastProvidedIndex === -1) {
      return [];
    }

    const descriptors: Array<SecurityDescriptor | undefined> = [];
    for (let index = 0; index <= lastProvidedIndex; index += 1) {
      descriptors.push(this.buildValueSecurityDescriptor(args[params[index]], baseDescriptor));
    }
    return descriptors;
  }

  private buildValueSecurityDescriptor(
    value: unknown,
    baseDescriptor?: SecurityDescriptor
  ): SecurityDescriptor | undefined {
    const parts: SecurityDescriptor[] = [];
    if (baseDescriptor) {
      parts.push(baseDescriptor);
    }
    const descriptor = extractSecurityDescriptor(value, {
      recursive: true,
      mergeArrayElements: true
    });
    if (descriptor) {
      parts.push(descriptor);
    }

    if (parts.length === 0) {
      return undefined;
    }
    return parts.length === 1 ? parts[0] : this.environment.mergeSecurityDescriptors(...parts);
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

  private async serializeResult(value: unknown): Promise<string> {
    if (hasDisplayProjectionTarget(value)) {
      try {
        const projected = await renderDisplayProjection(value, this.environment, {
          toolCollection: this.toolCollection
        });
        return JSON.stringify(projected, null, 2);
      } catch {
        // Fall through to the existing serialization path so projection failures do not
        // silently drop a tool result on the floor.
      }
    }

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
