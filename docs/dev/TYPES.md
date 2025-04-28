# Meld Type System

## Overview

This document describes the core type system in Meld, focusing on the canonical types and their relationships. This is a living document that will be expanded as the type system evolves.

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