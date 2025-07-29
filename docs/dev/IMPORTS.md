# mlld Import Architecture

This document provides a comprehensive overview of mlld's import system, including how it manages namespacing, shadow environments, and module resolution.

## Table of Contents

1. [Overview](#overview)
2. [Import Types](#import-types)
3. [Architecture Components](#architecture-components)
4. [Import Flow](#import-flow)
5. [Namespace Management](#namespace-management)
6. [Shadow Environment Preservation](#shadow-environment-preservation)
7. [Module Resolution](#module-resolution)
8. [Variable Import and Export](#variable-import-and-export)
9. [Field Access Integration](#field-access-integration)
10. [Security and Validation](#security-and-validation)
11. [Error Handling](#error-handling)
12. [Implementation Details](#implementation-details)

## Overview

The mlld import system provides a flexible, secure way to share code between modules. It supports multiple import sources (local files, registry modules, URLs) and various import patterns (selected imports, namespace imports).

### Key Features
- **Module isolation**: Each module evaluates in its own environment
- **Automatic exports**: All top-level variables are exported by default
- **Shadow environment preservation**: Functions maintain access to their original context
- **Type preservation**: Variable types are maintained through import/export
- **Flexible resolution**: Support for local files, registry modules, and URLs

## Import Types

mlld supports three main import patterns:

### 1. Selected Imports
Import specific variables from a module:
```mlld
/import { helper, user } from @mlld/github
```

### 2. Namespace Imports
Import all exports under a namespace:
```mlld
/import @mlld/github as gh
```

### 3. Simple Imports
Import with default namespace (filename-based):
```mlld
/import "./utils.mld"
# Creates @utils namespace
```

## Architecture Components

### Core Components

1. **ImportDirectiveEvaluator** (`interpreter/eval/import/ImportDirectiveEvaluator.ts`)
   - Main coordinator for import evaluation
   - Routes imports based on type (input, resolver, module, file, URL)
   - Orchestrates the import pipeline

2. **ImportPathResolver** (`interpreter/eval/import/ImportPathResolver.ts`)
   - Determines import type from path patterns
   - Handles special imports (@input, @env, @base)
   - Validates import paths

3. **ModuleContentProcessor** (`interpreter/eval/import/ModuleContentProcessor.ts`)
   - Creates isolated child environments
   - Evaluates module content
   - Extracts exported variables
   - Handles frontmatter

4. **VariableImporter** (`interpreter/eval/import/VariableImporter.ts`)
   - Creates variables from imported values
   - Handles namespace creation
   - Manages type preservation
   - Serializes/deserializes shadow environments

5. **ImportSecurityValidator** (`interpreter/eval/import/ImportSecurityValidator.ts`)
   - Circular import detection
   - Security validation
   - Import approval system

### Resolver System

The resolver system handles different import sources:

1. **ResolverManager** (`core/resolvers/ResolverManager.ts`)
   - Priority-based resolver routing
   - Prefix configuration (@user/module patterns)
   - Unified interface for content sources

2. **Resolver Types**:
   - **RegistryResolver**: Handles @user/module patterns
   - **LocalResolver**: Local file imports
   - **HTTPResolver**: URL imports
   - **ProjectPathResolver**: @base and project paths

## Import Flow

### High-Level Flow

```
Import Directive → Path Resolution → Content Fetching → Module Evaluation → Variable Import
```

### Detailed Steps

1. **Import Directive Parsing**
   ```typescript
   /import { var1, var2 } from "./module.mld"
   ```
   - AST parser creates ImportDirective node
   - Directive contains import type, path, and variable selections

2. **Path Resolution**
   ```typescript
   ImportPathResolver.resolveImportType(path)
   // Returns: 'input' | 'resolver' | 'module' | 'file' | 'url'
   ```

3. **Content Resolution**
   - For registry modules: Fetch from GitHub gist
   - For local files: Read from filesystem
   - For URLs: Fetch with security validation

4. **Module Evaluation**
   ```typescript
   // Create isolated environment
   const childEnv = env.createChild(importDir);
   
   // Evaluate module AST
   const result = await evaluate(ast, childEnv);
   
   // Extract exports
   const exports = processModuleExports(childEnv.getCurrentVariables());
   ```

5. **Variable Import**
   - Selected imports: Create individual variables
   - Namespace imports: Create namespace object
   - Type preservation and metadata attachment

## Namespace Management

### Namespace Creation

Namespaces are created as ObjectVariables with special metadata:

```typescript
function createNamespaceVariable(
  alias: string, 
  moduleObject: Record<string, any>, 
  importPath: string
): Variable {
  return createObjectVariable(
    alias,
    moduleObject,
    isComplex, // true if contains executables/AST
    source,
    {
      isImported: true,
      importPath,
      isNamespace: true // Special namespace marker
    }
  );
}
```

### Namespace Structure

A namespace object contains all exported variables at the top level:
```javascript
// @gh namespace after import
{
  pr: {
    review: [ExecutableVariable],
    view: [ExecutableVariable]
  },
  issues: {
    list: [ExecutableVariable]
  }
}
```

### Field Access on Namespaces

Field access traverses the namespace structure:
```mlld
/import @mlld/github as gh
/run @gh.pr.review("123", "repo", "approve", "LGTM")
```

The field access resolution:
1. Resolve `@gh` → namespace variable
2. Access `.pr` → nested object
3. Access `.review` → executable variable
4. Execute with arguments

## Shadow Environment Preservation

### The Problem

When functions are defined in one module and imported into another, they need access to:
- Other functions defined in the same module
- The module's execution context
- Language-specific shadow environments

### The Solution: Lexical Capture

Shadow environments are captured at definition time and preserved through import/export:

```typescript
// During executable creation (exe.ts)
const variable = createExecutableVariable(
  identifier,
  executableDef.type,
  template,
  paramNames,
  language,
  source,
  {
    executableDef,
    // Capture all shadow environments
    capturedShadowEnvs: env.captureAllShadowEnvs()
  }
);
```

### Serialization During Export

```typescript
// In processModuleExports (VariableImporter.ts)
if (variable.type === 'executable') {
  moduleObject[name] = {
    __executable: true,
    value: execVar.value,
    executableDef: execVar.metadata?.executableDef,
    metadata: {
      ...execVar.metadata,
      // Serialize Maps to objects for JSON
      capturedShadowEnvs: serializeShadowEnvs(capturedShadowEnvs)
    }
  };
}
```

### Deserialization During Import

```typescript
// In createExecutableFromImport (VariableImporter.ts)
if (originalMetadata.capturedShadowEnvs) {
  originalMetadata = {
    ...originalMetadata,
    // Convert objects back to Maps
    capturedShadowEnvs: deserializeShadowEnvs(capturedShadowEnvs)
  };
}
```

### Resolution During Execution

```typescript
// In shadow environment resolution (shadowEnvResolver.ts)
function resolveShadowEnvironment(
  language: string,
  capturedEnvs: ShadowEnvironmentCapture | undefined,
  currentEnv: Environment
): Map<string, any> | undefined {
  // Priority: captured (lexical) > current (dynamic)
  if (capturedEnvs?.[language]?.size > 0) {
    return capturedEnvs[language];
  }
  return currentEnv.getShadowEnv(language);
}
```

### Retroactive Capture

For circular dependencies within shadow environments:

```typescript
// In exe.ts - environment declaration
// First: Set up shadow environment
env.setShadowEnv(language, shadowFunctions);

// Then: Capture complete environment (including all functions)
const capturedEnvs = env.captureAllShadowEnvs();

// Finally: Update all executables with captured environment
for (const funcVar of shadowFunctions.values()) {
  funcVar.metadata.capturedShadowEnvs = capturedEnvs;
}
```

## Module Resolution

### Resolution Pipeline

1. **Path Type Detection**
   ```typescript
   if (path.startsWith('@') && path.includes('/')) {
     // Registry module: @user/module
   } else if (path.startsWith('./') || path.startsWith('../')) {
     // Relative local file
   } else if (path.startsWith('http')) {
     // URL import
   }
   ```

2. **Resolver Selection**
   - ResolverManager checks each resolver's `canResolve()` method
   - Resolvers are checked in priority order
   - First matching resolver handles the import

3. **Content Fetching**
   - Registry: Fetch from GitHub gist via registry API
   - Local: Read file with proper path resolution
   - URL: Fetch with security validation

### Registry Resolution

Registry modules follow a specific flow:
```
@mlld/github → registry.json lookup → gist URL → fetch content
```

The registry provides metadata including:
- Content hash for integrity checking
- Author information
- Dependencies
- Version compatibility

## Variable Import and Export

### Automatic Export

All top-level variables are exported except:
- System variables (marked with `isSystem: true`)
- Variables starting with underscore (future convention)

```typescript
function isLegitimateVariableForExport(variable: Variable): boolean {
  // System variables (like @fm) should not be exported
  if (variable.metadata?.isSystem) {
    return false;
  }
  return true;
}
```

### Type Preservation

Variable types are preserved through import/export:

```typescript
function createVariableFromValue(
  name: string,
  value: any,
  importPath: string,
  originalName?: string
): Variable {
  // Detect executable exports
  if (value?.__executable) {
    return createExecutableFromImport(name, value, source, metadata);
  }
  
  // Infer type from value
  const originalType = inferVariableType(value);
  
  // Create appropriate variable type
  if (originalType === 'object') {
    return createObjectVariable(name, value, isComplex, source, metadata);
  }
  
  return createImportedVariable(name, value, originalType, ...);
}
```

### Complex Content Handling

Objects containing AST nodes or executables are marked as complex:

```typescript
function hasComplexContent(value: any): boolean {
  if (value?.type) return true; // AST node
  if (value?.__executable) return true; // Executable
  if (Array.isArray(value)) {
    return value.some(item => hasComplexContent(item));
  }
  if (typeof value === 'object' && value !== null) {
    return Object.values(value).some(hasComplexContent);
  }
  return false;
}
```

## Field Access Integration

### Variable Reference Resolution

Field access on imported variables preserves type information:

```typescript
// In interpreter.ts
if (varRef.fields && varRef.fields.length > 0) {
  let value = await extractVariableValue(baseVar, env);
  
  // Navigate through fields
  for (const field of varRef.fields) {
    const fieldResult = accessField(value, field, {
      preserveContext: true,
      returnUndefinedForMissing: context?.isCondition
    });
    value = fieldResult.value;
  }
}
```

### Executable Field Access

Special handling for executable objects in namespaces:

```typescript
// Detect serialized executable
if (value?.__executable) {
  // Reconstruct ExecutableVariable
  execVar = {
    type: 'executable',
    name: fullPath,
    value: value.value,
    metadata: {
      ...value.metadata,
      executableDef: value.executableDef
    }
  };
}
```

## Security and Validation

### Circular Import Detection

Stack-based tracking prevents infinite loops:

```typescript
class ImportSecurityValidator {
  private importStack: string[] = [];
  
  beginImport(path: string): void {
    if (this.importStack.includes(path)) {
      throw new Error(`Circular import detected: ${
        [...this.importStack, path].join(' → ')
      }`);
    }
    this.importStack.push(path);
  }
  
  endImport(path: string): void {
    this.importStack = this.importStack.filter(p => p !== path);
  }
}
```

### Content Validation

- Hash verification for registry modules
- URL domain restrictions
- Import approval system for interactive mode

## Error Handling

### Import Errors

Errors maintain context through the import chain:

```typescript
class MlldImportError extends MlldError {
  constructor(
    message: string,
    location?: SourceLocation,
    public importContext?: {
      importPath: string;
      importType: string;
      childError?: Error;
    }
  ) {
    super(message, location);
  }
}
```

### Parse Error Enhancement

Parse errors in imported files include import context:

```typescript
catch (parseError) {
  const errorMessage = `Syntax error in imported file '${resolvedPath}' at line ${
    parseError.location?.start?.line || '?'
  }: ${parseError.message}`;
  
  const importError = new Error(errorMessage);
  importError.importParseError = {
    file: path.basename(resolvedPath),
    line: parseError.location?.start?.line,
    message: parseError.message
  };
  throw importError;
}
```

## Implementation Details

### Environment Isolation

Each module evaluates in a child environment:

```typescript
// Create child with proper base path
const importDir = isURL ? env.getBasePath() : path.dirname(resolvedPath);
const childEnv = env.createChild(importDir);

// Set current file path for error reporting
childEnv.setCurrentFilePath(resolvedPath);

// Evaluate in isolation
const result = await evaluate(ast, childEnv);
```

### Variable Scoping

- Child environment variables don't pollute parent
- Explicit export/import creates controlled sharing
- Shadow environments use lexical + dynamic scoping hybrid

### Performance Considerations

1. **Module Caching**: Resolved modules are cached by path
2. **Complex Content Detection**: Could benefit from memoization
3. **Shadow Environment Capture**: Only captured when needed
4. **Field Access**: Direct object traversal, no string parsing

