import type { MeldNode } from '@core/syntax/types.js';
import { injectable } from 'tsyringe';
import { Service } from '@core/ServiceProvider.js';

/**
 * Mock implementation of a state object for testing interpreters
 */
@injectable()
@Service('MockInterpreterState for testing')
export class InterpreterState {
  private nodes: MeldNode[] = [];
  private textVars: Map<string, string> = new Map();
  private dataVars: Map<string, any> = new Map();
  private commands: Map<string, string> = new Map();
  private imports: Set<string> = new Set();

  constructor() {
    // Empty constructor for DI compatibility
  }

  addNode(node: MeldNode): void {
    this.nodes.push(node);
  }

  getNodes(): MeldNode[] {
    return this.nodes;
  }

  setText(name: string, value: string): void {
    this.textVars.set(name, value);
  }

  getText(name: string): string | undefined {
    return this.textVars.get(name);
  }

  setData(name: string, value: any): void {
    this.dataVars.set(name, value);
  }

  getData(name: string): any {
    return this.dataVars.get(name);
  }

  setCommand(name: string, command: string): void {
    this.commands.set(name, command);
  }

  getCommand(name: string): string | undefined {
    return this.commands.get(name);
  }

  addImport(path: string): void {
    this.imports.add(path);
  }

  hasImport(path: string): boolean {
    return this.imports.has(path);
  }

  getAllTextVars(): Map<string, string> {
    return new Map(this.textVars);
  }

  getAllDataVars(): Map<string, any> {
    return new Map(this.dataVars);
  }

  getAllCommands(): Map<string, string> {
    return new Map(this.commands);
  }

  getTextVar(name: string): string | undefined {
    return this.textVars.get(name);
  }

  setTextVar(name: string, value: string): void {
    this.textVars.set(name, value);
  }

  getDataVar(name: string): any {
    return this.dataVars.get(name);
  }

  setDataVar(name: string, value: any): void {
    this.dataVars.set(name, value);
  }
} 