# Import Resolution System Refactoring Guide

## Executive Summary

The `interpreter/eval/import.ts` file (1,222 lines) is a critical but monolithic component that handles all import directive evaluation in mlld. This guide provides a detailed breakdown of its complexities and a comprehensive refactoring strategy to extract it into focused, maintainable modules while preserving the intricate import semantics and security mechanisms.

## Current Analysis

### File Structure Overview

**Size**: 1,222 lines  
**Primary Function**: `evaluateImport` - Main entry point for all import directives  
**Key Dependencies**: Environment, ResolverManager, Variable type system, HashUtils

### Core Responsibilities Identified

1. **Import Dispatch & Routing** (Lines 680-804)
   - Main `evaluateImport` function
   - Import type detection (file, module, resolver, input)
   - Path interpolation and resolution routing
   - Special case handling (@INPUT, @stdin, resolver imports)

2. **Module Content Processing** (Lines 369-672, 809-977)
   - File/URL content reading and parsing
   - AST evaluation in child environments
   - JSON file special handling
   - Section extraction for markdown files

3. **Variable Creation & Type Inference** (Lines 196-284, 322-334)
   - `createVariableFromValue` - Infers types and creates appropriate Variable objects
   - Executable variable reconstruction from exported metadata
   - Primitive type handling and conversion

4. **Object Reference Resolution** (Lines 31-140)
   - `resolveObjectReferences` - Handles complex AST node resolution
   - Variable reference substitution in nested objects
   - Executable variable special serialization format

5. **Module Export Processing** (Lines 145-191)
   - `processModuleExports` - Converts child environment variables to exports
   - Frontmatter extraction and module metadata handling
   - Auto-export generation vs explicit module variables

6. **Security & Validation** (Lines 378-428, 402-428, 541-574)
   - Circular import detection and prevention
   - Content hash validation (full and short hash support)
   - Version compatibility checking
   - Import approval integration

7. **Resolver & Special Import Handling** (Lines 1015-1223)
   - Built-in resolver imports (@TIME, @DEBUG, @INPUT, @PROJECTPATH)
   - Environment variable import handling
   - Format-specific resolver data extraction

## Critical Complexities and Dependencies

### 1. **Multi-Path Import Resolution Flow**
The import resolution has multiple branching paths based on import source type:
- **File/URL paths**: Direct file reading → parsing → evaluation
- **Module references**: Resolver system → content validation → processing
- **Built-in resolvers**: Direct resolver invocation → data formatting
- **Input imports**: Environment/stdin data → JSON parsing → variable creation

### 2. **Variable Type System Integration**
Deep integration with mlld's discriminated union variable system:
- Type inference from imported values (`inferVariableType`)
- Executable variable reconstruction from serialized metadata
- Complex object handling with AST node preservation
- Cross-module variable reference resolution

### 3. **Security & Integrity Mechanisms**
Multiple layers of security validation:
- **Circular import detection**: Environment-based import stack tracking
- **Content hash validation**: SHA-256 hash verification with short hash support  
- **Version compatibility**: Frontmatter-based mlld version checking
- **Import approval**: URL import user approval workflow

### 4. **Resolver System Integration**
Complex integration with the unified resolver architecture:
- **Prefix-based routing**: @user/module patterns → Registry resolver
- **Built-in resolver handling**: @TIME, @DEBUG direct invocation
- **Context-specific resolution**: Different behavior for import vs path contexts
- **Liberal syntax support**: Quoted module references with fallback logic

### 5. **AST and Content Processing**
Sophisticated content handling across multiple formats:
- **mlld file parsing**: Full AST evaluation in child environments
- **JSON file processing**: Automatic JSON parsing with property extraction
- **Section extraction**: Markdown header-based content filtering  
- **Frontmatter processing**: YAML metadata parsing and validation

## Proposed Refactoring Architecture

### Target Module Structure

```
interpreter/eval/import/
├── ImportDirectiveEvaluator.ts     # Main coordination & dispatch (~200 lines)
├── ImportPathResolver.ts           # Path resolution & routing (~250 lines)
├── ModuleContentProcessor.ts       # Content parsing & AST evaluation (~300 lines)
├── VariableImporter.ts            # Variable creation & merging (~250 lines)
├── ImportSecurityValidator.ts     # Security checks & validation (~150 lines)
└── ObjectReferenceResolver.ts     # Object reference resolution (~120 lines)
```

### Module Breakdown and Responsibilities

#### 1. ImportDirectiveEvaluator.ts (Main Coordinator)
**Responsibility**: Entry point coordination and high-level import dispatch

```typescript
export class ImportDirectiveEvaluator {
  constructor(
    private pathResolver: ImportPathResolver,
    private contentProcessor: ModuleContentProcessor,
    private variableImporter: VariableImporter,
    private securityValidator: ImportSecurityValidator
  ) {}

  async evaluateImport(directive: DirectiveNode, env: Environment): Promise<EvalResult> {
    // 1. Determine import type and route appropriately
    // 2. Coordinate between components
    // 3. Handle top-level error cases
    // 4. Return standardized results
  }
}
```

**Key Methods**:
- `evaluateImport()` - Main entry point (replaces current function)
- `determineImportType()` - Classify import type (file/module/resolver/input)
- `routeImportRequest()` - Dispatch to appropriate handler
- `handleImportError()` - Centralized error handling and context

#### 2. ImportPathResolver.ts (Path Resolution & Routing)
**Responsibility**: Import path processing and resolution routing

```typescript
export class ImportPathResolver {
  constructor(private env: Environment) {}

  async resolveImportPath(directive: DirectiveNode): Promise<ImportResolution> {
    // Handle path interpolation, variable resolution, and routing decisions
  }
}

interface ImportResolution {
  type: 'file' | 'url' | 'module' | 'resolver' | 'input';
  resolvedPath: string;
  expectedHash?: string;
  resolverName?: string;
  sectionName?: string;
}
```

**Key Methods**:
- `resolveImportPath()` - Main path resolution logic
- `detectImportType()` - Classify based on path structure (@prefix, URL, file)
- `interpolatePathNodes()` - Handle variable interpolation in paths
- `extractHashFromPath()` - Parse hash information from module references
- `handleSpecialImports()` - Route @INPUT, @stdin, resolver imports

**Complex Areas**:
- **Liberal import syntax**: Quoted vs unquoted module references with fallback
- **Variable vs module detection**: Smart fallback when @prefix variables don't exist
- **Section extraction syntax**: Markdown section parsing from path

#### 3. ModuleContentProcessor.ts (Content Parsing & Evaluation)
**Responsibility**: Content reading, parsing, and AST evaluation

```typescript
export class ModuleContentProcessor {
  constructor(
    private env: Environment,
    private securityValidator: ImportSecurityValidator
  ) {}

  async processModuleContent(
    resolution: ImportResolution,
    directive: DirectiveNode
  ): Promise<ModuleProcessingResult> {
    // Read content, parse AST, evaluate in child environment
  }
}

interface ModuleProcessingResult {
  moduleObject: Record<string, any>;
  frontmatter: Record<string, any> | null;
  childEnvironment: Environment;
}
```

**Key Methods**:
- `processModuleContent()` - Main processing pipeline
- `readContentFromSource()` - File/URL reading with error handling
- `parseContentByType()` - mlld vs JSON vs text parsing
- `evaluateInChildEnvironment()` - AST evaluation with scoping
- `extractSectionContent()` - Markdown section extraction
- `processJSONContent()` - JSON-specific import handling

**Complex Areas**:
- **Child environment management**: Proper scoping and path resolution
- **Content type detection**: mlld vs JSON vs text format handling
- **Version compatibility**: Frontmatter parsing and mlld version checking
- **Section extraction**: Markdown header-level content filtering

#### 4. VariableImporter.ts (Variable Creation & Merging)
**Responsibility**: Variable creation, type inference, and environment merging

```typescript
export class VariableImporter {
  constructor(private objectResolver: ObjectReferenceResolver) {}

  async importVariables(
    processingResult: ModuleProcessingResult,
    directive: DirectiveNode,
    targetEnv: Environment
  ): Promise<void> {
    // Create variables and merge into target environment
  }
}
```

**Key Methods**:
- `importVariables()` - Main variable import coordination
- `processModuleExports()` - Convert child environment to module exports
- `createVariableFromValue()` - Type inference and Variable creation
- `createNamespaceVariable()` - Namespace import handling
- `handleImportType()` - Selected vs namespace vs wildcard import processing
- `mergeVariablesIntoEnvironment()` - Environment variable setting

**Complex Areas**:
- **Type inference**: Automatic type detection from imported values
- **Executable reconstruction**: Rebuilding ExecutableVariable from metadata
- **Variable aliasing**: Import name vs target name mapping
- **Namespace creation**: Object variable creation for namespace imports

#### 5. ImportSecurityValidator.ts (Security & Validation)
**Responsibility**: All security checks and validation mechanisms

```typescript
export class ImportSecurityValidator {
  constructor(private env: Environment) {}

  async validateImportSecurity(
    resolution: ImportResolution,
    content?: string
  ): Promise<SecurityValidation> {
    // Perform all security checks
  }
}

interface SecurityValidation {
  approved: boolean;
  hashValid: boolean;
  versionCompatible: boolean;
  circularImportDetected: boolean;
  errors: string[];
}
```

**Key Methods**:
- `validateImportSecurity()` - Main validation pipeline
- `checkCircularImports()` - Import stack validation
- `validateContentHash()` - Full and short hash verification
- `checkVersionCompatibility()` - mlld version requirement checking
- `requestImportApproval()` - URL import approval workflow
- `validateModuleIntegrity()` - Combined security validation

**Complex Areas**:
- **Hash validation**: Support for both full SHA-256 and short hash formats
- **Circular import detection**: Environment-based import stack tracking
- **Import approval**: Interactive user approval for URL imports
- **Version compatibility**: Semantic version checking with frontmatter

#### 6. ObjectReferenceResolver.ts (Object Reference Resolution)
**Responsibility**: Complex object variable reference resolution

```typescript
export class ObjectReferenceResolver {
  resolveObjectReferences(
    value: any,
    variableMap: Map<string, Variable>
  ): any {
    // Recursively resolve variable references in nested objects
  }
}
```

**Key Methods**:
- `resolveObjectReferences()` - Main recursive resolution
- `resolveVariableReference()` - Single variable reference handling
- `resolveExecutableReference()` - Executable variable special handling
- `resolveAST NodeReference()` - AST node resolution
- `resolveNestedStructures()` - Array and object traversal

**Complex Areas**:
- **AST node handling**: VariableReference AST node resolution
- **Executable serialization**: Special __executable format handling
- **Recursive resolution**: Deep object and array traversal
- **Variable reference detection**: String vs AST node variable references

## Implementation Strategy

### Phase 1: Extract Security & Validation (Low Risk)
**Target**: ImportSecurityValidator.ts  
**Timeline**: 1 day

1. Extract all security-related functions into ImportSecurityValidator
2. Create unified security validation interface
3. Update import.ts to use new validator
4. Comprehensive testing of security mechanisms

**Benefits**:
- Isolated security logic for better audit and testing
- Clear security validation interface
- Easier to add new security features

### Phase 2: Extract Object Reference Resolution (Low Risk)
**Target**: ObjectReferenceResolver.ts  
**Timeline**: 0.5 days

1. Extract `resolveObjectReferences` and related functions
2. Create standalone resolver with clear interface
3. Update variable importer to use new resolver
4. Test complex object resolution scenarios

**Benefits**:
- Isolated complex AST resolution logic
- Better testability of object reference handling
- Clearer separation of concerns

### Phase 3: Extract Variable Creation & Import Logic (Medium Risk)
**Target**: VariableImporter.ts  
**Timeline**: 1.5 days

1. Extract variable creation and type inference logic
2. Move module export processing to VariableImporter
3. Create clear interfaces for variable creation
4. Update Environment integration

**Benefits**:
- Centralized variable creation logic
- Better type inference testing
- Clear variable import workflow

### Phase 4: Extract Content Processing (Medium Risk)
**Target**: ModuleContentProcessor.ts  
**Timeline**: 1.5 days

1. Extract content reading, parsing, and evaluation logic
2. Separate mlld vs JSON vs text processing paths
3. Move child environment management to processor
4. Isolate section extraction logic

**Benefits**:
- Clear content processing pipeline
- Better error isolation for content issues
- Easier to add new content format support

### Phase 5: Extract Path Resolution (Medium-High Risk)
**Target**: ImportPathResolver.ts  
**Timeline**: 2 days

1. Extract complex path interpolation and resolution logic
2. Move import type detection to resolver
3. Handle liberal import syntax edge cases
4. Integrate with resolver system routing

**Benefits**:
- Isolated path resolution complexity
- Better testing of import routing logic
- Clearer resolver system integration

### Phase 6: Create Main Coordinator (Low Risk)
**Target**: ImportDirectiveEvaluator.ts  
**Timeline**: 1 day

1. Create main coordinator that orchestrates all components
2. Implement dependency injection pattern
3. Move error handling to coordinator
4. Update main import entry point

**Benefits**:
- Clear separation of coordination vs implementation
- Better error handling and context
- Easier to add new import types

## Critical Implementation Details

### 1. **Interface Design Principles**

**Clear Separation of Concerns**:
```typescript
// Each module has a single, focused responsibility
interface ImportPathResolver {
  resolveImportPath(directive: DirectiveNode): Promise<ImportResolution>;
}

interface ModuleContentProcessor {
  processModuleContent(resolution: ImportResolution): Promise<ModuleProcessingResult>;
}

interface VariableImporter {
  importVariables(result: ModuleProcessingResult, directive: DirectiveNode, env: Environment): Promise<void>;
}
```

**Dependency Injection**:
```typescript
// Clear dependency relationships
export class ImportDirectiveEvaluator {
  constructor(
    private pathResolver: ImportPathResolver,
    private contentProcessor: ModuleContentProcessor,
    private variableImporter: VariableImporter,
    private securityValidator: ImportSecurityValidator
  ) {}
}
```

### 2. **Error Handling Strategy**

**Contextual Error Enhancement**:
```typescript
// Preserve import context in all errors
class ImportError extends Error {
  constructor(
    public importPath: string,
    public phase: 'resolution' | 'content' | 'security' | 'variables',
    message: string,
    public originalError?: Error
  ) {
    super(`Import '${importPath}' failed during ${phase}: ${message}`);
  }
}
```

**Error Attribution**:
- Each module wraps its errors with component context
- Original error chains preserved for debugging
- Import path and directive location always included

### 3. **Testing Strategy**

**Unit Testing by Component**:
```typescript
// Each module can be tested independently
describe('ImportPathResolver', () => {
  it('resolves module references correctly', () => {
    // Test path resolution logic in isolation
  });
  
  it('handles liberal import syntax', () => {
    // Test quoted vs unquoted module references
  });
});

describe('ImportSecurityValidator', () => {
  it('validates content hashes correctly', () => {
    // Test hash validation logic
  });
  
  it('detects circular imports', () => {
    // Test circular import detection
  });
});
```

**Integration Testing**:
- Full import workflow tests
- Cross-component interaction validation
- Environment integration testing

### 4. **Preserving Complex Logic**

**Critical Areas to Preserve Exactly**:

1. **Liberal Import Syntax Logic** (Lines 744-792):
   ```typescript
   // Complex fallback logic for quoted module references
   // Must preserve exact variable resolution fallback behavior
   ```

2. **Object Reference Resolution** (Lines 31-140):
   ```typescript
   // Recursive AST node resolution with executable handling
   // Must preserve exact AST traversal and variable substitution
   ```

3. **Hash Validation Logic** (Lines 400-428):
   ```typescript
   // Full vs short hash comparison with secure comparison
   // Must preserve exact security validation behavior
   ```

4. **Version Compatibility Checking** (Lines 541-574):
   ```typescript
   // Frontmatter parsing and semantic version checking
   // Must preserve exact compatibility determination
   ```

### 5. **Environment Integration**

**Maintain Environment API Compatibility**:
```typescript
// Current Environment methods must continue to work
env.isImporting(path: string): boolean
env.beginImport(path: string): void
env.endImport(path: string): void
env.setVariable(name: string, variable: Variable): void
env.getVariable(name: string): Variable | undefined
env.resolveModule(ref: string, context: string): Promise<ResolverContent>
```

**Child Environment Management**:
- Preserve exact child environment creation logic
- Maintain proper base path handling for relative imports
- Keep current file path tracking for error reporting

## Risk Mitigation

### High-Risk Areas

1. **Variable Type System Integration**
   - **Risk**: Breaking variable creation or type inference
   - **Mitigation**: Extensive unit tests for `createVariableFromValue`
   - **Validation**: Test all variable type combinations

2. **Resolver System Integration**
   - **Risk**: Breaking module resolution or resolver routing
   - **Mitigation**: Mock resolver interfaces in tests
   - **Validation**: Test all resolver types (@TIME, @DEBUG, @user/module)

3. **Object Reference Resolution**
   - **Risk**: Breaking complex AST node resolution
   - **Mitigation**: Preserve exact logic in ObjectReferenceResolver
   - **Validation**: Test executable exports and nested objects

4. **Liberal Import Syntax**
   - **Risk**: Breaking fallback logic for quoted imports
   - **Mitigation**: Comprehensive testing of edge cases
   - **Validation**: Test variable fallback scenarios

### Low-Risk Areas

1. **Security Validation**: Well-isolated functions
2. **Error Handling**: Additive improvements  
3. **Coordinator Logic**: New code with clear interfaces

## Success Metrics

### Quantitative Goals
- **Line count reduction**: 1,222 → ~1,250 lines across 6 focused modules
- **Method count reduction**: Eliminate 15+ private helper functions
- **Test coverage**: Maintain 99%+ import test coverage
- **Performance**: No regression in import performance

### Qualitative Goals
- **Single responsibility**: Each module has one clear purpose
- **Better error attribution**: Errors clearly identify failing component
- **Improved testability**: Components can be tested independently
- **Enhanced maintainability**: Easier to modify specific import aspects

## Expected Benefits

### Development Experience
- **Easier debugging**: Failures isolated to specific components
- **Better testing**: Unit tests for individual import phases
- **Clearer code navigation**: Find import-related logic quickly
- **Safer modifications**: Changes isolated to specific responsibilities

### System Architecture
- **Better separation of concerns**: Clear module boundaries
- **Improved error handling**: Better error context and attribution
- **Enhanced extensibility**: Easy to add new import types or features
- **Cleaner interfaces**: Clear contracts between components

### Long-term Maintainability
- **Reduced complexity**: Smaller, focused modules
- **Better documentation**: Self-documenting through organization
- **Easier onboarding**: Clear import system architecture
- **Future-proof design**: Easy to extend for new import requirements

## Conclusion

The import resolution system refactoring represents a high-value architectural improvement that addresses one of mlld's most complex and critical components. By carefully extracting the monolithic import.ts into focused modules while preserving the sophisticated import semantics, security mechanisms, and resolver integration, this refactoring will significantly improve the maintainability and extensibility of mlld's import system.

The phased approach ensures manageable risk while delivering incremental value, and the focus on preserving complex logic ensures that the sophisticated import behavior that users depend on remains intact.

<function_calls>
<invoke name="TodoWrite">
<parameter name="todos">[{"id": "1", "content": "Read and analyze import.ts file structure and responsibilities", "status": "completed", "priority": "high"}, {"id": "2", "content": "Examine import resolution flow and resolver integration", "status": "completed", "priority": "high"}, {"id": "3", "content": "Identify variable creation and merging complexity", "status": "completed", "priority": "high"}, {"id": "4", "content": "Map object reference resolution patterns", "status": "completed", "priority": "medium"}, {"id": "5", "content": "Document security validation and error handling", "status": "completed", "priority": "medium"}, {"id": "6", "content": "Create comprehensive refactoring guide with implementation details", "status": "completed", "priority": "high"}]