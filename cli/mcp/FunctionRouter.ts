import { randomUUID } from 'crypto';
import type { ExecInvocation, TextNode, VariableReferenceNode, CommandReference } from '@core/types';
import type { ExecutableVariable, Variable } from '@core/types/variable';
import type { Environment } from '@interpreter/env/Environment';
import { evaluateExecInvocation } from '@interpreter/eval/exec-invocation';
import { mcpNameToMlldName } from './SchemaGenerator';
import { asText, isStructuredValue } from '@interpreter/utils/structured-value';
import { makeSecurityDescriptor, type SecurityDescriptor } from '@core/types/security';

export interface FunctionRouterOptions {
  environment: Environment;
}

interface ExecResult {
  value: unknown;
}

type SyntheticCommandReference = Omit<CommandReference, 'identifier' | 'args'> & {
  identifier: VariableReferenceNode[];
  args?: TextNode[];
  name: string;
};

export class FunctionRouter {
  private readonly environment: Environment;

  constructor(options: FunctionRouterOptions) {
    this.environment = options.environment;
  }

  async executeFunction(toolName: string, args: Record<string, unknown>): Promise<string> {
    const mlldName = mcpNameToMlldName(toolName);
    const variable = this.environment.getVariable(mlldName) as Variable | undefined;

    if (!variable || variable.type !== 'executable') {
      throw new Error(`Tool '${toolName}' not found`);
    }

    const execVar = variable as ExecutableVariable;
    const invocation = this.buildInvocation(mlldName, execVar, args);
    const result = (await evaluateExecInvocation(invocation, this.environment)) as ExecResult;

    return this.serializeResult(result.value);
  }

  private buildInvocation(
    name: string,
    execVar: ExecutableVariable,
    args: Record<string, unknown>
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

    const mcpSecurityDescriptor = this.createMcpSecurityDescriptor(name);

    return {
      type: 'ExecInvocation',
      nodeId: randomUUID(),
      location,
      commandRef,
      meta: {
        mcpSecurity: mcpSecurityDescriptor
      }
    } as ExecInvocation;
  }

  private createMcpSecurityDescriptor(toolName: string): SecurityDescriptor {
    return makeSecurityDescriptor({
      labels: ['untrusted'],
      taint: ['src:mcp'],
      sources: [`mcp:${toolName}`]
    });
  }

  private createArgumentNodes(
    execVar: ExecutableVariable,
    args: Record<string, unknown>,
    location: ExecInvocation['location']
  ): TextNode[] {
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

    const nodes: TextNode[] = [];
    for (let i = 0; i <= lastProvidedIndex; i++) {
      const paramName = params[i];
      if (!Object.prototype.hasOwnProperty.call(args, paramName)) {
        throw new Error(`Parameter '${paramName}' is required`);
      }
      nodes.push(this.createTextNode(String(args[paramName]), location));
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
