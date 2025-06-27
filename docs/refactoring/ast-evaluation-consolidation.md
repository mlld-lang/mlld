# AST Evaluation Consolidation Refactoring

## Overview

This document outlines the remaining work to consolidate JSON formatting and complete the AST evaluation improvements. This work complements the AST type normalization refactor described in `AST-REFACTOR-CONTEXT.md`.

## Related Issues

- **#279**: Consolidate duplicate JSON replacer logic
- **#282**: Create centralized JSON formatting module

## Current State

We've partially addressed the AST evaluation issues:
- ✅ Created `createASTAwareJSONReplacer()` function in `interpreter/utils/ast-evaluation.ts`
- ✅ Updated show.ts and interpolate() to use the shared replacer
- ✅ Fixed the immediate string-in-array-objects bug

However, we still need to:
- Create a full `JSONFormatter` class with formatting options
- Consolidate namespace display logic
- Remove remaining duplicate JSON serialization code

## Implementation Plan

### Phase 1: Create Central JSON Formatter

**File**: `interpreter/core/json-formatter.ts`

```typescript
import { createASTAwareJSONReplacer } from '../utils/ast-evaluation';

export interface JSONFormatOptions {
  pretty?: boolean;
  indent?: number;
  handleExecutables?: boolean;
  handleNamespaces?: boolean;
}

export class JSONFormatter {
  /**
   * Single source of truth for JSON serialization in mlld
   */
  static stringify(value: any, options: JSONFormatOptions = {}): string {
    const {
      pretty = false,
      indent = 2,
      handleExecutables = true,
      handleNamespaces = true
    } = options;
    
    // Use our existing shared replacer
    const replacer = createASTAwareJSONReplacer();
    
    return JSON.stringify(value, replacer, pretty ? indent : undefined);
  }
  
  /**
   * Special formatting for namespace objects
   */
  static stringifyNamespace(namespaceObject: any): string {
    // Move implementation from cleanNamespaceForDisplay in interpreter.ts
    const cleaned: any = {};
    
    for (const [key, value] of Object.entries(namespaceObject)) {
      if (key.startsWith('__')) continue; // Skip internal properties
      
      if (value && typeof value === 'object' && value.__executable) {
        const params = value.paramNames || [];
        cleaned[key] = `<function(${params.join(', ')})>`;
      } else {
        cleaned[key] = value;
      }
    }
    
    return this.stringify(cleaned, { pretty: true, handleExecutables: false });
  }
}
```

### Phase 2: Update All JSON Serialization Points

**Locations to update**:

1. **`interpreter/eval/show.ts`**
   - Replace direct `JSON.stringify` calls with `JSONFormatter.stringify()`
   - Use formatting options appropriately

2. **`interpreter/core/interpreter.ts`**
   - Update `interpolate()` to use `JSONFormatter`
   - Move `cleanNamespaceForDisplay()` logic to `JSONFormatter`

3. **Any other locations** using `JSON.stringify` with custom replacers

### Phase 3: Integration Testing

Ensure all JSON output scenarios work correctly:
- Arrays (compact format)
- Objects (pretty format)
- Namespace objects (special formatting)
- Template interpolation (compact format)
- Executable functions (show as `<function()>`)

## Relationship to AST Type Normalization

This work is complementary to the larger AST refactor:

1. **JSONFormatter** handles *output formatting* (how we display values)
2. **ASTEvaluator** (from `AST-REFACTOR-1.md`) handles *input normalization* (making values consistent)

Both are needed for a complete solution:
- ASTEvaluator ensures we have consistent runtime values
- JSONFormatter ensures we display them consistently

## Success Criteria

1. **Single JSON formatting implementation** - No duplicate replacer logic
2. **Consistent output** - Same values format the same way everywhere
3. **Configurable formatting** - Pretty vs compact, namespace handling
4. **Clean separation** - Formatting logic separate from evaluation

## Next Steps

1. Implement JSONFormatter class
2. Update all JSON serialization points
3. Remove duplicate code
4. Coordinate with AST type normalization refactor

## See Also

- `AST-REFACTOR-CONTEXT.md` - Overall AST type normalization plan
- `ast-data-types-current-workarounds.md` - Current inconsistencies
- `ast-data-types-ideal-implementation.md` - Long-term vision