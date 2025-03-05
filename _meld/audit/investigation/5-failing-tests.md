# Failing Tests Analysis

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

\=== API TEST FAILURES ===

Processing...

\=== OUTPUT SERVICE TEST FAILURES ===

Processing...

\=== RELEVANT IMPLEMENTATION CODE ===

Processing...Processing....# StateService.ts

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
# DirectiveService.ts

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

\=== TEST EXECUTION OUTPUT ===

> meld@10.0.0 test
> vitest run tests/api/api.test.ts tests/services/OutputService/OutputService.test.ts ; echo "Test execution complete"

 RUN  v2.1.9 /Users/adam/dev/meld

stdout | services/DirectiveService/handlers/execution/ImportDirectiveHandler.transformation.test.ts > ImportDirectiveHandler Transformation > transformation behavior > should preserve error handling in transformation mode
2025-02-21 14:41:17 [error] [directive] Failed to process import directive
{
  "location": {
    "start": {
      "line": 1,
      "column": 1
    },
    "end": {
      "line": 1,
      "column": 1
    }
  },
  "error": {
    "name": "DirectiveError",
    "message": "Directive error (import): Import file not found: [missing.meld] at line 1, column 1 in test.meld",
    "kind": "import",
    "code": "FILE_NOT_FOUND",
    "location": {
      "start": {
        "line": 1,
        "column": 1
      },
      "end": {
        "line": 1,
        "column": 1
      }
    },
    "filePath": "test.meld"
  }
}

stdout | services/DirectiveService/handlers/execution/RunDirectiveHandler.transformation.test.ts > RunDirectiveHandler Transformation > transformation behavior > should preserve error handling during transformation
2025-02-21 14:41:17 [error] [directive] Error executing run directive: Command failed
{
  "stack": "Error: Command failed\n    at /Users/adam/dev/meld/services/DirectiveService/handlers/execution/RunDirectiveHandler.transformation.test.ts:150:69\n    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:146:14\n    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:533:11\n    at runWithTimeout (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:39:7)\n    at runTest (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1056:17)\n    at processTicksAndRejections (node:internal/process/task_queues:105:5)\n    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)\n    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)\n    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)\n    at runFiles (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1262:5)"
}

 ✓ services/DirectiveService/handlers/execution/ImportDirectiveHandler.transformation.test.ts (4 tests) 7ms
 ✓ services/DirectiveService/handlers/execution/RunDirectiveHandler.transformation.test.ts (5 tests) 7ms
 ✓ services/DirectiveService/handlers/execution/EmbedDirectiveHandler.transformation.test.ts (7 tests) 7ms
 ✓ services/DirectiveService/handlers/execution/EmbedDirectiveHandler.test.ts (8 tests) 13ms
stdout | services/DirectiveService/handlers/execution/RunDirectiveHandler.test.ts > RunDirectiveHandler > error handling > should handle validation errors
2025-02-21 14:41:18 [error] [directive] Error executing run directive: Directive error (run): Invalid command
{
  "kind": "run",
  "code": "VALIDATION_FAILED",
  "name": "DirectiveError",
  "stack": "DirectiveError: Directive error (run): Invalid command\n    at /Users/adam/dev/meld/services/DirectiveService/handlers/execution/RunDirectiveHandler.test.ts:183:9\n    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:146:14\n    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:533:11\n    at runWithTimeout (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:39:7)\n    at runTest (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1056:17)\n    at processTicksAndRejections (node:internal/process/task_queues:105:5)\n    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)\n    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)\n    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)\n    at runFiles (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1262:5)"
}

stdout | services/DirectiveService/handlers/execution/RunDirectiveHandler.test.ts > RunDirectiveHandler > error handling > should handle resolution errors
2025-02-21 14:41:18 [error] [directive] Error executing run directive: Variable not found
{
  "stack": "Error: Variable not found\n    at /Users/adam/dev/meld/services/DirectiveService/handlers/execution/RunDirectiveHandler.test.ts:199:9\n    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:146:14\n    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:533:11\n    at runWithTimeout (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:39:7)\n    at runTest (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1056:17)\n    at processTicksAndRejections (node:internal/process/task_queues:105:5)\n    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)\n    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)\n    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)\n    at runFiles (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1262:5)"
}

stdout | services/DirectiveService/handlers/execution/RunDirectiveHandler.test.ts > RunDirectiveHandler > error handling > should handle command execution errors
2025-02-21 14:41:18 [error] [directive] Error executing run directive: Command failed
{
  "stack": "Error: Command failed\n    at /Users/adam/dev/meld/services/DirectiveService/handlers/execution/RunDirectiveHandler.test.ts:216:9\n    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:146:14\n    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:533:11\n    at runWithTimeout (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:39:7)\n    at runTest (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1056:17)\n    at processTicksAndRejections (node:internal/process/task_queues:105:5)\n    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)\n    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)\n    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)\n    at runFiles (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1262:5)"
}

 ✓ services/DirectiveService/handlers/execution/RunDirectiveHandler.test.ts (10 tests) 17ms
stdout | services/DirectiveService/handlers/execution/ImportDirectiveHandler.test.ts > ImportDirectiveHandler > special path variables > should throw error if resolved path does not exist
2025-02-21 14:41:18 [error] [directive] Failed to process import directive
{
  "location": {
    "start": {
      "line": 1,
      "column": 1
    },
    "end": {
      "line": 1,
      "column": 1
    }
  },
  "error": {
    "name": "DirectiveError",
    "message": "Directive error (import): Import file not found: [$./nonexistent.meld] at line 1, column 1",
    "kind": "import",
    "code": "FILE_NOT_FOUND",
    "location": {
      "start": {
        "line": 1,
        "column": 1
      },
      "end": {
        "line": 1,
        "column": 1
      }
    }
  }
}

stdout | services/DirectiveService/handlers/execution/ImportDirectiveHandler.test.ts > ImportDirectiveHandler > basic importing > should handle invalid import list syntax
2025-02-21 14:41:18 [error] [directive] Failed to process import directive
{
  "location": {
    "start": {
      "line": 1,
      "column": 1
    },
    "end": {
      "line": 1,
      "column": 1
    }
  },
  "error": {
    "name": "DirectiveError",
    "message": "Directive error (import): Variable not found: invalid syntax",
    "kind": "import",
    "code": "VARIABLE_NOT_FOUND"
  }
}

stdout | services/DirectiveService/handlers/execution/ImportDirectiveHandler.test.ts > ImportDirectiveHandler > error handling > should handle validation errors
2025-02-21 14:41:18 [error] [directive] Failed to process import directive
{
  "location": {
    "start": {
      "line": 1,
      "column": 1
    },
    "end": {
      "line": 1,
      "column": 1
    }
  },
  "error": {
    "name": "DirectiveError",
    "message": "Directive error (import): Invalid import",
    "kind": "import"
  }
}

stdout | services/DirectiveService/handlers/execution/ImportDirectiveHandler.test.ts > ImportDirectiveHandler > error handling > should handle circular imports
2025-02-21 14:41:18 [error] [directive] Failed to process import directive
{
  "location": {
    "start": {
      "line": 1,
      "column": 1
    },
    "end": {
      "line": 1,
      "column": 1
    }
  },
  "error": {
    "name": "DirectiveError",
    "message": "Directive error (import): Directive error (import): Circular import detected at line 1, column 1 in test.meld | Caused by: Directive error (import): Circular import detected",
    "kind": "import",
    "location": {
      "start": {
        "line": 1,
        "column": 1
      },
      "end": {
        "line": 1,
        "column": 1
      }
    },
    "filePath": "test.meld",
    "cause": "Directive error (import): Circular import detected",
    "fullCauseMessage": "Directive error (import): Circular import detected"
  }
}

stdout | services/DirectiveService/handlers/execution/ImportDirectiveHandler.test.ts > ImportDirectiveHandler > error handling > should handle parse errors
2025-02-21 14:41:18 [error] [directive] Failed to process import directive
{
  "location": {
    "start": {
      "line": 1,
      "column": 1
    },
    "end": {
      "line": 1,
      "column": 1
    }
  },
  "error": {
    "name": "DirectiveError",
    "message": "Directive error (import): Import file not found: [[invalid.meld]] at line 1, column 1 in test.meld",
    "kind": "import",
    "code": "FILE_NOT_FOUND",
    "location": {
      "start": {
        "line": 1,
        "column": 1
      },
      "end": {
        "line": 1,
        "column": 1
      }
    },
    "filePath": "test.meld"
  }
}

stdout | services/DirectiveService/handlers/execution/ImportDirectiveHandler.test.ts > ImportDirectiveHandler > error handling > should handle interpretation errors
2025-02-21 14:41:18 [error] [directive] Failed to process import directive
{
  "location": {
    "start": {
      "line": 1,
      "column": 1
    },
    "end": {
      "line": 1,
      "column": 1
    }
  },
  "error": {
    "name": "DirectiveError",
    "message": "Directive error (import): Import file not found: [[error.meld]] at line 1, column 1 in test.meld",
    "kind": "import",
    "code": "FILE_NOT_FOUND",
    "location": {
      "start": {
        "line": 1,
        "column": 1
      },
      "end": {
        "line": 1,
        "column": 1
      }
    },
    "filePath": "test.meld"
  }
}

stdout | services/DirectiveService/handlers/execution/ImportDirectiveHandler.test.ts > ImportDirectiveHandler > cleanup > should always end import tracking
2025-02-21 14:41:18 [error] [directive] Failed to process import directive
{
  "location": {
    "start": {
      "line": 1,
      "column": 1
    },
    "end": {
      "line": 1,
      "column": 1
    }
  },
  "error": {}
}

 ✓ services/DirectiveService/handlers/execution/ImportDirectiveHandler.test.ts (15 tests | 2 skipped) 21ms

 Test Files  6 passed (6)
      Tests  47 passed | 2 todo (49)
   Start at  14:41:17
   Duration  518ms (transform 250ms, setup 1.50s, collect 143ms, tests 73ms, environment 1ms, prepare 379ms)

## YOUR TASK

Perform a thorough analysis of the failing tests:

1. Map API Test Failures:
   - Document exact error messages
   - Trace the execution path to failure
   - Note any mock service usage
   - Check state management flow

2. Analyze OutputService Failures:
   - List all failing transformation tests
   - Check transformation mode setup
   - Verify directive processing
   - Note any state persistence issues

3. Compare Failing vs Passing Tests:
   - Find similar passing test cases
   - Note differences in setup/mocks
   - Check for pattern in failures
   - Map any shared assumptions

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

- Create a failure analysis matrix
- Document all error messages
- Map test setup differences
- Note any mock inconsistencies
- List state management issues
- Track transformation problems
