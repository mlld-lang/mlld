# Centralized Serializer/Deserializer Specification

## ⚠️ MAJOR REFINEMENT NEEDED

### Critical Issues:
1. **Overly Ambitious Scope** - Trying to handle all types in one system
2. **Performance Concerns** - Deep object inspection could be slow
3. **Type Safety Complexity** - Generic type preservation is extremely difficult
4. **Unclear Value Proposition** - Current ad-hoc serialization mostly works

### Fundamental Questions to Address:
1. What specific problems does this solve that JSON.stringify doesn't?
2. Which types ACTUALLY need custom serialization?
3. Is the complexity worth the benefit?

### Recommended Approach:
1. **Start with LoadContentResult Only** - This has clear value
2. **Use Type Guards Instead** - Simple type checking might be sufficient
3. **Consider JSON Revivers** - Might be simpler than custom serialization
4. **Measure First** - Profile to see if this is actually a problem

### Alternative Design:
Consider a much simpler type-specific approach:
```typescript
// Just handle the specific cases that matter
export const TypeHandlers = {
  serializeLoadContent(result: LoadContentResult): string { ... },
  deserializeLoadContent(data: any): LoadContentResult { ... }
}
```

---

## Overview

This document proposes a centralized serialization/deserialization system for mlld to handle the conversion of complex runtime objects (Variables, Executables, Shadow Environments) to/from JSON-serializable formats for import/export operations.

## Problem Statement

Currently, serialization logic is scattered across multiple files:
- `VariableImporter.ts` has `serializeShadowEnvs()` and `deserializeShadowEnvs()`
- `run.ts` duplicates deserialization logic for executables
- `ModuleContentProcessor.ts` handles module export serialization
- Various places manually reconstruct Variables from serialized forms

This fragmentation leads to:
1. **Inconsistency**: Different parts of the codebase may serialize/deserialize differently
2. **Bugs**: The rc22 regression occurred because deserialization logic wasn't updated everywhere
3. **Maintenance burden**: Changes must be made in multiple places
4. **Testing difficulties**: Hard to ensure all serialization paths are tested

## Proposed Solution

### Core Architecture

```typescript
// core/serialization/Serializer.ts
export interface Serializer {
  serialize(value: any): SerializedValue;
  deserialize(serialized: SerializedValue): any;
  canSerialize(value: any): boolean;
}

// core/serialization/types.ts
export interface SerializedValue {
  __mlld_type: string;  // Type discriminator
  __mlld_version: string; // Serialization format version
  data: any;             // The actual serialized data
  metadata?: any;        // Optional metadata
}
```

### Implementation Structure

```
core/serialization/
├── index.ts                    # Main exports
├── types.ts                    # Type definitions
├── SerializationManager.ts     # Central manager
├── serializers/
│   ├── VariableSerializer.ts   # Handles all Variable types
│   ├── ExecutableSerializer.ts # Handles ExecutableVariable
│   ├── ShadowEnvSerializer.ts  # Handles shadow environments
│   └── PrimitiveSerializer.ts  # Handles basic types
└── utils/
    ├── version.ts              # Version compatibility
    └── validation.ts           # Validation utilities
```

### SerializationManager

```typescript
export class SerializationManager {
  private serializers: Map<string, Serializer> = new Map();
  
  constructor() {
    // Register built-in serializers
    this.register('variable', new VariableSerializer());
    this.register('executable', new ExecutableSerializer());
    this.register('shadowEnv', new ShadowEnvSerializer());
    this.register('primitive', new PrimitiveSerializer());
  }
  
  serialize(value: any): SerializedValue {
    // Find appropriate serializer
    for (const [type, serializer] of this.serializers) {
      if (serializer.canSerialize(value)) {
        return {
          __mlld_type: type,
          __mlld_version: SERIALIZATION_VERSION,
          data: serializer.serialize(value),
          metadata: this.extractMetadata(value)
        };
      }
    }
    
    // Fallback to JSON
    return {
      __mlld_type: 'json',
      __mlld_version: SERIALIZATION_VERSION,
      data: value
    };
  }
  
  deserialize(serialized: SerializedValue): any {
    this.validateVersion(serialized.__mlld_version);
    
    const serializer = this.serializers.get(serialized.__mlld_type);
    if (!serializer) {
      throw new Error(`Unknown serialization type: ${serialized.__mlld_type}`);
    }
    
    return serializer.deserialize(serialized);
  }
}
```

### Variable Serializer

```typescript
export class VariableSerializer implements Serializer {
  canSerialize(value: any): boolean {
    return isVariable(value);
  }
  
  serialize(variable: Variable): any {
    const base = {
      type: variable.type,
      name: variable.name,
      value: this.serializeValue(variable.value),
      source: variable.source,
      metadata: variable.metadata
    };
    
    // Type-specific serialization
    switch (variable.type) {
      case 'executable':
        return this.serializeExecutable(variable as ExecutableVariable);
      case 'object':
        return this.serializeObject(variable as ObjectVariable);
      // ... other types
      default:
        return base;
    }
  }
  
  private serializeExecutable(execVar: ExecutableVariable): any {
    return {
      __executable: true, // Backward compatibility
      type: execVar.type,
      name: execVar.name,
      value: execVar.value,
      paramNames: execVar.paramNames,
      executableDef: execVar.metadata?.executableDef,
      metadata: {
        ...execVar.metadata,
        // Shadow environments need special handling
        capturedShadowEnvs: execVar.metadata?.capturedShadowEnvs 
          ? this.serializeShadowEnvs(execVar.metadata.capturedShadowEnvs)
          : undefined
      }
    };
  }
  
  deserialize(serialized: any): Variable {
    // Detect type and reconstruct appropriate Variable
    if (serialized.__executable) {
      return this.deserializeExecutable(serialized);
    }
    
    // Handle other variable types...
  }
}
```

### Shadow Environment Serializer

```typescript
export class ShadowEnvSerializer implements Serializer {
  serialize(envs: ShadowEnvironmentCapture): any {
    const result: any = {};
    
    for (const [lang, shadowMap] of Object.entries(envs)) {
      if (shadowMap instanceof Map && shadowMap.size > 0) {
        // Convert Map to object, preserving functions
        const obj: Record<string, any> = {};
        for (const [name, func] of shadowMap) {
          // Functions are preserved by reference
          obj[name] = func;
        }
        result[lang] = {
          __mlld_map: true,
          entries: obj
        };
      }
    }
    
    return result;
  }
  
  deserialize(serialized: any): ShadowEnvironmentCapture {
    const result: ShadowEnvironmentCapture = {};
    
    for (const [lang, data] of Object.entries(serialized)) {
      if (data && typeof data === 'object') {
        if (data.__mlld_map) {
          // Reconstruct Map from serialized format
          const map = new Map<string, any>();
          for (const [name, func] of Object.entries(data.entries)) {
            map.set(name, func);
          }
          result[lang as keyof ShadowEnvironmentCapture] = map;
        } else {
          // Handle legacy format for backward compatibility
          const map = new Map<string, any>(Object.entries(data));
          result[lang as keyof ShadowEnvironmentCapture] = map;
        }
      }
    }
    
    return result;
  }
}
```

## Integration Points

### 1. Module Export (VariableImporter.ts)

```typescript
// Before
moduleObject[name] = {
  __executable: true,
  value: execVar.value,
  // ... manual serialization
};

// After
const serializer = new SerializationManager();
moduleObject[name] = serializer.serialize(execVar);
```

### 2. Module Import (VariableImporter.ts)

```typescript
// Before
if (value?.__executable) {
  // Manual reconstruction
}

// After
const serializer = new SerializationManager();
if (serializer.isSerializedValue(value)) {
  return serializer.deserialize(value);
}
```

### 3. Field Access Resolution (run.ts)

```typescript
// Before - Manual reconstruction with duplicated logic
execVar = {
  type: 'executable',
  // ... manual reconstruction
};

// After
const serializer = new SerializationManager();
execVar = serializer.deserialize(value);
```

## Benefits

1. **Single Source of Truth**: All serialization logic in one place
2. **Type Safety**: Strong typing for serialized formats
3. **Version Management**: Built-in versioning for format evolution
4. **Extensibility**: Easy to add new serializers
5. **Testing**: Centralized logic is easier to test
6. **Backward Compatibility**: Can handle legacy formats
7. **Performance**: Can add caching if needed

## Migration Strategy

### Phase 1: Implement Core System
1. Create serialization module structure
2. Implement SerializationManager
3. Implement serializers for current types
4. Add comprehensive tests

### Phase 2: Gradual Migration
1. Update VariableImporter to use new system
2. Update run.ts field access to use deserializer
3. Update other serialization points
4. Maintain backward compatibility during transition

### Phase 3: Cleanup
1. Remove old serialization code
2. Update documentation
3. Consider performance optimizations

## Backward Compatibility

The system will maintain backward compatibility by:
1. Recognizing old serialization formats (e.g., `__executable: true`)
2. Converting old formats to new during deserialization
3. Optionally providing a migration tool for stored data

## Future Enhancements

1. **Compression**: Add optional compression for large objects
2. **Circular Reference Handling**: Support for circular references
3. **Custom Serializers**: Allow plugins to register custom serializers
4. **Streaming**: Support for streaming large objects
5. **Binary Formats**: Support for more efficient binary serialization

## Example Usage

```typescript
// In module export
const serializer = new SerializationManager();
const exports: Record<string, any> = {};

for (const [name, variable] of moduleVariables) {
  exports[name] = serializer.serialize(variable);
}

// In module import
const imported = moduleExports[varName];
const variable = serializer.isSerializedValue(imported)
  ? serializer.deserialize(imported)
  : createVariableFromValue(varName, imported);

// In field access
if (serializer.isSerializedValue(fieldValue)) {
  return serializer.deserialize(fieldValue);
}
```

## Testing Strategy

1. **Unit Tests**: Test each serializer independently
2. **Integration Tests**: Test complete serialize/deserialize cycles
3. **Compatibility Tests**: Ensure old formats still work
4. **Performance Tests**: Ensure no significant performance regression
5. **Edge Cases**: Test with complex nested structures, circular refs, etc.

## Security Considerations

1. **Type Validation**: Validate types during deserialization
2. **Size Limits**: Prevent DoS through extremely large objects
3. **Function Serialization**: Be careful with function references
4. **Input Sanitization**: Validate all inputs during deserialization

## Conclusion

A centralized serialization system will improve code maintainability, reduce bugs, and provide a solid foundation for future enhancements. The investment in building this system will pay dividends in reduced complexity and improved reliability.