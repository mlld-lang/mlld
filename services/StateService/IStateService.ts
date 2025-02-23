import type { MeldNode } from 'meld-spec';
import type { IStateEventService } from '../StateEventService/IStateEventService.js';
import type { IStateTrackingService } from '../StateTrackingService/IStateTrackingService.js';

export interface IStateService {
  // Event system
  setEventService(eventService: IStateEventService): void;

  // State tracking
  setTrackingService(trackingService: IStateTrackingService): void;
  getStateId(): string | undefined;

  // Text variables
  getTextVar(name: string): string | undefined;
  setTextVar(name: string, value: string): void;
  getAllTextVars(): Map<string, string>;
  getLocalTextVars(): Map<string, string>;

  // Data variables
  getDataVar(name: string): unknown;
  setDataVar(name: string, value: unknown): void;
  getAllDataVars(): Map<string, unknown>;
  getLocalDataVars(): Map<string, unknown>;

  // Path variables
  getPathVar(name: string): string | undefined;
  setPathVar(name: string, value: string): void;
  getAllPathVars(): Map<string, string>;

  // Commands
  getCommand(name: string): { command: string; options?: Record<string, unknown> } | undefined;
  setCommand(name: string, command: string | { command: string; options?: Record<string, unknown> }): void;
  getAllCommands(): Map<string, { command: string; options?: Record<string, unknown> }>;

  // Nodes
  getNodes(): MeldNode[];
  addNode(node: MeldNode): void;
  appendContent(content: string): void;

  // Node transformation
  getTransformedNodes(): MeldNode[];
  setTransformedNodes(nodes: MeldNode[]): void;
  transformNode(original: MeldNode, transformed: MeldNode): void;
  isTransformationEnabled(): boolean;
  enableTransformation(enable: boolean): void;

  // Imports
  addImport(path: string): void;
  removeImport(path: string): void;
  hasImport(path: string): boolean;
  getImports(): Set<string>;

  // File path
  getCurrentFilePath(): string | null;
  setCurrentFilePath(path: string): void;

  // State management
  hasLocalChanges(): boolean;
  getLocalChanges(): string[];
  setImmutable(): void;
  readonly isImmutable: boolean;
  createChildState(): IStateService;
  mergeChildState(childState: IStateService): void;
  clone(): IStateService;
} 