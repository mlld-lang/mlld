# Variable System Refactoring Guide

## Executive Summary

The `core/types/variable.ts` file (909 lines) is a complex monolithic type system that defines mlld's unified variable architecture. This guide provides a comprehensive analysis of its sophisticated discriminated union type system and presents a detailed refactoring strategy to extract it into focused, maintainable modules while preserving the intricate variable semantics and migration capabilities during the ongoing transition from legacy variable types.

## Current Analysis

### File Structure Overview

**Size**: 909 lines  
**Primary Function**: Unified variable type system with discriminated unions  
**Key Dependencies**: AST types, source location, variable metadata, legacy compatibility

### Core Responsibilities Identified

1. **Variable Type Definitions** (Lines 14-296)
   - BaseVariable interface with common fields
   - 15 specialized variable types with discriminated unions
   - VariableSource metadata tracking creation context
   - Complex nested interfaces for each variable type

2. **Type Discriminator System** (Lines 48-69)
   - 15 unique discriminator values for type narrowing
   - Enables TypeScript's discriminated union type system
   - Critical for runtime type checking and evaluation routing

3. **Type Guard Functions** (Lines 298-431)
   - 15 individual type guards for each variable type
   - 3 composite type guards for related variable groups
   - Runtime type validation and TypeScript type narrowing
   - Essential for interpreter evaluation logic

4. **Factory Functions** (Lines 434-779)
   - 15 creation functions for each variable type
   - Consistent creation patterns with metadata handling
   - Timestamp management and source tracking
   - Parameter validation and default values

5. **Legacy Compatibility System** (Lines 781-910)
   - Conversion between new and legacy variable systems
   - Type mapping logic for backward compatibility
   - Value extraction for legacy API compliance
   - Migration helpers during transition period

6. **Specialized Type Detection** (Lines 877-910)
   - Advanced executable variable recognition
   - Effective type resolution for imported variables
   - Legacy type detection for compatibility
   - Complex inheritance patterns

## Critical Complexities and Dependencies

### 1. **Sophisticated Discriminated Union Architecture**
Complex type system with 15 variable types and precise type narrowing:
- **Type Discriminators**: Unique string literals for each variable type
- **TypeScript Integration**: Deep integration with TypeScript's type system
- **Runtime Safety**: Type guards provide both compile-time and runtime safety
- **Evaluation Routing**: Variable types determine evaluation behavior

### 2. **Multi-Layered Variable Creation**
Sophisticated factory pattern with consistent metadata handling:
- **Creation Timestamp**: Automatic timestamp generation for all variables
- **Source Tracking**: Detailed metadata about variable creation context
- **Type-Specific Logic**: Each factory handles unique variable type requirements
- **Metadata Propagation**: Consistent metadata handling across all types

### 3. **Complex Legacy Compatibility**
Intricate migration system supporting dual type systems:
- **Bidirectional Conversion**: New to legacy and legacy to new conversions
- **Type Mapping**: Complex mapping between old and new type hierarchies
- **Value Extraction**: Sophisticated value extraction preserving semantics
- **API Compatibility**: Maintains backward compatibility during transition

### 4. **Extensive Type Guard Matrix**
Comprehensive type checking system with multiple layers:
- **Individual Guards**: One guard per variable type for precise checking
- **Composite Guards**: Groups of related types (text-like, structured, external)
- **Advanced Detection**: Sophisticated logic for imported and executable variables
- **Performance Optimization**: Guards designed for efficient runtime checking

### 5. **Variable Metadata Architecture**
Rich metadata system tracking variable lifecycle:
- **Creation Context**: How and when variables were created
- **Source Information**: Directive syntax and interpolation details
- **Import Tracking**: Path and module information for imported variables
- **Pipeline Integration**: Stage and format information for pipeline variables

### 6. **AST Integration Complexity**
Deep integration with mlld's AST system:
- **Node Array Handling**: Template variables can contain AST node arrays
- **Interpolation Points**: Precise tracking of variable interpolation locations
- **Source Location**: Integration with unified source location system
- **Command Templates**: Executable variables contain complex AST structures

## Proposed Refactoring Architecture

### Target Module Structure

```
core/types/variable/
├── VariableTypes.ts               # Type definitions only (~250 lines)
├── VariableFactories.ts           # Creation functions (~300 lines)
├── TypeGuards.ts                  # Type guard functions (~200 lines)
├── LegacyCompatibility.ts         # Legacy conversion system (~150 lines)
├── VariableMetadata.ts           # Metadata types and utilities (~100 lines)
└── AdvancedTypeDetection.ts      # Specialized type detection (~100 lines)
```

### Module Breakdown and Responsibilities

#### 1. VariableTypes.ts (Type Definitions Only)
**Responsibility**: Pure type definitions and interfaces

```typescript
// Base types and discriminators
export interface BaseVariable {
  name: string;
  createdAt: number;
  modifiedAt: number;
  definedAt?: SourceLocation;
  source: VariableSource;
}

export type VariableTypeDiscriminator = 
  | 'simple-text'
  | 'interpolated-text'
  // ... all 15 discriminators

// All 15 variable type interfaces
export interface SimpleTextVariable extends BaseVariable {
  type: 'simple-text';
  value: string;
  metadata?: VariableMetadata;
}

// Main discriminated union
export type Variable = 
  | SimpleTextVariable
  | InterpolatedTextVariable
  // ... all 15 types
```

**Key Characteristics**:
- **Pure Types**: No implementation, only type definitions
- **Discriminated Union**: Complete Variable union type
- **Interface Definitions**: All 15 variable type interfaces
- **Base Types**: Common interfaces and enums

#### 2. VariableFactories.ts (Creation Functions)
**Responsibility**: Variable creation with consistent patterns

```typescript
export class VariableFactory {
  static createSimpleText(
    name: string,
    value: string,
    source: VariableSource,
    metadata?: VariableMetadata
  ): SimpleTextVariable {
    return {
      type: 'simple-text',
      name,
      value,
      source,
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      metadata
    };
  }
  
  // ... 14 other factory methods
}
```

**Key Methods**:
- `createSimpleText()` - Simple text variable creation
- `createInterpolatedText()` - Text with interpolation points
- `createTemplate()` - Template variable with parameters
- `createObject()` - Object variable with complexity tracking
- `createArray()` - Array variable with element validation
- `createExecutable()` - Executable command/code definitions
- `createPipelineInput()` - Pipeline stage input variables
- And 8 more specialized factory methods

**Complex Areas**:
- **Timestamp Management**: Consistent creation and modification timestamps
- **Source Tracking**: Variable source metadata propagation
- **Type-Specific Validation**: Each factory validates its specific requirements
- **Metadata Handling**: Optional metadata propagation and defaults

#### 3. TypeGuards.ts (Type Guard Functions)
**Responsibility**: Runtime type checking and TypeScript type narrowing

```typescript
export class VariableTypeGuards {
  // Individual type guards
  static isSimpleText(variable: Variable): variable is SimpleTextVariable {
    return variable.type === 'simple-text';
  }
  
  // Composite type guards
  static isTextLike(variable: Variable): variable is TextLikeVariable {
    return this.isSimpleText(variable) || 
           this.isInterpolatedText(variable) || 
           this.isTemplate(variable) ||
           // ... other text-like types
  }
  
  // Advanced detection
  static isExecutableVariable(variable: Variable): boolean {
    // Complex logic for executable detection including imports
  }
}

type TextLikeVariable = SimpleTextVariable | InterpolatedTextVariable | TemplateVariable | FileContentVariable | SectionContentVariable | CommandResultVariable;
```

**Key Methods**:
- **Individual Guards**: 15 type-specific guards for precise checking
- **Composite Guards**: `isTextLike()`, `isStructured()`, `isExternal()`
- **Advanced Guards**: `isExecutableVariable()`, `getEffectiveType()`
- **Legacy Detection**: `hasLegacyType()` for compatibility checking

**Complex Areas**:
- **Performance Optimization**: Guards designed for efficient runtime checking
- **Type Inference**: TypeScript type narrowing support
- **Imported Variable Handling**: Complex logic for determining imported variable types
- **Composite Logic**: Multi-type checking with proper union types

#### 4. LegacyCompatibility.ts (Legacy Conversion System)
**Responsibility**: Migration support between old and new variable systems

```typescript
export class LegacyVariableConverter {
  static toLegacyVariable(variable: Variable): LegacyVariable {
    return {
      type: this.mapToLegacyType(variable.type),
      name: variable.name,
      value: this.extractLegacyValue(variable),
      metadata: variable.metadata
    };
  }
  
  static fromLegacyVariable(legacy: LegacyVariable): Variable {
    // Convert legacy variables to new system
  }
  
  private static mapToLegacyType(type: VariableTypeDiscriminator): string {
    // Complex mapping logic for type conversion
  }
}
```

**Key Methods**:
- `toLegacyVariable()` - Convert new variables to legacy format
- `fromLegacyVariable()` - Convert legacy variables to new format
- `mapToLegacyType()` - Type hierarchy mapping
- `extractLegacyValue()` - Value extraction preserving semantics

**Complex Areas**:
- **Type Hierarchy Mapping**: Complex mapping between old and new type systems
- **Value Preservation**: Ensuring semantic equivalence during conversion
- **Metadata Migration**: Transferring metadata between incompatible formats
- **API Compatibility**: Maintaining backward compatibility during transition

#### 5. VariableMetadata.ts (Metadata Types and Utilities)
**Responsibility**: Variable metadata management and utilities

```typescript
export interface VariableSource {
  directive: 'var';
  syntax: 'quoted' | 'template' | 'array' | 'object' | 'command' | 'code' | 'path' | 'reference';
  wrapperType?: 'singleQuote' | 'doubleQuote' | 'backtick' | 'brackets';
  hasInterpolation: boolean;
  isMultiLine: boolean;
}

export interface VariableMetadata extends Record<string, any> {
  isImported?: boolean;
  importPath?: string;
  isComplex?: boolean;
  isPipelineInput?: boolean;
  pipelineStage?: number;
}

export class VariableMetadataUtils {
  static createSource(
    syntax: string,
    hasInterpolation: boolean,
    isMultiLine: boolean
  ): VariableSource {
    // Create consistent variable source metadata
  }
  
  static mergeMetadata(
    base?: VariableMetadata,
    additional?: VariableMetadata
  ): VariableMetadata {
    // Merge metadata objects with proper precedence
  }
}
```

**Key Methods**:
- `createSource()` - Create consistent variable source metadata
- `mergeMetadata()` - Merge metadata with proper precedence
- `validateMetadata()` - Validate metadata consistency
- `extractSourceInfo()` - Extract source information for debugging

#### 6. AdvancedTypeDetection.ts (Specialized Type Detection)
**Responsibility**: Advanced type detection logic for complex scenarios

```typescript
export class AdvancedTypeDetection {
  static getEffectiveType(variable: Variable): VariableTypeDiscriminator {
    if (VariableTypeGuards.isImported(variable)) {
      return (variable as ImportedVariable).originalType;
    }
    return variable.type;
  }
  
  static isExecutableVariable(variable: Variable): boolean {
    if (VariableTypeGuards.isExecutable(variable)) return true;
    if (VariableTypeGuards.isImported(variable)) {
      const imported = variable as ImportedVariable;
      return imported.originalType === 'executable' || 
             imported.metadata?.originalType === 'executable';
    }
    return false;
  }
  
  static detectComplexVariable(variable: Variable): boolean {
    // Complex logic for determining if variable contains nested directives
  }
}
```

**Key Methods**:
- `getEffectiveType()` - Resolve actual type including imported variables
- `isExecutableVariable()` - Advanced executable detection with import support
- `detectComplexVariable()` - Detect variables with nested directive complexity
- `resolveImportChain()` - Follow import chains to original types

## Implementation Strategy

### Phase 1: Extract Type Definitions (Low Risk)
**Target**: VariableTypes.ts  
**Timeline**: 0.5 days

1. Extract all interface definitions and type aliases
2. Move discriminated union definition
3. Create clean type-only module
4. Update imports throughout codebase

**Benefits**:
- Clear separation of types from implementation
- Better IDE support and IntelliSense
- Easier to maintain type definitions
- Reduced compilation dependencies

### Phase 2: Extract Factory Functions (Low Risk)
**Target**: VariableFactories.ts  
**Timeline**: 1 day

1. Extract all 15 factory functions into class
2. Maintain consistent creation patterns
3. Preserve timestamp and metadata logic
4. Test variable creation scenarios

**Benefits**:
- Centralized variable creation logic
- Consistent factory patterns
- Better testing of creation logic
- Clear separation of concerns

### Phase 3: Extract Type Guards (Medium Risk)
**Target**: TypeGuards.ts  
**Timeline**: 1 day

1. Extract all individual and composite type guards
2. Maintain TypeScript type narrowing behavior
3. Preserve performance characteristics
4. Test all guard combinations

**Benefits**:
- Isolated type checking logic
- Better testing of type guards
- Clear type checking API
- Improved performance monitoring

### Phase 4: Extract Metadata System (Low Risk)
**Target**: VariableMetadata.ts  
**Timeline**: 0.5 days

1. Extract metadata interfaces and utilities
2. Create metadata manipulation functions
3. Move source tracking logic
4. Test metadata operations

**Benefits**:
- Clean metadata management
- Better metadata consistency
- Easier metadata validation
- Clear metadata API

### Phase 5: Extract Advanced Detection (Medium Risk)
**Target**: AdvancedTypeDetection.ts  
**Timeline**: 1 day

1. Extract complex type detection logic
2. Move imported variable type resolution
3. Preserve executable detection behavior
4. Test advanced scenarios

**Benefits**:
- Isolated complex detection logic
- Better testing of edge cases
- Clear advanced API
- Easier to extend detection

### Phase 6: Extract Legacy Compatibility (Medium-High Risk)
**Target**: LegacyCompatibility.ts  
**Timeline**: 1.5 days

1. Extract legacy conversion functions
2. Move type mapping logic
3. Preserve conversion semantics
4. Test bidirectional conversion

**Benefits**:
- Isolated migration logic
- Clear legacy support
- Better conversion testing
- Easier to remove when migration complete

## Critical Implementation Details

### 1. **Interface Design Principles**

**Pure Type Separation**:
```typescript
// Types only - no implementation
export interface SimpleTextVariable extends BaseVariable {
  type: 'simple-text';
  value: string;
  metadata?: VariableMetadata;
}

// Implementation separated
export class VariableFactory {
  static createSimpleText(...): SimpleTextVariable { ... }
}
```

**Clear Module Boundaries**:
```typescript
// Each module has focused responsibility
export class VariableTypeGuards {
  static isSimpleText(variable: Variable): variable is SimpleTextVariable;
}

export class VariableFactory {
  static createSimpleText(...): SimpleTextVariable;
}
```

### 2. **Preserving Complex Logic**

**Critical Areas to Preserve Exactly**:

1. **Discriminated Union Logic**:
   ```typescript
   // Must preserve exact discriminated union structure
   export type Variable = 
     | SimpleTextVariable
     | InterpolatedTextVariable
     | TemplateVariable
     // ... all 15 types with exact discriminators
   ```

2. **Type Guard Precision**:
   ```typescript
   // Must preserve exact type narrowing behavior
   export function isSimpleText(variable: Variable): variable is SimpleTextVariable {
     return variable.type === 'simple-text';
   }
   ```

3. **Factory Consistency**:
   ```typescript
   // Must preserve exact creation patterns and timestamp logic
   return {
     type: 'simple-text',
     name,
     value,
     source,
     createdAt: Date.now(),
     modifiedAt: Date.now(),
     metadata
   };
   ```

4. **Legacy Conversion Logic**:
   ```typescript
   // Must preserve exact conversion semantics
   function mapToLegacyType(type: VariableTypeDiscriminator): string {
     switch (type) {
       case 'simple-text':
       case 'interpolated-text':
         return 'text';
       // ... exact mapping preservation
     }
   }
   ```

### 3. **TypeScript Integration**

**Maintain Type Safety**:
```typescript
// Preserve discriminated union type narrowing
function processVariable(variable: Variable) {
  if (VariableTypeGuards.isSimpleText(variable)) {
    // TypeScript knows variable is SimpleTextVariable here
    console.log(variable.value); // string - no type assertion needed
  }
}
```

**Export Strategy**:
```typescript
// Main index.ts re-exports for backward compatibility
export * from './variable/VariableTypes';
export * from './variable/VariableFactories';
export * from './variable/TypeGuards';
export { Variable } from './variable/VariableTypes';
```

### 4. **Performance Considerations**

**Type Guard Efficiency**:
- Preserve simple string comparison type guards
- Maintain lazy evaluation in composite guards
- Keep guard functions inline-friendly for optimization

**Factory Performance**:
- Preserve efficient object creation patterns
- Maintain minimal timestamp computation overhead
- Keep factory functions lightweight

### 5. **Testing Strategy**

**Unit Testing by Component**:
```typescript
describe('VariableFactory', () => {
  it('creates simple text variables correctly', () => {
    const variable = VariableFactory.createSimpleText('test', 'value', source);
    expect(variable.type).toBe('simple-text');
    expect(variable.value).toBe('value');
  });
});

describe('VariableTypeGuards', () => {
  it('correctly identifies simple text variables', () => {
    const variable = VariableFactory.createSimpleText('test', 'value', source);
    expect(VariableTypeGuards.isSimpleText(variable)).toBe(true);
    expect(VariableTypeGuards.isTemplate(variable)).toBe(false);
  });
});
```

**Integration Testing**:
- Test complete variable lifecycle
- Test legacy conversion round-trips
- Test type guard combinations

## Risk Mitigation

### High-Risk Areas

1. **Discriminated Union Structure**
   - **Risk**: Breaking TypeScript type narrowing
   - **Mitigation**: Preserve exact type discriminator strings
   - **Validation**: Test all type guard combinations

2. **Legacy Conversion Logic**
   - **Risk**: Breaking backward compatibility during migration
   - **Mitigation**: Preserve exact conversion semantics
   - **Validation**: Test round-trip conversions

3. **Type Guard Behavior**
   - **Risk**: Breaking runtime type checking in interpreter
   - **Mitigation**: Preserve exact guard logic and performance
   - **Validation**: Test all variable types and edge cases

4. **Factory Function Consistency**
   - **Risk**: Breaking variable creation patterns
   - **Mitigation**: Preserve exact creation logic and timestamps
   - **Validation**: Test all factory functions with various inputs

### Medium-Risk Areas

1. **Metadata Management**: Well-defined interfaces
2. **Advanced Type Detection**: Complex but isolated logic
3. **Module Dependencies**: Clear import/export patterns

### Low-Risk Areas

1. **Type Definitions**: Pure interfaces with no implementation
2. **Utility Functions**: Simple helper functions
3. **Export Organization**: Structural improvements

## Success Metrics

### Quantitative Goals
- **Line count reduction**: 909 → ~1,100 lines across 6 focused modules
- **Import reduction**: Eliminate internal cross-dependencies
- **Test coverage**: Maintain 99%+ variable system test coverage
- **Performance**: No regression in variable creation or type checking

### Qualitative Goals
- **Single responsibility**: Each module handles one variable concern
- **Better type safety**: Improved TypeScript integration and inference
- **Improved testability**: Components can be tested independently
- **Enhanced maintainability**: Easier to modify specific variable aspects

## Expected Benefits

### Development Experience
- **Easier debugging**: Failures isolated to specific variable components
- **Better testing**: Unit tests for individual variable operations
- **Clearer code navigation**: Find variable logic quickly
- **Safer modifications**: Changes isolated to specific responsibilities

### System Architecture
- **Better separation of concerns**: Clear module boundaries
- **Improved type safety**: Enhanced TypeScript integration
- **Enhanced extensibility**: Easy to add new variable types
- **Cleaner interfaces**: Clear contracts between components

### Long-term Maintainability
- **Reduced complexity**: Smaller, focused modules
- **Better documentation**: Self-documenting through organization
- **Easier onboarding**: Clear variable system architecture
- **Future-proof design**: Easy to extend for new variable requirements

## Conclusion

The variable system refactoring represents a strategic architectural improvement that addresses one of mlld's most foundational components. By carefully extracting the monolithic variable.ts into focused modules while preserving the sophisticated discriminated union type system, legacy compatibility, and TypeScript integration, this refactoring will significantly improve the maintainability and extensibility of mlld's core type system.

The phased approach ensures manageable risk while delivering incremental value, and the focus on preserving complex logic ensures that the sophisticated variable behavior that the entire interpreter depends on remains intact. This refactoring sets the foundation for easier variable system evolution as mlld continues to mature.