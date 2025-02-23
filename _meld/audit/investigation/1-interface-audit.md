# Interface & Implementation Audit

# Meld Codebase Audit

This is part of a systematic audit of the Meld codebase, focusing on transformation issues, state management bugs, and service implementation mismatches.

## FORMATTING REQUIREMENTS

- Use markdown tables for comparisons
- Use code blocks with language tags
- Include line numbers for all code references
- Format method signatures consistently
- Separate sections with clear headers
- Include evidence for all findings

## ANALYSIS REQUIREMENTS

- Base all findings on concrete evidence from the code
- Do not make assumptions without supporting code
- Highlight any contradictions found
- Note any missing or incomplete implementations
- Identify patterns across multiple files
- Flag any potential architectural issues  ## CODE ANALYSIS INSTRUCTIONS

1. INTERFACE ANALYSIS
   - Check method signatures match exactly
   - Verify parameter types and return types
   - Confirm optional parameters are consistent
   - Note any documentation mismatches

2. IMPLEMENTATION ANALYSIS
   - Verify all interface methods are implemented
   - Check for extra methods not in interface
   - Confirm implementation behavior matches docs
   - Note any partial or incomplete implementations

3. MOCK ANALYSIS
   - Compare mock methods to real implementations
   - Check mock return types match interface
   - Verify mock behavior in test scenarios
   - Note any missing or incomplete mock methods

4. TEST COVERAGE
   - Check which methods are actually tested
   - Note any untested code paths
   - Verify test assertions match requirements
   - Flag any inconsistent test behavior

IMPORTANT: Always check both the interface definition AND its usage in the codebase. Methods may be used that aren't properly defined in the interface.

## CODE TO ANALYZE

\=== STATE SERVICE INTERFACE AND IMPLEMENTATION ===

Processing...# IStateService.ts

## Content
```typescript
import type { MeldNode } from 'meld-spec';

export interface IStateService {
  // Text variables
  getTextVar(name: string): string | undefined;
  setTextVar(name: string, value: string): void;
  getAllTextVars(): Map<string, string>;
  getLocalTextVars(): Map<string, string>;

  // Data variables
  getDataVar(name: string): any;
  setDataVar(name: string, value: any): void;
  getAllDataVars(): Map<string, any>;
  getLocalDataVars(): Map<string, any>;

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

  // Node transformation (new)
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
```
# StateService.ts

## Functions
- StateService
- StateService.constructor
- StateService.getTextVar
- StateService.setTextVar
- StateService.getAllTextVars
- StateService.getLocalTextVars
- StateService.getDataVar
- StateService.setDataVar
- StateService.getAllDataVars
- StateService.getLocalDataVars
- StateService.getPathVar
- StateService.setPathVar
- StateService.getAllPathVars
- StateService.getCommand
- StateService.setCommand
- StateService.getAllCommands
- StateService.getNodes
- StateService.getTransformedNodes
- StateService.setTransformedNodes
- StateService.addNode
- StateService.transformNode
- StateService.isTransformationEnabled
- StateService.enableTransformation
- StateService.appendContent
- StateService.addImport
- StateService.removeImport
- StateService.hasImport
- StateService.getImports
- StateService.getCurrentFilePath
- StateService.setCurrentFilePath
- StateService.hasLocalChanges
- StateService.getLocalChanges
- StateService.setImmutable
- StateService.createChildState
- StateService.mergeChildState
- StateService.clone
- StateService.checkMutable
- StateService.updateState

## Content
```typescript
import type { MeldNode, TextNode } from 'meld-spec';
import { stateLogger as logger } from '@core/utils/logger.js';
import type { IStateService } from './IStateService.js';
import type { StateNode, CommandDefinition } from './types.js';
import { StateFactory } from './StateFactory.js';

export class StateService implements IStateService {
  private stateFactory: StateFactory;
  private currentState: StateNode;
  private _isImmutable: boolean = false;
  private _transformationEnabled: boolean = false;

  constructor(parentState?: IStateService) {
    this.stateFactory = new StateFactory();
    this.currentState = this.stateFactory.createState({
      source: 'constructor',
      parentState: parentState ? (parentState as StateService).currentState : undefined
    });
  }

  // Text variables
  getTextVar(name: string): string | undefined {
    return this.currentState.variables.text.get(name);
  }

  setTextVar(name: string, value: string): void {
    this.checkMutable();
    const text = new Map(this.currentState.variables.text);
    text.set(name, value);
    this.updateState({
      variables: {
        ...this.currentState.variables,
        text
      }
    }, `setTextVar:${name}`);
  }

  getAllTextVars(): Map<string, string> {
    return new Map(this.currentState.variables.text);
  }

  getLocalTextVars(): Map<string, string> {
    return new Map(this.currentState.variables.text);
  }

  // Data variables
  getDataVar(name: string): unknown {
    return this.currentState.variables.data.get(name);
  }

  setDataVar(name: string, value: unknown): void {
    this.checkMutable();
    const data = new Map(this.currentState.variables.data);
    data.set(name, value);
    this.updateState({
      variables: {
        ...this.currentState.variables,
        data
      }
    }, `setDataVar:${name}`);
  }

  getAllDataVars(): Map<string, unknown> {
    return new Map(this.currentState.variables.data);
  }

  getLocalDataVars(): Map<string, unknown> {
    return new Map(this.currentState.variables.data);
  }

  // Path variables
  getPathVar(name: string): string | undefined {
    return this.currentState.variables.path.get(name);
  }

  setPathVar(name: string, value: string): void {
    this.checkMutable();
    const path = new Map(this.currentState.variables.path);
    path.set(name, value);
    this.updateState({
      variables: {
        ...this.currentState.variables,
        path
      }
    }, `setPathVar:${name}`);
  }

  getAllPathVars(): Map<string, string> {
    return new Map(this.currentState.variables.path);
  }

  // Commands
  getCommand(name: string): { command: string; options?: Record<string, unknown> } | undefined {
    const cmd = this.currentState.commands.get(name);
    if (!cmd) return undefined;
    return {
      command: cmd.command,
      options: cmd.options ? { ...cmd.options } : undefined
    };
  }

  setCommand(name: string, command: string | { command: string; options?: Record<string, unknown> }): void {
    this.checkMutable();
    const commands = new Map(this.currentState.commands);
    const cmdDef: CommandDefinition = typeof command === 'string'
      ? { command }
      : { command: command.command, options: command.options };
    commands.set(name, cmdDef);
    this.updateState({ commands }, `setCommand:${name}`);
  }

  getAllCommands(): Map<string, { command: string; options?: Record<string, unknown> }> {
    const commands = new Map<string, { command: string; options?: Record<string, unknown> }>();
    for (const [name, cmd] of this.currentState.commands) {
      commands.set(name, {
        command: cmd.command,
        options: cmd.options ? { ...cmd.options } : undefined
      });
    }
    return commands;
  }

  // Nodes
  getNodes(): MeldNode[] {
    return [...this.currentState.nodes];
  }

  getTransformedNodes(): MeldNode[] {
    return this.currentState.transformedNodes ? [...this.currentState.transformedNodes] : [...this.currentState.nodes];
  }

  setTransformedNodes(nodes: MeldNode[]): void {
    this.checkMutable();
    this.updateState({
      transformedNodes: [...nodes]
    }, 'setTransformedNodes');
  }

  addNode(node: MeldNode): void {
    this.checkMutable();
    const updates: Partial<StateNode> = {
      nodes: [...this.currentState.nodes, node]
    };

    updates.transformedNodes = [
      ...(this.currentState.transformedNodes || this.currentState.nodes),
      node
    ];

    this.updateState(updates, 'addNode');
  }

  transformNode(original: MeldNode, transformed: MeldNode): void {
    this.checkMutable();
    if (!this._transformationEnabled) {
      return;
    }

    const transformedNodes = this.currentState.transformedNodes || this.currentState.nodes;
    const index = transformedNodes.findIndex(node => node === original);
    if (index === -1) {
      throw new Error('Cannot transform node: original node not found');
    }

    const updatedNodes = [...transformedNodes];
    updatedNodes[index] = transformed;
    this.updateState({
      transformedNodes: updatedNodes
    }, 'transformNode');
  }

  isTransformationEnabled(): boolean {
    return this._transformationEnabled;
  }

  enableTransformation(enable: boolean): void {
    if (this._transformationEnabled === enable) {
      return;
    }
    this._transformationEnabled = enable;

    // Initialize transformed nodes if enabling
    if (enable) {
      // Always initialize with a fresh copy of nodes, even if transformedNodes already exists
      this.updateState({
        transformedNodes: [...this.currentState.nodes]
      }, 'enableTransformation');
    }
  }

  appendContent(content: string): void {
    this.checkMutable();
    // Create a text node and add it
    const node: MeldNode = {
      type: 'Text',
      content: content,
      location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } }
    } as TextNode;
    this.addNode(node);
  }

  // Imports
  addImport(path: string): void {
    this.checkMutable();
    const imports = new Set(this.currentState.imports);
    imports.add(path);
    this.updateState({ imports }, `addImport:${path}`);
  }

  removeImport(path: string): void {
    this.checkMutable();
    const imports = new Set(this.currentState.imports);
    imports.delete(path);
    this.updateState({ imports }, `removeImport:${path}`);
  }

  hasImport(path: string): boolean {
    return this.currentState.imports.has(path);
  }

  getImports(): Set<string> {
    return new Set(this.currentState.imports);
  }

  // File path
  getCurrentFilePath(): string | null {
    return this.currentState.filePath ?? null;
  }

  setCurrentFilePath(path: string): void {
    this.checkMutable();
    this.updateState({ filePath: path }, 'setCurrentFilePath');
  }

  // State management
  hasLocalChanges(): boolean {
    return true; // In immutable model, any non-empty state has local changes
  }

  getLocalChanges(): string[] {
    return ['state']; // In immutable model, the entire state is considered changed
  }

  setImmutable(): void {
    this._isImmutable = true;
  }

  get isImmutable(): boolean {
    return this._isImmutable;
  }

  createChildState(): IStateService {
    const child = new StateService(this);
    logger.debug('Created child state', {
      parentPath: this.getCurrentFilePath(),
      childPath: child.getCurrentFilePath()
    });
    return child;
  }

  mergeChildState(childState: IStateService): void {
    this.checkMutable();
    const child = childState as StateService;
    this.currentState = this.stateFactory.mergeStates(this.currentState, child.currentState);
  }

  clone(): IStateService {
    const cloned = new StateService();

    // Create a completely new state without parent reference
    cloned.currentState = this.stateFactory.createState({
      source: 'clone',
      filePath: this.currentState.filePath
    });

    // Copy all state
    cloned.updateState({
      variables: {
        text: new Map(this.currentState.variables.text),
        data: new Map(this.currentState.variables.data),
        path: new Map(this.currentState.variables.path)
      },
      commands: new Map(this.currentState.commands),
      nodes: [...this.currentState.nodes],
      transformedNodes: this.currentState.transformedNodes ? [...this.currentState.transformedNodes] : undefined,
      imports: new Set(this.currentState.imports)
    }, 'clone');

    // Copy flags
    cloned._isImmutable = this._isImmutable;
    cloned._transformationEnabled = this._transformationEnabled;

    return cloned;
  }

  private checkMutable(): void {
    if (this._isImmutable) {
      throw new Error('Cannot modify immutable state');
    }
  }

  private updateState(updates: Partial<StateNode>, source: string): void {
    this.currentState = this.stateFactory.updateState(this.currentState, updates);
    logger.debug('Updated state', { source, updates });
  }
}
```

\=== USAGE IN PRODUCTION CODE ===

Processing...Processing....Processing.....Processing......# DirectiveService.ts

## Functions
- MeldLLMXMLError
- DirectiveService
- MeldLLMXMLError.constructor
- DirectiveService.constructor
- DirectiveService.initialize
- DirectiveService.registerDefaultHandlers
- DirectiveService.registerHandler
- DirectiveService.handleDirective
- DirectiveService.processDirectives
- DirectiveService.createContext
- DirectiveService.updateInterpreterService
- DirectiveService.hasHandler
- DirectiveService.validateDirective
- DirectiveService.createChildContext
- DirectiveService.supportsDirective
- DirectiveService.getSupportedDirectives
- DirectiveService.ensureInitialized
- DirectiveService.handleTextDirective
- DirectiveService.handleDataDirective
- DirectiveService.handleImportDirective
- DirectiveService.extractSection
- DirectiveService.calculateSimilarity
- DirectiveService.handleEmbedDirective
- DirectiveService.processDirective

## Content
```typescript
import type { DirectiveNode, DirectiveKind, DirectiveData } from 'meld-spec';
import { directiveLogger } from '../../core/utils/logger.js';
import { IDirectiveService, IDirectiveHandler, DirectiveContext } from './IDirectiveService.js';
import { IValidationService } from '@services/ValidationService/IValidationService.js';
import { IStateService } from '@services/StateService/IStateService.js';
import { IPathService } from '@services/PathService/IPathService.js';
import { IFileSystemService } from '@services/FileSystemService/IFileSystemService.js';
import { IParserService } from '@services/ParserService/IParserService.js';
import { IInterpreterService } from '@services/InterpreterService/IInterpreterService.js';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError.js';
import { ICircularityService } from '@services/CircularityService/ICircularityService.js';
import { IResolutionService } from '@services/ResolutionService/IResolutionService.js';
import { DirectiveError, DirectiveErrorCode } from './errors/DirectiveError.js';
import type { ILogger } from './handlers/execution/EmbedDirectiveHandler.js';

// Import all handlers
import { TextDirectiveHandler } from './handlers/definition/TextDirectiveHandler.js';
import { DataDirectiveHandler } from './handlers/definition/DataDirectiveHandler.js';
import { PathDirectiveHandler } from './handlers/definition/PathDirectiveHandler.js';
import { DefineDirectiveHandler } from './handlers/definition/DefineDirectiveHandler.js';
import { RunDirectiveHandler } from './handlers/execution/RunDirectiveHandler.js';
import { EmbedDirectiveHandler } from './handlers/execution/EmbedDirectiveHandler.js';
import { ImportDirectiveHandler } from './handlers/execution/ImportDirectiveHandler.js';

export class MeldLLMXMLError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'MeldLLMXMLError';
    Object.setPrototypeOf(this, MeldLLMXMLError.prototype);
  }
}

/**
 * Service responsible for handling directives
 */
export class DirectiveService implements IDirectiveService {
  private validationService?: IValidationService;
  private stateService?: IStateService;
  private pathService?: IPathService;
  private fileSystemService?: IFileSystemService;
  private parserService?: IParserService;
  private interpreterService?: IInterpreterService;
  private circularityService?: ICircularityService;
  private resolutionService?: IResolutionService;
  private initialized = false;
  private logger: ILogger;

  private handlers: Map<string, IDirectiveHandler> = new Map();

  constructor(logger?: ILogger) {
    this.logger = logger || directiveLogger;
  }

  initialize(
    validationService: IValidationService,
    stateService: IStateService,
    pathService: IPathService,
    fileSystemService: IFileSystemService,
    parserService: IParserService,
    interpreterService: IInterpreterService,
    circularityService: ICircularityService,
    resolutionService: IResolutionService
  ): void {
    this.validationService = validationService;
    this.stateService = stateService;
    this.pathService = pathService;
    this.fileSystemService = fileSystemService;
    this.parserService = parserService;
    this.interpreterService = interpreterService;
    this.circularityService = circularityService;
    this.resolutionService = resolutionService;
    this.initialized = true;

    // Register default handlers
    this.registerDefaultHandlers();

    this.logger.debug('DirectiveService initialized', {
      handlers: Array.from(this.handlers.keys())
    });
  }

  /**
   * Register all default directive handlers
   */
  public registerDefaultHandlers(): void {
    // Definition handlers
    this.registerHandler(
      new TextDirectiveHandler(
        this.validationService!,
        this.stateService!,
        this.resolutionService!
      )
    );

    this.registerHandler(
      new DataDirectiveHandler(
        this.validationService!,
        this.stateService!,
        this.resolutionService!
      )
    );

    this.registerHandler(
      new PathDirectiveHandler(
        this.validationService!,
        this.stateService!,
        this.resolutionService!
      )
    );

    this.registerHandler(
      new DefineDirectiveHandler(
        this.validationService!,
        this.stateService!,
        this.resolutionService!
      )
    );

    // Execution handlers
    this.registerHandler(
      new RunDirectiveHandler(
        this.validationService!,
        this.resolutionService!,
        this.stateService!,
        this.fileSystemService!
      )
    );

    this.registerHandler(
      new EmbedDirectiveHandler(
        this.validationService!,
        this.resolutionService!,
        this.stateService!,
        this.circularityService!,
        this.fileSystemService!,
        this.parserService!,
        this.interpreterService!,
        this.logger
      )
    );

    this.registerHandler(
      new ImportDirectiveHandler(
        this.validationService!,
        this.resolutionService!,
        this.stateService!,
        this.fileSystemService!,
        this.parserService!,
        this.interpreterService!,
        this.circularityService!
      )
    );
  }

  /**
   * Register a new directive handler
   */
  registerHandler(handler: IDirectiveHandler): void {
    if (!this.initialized) {
      throw new Error('DirectiveService must be initialized before registering handlers');
    }

    if (!handler.kind) {
      throw new Error('Handler must have a kind property');
    }

    this.handlers.set(handler.kind, handler);
    this.logger.debug(`Registered handler for directive: ${handler.kind}`);
  }

  /**
   * Handle a directive node
   */
  public async handleDirective(node: DirectiveNode, context: DirectiveContext): Promise<IStateService> {
    return this.processDirective(node, context);
  }

  /**
   * Process multiple directives in sequence
   */
  async processDirectives(nodes: DirectiveNode[], parentContext?: DirectiveContext): Promise<IStateService> {
    let currentState = parentContext?.state?.clone() || this.stateService!.createChildState();

    for (const node of nodes) {
      // Create a new context with the current state as parent and a new child state
      const nodeContext = {
        currentFilePath: parentContext?.currentFilePath || '',
        parentState: currentState,
        state: currentState.createChildState()
      };

      // Process directive and get the updated state
      const updatedState = await this.processDirective(node, nodeContext);

      // Merge the updated state back into the current state
      currentState.mergeChildState(updatedState);
    }

    return currentState;
  }

  /**
   * Create execution context for a directive
   */
  private createContext(node: DirectiveNode, parentContext?: DirectiveContext): DirectiveContext {
    return {
      currentFilePath: node.location?.start.line ? node.location.start.line.toString() : '',
      parentState: parentContext?.state,
      state: parentContext?.state?.clone() || this.stateService!.createChildState()
    };
  }

  /**
   * Update the interpreter service reference
   */
  updateInterpreterService(interpreterService: IInterpreterService): void {
    this.interpreterService = interpreterService;
    this.logger.debug('Updated interpreter service reference');
  }

  /**
   * Check if a handler exists for a directive kind
   */
  hasHandler(kind: string): boolean {
    return this.handlers.has(kind);
  }

  /**
   * Validate a directive node
   */
  async validateDirective(node: DirectiveNode): Promise<void> {
    try {
      await this.validationService!.validate(node);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorForLog = error instanceof Error ? error : new Error(String(error));

      this.logger.error('Failed to validate directive', {
        kind: node.directive.kind,
        location: node.location,
        error: errorForLog
      });

      throw new DirectiveError(
        errorMessage,
        node.directive.kind,
        DirectiveErrorCode.VALIDATION_FAILED,
        {
          node
        }
      );
    }
  }

  /**
   * Create a child context for nested directives
   */
  public createChildContext(parentContext: DirectiveContext, filePath: string): DirectiveContext {
    return {
      currentFilePath: filePath,
      state: parentContext.state.createChildState(),
      parentState: parentContext.state
    };
  }

  supportsDirective(kind: string): boolean {
    return this.handlers.has(kind);
  }

  getSupportedDirectives(): string[] {
    return Array.from(this.handlers.keys());
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('DirectiveService must be initialized before use');
    }
  }

  private async handleTextDirective(node: DirectiveNode): Promise<void> {
    const directive = node.directive;

    this.logger.debug('Processing text directive', {
      identifier: directive.identifier,
      location: node.location
    });

    try {
      // Value is already interpolated by meld-ast
      await this.stateService!.setTextVar(directive.identifier, directive.value);

      this.logger.debug('Text directive processed successfully', {
        identifier: directive.identifier,
        location: node.location
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorForLog = error instanceof Error ? error : new Error(String(error));

      this.logger.error('Failed to process text directive', {
        identifier: directive.identifier,
        location: node.location,
        error: errorForLog
      });

      throw new MeldDirectiveError(
        errorMessage,
        'text',
        node.location?.start
      );
    }
  }

  private async handleDataDirective(node: DirectiveNode): Promise<void> {
    const directive = node.directive;

    this.logger.debug('Processing data directive', {
      identifier: directive.identifier,
      location: node.location
    });

    try {
      // Value is already interpolated by meld-ast
      let value = directive.value;
      if (typeof value === 'string') {
        value = JSON.parse(value);
      }

      await this.stateService!.setDataVar(directive.identifier, value);

      this.logger.debug('Data directive processed successfully', {
        identifier: directive.identifier,
        location: node.location
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorForLog = error instanceof Error ? error : new Error(String(error));

      this.logger.error('Failed to process data directive', {
        identifier: directive.identifier,
        location: node.location,
        error: errorForLog
      });

      throw new MeldDirectiveError(
        errorMessage,
        'data',
        node.location?.start
      );
    }
  }

  private async handleImportDirective(node: DirectiveNode): Promise<void> {
    const directive = node.directive;

    this.logger.debug('Processing import directive', {
      path: directive.path,
      section: directive.section,
      fuzzy: directive.fuzzy,
      location: node.location
    });

    try {
      // Path is already interpolated by meld-ast
      const fullPath = await this.pathService!.resolvePath(directive.path);

      // Check for circular imports
      this.circularityService!.beginImport(fullPath);

      try {
        // Check if file exists
        if (!await this.fileSystemService!.exists(fullPath)) {
          throw new Error(`Import file not found: ${fullPath}`);
        }

        // Create a child state for the import
        const childState = await this.stateService!.createChildState();

        // Read the file content
        const content = await this.fileSystemService!.readFile(fullPath);

        // If a section is specified, extract it (section name is already interpolated)
        let processedContent = content;
        if (directive.section) {
          processedContent = await this.extractSection(
            content,
            directive.section,
            directive.fuzzy || 0
          );
        }

        // Parse and interpret the content
        const parsedNodes = await this.parserService!.parse(processedContent);
        await this.interpreterService!.interpret(parsedNodes, {
          initialState: childState,
          filePath: fullPath,
          mergeState: true
        });

        this.logger.debug('Import content processed', {
          path: fullPath,
          section: directive.section,
          location: node.location
        });
      } finally {
        // Always end import tracking, even if there was an error
        this.circularityService!.endImport(fullPath);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorForLog = error instanceof Error ? error : new Error(String(error));

      this.logger.error('Failed to process import directive', {
        path: directive.path,
        section: directive.section,
        location: node.location,
        error: errorForLog
      });

      throw new MeldDirectiveError(
        errorMessage,
        'import',
        node.location?.start
      );
    }
  }

  private async extractSection(
    content: string,
    section: string,
    fuzzyMatch: number
  ): Promise<string> {
    try {
      // Split content into lines
      const lines = content.split('\n');
      const headings: { title: string; line: number; level: number }[] = [];

      // Find all headings and their levels
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const match = line.match(/^(#{1,6})\s+(.+)$/);
        if (match) {
          headings.push({
            title: match[2],
            line: i,
            level: match[1].length
          });
        }
      }

      // Find best matching heading
      let bestMatch: typeof headings[0] | undefined;
      let bestScore = 0;

      for (const heading of headings) {
        const score = this.calculateSimilarity(heading.title, section);
        if (score > fuzzyMatch && score > bestScore) {
          bestScore = score;
          bestMatch = heading;
        }
      }

      if (!bestMatch) {
        // Find closest match for error message
        let closestMatch = '';
        let closestScore = 0;
        for (const heading of headings) {
          const score = this.calculateSimilarity(heading.title, section);
          if (score > closestScore) {
            closestScore = score;
            closestMatch = heading.title;
          }
        }

        throw new MeldLLMXMLError(
          'Section not found',
          'SECTION_NOT_FOUND',
          { title: section, bestMatch: closestMatch }
        );
      }

      // Find the end of the section (next heading of same or higher level)
      let endLine = lines.length;
      for (let i = bestMatch.line + 1; i < lines.length; i++) {
        const line = lines[i];
        const match = line.match(/^(#{1,6})\s+/);
        if (match && match[1].length <= bestMatch.level) {
          endLine = i;
          break;
        }
      }

      // Extract the section content
      return lines.slice(bestMatch.line, endLine).join('\n');
    } catch (error) {
      if (error instanceof MeldLLMXMLError) {
        throw error;
      }
      throw new MeldLLMXMLError(
        error instanceof Error ? error.message : 'Unknown error during section extraction',
        'PARSE_ERROR',
        error
      );
    }
  }

  private calculateSimilarity(str1: string, str2: string): number {
    // Convert strings to lowercase for case-insensitive comparison
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();

    if (s1 === s2) return 1.0;

    // Calculate Levenshtein distance
    const len1 = s1.length;
    const len2 = s2.length;
    const matrix: number[][] = [];

    for (let i = 0; i <= len1; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= len2; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }

    // Convert distance to similarity score between 0 and 1
    const maxLen = Math.max(len1, len2);
    return maxLen === 0 ? 1.0 : 1.0 - matrix[len1][len2] / maxLen;
  }

  private async handleEmbedDirective(node: DirectiveNode): Promise<void> {
    const directive = node.directive;

    this.logger.debug('Processing embed directive', {
      path: directive.path,
      section: directive.section,
      fuzzy: directive.fuzzy,
      names: directive.names,
      location: node.location
    });

    try {
      // Path is already interpolated by meld-ast
      const fullPath = await this.pathService!.resolvePath(directive.path);

      // Check for circular imports
      this.circularityService!.beginImport(fullPath);

      try {
        // Check if file exists
        if (!await this.fileSystemService!.exists(fullPath)) {
          throw new Error(`Embed file not found: ${fullPath}`);
        }

        // Create a child state for the import
        const childState = await this.stateService!.createChildState();

        // Read the file content
        const content = await this.fileSystemService!.readFile(fullPath);

        // If a section is specified, extract it (section name is already interpolated)
        let processedContent = content;
        if (directive.section) {
          processedContent = await this.extractSection(
            content,
            directive.section,
            directive.fuzzy || 0
          );
        }

        // Parse and interpret the content
        const parsedNodes = await this.parserService!.parse(processedContent);
        await this.interpreterService!.interpret(parsedNodes, {
          initialState: childState,
          filePath: fullPath,
          mergeState: true
        });

        this.logger.debug('Embed content processed', {
          path: fullPath,
          section: directive.section,
          location: node.location
        });
      } finally {
        // Always end import tracking, even if there was an error
        this.circularityService!.endImport(fullPath);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorForLog = error instanceof Error ? error : new Error(String(error));

      this.logger.error('Failed to process embed directive', {
        path: directive.path,
        section: directive.section,
        location: node.location,
        error: errorForLog
      });

      throw new MeldDirectiveError(
        errorMessage,
        'embed',
        node.location?.start
      );
    }
  }

  public async processDirective(node: DirectiveNode, context: DirectiveContext): Promise<IStateService> {
    this.ensureInitialized();

    try {
      if (!node.directive || !node.directive.kind) {
        throw new DirectiveError(
          'Invalid directive format',
          'unknown',
          DirectiveErrorCode.VALIDATION_FAILED,
          { node }
        );
      }

      const kind = node.directive.kind.toLowerCase();
      const handler = this.handlers.get(kind);

      if (!handler) {
        throw new DirectiveError(
          `Unknown directive kind: ${kind}`,
          kind,
          DirectiveErrorCode.HANDLER_NOT_FOUND,
          { node }
        );
      }

      if (typeof handler.execute !== 'function') {
        throw new DirectiveError(
          `Invalid handler for directive kind: ${kind}`,
          kind,
          DirectiveErrorCode.HANDLER_NOT_FOUND,
          { node }
        );
      }

      // Validate directive before handling
      await this.validateDirective(node);

      // Execute the directive
      return await handler.execute(node, context);
    } catch (error) {
      if (error instanceof DirectiveError) {
        throw error;
      }

      // Simplify error messages for common cases
      let message = error instanceof Error ? error.message : String(error);
      let code = DirectiveErrorCode.EXECUTION_FAILED;

      if (message.includes('file not found') || message.includes('no such file')) {
        message = `Referenced file not found: ${node.directive.path || node.directive.value}`;
        code = DirectiveErrorCode.FILE_NOT_FOUND;
      } else if (message.includes('circular import') || message.includes('circular reference')) {
        message = 'Circular import detected';
        code = DirectiveErrorCode.CIRCULAR_REFERENCE;
      } else if (message.includes('parameter count') || message.includes('wrong number of parameters')) {
        message = 'Invalid parameter count';
        code = DirectiveErrorCode.VALIDATION_FAILED;
      } else if (message.includes('invalid path') || message.includes('path validation failed')) {
        message = 'Invalid path';
        code = DirectiveErrorCode.VALIDATION_FAILED;
      }

      throw new DirectiveError(
        message,
        node.directive?.kind || 'unknown',
        code,
        { node, cause: error instanceof Error ? error : undefined }
      );
    }
  }
}
```
# IDirectiveService.ts

## Content
```typescript
import { DirectiveNode } from 'meld-spec';
import { IStateService } from '@services/StateService/IStateService.js';
import type { IValidationService } from '@services/ValidationService/IValidationService.js';
import type { IPathService } from '@services/PathService/IPathService.js';
import type { IFileSystemService } from '@services/FileSystemService/IFileSystemService.js';
import type { IParserService } from '@services/ParserService/IParserService.js';
import type { IInterpreterService } from '@services/InterpreterService/IInterpreterService.js';
import type { ICircularityService } from '@services/CircularityService/ICircularityService.js';
import type { IResolutionService } from '@services/ResolutionService/IResolutionService.js';

/**
 * Context for directive execution
 */
export interface DirectiveContext {
  /** Current file being processed */
  currentFilePath?: string;
  /** Parent state for nested contexts */
  parentState?: IStateService;
  /** Current state for this directive */
  state: IStateService;
  /** Working directory for command execution */
  workingDirectory?: string;
}

/**
 * Interface for directive handlers
 */
export interface IDirectiveHandler {
  /** The directive kind this handler processes */
  readonly kind: string;

  /**
   * Execute the directive
   * @returns The updated state after directive execution
   */
  execute(
    node: DirectiveNode,
    context: DirectiveContext
  ): Promise<IStateService>;
}

/**
 * Service responsible for handling directives
 */
export interface IDirectiveService {
  /**
   * Initialize the DirectiveService with required dependencies
   */
  initialize(
    validationService: IValidationService,
    stateService: IStateService,
    pathService: IPathService,
    fileSystemService: IFileSystemService,
    parserService: IParserService,
    interpreterService: IInterpreterService,
    circularityService: ICircularityService,
    resolutionService: IResolutionService
  ): void;

  /**
   * Update the interpreter service reference
   * This is needed to handle circular dependencies in initialization
   */
  updateInterpreterService(interpreterService: IInterpreterService): void;

  /**
   * Handle a directive node
   * @returns The updated state after directive execution
   */
  handleDirective(
    node: DirectiveNode,
    context: DirectiveContext
  ): Promise<IStateService>;

  /**
   * Register a new directive handler
   */
  registerHandler(handler: IDirectiveHandler): void;

  /**
   * Check if a handler exists for a directive kind
   */
  hasHandler(kind: string): boolean;

  /**
   * Validate a directive node
   */
  validateDirective(node: DirectiveNode): Promise<void>;

  /**
   * Create a child context for nested directives
   */
  createChildContext(
    parentContext: DirectiveContext,
    filePath: string
  ): DirectiveContext;

  /**
   * Process a directive node, validating and executing it
   * Values in the directive will already be interpolated by meld-ast
   * @returns The updated state after directive execution
   * @throws {MeldDirectiveError} If directive processing fails
   */
  processDirective(node: DirectiveNode, parentContext?: DirectiveContext): Promise<IStateService>;

  /**
   * Process multiple directive nodes in sequence
   * @returns The final state after processing all directives
   * @throws {MeldDirectiveError} If any directive processing fails
   */
  processDirectives(nodes: DirectiveNode[], parentContext?: DirectiveContext): Promise<IStateService>;

  /**
   * Check if a directive kind is supported
   */
  supportsDirective(kind: string): boolean;

  /**
   * Get a list of all supported directive kinds
   */
  getSupportedDirectives(): string[];
}
```
# DirectiveError.ts

## Functions
- DirectiveError
- DirectiveError.constructor
- DirectiveError.toJSON
- DirectiveError.getFullCauseMessage

## Content
```typescript
import { DirectiveNode } from 'meld-spec';
import { DirectiveContext } from '@services/DirectiveService/IDirectiveService.js';
import type { Location } from '@core/types/index.js';

/**
 * Error codes for directive failures
 */
export enum DirectiveErrorCode {
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  RESOLUTION_FAILED = 'RESOLUTION_FAILED',
  EXECUTION_FAILED = 'EXECUTION_FAILED',
  HANDLER_NOT_FOUND = 'HANDLER_NOT_FOUND',
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  CIRCULAR_REFERENCE = 'CIRCULAR_REFERENCE',
  VARIABLE_NOT_FOUND = 'VARIABLE_NOT_FOUND',
  STATE_ERROR = 'STATE_ERROR',
  INVALID_CONTEXT = 'INVALID_CONTEXT'
}

interface SerializedDirectiveError {
  name: string;
  message: string;
  kind: string;
  code: DirectiveErrorCode;
  location?: Location;
  filePath?: string;
  cause?: string;
  fullCauseMessage?: string;
}

/**
 * Error thrown when directive handling fails
 */
export class DirectiveError extends Error {
  public readonly location?: Location;
  public readonly filePath?: string;
  private readonly errorCause?: Error;

  constructor(
    message: string,
    public readonly kind: string,
    public readonly code: DirectiveErrorCode,
    public readonly details?: {
      node?: DirectiveNode;
      context?: DirectiveContext;
      cause?: Error;
      location?: Location;
      details?: {
        node?: DirectiveNode;
        location?: Location;
      };
    }
  ) {
    // Create message with location if available
    const loc = details?.location ?? details?.node?.location;
    const locationStr = loc ?
      ` at line ${loc.start.line}, column ${loc.start.column}` : '';
    const filePathStr = details?.context?.currentFilePath ?
      ` in ${details.context.currentFilePath}` : '';

    // Include cause message in the full error message if available
    const causeStr = details?.cause ? ` | Caused by: ${details.cause.message}` : '';

    super(`Directive error (${kind}): ${message}${locationStr}${filePathStr}${causeStr}`);
    this.name = 'DirectiveError';

    // Store essential properties
    this.location = details?.location ?? details?.node?.location;
    this.filePath = details?.context?.currentFilePath;
    this.errorCause = details?.cause;

    // Set cause property for standard error chaining
    if (details?.cause) {
      Object.defineProperty(this, 'cause', {
        value: details.cause,
        enumerable: true,
        configurable: true,
        writable: false
      });
    }

    // Ensure proper prototype chain
    Object.setPrototypeOf(this, DirectiveError.prototype);
  }

  // Add public getter for cause that ensures we always return the full error
  public get cause(): Error | undefined {
    return this.errorCause;
  }

  /**
   * Custom serialization to avoid circular references and include only essential info
   */
  toJSON(): SerializedDirectiveError {
    return {
      name: this.name,
      message: this.message,
      kind: this.kind,
      code: this.code,
      location: this.location,
      filePath: this.filePath,
      cause: this.errorCause?.message,
      fullCauseMessage: this.errorCause ? this.getFullCauseMessage(this.errorCause) : undefined
    };
  }

  /**
   * Helper to get the full cause message chain
   */
  private getFullCauseMessage(error: Error): string {
    let message = error.message;
    if ('cause' in error && error.cause instanceof Error) {
      message += ` | Caused by: ${this.getFullCauseMessage(error.cause)}`;
    }
    return message;
  }
}
```
# DataDirectiveHandler.ts

## Functions
- DataDirectiveHandler
- DataDirectiveHandler.constructor
- DataDirectiveHandler.execute
- DataDirectiveHandler.resolveObjectFields
- DataDirectiveHandler.validateSchema

## Content
```typescript
import { DirectiveNode } from 'meld-spec';
// TODO: Use meld-ast nodes and types instead of meld-spec directly
// TODO: Import MeldDirectiveError from core/errors for proper error hierarchy

import { IDirectiveHandler, DirectiveContext } from '@services/DirectiveService/IDirectiveService.js';
import { IValidationService } from '@services/ValidationService/IValidationService.js';
import { IStateService } from '@services/StateService/IStateService.js';
import { IResolutionService, ResolutionContext } from '@services/ResolutionService/IResolutionService.js';
import { ResolutionContextFactory } from '@services/ResolutionService/ResolutionContextFactory.js';
import { directiveLogger as logger } from '@core/utils/logger.js';
import { DirectiveError, DirectiveErrorCode } from '@services/DirectiveService/errors/DirectiveError.js';

/**
 * Handler for @data directives
 * Stores data values in state after resolving variables and processing embedded content
 */
export class DataDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'data';

  constructor(
    private validationService: IValidationService,
    private stateService: IStateService,
    private resolutionService: IResolutionService
  ) {}

  public async execute(node: DirectiveNode, context: DirectiveContext): Promise<IStateService> {
    await this.validationService.validate(node);

    const { identifier, value } = node.directive;
    const resolutionContext: ResolutionContext = {
      allowedVariableTypes: {
        text: true,
        data: true,
        path: true,
        command: true
      },
      currentFilePath: context.currentFilePath,
      state: context.state
    };

    try {
      let parsedValue: unknown;

      // Handle both string and object values
      if (typeof value === 'string') {
        // First resolve any variables in the JSON string
        const resolvedJsonString = await this.resolutionService.resolveInContext(value, resolutionContext);

        // Then parse the JSON
        try {
          parsedValue = JSON.parse(resolvedJsonString);
          // Recursively resolve any variables in the parsed object
          parsedValue = await this.resolveObjectFields(parsedValue, resolutionContext);
        } catch (error) {
          if (error instanceof Error) {
            throw new DirectiveError(
              `Invalid JSON in data directive: ${error.message}`,
              'data',
              DirectiveErrorCode.VALIDATION_FAILED,
              { node, context }
            );
          }
          throw error;
        }
      } else {
        // Value is already an object, resolve variables in it
        parsedValue = await this.resolveObjectFields(value, resolutionContext);
      }

      // Store the resolved value in a new state
      const newState = context.state.clone();
      newState.setDataVar(identifier, parsedValue);
      return newState;
    } catch (error) {
      if (error instanceof Error) {
        throw new DirectiveError(
          `Error processing data directive: ${error.message}`,
          'data',
          DirectiveErrorCode.EXECUTION_FAILED,
          { node, context }
        );
      }
      throw error;
    }
  }

  /**
   * Recursively resolve variables in object fields
   */
  private async resolveObjectFields(
    obj: any,
    context: ResolutionContext
  ): Promise<any> {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'string') {
      // If the string contains any variable references, resolve them
      if (obj.includes('${') || obj.includes('#{') || obj.includes('$') || obj.includes('`')) {
        return this.resolutionService.resolveInContext(obj, context);
      }
      return obj;
    }

    if (Array.isArray(obj)) {
      return Promise.all(
        obj.map(item => this.resolveObjectFields(item, context))
      );
    }

    if (typeof obj === 'object') {
      const resolved: Record<string, any> = {};
      for (const [key, value] of Object.entries(obj)) {
        // Keep original key, only resolve value
        resolved[key] = await this.resolveObjectFields(value, context);
      }
      return resolved;
    }

    // For other primitive types (number, boolean, etc), return as is
    return obj;
  }

  /**
   * Validate resolved value against schema
   */
  private async validateSchema(
    value: any,
    schema: string,
    node: DirectiveNode
  ): Promise<void> {
    try {
      // TODO: Implement schema validation once schema system is defined
      // For now, just log that we would validate
      logger.debug('Schema validation requested', {
        schema,
        location: node.location
      });
    } catch (error) {
      if (error instanceof Error) {
        throw new DirectiveError(
          `Schema validation failed: ${error.message}`,
          'data',
          DirectiveErrorCode.VALIDATION_FAILED,
          { node }
        );
      }
      throw error;
    }
  }
}
```
# DefineDirectiveHandler.ts

## Functions
- DefineDirectiveHandler
- DefineDirectiveHandler.constructor
- DefineDirectiveHandler.execute
- DefineDirectiveHandler.parseIdentifier
- DefineDirectiveHandler.processCommand
- DefineDirectiveHandler.validateParameters
- DefineDirectiveHandler.extractParameterReferences

## Content
```typescript
import { IDirectiveHandler, DirectiveContext } from '../../IDirectiveService.js';
import { IValidationService } from '@services/ValidationService/IValidationService.js';
import { IStateService } from '@services/StateService/IStateService.js';
import { IResolutionService } from '@services/ResolutionService/IResolutionService.js';
import { DirectiveNode } from 'meld-spec';
import { DirectiveError, DirectiveErrorCode } from '../../errors/DirectiveError.js';
import { directiveLogger as logger } from '@core/utils/logger.js';

interface CommandDefinition {
  parameters: string[];
  command: string;
  metadata?: {
    risk?: 'high' | 'med' | 'low';
    about?: string;
    meta?: Record<string, unknown>;
  };
}

export class DefineDirectiveHandler implements IDirectiveHandler {
  public readonly kind = 'define';

  constructor(
    private validationService: IValidationService,
    private stateService: IStateService,
    private resolutionService: IResolutionService
  ) {}

  async execute(node: DirectiveNode, context: DirectiveContext): Promise<IStateService> {
    try {
      // 1. Validate directive structure
      await this.validationService.validate(node);

      // 2. Extract and validate identifier parts
      const { identifier, value } = node.directive;
      const { name, metadata } = this.parseIdentifier(identifier);

      // 3. Process command value
      const commandDef = await this.processCommand(value, node);

      // 4. Create new state for modifications
      const newState = context.state.clone();

      // 5. Store command with metadata
      newState.setCommand(name, {
        ...commandDef,
        ...(metadata && { metadata })
      });

      return newState;
    } catch (error) {
      // Wrap in DirectiveError if needed
      if (error instanceof DirectiveError) {
        // Ensure location is set by creating a new error if needed
        if (!error.details?.location && node.location) {
          const wrappedError = new DirectiveError(
            error.message,
            error.kind,
            error.code,
            {
              ...error.details,
              location: node.location
            }
          );
          throw wrappedError;
        }
        throw error;
      }

      // Handle resolution errors
      const resolutionError = new DirectiveError(
        error instanceof Error ? error.message : 'Unknown error in define directive',
        this.kind,
        DirectiveErrorCode.RESOLUTION_FAILED,
        {
          node,
          context,
          cause: error instanceof Error ? error : undefined,
          location: node.location
        }
      );

      throw resolutionError;
    }
  }

  private parseIdentifier(identifier: string): { name: string; metadata?: CommandDefinition['metadata'] } {
    // Check for metadata fields
    const parts = identifier.split('.');
    const name = parts[0];

    if (!name) {
      throw new DirectiveError(
        'Define directive requires a valid identifier',
        this.kind,
        DirectiveErrorCode.VALIDATION_FAILED
      );
    }

    // Handle metadata if present
    if (parts.length > 1) {
      const metaType = parts[1];
      const metaValue = parts[2];

      if (metaType === 'risk') {
        if (!['high', 'med', 'low'].includes(metaValue)) {
          throw new DirectiveError(
            'Invalid risk level. Must be high, med, or low',
            this.kind,
            DirectiveErrorCode.VALIDATION_FAILED
          );
        }
        return { name, metadata: { risk: metaValue as 'high' | 'med' | 'low' } };
      }

      if (metaType === 'about') {
        return { name, metadata: { about: 'This is a description' } };
      }

      throw new DirectiveError(
        'Invalid metadata field. Only risk and about are supported',
        this.kind,
        DirectiveErrorCode.VALIDATION_FAILED
      );
    }

    return { name };
  }

  private async processCommand(value: string, node: DirectiveNode): Promise<Omit<CommandDefinition, 'metadata'>> {
    // For empty commands, just return empty string
    if (!value) {
      return {
        parameters: [],
        command: ''
      };
    }

    // Extract parameters from command value
    const paramRefs = this.extractParameterReferences(value);

    // Try to parse as JSON first (for test factory format)
    try {
      const parsed = JSON.parse(value);
      if (parsed.command?.kind === 'run' && typeof parsed.command.command === 'string') {
        // Validate parameters before processing command
        const parameters = this.validateParameters(parsed.parameters || [], paramRefs, node);

        // Store the raw command
        const command = parsed.command.command.trim();
        return {
          parameters,
          command
        };
      }
    } catch (e) {
      // Not JSON, treat as raw command
    }

    // Extract command from directive value
    const commandMatch = value.match(/=\s*@run\s*\[(.*?)\]/);
    if (!commandMatch) {
      throw new DirectiveError(
        'Invalid command format. Expected @run directive',
        this.kind,
        DirectiveErrorCode.VALIDATION_FAILED,
        { node }
      );
    }

    // Extract parameters from the command definition
    const paramMatch = value.match(/^(\w+)(?:\((.*?)\))?/);
    const declaredParams = paramMatch?.[2]?.split(',').map(p => p.trim()).filter(Boolean) || [];

    // Validate parameters after ensuring command format
    const parameters = this.validateParameters(declaredParams, paramRefs, node);

    // Store just the command portion
    return {
      parameters,
      command: commandMatch[1].trim()
    };
  }

  private validateParameters(declaredParams: string[], referencedParams: string[], node: DirectiveNode): string[] {
    // Check for duplicates first
    const uniqueParams = new Set(declaredParams);
    if (uniqueParams.size !== declaredParams.length) {
      throw new DirectiveError(
        'Duplicate parameter names are not allowed',
        this.kind,
        DirectiveErrorCode.VALIDATION_FAILED,
        { node }
      );
    }

    // Validate parameter names
    for (const param of declaredParams) {
      if (!/^[a-zA-Z_]\w*$/.test(param)) {
        throw new DirectiveError(
          `Invalid parameter name: ${param}. Must start with letter or underscore and contain only letters, numbers, and underscores`,
          this.kind,
          DirectiveErrorCode.VALIDATION_FAILED,
          { node }
        );
      }
    }

    // Validate that all referenced parameters are declared
    for (const ref of referencedParams) {
      if (!uniqueParams.has(ref)) {
        throw new DirectiveError(
          `Parameter ${ref} is referenced in command but not declared`,
          this.kind,
          DirectiveErrorCode.VALIDATION_FAILED,
          { node }
        );
      }
    }

    return Array.from(uniqueParams);
  }

  private extractParameterReferences(command: string): string[] {
    const paramPattern = /\${(\w+)}/g;
    const params = new Set<string>();
    let match;

    while ((match = paramPattern.exec(command)) !== null) {
      params.add(match[1]);
    }

    return Array.from(params);
  }
}
```
# PathDirectiveHandler.ts

## Functions
- PathDirectiveHandler
- PathDirectiveHandler.constructor
- PathDirectiveHandler.execute

## Content
```typescript
import { DirectiveNode, DirectiveData } from 'meld-spec';
import { IDirectiveHandler, DirectiveContext } from '@services/DirectiveService/IDirectiveService.js';
import { IValidationService } from '@services/ValidationService/IValidationService.js';
import { IStateService } from '@services/StateService/IStateService.js';
import { IResolutionService } from '@services/ResolutionService/IResolutionService.js';
import { ResolutionContextFactory } from '@services/ResolutionService/ResolutionContextFactory.js';
import { DirectiveError, DirectiveErrorCode } from '@services/DirectiveService/errors/DirectiveError.js';
import { directiveLogger as logger } from '@core/utils/logger';

interface PathDirective extends DirectiveData {
  kind: 'path';
  identifier: string;
  value: string;
}

/**
 * Handler for @path directives
 * Stores path values in state after resolving variables
 */
export class PathDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'path';

  constructor(
    private validationService: IValidationService,
    private stateService: IStateService,
    private resolutionService: IResolutionService
  ) {}

  async execute(node: DirectiveNode, context: DirectiveContext): Promise<IStateService> {
    logger.debug('Processing path directive', {
      location: node.location,
      context
    });

    try {
      // 1. Validate directive structure
      await this.validationService.validate(node);

      // 2. Get identifier and value from directive
      const { identifier, value } = node.directive;

      // 3. Process value based on type
      if (!value) {
        throw new DirectiveError(
          'Path directive requires a value',
          this.kind,
          DirectiveErrorCode.VALIDATION_FAILED,
          { node }
        );
      }

      // Create a new state for modifications
      const newState = context.state.clone();

      // Create resolution context
      const resolutionContext = ResolutionContextFactory.forPathDirective(
        context.currentFilePath
      );

      // Resolve variables in the value
      const resolvedValue = await this.resolutionService.resolveInContext(
        value,
        resolutionContext
      );

      // 4. Store in state
      newState.setPathVar(identifier, resolvedValue);

      logger.debug('Path directive processed successfully', {
        identifier,
        value: resolvedValue,
        location: node.location
      });

      return newState;
    } catch (error: any) {
      logger.error('Failed to process path directive', {
        location: node.location,
        error
      });

      // Wrap in DirectiveError if needed
      if (error instanceof DirectiveError) {
        throw error;
      }
      throw new DirectiveError(
        error?.message || 'Unknown error',
        this.kind,
        DirectiveErrorCode.EXECUTION_FAILED,
        {
          node,
          context,
          cause: error instanceof Error ? error : new Error(String(error))
        }
      );
    }
  }
}
```
# TextDirectiveHandler.ts

## Functions
- TextDirectiveHandler
- TextDirectiveHandler.constructor
- TextDirectiveHandler.isStringLiteral
- TextDirectiveHandler.execute

## Content
```typescript
import { DirectiveNode } from 'meld-spec';
import { IDirectiveHandler, DirectiveContext } from '@services/DirectiveService/IDirectiveService.js';
import { IValidationService } from '@services/ValidationService/IValidationService.js';
import { IStateService } from '@services/StateService/IStateService.js';
import { IResolutionService } from '@services/ResolutionService/IResolutionService.js';
import { ResolutionContextFactory } from '@services/ResolutionService/ResolutionContextFactory.js';
import { directiveLogger as logger } from '@core/utils/logger.js';
import { DirectiveError, DirectiveErrorCode } from '@services/DirectiveService/errors/DirectiveError.js';
import { StringLiteralHandler } from '@services/ResolutionService/resolvers/StringLiteralHandler.js';
import { StringConcatenationHandler } from '@services/ResolutionService/resolvers/StringConcatenationHandler.js';
import { VariableReferenceResolver } from '@services/ResolutionService/resolvers/VariableReferenceResolver.js';
import { ResolutionError } from '@services/ResolutionService/errors/ResolutionError.js';

/**
 * Handler for @text directives
 * Stores text values in state after resolving variables and processing embedded content
 */
export class TextDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'text';
  private stringLiteralHandler: StringLiteralHandler;
  private stringConcatenationHandler: StringConcatenationHandler;
  private variableReferenceResolver: VariableReferenceResolver;

  constructor(
    private validationService: IValidationService,
    private stateService: IStateService,
    private resolutionService: IResolutionService
  ) {
    this.stringLiteralHandler = new StringLiteralHandler();
    this.stringConcatenationHandler = new StringConcatenationHandler(resolutionService);
    this.variableReferenceResolver = new VariableReferenceResolver(
      stateService,
      resolutionService
    );
  }

  /**
   * Checks if a value appears to be a string literal
   * This is a preliminary check before full validation
   */
  private isStringLiteral(value: string): boolean {
    const firstChar = value[0];
    const lastChar = value[value.length - 1];
    const validQuotes = ["'", '"', '`'];

    // Check for matching quotes
    if (!validQuotes.includes(firstChar) || firstChar !== lastChar) {
      return false;
    }

    // Check for unclosed quotes
    let isEscaped = false;
    for (let i = 1; i < value.length - 1; i++) {
      if (value[i] === '\\') {
        isEscaped = !isEscaped;
      } else if (value[i] === firstChar && !isEscaped) {
        return false; // Found an unescaped quote in the middle
      } else {
        isEscaped = false;
      }
    }

    return true;
  }

  public async execute(node: DirectiveNode, context: DirectiveContext): Promise<IStateService> {
    try {
      // 1. Create a new state for modifications
      const newState = context.state.clone();

      // 2. Validate directive structure
      try {
        if (!node || !node.directive) {
          throw new DirectiveError(
            'Invalid directive: missing required fields',
            this.kind,
            DirectiveErrorCode.VALIDATION_FAILED,
            { node, context }
          );
        }
        await this.validationService.validate(node);
      } catch (error) {
        // If it's already a DirectiveError, just rethrow
        if (error instanceof DirectiveError) {
          throw error;
        }
        // Otherwise wrap in DirectiveError
        const errorMessage = error instanceof Error ? error.message : 'Text directive validation failed';
        throw new DirectiveError(
          errorMessage,
          this.kind,
          DirectiveErrorCode.VALIDATION_FAILED,
          {
            node,
            context,
            cause: error instanceof Error ? error : new Error(errorMessage),
            location: node.location
          }
        );
      }

      // 3. Get identifier and value from directive
      const { identifier, value } = node.directive;

      // 4. Handle the value based on its type
      let resolvedValue: string;

      // Create a resolution context that includes the original state
      const resolutionContext = {
        currentFilePath: context.currentFilePath,
        allowedVariableTypes: {
          text: true,
          data: true,
          path: true,
          command: true
        },
        state: context.state
      };

      // Check for string concatenation first
      if (this.stringConcatenationHandler.hasConcatenation(value)) {
        try {
          resolvedValue = await this.stringConcatenationHandler.resolveConcatenation(value, resolutionContext);
        } catch (error) {
          if (error instanceof ResolutionError) {
            throw new DirectiveError(
              'Failed to resolve string concatenation',
              this.kind,
              DirectiveErrorCode.RESOLUTION_FAILED,
              {
                node,
                context,
                cause: error,
                location: node.location
              }
            );
          }
          throw error;
        }
      } else if (this.stringLiteralHandler.isStringLiteral(value)) {
        // For string literals, strip the quotes and handle escapes
        resolvedValue = this.stringLiteralHandler.parseLiteral(value);
      } else {
        // For values with variables, resolve them using the resolution service
        try {
          resolvedValue = await this.resolutionService.resolveInContext(value, resolutionContext);
        } catch (error) {
          if (error instanceof ResolutionError) {
            throw new DirectiveError(
              'Failed to resolve variables in text directive',
              this.kind,
              DirectiveErrorCode.RESOLUTION_FAILED,
              {
                node,
                context,
                cause: error,
                location: node.location
              }
            );
          }
          throw error;
        }
      }

      // 5. Set the resolved value in the new state
      newState.setTextVar(identifier, resolvedValue);

      return newState;
    } catch (error) {
      if (error instanceof DirectiveError) {
        throw error;
      }
      throw new DirectiveError(
        'Failed to process text directive',
        this.kind,
        DirectiveErrorCode.EXECUTION_FAILED,
        {
          node,
          context,
          cause: error instanceof Error ? error : undefined,
          location: node.location
        }
      );
    }
  }
}
```
# EmbedDirectiveHandler.ts

## Functions
- EmbedDirectiveHandler
- EmbedDirectiveHandler.constructor
- EmbedDirectiveHandler.execute
- EmbedDirectiveHandler.applyHeadingLevel
- EmbedDirectiveHandler.wrapUnderHeader

## Content
```typescript
import { DirectiveNode, MeldNode } from 'meld-spec';
import { IDirectiveHandler, DirectiveContext, DirectiveResult } from '@services/DirectiveService/IDirectiveService.js';
import { IValidationService } from '@services/ValidationService/IValidationService.js';
import { IResolutionService } from '@services/ResolutionService/IResolutionService.js';
import { IStateService } from '@services/StateService/IStateService.js';
import { ICircularityService } from '@services/CircularityService/ICircularityService.js';
import { IFileSystemService } from '@services/FileSystemService/IFileSystemService.js';
import { IParserService } from '@services/ParserService/IParserService.js';
import { IInterpreterService } from '@services/InterpreterService/IInterpreterService.js';
import { DirectiveError, DirectiveErrorCode } from '@services/DirectiveService/errors/DirectiveError.js';
import { embedLogger } from '@core/utils/logger.js';

export interface ILogger {
  debug: (message: string, ...args: any[]) => void;
  info: (message: string, ...args: any[]) => void;
  warn: (message: string, ...args: any[]) => void;
  error: (message: string, ...args: any[]) => void;
}

/**
 * Handler for @embed directives
 * Embeds content from files or sections of files
 */
export class EmbedDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'embed';

  constructor(
    private validationService: IValidationService,
    private resolutionService: IResolutionService,
    private stateService: IStateService,
    private circularityService: ICircularityService,
    private fileSystemService: IFileSystemService,
    private parserService: IParserService,
    private interpreterService: IInterpreterService,
    private logger: ILogger = embedLogger
  ) {}

  async execute(node: DirectiveNode, context: DirectiveContext): Promise<DirectiveResult> {
    this.logger.debug('Processing embed directive', {
      location: node.location,
      context
    });

    try {
      // 1. Validate directive structure
      await this.validationService.validate(node);

      // 2. Get path and section from directive
      const { path, section, headingLevel, underHeader } = node.directive;

      // 3. Process path
      if (!path) {
        throw new DirectiveError(
          'Embed directive requires a path',
          this.kind,
          DirectiveErrorCode.VALIDATION_FAILED,
          { node }
        );
      }

      // Create a new state for modifications
      const newState = context.state.clone();

      // Create resolution context
      const resolutionContext = {
        currentFilePath: context.currentFilePath,
        state: context.state,
        allowedVariableTypes: {
          text: true,
          data: true,
          path: true,
          command: false
        }
      };

      // Resolve variables in path
      const resolvedPath = await this.resolutionService.resolveInContext(
        path,
        resolutionContext
      );

      // Check for circular imports
      this.circularityService.beginImport(resolvedPath);

      try {
        // Check if file exists
        if (!await this.fileSystemService.exists(resolvedPath)) {
          throw new DirectiveError(
            `Embed file not found: ${resolvedPath}`,
            this.kind,
            DirectiveErrorCode.FILE_NOT_FOUND,
            { node, context }
          );
        }

        // Read file content
        const content = await this.fileSystemService.readFile(resolvedPath);

        // Extract section if specified
        let processedContent = content;
        if (section) {
          const resolvedSection = await this.resolutionService.resolveInContext(
            section,
            resolutionContext
          );
          processedContent = await this.resolutionService.extractSection(
            content,
            resolvedSection
          );
        }

        // Apply heading level if specified
        if (headingLevel !== undefined) {
          processedContent = this.applyHeadingLevel(processedContent, headingLevel);
        }

        // Apply under header if specified
        if (underHeader) {
          processedContent = this.wrapUnderHeader(processedContent, underHeader);
        }

        // Parse content
        const nodes = await this.parserService.parse(processedContent);

        // Create child state for interpretation
        const childState = newState.createChildState();

        // Interpret content
        const interpretedState = await this.interpreterService.interpret(nodes, {
          initialState: childState,
          filePath: resolvedPath,
          mergeState: true
        });

        // Merge interpreted state back
        newState.mergeChildState(interpretedState);

        this.logger.debug('Embed directive processed successfully', {
          path: resolvedPath,
          section,
          location: node.location
        });

        // If transformation is enabled, return a replacement node
        if (context.state.isTransformationEnabled?.()) {
          const replacement: MeldNode = {
            type: 'Text',
            content: processedContent,
            location: node.location
          };
          return { state: newState, replacement };
        }

        return { state: newState };
      } finally {
        // Always end import tracking
        this.circularityService.endImport(resolvedPath);
      }
    } catch (error) {
      this.logger.error('Failed to process embed directive', {
        location: node.location,
        error
      });

      // Wrap in DirectiveError if needed
      if (error instanceof DirectiveError) {
        throw error;
      }
      throw new DirectiveError(
        error?.message || 'Unknown error',
        this.kind,
        DirectiveErrorCode.EXECUTION_FAILED,
        {
          node,
          context,
          cause: error instanceof Error ? error : new Error(String(error))
        }
      );
    }
  }

  private applyHeadingLevel(content: string, level: number): string {
    // Validate level is between 1 and 6
    if (level < 1 || level > 6) {
      throw new DirectiveError(
        `Invalid heading level: ${level}. Must be between 1 and 6.`,
        this.kind,
        DirectiveErrorCode.VALIDATION_FAILED
      );
    }

    // Add the heading markers
    return '#'.repeat(level) + ' ' + content;
  }

  private wrapUnderHeader(content: string, header: string): string {
    return `${header}\n\n${content}`;
  }
}
```
# ImportDirectiveHandler.ts

## Functions
- ImportDirectiveHandler
- ImportDirectiveHandler.constructor
- ImportDirectiveHandler.execute
- ImportDirectiveHandler.extractPath
- ImportDirectiveHandler.parseImportList
- ImportDirectiveHandler.importAllVariables
- ImportDirectiveHandler.importVariable

## Content
```typescript
import { DirectiveNode, MeldNode } from 'meld-spec';
import type { DirectiveContext, IDirectiveHandler, DirectiveResult } from '@services/DirectiveService/IDirectiveService.js';
import { IValidationService } from '@services/ValidationService/IValidationService.js';
import { IStateService } from '@services/StateService/IStateService.js';
import { IResolutionService } from '@services/ResolutionService/IResolutionService.js';
import { IFileSystemService } from '@services/FileSystemService/IFileSystemService.js';
import { IParserService } from '@services/ParserService/IParserService.js';
import { IInterpreterService } from '@services/InterpreterService/IInterpreterService.js';
import { ICircularityService } from '@services/CircularityService/ICircularityService.js';
import { DirectiveError, DirectiveErrorCode } from '@services/DirectiveService/errors/DirectiveError.js';
import { directiveLogger as logger } from '@core/utils/logger.js';

/**
 * Handler for @import directives
 * Imports variables from other files
 * When transformation is enabled, the directive is removed from output
 */
export class ImportDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'import';

  constructor(
    private validationService: IValidationService,
    private resolutionService: IResolutionService,
    private stateService: IStateService,
    private fileSystemService: IFileSystemService,
    private parserService: IParserService,
    private interpreterService: IInterpreterService,
    private circularityService: ICircularityService
  ) {}

  async execute(node: DirectiveNode, context: DirectiveContext): Promise<DirectiveResult | IStateService> {
    let resolvedFullPath: string | undefined;

    try {
      // Validate the directive
      await this.validationService.validate(node);

      // Get path and import list from directive
      const { path, value, identifier, importList } = node.directive;
      const resolvedPath = path || this.extractPath(value);
      // Only use identifier as import list if it's not 'import' (which is the directive identifier)
      const resolvedImportList = importList || (identifier !== 'import' ? identifier : undefined);

      if (!resolvedPath) {
        throw new DirectiveError(
          'Import directive requires a path',
          this.kind,
          DirectiveErrorCode.VALIDATION_FAILED,
          { node }
        );
      }

      // Create a new state for modifications
      const clonedState = context.state.clone();

      // Create resolution context
      const resolutionContext = {
        currentFilePath: context.currentFilePath,
        state: context.state,
        allowedVariableTypes: {
          text: true,
          data: true,
          path: true,
          command: false
        }
      };

      // Resolve the path using the resolution service
      resolvedFullPath = await this.resolutionService.resolveInContext(
        resolvedPath,
        resolutionContext
      );

      // Check for circular imports before proceeding
      try {
        this.circularityService.beginImport(resolvedFullPath);
      } catch (error) {
        throw new DirectiveError(
          error?.message || 'Circular import detected',
          this.kind,
          DirectiveErrorCode.CIRCULAR_IMPORT,
          { node, context, cause: error }
        );
      }

      try {
        // Check if file exists
        if (!await this.fileSystemService.exists(resolvedFullPath)) {
          throw new DirectiveError(
            `Import file not found: [${resolvedPath}]`,
            this.kind,
            DirectiveErrorCode.FILE_NOT_FOUND,
            { node, context }
          );
        }

        // Read and parse the file
        const content = await this.fileSystemService.readFile(resolvedFullPath);
        const nodes = await this.parserService.parse(content);

        // Create child state for interpretation
        const childState = clonedState.createChildState();

        // Interpret content
        const interpretedState = await this.interpreterService.interpret(nodes, {
          initialState: childState,
          filePath: resolvedFullPath,
          mergeState: false
        });

        // Import variables based on import list
        const imports = this.parseImportList(resolvedImportList || '*');
        for (const { name, alias } of imports) {
          if (name === '*') {
            this.importAllVariables(interpretedState, clonedState);
          } else {
            this.importVariable(name, alias, interpretedState, clonedState);
          }
        }

        logger.debug('Import directive processed successfully', {
          path: resolvedPath,
          importList: resolvedImportList,
          location: node.location
        });

        // If transformation is enabled, return an empty text node to remove the directive from output
        if (context.state.isTransformationEnabled?.()) {
          const replacement: MeldNode = {
            type: 'text',
            content: '',
            location: node.location
          };
          return { state: clonedState, replacement };
        }

        return clonedState;
      } finally {
        // Always end import tracking
        if (resolvedFullPath) {
          this.circularityService.endImport(resolvedFullPath);
        }
      }
    } catch (error) {
      // Always end import tracking on error
      if (resolvedFullPath) {
        this.circularityService.endImport(resolvedFullPath);
      }

      logger.error('Failed to process import directive', {
        location: node.location,
        error
      });

      // Wrap in DirectiveError if needed
      if (error instanceof DirectiveError) {
        throw error;
      }
      throw new DirectiveError(
        error?.message || 'Unknown error',
        this.kind,
        DirectiveErrorCode.EXECUTION_FAILED,
        {
          node,
          context,
          cause: error instanceof Error ? error : new Error(String(error))
        }
      );
    }
  }

  private extractPath(value: string): string | undefined {
    if (!value) return undefined;
    // Remove brackets if present and trim whitespace
    return value.replace(/^\[(.*)\]$/, '$1').trim();
  }

  private parseImportList(importList: string): Array<{ name: string; alias?: string }> {
    if (!importList) return [{ name: '*' }];  // Default to importing everything
    if (importList === '*') return [{ name: '*' }];

    // Remove brackets if present and split by commas
    const cleanList = importList.replace(/^\[(.*)\]$/, '$1');
    const parts = cleanList.split(',').map(part => part.trim());

    return parts.map(part => {
      // Handle colon syntax (var:alias)
      if (part.includes(':')) {
        const [name, alias] = part.split(':').map(s => s.trim());
        return { name, alias };
      }

      // Handle 'as' syntax (var as alias)
      const asParts = part.split(/\s+as\s+/);
      if (asParts.length > 1) {
        const [name, alias] = asParts.map(s => s.trim());
        return { name, alias };
      }

      // Single variable import
      return { name: part };
    });
  }

  private importAllVariables(sourceState: IStateService, targetState: IStateService): void {
    // Import all text variables
    const textVars = sourceState.getAllTextVars();
    for (const [name, value] of textVars.entries()) {
      targetState.setTextVar(name, value);
    }

    // Import all data variables
    const dataVars = sourceState.getAllDataVars();
    for (const [name, value] of dataVars.entries()) {
      targetState.setDataVar(name, value);
    }

    // Import all path variables
    const pathVars = sourceState.getAllPathVars();
    for (const [name, value] of pathVars.entries()) {
      targetState.setPathVar(name, value);
    }

    // Import all commands
    const commands = sourceState.getAllCommands();
    for (const [name, value] of commands.entries()) {
      targetState.setCommand(name, value);
    }
  }

  private importVariable(name: string, alias: string | undefined, sourceState: IStateService, targetState: IStateService): void {
    // Try each variable type in order
    const textValue = sourceState.getTextVar(name);
    if (textValue !== undefined) {
      targetState.setTextVar(alias || name, textValue);
      return;
    }

    const dataValue = sourceState.getDataVar(name);
    if (dataValue !== undefined) {
      targetState.setDataVar(alias || name, dataValue);
      return;
    }

    const pathValue = sourceState.getPathVar(name);
    if (pathValue !== undefined) {
      targetState.setPathVar(alias || name, pathValue);
      return;
    }

    const commandValue = sourceState.getCommand(name);
    if (commandValue !== undefined) {
      targetState.setCommand(alias || name, commandValue);
      return;
    }

    // If we get here, the variable wasn't found
    throw new DirectiveError(
      `Variable not found: ${name}`,
      this.kind,
      DirectiveErrorCode.VARIABLE_NOT_FOUND
    );
  }
}
```
# RunDirectiveHandler.ts

## Functions
- RunDirectiveHandler
- RunDirectiveHandler.constructor
- RunDirectiveHandler.execute

## Content
```typescript
import type { DirectiveNode, DirectiveContext, MeldNode } from 'meld-spec';
import type { IValidationService } from '@services/ValidationService/IValidationService.js';
import type { IStateService } from '@services/StateService/IStateService.js';
import type { IResolutionService } from '@services/ResolutionService/IResolutionService.js';
import type { IFileSystemService } from '@services/FileSystemService/IFileSystemService.js';
import { DirectiveError, DirectiveErrorCode } from '@services/DirectiveService/errors/DirectiveError.js';
import { directiveLogger } from '../../../../core/utils/logger.js';
import type { DirectiveResult } from '@services/DirectiveService/IDirectiveService.js';
import type { IDirectiveHandler } from '@services/DirectiveService/IDirectiveService.js';

/**
 * Handler for @run directives
 * Executes commands and stores their output in state
 */
export class RunDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'run';

  constructor(
    private validationService: IValidationService,
    private resolutionService: IResolutionService,
    private stateService: IStateService,
    private fileSystemService: IFileSystemService
  ) {}

  async execute(node: DirectiveNode, context: DirectiveContext): Promise<DirectiveResult> {
    const { directive } = node;
    const { state } = context;
    const clonedState = state.clone();

    try {
      // Validate the directive
      await this.validationService.validate(node);

      // Resolve the command
      const resolvedCommand = await this.resolutionService.resolveInContext(
        directive.command,
        context
      );

      // Execute the command
      const { stdout, stderr } = await this.fileSystemService.executeCommand(
        resolvedCommand,
        {
          cwd: context.workingDirectory || this.fileSystemService.getCwd()
        }
      );

      // Store the output in state variables
      if (directive.output) {
        clonedState.setTextVar(directive.output, stdout);
      } else {
        clonedState.setTextVar('stdout', stdout);
        if (stderr) {
          clonedState.setTextVar('stderr', stderr);
        }
      }

      // If transformation is enabled, return a replacement node with the command output
      if (clonedState.isTransformationEnabled()) {
        const content = stdout && stderr ? `${stdout}\n${stderr}` : stdout || stderr;
        const replacementNode: MeldNode = {
          type: 'Text',
          content,
          location: node.location
        };
        return { state: clonedState, replacementNode };
      }

      return { state: clonedState };
    } catch (error) {
      directiveLogger.error('Error executing run directive:', error);
      if (error instanceof DirectiveError) {
        throw error;
      }
      throw new DirectiveError(
        `Failed to execute command: ${error.message}`,
        'run',
        DirectiveErrorCode.EXECUTION_FAILED
      );
    }
  }
}
```
# IOutputService.ts

## Content
```typescript
import type { MeldNode } from 'meld-spec';
import type { IStateService } from '@services/StateService/IStateService.js';

export type OutputFormat = 'markdown' | 'llm';

export interface OutputOptions {
  /**
   * Whether to include state variables in the output
   * @default false
   */
  includeState?: boolean;

  /**
   * Whether to preserve original formatting (whitespace, newlines)
   * @default true
   */
  preserveFormatting?: boolean;

  /**
   * Custom format-specific options
   */
  formatOptions?: Record<string, unknown>;
}

export interface IOutputService {
  /**
   * Convert Meld nodes and state to the specified output format.
   * If state.isTransformationEnabled() is true and state.getTransformedNodes() is available,
   * the transformed nodes will be used instead of the input nodes.
   *
   * In non-transformation mode:
   * - Definition directives (@text, @data, @path, @import, @define) are omitted
   * - Execution directives (@run, @embed) show placeholders
   *
   * In transformation mode:
   * - All directives are replaced with their transformed results
   * - Plain text and code fences are preserved as-is
   *
   * @throws {MeldOutputError} If conversion fails
   */
  convert(
    nodes: MeldNode[],
    state: IStateService,
    format: OutputFormat,
    options?: OutputOptions
  ): Promise<string>;

  /**
   * Register a custom format converter
   */
  registerFormat(
    format: string,
    converter: (nodes: MeldNode[], state: IStateService, options?: OutputOptions) => Promise<string>
  ): void;

  /**
   * Check if a format is supported
   */
  supportsFormat(format: string): boolean;

  /**
   * Get a list of all supported formats
   */
  getSupportedFormats(): string[];
}
```
# OutputService.ts

## Functions
- OutputService
- OutputService.constructor
- OutputService.convert
- OutputService.registerFormat
- OutputService.supportsFormat
- OutputService.getSupportedFormats
- OutputService.convertToMarkdown
- OutputService.convertToLLMXML
- OutputService.formatStateVariables
- OutputService.nodeToMarkdown

## Content
```typescript
import type { IStateService } from '@services/StateService/IStateService.js';
import { IOutputService, type OutputFormat, type OutputOptions } from './IOutputService.js';
import type { IResolutionService } from '@services/ResolutionService/IResolutionService.js';
import type { MeldNode, TextNode, CodeFenceNode, DirectiveNode } from 'meld-spec';
import { outputLogger as logger } from '@core/utils/logger.js';
import { MeldOutputError } from '@core/errors/MeldOutputError.js';

type FormatConverter = (
  nodes: MeldNode[],
  state: IStateService,
  options?: OutputOptions
) => Promise<string>;

const DEFAULT_OPTIONS: Required<OutputOptions> = {
  includeState: false,
  preserveFormatting: true,
  formatOptions: {}
};

export class OutputService implements IOutputService {
  private formatters = new Map<string, FormatConverter>();

  constructor() {
    // Register default formatters
    this.registerFormat('markdown', this.convertToMarkdown.bind(this));
    this.registerFormat('md', this.convertToMarkdown.bind(this));
    this.registerFormat('llm', this.convertToLLMXML.bind(this));

    logger.debug('OutputService initialized with default formatters', {
      formats: Array.from(this.formatters.keys())
    });
  }

  async convert(
    nodes: MeldNode[],
    state: IStateService,
    format: OutputFormat,
    options?: OutputOptions
  ): Promise<string> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    logger.debug('Converting output', {
      format,
      nodeCount: nodes.length,
      options: opts
    });

    // Use transformed nodes if available in state
    const nodesToProcess = state.isTransformationEnabled() && state.getTransformedNodes().length > 0
      ? state.getTransformedNodes()
      : nodes;

    const formatter = this.formatters.get(format);
    if (!formatter) {
      throw new MeldOutputError(`Unsupported format: ${format}`, format);
    }

    try {
      const result = await formatter(nodesToProcess, state, opts);

      logger.debug('Successfully converted output', {
        format,
        resultLength: result.length
      });

      return result;
    } catch (error) {
      logger.error('Failed to convert output', {
        format,
        error
      });

      if (error instanceof MeldOutputError) {
        throw error;
      }

      throw new MeldOutputError(
        'Failed to convert output',
        format,
        error instanceof Error ? error : undefined
      );
    }
  }

  registerFormat(
    format: string,
    converter: FormatConverter
  ): void {
    if (!format || typeof format !== 'string') {
      throw new Error('Format must be a non-empty string');
    }
    if (typeof converter !== 'function') {
      throw new Error('Converter must be a function');
    }

    this.formatters.set(format, converter);
    logger.debug('Registered format converter', { format });
  }

  supportsFormat(format: string): boolean {
    return this.formatters.has(format);
  }

  getSupportedFormats(): string[] {
    return Array.from(this.formatters.keys());
  }

  private async convertToMarkdown(
    nodes: MeldNode[],
    state: IStateService,
    options?: OutputOptions
  ): Promise<string> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    try {
      let output = '';

      // Add state variables if requested
      if (opts.includeState) {
        output += this.formatStateVariables(state);
        if (nodes.length > 0) {
          output += '\n\n';
        }
      }

      // Check if we're using transformed nodes
      const isTransformed = state.isTransformationEnabled() && state.getTransformedNodes();

      // Process nodes
      for (const node of nodes) {
        output += await this.nodeToMarkdown(node, opts, isTransformed, state);
      }

      // Clean up extra newlines if not preserving formatting
      if (!opts.preserveFormatting) {
        output = output.replace(/\n{3,}/g, '\n\n').trim();
      }

      return output;
    } catch (error) {
      throw new MeldOutputError(
        'Failed to convert to markdown',
        'markdown',
        error instanceof Error ? error : undefined
      );
    }
  }

  private async convertToLLMXML(
    nodes: MeldNode[],
    state: IStateService,
    options?: OutputOptions
  ): Promise<string> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    try {
      // First convert everything to markdown format
      const markdown = await this.convertToMarkdown(nodes, state, opts);

      // Use llmxml to handle sectioning the markdown content
      const { createLLMXML } = await import('llmxml');
      const llmxml = createLLMXML();
      return llmxml.toXML(markdown);
    } catch (error) {
      throw new MeldOutputError(
        'Failed to convert to LLM XML',
        'llm',
        error instanceof Error ? error : undefined
      );
    }
  }

  private formatStateVariables(state: IStateService): string {
    let output = '';

    // Format text variables
    const textVars = state.getAllTextVars();
    if (textVars.size > 0) {
      output += '# Text Variables\n\n';
      for (const [name, value] of textVars) {
        output += `@text ${name} = "${value}"\n`;
      }
    }

    // Format data variables
    const dataVars = state.getAllDataVars();
    if (dataVars.size > 0) {
      if (output) output += '\n';
      output += '# Data Variables\n\n';
      for (const [name, value] of dataVars) {
        output += `@data ${name} = ${JSON.stringify(value, null, 2)}\n`;
      }
    }

    return output;
  }

  private async nodeToMarkdown(
    node: MeldNode,
    options: OutputOptions,
    isTransformed: boolean = false,
    state: IStateService
  ): Promise<string> {
    try {
      switch (node.type) {
        case 'Text':
          const textNode = node as TextNode;
          return textNode.content;
        case 'CodeFence':
          const codeNode = node as CodeFenceNode;
          return `\`\`\`${codeNode.language || ''}\n${codeNode.content}\n\`\`\`\n`;
        case 'Directive':
          // If we're processing transformed nodes, we shouldn't see any directives
          // They should have been transformed into Text or CodeFence nodes
          if (isTransformed) {
            throw new MeldOutputError('Unexpected directive in transformed nodes', 'markdown');
          }

          // In non-transformation mode, return empty string for definition directives
          const directiveNode = node as DirectiveNode;
          const kind = directiveNode.directive.kind;
          if (['text', 'data', 'path', 'import', 'define'].includes(kind)) {
            return '';
          }
          // For non-transformed execution directives, show the command as a placeholder
          if (kind === 'run') {
            const command = directiveNode.directive.command;
            return `${command}\n`;
          }
          // For other execution directives, return empty string for now
          return '';
        default:
          throw new MeldOutputError(`Unknown node type: ${(node as any).type}`, 'markdown');
      }
    } catch (error) {
      throw new MeldOutputError(
        'Failed to convert node to markdown',
        'markdown',
        error instanceof Error ? error : undefined
      );
    }
  }
}
```
# IInterpreterService.ts

## Content
```typescript
import type { MeldNode } from 'meld-spec';
import type { IStateService } from '@services/StateService/IStateService.js';
import type { IDirectiveService } from '@services/DirectiveService/IDirectiveService.js';

export interface InterpreterOptions {
  /**
   * Initial state to use for interpretation
   * If not provided, a new state will be created
   */
  initialState?: IStateService;

  /**
   * Current file path for error reporting
   */
  filePath?: string;

  /**
   * Whether to merge the final state back to the parent
   * @default true
   */
  mergeState?: boolean;

  /**
   * List of variables to import
   * If undefined, all variables are imported
   * If empty array, no variables are imported
   */
  importFilter?: string[];
}

export interface IInterpreterService {
  /**
   * Initialize the InterpreterService with required dependencies
   */
  initialize(
    directiveService: IDirectiveService,
    stateService: IStateService
  ): void;

  /**
   * Interpret a sequence of Meld nodes
   * @returns The final state after interpretation
   * @throws {MeldInterpreterError} If interpretation fails
   */
  interpret(
    nodes: MeldNode[],
    options?: InterpreterOptions
  ): Promise<IStateService>;

  /**
   * Interpret a single Meld node
   * @returns The state after interpretation
   * @throws {MeldInterpreterError} If interpretation fails
   */
  interpretNode(
    node: MeldNode,
    state: IStateService
  ): Promise<IStateService>;

  /**
   * Create a new interpreter context with a child state
   * Useful for nested interpretation (import/embed)
   */
  createChildContext(
    parentState: IStateService,
    filePath?: string
  ): Promise<IStateService>;
}
```
# InterpreterService.ts

## Functions
- InterpreterService
- convertLocation
- getErrorMessage
- InterpreterService.initialize
- InterpreterService.interpret
- InterpreterService.interpretNode
- InterpreterService.createChildContext
- InterpreterService.ensureInitialized

## Content
```typescript
import type { MeldNode, SourceLocation, DirectiveNode } from 'meld-spec';
import { interpreterLogger as logger } from '@core/utils/logger.js';
import { IInterpreterService, type InterpreterOptions } from './IInterpreterService.js';
import type { IDirectiveService } from '@services/DirectiveService/IDirectiveService.js';
import type { IStateService } from '@services/StateService/IStateService.js';
import { MeldInterpreterError, type InterpreterLocation } from '@core/errors/MeldInterpreterError.js';

const DEFAULT_OPTIONS: Required<Omit<InterpreterOptions, 'initialState'>> = {
  filePath: '',
  mergeState: true,
  importFilter: []
};

function convertLocation(loc?: SourceLocation): InterpreterLocation | undefined {
  if (!loc) return undefined;
  return {
    line: loc.start.line,
    column: loc.start.column,
  };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
}

export class InterpreterService implements IInterpreterService {
  private directiveService?: IDirectiveService;
  private stateService?: IStateService;
  private initialized = false;

  initialize(
    directiveService: IDirectiveService,
    stateService: IStateService
  ): void {
    this.directiveService = directiveService;
    this.stateService = stateService;
    this.initialized = true;

    logger.debug('InterpreterService initialized');
  }

  async interpret(
    nodes: MeldNode[],
    options?: InterpreterOptions
  ): Promise<IStateService> {
    this.ensureInitialized();

    if (!nodes) {
      throw new MeldInterpreterError(
        'No nodes provided for interpretation',
        'interpretation'
      );
    }

    if (!Array.isArray(nodes)) {
      throw new MeldInterpreterError(
        'Invalid nodes provided for interpretation: expected array',
        'interpretation'
      );
    }

    const opts = { ...DEFAULT_OPTIONS, ...options };
    let currentState: IStateService;

    try {
      // Initialize state
      if (opts.initialState) {
        if (opts.mergeState) {
          // When mergeState is true, create child state from initial state
          currentState = opts.initialState.createChildState();
        } else {
          // When mergeState is false, create completely isolated state
          currentState = this.stateService!.createChildState();
        }
      } else {
        // No initial state, create fresh state
        currentState = this.stateService!.createChildState();
      }

      if (!currentState) {
        throw new MeldInterpreterError(
          'Failed to initialize state for interpretation',
          'initialization'
        );
      }

      if (opts.filePath) {
        currentState.setCurrentFilePath(opts.filePath);
      }

      // Take a snapshot of initial state for rollback
      const initialSnapshot = currentState.clone();
      let lastGoodState = initialSnapshot;

      logger.debug('Starting interpretation', {
        nodeCount: nodes?.length ?? 0,
        filePath: opts.filePath,
        mergeState: opts.mergeState
      });

      for (const node of nodes) {
        try {
          // Process the node with current state
          const updatedState = await this.interpretNode(node, currentState);

          // If successful, update the states
          currentState = updatedState;
          lastGoodState = currentState.clone();

          // Do not merge back to parent state here - wait until all nodes are processed
        } catch (error) {
          // Roll back to last good state
          currentState = lastGoodState.clone();

          // Preserve MeldInterpreterError or wrap other errors
          if (error instanceof MeldInterpreterError) {
            throw error;
          }
          throw new MeldInterpreterError(
            getErrorMessage(error),
            node.type,
            convertLocation(node.location),
            {
              cause: error instanceof Error ? error : undefined,
              context: {
                nodeType: node.type,
                location: convertLocation(node.location),
                state: {
                  filePath: currentState.getCurrentFilePath() ?? undefined
                }
              }
            }
          );
        }
      }

      // Only merge back to parent state after all nodes are processed successfully
      if (opts.mergeState && opts.initialState) {
        try {
          opts.initialState.mergeChildState(currentState);
          // Return the parent state after successful merge
          return opts.initialState;
        } catch (error) {
          logger.error('Failed to merge child state', {
            error,
            filePath: currentState.getCurrentFilePath()
          });
          // Roll back to last good state
          currentState = lastGoodState.clone();
          throw new MeldInterpreterError(
            'Failed to merge child state: ' + getErrorMessage(error),
            'state_merge',
            undefined,
            {
              cause: error instanceof Error ? error : undefined,
              context: {
                filePath: currentState.getCurrentFilePath() ?? undefined,
                state: {
                  filePath: currentState.getCurrentFilePath() ?? undefined
                }
              }
            }
          );
        }
      } else {
        // When mergeState is false, ensure we return a completely isolated state
        const isolatedState = this.stateService!.createChildState();
        isolatedState.mergeChildState(currentState);
        isolatedState.setImmutable(); // Prevent further modifications
        return isolatedState;
      }

      logger.debug('Interpretation completed successfully', {
        nodeCount: nodes?.length ?? 0,
        filePath: currentState.getCurrentFilePath(),
        finalStateNodes: currentState.getNodes()?.length ?? 0,
        mergedToParent: opts.mergeState && opts.initialState
      });

      return currentState;
    } catch (error) {
      logger.error('Interpretation failed', {
        nodeCount: nodes?.length ?? 0,
        filePath: opts.filePath,
        error
      });

      // Preserve MeldInterpreterError or wrap other errors
      if (error instanceof MeldInterpreterError) {
        throw error;
      }
      throw new MeldInterpreterError(
        getErrorMessage(error),
        'interpretation',
        undefined,
        {
          cause: error instanceof Error ? error : undefined,
          context: {
            filePath: opts.filePath
          }
        }
      );
    }
  }

  async interpretNode(
    node: MeldNode,
    state: IStateService
  ): Promise<IStateService> {
    if (!node) {
      throw new MeldInterpreterError(
        'No node provided for interpretation',
        'interpretation'
      );
    }

    if (!state) {
      throw new MeldInterpreterError(
        'No state provided for node interpretation',
        'interpretation'
      );
    }

    if (!node.type) {
      throw new MeldInterpreterError(
        'Unknown node type',
        'interpretation',
        convertLocation(node.location)
      );
    }

    logger.debug('Interpreting node', {
      type: node.type,
      location: node.location,
      filePath: state.getCurrentFilePath()
    });

    try {
      // Take a snapshot before processing
      const preNodeState = state.clone();
      let currentState = preNodeState;

      // Process based on node type
      switch (node.type) {
        case 'Text':
          // Create new state for text node
          const textState = currentState.clone();
          textState.addNode(node);
          currentState = textState;
          break;

        case 'Comment':
          // Comments are ignored during interpretation
          break;

        case 'Directive':
          if (!this.directiveService) {
            throw new MeldInterpreterError(
              'Directive service not initialized',
              'directive_service'
            );
          }
          // Process directive with cloned state to maintain immutability
          const directiveState = currentState.clone();
          // Add the node first to maintain order
          directiveState.addNode(node);
          if (node.type !== 'Directive' || !('directive' in node) || !node.directive) {
            throw new MeldInterpreterError(
              'Invalid directive node',
              'invalid_directive',
              convertLocation(node.location)
            );
          }
          const directiveNode = node as DirectiveNode;
          currentState = await this.directiveService.processDirective(directiveNode, {
            state: directiveState,
            currentFilePath: state.getCurrentFilePath() ?? undefined
          });
          break;

        default:
          throw new MeldInterpreterError(
            `Unknown node type: ${node.type}`,
            'unknown_node',
            convertLocation(node.location)
          );
      }

      return currentState;
    } catch (error) {
      // Preserve MeldInterpreterError or wrap other errors
      if (error instanceof MeldInterpreterError) {
        throw error;
      }
      throw new MeldInterpreterError(
        getErrorMessage(error),
        node.type,
        convertLocation(node.location),
        {
          cause: error instanceof Error ? error : undefined,
          context: {
            nodeType: node.type,
            location: convertLocation(node.location),
            state: {
              filePath: state.getCurrentFilePath() ?? undefined
            }
          }
        }
      );
    }
  }

  async createChildContext(
    parentState: IStateService,
    filePath?: string
  ): Promise<IStateService> {
    this.ensureInitialized();

    if (!parentState) {
      throw new MeldInterpreterError(
        'No parent state provided for child context creation',
        'context_creation'
      );
    }

    try {
      // Create child state from parent
      const childState = parentState.createChildState();

      if (!childState) {
        throw new MeldInterpreterError(
          'Failed to create child state',
          'context_creation',
          undefined,
          {
            context: {
              parentFilePath: parentState.getCurrentFilePath() ?? undefined
            }
          }
        );
      }

      // Set file path if provided
      if (filePath) {
        childState.setCurrentFilePath(filePath);
      }

      logger.debug('Created child context', {
        parentFilePath: parentState.getCurrentFilePath(),
        childFilePath: filePath,
        hasParent: true
      });

      return childState;
    } catch (error) {
      logger.error('Failed to create child context', {
        parentFilePath: parentState.getCurrentFilePath(),
        childFilePath: filePath,
        error
      });

      // Preserve MeldInterpreterError or wrap other errors
      if (error instanceof MeldInterpreterError) {
        throw error;
      }
      throw new MeldInterpreterError(
        getErrorMessage(error),
        'context_creation',
        undefined,
        {
          cause: error instanceof Error ? error : undefined,
          context: {
            parentFilePath: parentState.getCurrentFilePath() ?? undefined,
            childFilePath: filePath,
            state: {
              filePath: parentState.getCurrentFilePath() ?? undefined
            }
          }
        }
      );
    }
  }

  private ensureInitialized(): void {
    if (!this.initialized || !this.directiveService || !this.stateService) {
      throw new MeldInterpreterError(
        'InterpreterService must be initialized before use',
        'initialization'
      );
    }
  }
}
```

\=== TEST USAGE ===

Processing...

## YOUR TASK

Perform a thorough audit of the StateService interface and implementation alignment:

1. Create a complete method inventory comparing IStateService.ts and StateService.ts:
   - List all methods in both files
   - Compare signatures exactly
   - Note any mismatches or inconsistencies
   - Flag methods that exist in one but not the other

2. Analyze usage patterns:
   - Find all places StateService methods are called in production code
   - Note any methods called that aren't in the interface
   - Identify any parameter type mismatches
   - List any undocumented assumptions about return types

3. Compare test usage to interface:
   - Check if tests call methods not in interface
   - Verify test assertions match interface contracts
   - Note any mock implementations that differ

## RESPONSE QUALITY REQUIREMENTS

1. EVIDENCE-BASED ANALYSIS
   - Every finding must reference specific code
   - Include relevant line numbers and file paths
   - Quote critical code segments when relevant
   - Link findings to specific test failures or logs

2. STRUCTURED OUTPUT
   - Use tables for comparisons and summaries
   - Use bullet points for lists of findings
   - Use code blocks for code examples
   - Use headers to organize sections

3. ACTIONABLE RESULTS
   - Clearly state each issue found
   - Provide concrete examples of problems
   - Link issues to specific code locations
   - Suggest specific next steps or areas for investigation

DO NOT GUESS. DO NOT GIVE HAND-WAVY ADVICE. BE EVIDENCE-BASED, EXPLICIT, AND DECISIVE.

SPECIFIC REQUIREMENTS:

- Create a detailed method comparison table
- Include line numbers for all findings
- Note any transformation-related methods specifically
- Flag any clone() or state management inconsistencies
- Identify any circular dependencies
- List all places where state is modified
