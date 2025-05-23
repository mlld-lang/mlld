# Meld Type System

## Overview

This document describes the core type system in Meld, focusing on the AST-centric approach where all intelligence lives in the types themselves through discriminated unions. The type system follows the "AST Knows All" principle.

## AST Node Types (Discriminated Unions)

The foundation of Meld's type system is the AST node hierarchy, which uses discriminated unions for type safety:

```typescript
// Base interface for all AST nodes
interface BaseMeldNode {
  type: string;       // Discriminator field
  nodeId: string;     // Unique identifier
  location?: Location; // Source position
}

// Specific node types
interface TextNode extends BaseMeldNode {
  type: 'Text';
  content: string;
}

interface DirectiveNode extends BaseMeldNode {
  type: 'Directive';
  kind: DirectiveKind; // 'text' | 'data' | 'path' | 'run' | etc.
  subtype: string;     // 'assignment' | 'template' | etc.
  values: DirectiveValues;
  raw: RawDirectiveData;
  meta?: DirectiveMetadata;
}

interface VariableReferenceNode extends BaseMeldNode {
  type: 'VariableReference';
  identifier: string;
  fields?: Field[];  // For dot notation access
}

// The discriminated union of all node types
type MeldNode = 
  | TextNode 
  | DirectiveNode 
  | VariableReferenceNode
  | CodeFenceNode
  | CommentNode
  | LiteralNode
  | DotSeparatorNode
  | PathSeparatorNode;
```

### Type Narrowing with Discriminated Unions

The `type` field enables TypeScript to narrow types safely:

```typescript
function processNode(node: MeldNode) {
  switch (node.type) {
    case 'Text':
      // TypeScript knows node is TextNode
      console.log(node.content);
      break;
    
    case 'Directive':
      // TypeScript knows node is DirectiveNode
      switch (node.kind) {
        case 'text':
          handleTextDirective(node);
          break;
        case 'data':
          handleDataDirective(node);
          break;
      }
      break;
      
    case 'VariableReference':
      // TypeScript knows node is VariableReferenceNode
      resolveVariable(node.identifier, node.fields);
      break;
  }
}
```

## Handler Types

The handler pattern uses specific types for processing directives:

```typescript
// Handler interface - minimal and focused
interface IDirectiveHandler {
  readonly kind: string;
  handle(
    directive: DirectiveNode,
    state: IStateService,
    options: HandlerOptions
  ): Promise<DirectiveResult>;
}

// Handler options
interface HandlerOptions {
  strict: boolean;
  filePath?: string;
}

// Handler result - returns changes as data
interface DirectiveResult {
  stateChanges?: StateChanges;
  replacement?: MeldNode[];  // For transformation mode
  error?: MeldError;
}

// State changes - immutable data structure
interface StateChanges {
  variables?: Record<string, MeldVariable>;
}
```

## Minimal Service Interfaces

Services have been simplified to focus on their core responsibilities:

```typescript
// Minimal state service - just 8 methods
interface IStateService {
  readonly stateId: string;
  currentFilePath: string | null;
  
  // Variable operations
  getVariable(name: string): MeldVariable | undefined;
  setVariable(variable: MeldVariable): void;
  getAllVariables(): Map<string, MeldVariable>;
  
  // Node operations
  addNode(node: MeldNode): void;
  getNodes(): MeldNode[];
  
  // State hierarchy
  createChild(): IStateService;
}

// Minimal resolution service - consolidated from 15+ methods to 4
interface IResolutionService {
  // Single entry point for all resolution
  resolve(input: ResolutionInput): Promise<string>;
  
  // Path-specific resolution
  resolvePath(path: string, context: ResolutionContext): Promise<string>;
  
  // Section extraction (consider moving to handler)
  extractSection(content: string, section: string): string;
}

// Minimal directive service - single responsibility
interface IDirectiveService {
  handleDirective(
    directive: DirectiveNode,
    state: IStateService,
    options: DirectiveOptions
  ): Promise<DirectiveResult>;
}

// Minimal interpreter service
interface IInterpreterService {
  interpret(
    nodes: MeldNode[],
    options: InterpreterOptions,
    initialState?: IStateService
  ): Promise<InterpretationResult>;
}

// Minimal parser service
interface IParserService {
  parse(content: string): ParseResult;
}

// Minimal output service
interface IOutputService {
  format(
    nodes: MeldNode[],
    format: OutputFormat,
    options?: OutputOptions
  ): string;
}
```

### Supporting Types

```typescript
// Resolution types
interface ResolutionInput {
  value: string | InterpolatableValue;
  context: ResolutionContext;
  type: 'text' | 'path' | 'command';
}

interface ResolutionContext {
  state: IStateService;
  basePath: string;
  currentFilePath: string;
}

// Directive processing types
interface DirectiveOptions {
  fs: IFileSystemService;
  resolver: IResolutionService;
  transformationEnabled?: boolean;
}

interface DirectiveResult {
  stateChanges?: StateChanges;
  output?: string;
  error?: Error;
}

interface StateChanges {
  variables?: Record<string, MeldVariable>;
  nodes?: MeldNode[];
  filePath?: string;
  childStates?: StateChanges[]; // For imports
}

// Interpreter types
interface InterpreterOptions {
  transformationEnabled?: boolean;
  outputFormat?: string;
}

interface InterpretationResult {
  state: IStateService;
  output?: string;
  error?: Error;
}

// Parser types
interface ParseResult {
  nodes: MeldNode[];
  parseErrors: ParseError[];
}

// Output types
type OutputFormat = 'text' | 'markdown' | 'json' | 'xml';

interface OutputOptions {
  includeComments?: boolean;
  preserveFormatting?: boolean;
}
```

## Type Flow Through the System

The type system ensures safe data flow through the pipeline:

1. **Parser** → produces `MeldNode[]` (discriminated union)
2. **Interpreter** → processes each `MeldNode` based on its `type`
3. **Handlers** → receive specific `DirectiveNode` subtypes, return `DirectiveResult`
4. **State** → updated with `StateChanges` from handlers
5. **Output** → formats final `MeldNode[]` based on types

## Core Type Categories

### Variable Types

The foundation of Meld's type system is built around variables and their types:

```typescript
// Core variable types
export enum VariableType {
  TEXT = 'text',
  DATA = 'data',
  PATH = 'path',
  COMMAND = 'command'
}

// Base interface for all variables
export interface MeldVariable {
  name: string;
  type: VariableType;
  value: any; // Specific to each variable type
}

// Specific variable interfaces
export interface TextVariable extends MeldVariable {
  type: VariableType.TEXT;
  value: string;
}

export interface DataVariable extends MeldVariable {
  type: VariableType.DATA;
  value: any; // Can be any JSON-serializable value
}

export interface PathVariable extends MeldVariable {
  type: VariableType.PATH;
  value: string; // Normalized path string
}

export interface CommandVariable extends MeldVariable {
  type: VariableType.COMMAND;
  value: ICommandDefinition;
}
```

### State Types

The state system builds upon these variable types:

```typescript
export interface StateChanges {
  textVars?: Map<string, string>;
  dataVars?: Map<string, any>;
  pathVars?: Map<string, string>;
  commandVars?: Map<string, ICommandDefinition>;
}

export interface IStateService {
  // Core variable operations
  getVariable(name: string, type?: VariableType): MeldVariable | undefined;
  setVariable(variable: MeldVariable): Promise<MeldVariable>;
  hasVariable(name: string, type?: VariableType): boolean;
  
  // Type-specific operations
  getTextVar(name: string): TextVariable | undefined;
  getDataVar(name: string): DataVariable | undefined;
  getPathVar(name: string): PathVariable | undefined;
  getCommandVar(name: string): CommandVariable | undefined;
  
  // State management
  applyStateChanges(changes: StateChanges): Promise<IStateService>;
}
```

## Service Interface Types

Key service interfaces have been updated to use these canonical types consistently. Some examples:

```typescript
export interface IDirectiveService {
  handleDirective(node: DirectiveNode, state: IStateService): Promise<DirectiveResult>;
  // ... other methods
}

export interface IDirectiveHandler {
  canHandle(node: DirectiveNode): boolean;
  handle(node: DirectiveNode, state: IStateService): Promise<DirectiveResult>;
}
```

## Type Guards

The system includes type guards to ensure type safety:

```typescript
export function isTextVariable(variable: MeldVariable): variable is TextVariable {
  return variable.type === VariableType.TEXT;
}

export function isDataVariable(variable: MeldVariable): variable is DataVariable {
  return variable.type === VariableType.DATA;
}

// ... other type guards
```

## Future Work

Areas that need further documentation:

1. Detailed type hierarchies for AST nodes
2. Service-specific type relationships
3. Type transformation patterns
4. Variable resolution type flow
5. State inheritance type patterns

Note: This document will be expanded as we continue to evolve and document the type system. 